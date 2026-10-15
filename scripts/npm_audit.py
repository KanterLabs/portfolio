#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SEVERITIES = {"info", "low", "moderate", "high", "critical"}


def _blocked(reason):
    return False, f"npm audit: blocked ({reason})"


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


def evaluate_report(report, workspace, repo_root=ROOT):
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
    return _blocked(f"findings in {workspace.name}")


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
