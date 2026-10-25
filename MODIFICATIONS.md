# Changes relative to upstream IITC-CE

This fork is built on
[IITC-CE / ingress-intel-total-conversion](https://github.com/IITC-CE/ingress-intel-total-conversion)
at commit `b017817df9d753195973ecbddd25a1d036549a7d` (imported 2026-10-24, see
`docs/notes/upstream.md`).

The files below are the **only** differences from upstream. To tell our code apart from IITC code,
start from this list (or diff against `upstream/master`).

## Files inherited from upstream that we modified

| File | Change |
|---|---|
| `mobile/app/build.gradle` | added the `kotlin-android` plugin, `kotlinOptions.jvmTarget = 1.8`, the `androidx.car.app:app` + `app-projected` + `kotlinx-coroutines-android` dependencies, and `testImplementation org.json` (the `android.jar` stub cannot be used to test the parser) |
| `mobile/build.gradle` | added the `kotlin-gradle-plugin` classpath entry (the fork is otherwise all Java; Kotlin is used only by the `car` package) |
| `mobile/app/src/main/AndroidManifest.xml` | added the `androidx.car.app.MAP_TEMPLATES` permission, the automotive `uses-feature`, the `com.google.android.gms.car.application` and `androidx.car.app.minCarApiLevel` metadata, the `org.exarhteam.iitc_mobile.car.IitcCarAppService` service (POI category), and the `android.intent.category.CAR_LAUNCHER` category on the main activity's intent filter (parked app) |
| `mobile/app/src/main/res/xml/automotive_app_desc.xml` | **new file** — declares `<uses name="template"/>` |
| `mobile/app/src/{main,debug,beta}/res/values/app_name.xml` | app name set to **IITC Auto** |
| `mobile/app/src/main/java/org/exarhteam/iitc_mobile/IITC_JSInterface.java` | added `sendPortals(String)` (`@JavascriptInterface`), `injectAutoBridge()` and `readAsset()`; `bootFinished()` now injects the bridge userscript |
| `mobile/app/src/test/java/org/exarhteam/iitc_mobile/IITC_DebugHistoryTest.java` | `display()` now compares against `System.lineSeparator()`; upstream hardcodes `"\n"`, so that test **always fails on Windows** |
| `mobile/gradlew`, `mobile/gradlew.bat`, `mobile/gradle/wrapper/gradle-wrapper.jar` | replaced with the modern Gradle 8.13 wrapper; the 2015-era script relies on `cygpath` and breaks in Windows git-bash |
| `.gitignore` | added `node_modules/` and the generated assets (`total-conversion-build.user.js`, `plugins/`) |

## New files and directories (pure IITC Auto additions)

| Path | Contents |
|---|---|
| `mobile/app/src/main/java/org/exarhteam/iitc_mobile/car/Portal.kt` | `Portal`, `Faction`, `BoundingBox`, `PortalSnapshot` models |
| `.../car/PortalJsonParser.kt` | bridge payload parser plus version/size/quality validation |
| `.../car/PortalBridge.kt` | WebView → car bridge (StateFlow) and `ingress.com` source validation |
| `.../car/Geo.kt` | haversine distance and portal selection (op targets + N nearest) |
| `.../car/OpsTargetStore.kt` | op-target portal GUIDs (SharedPreferences) |
| `.../car/PortalMapScreen.kt` | `PlaceListMapTemplate`: faction markers, DistanceSpan, TARGET tag, stale-data indicator |
| `.../car/IitcCarAppService.kt` | `CarAppService` with the POI category + `Session` |
| `mobile/app/src/main/assets/iitc-auto-bridge.js` | bridge userscript (`mapDataRefreshEnd` hook, throttling, serialisation) |
| `mobile/app/src/test/java/.../car/PortalBridgeTest.kt` | 13 JVM tests |
| `mobile/tests/iitc-auto-bridge.test.mjs` | 8 tests for the userscript logic (run with `node`, `vm` sandbox) |
| `probe/` | Android Auto probe app (POI category) to check whether a head unit displays sideloaded car apps |
| `docs/`, `scripts/` | spec, plan, phase notes, screenshot evidence, build/test helpers |
| `README-UPSTREAM.md` | upstream's original README |

## Rules we follow when adding code

1. **Never add requests to intel.ingress.com.** The bridge only forwards data IITC already fetched
   for the user; no polling, no automatic map panning.
2. **Never handle credentials.** Ingress login stays inside the IITC WebView; no token is stored or
   sent anywhere by our code.
3. **Keep changes to upstream files as small as possible.** All new features live in the `car/`
   package plus one userscript asset, so rebasing onto upstream stays cheap.
