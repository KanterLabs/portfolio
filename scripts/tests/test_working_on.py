from __future__ import annotations

import datetime as dt
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import working_on as wo  # noqa: E402


class ClassifyTest(unittest.TestCase):
    def test_conventional_feat_and_fix_keep_subject_without_scope(self):
        self.assertEqual(wo.classify("feat(hosting): simplify rental pricing"), ("feat", "Simplify rental pricing"))
        self.assertEqual(wo.classify("fix: clarify which offers use defaults."), ("fix", "Clarify which offers use defaults"))

    def test_conventional_bookkeeping_types_are_dropped(self):
        for subject in ("test(network): drive the sites section", "docs(changelog): new entry", "chore: bump deps",
                        "refactor(ui): hand row keys to the table"):
            self.assertIsNone(wo.classify(subject), subject)

    def test_plain_subjects_drop_noise_and_detect_fixes(self):
        self.assertIsNone(wo.classify("Record verified queue memory hold deployment"))
        self.assertIsNone(wo.classify("Document the uptime rollout"))
        self.assertIsNone(wo.classify("t3 checkpoint ref=refs/t3/orchestration-v2/checkpoints/abc/ordinal/1"))
        self.assertEqual(wo.classify("Prevent duplicate runs"), ("fix", "Prevent duplicate runs"))
        self.assertEqual(wo.classify("Keep the toolbar visible"), ("fix", "Keep the toolbar visible"))
        self.assertEqual(wo.classify("Show memory holds on the board", "ops"), ("ops", "Show memory holds on the board"))

    def test_sensitive_subjects_never_publish(self):
        for subject in (
            "Collect uptime observations from PDX1 and IAD1",
            "Persist the guarded 80 GiB strict memory cap",
            "Move private apps to Coolify",
            "Rotate the Cloudflare token",
            "Open SSH on 10.0.0.12",
            "feat: show VPN status on the login page",
            "Fix reboot resilience for .home apps",
        ):
            self.assertIsNone(wo.classify(subject), subject)


class SelectShippedTest(unittest.TestCase):
    def test_features_win_over_fixes_then_shown_newest_first(self):
        commits = [
            wo.Commit("2026-11-25", "fix: tidy the footer"),
            wo.Commit("2026-11-24", "feat: add delivery trucks"),
            wo.Commit("2026-11-24", "fix: keep quotes stable"),
            wo.Commit("2026-11-23", "feat: add bollards"),
            wo.Commit("2026-11-22", "feat: add parcel bins"),
            wo.Commit("2026-11-10", "feat: too old to show"),
        ]
        shipped = wo.select_shipped(commits, "2026-11-19")
        self.assertEqual([s["title"] for s in shipped], ["Add delivery trucks", "Add bollards", "Add parcel bins"])

    def test_title_overrides_rename_or_hide_case_insensitively(self):
        commits = [
            wo.Commit("2026-11-24", "Rebind runtime devices during native boot"),
            wo.Commit("2026-11-23", "fix: keep capacity in the toolbar"),
            wo.Commit("2026-11-22", "feat: add parcel bins"),
        ]
        titles = {"rebind RUNTIME devices during native boot": None, "Keep capacity in the toolbar": "Show capacity in the toolbar"}
        shipped = wo.select_shipped(commits, "2026-11-19", "ops", titles)
        self.assertEqual(
            [(s["kind"], s["title"]) for s in shipped],
            [("ops", "Show capacity in the toolbar"), ("feat", "Add parcel bins")],
        )

    def test_duplicate_titles_from_cherry_picks_appear_once(self):
        commits = [wo.Commit("2026-11-24", "feat: add trucks"), wo.Commit("2026-11-23", "feat: Add trucks")]
        self.assertEqual(len(wo.select_shipped(commits, "2026-11-19")), 1)


class DayLevelsTest(unittest.TestCase):
    def test_levels_rise_with_each_days_commit_count(self):
        commits = [wo.Commit("2026-11-02", "x")] + [wo.Commit("2026-11-03", "x")] * 3 + [wo.Commit("2026-11-04", "x")] * 10
        worked = {"2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"}
        self.assertEqual(
            wo.day_levels(worked, commits),
            {"2026-11-01": 1, "2026-11-02": 2, "2026-11-03": 3, "2026-11-04": 4},
        )


class BuildTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        email = "me@example.com"

        def git(*args, date=None):
            env = {"GIT_AUTHOR_NAME": "Me", "GIT_AUTHOR_EMAIL": email, "GIT_COMMITTER_NAME": "Me",
                   "GIT_COMMITTER_EMAIL": email, "PATH": "/usr/bin:/bin"}
            if date:
                env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = date
            subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True, env=env)

        git("init", "-q", "-b", "main")
        git("commit", "-q", "--allow-empty", "-m", "feat: add the bollard", date="2026-11-24T12:00:00")
        git("commit", "-q", "--allow-empty", "-m", "Persist the 80 GiB EWR1 cap", date="2026-11-23T12:00:00")
        # A checkpoint outside refs/heads must never count.
        git("commit", "-q", "--allow-empty", "-m", "t3 checkpoint", date="2026-11-01T12:00:00")
        git("update-ref", "refs/t3/checkpoint", "HEAD")
        git("reset", "-q", "--hard", "HEAD~1")

        self.db = self.tmp / "state.sqlite"
        with sqlite3.connect(self.db) as conn:
            conn.executescript("""
                CREATE TABLE projection_projects (project_id TEXT, title TEXT);
                CREATE TABLE orchestration_v2_projection_threads (thread_id TEXT, project_id TEXT);
                CREATE TABLE orchestration_v2_projection_messages (thread_id TEXT, role TEXT, created_at TEXT);
                INSERT INTO projection_projects VALUES ('p1', 'game'), ('p2', 'secret-project');
                INSERT INTO orchestration_v2_projection_threads VALUES ('t1', 'p1'), ('t2', 'p2');
                INSERT INTO orchestration_v2_projection_messages VALUES
                  ('t1', 'user', '2026-11-20T15:00:00.000Z'),
                  ('t1', 'assistant', '2026-11-21T15:00:00.000Z'),
                  ('t1', 'user', '2026-09-01T15:00:00.000Z'),
                  ('t2', 'user', '2026-11-22T15:00:00.000Z');
            """)
        self.config = {"projects": [
            {"name": "Game", "kind": "Game", "href": "/game", "t3Project": "game", "repo": str(self.repo)},
            {"name": "Idle", "kind": "Tool", "t3Project": "idle", "repo": str(self.tmp / "missing")},
        ]}
        self.email = email

    def test_build_merges_sources_and_publishes_only_safe_fields(self):
        data = wo.build(self.config, dt.date(2026, 11, 25), self.db, self.email)
        self.assertEqual(data["stripStart"], "2026-10-26")
        self.assertEqual(data["shippedSince"], "2026-11-19")
        self.assertEqual([p["name"] for p in data["projects"]], ["Game"])  # Idle has no days
        game = data["projects"][0]
        self.assertEqual(game["activity"], {"2026-11-20": 1, "2026-11-23": 2, "2026-11-24": 2})
        self.assertEqual(game["lastWorked"], "2026-11-24")
        self.assertEqual(game["shipped"], [{"kind": "feat", "title": "Add the bollard", "date": "2026-11-24"}])
        published = json.dumps(data)
        for leaked in ("secret-project", "EWR1", "checkpoint", str(self.repo)):
            self.assertNotIn(leaked, published)


    def test_projects_most_active_this_week_lead(self):
        busy = self.tmp / "busy"
        busy.mkdir()
        env = {"GIT_AUTHOR_NAME": "Me", "GIT_AUTHOR_EMAIL": self.email, "GIT_COMMITTER_NAME": "Me",
               "GIT_COMMITTER_EMAIL": self.email, "PATH": "/usr/bin:/bin"}
        subprocess.run(["git", "-C", str(busy), "init", "-q", "-b", "main"], check=True, env=env)
        for day in ("2026-11-21", "2026-11-22", "2026-11-23"):
            stamp = {"GIT_AUTHOR_DATE": f"{day}T12:00:00", "GIT_COMMITTER_DATE": f"{day}T12:00:00"}
            subprocess.run(["git", "-C", str(busy), "commit", "-q", "--allow-empty", "-m", "feat: add a thing"],
                           check=True, env={**env, **stamp})
        self.config["projects"].append({"name": "Busy", "kind": "Tool", "t3Project": "busy", "repo": str(busy)})
        data = wo.build(self.config, dt.date(2026, 11, 25), self.db, self.email)
        # Both were worked on three days this week; Busy made more commits, so it leads
        # even though Game was touched more recently.
        self.assertEqual([p["name"] for p in data["projects"]], ["Busy", "Game"])


if __name__ == "__main__":
    unittest.main()
