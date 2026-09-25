@echo off
rem Updates this copy from GitHub, see update.py. Double-click to run.
cd /d "%~dp0"
where python >nul 2>nul && (python update.py) || (py update.py)
pause
