@echo off
REM SPDX-License-Identifier: ISC
REM Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)
REM scripts/create-aaos-avd.bat
REM Same reason as install-aaos-image.bat: the ';' in the package name must be wrapped
REM inside the .bat so cmd.exe does not split the argument.
set SDK=C:\Users\mansu\AppData\Local\Android\Sdk
echo no | call "%SDK%\cmdline-tools\latest\bin\avdmanager.bat" create avd -n aaos35 -k "system-images;android-35-ext15;android-automotive-playstore;x86_64" -d automotive_1408p_landscape_with_play --force
