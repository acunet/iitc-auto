# Demo data nyata di layar mobil (emulator AAOS) + bug UI yang ketemu

Tanggal: 2026-10-25

## Yang dikerjakan

1. **Flavor `automotive`** ditambahkan ke `mobile/app/build.gradle` (dimensi `runtime`,
   bersama flavor `projected` yang sudah ada). Alasannya: dua runtime Android for Cars butuh
   artefak berbeda (`app-projected` vs `app-automotive`), dan menggabungkannya bentrok di
   meta-data `CarAppMetadataHolderService.CAR_HARDWARE_MANAGER`. Flavor `automotive` juga
   memakai minSdk 29 (dipaksa `app-automotive`) dan `applicationIdSuffix .automotive`.
2. `mobile/app/src/automotive/AndroidManifest.xml` menambahkan entry point
   `androidx.car.app.activity.CarAppActivity`. Di AAOS, tanpa activity ini car launcher akan
   membuka UI IITC biasa, bukan template mobil.
3. **Tool verifikasi diperluas** (`scripts/cdp-bridge-test.py`):
   `--dump-payload` (ambil payload terakhir dari WebView HP) dan `--inject-payload`
   (kirim payload itu ke instance lain, mis. emulator), plus env `CDP_PORT`.

Alur demo: HP login Ingress → `--dump-payload` (300 portal, 34.428 char, area Citayam/Bogor,
sebaran faksi N:55 E:131 R:56 M:58) → emulator menerima payload yang sama lewat
`--inject-payload` → buka `CarAppActivity` → template `PlaceListMapTemplate` dirender.

Bukti: `docs/notes/img/aaos-real-portals-v1.png` dan `aaos-real-portals-v2.png`

## Dua bug UI yang cuma ketemu dengan melihat layar mobil

1. **Nama portal hilang, tergantikan jarak.** `DistanceSpan` dipasang di *judul* row, dan host
   merender jarak itu sebagai judul — jadi yang tampil `154.5 m`, bukan nama portalnya.
   *Perbaikan:* judul = nama portal (teks biasa), `DistanceSpan` dipindah ke `addText` pertama.
   Terverifikasi: baris sekarang menampilkan `Masjid Roudhotul Jannah` / `154.5 m` / `L1 · neutral`.
2. **"HP 0%" di portal netral.** IITC melaporkan health 0 untuk portal netral, dan kita
   menampilkannya mentah. *Perbaikan:* HP cuma ditampilkan untuk portal berfaksi dan > 0.

## Catatan teknis

- **Kiriman pertama bisa ditolak kalau halaman belum selesai dimuat.** Saat diuji di emulator,
  payload pertama ditolak dengan `sumber bukan intel.ingress.com (null)` karena cache URL
  (diisi `onPageFinished`) belum terisi. Ini tidak berbahaya: bridge mengirim ulang pada refresh
  peta berikutnya. Kalau nanti perlu, bisa ditambah penyembuhan mandiri (baca URL sekali di UI
  thread lalu cache), tapi belum dilakukan karena risikonya nol dan menambah jalur kode.
- **Maksimum 6 baris per halaman.** `PlaceListMapTemplate` membatasi jumlah baris, dan marker di
  peta berasal dari metadata baris itu — jadi praktis maksimum ~6 marker yang tampil sekaligus.
  Di demo, 5 portal terdekat dari pusat bbox kebetulan semuanya netral L1, sehingga marker
  berwarna (E/R/M) tidak muncul walau datanya ada. Ini batas host, bukan bug: kalau ops butuh
  marker berwarna muncul, pilihannya mempersempit bbox (geser peta di HP) atau menandai portal
  sebagai target ops.
- **Izin lokasi harus diberikan ke user driver** (`pm grant --user 10 ...`) kalau memakai
  `setCurrentLocationEnabled(true)` di emulator AAOS; kalau tidak, host mematikan proses app.
