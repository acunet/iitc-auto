#!/usr/bin/env bash
# Sumber file ini sebelum build:  source scripts/env.sh
#
# Kenapa dua format path dipakai:
#  - JAVA_HOME/ANDROID_HOME buat native tool (java, gradlew) => format Windows "C:/..."
#  - entri PATH harus format MSYS "/c/..." karena bash di host ini pakai ':' sebagai
#    separator, jadi "C:/..." akan pecah jadi dua entri ("C" + "/Program Files/...").

export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"
export ANDROID_HOME="C:/Users/mansu/AppData/Local/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

JDK21_MSYS="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"
SDK_MSYS="/c/Users/mansu/AppData/Local/Android/Sdk"
export PATH="$JDK21_MSYS/bin:$SDK_MSYS/platform-tools:$SDK_MSYS/cmdline-tools/latest/bin:$PATH"
hash -r

echo "JAVA_HOME   = $JAVA_HOME"
echo "ANDROID_HOME= $ANDROID_HOME"
java -version 2>&1 | head -1
