# Dual-Origin Portfolio Operations Checklist

## Build and release

- [ ] `npm ci`, the Worker validation suite, and the Playwright suite pass
- [ ] pull requests into `beta` pass validation without publishing a public beta service
- [ ] pull requests into `main` originate from this repository's `beta` branch
- [ ] `BETA_DEPLOY_ENABLED` can stop private candidate deployment independently
- [ ] the `beta` and `production` environments contain only their scoped deploy keys
- [ ] the pinned host key matches the portfolio LXC SSH host key
- [ ] deployment uploads and forced commands reach OVH at `10.40.0.32:22` and homelab at `10.0.30.13:22` through the reviewed jump host
- [ ] the deploy helper accepts only immutable deploy, exact promotion, retained rollback, and digest verification commands
- [ ] both `/srv/portfolio-beta/current` links name the intended private candidate SHA
- [ ] production promotion names the exact candidate SHA and artifact SHA-256
- [ ] both `/srv/portfolio/current` links name the intended production SHA

## Origin and edge

- [ ] both origins start Nginx, SSH, and nftables without a public beta service
- [ ] neither origin runs Tailscale, Docker, or a Cloudflare Tunnel
- [ ] OVH Nginx binds HTTPS only on `10.40.30.32:443`; homelab Nginx binds HTTPS only on `10.0.30.13:443`
- [ ] each nftables policy allows only its reviewed management and ingress peers
- [ ] OVH validates `portfolio-origin.kantercloud.internal` and homelab validates `portfolio-origin.homelab.internal` with the private CA
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

- [ ] neither preview origin is a public or load-balanced backend
- [ ] the candidate index digest matches the uploaded artifact manifest
- [ ] `X-Robots-Tag` is present and `robots.txt` disallows crawling
- [ ] `beta.shanekanterman.dev` has no public DNS, Access application, Tunnel, or Worker

## Recovery

- [ ] a retained candidate SHA can be activated and reversed without changing production
- [ ] a retained production SHA can be activated and reversed without changing the candidate lane
- [ ] both origin backups and their latest archives verify
- [ ] the private origin CA has an encrypted recovery copy and an isolated restore drill passes
- [ ] each origin recovers after restart with Nginx, nftables, SSH, and private HTTPS healthy
- [ ] the edge route lifecycle retains a verified last-known-good transaction
