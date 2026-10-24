# Toolchain Android di mesin ini

Dicek & disiapkan: 2026-10-24

## Yang sudah ada / terpasang

| Komponen | Versi | Path |
|---|---|---|
| JDK untuk build | **Temurin 21.0.12.1 LTS** | `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` |
| JDK di PATH (default) | Temurin 25.0.3 | `%LOCALAPPDATA%\Programs\Eclipse Adoptium\jdk-25.0.3.9-hotspot` — **jangan dipakai buat build** |
| Android Studio (+ JBR 25) | terpasang | `C:\Program Files\Android\Android Studio` |
| Android SDK | — | `C:\Users\mansu\AppData\Local\Android\Sdk` |
| platforms | android-36.1 | — |
| build-tools | 36.1.0, 37.0.0 | — |
| platform-tools / adb | 37.0.1 | — |
| cmdline-tools (sdkmanager) | 23.0.0 | `…\Sdk\cmdline-tools\latest\bin` |
| Android Auto Desktop Head Unit (DHU) | r02.0 (build 2022-03-30) | `…\Sdk\extras\google\auto\desktop-head-unit.exe` |
| emulator | 37.1.11 (update 37.2.12 tersedia) | `…\Sdk\emulator` |
| Gradle (distribusi lokal) | 8.13 | `C:\Users\mansu\dev\tools\gradle-8.13` (di luar repo) |
| Node / Git | 26.7.0 / 2.53.0 | — |

Versi build yang dipakai project: **AGP 8.13.0**, **Kotlin 2.4.21**, **androidx.car.app 1.7.0** (verifikasi: terkompilasi sukses di probe).

## Cara pakai

```bash
source scripts/env.sh      # JAVA_HOME -> JDK 21, ANDROID_HOME -> SDK, PATH -> adb/sdkmanager
cd probe && ./gradlew assembleDebug
```

## Masih kurang / catatan

1. **Java default di PATH masih JDK 25.** `java -version` tanpa `source scripts/env.sh` akan nunjukin 25. AGP 8.13 butuh 17–21, jadi selalu source dulu.
2. **Belum ada AVD & system image.** Emulator ada binary-nya tapi nggak ada image, jadi emulator belum bisa boot. Kalau nanti butuh emulator AAOS: `sdkmanager "system-images;android-36;google_apis_playstore;x86_64"` lalu `avdmanager create avd …`. Untuk sekarang DHU + mobil asli dianggap cukup.
3. **`sdkmanager` sudah deprecated** — Google mindahkan ke CLI `android` (`…\cmdline-tools\latest\bin\android.bat`, subcommand `android sdk`). Masih jalan, tapi peringatannya muncul di tiap panggilan.
4. **Paket DHU `extras;google;auto` nggak bisa di-install lewat sdkmanager lagi** — argumen `;` kepecah saat lewat `.bat` (hasil: "Package extras/google/auto not found"). Solusinya DHU diunduh langsung dari `https://dl.google.com/android/repository/desktop-head-unit-windows-x64_r02.0.zip` lalu di-unzip ke `extras/google/auto` (dilakukan oleh `scripts/install-android-tools.sh`).
5. **DHU butuh HP tersambung:** di HP aktifkan Android Auto Developer mode → *Start head unit server*, lalu `adb forward tcp:5277 tcp:5277`; alternatifnya jalankan DHU dengan flag `-u` (USB/AOA).
6. **Lisensi SDK:** `android-sdk-license` sudah diterima. Peringatan "The --licenses option is no longer needed" aman diabaikan.

## Jebakan host ini (git-bash di Windows) yang sudah memakan korban

1. **Bare `/tmp` nggak ada** → `curl -o /tmp/...` gagal ("No such file or directory"). Semua scratch pakai `C:\Users\mansu\dev\tools`.
2. **Architecture native tool nggak ngerti path MSYS.** `curl` (native) nggak bisa nulis ke `/c/Users/...` ("The system cannot find the file specified"). Untuk setiap pemanggilan tool native, kirim path gaya Windows (`C:/Users/...`); tool MSYS (`mkdir`, `unzip`, `ls`, `mv`) tetap pakai `/c/...`.
3. **Jangan taruh path `C:/...` di `PATH`.** bash memakai `:` sebagai separator, jadi entri `C:/Program Files/...` pecah jadi dua entri (`C` + `/Program Files/...`) dan tool-nya nggak ketemu. `JAVA_HOME`/`ANDROID_HOME` boleh (dan harus) gaya Windows; entri `PATH` wajib gaya MSYS `/c/...`.
4. **Test `-x` nggak jalan untuk file `.bat`** di MSYS (`sdkmanager.bat` ada tapi `-x` false → installer mengunduh ulang 147 MB). Pakai `-f`.
