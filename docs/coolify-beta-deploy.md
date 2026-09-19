# Coolify beta deployment

Every successful push to `beta` publishes an immutable GHCR image and deploys
that exact registry digest to the existing Coolify beta application. Coolify
does not build the repository and the workflow never deploys the mutable
`beta` tag directly.

## Transaction

The `deploy-beta` job runs only for a `push` event on the `beta` branch and is
attached to the protected GitHub `beta` environment. The repository workflow
serializes runs for the same branch. Before changing Coolify, the helper also
confirms the run commit is still the remote `beta` tip.

`scripts/coolify_deploy.py` then:

1. Reads the application and validates its UUID, name, environment,
   destination, server, build pack, port, and current digest shape.
2. Records the current immutable digest.
3. Updates the application to the exact digest published by the container job.
4. Starts a Coolify deployment and waits for its deployment record to finish.
5. Requires Coolify health, `/healthz`, and `/_meta/revision` to agree with the
   requested commit.
6. Restores and redeploys the previous digest if any post-update step fails.

Production is a different Coolify application and is not addressable by this
workflow.

## Credential ownership

The API identity is named `portfolio-beta-ci`. It has Coolify `read`, `write`,
and `deploy` abilities because the transaction must inspect the application,
change its image digest, and start both normal and rollback deployments.
Coolify API tokens are team-scoped rather than application-scoped, so the
helper's exact application preflight and the protected GitHub environment are
additional fail-closed boundaries.

Infisical `lab:/apps/portfolio/beta` is the system of record for
`COOLIFY_API_TOKEN`. GitHub receives the same value only as an Actions secret
in the `beta` environment. The workflow must never print the token or complete
Coolify application responses, which can contain nested sensitive settings.

The non-secret target identifiers are GitHub `beta` environment variables:

- `COOLIFY_API_URL`
- `COOLIFY_APPLICATION_UUID`
- `COOLIFY_APPLICATION_NAME`
- `COOLIFY_DESTINATION_UUID`
- `COOLIFY_SERVER_UUID`
- `COOLIFY_ENVIRONMENT_UUID`

## Rotation and revocation

Rotate before the current token expires:

1. Create a replacement `portfolio-beta-ci` token with `read`, `write`, and
   `deploy` abilities and a bounded expiration.
2. Update Infisical first, then replace the GitHub `beta` environment secret
   without displaying the value.
3. Perform an authenticated read-only lookup of the exact application and run
   a normal beta deployment.
4. Revoke the preceding token only after the new deployment succeeds.

For emergency revocation, revoke `portfolio-beta-ci` in Coolify immediately
and remove the GitHub environment secret. Image publication continues, but the
deployment job fails before changing the application.
