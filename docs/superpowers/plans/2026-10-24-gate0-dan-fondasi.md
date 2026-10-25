# Gate 0 + Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the two things that could kill the whole project (that Android Auto will display our sideloaded app, and that the shape of `window.portals` data matches the assumption), while setting up the Android toolchain and a buildable IITC Mobile fork base.

**Architecture:** A separate probe app (POI category, `PlaceListMapTemplate`, dummy markers) is used to test the Jaecoo head unit without touching any IITC code. In parallel, a single dump userscript verifies the data contract. Only once both gates pass is upstream IITC Mobile imported into the repo as the fork base.

**Tech Stack:** Android SDK 36.1 + build-tools 36.1.0, JDK 21 (Adoptium), Gradle 8.13, AGP 8.13.0, Kotlin 2.4.21, `androidx.car.app:app:1.7.0` + `app-projected:1.7.0`, Desktop Head Unit r02.0, upstream `IITC-CE/ingress-intel-total-conversion`.

**Spec:** `docs/superpowers/specs/2026-10-24-iitc-android-auto-design.md`

## Global Constraints

- Repo root: `C:\Users\mansu\dev\iitc-auto` (git-bash path: `/c/Users/mansu/dev/iitc-auto`).
- **Always** `source scripts/env.sh` before any build. The `java` on this machine's default PATH is JDK 25, which AGP 8.13 rejects.
- `JAVA_HOME` = `C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot` (Windows format); `PATH` entries = MSYS format `/c/...`. Don't mix the two — a `PATH` entry in `C:/...` style will split into two entries.
- `ANDROID_HOME` = `C:/Users/mansu/AppData/Local/Android/Sdk`; `sdk.dir` is also already in `local.properties` (this file is **not** committed).
- AA category = **POI** + the `androidx.car.app.MAP_TEMPLATES` permission. **Do not** use `NAVIGATION_TEMPLATES`/`ACCESS_SURFACE` (the Navigation category has NF-1 requirements we can't meet).
- **Zero extra requests to intel.ingress.com.** All portal data comes from an IITC session the user already has open.
- No Ingress credentials/tokens may enter the repo, logs, or the bridge payload.
- All APKs are sideloaded (debug build). There is no plan to upload to Play.
- The probe app is **throwaway** — if the gate fails, the code is discarded, not maintained.
- Code/comment language: casual Indonesian is fine, identifiers stay English.

---

### Task 1: Android toolchain (cmdline-tools + DHU)

**Files:**
- Create: `scripts/install-android-tools.sh`
- Create: `docs/notes/toolchain.md`

**Interfaces:**
- Produces: `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager` (used by Task 2 for licenses) and `$ANDROID_HOME/extras/google/auto/desktop-head-unit.exe` (used by Task 5 to test the screen on a laptop).

- [ ] **Step 1: Write the installer script**

```bash
#!/usr/bin/env bash
# scripts/install-android-tools.sh
# Install cmdline-tools (sdkmanager) + Desktop Head Unit into the existing Android SDK.
set -e

source "$(dirname "$0")/env.sh"

CLT_VERSION="16111833"   # newest version in repository2-3.xml as of 2026-10-24
CLT_URL="https://dl.google.com/android/repository/commandlinetools-win-${CLT_VERSION}_latest.zip"
TMP="${TMPDIR:-/tmp}/clt-download"
SDK_WIN="C:/Users/mansu/AppData/Local/Android/Sdk"
SDK_MSYS="/c/Users/mansu/AppData/Local/Android/Sdk"

if [ -x "$SDK_MSYS/cmdline-tools/latest/bin/sdkmanager.bat" ]; then
  echo "cmdline-tools already present, skipping the download"
else
  rm -rf "$TMP" && mkdir -p "$TMP"
  echo "Download $CLT_URL"
  curl -L -o "$TMP/clt.zip" "$CLT_URL"
  # the zip contains a 'cmdline-tools/' folder; sdkmanager MUST live at path 'cmdline-tools/latest/'
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

echo "--- verification ---"
ls -l "$SDK_MSYS/extras/google/auto/desktop-head-unit.exe"
```

- [ ] **Step 2: Run it**

Run: `cd /c/Users/mansu/dev/iitc-auto && bash scripts/install-android-tools.sh`
Expected: the download succeeds, `sdkmanager` is installed, DHU is downloaded, and the last line shows `desktop-head-unit.exe` exists.

- [ ] **Step 3: Record the toolchain status**

Create `docs/notes/toolchain.md` containing: the JDK version in use, the SDK path, the SDK platform/build-tools versions, the cmdline-tools version, the DHU version, and **what's still missing** (e.g. no emulator system image yet). Include the output of `sdkmanager --list_installed`.

- [ ] **Step 4: Commit**

```bash
git add scripts/install-android-tools.sh docs/notes/toolchain.md
git commit -m "chore(toolchain): cmdline-tools + Desktop Head Unit installer"
```

---

### Task 2: A buildable Android Auto probe APK (POI category)

**Files:**
- Create: `probe/settings.gradle.kts`
- Create: `probe/build.gradle.kts`
- Create: `probe/gradle.properties`
- Create: `probe/local.properties` (gitignored; contains the same `sdk.dir` as the root)
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
- Consumes: `sdkmanager` from Task 1 (for SDK licenses, if not already accepted).
- Produces: `probe/app/build/outputs/apk/debug/app-debug.apk`, package `id.acunet.portalprobe`, the AA entry point `ProbeCarAppService`, and `ProbeData.PROBE_PORTALS: List<ProbePortal>` (Task 3 only has to install & test).

- [ ] **Step 1: Set up Gradle 8.13 (no wrapper on this machine yet)**

`gradle` isn't on the PATH, so download the distribution once, outside the repo, and use it to generate the wrapper we commit.

```bash
#!/usr/bin/env bash
# scripts/bootstrap-gradle.sh
set -e
TOOLS="/c/Users/mansu/dev/tools"
TOOLS_WIN="C:/Users/mansu/dev/tools"   # curl is a native tool: it needs a Windows path
DIST="$TOOLS/gradle-8.13"
mkdir -p "$TOOLS"
if [ ! -f "$DIST/bin/gradle" ]; then
  curl -L -o "$TOOLS_WIN/gradle-8.13-bin.zip" https://services.gradle.org/distributions/gradle-8.13-bin.zip
  unzip -q -o "$TOOLS/gradle-8.13-bin.zip" -d "$TOOLS"
fi
"$DIST/bin/gradle" --version
```

Run: `bash scripts/bootstrap-gradle.sh`
Expected: `Gradle 8.13` shows up with JVM 21 (`source scripts/env.sh` first).

- [ ] **Step 2: Write the probe project's Gradle files**

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

`probe/local.properties` (do not commit):
```properties
sdk.dir=C:/Users/mansu/AppData/Local/Android/Sdk
```

- [ ] **Step 3: Generate the wrapper, then verify the configuration**

Run:
```bash
cd /c/Users/mansu/dev/iitc-auto/probe
"/c/Users/mansu/dev/tools/gradle-8.13/bin/gradle" wrapper --gradle-version 8.13
./gradlew --version
```
Expected: `Gradle 8.13` + JVM 21. If Kotlin 2.4.21 is rejected by AGP 8.13 (an "incompatible" message), drop to `2.2.20` in `probe/build.gradle.kts` and repeat.

- [ ] **Step 4: Write the test first (RED)**

`probe/app/src/test/java/id/acunet/portalprobe/ProbeDataTest.kt`:
```kotlin
package id.acunet.portalprobe

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProbeDataTest {
    @Test
    fun `three probe markers with different factions`() {
        val portals = ProbeData.PROBE_PORTALS
        assertEquals(3, portals.size)
        assertEquals(setOf("R", "E", "N"), portals.map { it.team }.toSet())
    }

    @Test
    fun `levels and coordinates stay within a plausible range`() {
        ProbeData.PROBE_PORTALS.forEach { p ->
            assertTrue("level ${p.level} outside 1..8", p.level in 1..8)
            assertTrue("lat ${p.lat} outside Jakarta", p.lat in -7.0..-5.5)
            assertTrue("lng ${p.lng} outside Jakarta", p.lng in 106.0..107.5)
        }
    }
}
```

Run: `./gradlew :app:testDebugUnitTest --tests '*ProbeDataTest*'`
Expected: FAIL — `Unresolved reference: ProbeData`.

- [ ] **Step 5: Implement the data + service + screen (GREEN)**

`probe/app/src/main/java/id/acunet/portalprobe/ProbeData.kt`:
```kotlin
package id.acunet.portalprobe

/** Dummy data for the Android Auto gate. Throwaway — discarded once the gate passes. */
data class ProbePortal(
    val name: String,
    val lat: Double,
    val lng: Double,
    val team: String,   // R / E / M / N
    val level: Int,
    val distanceM: Int,
)

object ProbeData {
    // Three real portals around Monas/Central Jakarta, enough to test markers + colours.
    val PROBE_PORTALS = listOf(
        ProbePortal("Probe · Monas South", -6.17650, 106.82710, "R", 8, 210),
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
        HostValidator.ALLOW_ALL_HOSTS_VALIDATOR // only reasonable for a debug/sideload build

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

private fun toPlace(portal: ProbePortal): Place =
    Place.Builder(CarLocation.create(portal.lat, portal.lng))
        .setMarker(
            PlaceMarker.Builder()
                .setColor(colorFor(portal.team))
                .setLabel(portal.team)
                .build()
        )
        .build()

class ProbeScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        val portals = ProbeData.PROBE_PORTALS
        val places = portals.map(::toPlace)

        val rows = ItemList.Builder().apply {
            portals.forEachIndexed { i, p ->
                addItem(
                    Row.Builder()
                        .setTitle(p.name)
                        .addText("L${p.level} · ${p.team} · ${p.distanceM} m")
                        // Markers on the host map come from Metadata -> Place, not from the list itself.
                        .setMetadata(Metadata.Builder().setPlace(places[i]).build())
                        .build()
                )
            }
        }.build()

        return PlaceListMapTemplate.Builder()
            .setTitle("Portal Probe")
            .setHeaderAction(Action.APP_ICON)
            .setCurrentLocationEnabled(true)
            // setAnchor() wants a Place (not a CarLocation) in Car App 1.7.
            .setAnchor(places.first())
            .setItemList(rows)
            .build()
    }
}
```

`ProbeSession` is written inline in the service file (one file, small responsibility):
```kotlin
// add this to ProbeCarAppService.kt
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

/** Just so the APK has an entry point on the phone (handy to check while debugging a sideload). */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply {
            text = "Portal Probe — install OK.\nOpen it through Android Auto in the car.\n" +
                "If it doesn't show up in the AA launcher: enable Developer mode + Unknown sources."
            textSize = 16f
            setPadding(48, 96, 48, 48)
        })
    }
}
```

- [ ] **Step 6: Manifest + car app declaration**

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

    <!-- POI app: may only request MAP_TEMPLATES. Do NOT add NAVIGATION_TEMPLATES/ACCESS_SURFACE. -->
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

- [ ] **Step 7: Green tests + build the APK**

Run:
```bash
cd /c/Users/mansu/dev/iitc-auto/probe
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
ls -l app/build/outputs/apk/debug/app-debug.apk
```
Expected: tests PASS, APK produced.

- [ ] **Step 8: Commit**

```bash
git add scripts/bootstrap-gradle.sh probe .gitignore
git commit -m "feat(probe): Android Auto APK in the POI category for gate 0a"
```

---

### Task 3: Gate 0a — probe test on the Jaecoo

**Files:**
- Create: `docs/notes/gate0a-android-auto.md`

**Interfaces:**
- Consumes: `probe/app/build/outputs/apk/debug/app-debug.apk` from Task 2.
- Produces: the go/no-go decision used by Task 6.

- [ ] **Step 1: Enable Android Auto developer mode on the phone**

On the phone: `Settings > Apps > Android Auto > Advanced > Additional settings in the app >` (overflow menu) `Developer settings` → enable **Developer mode**; then in the same menu pick **Application mode: Developer** and enable **Unknown sources**.

- [ ] **Step 2: Install the APK**

```bash
source /c/Users/mansu/dev/iitc-auto/scripts/env.sh
adb devices                                  # the phone must show up as 'device' (not 'unauthorized')
adb install -r /c/Users/mansu/dev/iitc-auto/probe/app/build/outputs/apk/debug/app-debug.apk
adb shell cmd package list packages | grep portalprobe
```
Expected: `Success`, and the `id.acunet.portalprobe` package is visible.

- [ ] **Step 3: Check in the car**

Connect the phone to the Jaecoo (USB first — USB is easier to debug than wireless). In the Android Auto launcher look for **Portal Probe**; if it isn't there, open **Customize launcher** and enable it.

- [ ] **Step 4: If it doesn't show up, gather evidence (don't guess)**

```bash
adb logcat -d | grep -iE 'CAR\.AUTH|carapp|portalprobe|template' | tail -60
adb shell dumpsys package id.acunet.portalprobe | grep -A3 -iE 'car|intent'
```
Note the `CAR.AUTH` messages — these are what indicates AA rejecting the sideloaded app.

- [ ] **Step 5: Write down the result**

`docs/notes/gate0a-android-auto.md`: the route (USB/wireless, phone model, Android Auto version, AA version in the car), the result (shows / doesn't show), the raw logs, and if it shows up: a screenshot of the marker display.

- [ ] **Step 6: Commit**

```bash
git add docs/notes/gate0a-android-auto.md
git commit -m "test(gate0a): probe app test results on the Jaecoo head unit"
```

---

### Task 4: Gate 0b — verify the shape of `window.portals` data

**Files:**
- Create: `probe/userscripts/dump-portals.user.js`
- Create: `docs/notes/gate0b-window-portals.md` (filled in once the dump result is in)

**Interfaces:**
- Produces: the list of **real** `window.portals[guid].options.data` fields; the result confirms or corrects the spec §4 contract before `PortalJsonParser` is written.

- [ ] **Step 1: Write the dump userscript**

```javascript
// ==UserScript==
// @name         IITC Dump: window.portals
// @namespace    id.acunet.iitc
// @version      0.1
// @description  Dump the data shape of one IITC portal to verify the bridge contract
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
    if (dumped) return;                       // once only, don't spam dialogs
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
      android.saveFile('iitc-portals-dump.json', 'application/json', json); // opens the save dialog on the phone
    } else {
      alert('The dump has been written to the IITC console (Debug tab); save it manually.');
    }
  });
})();
```

- [ ] **Step 2: Install & run it on the phone**

Copy `dump-portals.user.js` into the IITC Mobile plugins folder (or open it via IITC → `Preferences > Plugins > User scripts > add by URL/file`), open the Intel map over the Jakarta area until the map loads, wait for the "save file" dialog, and save to Downloads.

- [ ] **Step 3: Pull the result into the repo**

```bash
adb pull /sdcard/Download/iitc-portals-dump.json /c/Users/mansu/AppData/Local/hermes/profiles/dev/cache/scratch/
```
(note: `saveFile` may save to another location, adjust the path.)

- [ ] **Step 4: Compare against the spec §4 contract and write down the result**

Fill in `docs/notes/gate0b-window-portals.md` with: the real `dataKeys` list, the fields the bridge uses (`latE6`/`lngE6`/`team`/`level`/`title`/`health` — present or not), and a **contract correction** if they turn out different. Example of the expected content: `latE6` + `lngE6` present, `team` a string `'R'/'E'/'M'/'N'`.

- [ ] **Step 5: Commit**

```bash
git add probe/userscripts/dump-portals.user.js docs/notes/gate0b-window-portals.md
git commit -m "test(gate0b): dump and verify the shape of window.portals data"
```

---

### Task 5: Import upstream IITC Mobile + build as-is

**Files:**
- Create: `scripts/import-upstream.sh`
- Create (import result): `mobile/`, `code/`, `build.py`, etc. from upstream
- Create: `docs/notes/upstream.md`

**Interfaces:**
- Consumes: this repo as a full upstream fork.
- Produces: `mobile/gradlew`, `mobile/app/` (the base that the bridge gets attached to in the next plan), and a record of the imported upstream SHA.

- [ ] **Step 1: Write the import script**

```bash
#!/usr/bin/env bash
# scripts/import-upstream.sh — import the upstream tree into this repo (fork by content).
set -e
REPO="/c/Users/mansu/dev/iitc-auto"
UPSTREAM="https://github.com/IITC-CE/ingress-intel-total-conversion.git"
TMP="/c/Users/mansu/dev/tools/upstream-iitc"

git -C "$REPO" remote add upstream "$UPSTREAM" 2>/dev/null || true

if [ -d "$TMP/.git" ]; then git -C "$TMP" fetch --depth 1 origin master && git -C "$TMP" reset --hard origin/master
else git clone --depth 1 "$UPSTREAM" "$TMP"; fi

SHA=$(git -C "$TMP" rev-parse HEAD)
echo "upstream SHA=$SHA"

# our README.md is kept; the upstream README comes in as README-UPSTREAM.md
# (rsync isn't available on this git-bash host -> use tar)
tar cf - --exclude='./.git' --exclude='./.github' --exclude='./README.md' --exclude='./.gitignore' \
  . | ( cd "$REPO" && tar xf - )
cp "$TMP/README.md" "$REPO/README-UPSTREAM.md"

printf 'upstream=%s\nsha=%s\ntanggal_import=%s\n' \
  "$UPSTREAM" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REPO/docs/notes/upstream.md"
echo "done — check: git -C $REPO status --short | head"
```

- [ ] **Step 2: Run & commit the import**

```bash
cd /c/Users/mansu/dev/iitc-auto
bash scripts/import-upstream.sh
git add -A && git commit -m "vendor: import upstream IITC-CE @ $(git rev-parse --short upstream/master)"
```
Expected: the upstream tree is imported, a new commit is created, `docs/notes/upstream.md` contains the SHA.

- [ ] **Step 3: Build upstream as-is (THIS IS THE IMPORTANT TEST)**

```bash
source /c/Users/mansu/dev/iitc-auto/scripts/env.sh
cd /c/Users/mansu/dev/iitc-auto/mobile
./gradlew --version          # must be Gradle 8.13 + JVM 21
./gradlew assembleDebug
ls -l app/build/outputs/apk/debug/
```
Expected: an IITC Mobile debug APK is produced.

- [ ] **Step 4: If the build fails — record it, don't patch blindly**

Write the exact error (the failing task + the first message) into `docs/notes/upstream.md`. Known candidate causes: `compileSdk 36` not fully installed, the debug signing config (`../keystore/debug.keystore`) missing, or an AGP/Kotlin version that doesn't match JDK 21. If it isn't resolved within one session, **stop and report** — this is gate F1, not work that should be forced.

- [ ] **Step 5: Install on the phone and check login**

```bash
adb install -r mobile/app/build/outputs/apk/debug/app-debug.apk
```
Open the app, log in to Ingress as usual (if `403 disallowed_useragent` appears: log in through Chrome first, then go back to the app — this is the official upstream workaround), then make sure the portal map appears.

- [ ] **Step 6: Commit the notes**

```bash
git add docs/notes/upstream.md
git commit -m "docs: build status of upstream IITC Mobile on this machine"
```

---

### Task 6: Gate decision → proceed to the next plan

**Files:**
- Create: `docs/notes/gate0-decision.md`

- [ ] **Step 1: Recap the three results**

Write with numbers/evidence, not opinion:
1. Gate 0a: does the sideloaded app show up in the Jaecoo? (yes/no + logs)
2. Gate 0b: the real portal data fields (quote `dataKeys`)
3. F1: does upstream IITC Mobile build & does login work?

- [ ] **Step 2: Decide and write the next steps**

- Everything passes → next plan: "Bridge + Car UI" (`sendPortals`, `PortalRepository`, the throttled bridge userscript, `PortalMapScreen`, op targets, stale indicator).
- Gate 0a fails → **stop**: rewrite the options (a separate Android head unit/tablet, or AAOS), do not continue writing AA features.
- Gate 0b differs from the assumption → correct the spec §4 contract first, then continue.
- F1 fails to build → explicitly agree on plan B (our own WebView app), including the OAuth consequences in spec §2.

- [ ] **Step 3: Commit**

```bash
git add docs/notes/gate0-decision.md
git commit -m "docs: gate 0 decision and the direction for the next phase"
```

---

## Execution notes

- This phase **does not touch** IITC Mobile code beyond importing it wholesale. All bridge changes are in the next plan.
- Task 1 and Task 2 can run in parallel; Task 3 needs the car + phone; Task 4 needs the phone + an Ingress account; Task 5 needs Task 1's toolchain finished.
- What I (the agent) can do without you: Task 1, Task 2 (code + build), Task 5 Steps 1-3 (import + build). What needs you at the phone/car: Task 3, Task 4 Step 2, Task 5 Step 5.
