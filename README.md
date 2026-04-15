# Multi-Node Server

Portfolio repository for a static Astro site, the infrastructure used to deploy it, and the supporting documentation behind the architecture.

## Repository Structure

```text
multi-node-server/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── docs/
│   ├── architecture-design.md
│   ├── architecture-diagram.svg
│   └── setup-checklist.md
├── infrastructure/
│   └── terraform/
└── site/
    ├── public/
    ├── src/
    ├── astro.config.mjs
    ├── package.json
    └── tsconfig.json
```

## What Is Here

- `site/`: the Astro portfolio site and case-study content
- `infrastructure/terraform/`: Terraform configuration and startup script for the origin VMs
- `docs/`: architecture notes and setup reference material
- `.github/workflows/deploy.yml`: build and deployment workflow for the site

## Local Development

From `site/`:

```sh
npm ci
npm run dev
```

Build locally:

```sh
npm run build
```

## Deployment Summary

The site is built from `site/` and deployed to two Google Cloud VM origins. Cloudflare sits in front for DNS, CDN, TLS, and load balancing.

The GitHub Actions workflow:

1. installs dependencies
2. builds the Astro site
3. archives the generated `dist/` output
4. copies the build artifact to both origins
5. reloads Nginx on each server

## Why This Repo Exists

The site is intentionally simple at the application layer. The main point of the repository is to show how the site is deployed, how the infrastructure is organized, and how the written case studies connect software work to operations and delivery.
