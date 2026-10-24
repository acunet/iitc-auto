# Gate 0 + Fondasi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buktikan dua hal yang bisa mematikan seluruh project (Android Auto mau nampilin app sideload kita, dan bentuk data `window.portals` sesuai asumsi), sambil menyiapkan toolchain Android dan base fork IITC Mobile yang kebangun.

**Architecture:** Probe app terpisah (kategori POI, `PlaceListMapTemplate`, marker dummy) dipakai buat nge-tes head unit Jaecoo tanpa perlu nyentuh kode IITC. Paralel dengan itu, satu userscript dump memverifikasi kontrak data. Baru setelah dua gate lulus, upstream IITC Mobile diimpor ke repo sebagai base fork.

**Tech Stack:** Android SDK 36.1 + build-tools 36.1.0, JDK 21 (Adoptium), Gradle 8.13, AGP 8.13.0, Kotlin 2.4.21, `androidx.car.app:app:1.7.0` + `app-projected:1.7.0`, Desktop Head Unit r02.0, upstream `IITC-CE/ingress-intel-total-conversion`.

**Spec:** `docs/superpowers/specs/2026-10-24-iitc-android-auto-design.md`

## Global Constraints

- Repo root: `C:\Users\mansu\dev\iitc-auto` (git-bash path: `/c/Users/mansu/dev/iitc-auto`).
- **Selalu** `source scripts/env.sh` sebelum build apa pun. `java` di PATH default mesin ini JDK 25 yang ditolak AGP 8.13.
- `JAVA_HOME` = `C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot` (format Windows); entri `PATH` = format MSYS `/c/...`. Jangan campur — entri `PATH` bergaya `C:/...` akan pecah jadi dua entri.
- `ANDROID_HOME` = `C:/Users/mansu/AppData/Local/Android/Sdk`; `sdk.dir` juga sudah di `local.properties` (file ini **tidak** di-commit).
- Kategori AA = **POI** + izin `androidx.car.app.MAP_TEMPLATES`. **Jangan** pakai `NAVIGATION_TEMPLATES`/`ACCESS_SURFACE` (kategori Navigation punya syarat NF-1 yang nggak bisa kita penuhi).
- **Nol request tambahan ke intel.ingress.com.** Semua data portal berasal dari sesi IITC yang sudah dibuka user.
- Nggak ada credential/token Ingress yang boleh masuk repo, log, atau payload bridge.
- Semua APK di-sideload (debug build). Nggak ada rencana upload ke Play.
- Probe app berstatus **throwaway** — kalau gate gagal, kodenya dibuang, bukan dirawat.
- Bahasa kode/komentar: Indonesia santai boleh, identifier tetap Inggris.

---

### Task 1: Toolchain Android (cmdline-tools + DHU)

**Files:**
- Create: `scripts/install-android-tools.sh`
- Create: `docs/notes/toolchain.md`

**Interfaces:**
- Produces: `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager` (dipakai Task 2 untuk lisensi) dan `$ANDROID_HOME/extras/google/auto/desktop-head-unit.exe` (dipakai Task 5 buat tes layar di laptop).

- [ ] **Step 1: Tulis script installer**

```bash
#!/usr/bin/env bash
# scripts/install-android-tools.sh
# Install cmdline-tools (sdkmanager) + Desktop Head Unit ke Android SDK yang sudah ada.
set -e

source "$(dirname "$0")/env.sh"

CLT_VERSION="16111833"   # versi terbaru di repository2-3.xml per 2026-10-24
CLT_URL="https://dl.google.com/android/repository/commandlinetools-win-${CLT_VERSION}_latest.zip"
TMP="${TMPDIR:-/tmp}/clt-download"
SDK_WIN="C:/Users/mansu/AppData/Local/Android/Sdk"
SDK_MSYS="/c/Users/mansu/AppData/Local/Android/Sdk"

if [ -x "$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat" ]; then
  echo "cmdline-tools sudah ada, skip download"
else
  rm -rf "$TMP" && mkdir -p "$TMP"
  echo "Download $CLT_URL"
  curl -L -o "$TMP/clt.zip" "$CLT_URL"
  # zip-nya berisi folder 'cmdline-tools/'; sdkmanager WAJIB ada di path 'cmdline-tools/latest/'
  unzip -q "$TMP/clt.zip" -d "$TMP"
  rm -rf "$SDK_MSYS/cmdline-tools/latest"
  mkdir -p "$SDK_MSYS/cmdline-tools"
  mv "$TMP/cmdline-tools" "$SDK_MSYS/cmdline-tools/latest"
fi

export SDKMANAGER="$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat"
echo "sdkmanager: $SDKMANAGER"
yes | "$SDKMANAGER" --sdk_root="$SDK_WIN" --licenses >/dev/null || true
"$SDKMANAGER" --sdk_root="$SDK_WIN" "extras;google;auto"
"$SDKMANAGER" --sdk_root="$SDK_WIN" --list_installed

echo "--- verifikasi ---"
ls -l "$SDK_MSYS/extras/google/auto/desktop-head-unit.exe"
```

- [ ] **Step 2: Jalankan**

Run: `cd /c/Users/mansu/dev/iitc-auto && bash scripts/install-android-tools.sh`
Expected: download sukses, `sdkmanager` terpasang, DHU terunduh, dan baris terakhir nunjukin `desktop-head-unit.exe` ada.

- [ ] **Step 3: Catat status toolchain**

Buat `docs/notes/toolchain.md` berisi: versi JDK terpakai, path SDK, versi SDK platform/build-tools, versi cmdline-tools, versi DHU, dan **apa yang masih kurang** (mis. system image emulator belum ada). Sertakan output `sdkmanager --list_installed`.

- [ ] **Step 4: Commit**

```bash
git add scripts/install-android-tools.sh docs/notes/toolchain.md
git commit -m "chore(toolchain): installer cmdline-tools + Desktop Head Unit"
```

---

### Task 2: Probe APK Android Auto (kategori POI) yang kebangun

**Files:**
- Create: `probe/settings.gradle.kts`
- Create: `probe/build.gradle.kts`
- Create: `probe/gradle.properties`
- Create: `probe/local.properties` (gitignored; isi `sdk.dir` sama seperti root)
- Create: `probe/app/build.gradle.kts`
- Create: `probe/app/src/main/AndroidManifest.xml`
- Create: `probe/app/src/main/res/xml/automotive_app_desc.xml`
- Create: `probe/app/src/main/res/values/strings.xml`
- Create: `probe/app/src/main/java/id/acunet/portalprobe/MainActivity.kt`
- Create: `probe/app/src/main/java/id/acunet/portalprobe/ProbeData.kt`
- Create: `probe/app/src/main/java/id/acunet/portalprobe/ProbeCarAppService.kt`
- Create: `probe/app/src/main/java/id/acunet/portalprobe/ProbeScreen.kt`
- Create: `probe/app/src/test/java/id/acunet/portalprobe/ProbeDataTest.kt`
- Create: `scripts/bootstrap-gradle.sh`

**Interfaces:**
- Consumes: `sdkmanager` dari Task 1 (buat lisensi SDK kalau belum).
- Produces: `probe/app/build/outputs/apk/debug/app-debug.apk`, package `id.acunet.portalprobe`, entry point AA `ProbeCarAppService`, dan `ProbeData.PROBE_PORTALS: List<ProbePortal>` (Task 3 tinggal install & tes).

- [ ] **Step 1: Siapkan Gradle 8.13 (wrapper belum ada di mesin ini)**

`gradle` nggak terpasang di PATH, jadi unduh distribusinya sekali di luar repo, pakai buat generate wrapper yang kita commit.

```bash
#!/usr/bin/env bash
# scripts/bootstrap-gradle.sh
set -e
TOOLS="/c/Users/mansu/dev/tools"
TOOLS_WIN="C:/Users/mansu/dev/tools"   # curl itu native tool: butuh path Windows
DIST="$TOOLS/gradle-8.13"
mkdir -p "$TOOLS"
if [ ! -f "$DIST/bin/gradle" ]; then
  curl -L -o "$TOOLS_WIN/gradle-8.13-bin.zip" https://services.gradle.org/distributions/gradle-8.13-bin.zip
  unzip -q -o "$TOOLS/gradle-8.13-bin.zip" -d "$TOOLS"
fi
"$DIST/bin/gradle" --version
```

Run: `bash scripts/bootstrap-gradle.sh`
Expected: `Gradle 8.13` tampil dengan JVM 21 (`source scripts/env.sh` dulu).

- [ ] **Step 2: Tulis file Gradle project probe**

`probe/settings.gradle.kts`:
```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "portal-probe"
include(":app")
```

`probe/build.gradle.kts`:
```kotlin
plugins {
    id("com.android.application") version "8.13.0" apply false
    id("org.jetbrains.kotlin.android") version "2.4.21" apply false
}
```

`probe/gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
kotlin.code.style=official
```

`probe/app/build.gradle.kts`:
```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "id.acunet.portalprobe"
    compileSdk = 36

    defaultConfig {
        applicationId = "id.acunet.portalprobe"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1-probe"
    }

    buildTypes {
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
}

dependencies {
    implementation("androidx.car.app:app:1.7.0")
    implementation("androidx.car.app:app-projected:1.7.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    testImplementation("junit:junit:4.13.2")
}
```

`probe/local.properties` (jangan di-commit):
```properties
sdk.dir=C:/Users/mansu/AppData/Local/Android/Sdk
```

- [ ] **Step 3: Generate wrapper lalu verifikasi konfigurasi**

Run:
```bash
cd /c/Users/mansu/dev/iitc-auto/probe
"/c/Users/mansu/dev/tools/gradle-8.13/bin/gradle" wrapper --gradle-version 8.13
./gradlew --version
```
Expected: `Gradle 8.13` + JVM 21. Kalau Kotlin 2.4.21 ditolak AGP 8.13 (pesan "incompatible"), turunkan ke `2.2.20` di `probe/build.gradle.kts` dan ulangi.

- [ ] **Step 4: Tulis test dulu (RED)**

`probe/app/src/test/java/id/acunet/portalprobe/ProbeDataTest.kt`:
```kotlin
package id.acunet.portalprobe

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProbeDataTest {
    @Test
    fun `tiga marker probe dengan faction berbeda`() {
        val portals = ProbeData.PROBE_PORTALS
        assertEquals(3, portals.size)
        assertEquals(setOf("R", "E", "N"), portals.map { it.team }.toSet())
    }

    @Test
    fun `level dan koordinat masuk rentang wajar`() {
        ProbeData.PROBE_PORTALS.forEach { p ->
            assertTrue("level ${p.level} di luar 1..8", p.level in 1..8)
            assertTrue("lat ${p.lat} di luar Jakarta", p.lat in -7.0..-5.5)
            assertTrue("lng ${p.lng} di luar Jakarta", p.lng in 106.0..107.5)
        }
    }
}
```

Run: `./gradlew :app:testDebugUnitTest --tests '*ProbeDataTest*'`
Expected: FAIL — `Unresolved reference: ProbeData`.

- [ ] **Step 5: Implementasi data + service + screen (GREEN)**

`probe/app/src/main/java/id/acunet/portalprobe/ProbeData.kt`:
```kotlin
package id.acunet.portalprobe

/** Data dummy buat gate Android Auto. Throwaway — dibuang setelah gate lulus. */
data class ProbePortal(
    val name: String,
    val lat: Double,
    val lng: Double,
    val team: String,   // R / E / M / N
    val level: Int,
    val distanceM: Int,
)

object ProbeData {
    // Tiga portal nyata di sekitar Monas/Jakarta Pusat, cukup buat ngetes marker + warna.
    val PROBE_PORTALS = listOf(
        ProbePortal("Probe · Monas Selatan", -6.17650, 106.82710, "R", 8, 210),
        ProbePortal("Probe · Gambir Station", -6.17670, 106.83070, "E", 6, 640),
        ProbePortal("Probe · Istiqlal", -6.17020, 106.83120, "N", 1, 980),
    )
}
```

`probe/app/src/main/java/id/acunet/portalprobe/ProbeCarAppService.kt`:
```kotlin
package id.acunet.portalprobe

import android.content.pm.ServiceInfo
import androidx.car.app.CarAppService
import androidx.car.app.SessionInfo
import androidx.car.app.validation.HostValidator

class ProbeCarAppService : CarAppService() {
    override fun createHostValidator(): HostValidator =
        HostValidator.ALLOW_ALL_HOSTS_VALIDATOR // hanya wajar buat build debug/sideload

    override fun onCreateSession(sessionInfo: SessionInfo) = ProbeSession()
}
```

`probe/app/src/main/java/id/acunet/portalprobe/ProbeScreen.kt`:
```kotlin
package id.acunet.portalprobe

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarLocation
import androidx.car.app.model.ItemList
import androidx.car.app.model.Place
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.model.PlaceMarker
import androidx.car.app.model.Row
import androidx.car.app.model.Template

private fun colorFor(team: String): CarColor = when (team) {
    "R" -> CarColor.BLUE
    "E" -> CarColor.GREEN
    "M" -> CarColor.RED
    else -> CarColor.DEFAULT
}

class ProbeScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        val portals = ProbeData.PROBE_PORTALS
        val rows = ItemList.Builder().apply {
            portals.forEach { p ->
                // Marker di peta host berasal dari Row.setMetadata(Place) — bukan dari setItemList aja.
                val place = Place.Builder(CarLocation.create(p.lat, p.lng))
                    .setMarker(
                        PlaceMarker.Builder()
                            .setColor(colorFor(p.team))
                            .setLabel(p.team)
                            .build()
                    )
                    .build()

                addItem(
                    Row.Builder()
                        .setTitle(p.name)
                        .addText("L${p.level} · ${p.team} · ${p.distanceM} m")
                        .setMetadata(place)
                        .build()
                )
            }
        }.build()

        return PlaceListMapTemplate.Builder()
            .setTitle("Portal Probe")
            .setHeaderAction(Action.APP_ICON)
            .setCurrentLocationEnabled(true)
            .setAnchor(CarLocation.create(portals[0].lat, portals[0].lng))
            .setItemList(rows)
            .build()
    }
}
```

`ProbeSession` ditulis inline di file service-nya (satu file, tanggung jawab kecil):
```kotlin
// tambahkan di ProbeCarAppService.kt
class ProbeSession : androidx.car.app.Session() {
    override fun onCreateScreen(intent: android.content.Intent) = ProbeScreen(carContext)
}
```

`probe/app/src/main/java/id/acunet/portalprobe/MainActivity.kt`:
```kotlin
package id.acunet.portalprobe

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Cuma supaya APK ada entry point di HP (gampang dicek pas debugging sideload). */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply {
            text = "Portal Probe — install OK.\nBuka lewat Android Auto di mobil.\n" +
                "Kalau nggak muncul di launcher AA: aktifkan Developer mode + Unknown sources."
            textSize = 16f
            setPadding(48, 96, 48, 48)
        })
    }
}
```

- [ ] **Step 6: Manifest + deklarasi app mobil**

`probe/app/src/main/res/xml/automotive_app_desc.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
    <uses name="template" />
</automotiveApp>
```

`probe/app/src/main/AndroidManifest.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- POI app: cuma boleh minta MAP_TEMPLATES. JANGAN tambah NAVIGATION_TEMPLATES/ACCESS_SURFACE. -->
    <uses-permission android:name="androidx.car.app.MAP_TEMPLATES" />

    <uses-feature android:name="android.hardware.type.automotive" android:required="false" />

    <application
        android:label="@string/app_name"
        android:icon="@android:drawable/ic_dialog_map"
        android:theme="@style/Theme.AppCompat.DayNight.NoActionBar">

        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".ProbeCarAppService"
            android:exported="true">
            <intent-filter>
                <action android:name="androidx.car.app.CarAppService" />
                <category android:name="androidx.car.app.category.POI" />
            </intent-filter>
        </service>
    </application>
</manifest>
```

`probe/app/src/main/res/values/strings.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Portal Probe</string>
</resources>
```

- [ ] **Step 7: Test hijau + build APK**

Run:
```bash
cd /c/Users/mansu/dev/iitc-auto/probe
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
ls -l app/build/outputs/apk/debug/app-debug.apk
```
Expected: test PASS, APK terbentuk.

- [ ] **Step 8: Commit**

```bash
git add scripts/bootstrap-gradle.sh probe .gitignore
git commit -m "feat(probe): APK Android Auto kategori POI buat gate 0a"
```

---

### Task 3: Gate 0a — tes probe di Jaecoo

**Files:**
- Create: `docs/notes/gate0a-android-auto.md`

**Interfaces:**
- Consumes: `probe/app/build/outputs/apk/debug/app-debug.apk` dari Task 2.
- Produces: keputusan go/no-go yang dipakai Task 6.

- [ ] **Step 1: Aktifkan mode developer Android Auto di HP**

Di HP: `Settings > Apps > Android Auto > Advanced > Additional settings in the app >` (menu overflow) `Developer settings` → aktifkan **Developer mode**; lalu di menu yang sama pilih **Application mode: Developer** dan aktifkan **Unknown sources**.

- [ ] **Step 2: Install APK**

```bash
source /c/Users/mansu/dev/iitc-auto/scripts/env.sh
adb devices                                  # HP harus muncul sebagai 'device' (bukan 'unauthorized')
adb install -r /c/Users/mansu/dev/iitc-auto/probe/app/build/outputs/apk/debug/app-debug.apk
adb shell cmd package list packages | grep portalprobe
```
Expected: `Success`, dan package `id.acunet.portalprobe` kelihatan.

- [ ] **Step 3: Cek di mobil**

Sambungkan HP ke Jaecoo (USB dulu — USB lebih gampang di-debug daripada wireless). Di launcher Android Auto cari **Portal Probe**; kalau nggak kelihatan, buka **Customize launcher** dan aktifkan.

- [ ] **Step 4: Kalau nggak muncul, kumpulkan bukti (jangan tebak)**

```bash
adb logcat -d | grep -iE 'CAR\.AUTH|carapp|portalprobe|template' | tail -60
adb shell dumpsys package id.acunet.portalprobe | grep -A3 -iE 'car|intent'
```
Catat pesan `CAR.AUTH` — inilah yang nunjukin AA nolak app sideload.

- [ ] **Step 5: Tulis hasilnya**

`docs/notes/gate0a-android-auto.md`: peta jalan (USB/wireless, model HP, versi Android Auto, versi AA di mobil), hasil (muncul / nggak), log mentah, dan kalau muncul: screenshot tampilan marker.

- [ ] **Step 6: Commit**

```bash
git add docs/notes/gate0a-android-auto.md
git commit -m "test(gate0a): hasil tes probe app di head unit Jaecoo"
```

---

### Task 4: Gate 0b — verifikasi bentuk data `window.portals`

**Files:**
- Create: `probe/userscripts/dump-portals.user.js`
- Create: `docs/notes/gate0b-window-portals.md` (diisi setelah hasil dump masuk)

**Interfaces:**
- Produces: daftar field `window.portals[guid].options.data` yang **nyata**; hasilnya mengonfirmasi atau mengoreksi kontrak §4 spec sebelum `PortalJsonParser` ditulis.

- [ ] **Step 1: Tulis userscript dump**

```javascript
// ==UserScript==
// @name         IITC Dump: window.portals
// @namespace    id.acunet.iitc
// @version      0.1
// @description  Dump bentuk data satu portal IITC buat verifikasi kontrak bridge
// @author       Acunet
// @match        https://intel.ingress.com/*
// @grant        none
// ==/UserScript==

/* eslint-disable */
(function () {
  'use strict';
  if (typeof window.addHook !== 'function') return;

  let dumped = false;

  window.addHook('mapDataRefreshEnd', function () {
    if (dumped) return;                       // sekali aja, jangan spam dialog
    const keys = Object.keys(window.portals || {});
    if (keys.length === 0) return;
    dumped = true;

    const guid = keys[0];
    const portal = window.portals[guid];
    const data = (portal && portal.options && portal.options.data) || {};

    const report = {
      capturedAt: new Date().toISOString(),
      iitcVersion: window.script_info ? window.script_info.scriptVersion : 'unknown',
      portalCountVisible: keys.length,
      dataKeys: Object.keys(data).sort(),
      sample: data,
      latLngFromLayer: portal.getLatLng ? { lat: portal.getLatLng().lat, lng: portal.getLatLng().lng } : null
    };

    const json = JSON.stringify(report, null, 2);
    console.log(json);

    if (typeof android !== 'undefined' && android.saveFile) {
      android.saveFile('iitc-portals-dump.json', 'application/json', json); // buka dialog simpan di HP
    } else {
      alert('Dump sudah ditulis ke console IITC (tab Debug); simpan manual.');
    }
  });
})();
```

- [ ] **Step 2: Pasang & jalankan di HP**

Copy `dump-portals.user.js` ke folder plugin IITC Mobile (atau buka lewat IITC → `Preferences > Plugins > User scripts > add by URL/file`), buka Intel map area Jakarta sampai peta ke-load, tunggu dialog "save file", simpan ke Downloads.

- [ ] **Step 3: Tarik hasilnya ke repo**

```bash
adb pull /sdcard/Download/iitc-portals-dump.json /c/Users/mansu/AppData/Local/hermes/profiles/dev/cache/scratch/
```
(catatan: `saveFile` bisa nyimpen ke lokasi lain, sesuaikan path.)

- [ ] **Step 4: Bandingkan dengan kontrak spec §4 dan tulis hasilnya**

Isi `docs/notes/gate0b-window-portals.md` dengan: daftar `dataKeys` nyata, field yang dipakai bridge (`latE6`/`lngE6`/`team`/`level`/`title`/`health` — ada/tidak), dan **koreksi kontrak** kalau ternyata beda. Contoh isi yang diharapkan: `latE6` + `lngE6` ada, `team` berupa string `'R'/'E'/'M'/'N'`.

- [ ] **Step 5: Commit**

```bash
git add probe/userscripts/dump-portals.user.js docs/notes/gate0b-window-portals.md
git commit -m "test(gate0b): dump dan verifikasi bentuk data window.portals"
```

---

### Task 5: Import upstream IITC Mobile + build apa adanya

**Files:**
- Create: `scripts/import-upstream.sh`
- Create (hasil import): `mobile/`, `code/`, `build.py`, dll dari upstream
- Create: `docs/notes/upstream.md`

**Interfaces:**
- Consumes: repo ini sebagai fork penuh upstream.
- Produces: `mobile/gradlew`, `mobile/app/` (base yang nanti ditempeli bridge di plan berikutnya), dan catatan SHA upstream yang diimpor.

- [ ] **Step 1: Tulis script import**

```bash
#!/usr/bin/env bash
# scripts/import-upstream.sh — impor tree upstream ke repo ini (fork by content).
set -e
REPO="/c/Users/mansu/dev/iitc-auto"
UPSTREAM="https://github.com/IITC-CE/ingress-intel-total-conversion.git"
TMP="/c/Users/mansu/dev/tools/upstream-iitc"

git -C "$REPO" remote add upstream "$UPSTREAM" 2>/dev/null || true

if [ -d "$TMP/.git" ]; then git -C "$TMP" fetch --depth 1 origin master && git -C "$TMP" reset --hard origin/master
else git clone --depth 1 "$UPSTREAM" "$TMP"; fi

SHA=$(git -C "$TMP" rev-parse HEAD)
echo "upstream SHA=$SHA"

# README.md kita dipertahankan; README upstream masuk sebagai README-UPSTREAM.md
rsync -a --delete-excluded \
  --exclude '.git' --exclude 'README.md' --exclude '.github' \
  "$TMP"/ "$REPO"/
cp "$TMP/README.md" "$REPO/README-UPSTREAM.md"

printf 'upstream=%s\nsha=%s\ntanggal_import=%s\n' \
  "$UPSTREAM" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REPO/docs/notes/upstream.md"
echo "selesai — cek: git -C $REPO status --short | head"
```

- [ ] **Step 2: Jalankan & commit import**

```bash
cd /c/Users/mansu/dev/iitc-auto
bash scripts/import-upstream.sh
git add -A && git commit -m "vendor: import upstream IITC-CE @ $(git rev-parse --short upstream/master)"
```
Expected: tree upstream masuk, commit baru terbentuk, `docs/notes/upstream.md` berisi SHA.

- [ ] **Step 3: Build upstream apa adanya (INI TES PENTING)**

```bash
source /c/Users/mansu/dev/iitc-auto/scripts/env.sh
cd /c/Users/mansu/dev/iitc-auto/mobile
./gradlew --version          # harus Gradle 8.13 + JVM 21
./gradlew assembleDebug
ls -l app/build/outputs/apk/debug/
```
Expected: APK debug IITC Mobile terbentuk.

- [ ] **Step 4: Kalau build gagal — catat, jangan tambal buta**

Tulis error persisnya (task yang gagal + pesan pertama) ke `docs/notes/upstream.md`. Kandidat penyebab yang sudah diketahui: `compileSdk 36` belum lengkap, signing config debug (`../keystore/debug.keystore`) belum ada, atau versi AGP/Kotlin nggak cocok dengan JDK 21. Kalau nggak selesai dalam satu sesi, **berhenti dan laporkan** — ini gate F1, bukan kerjaan yang boleh dipaksa.

- [ ] **Step 5: Install ke HP dan cek login**

```bash
adb install -r mobile/app/build/outputs/apk/debug/app-debug.apk
```
Buka app, login Ingress seperti biasa (kalau muncul `403 disallowed_useragent`: login dulu lewat Chrome, baru balik ke app — ini workaround resmi upstream), lalu pastikan peta portal muncul.

- [ ] **Step 6: Commit catatan**

```bash
git add docs/notes/upstream.md
git commit -m "docs: status build upstream IITC Mobile di mesin ini"
```

---

### Task 6: Keputusan gate → lanjut plan berikutnya

**Files:**
- Create: `docs/notes/gate0-decision.md`

- [ ] **Step 1: Rekap tiga hasil**

Tulis dengan angka/bukti, bukan opini:
1. Gate 0a: app sideload muncul di Jaecoo? (ya/tidak + log)
2. Gate 0b: field data portal yang nyata (kutip `dataKeys`)
3. F1: upstream IITC Mobile kebangun & login jalan?

- [ ] **Step 2: Putuskan dan tulis berikutnya**

- Semua lulus → plan berikutnya: "Bridge + Car UI" (`sendPortals`, `PortalRepository`, userscript bridge ber-throttle, `PortalMapScreen`, target ops, indikator stale).
- Gate 0a gagal → **stop**: tulis ulang opsi (head unit Android/tablet terpisah, atau AAOS), jangan lanjut nulis fitur AA.
- Gate 0b beda dari asumsi → koreksi kontrak §4 spec dulu, baru lanjut.
- F1 gagal build → sepakati rencana B (app WebView sendiri) secara eksplisit, termasuk konsekuensi OAuth di §2 spec.

- [ ] **Step 3: Commit**

```bash
git add docs/notes/gate0-decision.md
git commit -m "docs: keputusan gate 0 dan arah fase berikutnya"
```

---

## Catatan eksekusi

- Fase ini **tidak menyentuh** kode IITC Mobile selain mengimpornya utuh. Semua perubahan bridge ada di plan berikutnya.
- Task 1 dan Task 2 bisa jalan paralel; Task 3 butuh mobil + HP; Task 4 butuh HP + akun Ingress; Task 5 butuh toolchain Task 1 selesai.
- Yang bisa gua (agent) kerjakan tanpa lu: Task 1, Task 2 (kode + build), Task 5 Step 1-3 (import + build). Yang butuh lu di HP/mobil: Task 3, Task 4 Step 2, Task 5 Step 5.
