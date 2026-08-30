import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_MAX_OUTPUT_TOKENS,
  assembleEntry,
  buildReviewInput,
  createLunaClient,
  extractOutputText,
  generateEntry,
  parseJsonObject,
  reviewEntry,
  validateProposedEntry,
  validateReview,
  type LunaClient,
} from '../scripts/knowledge-agent.ts';
import { auditKnowledge } from '../scripts/knowledge-drift.ts';
import type { KnowledgeEntry } from '../src/types.ts';

const ENTRY: KnowledgeEntry = {
  id: 'hostlet',
  source: {
    title: 'Hostlet',
    path: 'site/src/content/projects/hostlet.mdx',
    href: '/projects/hostlet',
  },
  lastReviewed: '2026-08-16',
  topics: ['project'],
  keywords: ['hostlet'],
  content: 'Hostlet is a self-hosted deployment control plane written in Rust.',
};

/** A client that returns canned text, so no network or key is involved. */
function stubClient(reply: string): LunaClient {
  return { complete: async () => reply };
}

const VALID_PROPOSAL = {
  id: 'sandbox-factory',
  title: 'Sandbox Factory',
  topics: ['project', 'platform'],
  keywords: ['sandbox', 'proxmox', 'browser', 'workstation'],
  content: 'A private-first platform for short-lived development workstations.',
};

describe('extractOutputText', () => {
  it('prefers the flattened convenience field', () => {
    expect(extractOutputText({ output_text: '  hello  ' })).toBe('hello');
  });

  it('falls back to walking the output array', () => {
    const payload = {
      output: [{ content: [{ type: 'output_text', text: 'part one ' }, { type: 'output_text', text: 'part two' }] }],
    };
    expect(extractOutputText(payload)).toBe('part one part two');
  });

  it('returns empty string for an unrecognised payload', () => {
    expect(extractOutputText({ nonsense: true })).toBe('');
  });
});

describe('parseJsonObject', () => {
  it('parses bare JSON', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('unwraps a fenced json block', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers an object buried in prose', () => {
    expect(parseJsonObject('Sure! Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('throws rather than returning a partial result', () => {
    expect(() => parseJsonObject('no json at all')).toThrow(/Could not parse JSON/);
  });
});

describe('validateReview', () => {
  it('normalises a well-formed review', () => {
    const result = validateReview('hostlet', {
      verdict: 'contradicted',
      issues: ['says Rust, source says Go', ''],
      missing: null,
      suggestedContent: '  Hostlet is written in Go.  ',
    });

    expect(result).toEqual({
      entryId: 'hostlet',
      verdict: 'contradicted',
      issues: ['says Rust, source says Go'],
      missing: [],
      sourceIssues: [],
      suggestedContent: 'Hostlet is written in Go.',
    });
  });

  it('keeps source-page defects separate from entry problems', () => {
    // sourceIssues describes the page, not the entry, so it must not be folded
    // into `issues` — the two lead to different fixes, in different files.
    const result = validateReview('hostlet', {
      verdict: 'incomplete',
      issues: [],
      missing: ['backup and restore commands'],
      sourceIssues: ['frontmatter says GitHub OAuth; the prose says GitHub Device Flow'],
    });

    expect(result.issues).toEqual([]);
    expect(result.sourceIssues).toEqual([
      'frontmatter says GitHub OAuth; the prose says GitHub Device Flow',
    ]);
  });

  it('treats an empty suggestion as no suggestion', () => {
    const result = validateReview('hostlet', { verdict: 'supported', suggestedContent: '   ' });
    expect(result.suggestedContent).toBeNull();
  });

  it('rejects an unrecognised verdict instead of guessing', () => {
    expect(() => validateReview('hostlet', { verdict: 'probably fine' })).toThrow(/invalid verdict/);
  });
});

describe('validateProposedEntry', () => {
  it('accepts and trims a valid proposal', () => {
    expect(validateProposedEntry({ ...VALID_PROPOSAL, id: '  sandbox-factory  ' })).toEqual(VALID_PROPOSAL);
  });

  it('rejects a non-kebab-case id', () => {
    expect(() => validateProposedEntry({ ...VALID_PROPOSAL, id: 'Sandbox Factory' })).toThrow(/kebab-case/);
  });

  it('rejects a proposal missing required fields', () => {
    expect(() => validateProposedEntry({ id: 'x' })).toThrow(/`title` must be a non-empty string/);
  });

  it('rejects too few keywords, which would make the entry unretrievable', () => {
    expect(() => validateProposedEntry({ ...VALID_PROPOSAL, keywords: ['one'] })).toThrow(
      /`keywords` needs at least 4 items/,
    );
  });

  it('rejects content past the length limit', () => {
    expect(() => validateProposedEntry({ ...VALID_PROPOSAL, content: 'x'.repeat(1201) })).toThrow(
      /over the 1200 limit/,
    );
  });

  it('collects every error at once rather than failing on the first', () => {
    const run = () => validateProposedEntry({ id: 'Bad Id', topics: [], keywords: [] });
    expect(run).toThrow(/`title`/);
    expect(run).toThrow(/`content`/);
    expect(run).toThrow(/kebab-case/);
  });
});

describe('assembleEntry', () => {
  it('derives path and href from the real filename, not from the model', () => {
    const entry = assembleEntry(VALID_PROPOSAL, 'site/src/content/projects/sandbox-factory.mdx', '2026-08-21');

    expect(entry.source).toEqual({
      title: 'Sandbox Factory',
      path: 'site/src/content/projects/sandbox-factory.mdx',
      href: '/projects/sandbox-factory',
    });
    expect(entry.lastReviewed).toBe('2026-08-21');
  });

  it("leads topics with 'project' even when the model omits it", () => {
    // Observed live: a generated entry came back with plausible topics and no
    // `project` among them, which would have made it retrieve worse than every
    // hand-written entry.
    const entry = assembleEntry(
      { ...VALID_PROPOSAL, topics: ['infrastructure', 'security'] },
      'site/src/content/projects/sandbox-factory.mdx',
      '2026-08-21',
    );

    expect(entry.topics).toEqual(['project', 'infrastructure', 'security']);
  });

  it("does not duplicate 'project' when the model does include it", () => {
    const entry = assembleEntry(
      { ...VALID_PROPOSAL, topics: ['security', 'project', 'sandbox'] },
      'site/src/content/projects/sandbox-factory.mdx',
      '2026-08-21',
    );

    expect(entry.topics).toEqual(['project', 'security', 'sandbox']);
  });

  it('ignores an href the model tried to smuggle in', () => {
    const entry = assembleEntry(
      { ...VALID_PROPOSAL, href: 'https://evil.test' } as never,
      'site/src/content/projects/sandbox-factory.mdx',
      '2026-08-21',
    );
    expect(entry.source.href).toBe('/projects/sandbox-factory');
  });

  it('refuses a filename that would produce a non-allowlisted href', () => {
    expect(() =>
      assembleEntry(VALID_PROPOSAL, 'site/src/content/projects/Not Allowed!.mdx', '2026-08-21'),
    ).toThrow(/not an allowlisted public route/);
  });
});

describe('reviewEntry', () => {
  it('sends the entry content and current source, and returns a parsed verdict', async () => {
    const complete = vi.fn().mockResolvedValue('{"verdict":"supported","issues":[],"missing":[]}');
    const result = await reviewEntry({ complete }, ENTRY, 'The current page text.');

    const [, input] = complete.mock.calls[0];
    expect(input).toContain(ENTRY.content);
    expect(input).toContain('The current page text.');
    expect(input).toContain('site/src/content/projects/hostlet.mdx');
    expect(result.verdict).toBe('supported');
    expect(result.entryId).toBe('hostlet');
  });

  it('propagates a validation failure instead of returning a default verdict', async () => {
    await expect(reviewEntry(stubClient('{"verdict":"ok"}'), ENTRY, 'text')).rejects.toThrow(
      /invalid verdict/,
    );
  });
});

describe('buildReviewInput', () => {
  it('labels the entry and the source so they cannot be confused', () => {
    const input = buildReviewInput(ENTRY, 'page text');
    expect(input).toContain('Entry content (the claims to audit):');
    expect(input).toContain('Current source text of site/src/content/projects/hostlet.mdx:');
  });
});

describe('generateEntry', () => {
  it('produces a complete entry from a valid proposal', async () => {
    const entry = await generateEntry(
      stubClient(JSON.stringify(VALID_PROPOSAL)),
      'site/src/content/projects/sandbox-factory.mdx',
      '# Sandbox Factory',
      '2026-08-21',
    );

    expect(entry.id).toBe('sandbox-factory');
    expect(entry.source.href).toBe('/projects/sandbox-factory');
    expect(entry.content).toBe(VALID_PROPOSAL.content);
  });

  it('fails closed when the model returns something unusable', async () => {
    await expect(
      generateEntry(stubClient('I could not read that file.'), 'site/x.mdx', 'text', '2026-08-21'),
    ).rejects.toThrow(/Could not parse JSON/);
  });

  it('produces an entry the Tier 0 audit accepts', async () => {
    // The two tools have to agree, or `generate` would emit entries that fail
    // the gate the moment they are committed.
    const path = 'site/src/content/projects/sandbox-factory.mdx';
    const entry = await generateEntry(
      stubClient(JSON.stringify(VALID_PROPOSAL)),
      path,
      '# Sandbox Factory',
      '2026-08-21',
    );

    const report = auditKnowledge({ version: '2026-08-21', entries: [entry] }, {
      lastCommitDate: () => '2026-08-21',
      isDirty: () => false,
      fileExists: () => true,
      listCaseStudies: () => [path],
      isShallowRepository: () => false,
      isDraftSource: () => false,
    }, '2026-08-21');

    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('createLunaClient', () => {
  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }

  it('posts the same request shape the Worker uses, without streaming', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ output_text: 'hi' }));
    const client = createLunaClient({ apiKey: 'sk-test', model: 'gpt-5.6-luna', fetchImpl });

    await client.complete('instructions', 'input');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer sk-test');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'gpt-5.6-luna',
      instructions: 'instructions',
      input: 'input',
      stream: false,
      store: false,
      max_output_tokens: AGENT_MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'low' },
    });
  });

  it('surfaces an upstream error with its status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 429));
    const client = createLunaClient({ apiKey: 'sk-test', model: 'm', fetchImpl });

    await expect(client.complete('i', 'p')).rejects.toThrow(/Luna request failed: 429/);
  });

  it('rejects an empty completion rather than returning empty text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ output_text: '' }));
    const client = createLunaClient({ apiKey: 'sk-test', model: 'm', fetchImpl });

    await expect(client.complete('i', 'p')).rejects.toThrow(/empty response/);
  });

  it('does not leak the api key into the error message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, false, 401));
    const client = createLunaClient({ apiKey: 'sk-secret-value', model: 'm', fetchImpl });

    await expect(client.complete('i', 'p')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('sk-secret-value') }) as Error,
    );
  });
});
