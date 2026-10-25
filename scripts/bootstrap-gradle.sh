#!/usr/bin/env bash
# scripts/bootstrap-gradle.sh
# This machine has no `gradle` on PATH. Download the Gradle 8.13 distribution once
# (outside the repo) so a wrapper can be generated and then committed.
set -e

TOOLS="/c/Users/mansu/dev/tools"
TOOLS_WIN="C:/Users/mansu/dev/tools"   # curl is a native tool: it needs a Windows path
DIST="$TOOLS/gradle-8.13"
mkdir -p "$TOOLS"

if [ ! -f "$DIST/bin/gradle" ]; then
  curl -L -o "$TOOLS_WIN/gradle-8.13-bin.zip" https://services.gradle.org/distributions/gradle-8.13-bin.zip
  unzip -q -o "$TOOLS/gradle-8.13-bin.zip" -d "$TOOLS"
fi

"$DIST/bin/gradle" --version
