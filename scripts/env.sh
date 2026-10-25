#!/usr/bin/env bash
# SPDX-License-Identifier: ISC
# Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
# Source this file before building:  source scripts/env.sh
#
# Why two path formats are used:
#  - JAVA_HOME/ANDROID_HOME are for native tools (java, gradlew) => Windows "C:/..." format
#  - PATH entries must use the MSYS "/c/..." format because bash on this host uses ':' as its
#    separator, so "C:/..." would be split into two entries ("C" + "/Program Files/...").

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
