/**
 * Filesystem and git adapters for the knowledge audit. Kept apart from the
 * audit logic so the rules can be tested without a working tree.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontmatterIsDraft, type AuditIo } from './knowledge-drift.ts';

/** chat-worker/scripts -> repository root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const KNOWLEDGE_PATH = join(REPO_ROOT, 'chat-content', 'knowledge.json');
export const CASE_STUDY_DIR = join('site', 'src', 'content', 'projects');

/** A file that cannot be read is handled by the missing-source-file check. */
function readOrEmpty(path: string): string {
  try {
    return readFileSync(join(REPO_ROOT, path), 'utf8');
  } catch {
    return '';
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

export function createAuditIo(): AuditIo {
  return {
    lastCommitDate(path) {
      try {
        // %cd with --date=short gives the committer date as YYYY-MM-DD, which
        // compares correctly as a plain string against `lastReviewed`.
        const out = git(['log', '-1', '--format=%cd', '--date=short', '--', path]);
        return out || null;
      } catch {
        return null;
      }
    },

    isDirty(path) {
      try {
        return git(['status', '--porcelain', '--', path]).length > 0;
      } catch {
        return false;
      }
    },

    fileExists(path) {
      return existsSync(join(REPO_ROOT, path));
    },

    listCaseStudies() {
      const dir = join(REPO_ROOT, CASE_STUDY_DIR);
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((name) => name.endsWith('.mdx') || name.endsWith('.md'))
        .sort()
        .map((name) => join(CASE_STUDY_DIR, name))
        // A draft page is not published, so it is not something the assistant
        // is expected to cover.
        .filter((path) => !frontmatterIsDraft(readOrEmpty(path)));
    },

    isShallowRepository() {
      try {
        return git(['rev-parse', '--is-shallow-repository']) === 'true';
      } catch {
        // No git at all is a different failure from a shallow clone; let the
        // date lookups return null rather than blocking the whole audit.
        return false;
      }
    },

    isDraftSource(path) {
      return frontmatterIsDraft(readOrEmpty(path));
    },
  };
}

export function readKnowledgeDocument(): unknown {
  return JSON.parse(readFileSync(KNOWLEDGE_PATH, 'utf8'));
}

export function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

export function today(): string {
  // Local date, matching how `lastReviewed` is authored by hand.
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
