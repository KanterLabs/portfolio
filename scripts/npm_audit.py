#!/usr/bin/env python3
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE_SHA256 = "f556f2faf93aedfffd39421c8cf0f24d0867af96f9f0bf8c4b2e646a80df72cb"
ADVISORY = "https://github.com/advisories/GHSA-ch52-4w7c-c8xp"
EXPIRES = datetime(2026, 10, 10, tzinfo=timezone.utc)
PACKAGE = "http-cache-semantics"
VERSION = "4.2.0"
CHAIN = (PACKAGE, "astro", "@astrojs/mdx")
SEVERITIES = {"info", "low", "moderate", "high", "critical"}


def _blocked(reason):
    return False, f"npm audit: blocked ({reason})"


def _guard(repo_root):
    try:
        digest = hashlib.sha256((repo_root / "Dockerfile").read_bytes()).hexdigest()
        lock = json.loads((repo_root / "site/package-lock.json").read_text())
        version = lock["packages"][f"node_modules/{PACKAGE}"]["version"]
    except (OSError, ValueError, KeyError, TypeError):
        return "review guard unavailable"
    if digest != DOCKERFILE_SHA256:
        return "reviewed Dockerfile changed"
    if version != VERSION:
        return "reviewed package version changed"
    return None


def _validate_report(report):
    if not isinstance(report, dict) or report.get("auditReportVersion") != 2:
        return None
    if "error" in report:
        return None
    vulnerabilities = report.get("vulnerabilities")
    metadata = report.get("metadata")
    if not isinstance(vulnerabilities, dict) or not isinstance(metadata, dict):
        return None
    counts = metadata.get("vulnerabilities")
    if not isinstance(counts, dict):
        return None
    total = counts.get("total")
    if type(total) is not int or total != len(vulnerabilities):
        return None
    for name, item in vulnerabilities.items():
        if not isinstance(name, str) or not isinstance(item, dict):
            return None
        if item.get("name") != name or item.get("severity") not in SEVERITIES:
            return None
        if not isinstance(item.get("via"), list):
            return None
    return vulnerabilities


def evaluate_report(report, workspace, repo_root=ROOT, now=None):
    workspace, repo_root = Path(workspace).resolve(), Path(repo_root).resolve()
    if workspace.parent != repo_root or workspace.name not in {"site", "chat-worker"}:
        return _blocked("unsupported workspace")
    vulnerabilities = _validate_report(report)
    if vulnerabilities is None:
        return _blocked("malformed audit report")
    findings = {
        name: item
        for name, item in vulnerabilities.items()
        if item["severity"] != "info"
    }
    if not findings:
        return True, "npm audit: clean"
    if workspace.name != "site":
        return _blocked("findings in chat-worker")
    if any(name not in CHAIN for name in findings):
        return _blocked("unreviewed finding")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if now.astimezone(timezone.utc) >= EXPIRES:
        return _blocked("temporary exception expired")
    guard_error = _guard(repo_root)
    if guard_error:
        return _blocked(guard_error)
    exempted = set()
    for name in CHAIN:
        if name not in findings:
            continue
        item = findings[name]
        via = item["via"]
        if name == PACKAGE:
            if (
                len(via) != 1
                or not isinstance(via[0], dict)
                or via[0].get("url") != ADVISORY
                or via[0].get("name") != PACKAGE
                or item.get("nodes") != [f"node_modules/{PACKAGE}"]
            ):
                return _blocked("unreviewed finding")
        else:
            parent = CHAIN[CHAIN.index(name) - 1]
            if via != [parent] or parent not in exempted:
                return _blocked("unreviewed finding")
        exempted.add(name)
    return True, "npm audit: allowed GHSA-ch52-4w7c-c8xp exception"


def run_audit(workspace, repo_root=ROOT):
    try:
        result = subprocess.run(
            ["npm", "audit", "--package-lock-only", "--audit-level=low", "--json"],
            cwd=workspace,
            capture_output=True,
            text=True,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return _blocked("npm execution failed")
    if result.returncode not in (0, 1):
        return _blocked("npm execution failed")
    try:
        report = json.loads(result.stdout)
    except (TypeError, json.JSONDecodeError):
        return _blocked("malformed audit report")
    vulnerabilities = report.get("vulnerabilities") if isinstance(report, dict) else None
    if result.returncode == 1 and isinstance(vulnerabilities, dict):
        if not any(
            item.get("severity") != "info"
            for item in vulnerabilities.values()
            if isinstance(item, dict)
        ):
            return _blocked("npm execution failed")
    return evaluate_report(report, workspace, repo_root)


def main():
    workspace = Path.cwd().resolve()
    if workspace.parent != ROOT or workspace.name not in {"site", "chat-worker"}:
        print("npm audit: blocked (run from site or chat-worker)")
        return 1
    ok, message = run_audit(workspace)
    print(message)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
