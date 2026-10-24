#!/usr/bin/env bash
# scripts/install-android-tools.sh
# Install cmdline-tools (sdkmanager) + Desktop Head Unit ke Android SDK yang sudah ada.
set -e

source "$(dirname "$0")/env.sh"

CLT_VERSION="16111833"   # versi terbaru di repository2-3.xml per 2026-10-24
CLT_URL="https://dl.google.com/android/repository/commandlinetools-win-${CLT_VERSION}_latest.zip"
TMP="${TMPDIR:-/tmp}/clt-download"
SDK_WIN="C:/Users/mansu/AppData/Local/Android/Sdk"
SDK_MSYS="/c/Users/mansu/AppData/Local/Android/Sdk"

if [ -x "$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat" ]; then
  echo "cmdline-tools sudah ada, skip download"
else
  rm -rf "$TMP" && mkdir -p "$TMP"
  echo "Download $CLT_URL"
  curl -L -o "$TMP/clt.zip" "$CLT_URL"
  # zip-nya berisi folder 'cmdline-tools/'; sdkmanager WAJIB ada di path 'cmdline-tools/latest/'
  unzip -q "$TMP/clt.zip" -d "$TMP"
  rm -rf "$SDK_MSYS/cmdline-tools/latest"
  mkdir -p "$SDK_MSYS/cmdline-tools"
  mv "$TMP/cmdline-tools" "$SDK_MSYS/cmdline-tools/latest"
fi

export SDKMANAGER="$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat"
echo "sdkmanager: $SDKMANAGER"
yes | "$SDKMANAGER" --sdk_root="$SDK_WIN" --licenses >/dev/null || true
"$SDKMANAGER" --sdk_root="$SDK_WIN" "extras;google;auto"
"$SDKMANAGER" --sdk_root="$SDK_WIN" --list_installed

echo "--- verifikasi ---"
ls -l "$SDK_MSYS/extras/google/auto/desktop-head-unit.exe"
