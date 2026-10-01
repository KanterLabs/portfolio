# Shane Kanterman Portfolio

Static Astro portfolio plus the deployment configuration and documentation for
its Coolify-hosted production site and private beta environment.

## Repository Structure

- `site/`: Astro application, case studies, tests, and public assets
- `chat-worker/`: Cloudflare Worker for the Luna-backed portfolio assistant
- `chat-content/`: reviewed public facts and chatbot scope cases
- `infrastructure/kantercloud/`: OVH-origin Nginx, TLS, firewall, SSH, and release configuration
- `infrastructure/homelab/`: homelab-origin Nginx, firewall, SSH, and origin settings
- `infrastructure/archive/gcp/`: retired two-origin GCP design retained as migration history
- `docs/`: current architecture and recovery checklist
- `.github/workflows/deploy.yml`: validation, image publishing, and Coolify deployment

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

Production runs as a digest-pinned container in Coolify on the OVH app host.
Cloudflare proxies `shanekanterman.dev` to it through a Cloudflare Tunnel, so
the host accepts no inbound web traffic. The chatbot remains a separate
production-only Cloudflare Worker.

KanterLabs GitHub Actions uses `homelab-heavy` for the browser suite and image
build, and `homelab` for validation and deployment orchestration. ARC creates a
fresh runner pod for each job.

See the
[canonical runner runbook](https://github.com/KanterLabs/infrastructure/tree/main/homelab/ci-runners)
for ARC, runner, and tier definitions.

See `docs/coolify-deploy.md` for the deployment transaction, credentials, and
rollback drill.
See `docs/chatbot.md` for the chatbot boundary, OpenAI secret setup,
validation, and rollback procedure.

## Beta and promotion

Feature branches merge into the protected `beta` branch. Every successful
`beta` push publishes an immutable image and deploys that digest to the private
beta application at `https://beta.home.shanekanterman.dev`, which has no public
DNS record. A pull request from `beta` to `main` runs the same suite again.
After the merge, the `main` push publishes a new image and deploys its digest
to production. Both deploy jobs verify the served revision and restore the
previous digest automatically if verification fails.

The production Cloudflare Worker and shared D1 database remain
production-only; beta builds validate Worker code but do not create a public
beta Worker.
