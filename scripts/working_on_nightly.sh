#!/usr/bin/env bash
# Nightly refresh of the homepage "What I'm working on" data, run on the dev
# host by the portfolio-working-on systemd user timer (scripts/systemd/).
#
# Keeps a dedicated clone of the canonical repository and regenerates
# site/src/data/working-on.json with the generator from the tip of the target
# branch. `beta` is protected (no direct pushes; merges need the Validate
# Portfolio checks), so a changed refresh is force-pushed to its own branch and
# working_on_publish.py opens or updates the PR and queues it to merge when the
# checks pass. That merge is a normal beta deploy.
set -euo pipefail

remote=${WORKING_ON_REMOTE:-https://gitea.home.shanekanterman.dev/KanterLabs/portfolio.git}
branch=${WORKING_ON_BRANCH:-beta}
refresh_branch=${WORKING_ON_REFRESH_BRANCH:-chore/working-on-refresh}
checkout=${WORKING_ON_CHECKOUT:-$HOME/.local/state/portfolio-working-on/portfolio}
data=site/src/data/working-on.json

if [ ! -d "$checkout/.git" ]; then
  mkdir -p "$(dirname "$checkout")"
  git clone --quiet --branch "$branch" "$remote" "$checkout"
fi
cd "$checkout"

git fetch --quiet origin "$branch"
git checkout --quiet --force -B "$refresh_branch" "origin/$branch"
git clean -fdq
python3 scripts/working_on.py
if git diff --quiet -- "$data"; then
  echo "working-on: no change"
  exit 0
fi
git add -- "$data"
git commit --quiet -m "chore(working-on): refresh for $(date +%F)"
git push --quiet --force origin "HEAD:refs/heads/$refresh_branch"
python3 scripts/working_on_publish.py \
  --remote-url "$remote" --head "$refresh_branch" --base "$branch" \
  --sha "$(git rev-parse HEAD)" --date "$(date +%F)"
