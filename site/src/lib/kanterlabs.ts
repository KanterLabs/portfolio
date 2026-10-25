import type { ImageMetadata } from 'astro';
import actionViewMenu from '../assets/kanterlabs/actionview-menu.png';

/**
 * The curated public KanterLabs catalog shown at /kanterlabs.
 *
 * Curated and checked in on purpose rather than fetched from the GitHub API
 * at build time: builds stay deterministic on ephemeral CI pods, a rate limit
 * can never fail a release, and every line of copy here is reviewed. Each
 * summary is drawn from that repository's own README.
 *
 * This is Shane's current selection, not an exhaustive list of the org's
 * public repositories. Repository visibility alone does not imply promotion.
 *
 * Only PUBLIC repositories belong in this file. tests/kanterlabs.spec.ts
 * fails the build if the page links any KanterLabs repository that is not
 * listed here, so a private repo can't leak in through a stray link.
 */

export const KANTERLABS_ORG_URL = 'https://github.com/KanterLabs';
export const HELM_CASE_STUDY_URL = '/projects/helm';

export type LabCategory = 'platforms' | 'devtools' | 'desktop' | 'apps';

export type LabMedia =
  | { kind: 'image'; src: ImageMetadata; alt: string; fit: 'cover' | 'contain'; position?: string }
  | { kind: 'themed-image'; light: string; dark: string; alt: string; width: number; height: number }
  | { kind: 'video'; mp4: string; webm: string; poster: string; alt: string; width: number; height: number }
  | { kind: 'terminal'; title: string; lines: { command?: string; note?: string }[] };

export interface LabRepo {
  slug: string;
  name: string;
  summary: string;
  /** One short line for the rack-elevation callout. Keep it under ~34 characters. */
  tagline: string;
  category: LabCategory;
  stack: string[];
  language: 'Rust' | 'Go' | 'TypeScript' | 'JavaScript' | 'Python';
  status: string;
  license?: string;
  caseStudy?: { href: string; label: string };
  site?: { href: string; label: string };
  media?: LabMedia;
}

/** Flagship projects, shown as media cards. Helm is the lead project and comes first. */
export const flagshipRepos: LabRepo[] = [
  {
    slug: 'helm',
    name: 'Helm',
    tagline: 'Board for people and coding agents',
    summary:
      'The lead KanterLabs project: a small, self-hosted project board and bug tracker where people and software agents move work together, with a stable, auditable API for scoped agent automation, plus ticket triage and webhook and email intake.',
    category: 'platforms',
    stack: ['Go', 'Svelte', 'SQLite', 'Docker'],
    language: 'Go',
    status: 'v0.2.0',
    caseStudy: { href: HELM_CASE_STUDY_URL, label: 'Case study' },
    media: {
      kind: 'themed-image',
      light: '/kanterlabs/helm-hero-light.svg',
      dark: '/kanterlabs/helm-hero-dark.svg',
      alt: 'Helm banner: a Kanban board with Backlog, Ready, In progress, and Done columns',
      width: 900,
      height: 340,
    },
  },
  {
    slug: 'ActionView',
    name: 'ActionView',
    tagline: 'Runner fleet in the GNOME top bar',
    summary:
      'The KanterLabs runner fleet, live in the GNOME top bar: running and queued jobs, runner capacity, and a notification when a run fails or a job is stuck.',
    category: 'devtools',
    stack: ['GJS', 'Cairo', 'GNOME Shell', 'ARC'],
    language: 'JavaScript',
    status: 'Active',
    media: {
      kind: 'image',
      src: actionViewMenu,
      alt: 'ActionView dropdown in the GNOME top bar showing a running job with a live timer, a queued job, trend sparklines, and runner capacity',
      fit: 'cover',
      position: 'top',
    },
  },
  {
    slug: 'nfl-scores',
    name: 'NFL Scores',
    tagline: 'Live gamecast in GNOME Shell',
    summary:
      'Live NFL scores and a drawn-on-the-field gamecast built into GNOME Shell. Press Super+F from anywhere; no account, no API key, no tracking.',
    category: 'desktop',
    stack: ['GJS', 'Cairo', 'GNOME Shell'],
    language: 'JavaScript',
    status: 'Active',
    license: 'MIT',
    media: {
      kind: 'video',
      mp4: '/kanterlabs/nfl-touchdown.mp4',
      webm: '/kanterlabs/nfl-touchdown.webm',
      poster: '/kanterlabs/nfl-touchdown-poster.jpg',
      alt: 'A touchdown replayed on the gamecast field: the ball crosses the goal line and the end zone lights up',
      width: 730,
      height: 384,
    },
  },
  {
    slug: 'resonance',
    name: 'Resonance',
    tagline: 'Spotify in a native terminal',
    summary:
      'A terminal Spotify client built from ncspot, with a Rust playback engine, an OpenTUI workspace, keyboard controls, and local radio. Requires Spotify Premium.',
    category: 'desktop',
    stack: ['Rust', 'TypeScript', 'OpenTUI', 'librespot'],
    language: 'Rust',
    status: 'Active',
    license: 'BSD-2-Clause',
    media: {
      kind: 'terminal',
      title: 'Resonance · quick start',
      lines: [
        { command: 'resonance', note: 'OpenTUI workspace on Unix' },
        { command: 'resonance --headless', note: 'Rust playback engine only' },
      ],
    },
  },
  {
    slug: 'greenlit-app',
    name: 'Greenlit',
    tagline: 'GitHub Actions, run locally',
    summary:
      'Run GitHub Actions workflows locally, fast, with results you can trust. Built around one claim: if it passes here, it passes on GitHub.',
    category: 'devtools',
    stack: ['Rust', 'Docker', 'GitHub Actions'],
    language: 'Rust',
    status: 'Pre-release',
    license: 'MIT',
    site: { href: '/greenlit', label: 'Product page' },
    media: {
      kind: 'terminal',
      title: 'litci',
      lines: [
        { command: 'litci setup', note: 'only if you need Docker or Podman' },
        { command: 'litci run', note: 'no flags, no image, no config file' },
      ],
    },
  },
];

/** Additional selected public projects, shown as compact cards. */
export const moreRepos: LabRepo[] = [
  {
    slug: 'portfolio',
    name: 'Portfolio',
    tagline: 'Source for this site',
    summary:
      'This site: the Astro source, case studies, and the Coolify container deployment behind shanekanterman.dev.',
    category: 'apps',
    stack: ['Astro', 'TypeScript'],
    language: 'TypeScript',
    status: 'Live',
  },
];

export const allPublicRepos = [...flagshipRepos, ...moreRepos];

export const repoUrl = (repo: Pick<LabRepo, 'slug'>) => `${KANTERLABS_ORG_URL}/${repo.slug}`;

export const languageCount = new Set(allPublicRepos.map((repo) => repo.language)).size;
