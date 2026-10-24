# IITC → Android Auto: Portal Glance Map — Design Spec

**Tanggal:** 2026-10-24
**Status:** disetujui di chat (2026-10-24), jadi basis implementation plan
**Hardware target:** Jaecoo J7 (head unit 14.8", wireless Android Auto) + HP Android user
**Repo:** `C:\Users\mansu\dev\iitc-auto`

---

## 1. Masalah & tujuan

Pas ops di lapangan, tim perlu tau portal mana yang ada di sekitar tanpa harus lihat HP.
Layar mobil (Android Auto) tidak bisa menampilkan IITC apa adanya: Android Auto cuma
menerima UI berbentuk *template* dari Car App Library, bukan WebView/DOM bebas.

**Tujuan:** portal di sekitar posisi + portal target ops tampil sebagai marker di peta
layar mobil, glance-able sambil nyetir (posisi, faction, level).

**Non-goals (sengaja tidak dikerjakan):**

- Pengganti IITC di HP (IITC Mobile tetap dipakai apa adanya untuk kerja detail).
- App untuk publik / Google Play.
- Auto-follow GPS yang terus panning intel map (pemicu rate limit).
- Chat/COMMS, deployment planner, atau fitur plugin IITC lain.
- Pan/zoom peta bebas seperti IITC (dibatasi platform, lihat §4).

---

## 2. Fakta platform yang mengikat desain

| Fakta | Konsekuensi desain | Sumber |
|---|---|---|
| Android Auto hanya menampilkan template dari AndroidX Car App Library; kategori yang diizinkan untuk mobil: Media, Messaging, Calling, Navigation, POI, IOT, Weather, Games | App kita harus salah satu kategori template ⇒ **POI** | developer.android.com/training/cars/apps/library |
| `PlaceListMapTemplate` (kategori POI, izin `androidx.car.app.MAP_TEMPLATES`) = peta **digambar host** (Google Maps), app cuma mengirim `Place`/marker | Pilih ini: murah, nggak perlu renderer tile sendiri | developer.android.com/training/cars/apps/poi |
| `MapWithContentTemplate` / `NavigationTemplate` = app menggambar sendiri ke `Surface` via `SurfaceCallback` (API level 7) | Tidak dipakai: WebView IITC nggak bisa dipindah ke Surface, artinya harus tulis renderer tile dari nol | developer.android.com/training/cars/apps/library/draw-maps |
| Kategori NAVIGATION wajib punya turn-by-turn (NF-1), voice/cluster metadata (NF-3/NF-4), intent nav (NF-6) | App peta portal nggak mungkin lolos sebagai Navigation | developer.android.com/docs/quality-guidelines/car-app-quality |
| Interaksi peta penuh (pan/zoom/tap) hanya di template navigation: `Navigation`, `RoutePreview`, `Map`, `PlaceList(navigation)` | Di `PlaceListMapTemplate` kita hanya bisa auto-center (`fitToBounds`); user nggak bisa nge-pan bebas. Ini batas Google, bukan batas kita | developers.google.com/cars/design/.../plan-task-flows |
| Review Play untuk app mobil itu manual + syarat POI `PF-1` "meaningful functionality relevant to driving" | Distribusi = **sideload** (AA developer mode + Unknown sources), bukan Play | support.google.com/googleplay/android-developer/answer/18058043 |
| Google memblokir OAuth di embedded WebView (`403 disallowed_useragent`); ini bug nyata di IITC Mobile sendiri, workaround-nya login lewat browser dulu | Jangan pernah bikin WebView/login sendiri ⇒ **login tetap milik IITC Mobile** | github.com/IITC-CE/.../issues/402 |
| Android Auto bisa menjalankan app sideload yang nggak dari sumber terpercaya lewat developer option "Unknown sources"; ada laporan Jun 2026 sideload app nggak muncul di launcher walau opsi itu aktif | Harus ada **Gate 0** sebelum nulis fitur sungguhan | developer.android.com/training/cars/testing |

**Mengenai ToS:** Niantic menganggap IITC dan semua software third-party melanggar Ingress
ToS. Project ini mewarisi risiko itu (risiko ban akun kecil tapi nyata). Konsekuensi desain:
**nol request intel tambahan** (§3 disiplin rate limit) supaya profil pemakaian user nggak
berubah dari yang sudah dia lakukan sekarang.

---

## 3. Arsitektur

**Keputusan: satu APK = fork IITC Mobile + `CarAppService` di APK yang sama.**

```
 HP (satu APK, satu proses)                                   Layar mobil (Android Auto)
┌───────────────────────────────────────────────┐           ┌──────────────────────────┐
│ IITC Mobile (upstream)                        │           │ PlaceListMapTemplate     │
│  WebView ─ intel.ingress.com + IITC core      │           │  peta: digambar host     │
│    │  window.portals (data portal)            │           │  marker: dari Place list │
│    │  hook: mapDataRefreshEnd                 │           └──────────▲───────────────┘
│    ▼                                          │                      │ Place[] + fitToBounds
│ plugin: android-auto-bridge.user.js           │                      │
│    │  filter bbox, throttle, serialisasi JSON │                      │
│    ▼  android.sendPortals(json)   ← bridge BARU│                     │
│ IITC_JSInterface.sendPortals(String)          │                      │
│    ▼                                          │                      │
│ PortalRepository (StateFlow<List<Portal>>)  ──┼──────────────────────┘
│    ▲                                          │        IitcCarAppService → PortalMapScreen
│ OpsTargetStore (daftar guid target ops)       │
└───────────────────────────────────────────────┘
```

**Komponen:**

| Unit | Tanggung jawab | Interface |
|---|---|---|
| `IITC_JSInterface.sendPortals(String json)` *(baru, di fork)* | Terima payload dari userscript, validasi origin + ukuran, teruskan ke repository | `@JavascriptInterface fun sendPortals(json: String)` |
| `PortalRepository` | Parse JSON → state; hitung staleness | `val portals: StateFlow<PortalSnapshot>` |
| `OpsTargetStore` | Simpan daftar guid target ops (+label) | `val targets: StateFlow<Set<String>>` |
| `android-auto-bridge.user.js` | Hook `mapDataRefreshEnd`, filter bbox, throttle, serialisasi | `android.sendPortals(json)` |
| `IitcCarAppService` / `PortalMapScreen` | Susun template + marker dari state | `Screen.onGetTemplate(): Template` |
| `PortalJsonParser` | JSON → `List<Portal>` (murni, unit-testable) | `parse(json: String): ParseResult` |

**Kenapa fork, bukan cuma userscript di IITC Mobile resmi:** method yang sudah diekspos
upstream terbatas (`intentPosLink`, `shareString`, `copy`, `saveFile`, `getFileRequestUrlPrefix`,
`setFollowMode`, `addPane`, `setLayers`, `setProgress`, `setPermalink`, `reloadIITC`,
`addInternalHostname` — dibaca dari `mobile/app/src/main/java/org/exarhteam/iitc_mobile/IITC_JSInterface.java`).
`saveFile()` membuka dialog simpan file (manual, nggak bisa dipakai sync), `copy()` cuma
clipboard, `shareString()` buka chooser. Nggak ada jalur data mentah ke native ⇒ nambah satu
method baru adalah perubahan terkecil yang bener.

**Kenapa satu APK, bukan dua app:** (a) nggak ada urusan izin storage / file sharing,
(b) `sendPortals` dikirim in-process (nggak ada IPC/service binding), (c) satu artefak buat
di-sideload, (d) `CarAppService` boleh nempel di APK yang juga punya activity launcher biasa.

---

## 4. Kontrak data

Payload bridge, versi 1 (JSON, max 256 KB):

```json
{
  "v": 1,
  "ts": 1761300000000,
  "bbox": [south, west, north, east],
  "portals": [
    { "g": "<portal guid>", "n": "Nama Portal", "lat": -6.2245, "lng": 106.8091,
      "t": "R", "l": 8, "hp": 87 }
  ]
}
```

- `t`: `R` (Resistance/biru), `E` (Enlightened/hijau), `M` (Machina/merah), `N` (neutral/abu).
- Sumber di sisi IITC: `window.portals[guid].options.data` (tersedia `latE6`, `lngE6`, `team`,
  `level`, `title`, `health`). **Nama field persisnya diverifikasi di Gate 0b** — kalau beda,
  adapter-nya di plugin yang berubah, bukan kontraknya.
- Portal yang dikirim = yang **sudah** keload IITC di viewport user. Tidak ada request baru ke intel.

**Disiplin rate limit (bagian dari desain, bukan optimisasi belakangan):**

- Throttle kirim: minimal 15 detik antar payload, dan hanya kalau isi berubah (bandingkan hash).
- Batas 300 portal terdekat dari pusat bbox.
- Kalau user nggak buka IITC Mobile, bridge nggak jalan sama sekali (nggak ada polling GPS).
- Bbox diambil dari viewport IITC saat itu; app mobil nggak pernah minta data sendiri.

---

## 5. Perilaku UI

**Screen 1 — root ("Portal sekitar"):** `PlaceListMapTemplate`
- `fitToBounds` ke bbox payload → peta langsung nyorot area ops.
- Marker = `Place` per portal; target ops pakai `PlaceMarker` beda warna + label "TARGET".
- List (max 6 baris/halaman, sesuai batasan template): target ops ditaruh paling atas,
  row = `"CG Sudirman Selatan"` / `"L8 · R · 240 m"`.
- Tap row → Screen 2.

**Screen 2 — detail portal:** `PaneTemplate` + judul
- Faction, level, health, guid, terakhir update (umur data), plus aksi "buka di HP"
  (`intentPosLink`-style deep link ke IITC Mobile — pakai `ParkedOnlyOnClickListener`
  biar nggak aktif sambil nyetir).

**Kondisi khusus:**

| Kondisi | Tampilan |
|---|---|
| `now - ts > 120 s` | Header "data lama · X menit lalu" + marker diredupkan |
| Belum ada payload sama sekali | `MessageTemplate`: "Belum ada data. Buka IITC Mobile di HP dan geser ke area ops." |
| Payload invalid | Drop + tulis log, layar tetap nampilin payload valid terakhir |
| Portal 0 dalam bbox | Peta tanpa marker + pesan "nggak ada portal kebaca di area ini" |

Batasan template yang dipatuhi: maks 5 level screen, nggak ada teks berjalan/animasi,
target sentuh gede, nggak ada keyboard sambil nyetir.

---

## 6. Penanganan error

- **WebView IITC mati / HP ngunci lama:** state tetap ada di memori; kalau proses mati,
  `PortalRepository` pulih kosong → screen nampilin kondisi "belum ada data", bukan crash.
- **Login expired:** plugin tetap mengirim cache terakhir; app menandai data stale.
- **Bridge dipanggil dari halaman lain (bukan intel.ingress.com):** diabaikan + log.
- **Payload kebesaran/JSON rusak:** ditolak sebelum parse, dicatat, nggak pernah bikin crash.
- **Android Auto nggak terhubung:** `CarAppService` nggak dipanggil; APK tetap berfungsi
  sebagai IITC Mobile biasa.

---

## 7. Keamanan & kepatuhan

- App **nggak pernah** menangani credential Ingress; login 100% di IITC Mobile.
- `sendPortals` hanya menerima dari origin IITC, payload dibatasi ukuran dan hanya boleh
  menulis ke `PortalRepository` (nggak ada path file, nggak ada eksekusi).
- Nggak ada request intel tambahan dari sisi kita (lihat §4).
- ToS: pelanggaran ToS Niantic; risiko ban ditanggung user. APK ini personal — kalau
  dibagikan ke tim, tiap anggota harus tau risikonya.
- Distribusi: sideload APK yang di-sign sendiri; update manual (install ulang APK baru).
  Nggak di-upload ke Play.

---

## 8. Strategi testing

| Lapis | Alat | Yang diuji |
|---|---|---|
| Unit JVM | JUnit (sudah ada di setup upstream) | `PortalJsonParser`, filter bbox, pemilihan target, logika staleness |
| Unit JS | `node --test` (Node 26 tersedia) | throttle, dedupe/hash, serialisasi payload userscript |
| UI template | Desktop Head Unit (DHU) + emulator AAOS **atau** langsung ke Jaecoo | render marker, auto-center, kedalaman screen, kondisi stale/kosong |
| E2E | HP + Jaecoo (wireless AA) | data beneran dari portal nyata; cek konsumsi intel |

DHU dan emulator **belum terinstall** di mesin ini (lihat §9).

---

## 9. Build & prasyarat toolchain

| Kebutuhan | Status di mesin ini |
|---|---|
| JDK 21 (AGP 8.13 minta 17–21) | ✅ `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`. Catatan: `java` di PATH masih **25**, `JAVA_HOME` belum di-set ⇒ build harus eksplisit set `JAVA_HOME` ke JDK 21 |
| Android SDK | ✅ `C:\Users\mansu\AppData\Local\Android\Sdk` — platform `android-36.1`, build-tools `36.1.0`/`37.0.0`, `platform-tools` (adb 37.0.1) |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | ❌ belum di-set ⇒ pakai `local.properties` (`sdk.dir=`) |
| `cmdline-tools` (`sdkmanager`) | ❌ belum ada ⇒ perlu diunduh buat install DHU, system image, dan lisensi |
| Desktop Head Unit (`extras/google/auto`) | ❌ belum ada |
| AVD / system image | ❌ belum ada (emulator binary ada, image nggak) |
| Gradle 8.13 + AGP 8.13 | disamakan dengan upstream IITC Mobile (wrapper ikut repo) |
| Node 26.7 / Git 2.53 | ✅ |
| Android Studio | ✅ terpasang (`C:\Program Files\Android\Android Studio`, JBR 25) |

---

## 10. Risiko

| Risiko | Dampak | Mitigasi / gate |
|---|---|---|
| AA nggak nampilin app sideload sama sekali (laporan Jun 2026) | Project mati di jalur AA | **Gate 0a**: probe app + tes di Jaecoo sebelum nulis fitur |
| Struktur data `window.portals` beda dari asumsi | Parser salah | **Gate 0b**: dump satu payload nyata dari HP user dulu |
| Build upstream IITC Mobile nggak jalan sama sekali di mesin ini (AGP/JDK/versi Gradle/dependency jadul) | Fork nggak kebangun | F1: coba build upstream apa adanya **sebelum** nambah kode; kalau gagal, mundur ke rencana B (app WebView sendiri) — keputusan sadar |
| Kerapuhan WebView upstream (iitc.app sendiri ada laporan IITC Mobile rusak setelah update Android WebView) | Fitur ikut rusak | Terima; update manual; jangan andalkan buat hal kritis |
| Rate limit intel / ban akun | Akun user & tim kena | Nol request tambahan, throttle 15 s, batas 300 portal |
| Sabotase/abuse lewat bridge (payload dari halaman lain) | Tulis state ngawur | Validasi origin + batas ukuran (§7) |

---

## 11. Fase pengerjaan

| Fase | Isi | Gate keluar |
|---|---|---|
| **F0a** | Probe app AA kategori POI, 3 marker dummy, di-sideload ke HP user | Marker muncul di Jaecoo ya/tidak |
| **F0b** | Userscript dump `window.portals` nyata → verifikasi bentuk data | Kontrak §4 dikonfirmasi/dikoreksi |
| **F1** | Import upstream IITC Mobile ke repo, build apa adanya | `assembleDebug` sukses, APK keinstall & login jalan |
| **F2** | Bridge `sendPortals` + `PortalRepository` + unit test | Unit test hijau |
| **F3** | Userscript bridge (throttle/filter) + test node | Test node hijau, payload nyata masuk |
| **F4** | `IitcCarAppService` + `PortalMapScreen` (+ target ops, stale) | Tampil di DHU/mobil |
| **F5** | E2E di Jaecoo + dokumentasi pemakaian | Ops bisa dipakai |

F0a/F0b sengaja duluan: dua-duanya murah dan bisa mematikan atau mengubah seluruh rencana.

---

## 12. Keputusan yang dicatat

1. **Fork IITC Mobile, satu APK** — bukan plugin-only (nggak ada jalur data), bukan app WebView
   sendiri (harus nanggung OAuth `disallowed_useragent` + lifecycle WebView background).
2. **`PlaceListMapTemplate`** — peta digambar host; `MapWithContentTemplate` ditolak karena
   butuh renderer tile sendiri dan interaksi penuh hanya milik kategori Navigation.
3. **Sideload-only** — Play review manual + syarat PF-1 bikin rilis publik nggak realistis.
4. **Nol request intel tambahan** — semua data hasil pemakaian IITC user; ini yang bikin
   profil risiko ban nggak berubah.
5. **Model fork repo:** repo ini jadi fork penuh upstream (import tree + catat SHA upstream)
   supaya `git remote`/rebase ke upstream gampang saat user push ke GitHub.
