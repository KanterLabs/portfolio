# Multi-Node Server

Portfolio project with a static Astro frontend, infrastructure-as-code for cloud deployment, and supporting architecture documentation.

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
├── site/
│   ├── public/
│   ├── src/
│   ├── astro.config.mjs
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Directories

- `site/`: Astro frontend and project case-study content
- `infrastructure/terraform/`: Google Cloud infrastructure definitions and startup scripts
- `docs/`: architecture notes, diagrams, and setup checklists
- `.github/workflows/`: CI/CD deployment workflow

## Local Development

Run the frontend from the `site/` directory:

```sh
cd site
npm ci
npm run dev
```

Build locally:

```sh
cd site
npm run build
```

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds the Astro app from `site/`, archives the generated `dist/` output, and deploys it to both origin VMs.
