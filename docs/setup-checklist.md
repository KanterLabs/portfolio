# Kantercloud Portfolio Operations Checklist

## Build and release

- [ ] `npm ci`, `npm run build`, and Playwright pass
- [ ] Tailscale workload identity is configured before setting the production `DEPLOY_ENABLED` variable to `true`
- [ ] the release archive contains `index.html`, project pages, sitemap, resume, and hashed assets
- [ ] the deploy identity can run only `deploy <sha>` or `rollback <sha>`
- [ ] `/srv/portfolio/current` points at the intended commit
- [ ] local `/` and `/healthz` return HTTP 200

## Origin and edge

- [ ] the LXC is unprivileged, starts on boot, and runs Nginx, SSH, and nftables
- [ ] no Tailscale or Docker service exists in the LXC
- [ ] Nginx and Caddy configuration validation succeeds before reload
- [ ] edge-to-origin HTTP works over the private network
- [ ] direct edge HTTPS presents a valid certificate for the requested hostname

## Public validation

- [ ] Cloudflare SSL mode is Full (strict) and minimum TLS is 1.2
- [ ] apex HTTP redirects to HTTPS
- [ ] `www` redirects to the apex hostname
- [ ] homepage, case studies, 404, sitemap, robots, resume, and assets load
- [ ] Homebase reports both public portfolio and private origin healthy

## Recovery

- [ ] a known retained SHA can be activated and reversed
- [ ] the nightly Proxmox job includes the portfolio LXC
- [ ] a fresh snapshot archive completes without errors
- [ ] the LXC recovers after reboot without manual service starts
- [ ] the disabled GCP origin remains documented until the rollback window closes
