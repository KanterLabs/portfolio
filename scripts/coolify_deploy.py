#!/usr/bin/env python3
"""Deploy the exact Portfolio beta image digest through Coolify.

The command is intentionally environment-driven so GitHub Actions can keep the
API token in its protected beta environment. API error bodies are never echoed:
Coolify application responses can contain nested secret-bearing settings.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable


IMAGE_NAME = "ghcr.io/kanterlabs/portfolio@sha256"
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
TERMINAL_FAILURES = {"failed", "cancelled", "cancelled-by-user"}


class DeployError(RuntimeError):
    """A sanitized deployment failure safe to print in CI."""


@dataclass(frozen=True)
class Config:
    api_url: str
    api_token: str
    application_uuid: str
    application_name: str
    destination_uuid: str
    server_uuid: str
    environment_uuid: str
    image_digest: str
    git_sha: str
    beta_url: str
    deployment_timeout: int = 600
    health_timeout: int = 180
    poll_seconds: int = 3

    @classmethod
    def from_env(cls) -> "Config":
        def required(name: str) -> str:
            value = os.environ.get(name, "").strip()
            if not value:
                raise DeployError(f"required environment variable is missing: {name}")
            return value

        cfg = cls(
            api_url=required("COOLIFY_API_URL").rstrip("/"),
            api_token=required("COOLIFY_API_TOKEN"),
            application_uuid=required("COOLIFY_APPLICATION_UUID"),
            application_name=required("COOLIFY_APPLICATION_NAME"),
            destination_uuid=required("COOLIFY_DESTINATION_UUID"),
            server_uuid=required("COOLIFY_SERVER_UUID"),
            environment_uuid=required("COOLIFY_ENVIRONMENT_UUID"),
            image_digest=required("PORTFOLIO_IMAGE_DIGEST"),
            git_sha=required("PORTFOLIO_GIT_SHA"),
            beta_url=required("PORTFOLIO_BETA_URL").rstrip("/"),
            deployment_timeout=int(os.environ.get("COOLIFY_DEPLOYMENT_TIMEOUT", "600")),
            health_timeout=int(os.environ.get("COOLIFY_HEALTH_TIMEOUT", "180")),
            poll_seconds=int(os.environ.get("COOLIFY_POLL_SECONDS", "3")),
        )
        cfg.validate()
        return cfg

    def validate(self) -> None:
        api = urllib.parse.urlsplit(self.api_url)
        beta = urllib.parse.urlsplit(self.beta_url)
        if api.scheme != "https" or not api.hostname or api.username or api.password:
            raise DeployError("COOLIFY_API_URL must be an HTTPS URL without user information")
        if api.query or api.fragment or not api.path.endswith("/api/v1"):
            raise DeployError("COOLIFY_API_URL must end with /api/v1")
        if beta.scheme != "https" or not beta.hostname or beta.username or beta.password:
            raise DeployError("PORTFOLIO_BETA_URL must be an HTTPS URL without user information")
        if beta.query or beta.fragment:
            raise DeployError("PORTFOLIO_BETA_URL must not include a query or fragment")
        if not DIGEST_RE.fullmatch(self.image_digest):
            raise DeployError("PORTFOLIO_IMAGE_DIGEST must be a sha256 digest")
        if not SHA_RE.fullmatch(self.git_sha):
            raise DeployError("PORTFOLIO_GIT_SHA must be a 40-character lowercase commit SHA")
        if min(self.deployment_timeout, self.health_timeout, self.poll_seconds) < 1:
            raise DeployError("deployment timeouts and polling interval must be positive")


class CoolifyClient:
    def __init__(self, base_url: str, token: str, timeout: int = 20):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        if not path.startswith("/"):
            raise DeployError("internal API path is invalid")
        data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "portfolio-beta-deployer/1",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = response.read(1_048_577)
                if len(payload) > 1_048_576:
                    raise DeployError(f"Coolify {method} {path} returned an oversized response")
                return json.loads(payload) if payload.strip() else {}
        except urllib.error.HTTPError as exc:
            raise DeployError(f"Coolify {method} {path} returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise DeployError(f"Coolify {method} {path} did not return a valid response") from exc

    def get(self, path: str) -> Any:
        return self.request("GET", path)

    def patch(self, path: str, body: dict[str, Any]) -> Any:
        return self.request("PATCH", path, body)

    def post(self, path: str, body: dict[str, Any] | None = None) -> Any:
        return self.request("POST", path, body or {})


def nested(value: dict[str, Any], *keys: str) -> Any:
    current: Any = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def current_digest(application: dict[str, Any]) -> str:
    name = application.get("docker_registry_image_name")
    tag = application.get("docker_registry_image_tag")
    if name != IMAGE_NAME or not isinstance(tag, str) or not re.fullmatch(r"[0-9a-f]{64}", tag):
        raise DeployError("Coolify application is not pinned to the expected Portfolio digest image")
    return f"sha256:{tag}"


def validate_application(application: dict[str, Any], cfg: Config) -> str:
    expected = {
        "uuid": cfg.application_uuid,
        "name": cfg.application_name,
        "build_pack": "dockerimage",
        "ports_exposes": "8080",
    }
    for field, wanted in expected.items():
        if application.get(field) != wanted:
            raise DeployError(f"Coolify application preflight mismatch: {field}")
    nested_expected = {
        "destination": (nested(application, "destination", "uuid"), cfg.destination_uuid),
        "server": (nested(application, "destination", "server", "uuid"), cfg.server_uuid),
        "environment": (nested(application, "environment", "uuid"), cfg.environment_uuid),
    }
    for field, (actual, wanted) in nested_expected.items():
        if actual != wanted:
            raise DeployError(f"Coolify application preflight mismatch: {field}")
    return current_digest(application)


def patch_digest(client: CoolifyClient, cfg: Config, digest: str) -> None:
    client.patch(
        f"/applications/{cfg.application_uuid}",
        {
            "docker_registry_image_name": IMAGE_NAME,
            "docker_registry_image_tag": digest.removeprefix("sha256:"),
        },
    )
    application = client.get(f"/applications/{cfg.application_uuid}")
    validate_application(application, cfg)
    if current_digest(application) != digest:
        raise DeployError("Coolify did not retain the requested image digest")


def start_deployment(client: CoolifyClient, cfg: Config) -> str:
    response = client.post(f"/applications/{cfg.application_uuid}/start")
    deployment_uuid = response.get("deployment_uuid") if isinstance(response, dict) else None
    if not isinstance(deployment_uuid, str) or not deployment_uuid:
        raise DeployError("Coolify did not return a deployment UUID")
    return deployment_uuid


def wait_for_deployment(
    client: CoolifyClient,
    deployment_uuid: str,
    cfg: Config,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    attempts = max(1, cfg.deployment_timeout // cfg.poll_seconds)
    for _ in range(attempts):
        deployment = client.get(f"/deployments/{deployment_uuid}")
        status = deployment.get("status") if isinstance(deployment, dict) else None
        if status == "finished":
            return
        if status in TERMINAL_FAILURES:
            raise DeployError(f"Coolify deployment ended with status {status}")
        sleep(cfg.poll_seconds)
    raise DeployError("Coolify deployment timed out")


def wait_for_healthy(
    client: CoolifyClient,
    cfg: Config,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    attempts = max(1, cfg.health_timeout // cfg.poll_seconds)
    for _ in range(attempts):
        application = client.get(f"/applications/{cfg.application_uuid}")
        validate_application(application, cfg)
        if application.get("status") == "running:healthy":
            return
        sleep(cfg.poll_seconds)
    raise DeployError("Coolify application did not become healthy")


def fetch_text(url: str, timeout: int = 15) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "portfolio-beta-deployer/1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read(4097)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise DeployError("Portfolio beta verification request failed") from exc
    if len(payload) > 4096:
        raise DeployError("Portfolio beta verification response was oversized")
    try:
        return payload.decode().strip()
    except UnicodeDecodeError as exc:
        raise DeployError("Portfolio beta verification response was invalid") from exc


def verify_route(cfg: Config, expected_revision: str | None) -> None:
    if fetch_text(cfg.beta_url + "/healthz") != "ok":
        raise DeployError("Portfolio beta health response did not match")
    if expected_revision is not None:
        revision = fetch_text(cfg.beta_url + "/_meta/revision")
        if revision != expected_revision:
            raise DeployError("Portfolio beta revision did not match the requested commit")


def deploy(
    cfg: Config,
    client: CoolifyClient,
    sleep: Callable[[float], None] = time.sleep,
    verify: Callable[[Config, str | None], None] = verify_route,
) -> dict[str, Any]:
    application = client.get(f"/applications/{cfg.application_uuid}")
    previous_digest = validate_application(application, cfg)
    if previous_digest == cfg.image_digest:
        wait_for_healthy(client, cfg, sleep)
        verify(cfg, cfg.git_sha)
        return {
            "status": "already-current",
            "image_digest": cfg.image_digest,
            "git_sha": cfg.git_sha,
        }

    changed = False
    deployment_uuid: str | None = None
    try:
        # A lost response can occur after Coolify has committed the PATCH, so
        # treat the transaction as changed before issuing the mutation.
        changed = True
        patch_digest(client, cfg, cfg.image_digest)
        deployment_uuid = start_deployment(client, cfg)
        wait_for_deployment(client, deployment_uuid, cfg, sleep)
        wait_for_healthy(client, cfg, sleep)
        verify(cfg, cfg.git_sha)
    except Exception as original:
        if not changed:
            raise
        try:
            patch_digest(client, cfg, previous_digest)
            rollback_uuid = start_deployment(client, cfg)
            wait_for_deployment(client, rollback_uuid, cfg, sleep)
            wait_for_healthy(client, cfg, sleep)
            verify(cfg, None)
        except Exception as rollback:
            raise DeployError(
                f"beta deployment failed ({original}); rollback also failed ({rollback})"
            ) from rollback
        raise DeployError(
            f"beta deployment failed and the previous digest was restored ({original})"
        ) from original

    return {
        "status": "deployed",
        "deployment_uuid": deployment_uuid,
        "previous_digest": previous_digest,
        "image_digest": cfg.image_digest,
        "git_sha": cfg.git_sha,
    }


def main() -> int:
    try:
        cfg = Config.from_env()
        result = deploy(cfg, CoolifyClient(cfg.api_url, cfg.api_token))
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except (DeployError, ValueError) as exc:
        print(f"portfolio-beta-deploy: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
