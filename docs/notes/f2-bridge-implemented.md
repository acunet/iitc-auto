# F2 — portal bridge + Android Auto screen: implemented

Date: 2026-10-25
Status: **code done, tests green, APK built. Not yet tested end-to-end with real portal data**
(needs a phone logged into Ingress + a car, or at minimum a plugged-in phone so the injection logs can be checked).

## What was built

The data flow is in-process, one APK, no files/IPC:

```
WebView IITC (intel.ingress.com page)
   └─ userscript iitc-auto-bridge.js  (injected automatically by the app after IITC boots)
        └─ app.sendPortals(json)      (JavascriptInterface named "app")
             └─ IITC_JSInterface.sendPortals()   → source + size validation
                  └─ PortalBridge (StateFlow)    → parser + snapshot
                       └─ IitcCarAppService / PortalMapScreen
                            └─ PlaceListMapTemplate + markers (faction colors) + DistanceSpan
```

| File | Its role |
|---|---|
| `car/Portal.kt` | `Portal`, `Faction`, `BoundingBox`, `PortalSnapshot` models (+ 120-second "stale" logic) |
| `car/PortalJsonParser.kt` | v1 payload parser + every validation gate (version, size, broken portals dropped) |
| `car/Geo.kt` | haversine + `selectPortalsForDisplay` (op targets always included, the rest nearest-first) |
| `car/PortalBridge.kt` | the WebView ↔ car rendezvous; `isTrustedSource` only accepts `ingress.com`/subdomains |
| `car/OpsTargetStore.kt` | list of op target guids in SharedPreferences |
| `car/PortalMapScreen.kt` | `PlaceListMapTemplate` template: markers + DistanceSpan + TARGET label + stale-data indicator |
| `car/IitcCarAppService.kt` | `CarAppService` of category POI + `Session` |
| `assets/iitc-auto-bridge.js` | userscript: hooks `mapDataRefreshEnd`, 15 s throttle, only-if-changed, max 300 portals |
| `IITC_JSInterface.java` | `sendPortals()` + `injectAutoBridge()` (injects the asset when `bootFinished` fires) |

## Evidence that already exists

- **13 green JVM tests** (`mobile/app/src/test/.../car/PortalBridgeTest.kt`): parsing, version/size
  validation, broken portals, level clamping, staleness, target selection, haversine, rejection of
  foreign sources.
- **8 green JS tests** (`node mobile/tests/iitc-auto-bridge.test.mjs`), logic taken from the real
  userscript file through a `vm` sandbox — not a copy.
- The `app-debug.apk` contents are verified: `IitcCarAppService`, `CarAppService` action, category
  `androidx.car.app.category.POI`, `MAP_TEMPLATES` permission, `minCarApiLevel` meta-data, category
  `CAR_LAUNCHER` (parked), and the app label **IITC Auto**.
- Rendering of `PlaceListMapTemplate` + faction markers + distance spans was already proven on the AAOS
  emulator (`docs/notes/img/aaos-probe-render.png`).

## What hasn't been verified (and requires a phone/car)

1. The userscript injection works in the real app → check `adb logcat | grep "bridge: userscript Android Auto"`.
2. The shape of real `window.portals` data matches the assumption (the bridge is already tolerant: `latE6/lngE6`, `lat/lng`,
   or `layer.getLatLng()`; faction as a number or a letter).
3. The Android Auto host shows this app in the launcher + its templates work while driving.

## Technical notes from this phase

- The JavascriptInterface name in this fork is **`app`**, not `android` (older IITC docs mention `android`).
- `org.json` in Android unit tests is only a stub ("not mocked") → added `testImplementation 'org.json:json:...'`.
- Upstream's bundled test `IITC_DebugHistoryTest.display` always fails on Windows because it compares
  `System.lineSeparator()` against a hardcoded `"\n"` — fixed to be cross-platform.
- The first version of `isTrustedSource` was too loose (`endsWith("ingress.com")` also accepts
  `evil-ingress.com`) — caught by a test, tightened to `ingress.com` / `*.ingress.com`.

## Verification on a real phone (2026-10-25) — and one deadlock bug

After a second phone logged in with a dummy account, two things were proven and one big bug was found:

**Proven:** the bridge userscript really is installed automatically by the app on a real phone
(`adb logcat -s iitcm | grep bridge:` → `bridge: userscript Android Auto disuntik ke WebView`).

**Deadlock bug (fixed):** `app.sendPortals(json)` **hung with no error**, so 0 payloads reached native.
Cause: `WebView.getUrl()` was called **from the JS bridge thread** in `IITC_JSInterface.sendPortals()` —
on Android, WebView APIs must not be called from that thread, and the result is a deadlock (no exception,
so no trace in logcat).
Fix: the URL is cached on the UI thread (`IITC_WebViewClient.onPageFinished` →
`PortalBridge.setCurrentUrl`) and the bridge only reads that cache. General lesson: **a
`@JavascriptInterface` method must be free of any WebView/UI API**; if it needs data from the UI thread,
store it in a field first.

**New verification tool:** `scripts/cdp-bridge-test.py` — connects to the WebView over Chrome DevTools
Protocol (WebView debugging is indeed enabled in IITC Mobile) so the state can be inspected without
looking at the car screen:

```bash
adb -s <serial> forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof org.exarhteam.iitc_mobile.debug)
python scripts/cdp-bridge-test.py --probe      # bridge state + portal count in window.portals
python scripts/cdp-bridge-test.py --trigger    # force a send using real portal data
python scripts/cdp-bridge-test.py --eval "<js>"  # arbitrary JS expression
```

Note: the DevTools WebSocket handshake **rejects** the `Origin` header (403) — use
`websocket.create_connection(url, suppress_origin=True)`.

`--probe` result on a real phone: `bridgeInstalled=true`, `nativeBridge=true`, `iitcLoaded=true`,
`portalCount=237`, `hasMap=true`.

**Final status: VERIFIED with real portal data.** `--trigger` produced
`bridge: payload portal diterima (237 portal, 26422 char)` in logcat (3 sends accepted, 0 rejected).
Full evidence + log excerpts are in `docs/notes/f2-verified-log.txt`. All that's left untested is
whether the Android Auto host on the car head unit is willing to show this sideloaded app.


> Note: when these lines were captured the app still logged them in Indonesian; the code logs them in English now.
