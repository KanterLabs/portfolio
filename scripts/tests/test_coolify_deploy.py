from __future__ import annotations

import os
import sys
import unittest
from unittest import mock
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import coolify_deploy as deployer  # noqa: E402


OLD = "sha256:" + "1" * 64
NEW = "sha256:" + "2" * 64
APP_UUID = "app-uuid"


def config(digest: str = NEW) -> deployer.Config:
    return deployer.Config(
        api_url="https://coolify.example.test/api/v1",
        api_token="secret",
        application_uuid=APP_UUID,
        application_name="portfolio-beta-immutable",
        destination_uuid="destination-uuid",
        server_uuid="server-uuid",
        environment_uuid="environment-uuid",
        image_digest=digest,
        git_sha="a" * 40,
        beta_url="https://beta.example.test",
        deployment_timeout=3,
        health_timeout=3,
        poll_seconds=1,
    )


def application(digest: str, status: str = "running:healthy") -> dict[str, Any]:
    return {
        "uuid": APP_UUID,
        "name": "portfolio-beta-immutable",
        "build_pack": "dockerimage",
        "ports_exposes": "8080",
        "docker_registry_image_name": deployer.IMAGE_NAME,
        "docker_registry_image_tag": digest.removeprefix("sha256:"),
        "status": status,
        "destination": {
            "uuid": "destination-uuid",
            "server": {"uuid": "server-uuid"},
        },
        "environment": {"uuid": "environment-uuid"},
    }


class FakeClient:
    def __init__(self, digest: str = OLD):
        self.digest = digest
        self.calls: list[tuple[str, str, Any]] = []
        self.deployment_statuses: list[str] = []
        self.start_uuids: list[str] = ["deploy-new", "deploy-rollback"]

    def get(self, path: str) -> dict[str, Any]:
        self.calls.append(("GET", path, None))
        if path.startswith("/applications/"):
            return application(self.digest)
        if path.startswith("/deployments/"):
            return {"status": self.deployment_statuses.pop(0)}
        raise AssertionError(path)

    def patch(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("PATCH", path, body))
        self.digest = "sha256:" + body["docker_registry_image_tag"]
        return {"uuid": APP_UUID}

    def post(self, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls.append(("POST", path, body))
        return {"deployment_uuid": self.start_uuids.pop(0)}


class CoolifyDeployTests(unittest.TestCase):
    def test_config_rejects_mutable_image_reference(self) -> None:
        values = {
            "COOLIFY_API_URL": "https://coolify.example.test/api/v1",
            "COOLIFY_API_TOKEN": "secret",
            "COOLIFY_APPLICATION_UUID": APP_UUID,
            "COOLIFY_APPLICATION_NAME": "portfolio-beta-immutable",
            "COOLIFY_DESTINATION_UUID": "destination-uuid",
            "COOLIFY_SERVER_UUID": "server-uuid",
            "COOLIFY_ENVIRONMENT_UUID": "environment-uuid",
            "PORTFOLIO_IMAGE_DIGEST": "beta",
            "PORTFOLIO_GIT_SHA": "a" * 40,
            "PORTFOLIO_BETA_URL": "https://beta.example.test",
        }
        with mock.patch.dict(os.environ, values, clear=True):
            with self.assertRaisesRegex(deployer.DeployError, "sha256 digest"):
                deployer.Config.from_env()

    def test_preflight_rejects_the_wrong_destination(self) -> None:
        app = application(OLD)
        app["destination"]["uuid"] = "wrong"
        with self.assertRaisesRegex(deployer.DeployError, "destination"):
            deployer.validate_application(app, config())

    def test_successful_deploy_pins_exact_digest_and_verifies_revision(self) -> None:
        client = FakeClient()
        client.deployment_statuses = ["in_progress", "finished"]
        verified: list[str | None] = []
        result = deployer.deploy(
            config(), client, sleep=lambda _: None, verify=lambda _, revision: verified.append(revision)
        )
        self.assertEqual("deployed", result["status"])
        self.assertEqual(NEW, client.digest)
        self.assertEqual(["a" * 40], verified)
        patches = [call for call in client.calls if call[0] == "PATCH"]
        self.assertEqual(1, len(patches))
        self.assertEqual(NEW.removeprefix("sha256:"), patches[0][2]["docker_registry_image_tag"])

    def test_verification_failure_rolls_back_the_previous_digest(self) -> None:
        client = FakeClient()
        client.deployment_statuses = ["finished", "finished"]
        verified: list[str | None] = []

        def verify(_: deployer.Config, revision: str | None) -> None:
            verified.append(revision)
            if revision is not None:
                raise deployer.DeployError("revision mismatch")

        with self.assertRaisesRegex(deployer.DeployError, "previous digest was restored"):
            deployer.deploy(config(), client, sleep=lambda _: None, verify=verify)
        self.assertEqual(OLD, client.digest)
        self.assertEqual(["a" * 40, None], verified)
        self.assertEqual(2, len([call for call in client.calls if call[0] == "PATCH"]))

    def test_current_digest_is_idempotent(self) -> None:
        client = FakeClient(NEW)
        verified: list[str | None] = []
        result = deployer.deploy(
            config(), client, sleep=lambda _: None, verify=lambda _, revision: verified.append(revision)
        )
        self.assertEqual("already-current", result["status"])
        self.assertEqual(["a" * 40], verified)
        self.assertFalse(any(call[0] in {"PATCH", "POST"} for call in client.calls))


if __name__ == "__main__":
    unittest.main()
