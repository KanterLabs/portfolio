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

## Build Output

`npm run build` writes the static site to `dist/`.
