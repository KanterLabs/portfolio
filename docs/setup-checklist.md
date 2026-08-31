# Kantercloud Portfolio Operations Checklist

## Build and release

- [ ] `npm ci`, the Worker validation suite, and the Playwright suite pass
- [ ] pull requests into `beta` pass validation without publishing a public beta service
- [ ] pull requests into `main` originate from this repository's `beta` branch
- [ ] `BETA_DEPLOY_ENABLED` can stop private candidate deployment independently
- [ ] the `beta` and `production` environments contain only their scoped deploy keys
- [ ] the pinned host key matches the portfolio LXC SSH host key
- [ ] deployment uploads and forced commands use `10.40.0.32:22`
- [ ] the deploy helper accepts only immutable deploy, exact promotion, retained rollback, and digest verification commands
- [ ] `/srv/portfolio-beta/current` is the intended private candidate SHA
- [ ] production promotion names the exact candidate SHA and artifact SHA-256
- [ ] `/srv/portfolio/current` is the intended production SHA

## Origin and edge

- [ ] the unprivileged LXC starts on boot and runs Nginx, SSH, and nftables
- [ ] the LXC has no Tailscale, Docker, Cloudflare Tunnel, or public beta service
- [ ] Nginx has no TCP 80 listener and binds HTTPS only on `10.40.30.32:443`
- [ ] nftables allows SSH only from `10.40.0.1` and origin HTTPS only from `10.40.30.2`
- [ ] the OVH edge verifies `portfolio-origin.kantercloud.internal` with the private CA
- [ ] the Tailnet preview verifies `portfolio-preview-origin.kantercloud.internal` with the same private CA
- [ ] the Proxmox-hosted `portfolio-origin-cert.timer` is enabled and its live certificate check passes
- [ ] Caddy and Nginx validation succeeds before every reload

## Public validation

- [ ] apex HTTP redirects to HTTPS
- [ ] `www` redirects to the canonical apex hostname
- [ ] homepage, case studies, 404, sitemap, robots, resume, and hashed assets load
- [ ] `/healthz` returns `ok`
- [ ] `/api/chat/health` reports the production Worker
- [ ] unknown hosts, unknown paths, and direct-origin access fail closed

## Private candidate validation

- [ ] `https://kanter-edge.tail848b9c.ts.net:9445` is reachable from a Tailnet client
- [ ] Tailscale reports the `:9445` Serve entry as tailnet-only with no Funnel
- [ ] the candidate index digest matches the uploaded artifact manifest
- [ ] `X-Robots-Tag` is present and `robots.txt` disallows crawling
- [ ] `beta.shanekanterman.dev` has no public DNS, Access application, Tunnel, or Worker

## Recovery

- [ ] a retained candidate SHA can be activated and reversed without changing production
- [ ] a retained production SHA can be activated and reversed without changing the candidate lane
- [ ] the nightly Proxmox job includes LXC 202 and its latest archive verifies
- [ ] the private origin CA has an encrypted recovery copy and an isolated restore drill passes
- [ ] the LXC recovers after restart with Nginx, nftables, SSH, and private HTTPS healthy
- [ ] the edge route lifecycle retains a verified last-known-good transaction
