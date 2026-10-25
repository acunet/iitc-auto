# Legal notice — IITC Auto

IITC Auto is an unofficial, non-commercial fork of
[IITC-CE / ingress-intel-total-conversion](https://github.com/IITC-CE/ingress-intel-total-conversion)
that adds an Android Auto / Android Automotive head-unit view for nearby Ingress portals.

## 1. Code licence — this project stays open source

- **Upstream IITC-CE code: ISC licence.** [`LICENSE`](LICENSE) is kept byte-identical to upstream
  (© 2018-2020 IITC-CE, © 2013-2018 IITC, © 2013 Stefan Breunig). Copyright notices are untouched.
- **Modifications and new files by this fork (IITC Auto, © 2026 Acunet) are released under the same
  ISC licence.** Permission to use, copy, modify and/or distribute for any purpose with or without
  fee is granted, provided the copyright notice and the permission notice are preserved. New files
  carry an `SPDX-License-Identifier: ISC` header.
- There is **no proprietary component, no open-core split, and no separate commercial edition**.
  Anyone may fork, study, change and redistribute the whole thing.
- Third-party components keep their own licences. The inventory upstream maintains in
  [`ATTRIBUTION.md`](ATTRIBUTION.md) (jQuery, Leaflet and friends, individual plugins) applies
  unchanged. The Android layer this fork adds uses:
  - `androidx.car.app:app`, `:app-projected`, `:app-automotive` — Apache License 2.0
  - AndroidX / Kotlin / AndroidX lifecycle libraries — Apache License 2.0
  - `org.json:json` — only a unit-test dependency, not shipped in the APK
- The app icon and logo assets (`assets/IITC*.svg`, `assets/IITC*.png`) come from the upstream tree
  and are used under the same ISC terms. No trademark claim is made; the names "Ingress", "IITC" and
  "IITC-CE" are used to describe provenance only.

## 2. Game data, accounts and Niantic's terms

This project is not affiliated with, endorsed by or supported by Niantic (Niantic Spatial) or
IITC-CE, and it grants you no rights of any kind to Ingress data or services.

**What the app does not do** (by design — these are the points that keep our footprint identical to
ordinary IITC use):

- It makes **no additional requests to `intel.ingress.com`**. The bridge only forwards portal data
  that IITC has already loaded for the map the user is looking at, throttled to one send per 15 s
  (max 300 portals, and only when the content actually changed). No scraping, no extra polling, no
  bots, no automated gameplay actions, no map movement on the user's behalf.
- It does **not falsify the device location**, and it does not use the Ingress client or backend in
  any way the stock IITC Mobile app does not already use.
- Portal data is handled **in memory on the user's own phone**. Nothing is uploaded, there is no
  telemetry or analytics, and this project collects, publishes or redistributes **no portal
  database and no game asset**.

**The honest risk statement** (do not skip this part):

- IITC-CE itself says on <https://iitc.app/>: *"This site and the scripts are not officially
  affiliated with Ingress or Niantic Labs. Using these scripts is likely to be considered against
  the Ingress Terms of Service. Any use is at your own risk."* IITC Auto inherits that position
  exactly.
- Niantic treats "accessing Ingress clients or backends in an unauthorized manner ... through the
  use of third party software" as cheating, and lists "using modified or unofficial software" among
  the reasons accounts get terminated:
  <https://ingress.com/terms>, <https://support.ingress.com/hc/en-us/articles/41140395680795>,
  <https://support.ingress.com/hc/en-us/articles/41140396093979>.
  Whether a local userscript injected into an unchanged IITC session is treated the same as a
  modified client has never been clarified by Niantic. Assume the stricter reading.
- Niantic's terms grant **no rights for business or commercial use** of the Services
  (<https://ingress.com/terms>, preamble). Keep this project non-commercial: don't sell it, don't
  put ads in it, don't run it as a paid service, don't resell access. A fork that monetises it is
  doing so on its own account, not with this project's blessing.
- Practical rules we follow and recommend: test with a **throwaway account**, never on an account
  you care about; never use the pin/target feature to automate gameplay; and don't post IITC
  screenshots in official Ingress channels.

## 3. Google and Android Auto

- This app is **not distributed through Google Play**. It is built from source and sideloaded
  (Android Auto developer mode + "Unknown sources").
- It is therefore never submitted to Google Play's car-app review. That matters: the POI category
  (`MAP_TEMPLATES`) requires manual review against a "meaningful functionality relevant to driving"
  bar, which a portal map would very likely fail.
- The UI uses **only official Android for Cars App Library templates**. While the car is moving, the
  screen stays inside what that library permits (a glanceable list + host-map view); the full IITC
  WebView is only reachable while the car is stationary, as Google's rules require.

## 4. Material in this repository

- `docs/notes/img/*.png` are screenshots the author captured on their own device, with their own
  account, showing portal names and coordinates of their own area. They are published as test
  evidence. If you fork this and would rather not publish your area, replace them with synthetic
  data before you push.
- `probe/` is a throwaway test app kept for its evidence value; `docs/superpowers/` holds the
  design spec and implementation plan; `scripts/` holds build and test helpers.
- **No credentials, keystores or API keys are committed.** Signing material is gitignored
  (`mobile/keystore.properties`, `*.keystore`, `*.jks`) and only a placeholder example file
  (`mobile/keystore.properties.example`) is tracked. `mobile/keystore/debug.keystore` — generated
  locally for debug builds — has never been committed, and neither has any release key.
- `deploy_rsa.enc` is the upstream project's own encrypted CI key, carried over unchanged from the
  imported tree; it is not ours and is useless without upstream's passphrase.

## 5. No warranty

The ISC licence applies as written: the software is provided "as is", without warranty of any kind.
Nothing in this file is legal advice, and it is not a substitute for reading Niantic's terms,
IITC-CE's terms and Google's car-app policies yourself before you use or distribute this.
