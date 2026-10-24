#!/usr/bin/env bash
# scripts/create-aaos-avd.sh — bikin AVD Android Automotive OS + jalankan emulatornya.
# Dipakai kalau mau "head unit virtual" tanpa HP/mobil (fokus tes render template, bukan Android Auto projection).
set -e

source "$(dirname "$0")/env.sh" >/dev/null

SDK="/c/Users/mansu/AppData/Local/Android/Sdk"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager.bat"
EMULATOR="$SDK/emulator/emulator.exe"
IMAGE="system-images;android-35-ext15;android-automotive-playstore;x86_64"
AVD_NAME="aaos35"

if [ ! -d "$SDK/system-images/android-35-ext15/android-automotive-playstore/x86_64" ]; then
  echo "== image AAOS belum ada. Jalankan dulu: bash -c \"$PWD/scripts/install-aaos-image.bat\" =="
  exit 1
fi

if "$EMULATOR" -list-avds 2>/dev/null | grep -qx "$AVD_NAME"; then
  echo "AVD '$AVD_NAME' sudah ada"
else
  echo "== bikin AVD $AVD_NAME =="
  echo no | "$AVDMANAGER" create avd -n "$AVD_NAME" -k "$IMAGE" -d automotive_1024p_landscape --force
fi

echo "== boot emulator (butuh beberapa menit; AVD ini lambat) =="
"$EMULATOR" -avd "$AVD_NAME" -no-snapshot-save -gpu auto &
echo "PID emulator: $!"
echo "Setelah boot: adb wait-for-device; lalu install APK probe dan cari 'Portal Probe' di car launcher."
