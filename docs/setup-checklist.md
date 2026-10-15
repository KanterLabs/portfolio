# Coolify Portfolio Operations Checklist

Use [the deployment runbook](coolify-deploy.md) for exact lane settings and
rollback procedure.

## Build and release

- [ ] Site and Worker validation, knowledge audit, dependency audits, browser tests, and container smoke tests pass.
- [ ] Production pull requests originate from this repository's beta branch.
- [ ] CI publishes the commit-tagged image to GHCR and records its immutable digest.
- [ ] Coolify deploys that exact digest without rebuilding the repository.
- [ ] Beta and production use their own protected environment, application identifiers, and credentials.
- [ ] A stale workflow cannot overwrite a newer branch tip.

## Private beta

- [ ] The beta application is healthy and serves the expected revision.
- [ ] Its private hostname has no public DNS record.
- [ ] Deployment and verification use the tailnet without exposing the Coolify API publicly.
- [ ] Candidate responses prohibit indexing.

## Production validation

- [ ] Cloudflare Tunnel reaches the production application's loopback port.
- [ ] The app host's inbound web ports remain closed.
- [ ] The homepage, case studies, 404, sitemap, robots, and hashed assets load.
- [ ] `/healthz` returns `ok` and `/_meta/revision` matches the deployed commit.
- [ ] The production application's digest matches the image published by CI.
- [ ] The static-origin load balancer remains disabled unless explicitly invoked for recovery.

## Chatbot and recovery

- [ ] Check pending D1 migrations before a Worker release; preserve existing history.
- [ ] Deploy the production Worker separately when code or reviewed knowledge changes.
- [ ] `/api/chat/health` reports the intended knowledge version and configured history.
- [ ] Live failure after an image change restores and redeploys the previous digest.
- [ ] Worker code rollback preserves D1 data; database restoration requires separate explicit authorization.
