# IITC Auto

Portal **IITC** (Ingress Intel Total Conversion) di layar **Android Auto** — biar pas ops di
lapangan, portal sekitar dan portal target kelihatan di head unit mobil tanpa harus nyimak HP.

Dibuat buat pemakaian pribadi dengan head unit yang mendukung Android Auto (di sini: Jaecoo J7).
**Bukan** proyek resmi IITC-CE maupun Niantic.

## Dua mode

| Kondisi mobil | Yang tampil | Cara kerjanya |
|---|---|---|
| **Nyetir** | Peta portal di template POI: marker per faksi (R biru / E hijau / M merah / N abu), level, dan jarak; portal target ops selalu ikut walau jauh | `CarAppService` kategori POI + `PlaceListMapTemplate` — petanya digambar host, kita cuma mengirim `Place` marker |
| **Berhenti** | **IITC asli fullscreen** (WebView + plugin apa adanya) | Kategori `android.intent.category.CAR_LAUNCHER` (parked app). Android Auto otomatis mengeluarkan app begitu mobil jalan |

## Cara kerja bridge (mode nyetir)

```
WebView IITC (intel.ingress.com, sesi login milik IITC sendiri)
  └─ assets/iitc-auto-bridge.js      disuntik otomatis setelah IITC selesai boot
       │  hook mapDataRefreshEnd → ambil window.portals → throttle 15 s,
       │  hanya kirim kalau isinya berubah, maksimal 300 portal, plus bbox viewport
       └─ app.sendPortals(json)      JavascriptInterface (di fork ini namanya "app")
            └─ car/PortalBridge      validasi (hanya dari ingress.com, maks 256 KB) + parser
                 └─ car/PortalMapScreen   → PlaceListMapTemplate + marker + DistanceSpan
```

Yang **tidak** dipakai dan kenapa:

- **Bukan WebView background sendiri.** IITC Mobile sudah menangani login Ingress, storage plugin,
  dan sesi WebView-nya; bikin WebView kedua berarti harus menanggung login OAuth yang diblokir
  Google di embedded WebView (`403 disallowed_useragent`) plus masalah Doze/lifecycle. Bridge ini
  menempel di WebView yang sudah ada.
- **Nol request tambahan ke intel.ingress.com.** Data yang dikirim persis data yang sudah diambil
  IITC untuk user; bridge tidak pernah meminta data sendiri dan tidak menggerakkan peta. Ini
  menjaga profil pemakaian intel (dan risiko rate limit/"excessive intel use") tetap sama.
- **Nol izin storage, nol IPC.** Aliran data WebView → layar mobil terjadi di dalam satu proses.

## Status

- **F2 selesai, teruji sebagian.** Bridge + layar peta sudah jalan: `13 test JVM` + `8 test JS`
  hijau, dan render `PlaceListMapTemplate` + marker faksi sudah terbukti di emulator
  Android Automotive OS (lihat `docs/notes/img/`).
- **Belum diuji end-to-end di mobil** (butuh HP login Ingress + head unit). Catatan tiap fase ada di
  [`docs/notes/`](docs/notes/).

## Build

```bash
# prasyarat: JDK 17-21, Android SDK (platform 36), Node
npm install                  # dependency build userscript IITC (lightningcss dll)
python build.py mobile       # generate assets/total-conversion-build.user.js + plugins/
cd mobile && ./gradlew assembleDebug
```

**Penting:** asset userscript IITC (`mobile/app/src/main/assets/total-conversion-build.user.js`
beserta `plugins/`) itu hasil generate, bukan hasil Gradle. Tanpa `python build.py mobile`, APK-nya
kosong dan IITC-nya nyangkut di splash screen. Keduanya sudah masuk `.gitignore`.

Test:

```bash
cd mobile && ./gradlew :app:testDebugUnitTest       # 13 test JVM
node mobile/tests/iitc-auto-bridge.test.mjs         # 8 test logika userscript bridge
```

## Struktur

| Path | Isi |
|---|---|
| `mobile/` | fork app Android (IITC Mobile) + layer Android Auto-nya |
| `mobile/app/src/main/java/org/exarhteam/iitc_mobile/car/` | kode layer Android Auto (Kotlin) |
| `mobile/app/src/main/assets/iitc-auto-bridge.js` | userscript bridge (kode kita, di-commit) |
| `probe/` | probe app kategori POI terpisah: buat ngecek head unit mau nampilin app sideload |
| `docs/superpowers/` | spec desain + rencana implementasi |
| `docs/notes/` | catatan fase, hasil gate, temuan teknis, bukti screenshot |
| `scripts/` | helper build/test/toolchain |

## Lisensi, atribusi, dan etika

Proyek ini **fork** dari [IITC-CE / ingress-intel-total-conversion](https://github.com/IITC-CE/ingress-intel-total-conversion).
Upstream diimpor apa adanya pada commit `b017817df9d753195973ecbddd25a1d036549a7d`
(lihat [`docs/notes/upstream.md`](docs/notes/upstream.md)).

- **Lisensi upstream dipertahankan:** [`LICENSE`](LICENSE) (ISC — © 2018-2020 IITC-CE,
  © 2013-2018 IITC) dan [`ATTRIBUTION.md`](ATTRIBUTION.md) (komponen/plugin pihak ketiga).
  Notis copyright tidak diubah.
- **Perubahan kita didaftarkan** di [`MODIFICATIONS.md`](MODIFICATIONS.md): siapa mengubah apa,
  supaya jelas mana kode upstream dan mana tambahan IITC Auto.
- **Tidak ada klaim endorsee.** Nama "IITC" dan "Ingress" dipakai sebagai penanda asal-usul, bukan
  untuk mengesankan dukungan dari IITC-CE atau Niantic. Ganti nama kalau mau dipakai lebih luas.
- **README upstream tetap tersedia** sebagai `README-UPSTREAM.md`.

### Peringatan yang harus dibaca

1. **IITC dianggap melanggar ToS Ingress.** Niantic menyatakan semua software pihak ketiga
   melanggar ToS; risiko (termasuk ban akun) ditanggung pemakai. Jangan membagikan screenshot dari
   IITC ke kanal resmi Ingress.
2. **Hanya untuk sideload.** App ini tidak bisa masuk Google Play: kategori parked "browser" tidak
   didukung di Android Auto, dan template POI butuh review manual dengan syarat "relevan buat nyetir".
3. **Mode parked hanya saat mobil berhenti** — Android Auto menghentikannya begitu mobil jalan.
   Itu aturan keselamatan Google, bukan pilihan desain kita.
4. Jangan pasang di head unit produksi atau kendaraan yang bukan milik sendiri.

## Kontribusi

Isu dan PR terbuka, tapi prioritasnya pemakaian pribadi: perubahan yang menambah permintaan data ke
intel.ingress.com atau menaikkan frekuensi request akan ditolak.
