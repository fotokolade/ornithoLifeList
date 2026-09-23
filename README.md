# OrnithoLifeList

Baut aus einem [ornitho.de](https://www.ornitho.de/)-Export eine einzelne interaktive HTML-Seite mit der eigenen Vogel-Lebensliste – Übersicht, sortierbare Artenliste, Auswertung nach Regionen, eine Wunschliste "nie gesehener Arten" (europäische Artenliste plus eigene, frei pflegbare Liste), Tagesaktivität und eine Leaflet-Karte der Beobachtungsorte. Die Seite bietet Deutsch und Englisch als Sprache umschaltbar an (Artnamen bleiben aktuell deutsch, wie im Export). Kein Server nötig: `lifelist.html` läuft direkt aus der Datei im Browser. Für die Karte und die schöneren Diagramme in der Tagesaktivität werden Leaflet bzw. Chart.js optional von einem CDN nachgeladen – ohne Internetverbindung fallen diese beiden Ansichten automatisch auf eine einfachere, aber voll funktionsfähige Darstellung zurück.

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
- `template.html` – die Seiten-Vorlage (HTML/CSS/JS) mit dem Platzhalter `__DATA_JSON__`.
- `export_*.json`, `lifelist.html`, `lifelist_redacted.html` – generiert bzw. heruntergeladen, enthalten persönliche Beobachtungsdaten und sind daher nicht Teil des Repos (siehe `.gitignore`).

## Lizenz

MIT, siehe [LICENSE](LICENSE).
