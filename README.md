# Shane Kanterman Portfolio

Static Astro portfolio plus the deployment configuration and documentation for its Kantercloud production environment.

## Repository Structure

- `site/`: Astro application, case studies, tests, and public assets
- `infrastructure/kantercloud/`: Nginx, firewall, SSH, and atomic-release configuration
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

Cloudflare terminates public traffic and connects to the shared `kanter-edge` Caddy VM with Full (strict) TLS. Caddy proxies the portfolio over Kantercloud's private network to a dedicated unprivileged Debian LXC running Nginx. The LXC does not run Tailscale or Docker.

GitHub-hosted Actions runners build and test the site. After a successful push to `main`, a repository-scoped self-hosted runner retrieves the deploy key from Infisical and sends the release archive over the existing private route to a restricted deploy account. Releases are stored by commit SHA and activated with an atomic symlink swap.

See `docs/architecture-design.md` and `docs/setup-checklist.md` for the topology, validation order, and rollback procedure.
