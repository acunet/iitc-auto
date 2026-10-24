#!/usr/bin/env bash
# scripts/aaos-emulator-test.sh — head unit virtual (Android Automotive OS) tanpa HP/mobil.
#
# Alur: pastikan image ada -> bikin AVD (via .bat karena ';') -> boot emulator ->
#       tunggu boot selesai -> install APK probe.
#
# CATATAN JUJUR: ini runtime AAOS (OS mobil tertanam), BUKAN Android Auto projection
# seperti di Jaecoo. Cocok buat ngecek template POI + marker dirender atau nggak,
# bukan bukti bahwa AA di mobil bakal nampilin app sideload ini.
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
  echo "Image AAOS belum ada. Jalankan: bash -c \"$REPO/scripts/install-aaos-image.bat\""
  exit 1
fi

if ! "$EMULATOR" -list-avds 2>/dev/null | grep -qx "$AVD_NAME"; then
  echo "== bikin AVD $AVD_NAME =="
  bash -c "$REPO/scripts/create-aaos-avd.bat"
fi
"$EMULATOR" -list-avds

# Sudah ada emulator jalan? Pakai itu.
if adb devices | grep -q '^emulator-'; then
  echo "emulator sudah jalan"
else
  echo "== boot emulator (AAOS lambat; tunggu sampai boot_completed=1) =="
  "$EMULATOR" -avd "$AVD_NAME" -no-snapshot-save -no-boot-anim -gpu auto -netdelay none -netspeed full > "$REPO/aaos-emulator.log" 2>&1 &
  echo "PID emulator: $!"
fi

DEV=""
for i in $(seq 1 60); do
  DEV=$(adb devices | awk '/^emulator-/ {print $1; exit}')
  if [ -n "$DEV" ] && [ "$(adb -s "$DEV" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    echo "boot selesai: $DEV"; break
  fi
  echo "  ...nunggu boot ($i)"; sleep 10
done

if [ -z "$DEV" ]; then echo "GAGAL: emulator nggak boot"; tail -20 "$REPO/aaos-emulator.log"; exit 1; fi

echo "== install APK probe ke $DEV =="
adb -s "$DEV" install -r "$APK_WIN"
adb -s "$DEV" shell pm list packages | grep portalprobe
echo
echo "Screenshot layar head unit:  adb -s $DEV exec-out screencap -p > shot.png"
