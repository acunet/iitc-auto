# Gate F1 — upstream IITC Mobile kebangun di mesin ini

Status: **LULUS** (2026-10-24)
Upstream: `IITC-CE/ingress-intel-total-conversion` @ `b017817df9d753195973ecbddd25a1d036549a7d` (diimpor lewat `scripts/import-upstream.sh`)

```
BUILD SUCCESSFUL in 28s
33 actionable tasks: 33 executed
```

APK: `mobile/app/build/outputs/apk/debug/app-debug.apk` (varian debug, `applicationIdSuffix = .debug`).

## Tiga hal yang harus dibetulkan sebelum upstream bisa dibangun di mesin ini

Ketiganya sudah dibereskan dan (yang bisa) sudah di-commit ke repo:

1. **`mobile/gradlew` upstream terlalu tua.** Script wrapper-nya (2015) mengandalkan `cygpath` untuk mengubah `CLASSPATH` dari gaya MSYS ke Windows. Di git-bash host ini konversinya nggak terjadi, jadi `java` menerima `-classpath /c/Users/...` → `ClassNotFoundException: org.gradle.wrapper.GradleWrapperMain`.
   *Perbaikan:* `gradlew`, `gradlew.bat`, dan `gradle/wrapper/gradle-wrapper.jar` diganti dengan yang digenerate Gradle 8.13 (diambil dari project `probe/`).
2. **`mobile/keystore/debug.keystore` nggak ada di repo upstream** (gitignored), padahal `mobile/app/build.gradle` menunjuk `file("../keystore/debug.keystore")` — artinya relatif ke `mobile/keystore/`, **bukan** root repo.
   *Perbaikan:* digenerate dengan `keytool` (alias `androiddebugkey`, storepass/keypass `android`).
3. **`mobile/keystore.properties` wajib ada** — build script mengevaluasi `signingConfigs.release` walaupun kita cuma build debug, dan cabang non-CI-nya membaca file itu saat konfigurasi. Tanpa file itu: `C:\...\mobile\keystore.properties (The system cannot find the file specified)` walau target-nya debug.
   *Perbaikan:* dibuat file lokal (gitignored) berisi path absolt ke debug keystore di atas.

Keduanya poin 2–3 **tidak masuk git** (memang seharusnya begitu); tercatat di sini supaya bisa direproduksi di mesin lain.

## Catatan tambahan

- Depot hasil build pakai JDK 21; tanpa `source scripts/env.sh` Gradle akan pakai JDK 25 dari PATH dan AGP 8.13 menolaknya.
- Warning "Deprecated Gradle features … incompatible with Gradle 9.0" berasal dari build script upstream — aman, tapi berarti fork ini terkunci di Gradle 8.x sampai upstream dirapikan.
- Belum diuji: install APK ini ke HP + login Ingress (itu langkah manual di plan, Task 5 Step 5).
