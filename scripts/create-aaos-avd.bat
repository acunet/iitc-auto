@echo off
REM scripts/create-aaos-avd.bat
REM Sama alasannya dengan install-aaos-image.bat: ';' pada nama paket harus dibungkus
REM di dalam .bat supaya cmd.exe nggak mecah argumennya.
set SDK=C:\Users\mansu\AppData\Local\Android\Sdk
echo no | call "%SDK%\cmdline-tools\latest\bin\avdmanager.bat" create avd -n aaos35 -k "system-images;android-35-ext15;android-automotive-playstore;x86_64" -d automotive_1408p_landscape_with_play --force
