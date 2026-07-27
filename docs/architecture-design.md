# Portfolio Architecture Design

## Current topology

The portfolio is a static Astro site hosted on Kantercloud. Public traffic and application workload are intentionally separated:

```text
Internet
   |
Cloudflare DNS, CDN, and Full (strict) TLS
   |
Shared edge VM — Caddy on the public edge
   |
Private Kantercloud network
   |
portfolio LXC — Nginx serving static Astro releases
```

Cloudflare remains the public entry point. The shared edge VM owns public ports 80 and 443, certificates, redirects, compression, and security headers. The portfolio LXC has no public address and accepts HTTP only from approved infrastructure addresses.

The beta path is deliberately separate:

```text
Approved owner email
   |
Cloudflare Access and proxied beta DNS
   |
Dedicated outbound Cloudflare Tunnel
   |
portfolio LXC — Nginx beta virtual host
```

The tunnel runs inside the portfolio LXC and connects only to loopback Nginx.
There is no beta route on the public Caddy edge, no new inbound firewall rule,
and no public-origin fallback around Access. The connector validates the Access
JWT before proxying a request.

## Workload isolation

The origin is an unprivileged Debian LXC sized for a static workload. Nginx serves `/srv/portfolio/current`, which is a symlink to a commit-addressed release. The container runs neither Docker nor Tailscale; remote administration and deployment reach it through the existing Kantercloud subnet router.

The origin exposes `/healthz` for infrastructure checks. Its deny-by-default firewall permits:

- SSH from the Kantercloud subnet router
- HTTP from the shared edge, approved monitoring, and the Proxmox host
- established traffic, loopback, and required ICMP

## Delivery

Pull requests build and run the browser test suite on GitHub-hosted runners. A successful push to `main` creates the same artifact, joins the tailnet with an ephemeral workload identity, and sends the archive through a forced-command SSH key.

The deploy command validates the commit SHA and archive, extracts into a temporary directory, switches the `current` symlink atomically, verifies local HTTP, and retains five releases. A failed health check restores the previous symlink. A manual rollback selects any retained commit SHA.

Production and beta use different forced-command SSH keys, Unix accounts,
release roots, locks, and retained-release sets. The server maps the
authenticated account to its fixed root and hostname; the workflow cannot
choose a different target in its SSH command.

## TLS and public routing

Cloudflare uses Full (strict) mode to verify the certificate Caddy obtains for `shanekanterman.dev`. The zone requires TLS 1.2 or newer from visitors. `www.shanekanterman.dev` redirects to the canonical apex hostname.

`beta.shanekanterman.dev` is a proxied CNAME to the dedicated tunnel. Its
self-hosted Access application allows the same single owner email as Stashlet
through one-time PIN authentication, keeps a seven-day session, and is hidden
from the application launcher. Nginx adds no-index headers and serves a
deny-all `robots.txt` on beta.

The previous Cloudflare Load Balancer is temporarily retained as a rollback switch. Its GCP origin is disabled, and the underlying proxied A record already targets Kantercloud. After the rollback window, the single-origin load balancer can be removed without changing the public address.

## Recovery

- Application rollback: activate one of the five retained release SHAs.
- Beta rollback: dispatch the deployment workflow from `beta` and activate one
  of beta's independently retained release SHAs.
- Container recovery: restore the nightly Proxmox snapshot or rebuild from the tracked configuration.
- Edge recovery: validate and reload the tracked Caddy route; do not run Tailscale inside the workload LXC.
- Beta tunnel recovery: rotate only the tunnel token, reinstall the hardened
  connector service, and validate the Access redirect before changing DNS.
- Temporary infrastructure rollback: re-enable the retained GCP origin and return Cloudflare origin mode to Flexible because that legacy origin does not serve HTTPS.

## Architecture evolution

The first production version used two GCP `e2-micro` origins and a Cloudflare Load Balancer. By the end of its life only one origin remained enabled. The Kantercloud migration trades nominal multi-zone redundancy for an honest, lower-cost design with clearer isolation, atomic delivery, private origin access, verified origin TLS, and local recovery.
