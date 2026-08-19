# Shane Kanterman Portfolio

Static Astro portfolio plus the deployment configuration and documentation for
its Kantercloud production and Access-protected beta environments.

## Repository Structure

- `site/`: Astro application, case studies, tests, and public assets
- `chat-worker/`: Cloudflare Worker for the Luna-backed portfolio assistant
- `chat-content/`: reviewed public facts and chatbot scope cases
- `infrastructure/kantercloud/`: Nginx, firewall, SSH, atomic-release, and beta tunnel configuration
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

Cloudflare terminates public traffic and connects to a shared Caddy edge VM with Full (strict) TLS. Caddy proxies the portfolio over Kantercloud's private network to a dedicated unprivileged Debian LXC running Nginx. The LXC does not run Tailscale or Docker.

KanterLabs GitHub Actions uses the `homelab` micro tier for both build/test and
deployment. ARC creates a fresh runner pod for each job; the runner uses the
production environment's deploy key to send the release archive over the
existing private route to a restricted deploy account, then disappears.
Releases are stored by commit SHA and activated with an atomic symlink swap.

The portfolio remains on the micro tier because its current workflow is short
and not sustained CPU-bound. See the
[canonical runner runbook](https://github.com/KanterLabs/infrastructure/tree/main/homelab/ci-runners)
for ARC, runner, and tier definitions.

See `docs/architecture-design.md` and `docs/setup-checklist.md` for the topology, validation order, and rollback procedure.
See `docs/chatbot.md` for the chatbot boundary, OpenAI secret setup,
validation, and rollback procedure.

## Beta promotion

Feature branches merge into the protected `beta` branch. Every successful
`beta` push deploys an isolated release to
`https://beta.shanekanterman.dev`, which is available only through
owner-email Cloudflare Access. A pull request from `beta` to `main` runs the
same browser suite again; merging it triggers the normal production deployment.

Beta uses its own GitHub environment, SSH key, Unix deployment account, release
root, lock, and rollback history. The beta workflow therefore cannot activate a
production release. Select `beta` or `main` when manually dispatching the
workflow to target that environment's retained releases.
