# Kantercloud Portfolio Operations Checklist

## Build and release

- [ ] `npm ci`, `npm run build`, and Playwright pass
- [ ] pull requests into `beta` pass `build-and-test`
- [ ] pull requests into `main` also pass `promotion-source` and originate from this repository's `beta` branch
- [ ] the repository-scoped `portfolio-deploy` runner is online before setting the repository `DEPLOY_ENABLED` variable to `true`
- [ ] `BETA_DEPLOY_ENABLED` can stop beta independently of production
- [ ] `PORTFOLIO_DEPLOY_SSH_KEY` is readable from the Infisical `prod` environment on the runner
- [ ] the `beta` GitHub environment contains only the beta deploy key and permits only the `beta` branch
- [ ] the pinned key in `infrastructure/kantercloud/portfolio-known-hosts` matches the portfolio LXC SSH host key
- [ ] the release archive contains `index.html`, project pages, sitemap, resume, and hashed assets
- [ ] the deploy identity can run only `deploy <sha>` or `rollback <sha>`
- [ ] `/srv/portfolio/current` points at the intended commit
- [ ] `/srv/portfolio-beta/current` points at the intended beta commit
- [ ] local `/` and `/healthz` return HTTP 200

## Origin and edge

- [ ] the LXC is unprivileged, starts on boot, and runs Nginx, SSH, and nftables
- [ ] no Tailscale or Docker service exists in the LXC
- [ ] Nginx and Caddy configuration validation succeeds before reload
- [ ] edge-to-origin HTTP works over the private network
- [ ] direct edge HTTPS presents a valid certificate for the requested hostname
- [ ] `cloudflared-beta.service` runs as the unprivileged connector account and has healthy tunnel connections
- [ ] no beta hostname exists in the public Caddy configuration

## Public validation

- [ ] Cloudflare SSL mode is Full (strict) and minimum TLS is 1.2
- [ ] apex HTTP redirects to HTTPS
- [ ] `www` redirects to the apex hostname
- [ ] homepage, case studies, 404, sitemap, robots, resume, and assets load
- [ ] Homebase reports both public portfolio and private origin healthy
- [ ] unauthenticated beta requests redirect to Cloudflare Access
- [ ] the owner email can authenticate by one-time PIN and all other emails remain denied
- [ ] beta responds with `X-Robots-Tag: noindex, nofollow, noarchive`
- [ ] beta `robots.txt` disallows all crawling

## Recovery

- [ ] a known retained SHA can be activated and reversed
- [ ] beta rollback changes only `/srv/portfolio-beta/current`
- [ ] the nightly Proxmox job includes the portfolio LXC
- [ ] a fresh snapshot archive completes without errors
- [ ] the LXC recovers after reboot without manual service starts
- [ ] the disabled GCP origin remains documented until the rollback window closes

## Beta bootstrap and token rotation

- [ ] run `cloudflare-beta.sh prepare` from a trusted machine using the Infisical Cloudflare API token
- [ ] install the generated tunnel token as `/etc/portfolio-beta/cloudflared.token` with mode `0640`, owner `root`, and group `cloudflared`
- [ ] validate and start the connector before publishing beta DNS
- [ ] run `cloudflare-beta.sh publish` only after the initial beta release responds locally
- [ ] run `cloudflare-beta.sh validate` after DNS propagation
- [ ] never place the account API token or tunnel token in Git, GitHub workflow logs, or the public edge configuration
