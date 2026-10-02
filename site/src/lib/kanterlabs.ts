import type { ImageMetadata } from 'astro';
import actionViewMenu from '../assets/kanterlabs/actionview-menu.png';
import zeusDesktop from '../assets/kanterlabs/zeusos-desktop.jpg';

/**
 * The public KanterLabs catalog shown on the homepage.
 *
 * Curated and checked in on purpose rather than fetched from the GitHub API
 * at build time: builds stay deterministic on ephemeral CI pods, a rate limit
 * can never fail a release, and every line of copy here is reviewed. Each
 * summary is drawn from that repository's own README.
 *
 * Only PUBLIC repositories belong in this file. tests/kanterlabs.spec.ts
 * fails the build if the page links any KanterLabs repository that is not
 * listed here, so a private repo can't leak in through a stray link.
 */

export const KANTERLABS_ORG_URL = 'https://github.com/KanterLabs';
export const HOSTLET_CLOUD_URL = 'https://hostlet.cloud';
export const HELM_CASE_STUDY_URL = '/projects/helm';

export type LabCategory = 'platforms' | 'devtools' | 'desktop' | 'apps';

export const categoryLabels: Record<LabCategory, string> = {
  platforms: 'Self-hosted platform',
  devtools: 'Developer tool',
  desktop: 'Desktop & OS',
  apps: 'App & experiment',
};

export const studioPillars = [
  {
    title: 'Developer tools',
    body: 'Software that makes delivery faster and easier to inspect.',
  },
  {
    title: 'Self-hosted platforms',
    body: 'Deployment and operations you own and can understand end to end.',
  },
  {
    title: 'Practical apps',
    body: 'Desktop and web software that runs on the platform under real constraints.',
  },
];

export type LabMedia =
  | { kind: 'image'; src: ImageMetadata; alt: string; fit: 'cover' | 'contain'; position?: string }
  | { kind: 'themed-image'; light: string; dark: string; alt: string; width: number; height: number }
  | { kind: 'video'; mp4: string; webm: string; poster: string; alt: string; width: number; height: number }
  | { kind: 'terminal'; title: string; lines: { command?: string; note?: string }[] };

export interface LabRepo {
  slug: string;
  name: string;
  summary: string;
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
    summary:
      'The lead KanterLabs project: a small, self-hosted project board and bug tracker where people and software agents move work together, with a stable, auditable API for scoped agent automation.',
    category: 'platforms',
    stack: ['Go', 'Svelte', 'SQLite', 'Docker'],
    language: 'Go',
    status: 'v0.1.0',
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
    slug: 'hostlet-core',
    name: 'Hostlet Core',
    summary:
      'Turn GitHub repositories into live apps on your own Linux server: builds, containers, routing, health checks, and rollback. The open-source engine behind hostlet.cloud.',
    category: 'platforms',
    stack: ['Rust', 'Next.js', 'PostgreSQL', 'Caddy'],
    language: 'Rust',
    status: 'Pre-1.0 beta',
    license: 'MIT',
    caseStudy: { href: '/projects/hostlet', label: 'Case study' },
    site: { href: HOSTLET_CLOUD_URL, label: 'hostlet.cloud' },
    media: {
      kind: 'terminal',
      title: 'hostlet',
      lines: [
        { command: 'hostlet preflight' },
        { command: 'hostlet init' },
        { command: 'hostlet up --tunnel' },
        { note: 'open the printed URL, connect GitHub, deploy an app' },
      ],
    },
  },
  {
    slug: 'ActionView',
    name: 'ActionView',
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
    slug: 'zeusos',
    name: 'Zeus OS',
    summary:
      'A focused Fedora bootc laptop desktop with a macOS-inspired layout, original Zeus artwork, signed updates, and native GNOME security and accessibility.',
    category: 'desktop',
    stack: ['Fedora bootc', 'GNOME', 'Python'],
    language: 'Python',
    status: '0.1 preview',
    media: {
      kind: 'image',
      src: zeusDesktop,
      alt: 'Zeus OS desktop: a translucent top bar, the New York at dusk wallpaper, and a floating dock',
      fit: 'cover',
    },
  },
  {
    slug: 'greenlit-app',
    name: 'Greenlit',
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

/** Everything else public, shown as compact cards. */
export const moreRepos: LabRepo[] = [
  {
    slug: 'hostlet-app',
    name: 'Hostlet',
    summary:
      'Professional portfolios and always-running project demos for developers: connect GitHub, deploy supported projects, and publish a portfolio around working demos.',
    category: 'platforms',
    stack: ['JavaScript'],
    language: 'JavaScript',
    status: 'In development',
  },
  {
    slug: 'zeus-code',
    name: 'Zeus Code',
    summary:
      'A terminal workspace for Codex and OpenCode conversations across local and SSH machines. Agents run in a daemon, so closing the client never cancels them.',
    category: 'devtools',
    stack: ['Python', 'TUI'],
    language: 'Python',
    status: 'Active',
  },
  {
    slug: 'linkshare',
    name: 'Linkshare',
    summary:
      'A two-way link inbox for a person and their coding agents: web UI, JSON API, live updates, shipped as one Go binary in an unprivileged Proxmox LXC.',
    category: 'platforms',
    stack: ['Go', 'SQLite'],
    language: 'Go',
    status: 'Active',
  },
  {
    slug: 'pulse',
    name: 'Pulse',
    summary:
      'A fast GNOME command center for Spotify on Fedora, with a Rust daemon and optional headless playback.',
    category: 'desktop',
    stack: ['GJS', 'Rust', 'D-Bus'],
    language: 'JavaScript',
    status: 'Pre-alpha',
    license: 'MIT',
  },
  {
    slug: 'ncspot',
    name: 'ncspot',
    summary: 'A visually expressive fork of the ncspot terminal Spotify client.',
    category: 'desktop',
    stack: ['Rust', 'TUI'],
    language: 'Rust',
    status: 'Fork',
    license: 'BSD-2-Clause',
  },
  {
    slug: 'hostlet-deploy-fixtures',
    name: 'Hostlet deploy fixtures',
    summary:
      'A deterministic application matrix for Hostlet deployment certification: runtimes, managed services, persistence, HTTPS, WebSockets, redeploys, and rollbacks.',
    category: 'devtools',
    stack: ['JavaScript'],
    language: 'JavaScript',
    status: 'Active',
  },
  {
    slug: 'RunComp',
    name: 'RunComp',
    summary:
      'A running-competition app built to test Hostlet on the homelab: private groups, streaks, weekly challenges, and push alerts.',
    category: 'apps',
    stack: ['TypeScript', 'Next.js'],
    language: 'TypeScript',
    status: 'Active',
  },
  {
    slug: 'patchwork-pirates',
    name: 'Patchwork Pirates',
    summary:
      'A co-op auto-combat survival roguelite on a breakable raft. A full design doc, netcode plan, and phased roadmap.',
    category: 'apps',
    stack: ['TypeScript'],
    language: 'TypeScript',
    status: 'Pre-production',
  },
  {
    slug: 'portfolio',
    name: 'Portfolio',
    summary:
      'This site: the Astro source, case studies, and the dual-origin deployment behind shanekanterman.dev.',
    category: 'apps',
    stack: ['Astro', 'TypeScript'],
    language: 'TypeScript',
    status: 'Live',
  },
];

export const allPublicRepos = [...flagshipRepos, ...moreRepos];

export const repoUrl = (repo: Pick<LabRepo, 'slug'>) => `${KANTERLABS_ORG_URL}/${repo.slug}`;

export const languageCount = new Set(allPublicRepos.map((repo) => repo.language)).size;
