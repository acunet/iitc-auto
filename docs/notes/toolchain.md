# Android toolchain on this machine

Checked & set up: 2026-10-24

## What already exists / is installed

| Component | Version | Path |
|---|---|---|
| JDK for builds | **Temurin 21.0.12.1 LTS** | `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` |
| JDK on PATH (default) | Temurin 25.0.3 | `%LOCALAPPDATA%\Programs\Eclipse Adoptium\jdk-25.0.3.9-hotspot` — **do not use this one for builds** |
| Android Studio (+ JBR 25) | installed | `C:\Program Files\Android\Android Studio` |
| Android SDK | — | `C:\Users\mansu\AppData\Local\Android\Sdk` |
| platforms | android-36.1 | — |
| build-tools | 36.1.0, 37.0.0 | — |
| platform-tools / adb | 37.0.1 | — |
| cmdline-tools (sdkmanager) | 23.0.0 | `…\Sdk\cmdline-tools\latest\bin` |
| Android Auto Desktop Head Unit (DHU) | r02.0 (build 2022-03-30) | `…\Sdk\extras\google\auto\desktop-head-unit.exe` |
| emulator | 37.1.11 (update 37.2.12 available) | `…\Sdk\emulator` |
| Gradle (local distribution) | 8.13 | `C:\Users\mansu\dev\tools\gradle-8.13` (outside the repo) |
| Node / Git | 26.7.0 / 2.53.0 | — |

Build versions used by the project: **AGP 8.13.0**, **Kotlin 2.4.21**, **androidx.car.app 1.7.0** (verification: compiled successfully in the probe).

## How to use

```bash
source scripts/env.sh      # JAVA_HOME -> JDK 21, ANDROID_HOME -> SDK, PATH -> adb/sdkmanager
cd probe && ./gradlew assembleDebug
```

## Still missing / notes

1. **The default Java on PATH is still JDK 25.** `java -version` without `source scripts/env.sh` will show 25. AGP 8.13 needs 17–21, so always source first.
2. **No AVD and no system image yet.** The emulator binary is there but there's no image, so the emulator can't boot yet. If an AAOS emulator is needed later: `sdkmanager "system-images;android-36;google_apis_playstore;x86_64"` then `avdmanager create avd …`. For now DHU + a real car is considered enough.
3. **`sdkmanager` is already deprecated** — Google moved it to the `android` CLI (`…\cmdline-tools\latest\bin\android.bat`, subcommand `android sdk`). It still works, but the warning shows up on every invocation.
4. **The DHU package `extras;google;auto` can no longer be installed through sdkmanager** — the `;` argument gets split when it goes through `.bat` (result: "Package extras/google/auto not found"). The workaround is to download DHU directly from `https://dl.google.com/android/repository/desktop-head-unit-windows-x64_r02.0.zip` and unzip it into `extras/google/auto` (done by `scripts/install-android-tools.sh`).
5. **DHU needs a phone connected:** on the phone enable Android Auto Developer mode → *Start head unit server*, then `adb forward tcp:5277 tcp:5277`; alternatively run DHU with the `-u` flag (USB/AOA).
6. **SDK licenses:** `android-sdk-license` has already been accepted. The "The --licenses option is no longer needed" warning is safe to ignore.

## Traps on this host (git-bash on Windows) that have already bitten us

1. **A bare `/tmp` doesn't exist** → `curl -o /tmp/...` fails ("No such file or directory"). All scratch work goes in `C:\Users\mansu\dev\tools`.
2. **Native tools don't understand MSYS paths.** `curl` (native) can't write to `/c/Users/...` ("The system cannot find the file specified"). For every native tool invocation, pass a Windows-style path (`C:/Users/...`); MSYS tools (`mkdir`, `unzip`, `ls`, `mv`) still use `/c/...`.
3. **Don't put `C:/...` paths in `PATH`.** bash uses `:` as the separator, so an entry like `C:/Program Files/...` splits into two entries (`C` + `/Program Files/...`) and the tool can't be found. `JAVA_HOME`/`ANDROID_HOME` may (and must) be Windows-style; `PATH` entries must be MSYS-style `/c/...`.
4. **The `-x` test doesn't work for `.bat` files** under MSYS (`sdkmanager.bat` exists but `-x` is false → the installer re-downloads 147 MB). Use `-f`.
