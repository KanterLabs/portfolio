# Portfolio Architecture Design

## Current topology

The public and private-candidate planes are deployed to two verified HTTPS
origins with independent ingress and deployment boundaries:

```text
Internet -> Cloudflare CDN/TLS -> dual-origin load balancer
                               -> OVH Caddy -> private-CA HTTPS -> OVH Nginx
                               -> homelab ingress -> private-CA HTTPS -> homelab Nginx

CI runner -> 10.40.0.32:22 -> OVH forced-command deploy helper
          -> 10.0.0.101 jump host -> 10.0.30.13:22 -> homelab helper
```

The preview vhosts have no public DNS, Funnel, Cloudflare Access application,
Cloudflare Tunnel, or public Worker. Public traffic cannot reach either preview
vhost, and deployment traffic never uses either ingress plane.

## Workload isolation

Each origin serves production from
`/srv/portfolio/current` and the private candidate from
`/srv/portfolio-beta/current`; both are symlinks to immutable, commit-addressed
releases. The container runs neither Docker nor Tailscale.

The OVH origin listens only on `10.40.30.32:443`; the homelab origin listens
only on `10.0.30.13:443`. Both deny-by-default nftables policies permit only
the reviewed management and ingress peers. Production and preview use separate
SNI and Host identities on each origin certificate.

## Delivery and promotion

Browser work runs on `homelab-heavy`; validation and deploy orchestration run
on `homelab`. A `beta` push uploads an archive over the management network to
the candidate-only forced-command account. The deploy helper rejects malformed
archives, path traversal, links, special files, digest mismatches, and commands
outside its fixed lifecycle grammar.

Each candidate stores its archive digest, tree digest, and index digest in an
immutable manifest. After a validated `beta` pull request merges to `main`, the
main workflow stages its tested artifact through both private candidate accounts
and verifies the SHA and content on each origin. Both production helpers then
revalidate and prepare that exact digest before either origin activates it. If
either activation fails, the workflow restores both origins to their recorded
previous release. Candidate and production have separate Unix accounts, release
roots, locks, and rollback histories. Manual dispatch remains available for an
explicit retained-release rollback.

## TLS and routing

Cloudflare uses Full (strict) mode and health-checks both public origins.
`www.shanekanterman.dev` redirects to the canonical apex. The OVH edge connects
to `10.40.30.32:443` with SNI `portfolio-origin.kantercloud.internal`; the
homelab ingress connects to `10.0.30.13:443` with SNI
`portfolio-origin.homelab.internal`. Both trust the tracked Portfolio origin CA.

The preview vhosts use the corresponding preview SNI name. They add no-index
headers and a deny-all `robots.txt` and are not registered as load-balancer
origins.

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
