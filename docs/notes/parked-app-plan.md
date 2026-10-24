# Rencana dua-mode: IITC asli saat parked, marker saat nyetir

Tanggal: 2026-10-25
Status: keputusan diambil setelah user bilang maunya "UI kaya intel.ingress.com / IITC sendiri,
asal bisa jalan di mobil Jaecoo lewat Android Auto".

## Kenapa perlu dua mode

Android Auto **nggak bisa** menampilkan UI bebas (WebView) sambil mobil jalan — kalau bisa,
Google sendiri bilang itu distraksi. Aturan yang berlaku (dari dokumentasi resmi):

| Kondisi mobil | Yang boleh tampil | Yang bisa kita sajikan |
|---|---|---|
| **Jalan** | Template Car App Library saja | Peta marker portal (POI + `PlaceListMapTemplate`) — sudah terbukti render |
| **Berhenti (parked)** | Activity milik app, full screen, UI bebas | **IITC asli (WebView) fullscreen di layar mobil** |

Dasar hukumnya (training/cars/parked/auto): "On devices running Android 15 or higher, Android Auto
supports running apps in supported parked app categories directly on the head unit" — dan cara
mendaftarkannya cukup menaruh `<category android:name="android.intent.category.CAR_LAUNCHER"/>`
di intent-filter sebuah activity. Android Auto otomatis **mengeluarkan app begitu mobil bergerak**
(parked = hanya saat berhenti).

## Yang sudah dikerjakan

1. `mobile/app/src/main/AndroidManifest.xml` (fork IITC Mobile): kategori `CAR_LAUNCHER` ditambahkan
   ke intent-filter activity utama `IITC_Mobile`. Activity itu **tidak** punya
   `distractionOptimized=true`, sesuai syarat supaya sistem menghentikannya saat mobil jalan.
   Sudah diverifikasi masuk ke APK (`aapt2 dump xmltree` → `android.intent.category.CAR_LAUNCHER`).
2. APK fork (debug) sudah dibangun ulang dan di-install ke HP user (SM-A546E, Android 16).

Artinya: **belum ada kode fitur baru** — cuma satu baris manifest yang mengubah IITC Mobile jadi
app Android Auto parked. Kalau host AA menerima, layar mobil akan menampilkan IITC apa adanya
(peta + plugin-nya) saat mobil berhenti.

## Batasan yang harus diterima (jujur)

- **Parked-only.** Begitu mobil jalan, Android Auto mengeluarkan app-nya. Jadi ini bukan pengganti
  mode nyetir, tapi pelengkap: berhenti di titik ops → buka IITC di layar 14.8" mobil.
- **Nggak bisa masuk Play Store.** Kategori "browsers" cuma didukung di Android Automotive OS,
  nggak di Android Auto; ini murni sideload (pola yang sama dipakai app AAAD seperti AA Browser).
- **Belum diverifikasi empiris.** Apakah host AA mau menampilkan app sideload berkategori parked ini
  harus dibuktikan lewat DHU atau langsung di Jaecoo. Kalau host nolak, jalur ini mati dan yang
  tersisa cuma mode template (marker).
- **IITC = pelanggaran ToS Ingress** (lihat spec §7). Berjalan di layar mobil nggak mengubah itu.

## Cara verifikasi

1. Di HP: Android Auto → **Developer settings** → aktifkan **Developer mode** → **Start head unit server**
   (server ini mati tiap kali AA restart; harus dinyalakan lagi tiap sesi tes).
2. Di PC: `source scripts/env.sh && adb -s <serial> forward tcp:5277 tcp:5277`
   lalu jalankan `desktop-head-unit.exe` (stdin harus dijaga hidup — script DHU kita memakai
   `sleep 3600 |` karena DHU keluar begitu stdin EOF).
3. Cek launcher AA di jendela DHU: harus muncul **IITC Mobile** dengan badge "P" (parked).
4. Tap → kalau IITC (peta portal) muncul fullscreen, jalur parked ini **terbukti**.
