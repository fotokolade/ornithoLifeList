# OrnithoLifeList

Baut aus einem [ornitho.de](https://www.ornitho.de/)-Export eine einzelne interaktive HTML-Seite mit der eigenen Vogel-Lebensliste – Übersicht, sortierbare Artenliste, Auswertung nach Regionen, eine Wunschliste "nie gesehener Arten" (offizielle ornitho-Artenliste plus eigene, frei pflegbare Liste, inkl. grobem Saison-Badge auf Basis des Brutzeitfensters bzw., für Zug- und Gastvögel, eines aus GBIF-Fundmeldungen abgeleiteten Beobachtungszeitraums) und eine Leaflet-Karte der Beobachtungsorte. Die Seite bietet Deutsch und Englisch als Sprache umschaltbar an, inklusive englischer Artnamen (Quelle: die offizielle ornitho-Artenliste, siehe `reference/`). Kein Server nötig: `lifelist.html` läuft direkt aus der Datei im Browser. Für die Karte und die schöneren Diagramme in der Tagesaktivität werden Leaflet bzw. Chart.js optional von einem CDN nachgeladen – ohne Internetverbindung fallen diese beiden Ansichten automatisch auf eine einfachere, aber voll funktionsfähige Darstellung zurück.

## Verwendung

1. Auf ornitho.de einen JSON-Export der eigenen Beobachtungen herunterladen und als `export_*.json` neben `lifelist.py` legen.
2. Seite bauen:

   ```bash
   python lifelist.py
   ```

   Ohne `--source` wird automatisch der neueste `export_*.json` im Ordner verwendet. Ergebnis: `lifelist.html`.

3. Optional eine bestimmte Exportdatei angeben:

   ```bash
   python lifelist.py --source export_12345_67890_20260919_002546.json
   ```

4. Optional eine Version ohne Ortsangaben (Beobachtungsorte, Gemeinden, Koordinaten) erzeugen, z. B. zum Teilen:

   ```bash
   python lifelist.py --redact
   ```

   Ergebnis: `lifelist_redacted.html`.

## Dateien

- `lifelist.py` – wandelt den ornitho.de-Export in ein kompaktes JSON um und rendert es in `template.html`.
- `template.html` – die Seiten-Vorlage (HTML/CSS) mit den Platzhaltern `__DATA_JSON__` und `__APP_JS__`.
- `src/*.js` – die App-Logik, aufgeteilt nach Tab/Thema (`i18n.js`, `data.js`, `charts.js`, `overview.js`, `list.js`, `regions.js`, `targets.js`, `activity.js`, `map.js`, `app.js`). `lifelist.py` fügt sie in dieser festen Reihenfolge zu einem einzigen `<script>` zusammen – es gibt keine `import`/`export`-Module, weil `<script type="module">` unter `file://` an Chromes CORS-Sperre scheitern würde. Die Reihenfolge steht als `APP_JS_FILES`-Liste in `lifelist.py`.
- `export_*.json`, `lifelist.html`, `lifelist_redacted.html` – generiert bzw. heruntergeladen, enthalten persönliche Beobachtungsdaten und sind daher nicht Teil des Repos (siehe `.gitignore`).
- `species_reference.json` – Latein/Deutsch/Englisch-Namen und Saisonfenster pro Art, wird von `lifelist.py` beim Bauen eingebettet (englische Artnamen, Wunschlisten-Daten). Zwei Quellen fließen ein: `bzcStart`/`bzcEnd` ist das offizielle Brutzeitfenster aus der ornitho-Artenliste (nur für in Deutschland/Luxemburg brütende Arten); `occStart`/`occEnd` ist ein aus öffentlichen GBIF-Fundmeldungen abgeleiteter typischer Beobachtungszeitraum für Zug- und Gastvögel, die hier nicht brüten.
- `reference/` – die Original-Referenztabellen von ornitho.de (Artenliste, Brutzeitcodes, optionale Meldungsfelder), Quelle für die Brutzeitfenster in `species_reference.json`.
- `tools/extract_species_reference.py` – erzeugt `species_reference.json` neu aus `reference/ornitho-Referenzliste-Arten-*.xlsx`; nur für die Datenpflege, benötigt `pip install openpyxl` (nicht für den normalen Build nötig).
- `tools/fetch_occurrence_windows.py` – ergänzt `species_reference.json` um `occStart`/`occEnd` für Arten ohne Brutzeitfenster, per Abfrage der öffentlichen GBIF-Occurrence-API (Monatsverteilung der Fundmeldungen in Deutschland/Luxemburg). Läuft nach `extract_species_reference.py`, braucht Internetzugang, nur für die Datenpflege.

## Entwicklung

Die Aufteilung in `src/*.js` ist nur für die Bearbeitung gedacht – ausgeliefert wird weiterhin ausschließlich die eine generierte HTML-Datei, kein Build-Schritt, keine Laufzeit-Abhängigkeit für Nutzer:innen.

Optional lässt sich `src/*.js` per JSDoc-Kommentaren mit dem TypeScript-Compiler typprüfen (ohne dass daraus TypeScript-Syntax im ausgelieferten Code entsteht):

```bash
npx --package typescript -- tsc -p tsconfig.json
```

(Einfaches `npx tsc` funktioniert nicht – auf npm existiert ein gleichnamiges, unrelated Paket `tsc`, das den echten TypeScript-Compiler überschattet.)

## Lizenz

MIT, siehe [LICENSE](LICENSE).
