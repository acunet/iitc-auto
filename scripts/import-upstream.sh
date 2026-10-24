#!/usr/bin/env bash
# scripts/import-upstream.sh — impor tree upstream IITC-CE ke repo ini (fork by content).
#
# Catatan: `rsync` nggak ada di git-bash host ini, jadi pakai tar.
# Yang dikecualikan: .git upstream, .github, README.md (README kita dipertahankan,
# versi upstream disimpan sebagai README-UPSTREAM.md), dan .gitignore (punya kita lebih relevan).
set -e

REPO="/c/Users/mansu/dev/iitc-auto"
REPO_WIN="C:/Users/mansu/dev/iitc-auto"          # git itu native tool: butuh path Windows
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
printf 'upstream=%s\nsha=%s\ntanggal_import=%s\n' \
  "$UPSTREAM" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REPO/docs/notes/upstream.md"

echo "selesai. Cek: git -C $REPO status --short | head -20"
