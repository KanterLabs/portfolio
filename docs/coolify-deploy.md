# Coolify deployment

Every successful push to `beta` or `main` publishes an immutable GHCR image and
deploys that exact registry digest to the matching Coolify application. Coolify
does not build the repository and the workflow never deploys a mutable branch
tag directly.

| Branch | Job | GitHub environment | Coolify application | Verified URL |
| --- | --- | --- | --- | --- |
| `beta` | `deploy-beta` | `beta` | `portfolio-beta-immutable` | `https://beta.home.shanekanterman.dev` |
| `main` | `deploy-production` | `production` | `portfolio-production-immutable` | `https://shanekanterman.dev` |

Both applications run on the OVH Coolify app host. `main` only advances by
promoting `beta`, so production rebuilds, smoke-tests, and deploys content that
already passed the full suite and a live deployment on beta.

## Transaction

Each deploy job runs only for a `push` event on its branch and is attached to
that branch's protected GitHub environment. The repository workflow serializes
runs for the same branch. Before changing Coolify, the job also confirms the
run commit is still the remote branch tip, so a stale run cannot overwrite a
newer release.

`scripts/coolify_deploy.py` then:

1. Reads the application and validates its UUID, name, environment,
   destination, server, build pack, port, and current digest shape.
2. Records the current immutable digest.
3. Updates the application to the exact digest published by the container job.
4. Starts a Coolify deployment and waits for its deployment record to finish.
5. Requires Coolify health, `/healthz`, and `/_meta/revision` on
   `PORTFOLIO_SITE_URL` to agree with the requested commit.
6. Restores and redeploys the previous digest if any post-update step fails.

Each environment holds its own application identifiers and token, so the beta
job cannot address the production application and vice versa.

## Beta private network contract

The `homelab` runner joins the tailnet as `tag:ci-runners`. Tailscale grants
that tag TCP 443 access only to `svc:coolify` for the API transaction and
`svc:portfolio-beta` for post-deploy health and revision checks. The beta
hostname remains private split DNS; the workflow does not add public DNS,
Funnel, direct-origin exposure, or access to the production application.

If the deploy job cannot reach Coolify, verify the `svc:coolify` CI grant. If
Coolify finishes but route verification fails, verify the
`svc:portfolio-beta` CI grant. Do not work around either failure by exposing a
dashboard or workload port publicly.

## Production ingress

`shanekanterman.dev` and `www.shanekanterman.dev` are proxied by Cloudflare to
a remotely managed Cloudflare Tunnel whose connector runs on the OVH Coolify
app host. The tunnel forwards both hostnames to the production application's
loopback port, so the app host keeps inbound TCP 80 and 443 closed. The
`deploy-production` job verifies through the public hostname, which proves
the whole Cloudflare, tunnel, and application path serves the new commit.

The retired static-origin load balancer is kept disabled rather than deleted.
Re-enabling it is the emergency path back to the legacy origin.

## Credential ownership

Each lane has its own API identity: `portfolio-beta-ci` and
`portfolio-production-ci`. Both have Coolify `read`, `write`, and `deploy`
abilities because the transaction must inspect the application,
change its image digest, and start both normal and rollback deployments.
Coolify API tokens are team-scoped rather than application-scoped, so the
helper's exact application preflight and the protected GitHub environment are
additional fail-closed boundaries.

Infisical `lab:/apps/portfolio/beta` and `lab:/apps/portfolio/production` are
the systems of record for each lane's `COOLIFY_API_TOKEN`. GitHub receives each
value only as an Actions secret in the matching environment. The workflow must never print the token or complete
Coolify application responses, which can contain nested sensitive settings.

The non-secret target identifiers are variables in each GitHub environment:

- `COOLIFY_API_URL`
- `COOLIFY_APPLICATION_UUID`
- `COOLIFY_APPLICATION_NAME`
- `COOLIFY_DESTINATION_UUID`
- `COOLIFY_SERVER_UUID`
- `COOLIFY_ENVIRONMENT_UUID`

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

1. Record the current beta and production digests.
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
