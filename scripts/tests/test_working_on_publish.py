from __future__ import annotations

import io
import sys
import unittest
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import working_on_publish as wp  # noqa: E402


class FakeApi:
    def __init__(self, pulls, schedule_exists=False):
        self.pulls = pulls
        self.schedule_exists = schedule_exists
        self.calls = []

    def __call__(self, method, path, body=None):
        self.calls.append((method, path, body))
        if method == "GET":
            return self.pulls
        if method == "POST" and path == "/pulls":
            return {"number": 31}
        if method == "DELETE" and not self.schedule_exists:
            raise urllib.error.HTTPError(path, 404, "Not Found", {}, io.BytesIO())
        return None


class ParseRemoteTest(unittest.TestCase):
    def test_parses_https_remote_with_or_without_suffix(self):
        for url in ("https://gitea.example/KanterLabs/portfolio.git", "https://gitea.example/KanterLabs/portfolio"):
            self.assertEqual(wp.parse_remote(url), wp.Remote("gitea.example", "KanterLabs", "portfolio"))

    def test_rejects_ssh_remote(self):
        with self.assertRaises(ValueError):
            wp.parse_remote("git@gitea.example:KanterLabs/portfolio.git")


class PublishTest(unittest.TestCase):
    def test_opens_a_pr_and_queues_it_to_merge_at_the_pushed_commit(self):
        api = FakeApi(pulls=[{"number": 7, "head": {"ref": "feature"}, "base": {"ref": "beta"}}])
        number = wp.publish(api, "chore/working-on-refresh", "beta", "abc123", "title", "body")
        self.assertEqual(number, 31)
        self.assertIn(("POST", "/pulls", {"head": "chore/working-on-refresh", "base": "beta",
                                          "title": "title", "body": "body"}), api.calls)
        self.assertEqual(api.calls[-1], ("POST", "/pulls/31/merge", {
            "Do": "merge", "head_commit_id": "abc123",
            "merge_when_checks_succeed": True, "delete_branch_after_merge": True,
        }))

    def test_reuses_an_open_refresh_pr_and_replaces_its_schedule(self):
        open_pr = {"number": 12, "head": {"ref": "chore/working-on-refresh"}, "base": {"ref": "beta"}}
        api = FakeApi(pulls=[open_pr], schedule_exists=True)
        self.assertEqual(wp.publish(api, "chore/working-on-refresh", "beta", "def456", "t", "b"), 12)
        methods = [(method, path) for method, path, _ in api.calls]
        self.assertNotIn(("POST", "/pulls"), methods)
        self.assertEqual(methods[-3:], [("PATCH", "/pulls/12"), ("DELETE", "/pulls/12/merge"),
                                        ("POST", "/pulls/12/merge")])
        self.assertEqual(api.calls[-1][2]["head_commit_id"], "def456")


if __name__ == "__main__":
    unittest.main()
