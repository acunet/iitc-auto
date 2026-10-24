#!/usr/bin/env bash
# Sumber file ini sebelum build:  source scripts/env.sh
#
# Kenapa perlu: `java` di PATH mesin ini masih JDK 25 (AGP 8.13 minta 17-21),
# dan ANDROID_HOME belum di-set. Pakai path gaya Windows (C:/...) karena
# konversi path MSYS dimatikan di host ini, jadi native tool butuh format native.

export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"
export ANDROID_HOME="C:/Users/mansu/AppData/Local/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

echo "JAVA_HOME   = $JAVA_HOME"
echo "ANDROID_HOME= $ANDROID_HOME"
java -version 2>&1 | head -1
