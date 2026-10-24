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

Fase **F0a**: probe app Android Auto (kategori POI) buat ngecek head unit Jaecoo mau
nampilin app sideload atau nggak. Belum ada fitur IITC-nya.

## Peringatan

Niantic menganggap IITC dan semua software third-party **melanggar Ingress ToS**. Project ini
mewarisi risiko itu (termasuk risiko ban akun). Nggak ada credential yang ditangani app ini —
login tetap di IITC Mobile. APK ini personal, bukan untuk publik/Play.
