#!/usr/bin/env python3
"""Gate production rollout on shared hashed assets at both origins."""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any


class AssetStageError(RuntimeError):
    """A sanitized staging receipt failure safe to print in CI."""


def stage_assets(client: Any, image_digest: str, git_sha: str) -> dict[str, Any]:
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_digest):
        raise AssetStageError("asset staging requires an immutable sha256 image digest")
    if not re.fullmatch(r"[0-9a-f]{40}", git_sha):
        raise AssetStageError("asset staging requires a lowercase 40-character commit SHA")
    image = "ghcr.io/kanterlabs/portfolio@" + image_digest
    receipt = client.post("/portfolio-assets", {"image": image, "sha": git_sha})
    if (
        not isinstance(receipt, dict)
        or receipt.get("ok") is not True
        or receipt.get("image") != image
        or receipt.get("sha") != git_sha
    ):
        raise AssetStageError("asset staging receipt did not match the requested release")
    origins = receipt.get("origins")
    if not isinstance(origins, dict) or set(origins) != {"pdx1", "iad1"}:
        raise AssetStageError("asset staging did not verify both production origins")
    for origin in origins.values():
        if not isinstance(origin, dict) or origin.get("digest") != image_digest:
            raise AssetStageError("asset staging origin digest did not match")
        if any(type(origin.get(field)) is not int or origin[field] <= 0 for field in ("files", "bytes")):
            raise AssetStageError("asset staging origin did not contain a nonempty asset tree")
    # Log only these validated fields, even if a future controller adds data.
    return {
        "ok": True,
        "image": image,
        "sha": git_sha,
        "origins": {
            name: {field: origin[field] for field in ("digest", "files", "bytes")}
            for name, origin in origins.items()
        },
    }


def main() -> int:
    # Reuse the deployer's HTTPS, redirect rejection and target configuration.
    from coolify_deploy import Config, CoolifyClient, DeployError

    try:
        cfg = Config.from_env()
        client = CoolifyClient(cfg.api_url.removesuffix("/v1"), cfg.api_token, timeout=600)
        receipt = stage_assets(client, cfg.image_digest, cfg.git_sha)
        summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary_path:
            with open(summary_path, "a", encoding="utf-8") as summary:
                summary.write(f"Production assets staged on PDX1 and IAD1: `{cfg.image_digest}`\n")
        print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
        return 0
    except (AssetStageError, DeployError, ValueError) as exc:
        print(f"portfolio-assets: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
