#!/usr/bin/env bash
# scripts/dhu-test.sh — tes app Android Auto tanpa mobil, pakai Desktop Head Unit (DHU).
#
# Alur: install APK -> pastikan HP authorized -> buka terowongan ke "head unit server" AA di HP
#       -> jalankan DHU di PC (jendela head unit virtual).
#
# SYARAT DI HP (sekali setup, manual):
#   1. Android Auto > Settings > (overflow) Developer settings > aktifkan "Developer mode"
#   2. Di menu overflow yang sama: "Start head unit server"  <- harus dinyalakan tiap mau tes
#   3. "Unknown sources" aktif kalau app-nya sideload
set -e

source "$(dirname "$0")/env.sh" >/dev/null

REPO="/c/Users/mansu/dev/iitc-auto"
DHU="/c/Users/mansu/AppData/Local/Android/Sdk/extras/google/auto/desktop-head-unit.exe"
APK_PROBE="$REPO/probe/app/build/outputs/apk/debug/app-debug.apk"
APK_IITC="$REPO/mobile/app/build/outputs/apk/debug/app-debug.apk"
# adb itu native tool -> butuh path Windows
APK_PROBE_WIN="C:/Users/mansu/dev/iitc-auto/probe/app/build/outputs/apk/debug/app-debug.apk"
APK_IITC_WIN="C:/Users/mansu/dev/iitc-auto/mobile/app/build/outputs/apk/debug/app-debug.apk"

D=$(adb devices | awk 'NR>1 && $2=="device" {print $1}' | head -1)
if [ -z "$D" ]; then
  echo "== GAGAL: nggak ada HP dalam status 'device' =="
  adb devices -l
  echo "Kalau statusnya 'unauthorized': terima dialog RSA di layar HP (centang 'Always allow')."
  echo "Kalau kosong: pastikan USB debugging ON + kabel tersambung."
  exit 1
fi
echo "HP: $D ($(adb -s "$D" shell getprop ro.product.model | tr -d '\r'))"

echo "== install probe + fork IITC Mobile =="
adb -s "$D" install -r "$APK_PROBE_WIN"
adb -s "$D" install -r "$APK_IITC_WIN"

echo "== cek Android Auto =="
adb -s "$D" shell pm list packages | grep -i gearhead || echo "PERINGATAN: Android Auto nggak kelihatan di HP ini"

echo "== buka terowongan ke head unit server =="
adb -s "$D" forward tcp:5277 tcp:5277

echo "== jalankan DHU (jendela head unit virtual) =="
echo "   Di jendela itu: cari 'Portal Probe' di launcher Android Auto."
echo "   Kalau nggak muncul: Customize launcher. Keluar dari DHU = tutup jendelanya / Ctrl+C."
"$DHU"
