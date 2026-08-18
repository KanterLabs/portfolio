import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_ENTRIES, isAllowlistedSourceHref, retrieveKnowledge, sourceRefs } from '../src/knowledge.ts';

describe('curated knowledge retrieval', () => {
  it('selects the page project deterministically', () => {
    const first = retrieveKnowledge('How does deployment work?', '/projects/hostlet');
    const second = retrieveKnowledge('How does deployment work?', '/projects/hostlet');

    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
    expect(first[0]?.id).toBe('hostlet');
    expect(first.length).toBeLessThanOrEqual(3);
  });

  it('uses topical matches for a different project', () => {
    const result = retrieveKnowledge('PXE imaging and hardware troubleshooting', '/');
    expect(result[0]?.id).toBe('data-center-operations');
  });

  it('falls back to an approved profile entry for unknown questions', () => {
    const result = retrieveKnowledge('qzxv jklm', '/unknown');
    expect(result.map((entry) => entry.id)).toEqual(['profile']);
  });

  it('only emits allowlisted relative source links', () => {
    expect(isAllowlistedSourceHref('/')).toBe(true);
    expect(isAllowlistedSourceHref('/projects/hostlet')).toBe(true);
    expect(isAllowlistedSourceHref('https://evil.example')).toBe(false);
    expect(isAllowlistedSourceHref('/../../secret')).toBe(false);
    expect(sourceRefs(KNOWLEDGE_ENTRIES)).toEqual(
      KNOWLEDGE_ENTRIES.map((entry) => ({ title: entry.source.title, href: entry.source.href })),
    );
  });
});
