import { execSync } from 'node:child_process';

function runGit(command: string) {
  return execSync(command, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).trim();
}

export function getSiteBuildVersion() {
  try {
    const latestDate = runGit("git log -1 --date=format:%m-%d-%Y --format=%cd");

    if (!latestDate) {
      return 'unavailable';
    }

    const commitDates = runGit("git log --date=format:%m-%d-%Y --format=%cd").split('\n');
    const sameDayCommitCount = commitDates.filter((date) => date === latestDate).length;

    if (sameDayCommitCount === 0) {
      return 'unavailable';
    }

    return `${latestDate}-${sameDayCommitCount}`;
  } catch {
    return 'unavailable';
  }
}
