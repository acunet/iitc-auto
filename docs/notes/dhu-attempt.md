# Desktop Head Unit attempt (2026-10-25) — link works, projection never starts

Goal: test the **projection** path (phone mirrored to a car head unit) without the car, using the
Desktop Head Unit, i.e. exactly the path a Jaecoo-style Android Auto head unit uses. Everything
verified before this was the *automotive* path on the AAOS emulator, which is a different runtime.

## What was set up

- Phone: Galaxy Z Flip 5 (SM-F731B), Android 16, **Android Auto 17.9.664044**, dummy Ingress account.
- APK: `app-projected-debug.apk` (`org.exarhteam.iitc_mobile.debug`) installed.
- DHU: `desktop-head-unit.exe` 2.0-windows, build `2022-03-30-438482292`
  (`$ANDROID_HOME/extras/google/auto/`).
- Phone developer settings: developer mode on, **Unknown sources** on (verified toggle state
  `checked=true`), **Start head unit server** started.

## What worked

| Step | Evidence |
|---|---|
| The AA 17.9 build still ships the developer head unit server | `aapt2 dump resources` on `split_config.en.apk`: `string/menu_action_developer_head_unit_network_server`, `string/developer_head_unit_server_notification_*` ("Starting head unit server…"), plus `string` for "Unknown sources" |
| The toggle exists in the overflow menu | uiautomator dump of the AA settings overflow: `Help & feedback / Developer settings / Start head unit server / Quit developer mode`, tap coordinates captured |
| The server really listens | notification "Head unit server running"; `adb shell netstat -ltn` → `tcp6 [::]:5277 LISTEN` (note: `/proc/net/tcp` shows nothing — it listens on **tcp6**, which cost a few confused minutes) |
| The PC reaches it | `adb forward tcp:5277 tcp:5277` |
| DHU speaks to the phone | DHU log: `Connecting over ADB to localhost:5277... [I]: connected.` → `Phone reported protocol version 1.7` → `SSL negotiation finished successfully` (`TLSv1.2 ECDHE-RSA-AES128-GCM-SHA256`, `Verify returned: ok`) |

## What failed

- **Android Auto never starts the projection session.** The DHU window stays on
  `Waiting for phone...` while the transport is connected.
- On one attempt the phone dropped the transport right after the TLS handshake:
  `[E]: Failed to read from transport - disconnect. Exiting...`
- The phone-side car setup activity that AA spawns
  (`action com.google.android.gms.carsetup.START_DUPLEX` →
  `com.google.android.apps.auto.carservice.gmscorecompat.FirstActivityImpl`,
  `CAR.SETUP.LITE: Checking preSetup required: gearheadUpToDate=true`) does **not** render a wizard
  on screen, and starting it manually leaves the launcher in front.
- No actionable reason in logcat: no protocol mismatch, no rejection message. Connectivity is fine
  (Wi-Fi up, `ping 8.8.8.8` ok, airplane mode tested both on and off).

## Reading (inference, not proof)

The phone announces protocol 1.7 and the DHU only implements 1.7 — DHU's last release is from 2022
and AA has moved to 17.9. The observed "connected, then nothing" is consistent with the reported end
of the legacy DHU startup flow somewhere after AA 17.3, but **we did not find an explicit version or
protocol error**, so treat the cause as unconfirmed.

## Consequence

The projection path cannot be verified on this PC/phone combination with the stock DHU. What remains
unverified is only: does the car's Android Auto launcher show this sideloaded app, and does the
projection host render the template. Everything before that point is verified on the automotive
runtime and on the phone itself (data path, markers, subtitles).

Options if this path must be pushed further: a third-party wireless head-unit emulator that speaks
the current AA protocol (e.g. open-headunit), or a phone with an older Android Auto build.

## Fixes that came out of this attempt

- `scripts/dhu-test.sh`: bare `desktop-head-unit` tries the USB/AOA transport and dies with
  "Couldn't find/access compatible USB device" — it now passes `-a 5277`. The script also still
  pointed at the pre-flavour APK path.
- Path rule that keeps biting: PowerShell needs `C:/...` paths, never MSYS `/c/...`
  (`capture-window.ps1 -File /c/...` fails with "does not exist").
- On a locked phone nothing works; `svc power stayon true` plus a longer
  `screen_off_timeout` keeps the screen awake for UI automation. Both were restored afterwards.
