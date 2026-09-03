import { describe, expect, it } from 'vitest';

import {
  auditKnowledge,
  formatReport,
  frontmatterIsDraft,
  type AuditIo,
} from '../scripts/knowledge-drift.ts';
import type { KnowledgeDocument, KnowledgeEntry } from '../src/types.ts';

const TODAY = '2026-08-21';

function entry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'hostlet',
    source: {
      title: 'Hostlet',
      path: 'site/src/content/projects/hostlet.mdx',
      href: '/projects/hostlet',
    },
    lastReviewed: '2026-08-20',
    topics: ['project'],
    keywords: ['hostlet', 'rust'],
    content: 'Hostlet is a self-hosted deployment control plane.',
    ...overrides,
  };
}

// Default version is the newest `lastReviewed` below, so the version-behind
// check stays quiet unless a test deliberately moves one of the two.
function doc(entries: KnowledgeEntry[], version = '2026-08-20'): KnowledgeDocument {
  return { version, entries };
}

function io(overrides: Partial<AuditIo> = {}): AuditIo {
  return {
    lastCommitDate: () => '2026-08-01',
    isDirty: () => false,
    fileExists: () => true,
    listCaseStudies: () => ['site/src/content/projects/hostlet.mdx'],
    isShallowRepository: () => false,
    isDraftSource: () => false,
    ...overrides,
  };
}

const kinds = (report: ReturnType<typeof auditKnowledge>) => report.problems.map((item) => item.kind);

describe('auditKnowledge', () => {
  it('passes a well-formed, freshly reviewed entry', () => {
    const report = auditKnowledge(doc([entry()]), io(), TODAY);

    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checkedEntries).toBe(1);
  });

  it('flags an entry whose source changed after it was last reviewed', () => {
    const report = auditKnowledge(
      doc([entry({ lastReviewed: '2026-08-16' })]),
      io({ lastCommitDate: () => '2026-08-18' }),
      TODAY,
    );

    expect(report.ok).toBe(false);
    expect(report.staleEntryIds).toEqual(['hostlet']);
    const stale = report.problems.find((item) => item.kind === 'stale-entry');
    expect(stale?.staleness).toEqual({
      sourcePath: 'site/src/content/projects/hostlet.mdx',
      lastReviewed: '2026-08-16',
      sourceChangedAt: '2026-08-18',
    });
  });

  it('accepts a source changed on the same day it was reviewed', () => {
    // Same-day edits are the normal review workflow: change the page, then
    // update the entry. Only a strictly later commit means unreviewed drift.
    const report = auditKnowledge(
      doc([entry({ lastReviewed: '2026-08-18' })]),
      io({ lastCommitDate: () => '2026-08-18' }),
      TODAY,
    );

    expect(report.ok).toBe(true);
    expect(report.staleEntryIds).toEqual([]);
  });

  it('refuses to run in a shallow clone rather than trusting fabricated dates', () => {
    const report = auditKnowledge(
      doc([entry({ lastReviewed: '2026-01-01' })]),
      // In a --depth 1 clone git attributes every file to the tip commit, so
      // dates are wrong in both directions rather than merely absent.
      io({ isShallowRepository: () => true, lastCommitDate: () => TODAY }),
      TODAY,
    );

    expect(report.ok).toBe(false);
    expect(kinds(report)).toEqual(['shallow-clone']);
    expect(report.problems[0].detail).toContain('fetch-depth: 0');
  });

  it('treats uncommitted source edits as a warning, not a failure', () => {
    const report = auditKnowledge(doc([entry()]), io({ isDirty: () => true }), TODAY);

    expect(kinds(report)).toEqual(['dirty-source']);
    expect(report.problems[0].severity).toBe('warning');
    expect(report.ok).toBe(true);
  });

  it('rejects a source href the Worker would refuse to cite', () => {
    const report = auditKnowledge(
      doc([entry({ source: { title: 'Hostlet', path: 'site/x.mdx', href: 'https://evil.test/x' } })]),
      io({ listCaseStudies: () => [] }),
      TODAY,
    );

    expect(report.ok).toBe(false);
    expect(kinds(report)).toContain('bad-href');
  });

  it('reports a source file that no longer exists', () => {
    const report = auditKnowledge(
      doc([entry()]),
      io({ fileExists: () => false, listCaseStudies: () => [] }),
      TODAY,
    );

    expect(kinds(report)).toContain('missing-source-file');
    expect(report.ok).toBe(false);
  });

  it('does not age an entry whose shape is already broken', () => {
    // A malformed entry has no trustworthy source.path, so reporting it as
    // "stale" as well would just be noise on top of the real problem.
    const report = auditKnowledge(
      doc([entry({ lastReviewed: 'august 2026' })]),
      io({ lastCommitDate: () => '2026-12-31', listCaseStudies: () => [] }),
      TODAY,
    );

    expect(kinds(report)).toEqual(['schema']);
    expect(report.staleEntryIds).toEqual([]);
  });

  it('flags a case study that has no entry at all', () => {
    const report = auditKnowledge(
      doc([entry()]),
      io({
        listCaseStudies: () => [
          'site/src/content/projects/hostlet.mdx',
          'site/src/content/projects/brand-new.mdx',
        ],
      }),
      TODAY,
    );

    const uncovered = report.problems.find((item) => item.kind === 'uncovered-case-study');
    expect(uncovered?.subject).toBe('site/src/content/projects/brand-new.mdx');
    expect(report.ok).toBe(false);
  });

  it('flags duplicate entry ids', () => {
    const report = auditKnowledge(doc([entry(), entry()]), io(), TODAY);

    expect(report.problems.some((item) => item.detail === 'duplicate entry id')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('flags a review date in the future', () => {
    const report = auditKnowledge(doc([entry({ lastReviewed: '2027-01-01' })]), io(), TODAY);

    expect(kinds(report)).toContain('future-review-date');
    expect(report.ok).toBe(false);
  });

  it('flags a document version older than an entry it serves', () => {
    const report = auditKnowledge(doc([entry({ lastReviewed: '2026-08-20' })], '2026-08-18'), io(), TODAY);

    const behind = report.problems.find((item) => item.kind === 'version-behind');
    expect(behind?.subject).toBe('hostlet');
    expect(behind?.detail).toContain('bump `version`');
    expect(report.ok).toBe(false);
  });

  it('accepts a document version equal to or newer than the newest review', () => {
    for (const version of ['2026-08-20', '2026-08-21']) {
      const report = auditKnowledge(doc([entry({ lastReviewed: '2026-08-20' })], version), io(), TODAY);
      expect(kinds(report)).not.toContain('version-behind');
      expect(report.ok).toBe(true);
    }
  });

  it('refuses an entry sourced from a draft case study', () => {
    // A draft page is not published, so citing it would send visitors to a
    // route the site does not build.
    const report = auditKnowledge(doc([entry()]), io({ isDraftSource: () => true }), TODAY);

    const draft = report.problems.find((item) => item.kind === 'draft-source');
    expect(draft?.subject).toBe('hostlet');
    expect(draft?.detail).toContain('site/src/content/projects/hostlet.mdx');
    expect(report.ok).toBe(false);
  });

  it('does not demand coverage of a case study the io does not list', () => {
    // Drafts are filtered out by listCaseStudies, so they never reach here.
    const report = auditKnowledge(
      doc([entry()]),
      io({ listCaseStudies: () => ['site/src/content/projects/hostlet.mdx'] }),
      TODAY,
    );

    expect(kinds(report)).not.toContain('uncovered-case-study');
    expect(report.ok).toBe(true);
  });
});

describe('frontmatterIsDraft', () => {
  const withFrontmatter = (body: string) => `---\ntitle: Hostlet\n${body}\n---\n\n# Hostlet\n`;

  it('detects a draft flag', () => {
    expect(frontmatterIsDraft(withFrontmatter('draft: true'))).toBe(true);
  });

  it('accepts an explicit non-draft', () => {
    expect(frontmatterIsDraft(withFrontmatter('draft: false'))).toBe(false);
  });

  it('treats a missing draft key as published', () => {
    expect(frontmatterIsDraft(withFrontmatter('summary: A control plane'))).toBe(false);
  });

  it('returns false when there is no frontmatter at all', () => {
    expect(frontmatterIsDraft('# Hostlet\n\ndraft: true\n')).toBe(false);
  });

  it('ignores a draft line in the body below the frontmatter', () => {
    expect(frontmatterIsDraft('---\ntitle: Hostlet\n---\n\ndraft: true\n')).toBe(false);
  });
});

describe('formatReport', () => {
  it('summarises a clean run on one line', () => {
    const report = auditKnowledge(doc([entry()]), io(), TODAY);
    expect(formatReport(report)).toBe('knowledge audit: 1 entries, no problems found');
  });

  it('points at the review command when entries are stale', () => {
    const report = auditKnowledge(
      doc([entry({ lastReviewed: '2026-08-16' })]),
      io({ lastCommitDate: () => '2026-08-18' }),
      TODAY,
    );
    const output = formatReport(report);

    expect(output).toContain('ERROR [stale-entry] hostlet');
    expect(output).toContain('npm run knowledge:review -- hostlet');
  });
});
