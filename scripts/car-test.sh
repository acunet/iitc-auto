#!/usr/bin/env bash
# SPDX-License-Identifier: ISC
# Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
# scripts/car-test.sh — collect the evidence from a car test, AFTER the drive.
#
# Why after: while driving, the phone is plugged into the car, so adb is not reachable from the PC.
# Android keeps its log buffers, and our car side logs its session, so plugging the phone back into
# the PC and running this script is enough to answer the only open question:
# "does the car's Android Auto launcher actually show IITC Auto?"
#
# Usage: plug the phone in, then:  bash scripts/car-test.sh
set -e

source "$(dirname "$0")/env.sh" >/dev/null

REPO="/c/Users/mansu/dev/iitc-auto"
OUT="$REPO/docs/notes/car-test-$(date +%Y%m%d-%H%M).txt"
PKG="org.exarhteam.iitc_mobile.debug"

D=$(adb devices | awk 'NR>1 && $2=="device" {print $1}' | grep -v emulator | head -1)
if [ -z "$D" ]; then
  echo "== FAILED: no phone in 'device' state =="
  adb devices -l
  echo "Plug the phone into the PC (USB debugging on) and run this again."
  exit 1
fi

{
  echo "== IITC Auto car test evidence =="
  echo "captured: $(date)"
  echo "device:   $D ($(adb -s "$D" shell getprop ro.product.model | tr -d '\r'), Android $(adb -s "$D" shell getprop ro.build.version.release | tr -d '\r'))"
  echo "android auto: $(adb -s "$D" shell dumpsys package com.google.android.projection.gearhead 2>/dev/null | grep -m1 versionName | tr -d '\r')"
  echo
  echo "== 1. did the car host open our car app? =="
  adb -s "$D" logcat -d -s iitc-auto-car 2>/dev/null | tail -20 || true
  echo
  echo "== 2. bridge: portal data + ops targets on the phone side =="
  adb -s "$D" logcat -d -s iitcm 2>/dev/null | grep -iE 'bridge:|ops target' | tail -20 || true
  echo
  echo "== 3. Android Auto / car host side =="
  adb -s "$D" logcat -d 2>/dev/null | grep -iE 'carapp|car app|gearhead.*(launch|bind|session)|carservice' | tail -30 || true
  echo
  echo "== 4. ops targets stored on the phone =="
  adb -s "$D" shell run-as "$PKG" cat "/data/data/$PKG/shared_prefs/iitc_auto_targets.xml" 2>/dev/null || echo "(none)"
  echo
  echo "== verdict =="
  if adb -s "$D" logcat -d -s iitc-auto-car 2>/dev/null | grep -q 'session opened'; then
    echo "PASS: the car host opened IITC Auto's CarAppService (the launcher lists it)."
    if adb -s "$D" logcat -d -s iitcm 2>/dev/null | grep -q 'payload accepted'; then
      echo "PASS: portal data reached the phone side while the car was connected."
    else
      echo "NOTE: no accepted payload in the log buffer - pan the IITC map before the car test."
    fi
  else
    echo "NO EVIDENCE: the host never opened our car app."
    echo "Check on the phone: Android Auto > Developer settings > 'Unknown sources' enabled, and"
    echo "Android Auto > Customize launcher > IITC Auto ticked."
  fi
} | tee "$OUT"

echo
echo "saved: $OUT"
