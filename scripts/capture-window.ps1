# scripts/capture-window.ps1 — screenshot one specific window (default: the Desktop Head Unit window).
# Used to capture the virtual head unit view without having to shoot the whole desktop.
#   powershell -ExecutionPolicy Bypass -File scripts/capture-window.ps1 -ProcessName desktop-head-unit -Path C:/.../dhu.png
param(
    [string]$ProcessName = "desktop-head-unit",
    [string]$Path = "C:/Users/mansu/dev/tools/dhu-window.png"
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) {
    Write-Output "JENDELA_TIDAK_DITEMUKAN: process '$ProcessName' is not running or has no window yet"
    exit 2
}

[void][WinHelper]::ShowWindow($p.MainWindowHandle, 9)   # SW_RESTORE
[void][WinHelper]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 700

$r = New-Object WinHelper+RECT
[void][WinHelper]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
if ($w -le 0 -or $h -le 0) { Write-Output "UKURAN_JENDELA_NOL"; exit 3 }

$bmp = New-Object System.Drawing.Bitmap $w, $h
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose(); $bmp.Dispose()

Write-Output ("OK window '" + $ProcessName + "' " + $w + "x" + $h + " -> " + $Path)
