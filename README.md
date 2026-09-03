# Shane Kanterman Portfolio

Static Astro portfolio plus the deployment configuration and documentation for
its dual-origin production site and private candidate environment.

## Repository Structure

- `site/`: Astro application, case studies, tests, and public assets
- `chat-worker/`: Cloudflare Worker for the Luna-backed portfolio assistant
- `chat-content/`: reviewed public facts and chatbot scope cases
- `infrastructure/kantercloud/`: OVH-origin Nginx, TLS, firewall, SSH, and release configuration
- `infrastructure/homelab/`: homelab-origin Nginx, firewall, SSH, and origin settings
- `infrastructure/archive/gcp/`: retired two-origin GCP design retained as migration history
- `docs/`: current architecture and recovery checklist
- `.github/workflows/deploy.yml`: validation and private production deployment

## Local Development

```sh
cd site
npm ci
npm run dev
```

Build and test:

```sh
npm run build
npx playwright install chromium
npm run test:e2e
```

## Production

Cloudflare terminates visitor traffic and load-balances across the OVH and
homelab origins. Each origin uses a private-CA HTTPS certificate and serves the
same immutable release; public ingress never acts as the deployment path. The
origins do not run Tailscale, Docker, or a Cloudflare Tunnel.

KanterLabs GitHub Actions uses `homelab-heavy` for the browser suite and
`homelab` for validation and deployment orchestration. ARC creates a fresh
runner pod for each job. Deployment archives and forced-command control traffic
use private management routes to both origins (`10.40.0.32` for OVH and
`10.0.30.13` through the homelab jump host); public ingress is never used as a
deployment path. Releases are stored immutably by commit SHA and artifact
digest, then activated with an atomic symlink swap on both origins.

See the
[canonical runner runbook](https://github.com/KanterLabs/infrastructure/tree/main/homelab/ci-runners)
for ARC, runner, and tier definitions.

See `docs/architecture-design.md` and `docs/setup-checklist.md` for the topology, validation order, and rollback procedure.
See `docs/chatbot.md` for the chatbot boundary, OpenAI secret setup,
validation, and rollback procedure.

## Private candidate promotion

Feature branches merge into the protected `beta` branch. Every successful
`beta` push deploys an isolated release to
the isolated preview vhost on both origins. It has no public DNS record,
Cloudflare Access application, Tunnel, or Funnel. A pull request from `beta`
to `main` runs the same browser suite again.
Production activation is an explicit workflow dispatch that promotes the exact
privately verified candidate SHA and artifact digest.

The candidate lane uses its own GitHub environment, SSH key, Unix deployment
account, release root, lock, and rollback history. It cannot activate a
production release. The production Cloudflare Worker and shared D1 database
remain production-only; candidate builds validate Worker code but do not create
a public beta Worker.
