# Coolify deployment

Every successful push to `beta` or `main` publishes an immutable GHCR image and
deploys that exact registry digest to the matching Coolify application. Coolify
does not build the repository and the workflow never deploys a mutable branch
tag directly.

| Branch | Job | GitHub environment | Host | Verified route |
| --- | --- | --- | --- | --- |
| `beta` | `deploy-beta` | `beta` | EWR1 | `https://beta.home.shanekanterman.dev` |
| `main` | `deploy-production-pdx1` | `production` | PDX1 | `https://coolify.home.shanekanterman.dev/portfolio-origins/pdx1` |
| `main` | `deploy-production-iad1` | `production` | IAD1 | `https://coolify.home.shanekanterman.dev/portfolio-origins/iad1` |

Gitea is the canonical repository; GitHub is the execution mirror. Each `main`
push builds and smoke-tests one image, then passes the identical digest to PDX1
and IAD1 in that order. The digest is resolved from the pushed commit tag
(`sha-<commit>`), never from the mutable branch tag. Beta deploys independently
to the private EWR1 resource. Same-repository PR events validate without deployment credentials. External
fork PRs cannot schedule these self-hosted jobs; a maintainer must first import
approved changes into the canonical repository.

The caller workflow owns build and rollout ordering. The reusable
`.github/workflows/deploy-coolify.yml` owns the protected environment, private
network connection, target identity and route verification. Metadata and short
checks on trusted branch pushes use `homelab`; container and browser work use
`homelab-heavy`. PR validation and `source-sync/*` dispatches use
`ubuntu-24.04` as an explicit isolation exception. The Portfolio runner group
accepts only the two workflow files at reviewed `main` and `beta` refs;
PR-edited YAML cannot remove this external admission boundary.

## Transaction

Deploys run only for branch pushes and use protected GitHub environments.
The caller's branch concurrency group serializes the entire workflow, including
both production origins. Before the first target changes, the job confirms the
run commit is still the GitHub mirror's branch tip. A stale run skips both
production targets. Once PDX1 succeeds, IAD1 completes the same release even if
`main` advances during rollout; the following workflow then deploys the newer
release. Do not add an independent freshness check before IAD1, which could
leave a started release unfinished.

`scripts/coolify_deploy.py` then:

1. Reads the application and validates its UUID, name, environment,
   destination, server, build pack, port, and current digest shape.
2. Records the current and requested immutable digests and requested revision
   in the job summary before any mutation, including on a failed deployment.
3. Updates the application to the exact digest published by the container job.
4. Starts a Coolify deployment and waits for its deployment record to finish.
5. Requires Coolify health, `/healthz`, and `/_meta/revision` on
   `PORTFOLIO_SITE_URL` to agree with the requested commit. Redirects are refused,
   so an origin cannot accidentally pass verification through the public load
   balancer or another route.
6. Restores and redeploys the previous digest if any post-update step fails.

The beta and production environments hold separate tokens. Production keeps
both target identities in one protected environment so its existing OAuth
credentials remain available to both serial calls. A PDX1 failure
stops IAD1. An IAD1 failure restores IAD1's previous digest while the already
verified PDX1 release remains live. The workflow fails and its two job summaries
retain the digest evidence; it does not report a successful two-origin release.
A later run retries both origins, and an already-current target is verified
without an unnecessary redeployment.

## Private verification and ingress

Beta remains available only through Tailscale and private split DNS. Production
serves the public apex and `www` through the PDX1/IAD1 ingress load balancer.
`PORTFOLIO_SITE_URL` in each production environment must address that specific
origin through a private HTTPS route, independently of the public load balancer.
Checking the apex cannot prove which origin runs the requested image.

Protected deployment jobs connect with `tag:gha-portfolio-deploy`. Tailnet grants
must permit only the required Coolify API and beta/origin verification routes.
A routing or API failure stops deployment; resolve the grant or ingress issue
without exposing private dashboards or workload ports publicly.

Static hashed assets must remain available on both origins throughout a
staggered update, failure and rollback. Retaining only older assets in a newer
image does not cover new HTML reaching an older origin. Before PDX1 deploys,
`scripts/portfolio_assets.py` posts the exact image and commit to the private
`/api/portfolio-assets` controller using the same protected Coolify bearer
token. The controller validates the image revision label and stages its
`/_astro` tree in the independent caches mounted by both production origins.
The gate requires both receipts to match the requested digest and contain
nonempty asset trees. Only then can either origin change application image.
Timeouts, redirects, missing origins and malformed receipts stop the rollout.
Staging is additive and safe to repeat; retained assets cover staggered updates
and rollback. Beta uses its own image assets and does not call this controller.

## Credential ownership

Each lane has a dedicated API identity. Tokens require Coolify `read`, `write`,
and `deploy` abilities because the transaction must inspect the application,
change its image digest, and start both normal and rollback deployments.
Coolify API tokens are team-scoped rather than application-scoped, so the
helper's exact application preflight and the protected GitHub environment are
additional fail-closed boundaries.

Infisical is the system of record for each lane's `COOLIFY_API_TOKEN`. GitHub
receives each value only as an Actions secret in the matching environment.
The workflow must never print the token or complete
Coolify application responses, which can contain nested sensitive settings.

The non-secret target identifiers are variables in each GitHub environment:

- `COOLIFY_API_URL`
- `COOLIFY_APPLICATION_UUID`
- `COOLIFY_APPLICATION_NAME`
- `COOLIFY_DESTINATION_UUID`
- `COOLIFY_SERVER_UUID`
- `COOLIFY_ENVIRONMENT_UUID`
- `PORTFOLIO_SITE_URL` (private HTTPS beta or direct-origin verification URL)

The existing `beta` and `production` environments retain their
`COOLIFY_API_TOKEN`, `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` secrets.
Within `production`, the unprefixed target variables select PDX1. IAD1 uses
the same names with an `IAD1_` prefix, except `COOLIFY_API_URL`, which is shared.
The reusable workflow performs an exact prefixed lookup with no fallback: a
missing IAD1 value fails configuration validation before application mutation.
No OAuth secret copying or new GitHub environments are required.

## Rotation and revocation

Rotate before the current token expires:

1. Create a replacement token for the lane with `read`, `write`, and `deploy`
   abilities and a bounded expiration.
2. Update Infisical first, then replace the matching GitHub environment secret
   without displaying the value.
3. Perform an authenticated read-only lookup of the exact application and run
   a normal deployment of that lane.
4. Revoke the preceding token only after the new deployment succeeds.

For emergency revocation, revoke the lane's token in Coolify immediately and
remove the matching GitHub environment secret. Image publication continues, but the
deployment job fails before changing the application.

## Acceptance and rollback drill

After changing this path:

1. Record the current beta, PDX1 and IAD1 production digests.
2. Push a harmless commit to `beta` and require the complete workflow to pass.
3. Confirm the workflow's published digest equals the beta application's
   configured digest, `/healthz` returns `ok`, and `/_meta/revision` equals the
   pushed commit.
4. Confirm the production application and digest did not change and public DNS
   still does not publish the beta hostname.
5. In a controlled window, deploy a known prior beta digest while requesting a
   revision it cannot serve. The helper must fail the validation, redeploy the
   recorded accepted digest, and report that the previous digest was restored.
6. Recheck beta health, revision, and configured digest after rollback. A
   rollback is not accepted solely because the API mutation returned success.
7. Promote to `main`. Require both asset staging receipts before PDX1 changes,
   then confirm both production applications use the same published digest and
   each private origin revision matches the commit. Check hashed assets from
   both old and new HTML against both origins during the staggered rollout.
8. Exercise an IAD1 verification failure in a controlled drill. The workflow
   must fail, restore IAD1's previous digest, retain the verified PDX1 digest,
   and preserve the asset paths needed by both releases.

## Build dependency advisory GHSA-ch52-4w7c-c8xp

`scripts/npm_audit.py` blocks every non-info finding in both the `site` and
`chat-worker` workspaces; it has no exceptions. A temporary exception for
[GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
(`http-cache-semantics` through 4.2.0, reached through Astro) was removed in
October 2026 by locking `http-cache-semantics` 4.3.0, which is outside the
advisory's affected range.

4.3.0 does not change the `max-stale` code the advisory cites. The upstream
maintainer disputes the report as RFC 9111 section 7.3 behavior
([kornelski/http-cache-semantics#56](https://github.com/kornelski/http-cache-semantics/issues/56)),
and the dispute is open at
[github/advisory-database#10139](https://github.com/github/advisory-database/issues/10139).
Exposure is nil either way: Astro uses the package only in its build-time
remote-asset helper, and the deployed image serves static output from Nginx
with no Node runtime or shared HTTP cache.

If the advisory's range is widened to include 4.3.0, the audit blocks again by
design. Upgrade if a real fix exists; otherwise reintroduce a narrowly scoped,
expiring exception with its own review rather than weakening the gate.
