#!/usr/bin/env python3
"""Open (or update) the nightly "What I'm working on" PR for manual review.

`beta` is protected: no direct pushes, and every merge needs the Validate
Portfolio checks. working_on_nightly.sh therefore pushes the refresh to its
own branch, and this script makes sure one PR from that branch into beta
exists for Shane to review and merge. Passing checks never authorizes an
automatic merge. The next night may replace the refresh with a fresh commit.

The Gitea token comes from git's credential helper for the remote's host and
is never printed.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

REMOTE_URL = re.compile(r"^https://(?P<host>[^/]+)/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$")


@dataclass(frozen=True)
class Remote:
    host: str
    owner: str
    repo: str


def parse_remote(url: str) -> Remote:
    match = REMOTE_URL.match(url)
    if not match:
        raise ValueError(f"not an https Gitea remote: {url}")
    return Remote(match["host"], match["owner"], match["repo"])


def credential_token(host: str) -> str:
    output = subprocess.run(
        ["git", "credential", "fill"], input=f"protocol=https\nhost={host}\n\n",
        capture_output=True, text=True, check=True,
    ).stdout
    fields = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
    if not fields.get("password"):
        raise RuntimeError(f"git has no credential for {host}")
    return fields["password"]


Api = Callable[[str, str, "dict[str, Any] | None"], Any]


def gitea_api(remote: Remote, token: str) -> Api:
    base = f"https://{remote.host}/api/v1/repos/{remote.owner}/{remote.repo}"

    def call(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        request = urllib.request.Request(
            base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"token {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
        return json.loads(raw) if raw else None

    return call


def publish(api: Api, head: str, base: str, sha: str, title: str, body: str) -> int:
    """Ensure a review PR exists, clearing any previously queued automatic merge."""
    pulls = api("GET", "/pulls?state=open&limit=50", None) or []
    pr = next((p for p in pulls if p["head"]["ref"] == head and p["base"]["ref"] == base), None)
    if pr is None:
        pr = api("POST", "/pulls", {"head": head, "base": base, "title": title, "body": body})
    else:
        api("PATCH", f"/pulls/{pr['number']}", {"title": title, "body": body})
    number = pr["number"]
    # Clear a queue left by an older publisher so this PR waits for Shane.
    try:
        api("DELETE", f"/pulls/{number}/merge", None)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        error.close()
    return number


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--remote-url", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--date", required=True)
    args = parser.parse_args(argv)

    remote = parse_remote(args.remote_url)
    api = gitea_api(remote, credential_token(remote.host))
    number = publish(
        api, args.head, args.base, args.sha,
        title=f"chore(working-on): refresh for {args.date}",
        body=(
            "Nightly refresh of `site/src/data/working-on.json` from the dev host "
            "(`scripts/working_on_nightly.sh`). Awaiting Shane's manual review and merge "
            f"into `{args.base}` after the required Validate Portfolio checks pass.\n\n"
            f"Review commit: `{args.sha}`. Passing checks does not merge this PR."
        ),
    )
    print(f"working-on: PR #{number} awaiting manual review of {args.sha[:7]} into {args.base}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
