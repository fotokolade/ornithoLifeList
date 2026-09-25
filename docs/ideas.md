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
