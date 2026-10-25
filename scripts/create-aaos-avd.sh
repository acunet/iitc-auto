#!/usr/bin/env bash
# SPDX-License-Identifier: ISC
# Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
# scripts/create-aaos-avd.sh — create an Android Automotive OS AVD and run its emulator.
# Used when a "virtual head unit" is needed without a phone/car (tests template rendering, not Android Auto projection).
set -e

source "$(dirname "$0")/env.sh" >/dev/null

SDK="/c/Users/mansu/AppData/Local/Android/Sdk"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager.bat"
EMULATOR="$SDK/emulator/emulator.exe"
IMAGE="system-images;android-35-ext15;android-automotive-playstore;x86_64"
AVD_NAME="aaos35"

if [ ! -d "$SDK/system-images/android-35-ext15/android-automotive-playstore/x86_64" ]; then
  echo "== AAOS image is missing. Run this first: bash -c \"$PWD/scripts/install-aaos-image.bat\" =="
  exit 1
fi

if "$EMULATOR" -list-avds 2>/dev/null | grep -qx "$AVD_NAME"; then
  echo "AVD '$AVD_NAME' already exists"
else
  echo "== creating AVD $AVD_NAME =="
  echo no | "$AVDMANAGER" create avd -n "$AVD_NAME" -k "$IMAGE" -d automotive_1024p_landscape --force
fi

echo "== booting the emulator (takes a few minutes; this AVD is slow) =="
"$EMULATOR" -avd "$AVD_NAME" -no-snapshot-save -gpu auto &
echo "emulator PID: $!"
echo "After boot: adb wait-for-device; then install the probe APK and look for 'Portal Probe' in the car launcher."
