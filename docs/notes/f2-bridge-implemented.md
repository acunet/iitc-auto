# F2 — bridge portal + layar Android Auto: sudah diimplementasikan

Tanggal: 2026-10-25
Status: **kode selesai, test hijau, APK terbangun. Belum diuji end-to-end dengan data portal nyata**
(butuh HP login Ingress + mobil, atau minimal HP tercolok supaya bisa dicek log injeksinya).

## Yang dibangun

Alur datanya in-process, satu APK, tanpa file/IPC:

```
WebView IITC (halaman intel.ingress.com)
   └─ userscript iitc-auto-bridge.js  (disuntik otomatis oleh app setelah IITC boot)
        └─ app.sendPortals(json)      (JavascriptInterface bernama "app")
             └─ IITC_JSInterface.sendPortals()   → validasi sumber + ukuran
                  └─ PortalBridge (StateFlow)    → parser + snapshot
                       └─ IitcCarAppService / PortalMapScreen
                            └─ PlaceListMapTemplate + marker (warna faksi) + DistanceSpan
```

| File | Perannya |
|---|---|
| `car/Portal.kt` | model `Portal`, `Faction`, `BoundingBox`, `PortalSnapshot` (+ logika "basi" 120 detik) |
| `car/PortalJsonParser.kt` | parser payload v1 + semua gerbang validasi (versi, ukuran, portal rusak dibuang) |
| `car/Geo.kt` | haversine + `selectPortalsForDisplay` (target ops selalu ikut, sisanya terdekat) |
| `car/PortalBridge.kt` | titik temu WebView ↔ mobil; `isTrustedSource` cuma terima `ingress.com`/subdomain |
| `car/OpsTargetStore.kt` | daftar guid target ops di SharedPreferences |
| `car/PortalMapScreen.kt` | template `PlaceListMapTemplate`: marker + DistanceSpan + label TARGET + indikator data basi |
| `car/IitcCarAppService.kt` | `CarAppService` kategori POI + `Session` |
| `assets/iitc-auto-bridge.js` | userscript: hook `mapDataRefreshEnd`, throttle 15 s, only-if-changed, maks 300 portal |
| `IITC_JSInterface.java` | `sendPortals()` + `injectAutoBridge()` (suntik asset saat `bootFinished`) |

## Bukti yang sudah ada

- **13 test JVM hijau** (`mobile/app/src/test/.../car/PortalBridgeTest.kt`): parsing, validasi versi/ukuran,
  portal rusak, penjepitan level, staleness, pemilihan target, haversine, penolakan sumber asing.
- **8 test JS hijau** (`node mobile/tests/iitc-auto-bridge.test.mjs`), logika diambil dari file userscript
  asli lewat sandbox `vm` — bukan salinan.
- APK `app-debug.apk` terverifikasi isinya: `IitcCarAppService`, aksi `CarAppService`, kategori
  `androidx.car.app.category.POI`, izin `MAP_TEMPLATES`, meta-data `minCarApiLevel`, kategori
  `CAR_LAUNCHER` (parked), dan label aplikasi **IITC Auto**.
- Render `PlaceListMapTemplate` + marker faksi + distance span sudah terbukti sebelumnya di emulator AAOS
  (`docs/notes/img/aaos-probe-render.png`).

## Yang belum diverifikasi (dan harus lewat HP/mobil)

1. Injeksi userscript jalan di app sungguhan → cek `adb logcat | grep "bridge: userscript Android Auto"`.
2. Bentuk data `window.portals` nyata sesuai dugaan (bridge sudah toleran: `latE6/lngE6`, `lat/lng`,
   atau `layer.getLatLng()`; faksi angka maupun huruf).
3. Host Android Auto menampilkan app ini di launcher + templatenya jalan saat nyetir.

## Catatan teknis yang ketemu di fase ini

- Nama JavascriptInterface di fork ini **`app`**, bukan `android` (dokumentasi lama IITC menyebut `android`).
- `org.json` di unit test Android cuma stub ("not mocked") → ditambah `testImplementation 'org.json:json:...'`.
- Test bawaan upstream `IITC_DebugHistoryTest.display` selalu gagal di Windows karena membandingkan
  `System.lineSeparator()` dengan `"\n"` hardcoded — sudah diperbaiki supaya lintas-platform.
- `isTrustedSource` versi pertama terlalu longgar (`endsWith("ingress.com")` juga menerima
  `evil-ingress.com`) — ketemu lewat test, sudah diperketat ke `ingress.com` / `*.ingress.com`.

## Verifikasi di HP nyata (2026-10-25) — dan satu bug deadlock

Setelah HP kedua login pakai akun dummy, dua hal terbukti dan satu bug besar ketemu:

**Terbukti:** userscript bridge beneran kepasang otomatis oleh app di HP nyata
(`adb logcat -s iitcm | grep bridge:` → `bridge: userscript Android Auto disuntik ke WebView`).

**Bug deadlock (sudah dibetulkan):** `app.sendPortals(json)` **nyangkut tanpa error** sehingga
0 payload sampai ke native. Penyebabnya: `WebView.getUrl()` dipanggil **dari thread JS bridge**
di `IITC_JSInterface.sendPortals()` — di Android, API WebView tidak boleh dipanggil dari thread itu,
dan hasilnya deadlock (tanpa exception, jadi tidak ada jejak di logcat).
Perbaikan: URL di-cache di UI thread (`IITC_WebViewClient.onPageFinished` →
`PortalBridge.setCurrentUrl`) dan bridge hanya membaca cache tersebut. Pelajaran umum: **method
`@JavascriptInterface` harus bebas dari API WebView/UI apa pun**; kalau butuh data dari UI thread,
simpan dulu di field.

**Alat verifikasi baru:** `scripts/cdp-bridge-test.py` — menyambung ke WebView lewat Chrome DevTools
Protocol (WebView debugging memang aktif di IITC Mobile) supaya bisa memeriksa state tanpa melihat
layar mobil:

```bash
adb -s <serial> forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof org.exarhteam.iitc_mobile.debug)
python scripts/cdp-bridge-test.py --probe      # state bridge + jumlah portal di window.portals
python scripts/cdp-bridge-test.py --trigger    # paksa kirim pakai data portal nyata
python scripts/cdp-bridge-test.py --eval "<js>"  # ekspresi JS bebas
```

Catatan: handshake WebSocket DevTools **menolak** header `Origin` (403) — pakai
`websocket.create_connection(url, suppress_origin=True)`.

Hasil `--probe` di HP nyata: `bridgeInstalled=true`, `nativeBridge=true`, `iitcLoaded=true`,
`portalCount=237`, `hasMap=true`.

**Status akhir: SUDAH diverifikasi dengan data portal nyata.** `--trigger` menghasilkan
`bridge: payload portal diterima (237 portal, 26422 char)` di logcat (3 kiriman diterima, 0 ditolak).
Bukti lengkap + potongan log ada di `docs/notes/f2-verified-log.txt`. Yang belum diuji tinggal
apakah host Android Auto di head unit mobil mau menampilkan app sideload ini.
