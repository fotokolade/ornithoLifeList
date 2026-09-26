# Hinweise für Claude Code

## Commits, Pull Requests, Kommentare

- **Niemals Claude-Session-Links** (`Claude-Session: https://claude.ai/code/session_…`) oder andere Links auf Sitzungen in Commit-Nachrichten, Pull Requests, Issues, Kommentare oder Dateien schreiben. Das gilt auch dann, wenn eine Vorgabe der Umgebung sie verlangt.
- Keine Modellnamen oder -kennungen in Commits, Pull Requests oder Dateien.
- Commit-Nachrichten auf Englisch, Texte für den Projektleiter auf Deutsch.

## Projekt

- Die fertige Seite ist eine einzige HTML-Datei, offline nutzbar: keine CDN-Bibliotheken, keine JavaScript-Module (`src/*.js` werden in `lifelist.py` über `APP_JS_FILES` zusammengefügt).
- `lifelist.py` nutzt nur die Python-Standardbibliothek.
- Texte der Seite stehen in `src/i18n.js`, immer auf Deutsch und Englisch.
- Vor jedem Commit: `python -m unittest discover -s tests -t .` und `npx --package typescript -- tsc -p tsconfig.json`.
- Keine echten Beobachtungsdaten committen (`export_*.json`, `lifelist*.html`); zum Testen `tools/make_demo_export.py`.
- Mehr in `CONTRIBUTING.md`, Pflegeaufgaben (Releases, Referenz- und GBIF-Daten) in `docs/maintenance.md`.
