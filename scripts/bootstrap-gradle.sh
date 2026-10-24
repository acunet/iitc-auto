#!/usr/bin/env bash
# scripts/bootstrap-gradle.sh
# Mesin ini nggak punya `gradle` di PATH. Unduh distribusi Gradle 8.13 sekali
# (di luar repo) supaya bisa generate wrapper yang nanti di-commit.
set -e

TOOLS="/c/Users/mansu/dev/tools"
TOOLS_WIN="C:/Users/mansu/dev/tools"   # curl itu native tool: butuh path Windows
DIST="$TOOLS/gradle-8.13"
mkdir -p "$TOOLS"

if [ ! -f "$DIST/bin/gradle" ]; then
  curl -L -o "$TOOLS_WIN/gradle-8.13-bin.zip" https://services.gradle.org/distributions/gradle-8.13-bin.zip
  unzip -q -o "$TOOLS/gradle-8.13-bin.zip" -d "$TOOLS"
fi

"$DIST/bin/gradle" --version
