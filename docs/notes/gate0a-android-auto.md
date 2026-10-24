# Gate 0a — uji app Android Auto tanpa mobil (emulator Android Automotive OS)

Status: **LULUS untuk rendering template di AAOS** (2026-10-24). Uji di Android Auto projection
(mobil Jaecoo / DHU) **belum** dilakukan — butuh HP di-authorize + head unit server.

Bukti: `docs/notes/img/aaos-probe-render.png`

## Yang akhirnya tampil

`PlaceListMapTemplate` dirender di head unit virtual AAOS (emulator `system-images;android-35-ext15;
android-automotive-playstore;x86_64`, AVD `aaos35`, display utama 1408x792):

- Judul **"Portal Probe"** di header.
- **Peta Google** (host yang menggambar) area Monas/Jakarta Pusat.
- **3 marker** sesuai faction: biru (R), hijau (E), putih/abu (N).
- **3 baris daftar** dengan distance span: `R · 210 m · L8 · R`, `E · 640 m · L6 · E`, `N · 980 m · L1 · N`.

Catatan: isi baris yang terbaca host adalah **label marker + jarak + teks tambahan**, sementara judul
row (nama portal) nggak muncul di baris itu. Ini perlu diperiksa lagi di F4 — kemungkinan karena
`DistanceSpan` ditempel di judul, host memakai judul itu sebagai teks jarak. Kandidat solusi: taruh span
di `addText()` dan biarkan judul tetap teks biasa.

## Lima bug nyata yang ketemu (semuanya runtime, bukan compile-time)

Semua pesan errornya di logcat tag **`CarApp.H.Tem`**, dan host mematikan proses app kita begitu
salah satu dilanggar. Urutannya persis begini:

1. `IllegalArgumentException: Min API level not declared in manifest (androidx.car.app.minCarApiLevel)`
   → `<application>` wajib punya `<meta-data android:name="androidx.car.app.minCarApiLevel" android:value="1"/>`.
2. `IllegalArgumentException: All non-browsable rows must have a distance span attached to either its title or texts`
   → setiap row `PlaceListMapTemplate` wajib punya `DistanceSpan`. Cara menempelkannya (bukan lewat
   argumen `CarText.create`): `SpannableString(name)` + `setSpan(DistanceSpan.create(Distance.create(m, Distance.UNIT_METERS)), 0, length, 0)` lalu `CarText.create(spannable)`.
3. `MISSING_PERMISSION: The car app does not have the required location permission(s)` → proses app mati.
   Penyebab: `setCurrentLocationEnabled(true)` tanpa izin lokasi. Perlu `ACCESS_FINE_LOCATION` +
   `ACCESS_COARSE_LOCATION` di manifest **dan** grant di user driver:
   `adb shell pm grant --user 10 <pkg> android.permission.ACCESS_FINE_LOCATION`.
   Grant tanpa `--user` masuk ke user 0 (AAOS menjalankan driver di user 10) dan nggak ngefek.
4. App nggak muncul sebagai car app / tap-nya malah buka activity biasa
   → AAOS butuh entry point `androidx.car.app.activity.CarAppActivity` (dari `androidx.car.app:app-automotive`,
   **minSdk 29**) dengan filter `LAUNCHER`; activity biasa milik app justru harus **tanpa** filter LAUNCHER.
5. `app-projected` + `app-automotive` di satu varian → benturan meta-data
   `CarAppMetadataHandlerService.CAR_HARDWARE_MANAGER` → dipisah dengan **product flavor**
   (`projected` minSdk 24, `automotive` minSdk 29). Ini juga pola yang bakal dipakai app asli
   (IITC Mobile sendiri minSdk 21).

## Reproduksi cepat

```bash
source scripts/env.sh
bash scripts/aaos-emulator-test.sh                 # boot AVD + install APK automotive
adb -s emulator-5554 shell pm grant --user 10 id.acunet.portalprobe android.permission.ACCESS_FINE_LOCATION
adb -s emulator-5554 shell am start -n id.acunet.portalprobe/androidx.car.app.activity.CarAppActivity
adb -s emulator-5554 logcat -d -s 'CarApp.H.Tem' | head -3      # cek error host
adb -s emulator-5554 shell screencap -p -d <displayId> /sdcard/x.png && adb -s emulator-5554 pull /sdcard/x.png <path->
```

Catatan emulator: lokasi GPS AVD belum diset, jadi "posisi sekarang" mobil nggak akurat — distance span
di uji ini memakai angka dummy dari `ProbeData`.

## Kenapa uji ini bukan bukti final

Emulator ini runtime **AAOS (OS mobil tertanam)**; Jaecoo J7 memakai **Android Auto projection**
(HP di-mirror ke head unit). Menghadap-hadapkan template host bisa beda (versi host, aturan
kategori, dan jalur sideload `Unknown sources`). Yang sudah terbukti dari uji ini: **kontrak template
kita valid dan marker + distance span dirender**. Yang masih harus dibuktikan di mobil: apakah host
Android Auto mau menampilkan app sideload sama sekali (itu Gate 0a yang sebenarnya, jalur DHU).
