from __future__ import annotations

import io
import sys
import unittest
import urllib.error
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

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
        if method == "DELETE":
            if not self.schedule_exists:
                raise urllib.error.HTTPError(path, 404, "Not Found", {}, io.BytesIO())
            self.schedule_exists = False
        if method == "POST" and path.endswith("/merge"):
            self.schedule_exists = True
        return None


class ParseRemoteTest(unittest.TestCase):
    def test_parses_https_remote_with_or_without_suffix(self):
        for url in ("https://gitea.example/KanterLabs/portfolio.git", "https://gitea.example/KanterLabs/portfolio"):
            self.assertEqual(wp.parse_remote(url), wp.Remote("gitea.example", "KanterLabs", "portfolio"))

    def test_rejects_ssh_remote(self):
        with self.assertRaises(ValueError):
            wp.parse_remote("git@gitea.example:KanterLabs/portfolio.git")


class PublishTest(unittest.TestCase):
    def test_opens_a_pr_without_requesting_a_merge(self):
        api = FakeApi(pulls=[{"number": 7, "head": {"ref": "feature"}, "base": {"ref": "beta"}}])
        number = wp.publish(api, "chore/working-on-refresh", "beta", "abc123", "title", "body")
        self.assertEqual(number, 31)
        self.assertIn(("POST", "/pulls", {"head": "chore/working-on-refresh", "base": "beta",
                                          "title": "title", "body": "body"}), api.calls)
        self.assertFalse(api.schedule_exists)
        self.assertFalse(any(method == "POST" and path.endswith("/merge")
                             for method, path, _ in api.calls))

    def test_reuses_an_open_refresh_pr_and_cancels_its_old_schedule(self):
        open_pr = {"number": 12, "head": {"ref": "chore/working-on-refresh"}, "base": {"ref": "beta"}}
        api = FakeApi(pulls=[open_pr], schedule_exists=True)
        self.assertEqual(wp.publish(api, "chore/working-on-refresh", "beta", "def456", "t", "b"), 12)
        methods = [(method, path) for method, path, _ in api.calls]
        self.assertNotIn(("POST", "/pulls"), methods)
        self.assertIn(("PATCH", "/pulls/12"), methods)
        self.assertIn(("DELETE", "/pulls/12/merge"), methods)
        self.assertNotIn(("POST", "/pulls/12/merge"), methods)
        self.assertFalse(api.schedule_exists)

    def test_cancellation_errors_do_not_report_a_manual_handoff(self):
        for status in (403, 500):
            with self.subTest(status=status):
                api = FakeApi(pulls=[])

                def failing_api(method, path, body=None):
                    if method == "DELETE":
                        raise urllib.error.HTTPError(path, status, "Failure", {}, io.BytesIO())
                    return api(method, path, body)

                with self.assertRaises(urllib.error.HTTPError) as caught:
                    wp.publish(failing_api, "refresh", "beta", "abc123", "t", "b")
                caught.exception.close()
                self.assertFalse(api.schedule_exists)

    def test_cli_identifies_the_commit_and_requests_manual_review(self):
        api = FakeApi(pulls=[])
        output = io.StringIO()
        with patch.object(wp, "credential_token", return_value="test-token"), \
                patch.object(wp, "gitea_api", return_value=api), redirect_stdout(output):
            result = wp.main([
                "--remote-url", "https://gitea.example/KanterLabs/portfolio.git",
                "--head", "refresh", "--base", "beta", "--sha", "abcdef123456",
                "--date", "2026-11-26",
            ])
        self.assertEqual(result, 0)
        self.assertIn("awaiting manual review", output.getvalue())
        body = next(body for method, path, body in api.calls if (method, path) == ("POST", "/pulls"))
        self.assertIn("abcdef123456", body["body"])
        self.assertIn("manual", body["body"])
        self.assertFalse(api.schedule_exists)


if __name__ == "__main__":
    unittest.main()
