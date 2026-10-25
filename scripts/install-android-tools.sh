#!/usr/bin/env bash
# SPDX-License-Identifier: ISC
# Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
# scripts/install-android-tools.sh
# Install cmdline-tools (sdkmanager) + Desktop Head Unit into the existing Android SDK.
set -e

source "$(dirname "$0")/env.sh"

CLT_VERSION="16111833"   # newest version in repository2-3.xml as of 2026-10-24
CLT_URL="https://dl.google.com/android/repository/commandlinetools-win-${CLT_VERSION}_latest.zip"
TOOLS="/c/Users/mansu/dev/tools"
TOOLS_WIN="C:/Users/mansu/dev/tools"
# Do NOT use /tmp: on this git-bash host a bare /tmp does not exist, so curl fails to write.
# Two path formats: MSYS for mkdir/unzip (MSYS tools), Windows for curl (native tool —
# MSYS path conversion is disabled on this host, so curl does not understand "/c/...").
TMP="$TOOLS/download-cmdline-tools"
TMP_WIN="$TOOLS_WIN/download-cmdline-tools"
SDK_WIN="C:/Users/mansu/AppData/Local/Android/Sdk"
SDK_MSYS="/c/Users/mansu/AppData/Local/Android/Sdk"

if [ -f "$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat" ]; then
  echo "cmdline-tools already present, skipping download"
else
  rm -rf "$TMP" && mkdir -p "$TMP"
  echo "Download $CLT_URL"
  curl -L -o "$TMP_WIN/clt.zip" "$CLT_URL"
  # the zip contains a 'cmdline-tools/' folder; sdkmanager MUST live at 'cmdline-tools/latest/'
  unzip -q "$TMP/clt.zip" -d "$TMP"
  rm -rf "$SDK_MSYS/cmdline-tools/latest"
  mkdir -p "$SDK_MSYS/cmdline-tools"
  mv "$TMP/cmdline-tools" "$SDK_MSYS/cmdline-tools/latest"
fi

export SDKMANAGER="$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat"
echo "sdkmanager: $SDKMANAGER"
yes | "$SDKMANAGER" --sdk_root="$SDK_WIN" --licenses >/dev/null || true

# NOTE: sdkmanager is now deprecated (replaced by the 'android' CLI), and the DHU package
# "extras;google;auto" can no longer be installed through sdkmanager (the ';' argument gets
# split via the .bat -> "Package extras/google/auto not found"). So DHU is downloaded directly.
DHU_URL="https://dl.google.com/android/repository/desktop-head-unit-windows-x64_r02.0.zip"
DHU_DIR="$SDK_MSYS/extras/google/auto"
if [ -f "$DHU_DIR/desktop-head-unit.exe" ]; then
  echo "DHU already present, skipping"
else
  echo "Download DHU $DHU_URL"
  curl -L -o "$TOOLS_WIN/dhu.zip" "$DHU_URL"
  mkdir -p "$DHU_DIR"
  unzip -q -o "$TOOLS/dhu.zip" -d "$DHU_DIR"
fi

"$SDKMANAGER" --sdk_root="$SDK_WIN" --list_installed

echo "--- verify ---"
ls -l "$DHU_DIR/desktop-head-unit.exe"
