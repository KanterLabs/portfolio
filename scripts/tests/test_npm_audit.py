import copy
import importlib.util
import json
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "npm_audit.py"
SPEC = importlib.util.spec_from_file_location("npm_audit", SCRIPT)
npm_audit = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(npm_audit)

GHSA = "https://github.com/advisories/GHSA-ch52-4w7c-c8xp"


def report(vulnerabilities=None):
    vulnerabilities = {} if vulnerabilities is None else vulnerabilities
    return {
        "auditReportVersion": 2,
        "vulnerabilities": vulnerabilities,
        "metadata": {"vulnerabilities": {"total": len(vulnerabilities)}},
    }


ROOT = {
    "name": "http-cache-semantics",
    "severity": "high",
    "isDirect": False,
    "via": [{"source": 1240991, "name": "http-cache-semantics", "url": GHSA}],
    "effects": ["astro"],
    "range": "*",
    "nodes": ["node_modules/http-cache-semantics"],
}
ASTRO = {
    "name": "astro",
    "severity": "high",
    "isDirect": True,
    "via": ["http-cache-semantics"],
    "effects": ["@astrojs/mdx"],
    "nodes": ["node_modules/astro"],
}
MDX = {
    "name": "@astrojs/mdx",
    "severity": "high",
    "isDirect": True,
    "via": ["astro"],
    "effects": [],
    "nodes": ["node_modules/@astrojs/mdx"],
}


class NpmAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        (self.repo / "site").mkdir()
        (self.repo / "chat-worker").mkdir()
        shutil.copyfile(Path(__file__).parents[2] / "Dockerfile", self.repo / "Dockerfile")
        self.write_lock()
        self.site_report = report(
            {"http-cache-semantics": ROOT, "astro": ASTRO, "@astrojs/mdx": MDX}
        )

    def tearDown(self):
        self.temp.cleanup()

    def write_lock(self, version="4.2.0"):
        (self.repo / "site" / "package-lock.json").write_text(
            json.dumps(
                {
                    "lockfileVersion": 3,
                    "packages": {
                        "": {"name": "site"},
                        "node_modules/http-cache-semantics": {"version": version},
                    },
                }
            )
        )

    def evaluate(self, audit, now=None):
        return npm_audit.evaluate_report(
            audit, self.repo / "site", self.repo, now=now
        )

    def test_site_exception_permits_only_the_reviewed_chain(self):
        ok, message = self.evaluate(self.site_report)
        self.assertTrue(ok, message)
        self.assertIn("allowed", message)

    def test_unknown_or_mixed_findings_block(self):
        unknown = copy.deepcopy(self.site_report)
        unknown["vulnerabilities"]["other-package"] = {"severity": "low", "via": []}
        self.assertFalse(self.evaluate(unknown)[0])

        mixed = copy.deepcopy(self.site_report)
        mixed["vulnerabilities"]["astro"]["via"].append({"url": "other-advisory"})
        self.assertFalse(self.evaluate(mixed)[0])

    def test_clean_report_passes(self):
        self.assertTrue(self.evaluate(report())[0])

    def test_report_error_or_wrong_metadata_total_blocks(self):
        errored = report()
        errored["error"] = {"code": "EAI_AGAIN"}
        self.assertFalse(self.evaluate(errored)[0])

        wrong_total = copy.deepcopy(self.site_report)
        wrong_total["metadata"]["vulnerabilities"]["total"] = 2
        self.assertFalse(self.evaluate(wrong_total)[0])

    def test_exit_one_clean_report_blocks(self):
        completed = type("Completed", (), {"returncode": 1, "stdout": json.dumps(report()), "stderr": ""})()
        with patch.object(npm_audit.subprocess, "run", return_value=completed):
            ok, _ = npm_audit.run_audit(self.repo / "site", self.repo)
        self.assertFalse(ok)

    def test_root_record_has_exact_identity_and_node(self):
        wrong_name = copy.deepcopy(self.site_report)
        wrong_name["vulnerabilities"]["http-cache-semantics"]["via"][0]["name"] = "other"
        self.assertFalse(self.evaluate(wrong_name)[0])

        wrong_node = copy.deepcopy(self.site_report)
        wrong_node["vulnerabilities"]["http-cache-semantics"]["nodes"] = ["node_modules/other"]
        self.assertFalse(self.evaluate(wrong_node)[0])

    def test_chat_worker_has_no_exception(self):
        finding = report({"other": {"name": "other", "severity": "low", "via": []}})
        ok, _ = npm_audit.evaluate_report(finding, self.repo / "chat-worker", self.repo)
        self.assertFalse(ok)

    def test_expired_exception_blocks(self):
        expired = datetime(2026, 10, 10, tzinfo=timezone.utc)
        self.assertFalse(self.evaluate(self.site_report, expired)[0])

    def test_changed_dockerfile_or_locked_version_blocks(self):
        (self.repo / "Dockerfile").write_text("changed")
        self.assertFalse(self.evaluate(self.site_report)[0])

        shutil.copyfile(Path(__file__).parents[2] / "Dockerfile", self.repo / "Dockerfile")
        self.write_lock("4.2.1")
        self.assertFalse(self.evaluate(self.site_report)[0])

    def test_malformed_reports_block(self):
        for malformed in (None, {}, {"auditReportVersion": 1, "vulnerabilities": {}},
                          {"auditReportVersion": 2, "vulnerabilities": []},
                          {"auditReportVersion": 2, "vulnerabilities": {"x": None}}):
            self.assertFalse(self.evaluate(malformed)[0], malformed)

    def test_npm_operational_error_and_malformed_output_block_without_raw_logs(self):
        with patch.object(npm_audit.subprocess, "run", side_effect=OSError("secret log")):
            ok, message = npm_audit.run_audit(self.repo / "site", self.repo)
        self.assertFalse(ok)
        self.assertNotIn("secret log", message)

        completed = type("Completed", (), {"returncode": 1, "stdout": "not-json", "stderr": "raw"})()
        with patch.object(npm_audit.subprocess, "run", return_value=completed):
            ok, message = npm_audit.run_audit(self.repo / "site", self.repo)
        self.assertFalse(ok)
        self.assertNotIn("raw", message)

    def test_run_uses_low_level_json_audit_and_accepts_audit_exit_one(self):
        completed = type(
            "Completed",
            (),
            {"returncode": 1, "stdout": json.dumps(self.site_report), "stderr": ""},
        )()
        with patch.object(npm_audit.subprocess, "run", return_value=completed) as run:
            ok, _ = npm_audit.run_audit(self.repo / "site", self.repo)
        self.assertTrue(ok)
        self.assertEqual(
            run.call_args.args[0],
            ["npm", "audit", "--package-lock-only", "--audit-level=low", "--json"],
        )


if __name__ == "__main__":
    unittest.main()
