import rawKnowledge from '../../chat-content/knowledge.json';
import type { KnowledgeDocument, KnowledgeEntry, SourceRef } from './types.ts';

const knowledge = rawKnowledge as KnowledgeDocument;

/**
 * The Worker may only cite public routes represented in this explicit file.
 * This check is intentionally stricter than “starts with a slash” so a future
 * edit cannot accidentally turn an external URL into a source link.
 */
const ALLOWED_SOURCE_HREF = /^\/(?:$|#[a-z0-9-]+$|projects\/[a-z0-9-]+(?:#[a-z0-9-]+)?$)/i;

const STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'as',
  'at',
  'can',
  'did',
  'do',
  'does',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'shane',
  'that',
  'the',
  'this',
  'to',
  'what',
  'was',
  'were',
  'who',
  'with',
  'where',
  'which',
]);

const normalise = (value: string): string =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const tokens = (value: string): string[] =>
  normalise(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const entryText = (entry: KnowledgeEntry): string =>
  [entry.source.title, ...entry.topics, ...entry.keywords, entry.content]
    .map(normalise)
    .join(' ');

const entryRoute = (entry: KnowledgeEntry): string => entry.source.href.split('#', 1)[0];

export const KNOWLEDGE_VERSION = knowledge.version;
export const KNOWLEDGE_ENTRIES = knowledge.entries;

export function isAllowlistedSourceHref(href: string): boolean {
  return ALLOWED_SOURCE_HREF.test(href);
}

export function sourceRefs(entries: KnowledgeEntry[]): SourceRef[] {
  const seen = new Set<string>();
  const result: SourceRef[] = [];

  for (const entry of entries) {
    const { href, title } = entry.source;
    if (!isAllowlistedSourceHref(href) || seen.has(href)) {
      continue;
    }
    seen.add(href);
    result.push({ title, href });
  }

  return result;
}

function routeScore(entry: KnowledgeEntry, pagePath: string): number {
  const route = entryRoute(entry);
  const normalisedPath = pagePath.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  const normalisedRoute = route.replace(/\/$/, '') || '/';

  if (normalisedRoute === '/' && normalisedPath === '/') {
    // The home page is broad context; topical matches should still win when
    // a visitor asks about a specific project or skill.
    return 10;
  }
  if (normalisedRoute === normalisedPath) {
    return 80;
  }
  if (normalisedRoute !== '/' && normalisedPath.startsWith(`${normalisedRoute}/`)) {
    return 55;
  }
  return 0;
}

function scoreEntry(entry: KnowledgeEntry, queryTokens: string[], pagePath: string): number {
  const text = entryText(entry);
  const title = normalise(entry.source.title);
  const keywordText = entry.keywords.map(normalise).join(' ');
  let score = routeScore(entry, pagePath);

  for (const token of queryTokens) {
    if (title.split(' ').includes(token)) {
      score += 10;
    }
    if (keywordText.split(' ').includes(token)) {
      score += 7;
    }
    if (text.includes(token)) {
      score += 2;
    }
  }

  return score;
}

/**
 * Select a small, stable subset of the manually curated facts. Scores and
 * ties are deterministic so the same question does not produce a shifting
 * context or source list between requests.
 */
export function retrieveKnowledge(
  query: string,
  pagePath: string,
  limit = 3,
): KnowledgeEntry[] {
  const queryTokens = tokens(query);
  const scored = KNOWLEDGE_ENTRIES.map((entry, index) => ({
    entry,
    index,
    score: scoreEntry(entry, queryTokens, pagePath),
  }));

  scored.sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = scored.filter(({ score }) => score > 0).slice(0, Math.max(1, limit));
  if (selected.length > 0) {
    return selected.map(({ entry }) => entry);
  }

  // A profile fallback gives the model a safe way to answer “who is this?”
  // while still ensuring no arbitrary source can enter the context.
  const profile = KNOWLEDGE_ENTRIES.find((entry) => entry.id === 'profile');
  return profile ? [profile] : KNOWLEDGE_ENTRIES.slice(0, 1);
}

export function knowledgeForPrompt(entries: KnowledgeEntry[]): string {
  return entries
    .map((entry) => {
      const { title, href } = entry.source;
      return `Source: ${title} (${href})\nFacts: ${entry.content}`;
    })
    .join('\n\n');
}
