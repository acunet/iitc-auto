# Gate 0a — testing the Android Auto app without a car (Android Automotive OS emulator)

Status: **PASSED for template rendering on AAOS** (2026-10-24). The Android Auto projection test
(Jaecoo car / DHU) has **not** been done yet — it needs an authorized phone + head unit server.

Evidence: `docs/notes/img/aaos-probe-render.png`

## What finally showed up

`PlaceListMapTemplate` rendered on the virtual AAOS head unit (emulator `system-images;android-35-ext15;
android-automotive-playstore;x86_64`, AVD `aaos35`, main display 1408x792):

- Title **"Portal Probe"** in the header.
- **Google Maps** (drawn by the host) over the Monas/Central Jakarta area.
- **3 markers** matching faction: blue (R), green (E), white/grey (N).
- **3 list rows** with distance spans: `R · 210 m · L8 · R`, `E · 640 m · L6 · E`, `N · 980 m · L1 · N`.

Note: the row content the host reads is the **marker label + distance + extra text**, while the row
title (portal name) doesn't appear in that row. This needs another look in F4 — possibly because
`DistanceSpan` is attached to the title, the host uses that title as the distance text. Candidate fix:
put the span in `addText()` and leave the title as plain text.

## Five real bugs found (all runtime, not compile-time)

All the error messages are in logcat under tag **`CarApp.H.Tem`**, and the host kills our app process as
soon as one of them is violated. The order is exactly this:

1. `IllegalArgumentException: Min API level not declared in manifest (androidx.car.app.minCarApiLevel)`
   → `<application>` must have `<meta-data android:name="androidx.car.app.minCarApiLevel" android:value="1"/>`.
2. `IllegalArgumentException: All non-browsable rows must have a distance span attached to either its title or texts`
   → every `PlaceListMapTemplate` row must have a `DistanceSpan`. How to attach it (not through the
   `CarText.create` argument): `SpannableString(name)` + `setSpan(DistanceSpan.create(Distance.create(m, Distance.UNIT_METERS)), 0, length, 0)` then `CarText.create(spannable)`.
3. `MISSING_PERMISSION: The car app does not have the required location permission(s)` → the app process dies.
   Cause: `setCurrentLocationEnabled(true)` without location permission. Needs `ACCESS_FINE_LOCATION` +
   `ACCESS_COARSE_LOCATION` in the manifest **and** a grant on the driver user:
   `adb shell pm grant --user 10 <pkg> android.permission.ACCESS_FINE_LOCATION`.
   A grant without `--user` lands on user 0 (AAOS runs the driver on user 10) and has no effect.
4. The app doesn't appear as a car app / tapping it opens a regular activity instead
   → AAOS needs the entry point `androidx.car.app.activity.CarAppActivity` (from `androidx.car.app:app-automotive`,
   **minSdk 29**) with a `LAUNCHER` filter; the app's regular activity, on the other hand, must have **no**
   LAUNCHER filter.
5. `app-projected` + `app-automotive` in one variant → meta-data clash on
   `CarAppMetadataHandlerService.CAR_HARDWARE_MANAGER` → split with **product flavors**
   (`projected` minSdk 24, `automotive` minSdk 29). This is also the pattern the real app will use
   (IITC Mobile itself is minSdk 21).

## Quick reproduction

```bash
source scripts/env.sh
bash scripts/aaos-emulator-test.sh                 # boot AVD + install automotive APK
adb -s emulator-5554 shell pm grant --user 10 id.acunet.portalprobe android.permission.ACCESS_FINE_LOCATION
adb -s emulator-5554 shell am start -n id.acunet.portalprobe/androidx.car.app.activity.CarAppActivity
adb -s emulator-5554 logcat -d -s 'CarApp.H.Tem' | head -3      # check host errors
adb -s emulator-5554 shell screencap -p -d <displayId> /sdcard/x.png && adb -s emulator-5554 pull /sdcard/x.png <path->
```

Emulator note: the AVD's GPS location isn't set, so the car's "current position" isn't accurate — the
distance spans in this test use dummy numbers from `ProbeData`.

## Why this test isn't the final proof

This emulator's runtime is **AAOS (an embedded car OS)**; the Jaecoo J7 uses **Android Auto projection**
(phone mirrored to the head unit). Facing the host, the template may differ (host version, category
rules, and the sideload path via `Unknown sources`). What this test does prove: **our template contract
is valid and markers + distance spans render**. What still has to be proven in the car: whether the
Android Auto host is willing to show a sideloaded app at all (that is the real Gate 0a, via the DHU path).
