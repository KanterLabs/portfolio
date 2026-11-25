#!/usr/bin/env bash
# Nightly refresh of the homepage "What I'm working on" data, run on the dev
# host by the portfolio-working-on systemd user timer (scripts/systemd/).
#
# Keeps a dedicated clone of the canonical repository, regenerates
# site/src/data/working-on.json with the generator from the tip of the target
# branch, and pushes a one-file commit when the data changed. That push is a
# normal beta deploy: CI validates, builds and ships it.
set -euo pipefail

remote=${WORKING_ON_REMOTE:-https://gitea.home.shanekanterman.dev/KanterLabs/portfolio.git}
branch=${WORKING_ON_BRANCH:-beta}
checkout=${WORKING_ON_CHECKOUT:-$HOME/.local/state/portfolio-working-on/portfolio}
data=site/src/data/working-on.json

if [ ! -d "$checkout/.git" ]; then
  mkdir -p "$(dirname "$checkout")"
  git clone --quiet --branch "$branch" "$remote" "$checkout"
fi
cd "$checkout"

for attempt in 1 2 3; do
  git fetch --quiet origin "$branch"
  git checkout --quiet --force -B "$branch" "origin/$branch"
  git clean -fdq
  python3 scripts/working_on.py
  if git diff --quiet -- "$data"; then
    echo "working-on: no change"
    exit 0
  fi
  git add -- "$data"
  git commit --quiet -m "chore(working-on): refresh for $(date +%F)"
  if git push --quiet origin "HEAD:$branch"; then
    echo "working-on: pushed $(git rev-parse --short HEAD) to $branch"
    exit 0
  fi
  echo "working-on: push attempt $attempt was rejected; retrying from the new tip" >&2
  sleep 20
done
exit 1
