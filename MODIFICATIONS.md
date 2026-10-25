# Perubahan dibanding upstream IITC-CE

Fork ini berdiri di atas
[IITC-CE / ingress-intel-total-conversion](https://github.com/IITC-CE/ingress-intel-total-conversion)
commit `b017817df9d753195973ecbddd25a1d036549a7d` (diimpor 2026-10-24, lihat `docs/notes/upstream.md`).

File di bawah ini **satu-satunya** yang berbeda dari upstream. Kalau mau menilai mana kode kami dan
mana kode IITC, cukup lihat daftar ini (dan diff terhadap `upstream/master`).

## Perubahan pada file upstream

| File | Perubahan |
|---|---|
| `mobile/app/build.gradle` | tambah plugin `kotlin-android`, `kotlinOptions.jvmTarget = 1.8`, dependency `androidx.car.app:app` + `app-projected` + `kotlinx-coroutines-android`, dan `testImplementation org.json` (stub android.jar tidak bisa dipakai untuk test parser) |
| `mobile/build.gradle` | classpath `kotlin-gradle-plugin` (fork ini Java semua; Kotlin cuma untuk paket `car`) |
| `mobile/app/src/main/AndroidManifest.xml` | tambah izin `androidx.car.app.MAP_TEMPLATES`, `uses-feature` automotive, meta-data `com.google.android.gms.car.application` + `androidx.car.app.minCarApiLevel`, service `org.exarhteam.iitc_mobile.car.IitcCarAppService` (kategori POI), dan kategori `android.intent.category.CAR_LAUNCHER` di intent-filter activity utama (parked app) |
| `mobile/app/src/main/res/xml/automotive_app_desc.xml` | **baru** — deklarasi `<uses name="template"/>` |
| `mobile/app/src/{main,debug,beta}/res/values/app_name.xml` | nama app jadi **IITC Auto** |
| `mobile/app/src/main/java/org/exarhteam/iitc_mobile/IITC_JSInterface.java` | tambah `sendPortals(String)` (`@JavascriptInterface`), `injectAutoBridge()`, dan `readAsset()`; `bootFinished()` sekarang menyuntik userscript bridge |
| `mobile/app/src/test/java/org/exarhteam/iitc_mobile/IITC_DebugHistoryTest.java` | `display()` membandingkan dengan `System.lineSeparator()` — versi upstream menulis `"\n"` hardcoded sehingga test itu **selalu gagal di Windows** |
| `mobile/gradlew`, `mobile/gradlew.bat`, `mobile/gradle/wrapper/gradle-wrapper.jar` | diganti wrapper Gradle 8.13 modern; script lama (2015) mengandalkan `cygpath` dan gagal di git-bash Windows |
| `.gitignore` | tambah `node_modules/` dan asset hasil generate (`total-conversion-build.user.js`, `plugins/`) |

## File & direktori baru (murni tambahan IITC Auto)

| Path | Isi |
|---|---|
| `mobile/app/src/main/java/org/exarhteam/iitc_mobile/car/Portal.kt` | model `Portal`, `Faction`, `BoundingBox`, `PortalSnapshot` |
| `.../car/PortalJsonParser.kt` | parser payload bridge + validasi versi/ukuran/kualitas data |
| `.../car/PortalBridge.kt` | jembatan WebView → mobil (StateFlow) + validasi sumber `ingress.com` |
| `.../car/Geo.kt` | haversine + pemilihan portal (target ops + N terdekat) |
| `.../car/OpsTargetStore.kt` | daftar guid target ops (SharedPreferences) |
| `.../car/PortalMapScreen.kt` | `PlaceListMapTemplate`: marker faksi, DistanceSpan, penanda TARGET, indikator data basi |
| `.../car/IitcCarAppService.kt` | `CarAppService` kategori POI + `Session` |
| `mobile/app/src/main/assets/iitc-auto-bridge.js` | userscript bridge (hook `mapDataRefreshEnd`, throttle, serialisasi) |
| `mobile/app/src/test/java/.../car/PortalBridgeTest.kt` | 13 test JVM |
| `mobile/tests/iitc-auto-bridge.test.mjs` | 8 test logika userscript (dijalankan `node`, sandbox `vm`) |
| `probe/` | probe app Android Auto (kategori POI) buat ngecek head unit mau nampilin app sideload |
| `docs/`, `scripts/` | spec, rencana, catatan fase, bukti screenshot, helper build/test |
| `README-UPSTREAM.md` | README asli upstream |

## Aturan yang dipegang saat menambah kode

1. **Jangan menambah request ke intel.ingress.com.** Bridge cuma meneruskan data yang sudah diambil
   IITC untuk user; tidak ada polling, tidak ada auto-pan peta.
2. **Jangan menangani kredensial.** Login Ingress tetap di WebView IITC, tidak ada token yang
   disimpan/dikirim ke mana pun oleh kode kami.
3. **Perubahan sekecil mungkin pada file upstream.** Semua fitur baru ditaruh di paket `car/` dan
   satu asset userscript, supaya rebase ke upstream tetap murah.
