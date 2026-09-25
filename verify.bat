@echo off
rem Checks lifelist.exe against its published SHA256 checksum, see verify.ps1. Double-click to run.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify.ps1" %*
pause
