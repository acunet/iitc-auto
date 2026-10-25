#!/usr/bin/env bash
# SPDX-License-Identifier: ISC
# Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
# scripts/aaos-emulator-test.sh — virtual head unit (Android Automotive OS) without a phone/car.
#
# Flow: make sure the image exists -> create the AVD (via .bat because of ';') -> boot the emulator ->
#       wait for boot to finish -> install the probe APK.
#
# HONEST NOTE: this is the AAOS runtime (embedded car OS), NOT Android Auto projection
# like in the Jaecoo. It is good for checking whether the POI template + markers render,
# not proof that AA in a real car will show this sideloaded app.
set -e

source "$(dirname "$0")/env.sh" >/dev/null

REPO="/c/Users/mansu/dev/iitc-auto"
SDK="/c/Users/mansu/AppData/Local/Android/Sdk"
EMULATOR="$SDK/emulator/emulator.exe"
IMAGE_DIR="$SDK/system-images/android-35-ext15/android-automotive-playstore/x86_64"
AVD_NAME="aaos35"
APK="$REPO/probe/app/build/outputs/apk/debug/app-debug.apk"
APK_WIN="C:/Users/mansu/dev/iitc-auto/probe/app/build/outputs/apk/debug/app-debug.apk"  # adb = native tool

if [ ! -d "$IMAGE_DIR" ]; then
  echo "AAOS image not present yet. Run: bash -c \"$REPO/scripts/install-aaos-image.bat\""
  exit 1
fi

if ! "$EMULATOR" -list-avds 2>/dev/null | grep -qx "$AVD_NAME"; then
  echo "== creating AVD $AVD_NAME =="
  bash -c "$REPO/scripts/create-aaos-avd.bat"
fi
"$EMULATOR" -list-avds

# Is an emulator already running? Use that one.
if adb devices | grep -q '^emulator-'; then
  echo "emulator already running"
else
  echo "== booting emulator (AAOS is slow; wait until boot_completed=1) =="
  "$EMULATOR" -avd "$AVD_NAME" -no-snapshot-save -no-boot-anim -gpu auto -netdelay none -netspeed full > "$REPO/aaos-emulator.log" 2>&1 &
  echo "emulator PID: $!"
fi

DEV=""
for i in $(seq 1 60); do
  DEV=$(adb devices | awk '/^emulator-/ {print $1; exit}')
  if [ -n "$DEV" ] && [ "$(adb -s "$DEV" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    echo "boot finished: $DEV"; break
  fi
  echo "  ...waiting for boot ($i)"; sleep 10
done

if [ -z "$DEV" ]; then echo "FAILED: emulator did not boot"; tail -20 "$REPO/aaos-emulator.log"; exit 1; fi

echo "== installing probe APK on $DEV =="
adb -s "$DEV" install -r "$APK_WIN"
adb -s "$DEV" shell pm list packages | grep portalprobe
echo
echo "Head unit screen screenshot:  adb -s $DEV exec-out screencap -p > shot.png"
