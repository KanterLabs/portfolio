import { execSync } from 'node:child_process';

/**
 * The footer build stamp.
 *
 * This used to shell out to git at build time, which silently broke the
 * moment the site started shipping as a container: `.git` is dockerignored
 * and the node:alpine build stage has no git binary, so every published
 * image rendered the literal string "unavailable". The stamp is therefore
 * injected by the image build (see the Dockerfile's VCS_REF / BUILD_DATE
 * args) and only falls back to git for local development.
 *
 * The old "-N" suffix counted commits sharing the newest commit's date. CI
 * checks out a single commit by default, so that count was always 1 and the
 * suffix carried no information. It is replaced by the short commit SHA,
 * which matches what /_meta/revision reports.
 */

function runGit(command: string) {
  return execSync(command, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).trim();
}

function shortSha(sha: string) {
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : '';
}

/** CI hands us an ISO `YYYY-MM-DD`; the footer has always read `MM-DD-YYYY`. */
function toDisplayDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : '';
}

function injectedVersion() {
  const sha = shortSha((process.env.PORTFOLIO_BUILD_SHA ?? '').trim());

  if (!sha) {
    return '';
  }

  // The date reflects when the image was built, not when the newest commit
  // landed, so a rebuild of an old commit is still distinguishable.
  const date =
    toDisplayDate((process.env.PORTFOLIO_BUILD_DATE ?? '').trim()) ||
    toDisplayDate(new Date().toISOString().slice(0, 10));

  return `${date} · ${sha}`;
}

function gitVersion() {
  try {
    const date = runGit('git log -1 --date=format:%m-%d-%Y --format=%cd');
    const sha = shortSha(runGit('git log -1 --format=%H'));

    return date && sha ? `${date} · ${sha}` : '';
  } catch {
    return '';
  }
}

export function getSiteBuildVersion() {
  return injectedVersion() || gitVersion() || 'unavailable';
}
