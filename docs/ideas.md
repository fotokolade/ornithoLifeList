# Ideen

Gesammelte Ideen für später, noch nicht umgesetzt.

## Easter Egg: Der Logo-Vogel fliegt los

Ein Klick auf den Vogel im Logo lässt ihn losfliegen, der nächste Klick holt ihn zurück.

- **Abflug:** Eine Kopie des Logo-Vogels (fest positioniertes SVG über der Seite) fliegt mit
  flatternden Flügeln los; das Original im Kopf bleibt so lange leer.
- **Flug:** in Bögen quer über den Bildschirm; verlässt er ihn links oder rechts, taucht er am
  anderen Rand wieder auf (Position pro Frame mit `requestAnimationFrame`).
- **Landen:** sucht sich einen gerade sichtbaren Diagrammrahmen (`.card`, per
  `getBoundingClientRect`), bremst ab, legt die Flügel an und setzt sich auf dessen Oberkante.
  Dort sitzt er eine Weile und pickt ab und zu (wie das Logo jetzt schon), fliegt dann evtl. zum
  nächsten Rahmen.
- **Scrollen / neu zeichnen:** Er bleibt am Rahmen sitzen. Scrollt der Rahmen aus dem Bild,
  wechselt der Tab oder wird die Ansicht neu gezeichnet, zieht er zu einem anderen sichtbaren
  Rahmen um oder fliegt zurück.
- **Rückflug:** nächster Klick auf das Logo oder den Vogel selbst: zurück an seinen Platz im Kopf.
- **Rücksicht:** keine Animation bei `prefers-reduced-motion`; im Druck ausgeblendet; fängt keine
  Klicks auf Diagramme ab (`pointer-events` nur auf dem Vogel selbst).

Aufwand: überschaubar, ein paar Stunden; das meiste Feintuning steckt in einer natürlich
wirkenden Landung.

## Die `lifelist.exe` signieren

Windows warnt beim ersten Start einer unsignierten exe (SmartScreen). Die README erklärt die Umgehung;
dauerhaft hilft nur eine digitale Signatur.

- **Weg:** [SignPath Foundation](https://signpath.org) signiert Open-Source-Projekte kostenlos. Das
  Projekt müsste sich dort bewerben (Lizenz, öffentliches Repository und Release über GitHub Actions
  sind vorhanden); die genauen Bedingungen vorher auf deren Seite lesen. Ein bezahltes Zertifikat oder
  Microsofts eigener Signaturdienst sind die Alternativen, mit eigenen Voraussetzungen und Kosten.
- **Im Workflow:** `dist/lifelist.exe` nach dem Bauen als Artefakt hochladen, von SignPath signieren
  lassen und die signierte Datei zurückholen. Skizze für `.github/workflows/release.yml`, die Namen der
  Eingaben vor dem Einbau mit der SignPath-Anleitung abgleichen:

  ```yaml
  - uses: actions/upload-artifact@v4
    id: unsigned
    with: { name: lifelist-unsigned, path: dist/lifelist.exe }
  - uses: signpath/github-action-submit-signing-request@v1
    with:
      api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
      organization-id: "<aus dem SignPath-Konto>"
      project-slug: "ornithoLifeList"
      signing-policy-slug: "release-signing"
      github-artifact-id: ${{ steps.unsigned.outputs.artifact-id }}
      wait-for-completion: true
      output-artifact-directory: dist/signed
  ```
- **Danach:** Die Prüfsumme (`lifelist.exe.sha256`, Release-Notizen) muss von der **signierten** Datei
  stammen, also erst nach der Signatur berechnet werden.
- **Ruf:** Auch signierte Dateien warnen anfangs noch, bis genug Downloads zusammenkommen. Ein
  Fehlalarm von Defender lässt sich bei Microsoft zur Prüfung einreichen.
