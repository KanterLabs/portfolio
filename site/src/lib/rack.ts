import { HELM_CASE_STUDY_URL, flagshipRepos, moreRepos, repoUrl, type LabRepo } from './kanterlabs';

/**
 * The catalog rack elevation: a front-view drawing of "rack SK-01" in which
 * every selected public KanterLabs repository is mounted as a unit.
 *
 * Derived from the curated catalog in ./kanterlabs.ts so the rack can never
 * show (or link) a repository the catalog doesn't list. Unit height encodes
 * prominence, not anything physical: the lead project is 4U, the other
 * flagships 2U, and the rest of the catalog 1U.
 */

export const RACK_HEIGHT_U = 22;
export const RACK_NAME = 'SK-01';

export const DATA_CENTER_NOTES_URL = '/projects/data-center-operations';

const languageCodes: Record<LabRepo['language'], string> = {
  Go: 'GO',
  Rust: 'RUST',
  TypeScript: 'TS',
  JavaScript: 'JS',
  Python: 'PY',
};

interface RackUnitBase {
  /** Height in rack units. */
  u: number;
  /** Highest U number the unit occupies; filled in by buildRack(). */
  top: number;
}

export interface RepoUnit extends RackUnitBase {
  kind: 'repo' | 'lead';
  callout: string;
  repo: LabRepo;
  href: string;
  /** True when the unit opens a case study on this site rather than GitHub. */
  internal: boolean;
  code: string;
}

export interface PatchUnit extends RackUnitBase {
  kind: 'patch';
  callout: string;
}

export interface PowerUnit extends RackUnitBase {
  kind: 'power';
  callout: string;
  href: string;
}

export interface BlankUnit extends RackUnitBase {
  kind: 'blank';
}

export type RackUnit = RepoUnit | PatchUnit | PowerUnit | BlankUnit;

type UnitSpec =
  | Omit<RepoUnit, 'top'>
  | Omit<PatchUnit, 'top'>
  | Omit<PowerUnit, 'top'>
  | Omit<BlankUnit, 'top'>;

const repoUnit = (repo: LabRepo, u: number, callout: string, kind: RepoUnit['kind'] = 'repo') => {
  const internal = Boolean(repo.caseStudy);
  return {
    kind,
    u,
    callout,
    repo,
    href: repo.caseStudy?.href ?? repoUrl(repo),
    internal,
    code: languageCodes[repo.language],
  } satisfies Omit<RepoUnit, 'top'>;
};

function buildRack(): RackUnit[] {
  const [lead, ...flagships] = flagshipRepos;
  if (lead.caseStudy?.href !== HELM_CASE_STUDY_URL) {
    throw new Error('rack: the lead unit must be Helm, the first flagship repo');
  }

  let callout = 1;
  const specs: UnitSpec[] = [
    { kind: 'patch', u: 1, callout: 'C' },
    { kind: 'blank', u: 1 },
    repoUnit(lead, 4, String(callout++), 'lead'),
    ...flagships.map((repo) => repoUnit(repo, 2, String(callout++))),
    ...moreRepos.map((repo) => repoUnit(repo, 1, String(callout++))),
  ];

  const used = specs.reduce((sum, unit) => sum + unit.u, 0);
  const powerU = 2;
  const spare = RACK_HEIGHT_U - used - powerU;
  if (spare < 0) {
    throw new Error(`rack: ${used + powerU}U of units do not fit in ${RACK_HEIGHT_U}U`);
  }
  for (let index = 0; index < spare; index += 1) specs.push({ kind: 'blank', u: 1 });
  specs.push({ kind: 'power', u: powerU, callout: 'P', href: DATA_CENTER_NOTES_URL });

  let top = RACK_HEIGHT_U;
  return specs.map((spec) => {
    const unit = { ...spec, top } as RackUnit;
    top -= spec.u;
    return unit;
  });
}

export const rackUnits = buildRack();

/** "17" for a 1U unit, "17–14" for taller ones. */
export const unitRange = (unit: RackUnit) =>
  unit.u === 1 ? pad(unit.top) : `${pad(unit.top)}–${pad(unit.top - unit.u + 1)}`;

export const unitNumbers = (unit: RackUnit) =>
  Array.from({ length: unit.u }, (_, index) => pad(unit.top - index));

const pad = (value: number) => String(value).padStart(2, '0');

export const leadUnit = rackUnits.find((unit): unit is RepoUnit => unit.kind === 'lead')!;
