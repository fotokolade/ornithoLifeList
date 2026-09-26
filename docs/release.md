# Ein Release veröffentlichen

Nur für den Projektleiter: So entsteht eine neue Version mit `lifelist.exe` auf der GitHub-Releases-Seite.

1. Die Versionsnummer `APP_VERSION` in `src/i18n.js` erhöhen.
2. Die Release-Notizen nach `.github/release-notes/v<Version>.md` schreiben, zum Beispiel `v0.3.0.md`, und beides committen und pushen.
3. Auf GitHub im Tab **Actions** den Workflow **Release** mit **Run workflow** starten. Alternativ das Tag selbst pushen: `git tag v0.3.0 && git push origin v0.3.0`.

Den Rest erledigt GitHub Actions (`.github/workflows/release.yml`) auf einem Windows-Rechner: Es legt beim Start von Hand das Tag aus der Versionsnummer an (ein gepushtes Tag prüft es gegen die Versionsnummer), lässt die Tests laufen, baut die `lifelist.exe` und legt das Release an, mit `lifelist.exe`, `lifelist.exe.sha256`, `verify.bat` und `verify.ps1` und der Prüfsumme in den Notizen. Das Tag muss zur Versionsnummer passen, sonst meldet `--check-update` keine neue Version.

Zum Ausprobieren lässt sich die exe auch selbst bauen: unter Windows `python build.py` (oder `build.bat` doppelklicken), nach `pip install pyinstaller`. Das Skript lässt zuerst die Tests laufen und schreibt dann `dist\lifelist.exe` samt `dist\lifelist.exe.sha256`. PyInstaller baut immer für das System, auf dem es läuft.
