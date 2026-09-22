# OrnithoLifeList

Baut aus einem [ornitho.de](https://www.ornitho.de/)-Export eine einzelne interaktive HTML-Seite mit der eigenen Vogel-Lebensliste – Übersicht, sortierbare Artenliste, Auswertung nach Regionen, Zielarten, Tagesaktivität und eine Leaflet-Karte der Beobachtungsorte. Keine Server, keine Abhängigkeiten zur Laufzeit: `lifelist.html` läuft offline im Browser.

## Verwendung

1. Auf ornitho.de einen JSON-Export der eigenen Beobachtungen herunterladen und als `export_*.json` neben `build.py` legen.
2. Seite bauen:

   ```bash
   python build.py
   ```

   Ohne Argument wird automatisch der neueste `export_*.json` im Ordner verwendet. Ergebnis: `lifelist.html`.

3. Optional eine Version ohne Ortsangaben (Beobachtungsorte, Gemeinden, Koordinaten) erzeugen, z. B. zum Teilen:

   ```bash
   python build.py --schwaerzen
   ```

   Ergebnis: `lifelist_geschwaerzt.html`.

## Dateien

- `build.py` – wandelt den ornitho.de-Export in ein kompaktes JSON um und rendert es in `template.html`.
- `template.html` – die Seiten-Vorlage (HTML/CSS/JS) mit dem Platzhalter `__DATA_JSON__`.
- `export_*.json`, `lifelist.html`, `lifelist_geschwaerzt.html` – generiert bzw. heruntergeladen, enthalten persönliche Beobachtungsdaten und sind daher nicht Teil des Repos (siehe `.gitignore`).

## Lizenz

MIT, siehe [LICENSE](LICENSE).
