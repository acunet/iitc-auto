# Why IITC Auto is missing from the Android Auto launcher (open, 2026-11-03)

Symptom: after connecting the phone to the car's Android Auto, "IITC Auto" does not appear in the
car's app grid / "Customize launcher" list, so there is nothing to enable.

## What is verified (evidence, not guesses)

| Check | Result |
|---|---|
| Installed package | `org.exarhteam.iitc_mobile.debug` — the **projected** flavour (the automotive one is not installed) |
| Car app registration in the system | `dumpsys package` lists `IitcCarAppService` with action `androidx.car.app.CarAppService` + category `androidx.car.app.category.POI`, `exported=true` |
| APK manifest | `MAP_TEMPLATES` permission, `com.google.android.gms.car.application` meta-data, `automotive_app_desc` = `<uses name="template"/>`, `minCarApiLevel=1`, `uses-feature automotive required=false` |
| "Unknown sources" in AA developer settings | **ON** (read from the UI twice, not from memory) |
| Did AA connect to the car? | Yes — AA created its projection displays (`Dashboard`, `CarAppService`, `GhAppLauncherService`, `TemplateCarFragment`, Maps car service) at 14:05 on Nov 3 |
| Did the car host open our car app? | **No** — `iitc-auto-car` log is empty for the whole session |
| Did AA build its launcher list? | Yes — `GH.LauncherApps: Creating launcher apps with filters: [IGNORE_CACHE]` at 14:03, 14:04, 14:10 and 14:11 |
| Any rejection/skip of our app? | None — no line anywhere mentions the package in a car context |

## The control experiment

The repo's `probe/` app is a minimal, textbook POI template app (same category, same meta-data, no
IITC code). It was installed on the phone as a control. Result:

- **The phone-side "Customize launcher" list is the snapshot of the last car session.** It does not
  refresh on install; new apps can only show up after the phone connects to the car again. So the
  control can only be read on the next car connection.
- That snapshot contains `Calendar, GameSnacks, Maps, Meet, Messages, Messenger, News, Phone,
  Reminder`. **GameSnacks is a Car App Library template app by Google**, so the head unit does
  support template apps — it is not a protocol limitation of the car.

## Reading (still unconfirmed)

With the package, manifest and toggles all correct, AA running a full projection session, and a
minimal control app behaving the same way, the most likely explanation is AA 17.9's sideload policy
for template apps: the launcher list only receives approved apps, and the "Unknown sources" toggle
does not add sideloaded Car App Library apps to it on this version.

Not proven. The next car connection settles it:
1. Reboot the phone first (AA rebuilds its indexes at boot).
2. Connect to the car.
3. Look for **both** "IITC Auto" and "Portal Probe" in the car's app grid.

| Outcome | Meaning | Next step |
|---|---|---|
| Both appear | AA needed the reboot; done | remove the probe, carry on |
| Only Portal Probe appears | our app has a manifest/app-level problem | diff the two manifests, bisect (first suspect: the `CAR_LAUNCHER` parked-app category we add to `IITC_Mobile`) |
| Neither appears | AA sideload policy | see options below |

## Options if AA refuses sideloaded template apps

1. Older Android Auto build on a spare phone (older AA versions are said to honour "Unknown
   sources"); needs an APK from outside Play, and takes the phone off the supported path.
2. **Skip Android Auto entirely**: mount a small Android tablet/head unit and run the app fullscreen.
   The full-IITC view already works (proven on the AAOS emulator and on the phone), so this needs no
   new code — only a mount and a charger.
3. Wait for a newer Desktop Head Unit from Google (the current one is from 2022 and does not start a
   projection session with AA 17.9 — see `dhu-attempt.md`).

## After the reboot (2026-11-03 14:18)

The phone was rebooted; AA rebuilt its launcher list at 14:16:20 (`GH.LauncherApps ... [IGNORE_CACHE]`)
and the "Customize launcher" list now reads:

    Calendar, GameSnacks, Maps, Meet, Messages, Messenger, News, Phone, Reminder,
    Settings, WA Business, Weather, WhatsApp  (+ Customize / Hidden Apps entries)

Still **no IITC Auto and no Portal Probe**. Two things stand out:

1. The list is not a stale car-session snapshot after all - a reboot rebuilds it.
2. Everything in it is Play-installed (WhatsApp / WA Business are third-party, but Play).
   Nothing sideloaded appears, whether it is a template app or our control app.

That fits Google's documented split: "Unknown sources" in AA developer settings is the testing
switch for the legacy AA categories (media / messaging), while Car App Library **template** apps
are expected to be installed from Play - and the officially supported way to test an unpublished
template app is the Desktop Head Unit, which no longer starts a session with AA 17.9
(see dhu-attempt.md). We did not find a code-level workaround.

Practical consequence: the car's own launcher is very likely out of reach for a sideloaded build.
See the options section above; the tablet/head-unit route needs no code and the full IITC view
already runs.
