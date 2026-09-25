@echo off
rem Builds dist\lifelist.exe for a release, see build.py. Double-click to run.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (py build.py %*) else (python build.py %*)
pause
