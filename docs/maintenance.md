# Pflege durch die Projektleitung

Aufgaben, die nur die Projektleitung erledigt: Releases veröffentlichen, die mitgelieferten Daten und Bibliotheken aktualisieren und die Bilder der README neu erzeugen.

## Ein Release veröffentlichen

1. Die Versionsnummer `APP_VERSION` in `src/i18n.js` erhöhen.
2. Die Release-Notizen nach `.github/release-notes/v<Version>.md` schreiben, zum Beispiel `v0.3.0.md`, und in `CHANGELOG.md` den Abschnitt „Noch nicht veröffentlicht“ zur neuen Version machen; alles committen und pushen.
3. Auf GitHub im Tab **Actions** den Workflow **Release** mit **Run workflow** starten. Alternativ das Tag selbst pushen: `git tag v0.3.0 && git push origin v0.3.0`.

Die Demo-Seite `lifelist-demo.html` baut der Workflow aus erfundenen Daten und hängt sie ans Release; die README verlinkt immer auf die des neuesten Releases.

Den Rest erledigt GitHub Actions (`.github/workflows/release.yml`) auf einem Windows-Rechner: Es legt beim Start von Hand das Tag aus der Versionsnummer an (ein gepushtes Tag prüft es gegen die Versionsnummer), lässt die Tests laufen, baut die `lifelist.exe` und legt das Release an, mit `lifelist.exe`, `lifelist.exe.sha256`, `verify.bat`, `verify.ps1`, `verify.sh` und `lifelist-demo.html` und der Prüfsumme in den Notizen. Das Tag muss zur Versionsnummer passen, sonst meldet `--check-update` keine neue Version.

Zum Ausprobieren lässt sich die exe auch selbst bauen: unter Windows `python build.py` (oder `build.bat` doppelklicken), nach `pip install pyinstaller`. Das Skript lässt zuerst die Tests laufen und schreibt dann `dist\lifelist.exe` samt `dist\lifelist.exe.sha256`. PyInstaller baut immer für das System, auf dem es läuft.

## Screenshots der README

`tools/make_screenshots.py` erstellt daraus die Bilder in `docs/screenshots/` (braucht Playwright, siehe [Tests](../CONTRIBUTING.md#tests)). Mit `--map` kommt ein Bild der Karte dazu, dafür braucht es Internet für die Kartenkacheln.

## Welche Felder hat ein Export?

`python tools/export_fields.py` listet auf, welche Felder im neuesten `export_*.json` vorkommen, wie oft und mit welcher Art von Wert, und ob Meldungen eigene Koordinaten haben. Es gibt dabei keine Werte aus (keine Namen, Orte, Daten oder Koordinaten), die Ausgabe lässt sich also gefahrlos weitergeben, etwa um neue Funktionen zu planen.

## Referenzdaten und Bibliotheken pflegen

- `tools/extract_species_reference.py` aktualisiert `species_reference.json` aus der ornitho-Referenzliste (`reference/ornitho-Referenzliste-Arten-*.xlsx`, braucht `pip install openpyxl`). Der Ordner `reference/` ist wegen unklarer Weitergaberechte nicht im Repository.
- `tools/fetch_occurrence_windows.py` ermittelt die Beobachtungszeiträume der Zug- und Gastvögel über die öffentliche GBIF-API.
- `tools/fetch_gbif_planner.py` erzeugt die Daten der Reiseziele (`data/gbif_planner_de.json`, `_eu.json`) über die GBIF-API. Zuerst `--check`, dann `--scope de` oder `--scope eu`. Die Antworten werden in `tools/.gbif_cache/` zwischengespeichert: Ein abgebrochener Lauf setzt dort wieder an, und mit `--offline` lassen sich die Dateien aus dem Zwischenspeicher neu berechnen, ohne GBIF erneut zu fragen.
- `tools/make_tour_diagram.py` zeichnet das Schaubild der Touren-Einstellungen (Deutsch und Englisch, für die Seite und die README) neu, etwa nach einer Änderung der Standardwerte oder der Namen.
- `tools/update_vendor.py` lädt die Bibliotheken in `vendor/` neu, zum Beispiel für ein Versions-Update.

Für das normale Erstellen der Lebensliste werden diese Werkzeuge nicht gebraucht.
