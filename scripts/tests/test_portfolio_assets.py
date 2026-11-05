from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import portfolio_assets as assets  # noqa: E402


DIGEST = "sha256:" + "a" * 64
SHA = "b" * 40
IMAGE = "ghcr.io/kanterlabs/portfolio@" + DIGEST


def receipt() -> dict:
    return {
        "ok": True,
        "image": IMAGE,
        "sha": SHA,
        "origins": {
            origin: {"digest": DIGEST, "files": 3, "bytes": 42}
            for origin in ("pdx1", "iad1")
        },
    }


class ProductionAssetGateTests(unittest.TestCase):
    def test_stages_exact_image_and_requires_both_origins(self) -> None:
        client = mock.Mock()
        client.post.return_value = receipt()
        result = assets.stage_assets(client, DIGEST, SHA)
        client.post.assert_called_once_with("/portfolio-assets", {"image": IMAGE, "sha": SHA})
        self.assertEqual(receipt(), result)

    def test_receipt_output_includes_only_validated_fields(self) -> None:
        value = receipt()
        value["unexpected"] = "private"
        value["origins"]["pdx1"]["unexpected"] = "private"
        client = mock.Mock()
        client.post.return_value = value
        self.assertEqual(receipt(), assets.stage_assets(client, DIGEST, SHA))

    def test_rejects_missing_or_mismatched_receipts(self) -> None:
        changes = (
            lambda r: r.update(ok=False),
            lambda r: r.update(image=IMAGE + "wrong"),
            lambda r: r.update(sha="c" * 40),
            lambda r: r["origins"].pop("iad1"),
            lambda r: r["origins"]["iad1"].update(digest="sha256:" + "c" * 64),
            lambda r: r["origins"]["iad1"].update(files=0),
            lambda r: r["origins"]["pdx1"].update(bytes=True),
        )
        for change in changes:
            value = copy.deepcopy(receipt())
            change(value)
            with self.subTest(receipt=value):
                client = mock.Mock()
                client.post.return_value = value
                with self.assertRaises(assets.AssetStageError):
                    assets.stage_assets(client, DIGEST, SHA)

    def test_rejects_mutable_image_before_calling_controller(self) -> None:
        client = mock.Mock()
        with self.assertRaises(assets.AssetStageError):
            assets.stage_assets(client, "main", SHA)
        client.post.assert_not_called()

    def test_non_successful_controller_request_stops_the_gate(self) -> None:
        client = mock.Mock()
        client.post.side_effect = RuntimeError("controller unavailable")
        with self.assertRaisesRegex(RuntimeError, "controller unavailable"):
            assets.stage_assets(client, DIGEST, SHA)


if __name__ == "__main__":
    unittest.main()
