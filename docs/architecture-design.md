# Portfolio Architecture Design

## Current topology

The static portfolio runs as digest-pinned Nginx containers in separate beta
and production Coolify applications on the OVH app host.

Production requests pass through Cloudflare and a remotely managed Cloudflare
Tunnel to the production application's loopback port. The host's inbound web
ports remain closed. The retired static-origin load balancer is disabled;
it is an emergency recovery option, not active production failover.

Beta uses the private `beta.home.shanekanterman.dev` hostname with no public
DNS record. Protected deploy jobs use the tailnet to reach Coolify and verify
beta. They do not expose a deployment listener through the public site.

## Delivery and promotion

GitHub Actions validates the site and Worker, runs browser and dependency
checks, builds and smoke-tests the container, and publishes it to GHCR.
Coolify receives the exact image digest and does not build source itself.

A beta push deploys to the beta application. Production promotion must come
from beta to main; the main workflow repeats validation and publishes its own
commit-tagged image. Each lane has separate application identifiers,
credentials, and a protected GitHub environment. The deployment job refuses
to deploy a commit that is no longer the branch tip.

The deployment helper validates the application identity and target, records
the previous digest, starts the deployment, and requires Coolify health,
`/healthz`, and `/_meta/revision` to match the requested release. A failure
after mutation restores and redeploys the previous digest.

See [Coolify deployment](coolify-deploy.md) for the transaction, lane settings,
credential ownership, and rollback validation procedure. The checked-in
workflow is the authority for current runner configuration.

## Production chatbot and data preservation

`portfolio-chat` remains a separate production-only Cloudflare Worker bound
to the retained `portfolio-chat-history` D1 database. Site CI validates its
package but does not deploy the Worker. Updating reviewed knowledge requires
a separate production Worker deployment and health verification.

Worker rollback does not delete D1 history or reverse migrations. Site image
rollback does not touch the database. Database restoration is a separate
recovery operation requiring an explicit target and authorization.

## Historical deployments

Earlier revisions used static Nginx origins on GCP, then OVH and the homelab,
with load balancing and coordinated artifact promotion. Legacy origin
configuration remains recovery/history material; it does not describe the
active Coolify release path. GCP history is under `infrastructure/archive/gcp`.
