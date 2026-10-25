@echo off
REM scripts/install-aaos-image.bat
REM Why a separate .bat file: cmd.exe treats ';' as an argument separator, so calling
REM sdkmanager directly from git-bash splits the package name
REM ("Package system-images not found"), and escaping ^; does not get through either.
REM Inside a .bat, quotes are preserved so ';' is safe.
call "C:\Users\mansu\AppData\Local\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=C:/Users/mansu/AppData/Local/Android/Sdk "system-images;android-35-ext15;android-automotive-playstore;x86_64"
