# IITC → Android Auto: Portal Glance Map — Design Spec

**Date:** 2026-10-24
**Status:** approved in chat (2026-10-24), so it is the basis for the implementation plan
**Target hardware:** Jaecoo J7 (14.8" head unit, wireless Android Auto) + the user's Android phone
**Repo:** `C:\Users\mansu\dev\iitc-auto`

---

## 1. Problem & goals

Out in the field during an op, the team needs to know which portals are around without having to look at a phone.
The car screen (Android Auto) cannot display IITC as-is: Android Auto only accepts *template*-shaped UI from the Car App Library, not a free-form WebView/DOM.

**Goal:** portals around the current position + op-target portals appear as markers on the car-screen map, glance-able while driving (position, faction, level).

**Non-goals (deliberately out of scope):**

- A replacement for IITC on the phone (IITC Mobile is still used as-is for detailed work).
- An app for the public / Google Play.
- GPS auto-follow that keeps panning the intel map (triggers rate limits).
- Chat/COMMS, deployment planner, or other IITC plugin features.
- Free-form map pan/zoom like IITC (limited by the platform, see §4).

---

## 2. Platform facts that constrain the design

| Fact | Design consequence | Source |
|---|---|---|
| Android Auto only displays templates from the AndroidX Car App Library; the categories allowed for cars are: Media, Messaging, Calling, Navigation, POI, IOT, Weather, Games | Our app has to be one of the template categories ⇒ **POI** | developer.android.com/training/cars/apps/library |
| `PlaceListMapTemplate` (POI category, `androidx.car.app.MAP_TEMPLATES` permission) = a map **drawn by the host** (Google Maps), the app only sends `Place`s/markers | Choose this one: cheap, no need for our own tile renderer | developer.android.com/training/cars/apps/poi |
| `MapWithContentTemplate` / `NavigationTemplate` = the app draws into a `Surface` itself via `SurfaceCallback` (API level 7) | Not used: the IITC WebView cannot be moved onto a Surface, which means writing a tile renderer from scratch | developer.android.com/training/cars/apps/library/draw-maps |
| The NAVIGATION category requires turn-by-turn (NF-1), voice/cluster metadata (NF-3/NF-4), nav intent (NF-6) | A portal map app could never pass as Navigation | developer.android.com/docs/quality-guidelines/car-app-quality |
| Full map interaction (pan/zoom/tap) exists only in navigation templates: `Navigation`, `RoutePreview`, `Map`, `PlaceList(navigation)` | With `PlaceListMapTemplate` we can only auto-center (`fitToBounds`); the user cannot freely pan. This is Google's limit, not ours | developers.google.com/cars/design/.../plan-task-flows |
| Play review for car apps is manual + the POI `PF-1` requirement "meaningful functionality relevant to driving" | Distribution = **sideload** (AA developer mode + Unknown sources), not Play | support.google.com/googleplay/android-developer/answer/18058043 |
| Google blocks OAuth in embedded WebView (`403 disallowed_useragent`); this is a real bug in IITC Mobile itself, and the workaround is to log in through the browser first | Never build our own WebView/login ⇒ **login stays IITC Mobile's job** | github.com/IITC-CE/.../issues/402 |
| Android Auto can run sideloaded apps that don't come from a trusted source via the "Unknown sources" developer option; there are reports from Jun 2026 of sideloaded apps not appearing in the launcher even with that option enabled | There must be a **Gate 0** before writing any real features | developer.android.com/training/cars/testing |

**On the ToS:** Niantic considers IITC and all third-party software to violate the Ingress
ToS. This project inherits that risk (a small but real account-ban risk). Design consequence:
**zero extra intel requests** (§3 rate-limit discipline) so the user's usage profile does not
change from what they already do today.

---

## 3. Architecture

**Decision: one APK = an IITC Mobile fork + `CarAppService` in the same APK.**

```
 Phone (one APK, one process)                                 Car screen (Android Auto)
┌───────────────────────────────────────────────┐           ┌──────────────────────────┐
│ IITC Mobile (upstream)                        │           │ PlaceListMapTemplate     │
│  WebView ─ intel.ingress.com + IITC core      │           │  map: drawn by host      │
│    │  window.portals (data portal)            │           │  marker: from Place list │
│    │  hook: mapDataRefreshEnd                 │           └──────────▲───────────────┘
│    ▼                                          │                      │ Place[] + fitToBounds
│ plugin: android-auto-bridge.user.js           │                      │
│    │  filter bbox, throttle, serialize JSON   │                      │
│    ▼  android.sendPortals(json)   ← NEW bridge│                     │
│ IITC_JSInterface.sendPortals(String)          │                      │
│    ▼                                          │                      │
│ PortalRepository (StateFlow<List<Portal>>)  ──┼──────────────────────┘
│    ▲                                          │        IitcCarAppService → PortalMapScreen
│ OpsTargetStore (op-target guid list)          │
└───────────────────────────────────────────────┘
```

**Components:**

| Unit | Responsibility | Interface |
|---|---|---|
| `IITC_JSInterface.sendPortals(String json)` *(new, in the fork)* | Receives the payload from the userscript, validates origin + size, forwards it to the repository | `@JavascriptInterface fun sendPortals(json: String)` |
| `PortalRepository` | Parses JSON → state; computes staleness | `val portals: StateFlow<PortalSnapshot>` |
| `OpsTargetStore` | Stores the list of op-target guids (+labels) | `val targets: StateFlow<Set<String>>` |
| `android-auto-bridge.user.js` | Hooks `mapDataRefreshEnd`, filters bbox, throttles, serializes | `android.sendPortals(json)` |
| `IitcCarAppService` / `PortalMapScreen` | Builds the template + markers from state | `Screen.onGetTemplate(): Template` |
| `PortalJsonParser` | JSON → `List<Portal>` (pure, unit-testable) | `parse(json: String): ParseResult` |

**Why a fork and not just a userscript in the official IITC Mobile:** the methods upstream
already exposes are limited (`intentPosLink`, `shareString`, `copy`, `saveFile`, `getFileRequestUrlPrefix`,
`setFollowMode`, `addPane`, `setLayers`, `setProgress`, `setPermalink`, `reloadIITC`,
`addInternalHostname` — read from `mobile/app/src/main/java/org/exarhteam/iitc_mobile/IITC_JSInterface.java`).
`saveFile()` opens a save-file dialog (manual, can't be used for sync), `copy()` is only the
clipboard, `shareString()` opens a chooser. There is no raw-data path into native ⇒ adding one
new method is the smallest change that is actually correct.

**Why one APK and not two apps:** (a) no storage-permission / file-sharing concerns,
(b) `sendPortals` is delivered in-process (no IPC/service binding), (c) a single artifact to
sideload, (d) a `CarAppService` may live in an APK that also has a regular launcher activity.

---

## 4. Data contract

Bridge payload, version 1 (JSON, max 256 KB):

```json
{
  "v": 1,
  "ts": 1761300000000,
  "bbox": [south, west, north, east],
  "portals": [
    { "g": "<portal guid>", "n": "Portal Name", "lat": -6.2245, "lng": 106.8091,
      "t": "R", "l": 8, "hp": 87 }
  ]
}
```

- `t`: `R` (Resistance/blue), `E` (Enlightened/green), `M` (Machina/red), `N` (neutral/grey).
- Source on the IITC side: `window.portals[guid].options.data` (provides `latE6`, `lngE6`, `team`,
  `level`, `title`, `health`). **The exact field names are verified in Gate 0b** — if they differ,
  the adapter in the plugin changes, not the contract.
- Portals sent = those **already** loaded by IITC in the user's viewport. No new requests to intel.

**Rate-limit discipline (part of the design, not a later optimization):**

- Send throttle: at least 15 seconds between payloads, and only if the contents changed (compare hashes).
- Limit of 300 portals nearest the bbox center.
- If the user doesn't have IITC Mobile open, the bridge doesn't run at all (no GPS polling).
- The bbox comes from the IITC viewport at that moment; the car app never requests data on its own.

---

## 5. UI behaviour

**Screen 1 — root ("Nearby portals"):** `PlaceListMapTemplate`
- `fitToBounds` to the payload bbox → the map immediately highlights the op area.
- Markers = one `Place` per portal; op targets use a different-coloured `PlaceMarker` + the label "TARGET".
- List (max 6 rows per page, per the template's limit): op targets go on top,
  row = `"CG Sudirman Selatan"` / `"L8 · R · 240 m"`.
- Tapping a row → Screen 2.

**Screen 2 — portal detail:** `PaneTemplate` + title
- Faction, level, health, guid, last update (data age), plus an "open on phone" action
  (an `intentPosLink`-style deep link into IITC Mobile — using `ParkedOnlyOnClickListener`
  so it isn't active while driving).

**Special states:**

| Condition | Display |
|---|---|
| `now - ts > 120 s` | Header "stale data · X minutes ago" + markers dimmed |
| No payload at all yet | `MessageTemplate`: "No data yet. Open IITC Mobile on the phone and pan to the op area." |
| Invalid payload | Drop + log, the screen keeps showing the last valid payload |
| 0 portals in the bbox | Map without markers + message "no portals readable in this area" |

Template limits respected: max 5 screen levels, no marquee text/animations,
large touch targets, no keyboard while driving.

---

## 6. Error handling

- **IITC WebView dies / phone locked for a long time:** state stays in memory; if the process dies,
  `PortalRepository` recovers empty → the screen shows the "no data yet" state instead of crashing.
- **Expired login:** the plugin keeps sending its last cache; the app marks the data stale.
- **Bridge called from another page (not intel.ingress.com):** ignored + logged.
- **Oversized payload / broken JSON:** rejected before parsing, logged, never crashes.
- **Android Auto not connected:** `CarAppService` is never invoked; the APK still works
  as a normal IITC Mobile.

---

## 7. Security & compliance

- The app **never** handles Ingress credentials; login is 100% inside IITC Mobile.
- `sendPortals` only accepts from the IITC origin, the payload is size-capped and may only
  write to `PortalRepository` (no file path, no execution).
- No extra intel requests from our side (see §4).
- ToS: this violates Niantic's ToS; the ban risk is borne by the user. This APK is personal — if
  it is shared with the team, every member has to know the risk.
- Distribution: sideload a self-signed APK; updates are manual (reinstall the new APK).
  Not uploaded to Play.

---

## 8. Testing strategy

| Layer | Tool | What's tested |
|---|---|---|
| JVM unit | JUnit (already in the upstream setup) | `PortalJsonParser`, bbox filter, target selection, staleness logic |
| JS unit | `node --test` (Node 26 available) | throttle, dedupe/hash, userscript payload serialization |
| Template UI | Desktop Head Unit (DHU) + AAOS emulator **or** straight on the Jaecoo | marker rendering, auto-center, screen depth, stale/empty states |
| E2E | Phone + Jaecoo (wireless AA) | real data from real portals; check intel consumption |

DHU and the emulator are **not installed yet** on this machine (see §9).

---

## 9. Build & toolchain prerequisites

| Requirement | Status on this machine |
|---|---|
| JDK 21 (AGP 8.13 wants 17–21) | ✅ `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`. Note: `java` on PATH is still **25**, `JAVA_HOME` isn't set yet ⇒ the build must explicitly set `JAVA_HOME` to JDK 21 |
| Android SDK | ✅ `C:\Users\mansu\AppData\Local\Android\Sdk` — platform `android-36.1`, build-tools `36.1.0`/`37.0.0`, `platform-tools` (adb 37.0.1) |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | ❌ not set yet ⇒ use `local.properties` (`sdk.dir=`) |
| `cmdline-tools` (`sdkmanager`) | ❌ missing ⇒ needs downloading to install DHU, the system image, and licenses |
| Desktop Head Unit (`extras/google/auto`) | ❌ not present |
| AVD / system image | ❌ not present (the emulator binary is there, the image isn't) |
| Gradle 8.13 + AGP 8.13 | aligned with upstream IITC Mobile (wrapper lives in the repo) |
| Node 26.7 / Git 2.53 | ✅ |
| Android Studio | ✅ installed (`C:\Program Files\Android\Android Studio`, JBR 25) |

---

## 10. Risks

| Risk | Impact | Mitigation / gate |
|---|---|---|
| AA doesn't show a sideloaded app at all (Jun 2026 reports) | Project dies on the AA track | **Gate 0a**: probe app + test on the Jaecoo before writing features |
| `window.portals` data shape differs from the assumption | Wrong parser | **Gate 0b**: dump one real payload from the user's phone first |
| The upstream IITC Mobile build doesn't work at all on this machine (AGP/JDK/Gradle version/ancient dependencies) | The fork never builds | F1: try building upstream as-is **before** adding code; if it fails, fall back to plan B (our own WebView app) — a deliberate decision |
| Upstream WebView fragility (iitc.app itself has reports of IITC Mobile breaking after an Android WebView update) | The feature breaks too | Accept it; manual updates; don't rely on it for anything critical |
| Intel rate limit / account ban | The user's and the team's accounts get hit | Zero extra requests, 15 s throttle, 300-portal cap |
| Sabotage/abuse through the bridge (payload from another page) | Garbage written to state | Origin validation + size cap (§7) |

---

## 11. Implementation phases

| Phase | Content | Exit gate |
|---|---|---|
| **F0a** | AA probe app in the POI category, 3 dummy markers, sideloaded to the user's phone | Markers appear on the Jaecoo: yes/no |
| **F0b** | Userscript dumps the real `window.portals` → verify the data shape | §4 contract confirmed/corrected |
| **F1** | Import upstream IITC Mobile into the repo, build as-is | `assembleDebug` succeeds, APK installs & login works |
| **F2** | `sendPortals` bridge + `PortalRepository` + unit tests | Unit tests green |
| **F3** | Bridge userscript (throttle/filter) + node tests | Node tests green, real payload arrives |
| **F4** | `IitcCarAppService` + `PortalMapScreen` (+ op targets, stale) | Shows up on DHU/car |
| **F5** | E2E on the Jaecoo + usage documentation | Usable for ops |

F0a/F0b come first on purpose: both are cheap and both can kill or reshape the whole plan.

---

## 12. Decisions on record

1. **Fork IITC Mobile, one APK** — not plugin-only (there's no data path), not a standalone WebView
   app (it would have to shoulder OAuth `disallowed_useragent` + background WebView lifecycle).
2. **`PlaceListMapTemplate`** — the map is drawn by the host; `MapWithContentTemplate` was rejected
   because it needs its own tile renderer and full interaction belongs to the Navigation category only.
3. **Sideload-only** — manual Play review + the PF-1 requirement make a public release unrealistic.
4. **Zero extra intel requests** — all data comes from the user's existing IITC usage; this is what
   keeps the ban-risk profile unchanged.
5. **Fork model:** this repo becomes a full upstream fork (import the tree + record the upstream SHA)
   so `git remote`/rebase onto upstream is easy when the user pushes to GitHub.
