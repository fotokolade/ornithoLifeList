# Mitmachen

Beiträge sind willkommen: Fehlerkorrekturen, neue Auswertungen, Übersetzungen, bessere Texte. Für Fehlerberichte und Ideen reicht ein Issue auf GitHub. Wer selbst am Code mitarbeiten möchte, findet hier alles Nötige.

## So läuft ein Beitrag ab

1. Das Repository forken und für die Änderung einen eigenen Branch anlegen.
2. Die Änderung machen. Texte der Seite stehen in `src/i18n.js` und brauchen immer beide Sprachen, Deutsch und Englisch.
3. Tests und Typprüfung laufen lassen (siehe unten). Für neue Funktionen gern einen Test in `tests/` ergänzen.
4. Einen Pull Request öffnen und kurz beschreiben, was sich ändert und warum. Bei sichtbaren Änderungen hilft ein Screenshot.

Bitte beachten:

- **Keine echten Beobachtungsdaten committen.** Exporte und erzeugte HTML-Dateien enthalten Orte und Koordinaten; `.gitignore` hält sie heraus, `git add -f` würde das umgehen. Zum Ausprobieren gibt es erfundene Beispieldaten (siehe unten).
- **Eine Datei, offline.** Die fertige Seite ist eine einzige HTML-Datei, die ohne Server und ohne Internet funktioniert. Deshalb keine Bibliotheken aus einem CDN und keine JavaScript-Module (siehe „Aufbau des JavaScript“). Neue Bibliotheken bitte vorher in einem Issue absprechen.
- **Nur Python-Standardbibliothek** für `lifelist.py`, damit Anwender nichts installieren müssen.

## Projektaufbau

| Datei / Ordner | Inhalt |
| --- | --- |
| `lifelist.py` | liest den Export und erstellt die HTML-Seite |
| `template.html` | Vorlage der Seite (HTML und CSS) mit den Platzhaltern `__DATA_JSON__`, `__APP_JS__`, `__VENDOR_JS__`, `__VENDOR_CSS__` |
| `src/*.js` | JavaScript der Seite, aufgeteilt nach Tab und Thema (`counties.js`: Namen der Landkreise zu ornithos Kreiskürzeln) |
| `vendor/` | mitgelieferte Bibliotheken Leaflet, Leaflet.markercluster und Chart.js |
| `species_reference.json` | Artnamen und Saisonzeiträume |
| `data/` | Daten der Reiseziele aus GBIF (`tools/fetch_gbif_planner.py`) und das Schaubild der Touren-Einstellungen (`tools/make_tour_diagram.py`) |
| `tests/` | automatische Tests mit erfundenen Beispieldaten |
| `update.py`, `update.bat` | aktualisieren eine git-Kopie |
| `build.py`, `build.bat`, `lifelist.spec` | bauen die `lifelist.exe` |
| `.gitignore` | hält persönliche Daten aus dem Repository heraus: `export_*.json`, `lifelist*.html`, `reference/` und den GBIF-Zwischenspeicher |
| `.github/workflows/release.yml` | baut die exe für ein Release |
| `verify.ps1`, `verify.bat` | prüfen die Prüfsumme der `lifelist.exe` |
| `tools/` | Werkzeuge zur Pflege der Referenzdaten und Bibliotheken, für Beispieldaten und Screenshots |
| `docs/screenshots/` | Bilder für die README |
| `HOWTO.md`, `howto/` | Anleitung zum Export mit Screenshots |

## Aufbau des JavaScript

Die Aufteilung in `src/*.js` dient nur der Bearbeitung. `lifelist.py` fügt die Dateien in fester Reihenfolge (`APP_JS_FILES`) zu einem einzigen `<script>` zusammen, ausgeliefert wird immer nur die eine HTML-Datei. Echte Module mit `import`/`export` gibt es bewusst nicht: `<script type="module">` scheitert unter `file://` an der CORS-Sperre von Chrome.

Optional lässt sich der Code anhand seiner JSDoc-Kommentare mit dem TypeScript-Compiler prüfen, ohne dass TypeScript im ausgelieferten Code landet:

```bash
npx --package typescript -- tsc -p tsconfig.json
```

Einfaches `npx tsc` funktioniert nicht, weil ein fremdes npm-Paket namens `tsc` den echten Compiler verdeckt.

## Tests

```bash
python -m unittest discover -s tests -t .
```

Die Tests nutzen erfundene Beispieldaten aus `tests/fixtures.py` und überschreiben keine eigene `lifelist.html`.

- `tests/test_build.py` prüft die Datenaufbereitung und braucht nur Python.
- `tests/test_update.py` prüft `update.py` an Test-Repositories und braucht git.
- `tests/test_page.py` öffnet die Seite in einem unsichtbaren Chromium, klickt sich durch alle Tabs und Funktionen und meldet JavaScript-Fehler. Dafür wird Playwright gebraucht, sonst werden diese Tests übersprungen:

  ```bash
  pip install playwright
  playwright install chromium
  ```

## Beispieldaten zum Ausprobieren

`python tools/make_demo_page.py` erzeugt daraus direkt `lifelist-demo.html`, die Demo, die auch jedem Release beiliegt und auf GitHub Pages steht.

`tools/make_demo_export.py` erzeugt einen erfundenen, aber realistisch wirkenden Export (`export_demo.json`): ein fiktiver Beobachter aus der Nähe von Dresden, über mehrere Jahre an echten Beobachtungsorten, mit Reisen quer durch Deutschland. Gut zum Ausprobieren ohne eigene Daten: `python tools/make_demo_export.py`, dann `python lifelist.py --source export_demo.json`.
