# Legal / licence audit — 2026-10-25

What was checked before the repository was treated as publishable, what was found, and what was
changed. Conclusions live in [`NOTICE.md`](../../NOTICE.md); this file is the record of the audit.

## 1. Licence chain

| Layer | Licence | Evidence |
|---|---|---|
| Upstream IITC-CE (`core/`, `mobile/`, plugins) | ISC | `LICENSE` (kept byte-identical), ISC badge on upstream README |
| Third-party components upstream ships (jQuery, Leaflet, plugins) | per component | `ATTRIBUTION.md` (upstream, unchanged) |
| This fork's new code (car layer, bridge userscript, probe, scripts) | ISC, same as upstream | `SPDX-License-Identifier: ISC` headers added to our files; statement in `NOTICE.md` §1 |
| AndroidX Car App Library (`app`, `app-projected`, `app-automotive`, lifecycle) | Apache-2.0 | coordinates in `mobile/app/build.gradle` |
| `org.json:json` | JSON License | test-only dependency (`testImplementation`), not shipped in the APK |

Checked that no dependency adds a copyleft obligation to the shipped APK: everything linked into the
app is ISC or Apache-2.0. The GPL-family code in the tree is JavaScript that ships as IITC plugins
and keeps its own notices — unchanged from upstream.

## 2. Repository hygiene (what should not be public)

| Check | Result |
|---|---|
| Signing keys / keystores committed | No — `mobile/keystore.properties` and `*.keystore`/`*.jks` are gitignored; only `mobile/keystore.properties.example` with `PUT_..._HERE` placeholders is tracked |
| Keystores anywhere in git history | No (`git log --all --diff-filter=A --name-only` swept for `keystore`, `*.properties`, `.env`) |
| Release passwords, tokens, `.env` files | None found |
| Local machine paths | `local.properties` untracked |
| Bulk portal data / exports | None — portal payloads used for testing live outside the repo (`C:\Users\mansu\dev\tools\real-payload.json`) |
| Build logs | Untracked |
| **Found and fixed:** compiled `__pycache__/*.pyc` of the upstream build scripts, committed by accident in `19508d9` | Removed from tracking and added to `.gitignore` |
| `deploy_rsa.enc` | Upstream's own encrypted CI key, carried over with the import; kept for fidelity, useless without upstream's passphrase |

## 3. Niantic terms — mapping each concern to a design decision

| Concern in Niantic's terms / support pages | How this project stands |
|---|---|
| "Accessing Ingress clients or backends in an unauthorized manner ... through third party software" | The APK *is* a modified IITC Mobile build (a local userscript injection), so the user is already inside "modified or unofficial software" territory by definition — this is IITC's documented risk, inherited, not created. |
| "Using modified or unofficial software" as a termination reason | Same as above: unavoidable for any IITC client. Stated in `NOTICE.md` §2 and the README, with a throwaway-account recommendation. |
| Scraping / automated access / rate-limit abuse | The bridge adds **zero** new requests: it forwards data IITC already fetched for the visible viewport, ≥15 s apart, ≤300 portals, only on change. No scraping, no bots, no automation of gameplay. |
| Location falsification | Not used. The car screen uses the vehicle's real GPS, and only for map centring / distance. |
| Commercial use of the Services | Project stays non-commercial: no price, no ads, no hosted service; recommendation for forks spelled out in `NOTICE.md` §2. |
| Redistributing Niantic's data or assets | None: no portal database, no tiles, no game assets are collected or published; data stays in phone memory. |

## 4. Google / Android Auto terms

| Concern | Position |
|---|---|
| Play Store car-app policy (POI category needs manual review; `MAP_TEMPLATES`) | Avoided entirely: not distributed via Play, sideload only, documented as such in the README. |
| "Distraction optimised" driving rules | Enforced by the platform: only official templates while driving; the full WebView is parked-only. |
| Misuse of the car app API (fake categories) | The app declares the POI category (`MAP_TEMPLATES` only) and never requests navigation-category permissions it cannot satisfy. |

## 5. Open items / residual risk (nothing hidden)

1. **Screenshots contain the author's own area.** `docs/notes/img/aaos-real-portals-*.png` show real
   portal names and coordinates around the author's location (public Intel-map data, but still their
   area). Replace with synthetic data before publishing more widely if that matters.
2. **The ToS question about local userscript injection is unresolved by Niantic.** No public
   clarification exists, so the conservative reading (it is "unofficial software") is what is
   documented. Any user decides their own risk.
3. **Not legal advice.** This audit checks licence compatibility and repo hygiene; it is not a legal
   opinion, and Niantic's terms can change at any time.
