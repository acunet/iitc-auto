# Bukti & catatan: IITC jalan di layar mobil, dan jebakan jalur Android Auto

Tanggal: 2026-10-25

## 1. Bug besar yang ketemu dan sudah dibetulkan: APK fork tanpa asset IITC

APK fork IITC Mobile hasil `./gradlew assembleDebug` **tidak punya folder `assets/`** — jadi
userscript IITC-nya nggak ada sama sekali dan app-nya nyangkut di splash screen selamanya.
Di logcat gejalanya cuma setumpuk warning dari
`IITC_FileManager.getAssetFile` → `getScript` → `getResponse` → `IITC_WebViewClient.shouldInterceptRequest`.

Asset itu digenerate oleh build script upstream, bukan oleh Gradle:

```bash
npm install                 # lightningcss CLI dkk (wajib; tanpa ini build.py menolak)
python build.py mobile      # bikin assets/total-conversion-build.user.js + assets/plugins/*
```

Hasilnya: `mobile/app/src/main/assets/total-conversion-build.user.js` (1,5 MB) + folder `plugins`
(~50 user.js), dan `build.py mobile` sekaligus menjalankan `assembleDebug`.

`assets/` dan `node_modules/` sudah ditambahkan ke `.gitignore` (keduanya hasil generate).

## 2. DHU (head unit virtual) MATI untuk Android Auto versi HP user

Android Auto **17.8.663884** di HP user **sudah tidak punya "head unit server"**: pencarian string
di `resources.arsc` dan `classes*.dex` APK-nya menghasilkan 0 kecocokan untuk `head unit server`.
Tanpa server itu, DHU 2.0 nggak bisa connect lewat ADB tunnel (`Waiting for phone...` di jendela DHU),
dan mode USB/AOA (`-u`) juga gagal di mesin ini (`Device 'MSI MYSTIC LIGHT' does not support AOAP`,
`Couldn't find/access compatible USB device`).

Konsekuensi: **uji Android Auto projection cuma bisa di mobil** (atau dengan menurunkan versi AA —
tapi Android Auto versi lama nggak mendukung app parked, jadi trade-off-nya nggak menguntungkan).

## 3. Jalur parked app: TERBUKTI sampai halaman intel termuat

Setelah kategori `android.intent.category.CAR_LAUNCHER` ditambahkan ke activity utama fork
(lihat `parked-app-plan.md`), aplikasi dijalankan di emulator AAOS:

- IITC Mobile muncul dan jalan **fullscreen** di layout layar mobil (1408x792).
- Intro IITC → dialog izin lokasi → activity `IITC_Mobile` (WebView).
- WebView berhasil memuat **intel.ingress.com** dan menampilkan halaman gerbangnya:
  `Welcome to Ingress.` / `Sign in` / `Learn More` / `Niantic Labs` — dengan toolbar IITC
  (hamburger, search, GPS, layer, fullscreen, overflow) di atasnya.

Bukti: `docs/notes/img/iitc-on-car-screen-intro.png`, `docs/notes/img/iitc-intel-on-car-screen.png`

Artinya: begitu user login akun Ingress-nya, **peta IITC penuh bakal tampil di layar mobil**
(pada AAOS terbukti; pada Android Auto projection masih perlu dikonfirmasi di mobil Jaecoo,
termasuk apakah host AA menampilkan app ini dengan badge "P").

## 4. Langkah berikutnya (di mobil, sekali jalan)

1. HP sudah terpasang: `Portal Probe` (peta marker) dan `IITC Mobile Test` (parked).
2. Di HP: Android Auto → Developer settings → **Unknown sources = ON** (developer mode sudah aktif).
3. Sambungkan ke Jaecoo → cari keduanya di launcher AA:
   - **Portal Probe** → peta marker portal (mode nyetir).
   - **IITC Mobile Test** (badge "P") → IITC fullscreen, hanya saat mobil berhenti.
4. Login Ingress di IITC → peta portal muncul di layar 14.8".
