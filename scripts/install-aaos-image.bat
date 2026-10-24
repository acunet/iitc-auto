@echo off
REM scripts/install-aaos-image.bat
REM Kenapa file .bat terpisah: cmd.exe memperlakukan ';' sebagai pemisah argumen, jadi
REM memanggil sdkmanager langsung dari git-bash bikin nama paket kepecah
REM ("Package system-images not found"), dan escape ^; juga nggak nembus.
REM Di dalam .bat, tanda kutip dipertahankan sehingga ';' aman.
call "C:\Users\mansu\AppData\Local\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=C:/Users/mansu/AppData/Local/Android/Sdk "system-images;android-35-ext15;android-automotive-playstore;x86_64"
