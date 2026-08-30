/**
 * Model-assisted knowledge maintenance. This runs *after* the Tier 0 audit
 * (knowledge-drift.ts) and only over the entries it flagged.
 *
 * Two rules shape everything here:
 *
 *  1. The model proposes; a human commits. Nothing in this file writes to
 *     chat-content/knowledge.json. Both commands emit a proposal for review,
 *     because the assistant's whole value is that its facts were checked by
 *     the person they are about.
 *  2. Model output is untrusted until it passes `validateProposedEntry`. In
 *     particular a fabricated `source.href` would become a broken citation on
 *     a public page, so hrefs are re-checked against the same allowlist the
 *     Worker enforces at runtime.
 */

import { isAllowlistedSourceHref } from '../src/knowledge.ts';
import type { KnowledgeEntry } from '../src/types.ts';

export const AGENT_MAX_OUTPUT_TOKENS = 1200;

export interface LunaClientOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}

export interface LunaClient {
  complete(instructions: string, input: string): Promise<string>;
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';

/**
 * Extracts assistant text from a Responses payload. The convenience field is
 * preferred; the walk over `output` is the documented long form and keeps this
 * working if a response arrives without the flattened field.
 */
export function extractOutputText(payload: unknown): string {
  const body = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };

  if (typeof body?.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of body?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (typeof part?.text === 'string' && (part.type ?? 'output_text').includes('text')) {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('').trim();
}

export function createLunaClient(options: LunaClientOptions): LunaClient {
  const {
    apiKey,
    model,
    fetchImpl = fetch,
    endpoint = DEFAULT_ENDPOINT,
    timeoutMs = 60_000,
  } = options;

  return {
    async complete(instructions, input) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          // Deliberately the same request shape the Worker already uses in
          // production, minus streaming — a shape known to be accepted.
          body: JSON.stringify({
            model,
            instructions,
            input,
            stream: false,
            reasoning: { effort: 'low' },
            text: { verbosity: 'low' },
            max_output_tokens: AGENT_MAX_OUTPUT_TOKENS,
            store: false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Luna request failed: ${response.status} ${detail.slice(0, 400)}`);
        }

        const text = extractOutputText(await response.json());
        if (!text) throw new Error('Luna returned an empty response');
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Models like to wrap JSON in prose or a fenced block even when told not to.
 * Recovering the object is safe because the result is schema-validated before
 * anything downstream trusts it.
 */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error(`Could not parse JSON from model output: ${text.slice(0, 200)}`);
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

// ── Review ──────────────────────────────────────────────────────────────────

export type ReviewVerdict = 'supported' | 'contradicted' | 'incomplete';

export interface ReviewResult {
  entryId: string;
  verdict: ReviewVerdict;
  /** Specific claims in the entry the source no longer supports. */
  issues: string[];
  /** Facts present in the source that the entry omits. */
  missing: string[];
  /** Ways the source page contradicts itself. About the page, not the entry. */
  sourceIssues: string[];
  suggestedContent: string | null;
}

const REVIEW_INSTRUCTIONS = `You audit a portfolio assistant's knowledge base against the page it was derived from.

You are given one knowledge entry and the current text of its source file. Decide whether every factual claim in the entry is still supported by that source.

Judge only what the source states. Do not use outside knowledge, do not speculate about intent, and do not reward or penalise writing style.

Choose the verdict carefully:
- "contradicted" — the source states something logically incompatible with an entry claim, so the entry is now wrong. A source that is merely more specific than the entry is NOT a contradiction: if the entry names a general category and the source names a particular member of it, that is "incomplete".
- "incomplete" — every entry claim still holds, but the entry omits a notable fact the source states, or is vaguer than the source on a point that matters.
- "supported" — every entry claim holds and nothing notable is missing.

Reply with a single JSON object and nothing else:
{
  "verdict": "supported" | "contradicted" | "incomplete",
  "issues": [ "each entry claim the source no longer supports, quoted" ],
  "missing": [ "each notable fact in the source the entry omits" ],
  "sourceIssues": [ "each place the source page contradicts itself or is internally inconsistent" ],
  "suggestedContent": "a corrected replacement for the entry's content field, or null if no change is needed"
}

"sourceIssues" is about the page, not the entry, and does not affect the verdict. Report it when the same page states a fact two incompatible ways — for example when frontmatter or a bullet list names one thing and the prose names another. Where they disagree, write the entry from what the prose asserts, since that is where the reasoning is stated, and name the discrepancy so a human can fix the page.

Rules for suggestedContent: keep the entry's concise third-person voice, assert only what the source states, invent no numbers, URLs, employers, or dates, and stay under 900 characters.`;

export function buildReviewInput(entry: KnowledgeEntry, sourceText: string): string {
  return [
    `Entry id: ${entry.id}`,
    `Entry last reviewed: ${entry.lastReviewed}`,
    `Source file: ${entry.source.path}`,
    '',
    'Entry content (the claims to audit):',
    entry.content,
    '',
    `Current source text of ${entry.source.path}:`,
    sourceText,
  ].join('\n');
}

export function validateReview(entryId: string, value: unknown): ReviewResult {
  const raw = value as Partial<Record<keyof ReviewResult, unknown>>;
  const verdict = raw?.verdict;
  if (verdict !== 'supported' && verdict !== 'contradicted' && verdict !== 'incomplete') {
    throw new Error(`Review for ${entryId} has an invalid verdict: ${JSON.stringify(verdict)}`);
  }

  const stringList = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];

  const suggested = raw?.suggestedContent;
  return {
    entryId,
    verdict,
    issues: stringList(raw?.issues),
    missing: stringList(raw?.missing),
    sourceIssues: stringList(raw?.sourceIssues),
    suggestedContent: typeof suggested === 'string' && suggested.trim() ? suggested.trim() : null,
  };
}

export async function reviewEntry(
  client: LunaClient,
  entry: KnowledgeEntry,
  sourceText: string,
): Promise<ReviewResult> {
  const text = await client.complete(REVIEW_INSTRUCTIONS, buildReviewInput(entry, sourceText));
  return validateReview(entry.id, parseJsonObject(text));
}

// ── Generate ────────────────────────────────────────────────────────────────

const GENERATE_INSTRUCTIONS = `You draft an entry for a portfolio assistant's knowledge base from a case study page.

The assistant may state only what this knowledge base contains, so the entry must be strictly faithful to the case study. Assert nothing the page does not state. Never invent metrics, dates, employers, URLs, or technologies.

Reply with a single JSON object and nothing else:
{
  "id": "kebab-case identifier, usually the source filename without its extension",
  "title": "the case study's human title",
  "topics": [ "2-5 broad lowercase tags describing what this is about; do not include the entry's category, which is added for you" ],
  "keywords": [ "8-16 terms a visitor might type, including proper tool names as written" ],
  "content": "a concise third-person factual summary under 900 characters"
}

The content field should read as neutral fact, not marketing: what the system is, what it is built from, what boundaries or trade-offs it makes, and what state it is in. Prefer the page's own terminology.`;

export interface ProposedEntry {
  id: string;
  title: string;
  topics: string[];
  keywords: string[];
  content: string;
}

export function buildGenerateInput(sourcePath: string, sourceText: string): string {
  return [`Source file: ${sourcePath}`, '', 'Case study text:', sourceText].join('\n');
}

export function validateProposedEntry(value: unknown): ProposedEntry {
  const raw = value as Partial<Record<keyof ProposedEntry, unknown>>;
  const errors: string[] = [];

  const str = (field: keyof ProposedEntry): string => {
    const candidate = raw?.[field];
    if (typeof candidate !== 'string' || !candidate.trim()) {
      errors.push(`\`${field}\` must be a non-empty string`);
      return '';
    }
    return candidate.trim();
  };

  const list = (field: keyof ProposedEntry, min: number): string[] => {
    const candidate = raw?.[field];
    if (!Array.isArray(candidate)) {
      errors.push(`\`${field}\` must be an array`);
      return [];
    }
    const items = candidate.filter((item): item is string => typeof item === 'string' && !!item.trim());
    if (items.length < min) errors.push(`\`${field}\` needs at least ${min} items, got ${items.length}`);
    return items.map((item) => item.trim());
  };

  const id = str('id');
  const title = str('title');
  const content = str('content');
  const topics = list('topics', 2);
  const keywords = list('keywords', 4);

  if (id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    errors.push(`\`id\` must be kebab-case, got ${JSON.stringify(id)}`);
  }
  if (content.length > 1200) {
    errors.push(`\`content\` is ${content.length} characters, over the 1200 limit`);
  }

  if (errors.length > 0) {
    throw new Error(`Proposed entry failed validation:\n  - ${errors.join('\n  - ')}`);
  }

  return { id, title, topics, keywords, content };
}

/**
 * The category every case-study entry leads with. Retrieval folds topics into
 * an entry's searchable text, so an entry missing this tag ranks below its
 * hand-written neighbours for the same question. Live testing produced exactly
 * that: a generated entry with plausible topics and no `project` among them.
 */
export const CASE_STUDY_TOPIC = 'project';

/**
 * Assembles the reviewable entry. `href`, `path`, and the leading topic are
 * derived here rather than taken from the model. The first two become a public
 * citation; the third is a house convention, not a factual claim. All three
 * are things the source filename and layout already determine, so asking a
 * model to reproduce them only creates a way for them to be wrong.
 */
export function assembleEntry(
  proposed: ProposedEntry,
  sourcePath: string,
  reviewedOn: string,
): KnowledgeEntry {
  const slug = sourcePath.split('/').pop()?.replace(/\.(mdx|md)$/, '') ?? proposed.id;
  const href = `/projects/${slug}`;

  if (!isAllowlistedSourceHref(href)) {
    throw new Error(`Derived href ${href} is not an allowlisted public route`);
  }

  const topics = proposed.topics.filter((topic) => topic !== CASE_STUDY_TOPIC);

  return {
    id: proposed.id,
    source: { title: proposed.title, path: sourcePath, href },
    lastReviewed: reviewedOn,
    topics: [CASE_STUDY_TOPIC, ...topics],
    keywords: proposed.keywords,
    content: proposed.content,
  };
}

export async function generateEntry(
  client: LunaClient,
  sourcePath: string,
  sourceText: string,
  reviewedOn: string,
): Promise<KnowledgeEntry> {
  const text = await client.complete(GENERATE_INSTRUCTIONS, buildGenerateInput(sourcePath, sourceText));
  return assembleEntry(validateProposedEntry(parseJsonObject(text)), sourcePath, reviewedOn);
}
