#!/usr/bin/env python3
"""Build the homepage "What I'm working on" data from the dev host.

Two local sources, both read-only:

* T3 Code's state database: a day counts as worked on a project when Shane
  sent at least one message in one of that project's threads.
* Each project's git checkout: Shane's commits on branches supply more days
  worked, each day's intensity, and the "done this week" items.

Only projects listed in working_on_projects.json are read. Nothing from T3
leaves the machine except dates; thread titles and message text never do.
Commit subjects are published only after the noise and privacy filters below,
because most of these repositories are private, and the config's "titles"
map can rename or hide any subject that still reads badly on the homepage.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sqlite3
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "scripts" / "working_on_projects.json"
DEFAULT_OUTPUT = ROOT / "site" / "src" / "data" / "working-on.json"
DEFAULT_T3_DB = Path("~/.t3/userdata/statev2.sqlite").expanduser()

STRIP_DAYS = 31
SHIPPED_DAYS = 7
MAX_SHIPPED = 3
# A day's level: 1 = worked on it without committing (planning, review,
# testing); 2+ = commits that day reached each threshold.
LEVEL_THRESHOLDS = (1, 3, 10)

CONVENTIONAL = re.compile(r"^(?P<type>[a-z]+)(?:\([^)]*\))?!?:\s*(?P<subject>.+)$")
SHOWN_TYPES = {"feat": "feat", "fix": "fix", "perf": "perf"}
# Plain-English subjects that describe bookkeeping rather than shipped work.
NOISE_PREFIX = re.compile(
    r"^(merge|revert|bump|record|document|docs?|test|tests|update changelog|changelog|"
    r"chore|wip|t3 checkpoint|regenerate|format|lint|align|rename)\b",
    re.IGNORECASE,
)
FIX_VERBS = re.compile(r"^(fix|prevent|repair|restore|correct|resolve|stop|handle|keep)\b", re.IGNORECASE)
# Anything that could locate, identify or help attack private infrastructure.
SENSITIVE = re.compile(
    r"(\b(ewr|pdx|iad|lga|sea|ord)\d*\b|\bovh|\bvm ?\d+|\d+ ?(gib|gb|tib|tb)\b|proxmox|\bpve\b|"
    r"tailscale|cloudflare|infisical|secret|token|credential|password|passkey|\bvpn\b|\bssh\b|"
    r"firewall|\.home\b|\.dev\b|\bip(v[46])?\b|\d{1,3}(\.\d{1,3}){3}|private|internal|customer|"
    r"client|vulnerab|exploit|cve-|leak)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Commit:
    day: str
    subject: str


def classify(subject: str, default_kind: str = "feat") -> tuple[str, str] | None:
    """Return (kind, display title) for a publishable subject, else None."""
    subject = subject.strip()
    if not subject or SENSITIVE.search(subject):
        return None
    match = CONVENTIONAL.match(subject)
    if match:
        kind = SHOWN_TYPES.get(match["type"].lower())
        if kind is None:
            return None
        title = match["subject"].strip()
    else:
        if NOISE_PREFIX.match(subject):
            return None
        kind = "fix" if FIX_VERBS.match(subject) else default_kind
        title = subject
    title = title.rstrip(".")
    if len(title) < 8:
        return None
    return kind, title[0].upper() + title[1:]


def select_shipped(
    commits: list[Commit], since: str, default_kind: str = "feat", titles: dict[str, str | None] | None = None,
) -> list[dict[str, str]]:
    """Up to MAX_SHIPPED publishable commits since `since`, newest first.

    `commits` arrive newest first (git log order). `titles` maps a display
    title (case-insensitive) to a replacement, or to None to hide it; a
    replacement takes the project's default kind. New features win over
    fixes so a week of polish doesn't hide what was built, then the picks
    are shown in date order.
    """
    overrides = {key.lower(): value for key, value in (titles or {}).items()}
    seen: set[str] = set()
    candidates: list[dict[str, str]] = []
    for commit in commits:
        if commit.day < since:
            continue
        result = classify(commit.subject, default_kind)
        if result is None:
            continue
        kind, title = result
        if title.lower() in overrides:
            if overrides[title.lower()] is None:
                continue
            kind, title = default_kind, overrides[title.lower()]
        if title.lower() in seen:
            continue
        seen.add(title.lower())
        candidates.append({"kind": kind, "title": title, "date": commit.day})
    picked = sorted(range(len(candidates)), key=lambda i: (candidates[i]["kind"] == "fix", i))[:MAX_SHIPPED]
    return [candidates[i] for i in sorted(picked)]


def day_levels(worked: set[str], commits: list[Commit]) -> dict[str, int]:
    """Each worked day's intensity level (1-4) from that day's commit count."""
    counts: dict[str, int] = {}
    for commit in commits:
        counts[commit.day] = counts.get(commit.day, 0) + 1
    return {day: 1 + sum(counts.get(day, 0) >= t for t in LEVEL_THRESHOLDS) for day in sorted(worked)}


def git_commits(repo: Path, since: str, author_email: str) -> list[Commit]:
    """Committed (local or pushed), non-merge commits by `author_email`, newest first.

    Only branch and remote-tracking refs are read, so T3's checkpoint refs
    (refs/t3/...) never count as work.
    """
    output = subprocess.run(
        [
            "git", "-C", str(repo), "log", "--branches", "--remotes", "--no-merges",
            f"--since={since}T00:00:00", f"--author={author_email}",
            "--date=format-local:%Y-%m-%d", "--format=%ad%x09%s",
        ],
        check=True, capture_output=True, text=True,
    ).stdout
    commits = []
    for line in output.splitlines():
        day, _, subject = line.partition("\t")
        commits.append(Commit(day, subject))
    return commits


def t3_days(db_path: Path, project_titles: list[str], since_utc: str) -> dict[str, set[str]]:
    """Local days on which Shane sent a message in each project's threads."""
    days: dict[str, set[str]] = {title: set() for title in project_titles}
    if not db_path.exists():
        return days
    uri = f"file:{db_path}?mode=ro"
    with sqlite3.connect(uri, uri=True, timeout=30) as conn:
        placeholders = ",".join("?" for _ in project_titles)
        rows = conn.execute(
            f"""
            SELECT p.title, m.created_at
            FROM orchestration_v2_projection_messages m
            JOIN orchestration_v2_projection_threads t ON t.thread_id = m.thread_id
            JOIN projection_projects p ON p.project_id = t.project_id
            WHERE m.role = 'user' AND m.created_at >= ? AND p.title IN ({placeholders})
            """,
            [since_utc, *project_titles],
        )
        for title, created_at in rows:
            when = dt.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            days[title].add(when.astimezone().date().isoformat())
    return days


def build(config: dict, today: dt.date, t3_db: Path, author_email: str) -> dict:
    strip_start = today - dt.timedelta(days=STRIP_DAYS - 1)
    shipped_since = (today - dt.timedelta(days=SHIPPED_DAYS - 1)).isoformat()
    since_utc = dt.datetime.combine(strip_start, dt.time(), dt.datetime.now().astimezone().tzinfo)
    t3 = t3_days(t3_db, [p["t3Project"] for p in config["projects"]], since_utc.astimezone(dt.timezone.utc).isoformat())

    projects = []
    for project in config["projects"]:
        repo = Path(project["repo"]).expanduser()
        commits = git_commits(repo, strip_start.isoformat(), author_email) if (repo / ".git").exists() else []
        worked = {d for d in t3[project["t3Project"]] | {c.day for c in commits}
                  if strip_start.isoformat() <= d <= today.isoformat()}
        if not worked:
            continue
        entry = {
            "name": project["name"],
            "kind": project["kind"],
            "activity": day_levels(worked, commits),
            "lastWorked": max(worked),
            "shipped": select_shipped(
                commits, shipped_since, project.get("defaultKind", "feat"), config.get("titles"),
            ),
        }
        if project.get("href"):
            entry["href"] = project["href"]
        # Most active this week leads: days worked, then commits, then the month.
        week = (sum(d >= shipped_since for d in worked), sum(c.day >= shipped_since for c in commits), len(worked))
        projects.append((week, entry))

    projects.sort(key=lambda item: item[0], reverse=True)
    return {
        "refreshedOn": today.isoformat(),
        "stripStart": strip_start.isoformat(),
        "stripDays": STRIP_DAYS,
        "shippedSince": shipped_since,
        "projects": [entry for _, entry in projects],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--t3-db", type=Path, default=DEFAULT_T3_DB)
    parser.add_argument("--author-email", default="122749779+ShaneKanterman04@users.noreply.github.com")
    parser.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    args = parser.parse_args(argv)

    config = json.loads(args.config.read_text())
    data = build(config, args.today, args.t3_db, args.author_email)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, indent=2) + "\n")
    print(f"wrote {len(data['projects'])} projects to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
