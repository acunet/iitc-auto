#!/usr/bin/env bash
# SPDX-License-Identifier: ISC
# Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
# scripts/import-upstream.sh — import the IITC-CE upstream tree into this repo (fork by content).
#
# Note: `rsync` is not available on this git-bash host, so tar is used instead.
# Excluded: upstream .git, .github, README.md (our README is kept, the
# upstream version is saved as README-UPSTREAM.md), and .gitignore (ours is more relevant).
set -e

REPO="/c/Users/mansu/dev/iitc-auto"
REPO_WIN="C:/Users/mansu/dev/iitc-auto"          # git is a native tool: it needs a Windows path
UPSTREAM="https://github.com/IITC-CE/ingress-intel-total-conversion.git"
TMP="/c/Users/mansu/dev/tools/upstream-iitc"
TMP_WIN="C:/Users/mansu/dev/tools/upstream-iitc"

git -C "$REPO_WIN" remote add upstream "$UPSTREAM" 2>/dev/null || true
git -C "$REPO_WIN" remote set-url upstream "$UPSTREAM"

if [ -d "$TMP/.git" ]; then
  git -C "$TMP_WIN" fetch --depth 1 origin master
  git -C "$TMP_WIN" reset --hard FETCH_HEAD
else
  git clone --depth 1 "$UPSTREAM" "$TMP_WIN"
fi

SHA=$(git -C "$TMP_WIN" rev-parse HEAD)
echo "upstream SHA=$SHA"

cd "$TMP"
tar cf - \
  --exclude='./.git' --exclude='./.github' --exclude='./README.md' --exclude='./.gitignore' \
  . | ( cd "$REPO" && tar xf - )

cp "$TMP/README.md" "$REPO/README-UPSTREAM.md"

mkdir -p "$REPO/docs/notes"
printf 'upstream=%s\nsha=%s\nimport_date=%s\n' \
  "$UPSTREAM" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REPO/docs/notes/upstream.md"

echo "done. Check: git -C $REPO status --short | head -20"
