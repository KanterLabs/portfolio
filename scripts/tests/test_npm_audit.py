import copy
import importlib.util
import json
import tempfile
import unittest
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
        self.site_report = report(
            {"http-cache-semantics": ROOT, "astro": ASTRO, "@astrojs/mdx": MDX}
        )

    def tearDown(self):
        self.temp.cleanup()

    def evaluate(self, audit):
        return npm_audit.evaluate_report(audit, self.repo / "site", self.repo)

    def test_site_findings_block(self):
        ok, message = self.evaluate(self.site_report)
        self.assertFalse(ok)
        self.assertEqual(message, "npm audit: blocked (findings in site)")

    def test_info_only_findings_pass(self):
        info = report({"astro": dict(ASTRO, severity="info")})
        self.assertTrue(self.evaluate(info)[0])

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

    def test_chat_worker_findings_block(self):
        finding = report({"other": {"name": "other", "severity": "low", "via": []}})
        ok, _ = npm_audit.evaluate_report(finding, self.repo / "chat-worker", self.repo)
        self.assertFalse(ok)

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

    def test_run_uses_low_level_json_audit_and_blocks_audit_exit_one(self):
        completed = type(
            "Completed",
            (),
            {"returncode": 1, "stdout": json.dumps(self.site_report), "stderr": ""},
        )()
        with patch.object(npm_audit.subprocess, "run", return_value=completed) as run:
            ok, _ = npm_audit.run_audit(self.repo / "site", self.repo)
        self.assertFalse(ok)
        self.assertEqual(
            run.call_args.args[0],
            ["npm", "audit", "--package-lock-only", "--audit-level=low", "--json"],
        )


if __name__ == "__main__":
    unittest.main()
