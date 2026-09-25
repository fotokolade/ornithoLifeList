# OrnithoLifeList

Aus einem [ornitho.de](https://www.ornitho.de/)-Export wird eine interaktive Vogel-Lebensliste als einzelne HTML-Datei.

Die fertige `lifelist.html` lässt sich direkt im Browser öffnen, ganz ohne Server oder Installation.

## Was bietet die Lebensliste?

- Übersicht über die bisher beobachteten Arten
- Sortierbare Artenliste
- Auswertung nach Regionen
- Wunschliste mit Arten, die bisher noch nicht beobachtet wurden
- Tagesaktivität der eigenen Beobachtungen
- Karte der Beobachtungsorte
- Deutsch und Englisch, einschließlich englischer Artnamen
- Saisonhinweise für Arten, die noch auf der Wunschliste stehen

Internet braucht die Lebensliste nur für die Kartenansicht, alles andere funktioniert offline.

## Schnellstart

### 1. Beobachtungen von ornitho.de exportieren

Auf [ornitho.de](https://www.ornitho.de/) einen JSON-Export der eigenen Beobachtungen herunterladen (Schritt-für-Schritt-Anleitung mit Screenshots: [HOWTO.md](HOWTO.md)).

Die heruntergeladene Datei, zum Beispiel

```text
export_12345_67890_20260919_002546.json
```

in den Ordner von `lifelist.py` legen.

### 2. Lebensliste erstellen

Im selben Ordner ausführen:

```bash
python lifelist.py
```

Danach liegt dort die fertige Datei:

```text
lifelist.html
```

Diese Datei einfach im Browser öffnen.

Wenn mehrere `export_*.json`-Dateien vorhanden sind, wird automatisch die neueste verwendet.

### Ohne Python: fertige exe verwenden

Wer kein Python installieren möchte, findet auf der [Releases-Seite](../../releases) eine fertige `lifelist.exe` für Windows. Sie tut dasselbe wie `python lifelist.py`, versteht dieselben Optionen und braucht die exportierte `export_*.json` im selben Ordner.

Vor der ersten Ausführung lohnt sich ein Abgleich der SHA256-Prüfsumme mit der auf der Releases-Seite angegebenen, zum Beispiel in PowerShell:

```powershell
Get-FileHash lifelist.exe -Algorithm SHA256
```

Stimmt der Hash nicht mit dem veröffentlichten überein, stammt die Datei nicht von diesem Release und sollte nicht ausgeführt werden.

### Einen bestimmten Export verwenden

Falls eine bestimmte Exportdatei verwendet werden soll:

```bash
python lifelist.py --source export_12345_67890_20260919_002546.json
```

### Eine Version ohne Ortsangaben erstellen

Wenn die Lebensliste weitergegeben oder veröffentlicht werden soll, können persönliche Ortsangaben entfernt werden:

```bash
python lifelist.py --redact
```

Das erzeugt:

```text
lifelist_redacted.html
```

In dieser Version sind Beobachtungsorte, Gemeinden und Koordinaten entfernt. Die eigentlichen Beobachtungsdaten bleiben dabei natürlich erhalten, nur die Ortsinformationen werden ausgeblendet.

### Neue Versionen

Wer das Projekt mit `git clone` heruntergeladen hat, holt sich neue Versionen mit dem Update-Skript (unter Windows reicht ein Doppelklick auf `update.bat`):

```bash
python update.py
```

Es holt die Änderungen von GitHub und zeigt, was neu ist. Eigene `export_*.json`- und HTML-Dateien bleiben unberührt. Wurden Dateien des Programms selbst lokal verändert, bricht das Skript ab und nennt sie, statt etwas zu überschreiben. Dafür muss [git](https://git-scm.com/) installiert sein; ohne git lädt man die neue Version einfach von der Releases-Seite.

Ob es eine neuere Version gibt, lässt sich bei Bedarf nachsehen:

```bash
python lifelist.py --check-update   # fragt GitHub nach dem neuesten Release, erstellt nichts
python lifelist.py --version        # installierte Version anzeigen
```

Gibt es eine neuere Version, erscheint ein Hinweis mit Link zur [Releases-Seite](../../releases). Dabei wird nur die Versionsnummer des neuesten Releases abgerufen; es werden keine Beobachtungs- oder sonstigen Daten gesendet. Beim normalen Erstellen der Lebensliste geht das Programm nie ins Internet.

## Voraussetzungen

- Python 3 (oder, unter Windows, die fertige `lifelist.exe` von der [Releases-Seite](../../releases) statt Python)
- ein JSON-Export von ornitho.de

Mehr wird nicht gebraucht, auch keine Internetverbindung (sie wird nur für die Kartenansicht und für `--check-update` genutzt).

## Welche Daten werden verwendet?

Die Artennamen stammen aus der offiziellen ornitho-Artenliste. Dadurch stehen neben den deutschen auch die lateinischen und englischen Namen zur Verfügung.

Für die Saisonhinweise auf der Wunschliste werden je nach Art unterschiedliche Informationen verwendet:

- Bei in Deutschland bzw. Luxemburg brütenden Arten wird das offizielle Brutzeitfenster von ornitho verwendet.
- Bei Zug- und Gastvögeln, die hier nicht brüten, wird ein typischer Beobachtungszeitraum aus öffentlichen GBIF-Fundmeldungen abgeleitet.

Die entsprechenden Referenzdaten liegen im Verzeichnis `reference/` bzw. in `species_reference.json`.

## Dateien im Projekt

### Für Anwender

- `lifelist.py`: erstellt die fertige Lebensliste
- `export_*.json`: eigener ornitho.de-Export
- `lifelist.html`: fertige Lebensliste
- `lifelist_redacted.html`: fertige Lebensliste ohne Ortsangaben
- `HOWTO.md`: bebilderte Anleitung für den Datenexport von ornitho.de
- `update.py`, `update.bat`: aktualisiert eine mit git geklonte Kopie von GitHub

Die persönlichen Export- und HTML-Dateien gehören nicht ins Git-Repository und sind deshalb über `.gitignore` ausgeschlossen.

### Für die Entwicklung

- `template.html`: HTML-Vorlage der fertigen Seite, mit den Platzhaltern `__DATA_JSON__`, `__APP_JS__`, `__VENDOR_JS__` und `__VENDOR_CSS__`
- `src/*.js`: JavaScript-Code der Anwendung, aufgeteilt nach Tab/Thema (`i18n.js`, `data.js`, `charts.js`, `overview.js`, `list.js`, `regions.js`, `targets.js`, `activity.js`, `map.js`, `app.js`)
- `tsconfig.json`, `src/globals.d.ts`: für die optionale JSDoc-Typprüfung (siehe unten)
- `species_reference.json`: Referenzdaten zu Arten, Namen und Saisonzeiträumen
- `reference/`: originale Referenztabellen von ornitho.de, Quelle für `species_reference.json`; wegen unklarer Weitergaberechte nicht Teil des Git-Repositorys
- `tools/extract_species_reference.py`: aktualisiert die Arten-Referenzdaten aus `reference/ornitho-Referenzliste-Arten-*.xlsx`; benötigt `pip install openpyxl`
- `tools/fetch_occurrence_windows.py`: ermittelt Beobachtungszeiträume für Zug- und Gastvögel über die öffentliche GBIF-API
- `vendor/`: Leaflet, das Leaflet.markercluster-Plugin und Chart.js als mitgelieferte Dateien (siehe Lizenzen unten); `tools/update_vendor.py` lädt sie bei Bedarf neu, z. B. für ein Versions-Update
- `howto/`: Screenshots für `HOWTO.md`
- `tests/`: automatische Tests (siehe unten)
- `lifelist.spec`: Bauanleitung für PyInstaller, erzeugt die `lifelist.exe` für die Releases-Seite (siehe unten)

Diese Werkzeuge dienen nur der Datenpflege, für den normalen Build werden sie nicht gebraucht.

## Entwicklung

Die Aufteilung in `src/*.js` ist nur für die Bearbeitung gedacht. Beim Erstellen der Lebensliste fügt `lifelist.py` sie in fester Reihenfolge (`APP_JS_FILES`) zu einem einzigen `<script>` zusammen. Es gibt keine `import`/`export`-Module, weil `<script type="module">` unter `file://` an Chromes CORS-Sperre scheitern würde. Ausgeliefert wird weiterhin nur die eine generierte HTML-Datei.

Optional lässt sich `src/*.js` per JSDoc-Kommentaren mit dem TypeScript-Compiler typprüfen (ohne dass daraus TypeScript-Syntax im ausgelieferten Code entsteht):

```bash
npx --package typescript -- tsc -p tsconfig.json
```

(Einfaches `npx tsc` funktioniert nicht: Auf npm existiert ein gleichnamiges, fremdes Paket `tsc`, das den echten TypeScript-Compiler überschattet.)

### Tests

Die Tests in `tests/` arbeiten mit erfundenen Beispieldaten (`tests/fixtures.py`), nicht mit dem eigenen Export, und überschreiben keine `lifelist.html`.

```bash
python -m unittest discover -s tests -t .
```

`tests/test_build.py` prüft die Datenaufbereitung und braucht nur Python. `tests/test_page.py` öffnet die fertige Seite in einem unsichtbaren Chromium, klickt alle Tabs in beiden Sprachen durch und meldet JavaScript-Fehler. Dafür wird Playwright gebraucht, sonst werden diese Tests übersprungen:

```bash
pip install playwright
playwright install chromium
```

### Lizenzen der mitgelieferten Bibliotheken (`vendor/`)

- [Leaflet](https://leafletjs.com/): BSD-2-Clause, © Vladimir Agafonkin, © 2010–2023 CloudMade
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster): MIT, © Dave Leaver
- [Chart.js](https://www.chartjs.org/): MIT, © Chart.js Contributors

Alle drei erlauben Einbettung/Weitergabe; der jeweilige Copyright-Hinweis bleibt in den Dateien in `vendor/` erhalten.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
