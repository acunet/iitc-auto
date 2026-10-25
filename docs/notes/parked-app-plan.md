# Two-mode plan: real IITC while parked, markers while driving

Date: 2026-10-25
Status: decision made after the user said they wanted "a UI as rich as intel.ingress.com / IITC itself,
as long as it can run in the Jaecoo car through Android Auto".

## Why two modes are needed

Android Auto **can't** show a free-form UI (WebView) while the car is moving — if it could, Google
itself says that would be a distraction. The rules that apply (from the official docs):

| Car state | What may be shown | What we can offer |
|---|---|---|
| **Driving** | Car App Library templates only | Portal marker map (POI + `PlaceListMapTemplate`) — rendering already proven |
| **Stopped (parked)** | An activity owned by the app, full screen, free-form UI | **Real IITC (WebView) fullscreen on the car screen** |

The legal basis (training/cars/parked/auto): "On devices running Android 15 or higher, Android Auto
supports running apps in supported parked app categories directly on the head unit" — and registering it
is enough to put `<category android:name="android.intent.category.CAR_LAUNCHER"/>`
in an activity's intent-filter. Android Auto automatically **dismisses the app as soon as the car moves**
(parked = only while stopped).

## What has been done

1. `mobile/app/src/main/AndroidManifest.xml` (IITC Mobile fork): the `CAR_LAUNCHER` category was added
   to the intent-filter of the main activity `IITC_Mobile`. That activity does **not** have
   `distractionOptimized=true`, as required so the system stops it while the car is moving.
   Verified as present in the APK (`aapt2 dump xmltree` → `android.intent.category.CAR_LAUNCHER`).
2. The fork APK (debug) has been rebuilt and installed on the user's phone (SM-A546E, Android 16).

Which means: **there's no new feature code yet** — just one manifest line that turns IITC Mobile into an
Android Auto parked app. If the AA host accepts it, the car screen will show IITC as-is
(map + its plugins) while the car is stopped.

## Limitations to accept (honestly)

- **Parked-only.** As soon as the car moves, Android Auto dismisses the app. So this isn't a replacement
  for driving mode, it's a complement: stop at an op → open IITC on the car's 14.8" screen.
- **Can't get into the Play Store.** The "browsers" category is only supported on Android Automotive OS,
  not on Android Auto; this is pure sideload (the same pattern used by AAAD apps like AA Browser).
- **Not yet verified empirically.** Whether the AA host is willing to show this parked-category sideloaded
  app has to be proven via DHU or directly in the Jaecoo. If the host refuses, this path is dead and all
  that's left is template mode (markers).
- **IITC = an Ingress ToS violation** (see spec §7). Running it on a car screen doesn't change that.

## How to verify

1. On the phone: Android Auto → **Developer settings** → enable **Developer mode** → **Start head unit server**
   (this server dies every time AA restarts; it has to be turned on again for each test session).
2. On the PC: `source scripts/env.sh && adb -s <serial> forward tcp:5277 tcp:5277`
   then run `desktop-head-unit.exe` (stdin must be kept alive — our DHU script uses
   `sleep 3600 |` because DHU exits as soon as stdin hits EOF).
3. Check the AA launcher in the DHU window: **IITC Mobile** should appear with a "P" (parked) badge.
4. Tap → if IITC (portal map) shows up fullscreen, this parked path is **proven**.
