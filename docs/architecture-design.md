# Portfolio Architecture Design

## Current topology

The public and private-candidate planes share one verified HTTPS origin but
have independent ingress and deployment boundaries:

```text
Internet -> Cloudflare CDN/TLS -> OVH Caddy public listener
                               -> private-CA HTTPS on VLAN 130
                               -> portfolio Nginx production vhost

Tailnet client -> Tailscale Serve HTTPS :9445 -> loopback Caddy :19445
                                              -> private-CA HTTPS on VLAN 130
                                              -> portfolio Nginx preview vhost

CI runner -> management route -> 10.40.0.32:22 -> forced-command deploy helper
```

The Tailnet preview has no public DNS, Funnel, Cloudflare Access application,
Cloudflare Tunnel, or public Worker. Public traffic cannot reach the preview
vhost, and deployment traffic never uses either ingress plane.

## Workload isolation

The origin is an unprivileged Debian LXC. Nginx serves production from
`/srv/portfolio/current` and the private candidate from
`/srv/portfolio-beta/current`; both are symlinks to immutable, commit-addressed
releases. The container runs neither Docker nor Tailscale.

Nginx listens only on `10.40.30.32:443`. Its deny-by-default nftables policy
permits management SSH from `10.40.0.1` and origin HTTPS from the edge address
`10.40.30.2`; it has no TCP 80 allowance or listener. Production and preview
use separate SNI and Host identities on the same origin certificate.

## Delivery and promotion

Browser work runs on `homelab-heavy`; validation and deploy orchestration run
on `homelab`. A `beta` push uploads an archive over the management network to
the candidate-only forced-command account. The deploy helper rejects malformed
archives, path traversal, links, special files, digest mismatches, and commands
outside its fixed lifecycle grammar.

Each candidate stores its archive digest, tree digest, and index digest in an
immutable manifest. Production activation is an explicit dispatch from `main`
that names the exact privately verified candidate SHA and archive SHA-256. The
helper revalidates the candidate and adopts that same artifact; it does not
rebuild or re-upload a production copy. Candidate and production have separate
Unix accounts, release roots, locks, and rollback histories.

## TLS and routing

Cloudflare uses Full (strict) mode to the OVH Caddy edge.
`www.shanekanterman.dev` redirects to the canonical apex. Caddy connects to
`10.40.30.32:443` with SNI `portfolio-origin.kantercloud.internal`, a fixed
Host header, and the tracked Portfolio origin CA.

The Tailnet-only Serve entry terminates the client certificate for
`kanter-edge.tail848b9c.ts.net`, hands off on edge loopback, and then uses SNI
`portfolio-preview-origin.kantercloud.internal` to reach the preview vhost.
The preview adds no-index headers and a deny-all `robots.txt`.

The private origin leaf is issued for exactly the two internal names by a
root-only CA on the Kantercloud Proxmox host. A daily systemd timer checks the
chain, SAN set, key pairing, remaining lifetime, guest trust root, and Nginx
configuration, and renews atomically when required.

## Production chatbot

`portfolio-chat` remains a production-only Cloudflare Worker bound to the
retained `portfolio-chat-history` D1 database. Candidate CI validates the
Worker package but does not publish a beta Worker. Worker release and rollback
remain an explicit production-provider operation, separate from the static
artifact promotion described above.

## Recovery

- Candidate rollback changes only `/srv/portfolio-beta/current`.
- Production rollback changes only `/srv/portfolio/current`.
- The edge route lifecycle retains a validated last-known-good Caddy, nftables,
  and Tailscale Serve transaction.
- LXC 202 has a verified Proxmox archive; the origin CA also has an encrypted
  recovery copy and an isolated restore proof.
- The retired public beta unit and connector token are preserved only in the
  root-only retirement backup. Restoring them would be an explicit rollback,
  not an automatic fallback.

## Retired paths

The prior `beta.shanekanterman.dev` CNAME, Access application, named Tunnel,
`portfolio-chat-beta` Worker, connector service, token, binary, and service
account are deleted. The earlier GCP topology remains documentation-only under
`infrastructure/archive/gcp`; it is not part of the active release path.
