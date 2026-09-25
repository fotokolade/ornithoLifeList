# Checks that lifelist.exe is exactly the file published on the GitHub releases page.
# Usage: double-click verify.bat, or: powershell -ExecutionPolicy Bypass -File verify.ps1 [path\to\lifelist.exe]
# Compares with lifelist.exe.sha256 next to the exe (attached to each release), or asks for the
# checksum shown in the release notes when that file is missing.
param([string]$Exe = (Join-Path $PSScriptRoot "lifelist.exe"))

if (-not (Test-Path -LiteralPath $Exe)) {
    Write-Host "$Exe not found. Put this script next to lifelist.exe or pass its path."
    exit 2
}
$sumFile = "$Exe.sha256"
if (Test-Path -LiteralPath $sumFile) {
    $expected = ((Get-Content -LiteralPath $sumFile -Raw).Trim() -split '\s+')[0]
    Write-Host "Checksum from $(Split-Path -Leaf $sumFile)"
} else {
    $expected = (Read-Host "Paste the SHA256 checksum from the release page").Trim()
}
if ($expected -notmatch '^[0-9a-fA-F]{64}$') {
    Write-Host "That is not a SHA256 checksum (64 hexadecimal characters)." -ForegroundColor Yellow
    exit 2
}
$actual = (Get-FileHash -LiteralPath $Exe -Algorithm SHA256).Hash
Write-Host "expected: $($expected.ToUpper())"
Write-Host "actual:   $actual"
if ($actual -ieq $expected) {
    Write-Host "OK: lifelist.exe matches the published checksum." -ForegroundColor Green
    exit 0
}
Write-Host "WARNING: the checksum does NOT match. This lifelist.exe is not the published one - do not run it." -ForegroundColor Red
exit 1
