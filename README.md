# IITC Auto

**IITC** (Ingress Intel Total Conversion) portals on an **Android Auto** head unit — so during a
field op you can see nearby portals and your op targets on the car screen instead of squinting at
the phone.

Built for personal use with an Android Auto capable head unit (in this case: a Jaecoo J7).
**Not** an official IITC-CE or Niantic project.

## Two modes

| Car state | What you see | How it works |
|---|---|---|
| **Driving** | Portal map in a POI template: one marker per faction (R blue / E green / M red / N grey), level and distance; op-target portals are always included even when far away | `CarAppService` with the POI category + `PlaceListMapTemplate` — the host renders the map, we only supply `Place` markers |
| **Parked** | The **real IITC**, fullscreen (WebView + plugins, unmodified) | `android.intent.category.CAR_LAUNCHER` (parked app). Android Auto dismisses the app as soon as the car moves |

## How the bridge works (driving mode)

```
IITC WebView (intel.ingress.com, session owned by IITC itself)
  └─ assets/iitc-auto-bridge.js      injected automatically once IITC finishes booting
       │  hooks mapDataRefreshEnd → reads window.portals → 15 s throttle,
       │  only sends when the payload changed, max 300 portals, plus the viewport bbox
       └─ app.sendPortals(json)      JavascriptInterface (named "app" in this fork)
            └─ car/PortalBridge      validation (ingress.com only, 256 KB cap) + parser
                 └─ car/PortalMapScreen   → PlaceListMapTemplate + markers + DistanceSpan
```

What is deliberately **not** used, and why:

- **No separate background WebView.** IITC Mobile already handles Ingress login, plugin storage and
  its own WebView session; a second WebView would inherit Google's OAuth block on embedded WebViews
  (`403 disallowed_useragent`) plus Doze/lifecycle problems. The bridge attaches to the WebView that
  already exists.
- **Zero extra requests to intel.ingress.com.** The data sent is exactly the data IITC already
  fetched for the user; the bridge never requests data on its own and never pans the map. This keeps
  the intel usage profile (and the rate-limit / "excessive intel use" risk) unchanged.
- **No storage permissions, no IPC.** The WebView → car screen data path stays inside one process.

## Status

- **F2 done, partially verified.** The bridge and the car screen are implemented: `13 JVM tests` +
  `8 JS tests` green, and `PlaceListMapTemplate` rendering with faction markers was proven on an
  Android Automotive OS emulator (see `docs/notes/img/`).
- **Not yet verified end-to-end in a car** (needs a phone logged into Ingress plus the head unit).
  Per-phase notes live in [`docs/notes/`](docs/notes/) (Indonesian).

## Build

```bash
# requirements: JDK 17-21, Android SDK (platform 36), Node
npm install                  # build deps for the IITC userscript (lightningcss etc.)
python build.py mobile       # generates assets/total-conversion-build.user.js + plugins/
cd mobile && ./gradlew assembleDebug
```

**Important:** the IITC userscript assets (`mobile/app/src/main/assets/total-conversion-build.user.js`
and `plugins/`) are generated, not produced by Gradle. Without `python build.py mobile` the APK is
empty and IITC hangs on its splash screen. Both paths are in `.gitignore`.

Tests:

```bash
cd mobile && ./gradlew :app:testDebugUnitTest       # 13 JVM tests
node mobile/tests/iitc-auto-bridge.test.mjs         # 8 tests for the bridge userscript logic
```

## Layout

| Path | Contents |
|---|---|
| `mobile/` | the Android app fork (IITC Mobile) plus its Android Auto layer |
| `mobile/app/src/main/java/org/exarhteam/iitc_mobile/car/` | Android Auto layer (Kotlin) |
| `mobile/app/src/main/assets/iitc-auto-bridge.js` | bridge userscript (our code, committed) |
| `probe/` | separate POI-category probe app: checks whether a head unit shows sideloaded car apps at all |
| `docs/superpowers/` | design spec and implementation plan |
| `docs/notes/` | phase notes, gate results, technical findings, screenshot evidence |
| `scripts/` | build / test / toolchain helpers |

## License, attribution and ethics

This project is a **fork** of
[IITC-CE / ingress-intel-total-conversion](https://github.com/IITC-CE/ingress-intel-total-conversion).
The upstream tree was imported as-is at commit `b017817df9d753195973ecbddd25a1d036549a7d`
(see [`docs/notes/upstream.md`](docs/notes/upstream.md)).

- **Upstream licensing is preserved:** [`LICENSE`](LICENSE) (ISC — © 2018-2020 IITC-CE,
  © 2013-2018 IITC) and [`ATTRIBUTION.md`](ATTRIBUTION.md) (third-party components and plugins).
  Copyright notices are untouched.
- **Our changes are itemised** in [`MODIFICATIONS.md`](MODIFICATIONS.md), so it stays clear which
  code is upstream and which is IITC Auto.
- **No endorsement is implied.** "IITC" and "Ingress" are used to indicate provenance, not to imply
  support from IITC-CE or Niantic. Rename it if you plan to distribute it widely.
- **The upstream README is kept** as `README-UPSTREAM.md`.

### Warnings you should read

1. **IITC is considered a violation of the Ingress ToS.** Niantic states that all third-party
   software violates the ToS; the risk (including account bans) is the user's. Do not post IITC
   screenshots to official Ingress channels.
2. **Sideload only.** This app cannot ship on Google Play: the parked "browser" category is not
   supported on Android Auto, and a POI template would need manual review against a
   "meaningful functionality relevant to driving" requirement.
3. **Parked mode works only while the car is stationary** — Android Auto stops the app as soon as the
   car moves. That is a Google safety rule, not a design choice here.
4. Do not install this on a production head unit or on a vehicle you do not own.

## Contributing

Issues and PRs are welcome, but the priority is personal use: changes that add requests to
intel.ingress.com or increase request frequency will be rejected.
