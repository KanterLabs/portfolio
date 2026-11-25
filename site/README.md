# Site

Astro frontend for the portfolio site and case-study pages.

## Commands

Run all commands from this directory:

```sh
npm ci
npm run dev
npm run build
npm run preview
```

## Structure

```text
site/
├── public/                 # static assets copied as-is
├── src/
│   ├── assets/             # build-processed assets
│   ├── components/         # reusable Astro components
│   ├── content/            # MDX case studies
│   ├── layouts/            # shared layouts
│   ├── pages/              # routes
│   └── styles/             # global Tailwind/CSS
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Content

Project write-ups live in `src/content/projects/*.mdx` and are rendered by `src/pages/projects/[slug].astro`.

The KanterLabs open-source catalog at `/kanterlabs` is curated in
`src/lib/kanterlabs.ts`. List **public** repositories only:
`tests/kanterlabs.spec.ts` fails if the site links a KanterLabs repository that
is private or missing from that file. Repository media lives in
`src/assets/kanterlabs/` (optimized at build) and `public/kanterlabs/` (video
and theme-matched SVG artwork). Brand colors come from the
[KanterLabs/.github](https://github.com/KanterLabs/.github) brand assets.

The homepage gives infrastructure hiring and product discovery separate routes.
Profile facts live in `src/lib/profile.ts`, selected work pairs project evidence
with media, and the full interactive rack and flagship plates live in the catalog.
Global and drawing styles are split by responsibility; their entry files preserve
the shared cascade order.

## What I'm working on

The homepage's "What I'm working on" sheet renders `src/data/working-on.json`,
which is regenerated every night on the dev host and merged into `beta`:

- `scripts/working_on.py` reads T3 Code's state database and each project's
  git checkout, read-only. A day counts when Shane sent a message in that
  project's T3 threads or committed to it. Only dates leave T3. Each day
  gets an intensity level: 1 for a day worked without commits, then 2-4 as
  that day's commit count reaches 1, 3 and 10.
- Projects are ordered by days worked this week, then commits this week.
  The top three get cards; the rest share an "Also this month" line.
- "Done this week" items are Shane's own `feat`/`fix` commits (or plain
  subjects that aren't bookkeeping). Subjects naming sites, hosts, sizes,
  credentials or anything private are dropped, because most source repos
  are private. Projects and their page links live in
  `scripts/working_on_projects.json`; never add a private repository URL.
  Its `titles` map renames (string) or hides (`null`) a title that only makes
  sense inside a project or repeats another project's item.
- Dates render as absolute days ("Nov 25"). A small script switches them to
  "today"/"yesterday" from the viewer's own clock, so production stays
  truthful even when it is deployed less often than beta.
- `scripts/working_on_nightly.sh` runs from the `portfolio-working-on`
  systemd user timer (`scripts/systemd/`, installed with the script copied
  to `~/.local/libexec/portfolio-working-on-nightly.sh`). It keeps its own
  clone. `beta` is protected, so a changed refresh is a one-file commit
  force-pushed to `chore/working-on-refresh`; `scripts/working_on_publish.py`
  opens or updates that PR and queues it to merge once the required
  Validate Portfolio checks pass, which is a normal beta deploy. A refresh
  that fails CI stays open and is replaced the next night.
- `src/lib/workingOn.ts` validates the file at build time, so a malformed
  refresh fails CI instead of shipping.

## Build Output

`npm run build` writes the static site to `dist/`.
