@echo off
rem Updates this copy from GitHub, see update.py. Double-click to run.
cd /d "%~dp0"
rem if/else instead of && ... || so a failed update is not run a second time with the py launcher
where python >nul 2>nul
if errorlevel 1 (py update.py) else (python update.py)
pause
