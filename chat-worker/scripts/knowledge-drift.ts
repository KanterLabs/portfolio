/**
 * Tier 0 knowledge audit: everything that can be decided without a model.
 *
 * The chat Worker answers only from `chat-content/knowledge.json`, and each
 * entry records the file it was derived from (`source.path`) and the date a
 * human last checked it (`lastReviewed`). Nothing enforced that relationship,
 * so entries silently went stale whenever their source changed — which is the
 * one failure mode that makes the bot state things the site no longer says.
 *
 * This module is pure: every filesystem and git lookup is injected, so the
 * audit is unit-testable without a repo, and the same logic runs locally and
 * in CI. Run a model over the survivors (see knowledge-agent.ts) only after
 * this pass, never instead of it.
 */

import type { KnowledgeDocument, KnowledgeEntry } from '../src/types.ts';
import { isAllowlistedSourceHref } from '../src/knowledge.ts';

export type Severity = 'error' | 'warning';

export type ProblemKind =
  | 'shallow-clone'
  | 'schema'
  | 'missing-source-file'
  | 'bad-href'
  | 'uncovered-case-study'
  | 'stale-entry'
  | 'dirty-source'
  | 'draft-source'
  | 'version-behind'
  | 'future-review-date';

export interface Problem {
  kind: ProblemKind;
  severity: Severity;
  /** Entry id, or the case-study path for `uncovered-case-study`. */
  subject: string;
  detail: string;
  /** Present on `stale-entry`: what a human needs in order to re-review. */
  staleness?: {
    sourcePath: string;
    lastReviewed: string;
    sourceChangedAt: string;
  };
}

export interface AuditReport {
  ok: boolean;
  problems: Problem[];
  checkedEntries: number;
  /** Entry ids a model review should look at, in document order. */
  staleEntryIds: string[];
}

export interface AuditIo {
  /** ISO date (YYYY-MM-DD) of the last commit touching `path`, or null. */
  lastCommitDate(path: string): string | null;
  /** True when `path` has uncommitted modifications. */
  isDirty(path: string): boolean;
  fileExists(path: string): boolean;
  /** Repo-relative paths of every case-study source file. */
  listCaseStudies(): string[];
  /**
   * Shallow clones make `lastCommitDate` meaningless. With no parent commits,
   * git attributes every tracked file to the single fetched commit, so all
   * sources report the tip's date regardless of when they actually changed —
   * verified against a `--depth 1` clone of this repo. That reads as "the
   * whole knowledge base went stale today", and had the tip landed on a day
   * matching `lastReviewed` it would read as uniformly fresh instead. Neither
   * is a real answer, so the audit refuses to run.
   */
  isShallowRepository(): boolean;
  /** True when the source file's frontmatter marks it a draft. */
  isDraftSource(path: string): boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Leading frontmatter block only; `draft:` in the body is page content. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * The site's content schema accepts only a bare boolean `draft`, so matching
 * the literal token cannot disagree with what Astro builds.
 */
export function frontmatterIsDraft(contents: string): boolean {
  const block = contents.match(FRONTMATTER)?.[1];
  return block ? /^draft:\s*true\s*$/m.test(block) : false;
}

function problem(
  kind: ProblemKind,
  severity: Severity,
  subject: string,
  detail: string,
  staleness?: Problem['staleness'],
): Problem {
  return staleness ? { kind, severity, subject, detail, staleness } : { kind, severity, subject, detail };
}

/**
 * Validates one entry's shape. Returns the problems found; an entry that fails
 * here is not checked for staleness, because a malformed `source.path` would
 * produce a misleading "up to date" result.
 */
function auditShape(entry: KnowledgeEntry, index: number, io: AuditIo): Problem[] {
  const problems: Problem[] = [];
  const id = entry?.id || `entry[${index}]`;
  const require = (condition: unknown, detail: string) => {
    if (!condition) problems.push(problem('schema', 'error', id, detail));
  };

  require(typeof entry.id === 'string' && entry.id.length > 0, 'missing `id`');
  require(entry.source && typeof entry.source === 'object', 'missing `source`');
  if (!entry.source || typeof entry.source !== 'object') return problems;

  require(typeof entry.source.title === 'string' && entry.source.title.length > 0, 'missing `source.title`');
  require(typeof entry.source.path === 'string' && entry.source.path.length > 0, 'missing `source.path`');
  require(typeof entry.source.href === 'string' && entry.source.href.length > 0, 'missing `source.href`');
  require(typeof entry.content === 'string' && entry.content.length > 0, 'missing `content`');
  require(Array.isArray(entry.topics) && entry.topics.length > 0, 'missing or empty `topics`');
  require(Array.isArray(entry.keywords) && entry.keywords.length > 0, 'missing or empty `keywords`');
  require(
    typeof entry.lastReviewed === 'string' && ISO_DATE.test(entry.lastReviewed),
    'missing or malformed `lastReviewed` (expected YYYY-MM-DD)',
  );

  // The Worker will silently drop a citation whose href fails this test, so a
  // bad href degrades answers without any runtime error to notice.
  if (typeof entry.source.href === 'string' && !isAllowlistedSourceHref(entry.source.href)) {
    problems.push(
      problem(
        'bad-href',
        'error',
        id,
        `source.href ${JSON.stringify(entry.source.href)} is not an allowlisted public route; ` +
          'the Worker would refuse to cite it',
      ),
    );
  }

  if (typeof entry.source.path === 'string' && entry.source.path && !io.fileExists(entry.source.path)) {
    problems.push(
      problem('missing-source-file', 'error', id, `source.path ${entry.source.path} does not exist`),
    );
  }

  return problems;
}

function auditFreshness(entry: KnowledgeEntry, io: AuditIo, today: string): Problem[] {
  const problems: Problem[] = [];
  const { path } = entry.source;

  if (entry.lastReviewed > today) {
    problems.push(
      problem(
        'future-review-date',
        'error',
        entry.id,
        `lastReviewed ${entry.lastReviewed} is in the future (today is ${today})`,
      ),
    );
  }

  const changedAt = io.lastCommitDate(path);
  if (changedAt && changedAt > entry.lastReviewed) {
    problems.push(
      problem(
        'stale-entry',
        'error',
        entry.id,
        `${path} was last changed ${changedAt}, after this entry was reviewed on ${entry.lastReviewed}`,
        { sourcePath: path, lastReviewed: entry.lastReviewed, sourceChangedAt: changedAt },
      ),
    );
  }

  // Uncommitted edits are a warning, not an error: they are the normal state
  // mid-change, and failing on them would make the check unusable locally.
  if (io.isDirty(path)) {
    problems.push(
      problem('dirty-source', 'warning', entry.id, `${path} has uncommitted changes not yet reflected here`),
    );
  }

  return problems;
}

export function auditKnowledge(doc: KnowledgeDocument, io: AuditIo, today: string): AuditReport {
  const problems: Problem[] = [];

  if (io.isShallowRepository()) {
    return {
      ok: false,
      checkedEntries: 0,
      staleEntryIds: [],
      problems: [
        problem(
          'shallow-clone',
          'error',
          'repository',
          'this is a shallow clone, so file history is unavailable and staleness cannot be determined. ' +
            'Check out with `fetch-depth: 0` before running the audit.',
        ),
      ],
    };
  }

  const entries = Array.isArray(doc?.entries) ? doc.entries : [];
  const seenIds = new Set<string>();
  const coveredPaths = new Set<string>();

  entries.forEach((entry, index) => {
    const shapeProblems = auditShape(entry, index, io);
    problems.push(...shapeProblems);

    if (entry?.id) {
      if (seenIds.has(entry.id)) {
        problems.push(problem('schema', 'error', entry.id, 'duplicate entry id'));
      }
      seenIds.add(entry.id);
    }

    // Only a structurally sound entry can be meaningfully aged.
    if (shapeProblems.length === 0) {
      coveredPaths.add(entry.source.path);
      problems.push(...auditFreshness(entry, io, today));

      // `version` is what /health reports, so it has to be at least as recent
      // as the newest review; otherwise the deployed answer set is newer than
      // the version identifying it.
      if (doc.version && entry.lastReviewed > doc.version) {
        problems.push(
          problem(
            'version-behind',
            'error',
            entry.id,
            `reviewed ${entry.lastReviewed}, after document version ${doc.version} was last advanced; ` +
              'bump `version` in chat-content/knowledge.json',
          ),
        );
      }

      if (io.isDraftSource(entry.source.path)) {
        problems.push(
          problem(
            'draft-source',
            'error',
            entry.id,
            `${entry.source.path} is a draft case study, so the assistant would describe and cite ` +
              'an unpublished page',
          ),
        );
      }
    }
  });

  for (const caseStudy of io.listCaseStudies()) {
    if (!coveredPaths.has(caseStudy)) {
      problems.push(
        problem(
          'uncovered-case-study',
          'error',
          caseStudy,
          'case study has no knowledge entry, so the assistant cannot answer questions about it',
        ),
      );
    }
  }

  return {
    ok: !problems.some((item) => item.severity === 'error'),
    problems,
    checkedEntries: entries.length,
    staleEntryIds: problems
      .filter((item) => item.kind === 'stale-entry')
      .map((item) => item.subject),
  };
}

export function formatReport(report: AuditReport): string {
  if (report.problems.length === 0) {
    return `knowledge audit: ${report.checkedEntries} entries, no problems found`;
  }

  const lines: string[] = [];
  const errors = report.problems.filter((item) => item.severity === 'error');
  const warnings = report.problems.filter((item) => item.severity === 'warning');

  for (const item of [...errors, ...warnings]) {
    const label = item.severity === 'error' ? 'ERROR' : 'warn ';
    lines.push(`  ${label} [${item.kind}] ${item.subject}: ${item.detail}`);
  }

  lines.push('');
  lines.push(
    `knowledge audit: ${report.checkedEntries} entries, ${errors.length} error(s), ${warnings.length} warning(s)`,
  );

  if (report.staleEntryIds.length > 0) {
    lines.push('');
    lines.push('To review the stale entries against their sources:');
    lines.push(`  npm run knowledge:review -- ${report.staleEntryIds.join(' ')}`);
  }

  return lines.join('\n');
}
