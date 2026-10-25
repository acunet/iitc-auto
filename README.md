# iitc-auto

Portal IITC di layar **Android Auto** — biar pas ops di lapangan, portal sekitar dan portal
target kelihatan di head unit mobil (marker + level + faction) tanpa harus nyimak HP.

Target pribadi: **Jaecoo J7** (head unit 14.8", wireless Android Auto).

## Cara kerjanya (ringkas)

Satu APK = **fork IITC Mobile** (WebView + login Ingress apa adanya) **+** `CarAppService`.
Userscript kecil di dalam IITC mengirim daftar portal yang **sudah** keload di viewport ke
native lewat bridge `android.sendPortals(json)`; `PortalRepository` menyalurkannya ke layar
mobil sebagai `PlaceListMapTemplate` + marker.

Karena datanya hasil pemakaian IITC yang sudah ada, **tidak ada request tambahan ke intel map** —
profil pemakaian/risiko rate limit tidak berubah.

## Dokumentasi

- Spec desain: [`docs/superpowers/specs/2026-10-24-iitc-android-auto-design.md`](docs/superpowers/specs/2026-10-24-iitc-android-auto-design.md)
- Rencana implementasi: [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Build

```bash
source scripts/env.sh    # JAVA_HOME -> JDK 21, ANDROID_HOME -> SDK
cd probe && ./gradlew assembleDebug
```

## Status

**F2 selesai** (kode + test hijau): bridge data portal dari WebView IITC ke layar Android Auto,
plus layar peta marker (`PlaceListMapTemplate`). Nama app: **IITC Auto**.

- 13 test JVM + 8 test JS hijau → `./gradlew :app:testDebugUnitTest` dan `node mobile/tests/iitc-auto-bridge.test.mjs`
- Dua mode: **nyetir** = peta marker (template POI), **berhenti** = IITC fullscreen (parked app)
- Belum diuji end-to-end dengan data portal nyata di mobil → `docs/notes/f2-bridge-implemented.md`
- Catatan penting: build wajib `npm install && python build.py mobile` dulu (asset userscript IITC
  bukan hasil Gradle) → `docs/notes/iitc-on-car-screen.md`

## Peringatan

Niantic menganggap IITC dan semua software third-party **melanggar Ingress ToS**. Project ini
mewarisi risiko itu (termasuk risiko ban akun). Nggak ada credential yang ditangani app ini —
login tetap di IITC Mobile. APK ini personal, bukan untuk publik/Play.
