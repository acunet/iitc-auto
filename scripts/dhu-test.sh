#!/usr/bin/env bash
# SPDX-License-Identifier: ISC
# Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
# scripts/dhu-test.sh — test the Android Auto app without a car, using the Desktop Head Unit (DHU).
#
# Flow: install the APK -> make sure the phone is authorized -> open a tunnel to the AA
#       "head unit server" on the phone -> run DHU on the PC (virtual head unit window).
#
# PHONE REQUIREMENTS (one-time manual setup):
#   1. Android Auto > Settings > (overflow) Developer settings > enable "Developer mode"
#   2. In the same overflow menu: "Start head unit server"  <- must be started before every test
#   3. "Unknown sources" enabled if the app is sideloaded
set -e

source "$(dirname "$0")/env.sh" >/dev/null

REPO="/c/Users/mansu/dev/iitc-auto"
DHU="/c/Users/mansu/AppData/Local/Android/Sdk/extras/google/auto/desktop-head-unit.exe"
# Native tools (adb, DHU) need Windows paths, not MSYS ones.
APK_IITC_WIN="C:/Users/mansu/dev/iitc-auto/mobile/app/build/outputs/apk/projected/debug/app-projected-debug.apk"
APK_PROBE_WIN="C:/Users/mansu/dev/iitc-auto/probe/app/build/outputs/apk/debug/app-debug.apk"

D=$(adb devices | awk 'NR>1 && $2=="device" {print $1}' | head -1)
if [ -z "$D" ]; then
  echo "== FAILED: no phone in 'device' state =="
  adb devices -l
  echo "If the status is 'unauthorized': accept the RSA dialog on the phone screen (tick 'Always allow')."
  echo "If it is empty: make sure USB debugging is ON and the cable is connected."
  exit 1
fi
echo "phone: $D ($(adb -s "$D" shell getprop ro.product.model | tr -d '\r'))"

echo "== installing the projected (Android Auto) APK =="
adb -s "$D" install -r "$APK_IITC_WIN"
# The probe is an optional control app: it answers "does this head unit show sideloaded apps
# at all?" without any of our code being involved.
if [ -f "$REPO/probe/app/build/outputs/apk/debug/app-debug.apk" ]; then
  adb -s "$D" install -r "$APK_PROBE_WIN"
fi

echo "== checking Android Auto =="
adb -s "$D" shell pm list packages | grep -i gearhead || echo "WARNING: Android Auto is not visible on this phone"

echo "== opening the tunnel to the head unit server =="
adb -s "$D" forward tcp:5277 tcp:5277

echo "== starting DHU (virtual head unit window) =="
echo "   In that window: look for 'IITC Auto' in the Android Auto launcher."
echo "   If it does not appear: Customize launcher, and check 'Unknown sources' on the phone."
echo "   Evidence without eyes on the screen:"
echo "     powershell -ExecutionPolicy Bypass -File scripts/capture-window.ps1 -ProcessName desktop-head-unit -Path C:/Users/mansu/dev/tools/dhu.png"
# -a 5277 forces the ADB transport. Bare DHU tries USB (AOA), which needs a driver and fails
# with "Couldn't find/access compatible USB device" — that is what happened on the 2026-10-24 run.
"$DHU" -a 5277
