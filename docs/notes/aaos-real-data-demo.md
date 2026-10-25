# Real-data demo on the car screen (AAOS emulator) + UI bugs found

Date: 2026-10-25

## What was done

1. **The `automotive` flavor** was added to `mobile/app/build.gradle` (dimension `runtime`,
   alongside the existing `projected` flavor). Reason: the two Android for Cars runtimes need
   different artifacts (`app-projected` vs `app-automotive`), and combining them clashes on the
   meta-data `CarAppMetadataHolderService.CAR_HARDWARE_MANAGER`. The `automotive` flavor also
   uses minSdk 29 (forced by `app-automotive`) and `applicationIdSuffix .automotive`.
2. `mobile/app/src/automotive/AndroidManifest.xml` adds the entry point
   `androidx.car.app.activity.CarAppActivity`. On AAOS, without this activity the car launcher will
   open the regular IITC UI, not the car templates.
3. **The verification tool was extended** (`scripts/cdp-bridge-test.py`):
   `--dump-payload` (grab the last payload from the phone's WebView) and `--inject-payload`
   (send that payload to another instance, e.g. the emulator), plus the `CDP_PORT` env var.

Demo flow: phone logged into Ingress → `--dump-payload` (300 portals, 34,428 chars, Citayam/Bogor area,
faction spread N:55 E:131 R:56 M:58) → the emulator receives the same payload via
`--inject-payload` → open `CarAppActivity` → the `PlaceListMapTemplate` template renders.

Evidence: `docs/notes/img/aaos-real-portals-v1.png` and `aaos-real-portals-v2.png`

## Two UI bugs that only turned up by looking at the car screen

1. **Portal names missing, replaced by the distance.** `DistanceSpan` was attached to the row *title*, and
   the host renders that distance as the title — so what showed was `154.5 m`, not the portal name.
   *Fix:* title = portal name (plain text), `DistanceSpan` moved to the first `addText`.
   Verified: the row now shows `Masjid Roudhotul Jannah` / `154.5 m` / `L1 · neutral`.
2. **"HP 0%" on a neutral portal.** IITC reports health 0 for a neutral portal, and we were
   displaying it raw. *Fix:* HP is only shown for portals that have a faction and > 0.

## Technical notes

- **The first send can be rejected if the page hasn't finished loading.** When tested on the emulator,
  the first payload was rejected with `sumber bukan intel.ingress.com (null)` because the URL cache
  (filled by `onPageFinished`) wasn't populated yet. That's harmless: the bridge re-sends on the next map
  refresh. If it's needed later, self-healing could be added (read the URL once on the UI thread and cache
  it), but it hasn't been done because the risk is zero and it adds a code path.
- **Maximum 6 rows per page.** `PlaceListMapTemplate` limits the number of rows, and the markers on
  the map come from those rows' metadata — so practically at most ~6 markers are shown at once.
  In the demo, the 5 nearest portals to the bbox center happened to all be neutral L1, so the colored
  markers (E/R/M) didn't appear even though the data was there. This is a host limitation, not a bug: if an
  op needs colored markers to appear, the options are to narrow the bbox (pan the map on the phone) or mark
  portals as op targets.
- **Location permission must be granted to the driver user** (`pm grant --user 10 ...`) if
  `setCurrentLocationEnabled(true)` is used on the AAOS emulator; otherwise the host kills the app process.


> Note: when these lines were captured the app still logged them in Indonesian; the code logs them in English now.
