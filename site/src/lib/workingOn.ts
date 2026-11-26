/**
 * The homepage "What I'm working on" data. src/data/working-on.json is written
 * nightly on the dev host by scripts/working_on.py and committed to beta, so
 * WorkingOn.astro validates it here at build time: a malformed refresh fails the build
 * instead of shipping a broken section.
 */
export type ShippedKind = 'feat' | 'fix' | 'perf' | 'ops';

export interface ShippedItem {
  kind: ShippedKind;
  title: string;
  date: string;
}

/** 1 = worked without committing; 2-4 = more commits that day. */
export type ActivityLevel = 1 | 2 | 3 | 4;

export interface WorkingOnProject {
  name: string;
  kind: string;
  href?: string;
  /** Every worked day in the strip and its intensity, by YYYY-MM-DD. */
  activity: Record<string, ActivityLevel>;
  lastWorked: string;
  shipped: ShippedItem[];
}

export interface WorkingOnData {
  refreshedOn: string;
  stripStart: string;
  stripDays: number;
  shippedSince: string;
  projects: WorkingOnProject[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: readonly ShippedKind[] = ['feat', 'fix', 'perf', 'ops'];

function fail(message: string): never {
  throw new Error(`working-on.json: ${message}`);
}

function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) fail(`${field} must be YYYY-MM-DD`);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string`);
  return value;
}

export function parseWorkingOn(input: unknown): WorkingOnData {
  const data = input as Record<string, unknown>;
  const stripDays = data.stripDays;
  if (typeof stripDays !== 'number' || !Number.isInteger(stripDays) || stripDays < 7 || stripDays > 62) {
    fail('stripDays must be an integer between 7 and 62');
  }
  if (!Array.isArray(data.projects)) fail('projects must be an array');
  return {
    refreshedOn: date(data.refreshedOn, 'refreshedOn'),
    stripStart: date(data.stripStart, 'stripStart'),
    stripDays,
    shippedSince: date(data.shippedSince, 'shippedSince'),
    projects: data.projects.map((item, index) => {
      const project = item as Record<string, unknown>;
      const at = `projects[${index}]`;
      if (project.href !== undefined && !/^\/[a-z0-9/-]*$/.test(String(project.href))) {
        fail(`${at}.href must be a site-relative path`);
      }
      const activity = project.activity;
      if (typeof activity !== 'object' || activity === null || Array.isArray(activity) || !Array.isArray(project.shipped)) {
        fail(`${at} needs an activity map and a shipped array`);
      }
      return {
        name: text(project.name, `${at}.name`),
        kind: text(project.kind, `${at}.kind`),
        ...(project.href === undefined ? {} : { href: String(project.href) }),
        activity: Object.fromEntries(
          Object.entries(activity).map(([day, level]) => {
            date(day, `${at}.activity key`);
            if (level !== 1 && level !== 2 && level !== 3 && level !== 4) fail(`${at}.activity[${day}] must be 1-4`);
            return [day, level as ActivityLevel];
          }),
        ),
        lastWorked: date(project.lastWorked, `${at}.lastWorked`),
        shipped: project.shipped.map((entry, i) => {
          const shipped = entry as Record<string, unknown>;
          if (!KINDS.includes(shipped.kind as ShippedKind)) fail(`${at}.shipped[${i}].kind is not allowed`);
          return {
            kind: shipped.kind as ShippedKind,
            title: text(shipped.title, `${at}.shipped[${i}].title`),
            date: date(shipped.date, `${at}.shipped[${i}].date`),
          };
        }),
      };
    }),
  };
}

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Every day in the strip, oldest first, as YYYY-MM-DD. */
export function stripDates(data: Pick<WorkingOnData, 'stripStart' | 'stripDays'>): string[] {
  const start = toUtc(data.stripStart);
  return Array.from({ length: data.stripDays }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10));
}

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Nov 25" for a YYYY-MM-DD date. */
export const formatDay = (iso: string) => shortDate.format(new Date(toUtc(iso)));

/**
 * "today" or "yesterday" when `iso` is that close to `now` (both YYYY-MM-DD),
 * otherwise null. The page renders absolute dates and upgrades them in the
 * viewer's browser, so a deploy that lags the data never claims "today".
 */
export function relativeDay(iso: string, now: string): 'today' | 'yesterday' | null {
  const days = Math.round((toUtc(now) - toUtc(iso)) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return null;
}
