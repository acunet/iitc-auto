#!/usr/bin/env bash
# scripts/install-android-tools.sh
# Install cmdline-tools (sdkmanager) + Desktop Head Unit ke Android SDK yang sudah ada.
set -e

source "$(dirname "$0")/env.sh"

CLT_VERSION="16111833"   # versi terbaru di repository2-3.xml per 2026-10-24
CLT_URL="https://dl.google.com/android/repository/commandlinetools-win-${CLT_VERSION}_latest.zip"
TOOLS="/c/Users/mansu/dev/tools"
TOOLS_WIN="C:/Users/mansu/dev/tools"
# JANGAN pakai /tmp: di git-bash host ini bare /tmp nggak ada, curl gagal nulis.
# Dua format path: MSYS buat mkdir/unzip (MSYS tools), Windows buat curl (native tool —
# konversi path MSYS dimatikan di host ini, jadi curl nggak ngerti "/c/...").
TMP="$TOOLS/download-cmdline-tools"
TMP_WIN="$TOOLS_WIN/download-cmdline-tools"
SDK_WIN="C:/Users/mansu/AppData/Local/Android/Sdk"
SDK_MSYS="/c/Users/mansu/AppData/Local/Android/Sdk"

if [ -f "$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat" ]; then
  echo "cmdline-tools sudah ada, skip download"
else
  rm -rf "$TMP" && mkdir -p "$TMP"
  echo "Download $CLT_URL"
  curl -L -o "$TMP_WIN/clt.zip" "$CLT_URL"
  # zip-nya berisi folder 'cmdline-tools/'; sdkmanager WAJIB ada di path 'cmdline-tools/latest/'
  unzip -q "$TMP/clt.zip" -d "$TMP"
  rm -rf "$SDK_MSYS/cmdline-tools/latest"
  mkdir -p "$SDK_MSYS/cmdline-tools"
  mv "$TMP/cmdline-tools" "$SDK_MSYS/cmdline-tools/latest"
fi

export SDKMANAGER="$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat"
echo "sdkmanager: $SDKMANAGER"
yes | "$SDKMANAGER" --sdk_root="$SDK_WIN" --licenses >/dev/null || true

# CATATAN: sdkmanager sekarang deprecated (diganti CLI 'android'), dan paket DHU
# "extras;google;auto" sudah nggak bisa di-install lewat sdkmanager (argumen ';' kepecah
# lewat .bat -> "Package extras/google/auto not found"). Jadi DHU diunduh langsung.
DHU_URL="https://dl.google.com/android/repository/desktop-head-unit-windows-x64_r02.0.zip"
DHU_DIR="$SDK_MSYS/extras/google/auto"
if [ -f "$DHU_DIR/desktop-head-unit.exe" ]; then
  echo "DHU sudah ada, skip"
else
  echo "Download DHU $DHU_URL"
  curl -L -o "$TOOLS_WIN/dhu.zip" "$DHU_URL"
  mkdir -p "$DHU_DIR"
  unzip -q -o "$TOOLS/dhu.zip" -d "$DHU_DIR"
fi

"$SDKMANAGER" --sdk_root="$SDK_WIN" --list_installed

echo "--- verifikasi ---"
ls -l "$DHU_DIR/desktop-head-unit.exe"
