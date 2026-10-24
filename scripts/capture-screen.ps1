# scripts/capture-screen.ps1 — screenshot seluruh layar ke file PNG.
# Dipakai buat ngambil gambar jendela Desktop Head Unit (head unit virtual) di PC.
#   powershell -ExecutionPolicy Bypass -File scripts/capture-screen.ps1 -Path C:/Users/mansu/dev/tools/shot.png
param([string]$Path = "C:/Users/mansu/dev/tools/shot.png")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()

Write-Output ("screenshot tersimpan: " + $Path + " (" + $bounds.Width + "x" + $bounds.Height + ")")
