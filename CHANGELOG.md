# Änderungen

Die neueste Version steht oben. Die Downloads (`lifelist.exe`) gibt es auf der [Releases-Seite](../../releases).

## 0.5.4 (2026-09-26)

### Seite
- **PDF:** Jeder Reiter beginnt auf einer neuen Seite unter seinem Namen; Überschriften bleiben mit ihrem Infotext und dem folgenden Inhalt zusammen, statt allein am Seitenende zu stehen; die Lebenslistenkurve steht nur noch einmal drin.
- **Gültiges HTML5:** Die Seite besteht jetzt die Prüfung mit dem offiziellen Nu HTML Checker (u. a. Heatmaps nach dem ARIA-Muster „grid“).

## 0.5.3 (2026-09-26)

### Seite
- **Lizenzhinweise:** Die Copyright- und Lizenztexte von Leaflet und Leaflet.markercluster stehen jetzt in jeder erzeugten Lebensliste und in der `lifelist.exe`, wie es ihre Lizenzen verlangen.

### Demo
- Jedem Release liegt `lifelist-demo.html` bei, eine fertige Lebensliste aus erfundenen Beispieldaten zum Ansehen ohne eigenen Export. Die README verlinkt sie direkt.

### Programm
- Das Beispiel in der README und das Bild in der Export-Anleitung zeigen einen neutralen Dateinamen.

## 0.5.2 (2026-09-26)

### Seite
- **Karte:** Orte, an denen du eine Art zum ersten Mal gesehen hast, tragen einen grünen Ring, ebenso zusammengefasste Gruppen, die einen solchen Ort enthalten. Der Ring folgt der Zeitleiste; die Legende erklärt ihn, der Tooltip nennt die Zahl der Lifer.

## 0.5.1 (2026-09-26)

### Seite
- **Reiseziele:** Ein aufgeklapptes Bundesland ist jetzt klar als Kopf seiner Gruppe erkennbar. Seine Landkreise stehen eingerückt hinter einer farbigen Leiste, und zwischen „Landkreise in Bayern“ und „Arten in Bayern“ schalten zwei deutliche Knöpfe um.

## 0.5.0 (2026-09-26)

### Seite
- **Reiseziele für fehlende Arten (Reiter „Ziele“):** Wo und in welchem Monat du Arten, die dir noch fehlen, am ehesten siehst, aus öffentlichen Beobachtungen bei GBIF. Die Landkreise stehen unter ihrem Bundesland: Ein Bundesland zählt jede fehlende Art einmal, aufgeklappt zeigt es seine besten Kreise oder alle diese Arten mit ihrem besten Kreis und den besten Monaten. Dazu die Ansicht „Nach Art“, ein Monatsfilter und eine Sortierung nach Artenzahl oder Name. Die Daten sind eingebettet, die Seite bleibt offline.
- **Ausnahmegäste:** Die übrigen rund 280 Arten der ornitho-Artenliste (Blauschwanz, Nonnensteinschmätzer, Zitronenstelze …) als eigene Quelle der Wunschliste, mit den Monaten, in denen sie in Deutschland gemeldet wurden. Sie zählen nicht zum Fortschritt.
- **Wunschliste ergänzt:** Regelmäßige und eingebürgerte Arten, die bisher fehlten, stehen jetzt auf der Liste (etwa Bartmeise, Karmingimpel, Zwergscharbe, Nilgans).
- **Heatmaps:** Fadenkreuz und Tooltip beim Überfahren, Summen für jede Zeile und Spalte, Auswahl, ob Beobachtungen, Arten oder Tage gezählt werden, höchstens fünf klar unterscheidbare Farbstufen mit Legende (auch im Kalender) und ein Klick auf eine Summe oder ein Ziehen über mehrere Zellen, um deren Arten zu sehen. Beim Überfahren einer Zelle zeigen alle anderen den Unterschied zu ihr: grün mehr, grau gleich, rot weniger.
- **Touren:** Die Spalte heißt „Pausen“. Die Einstellungen heißen klarer: Meldelücken, Anhalten, Pausen-Umkreis, und „zu Fuß“ statt „ohne (zu Fuß)“. Ein aufklappbares Schaubild erklärt jede Einstellung.
- **Kennzahlen** sind farbig nach dem, was sie zählen (Arten, Aktivität, Orte, Fotos).
- **Meeresgebiete:** Die ornitho-Kürzel ASH, AMV und AWN heißen AWZ Ostsee (SH-Teil), AWZ Ostsee (MV-Teil) und AWZ Nordsee.
- **Korrektur:** „Gesamt“ in der Zeitleiste setzt Übersicht und Lebensliste wieder auf das aktuelle Jahr zurück.
- Der Vogel im Logo pickt ab und zu.

### Programm
- `tools/fetch_gbif_planner.py` holt die Daten der Reiseziele von GBIF (mit Zwischenspeicher, `--check` und `--offline`), `tools/make_tour_diagram.py` zeichnet das Schaubild der Touren.
- Die README richtet sich an Anwender; wer mitarbeiten möchte, findet in `CONTRIBUTING.md` Projektaufbau, Tests und den Ablauf eines Pull Requests.
- Die Prüfsummendatei `lifelist.exe.sha256` hat Unix-Zeilenenden, damit `sha256sum -c` unter Linux sie liest; die README erklärt die Prüfung unter Linux und macOS.
- Neu: `CHANGELOG.md` mit allen Versionen.

## 0.4.0 (2026-09-25)

### Seite
- **Touren (neuer Reiter):** Spaziergänge und Radtouren werden aus deinen Meldungen rekonstruiert, die zeitlich und räumlich nah beieinanderliegen. Liste mit Dauer, Strecke, Halten und Arten, sortierbar nach jeder Spalte; ein Klick zeigt die Halte und Arten, „Auf der Karte zeigen“ zeichnet die Strecke.
- **Einstellungen für Touren:** Unterwegs (zu Fuß, Fahrrad), Tempo (Schnecke bis Jaguar), kurze oder lange und wenige oder viele Pausen füllen alle Werte aus; jeder Wert lässt sich mit einem Schieberegler feinstellen. Dein Browser merkt sie sich.
- **Genauere Positionen:** Wo der Export den GPS-Standort deines Handys beim Melden oder einen punktgenau gesetzten Ort hat, nutzen die Touren diese statt des ornitho-Orts; der Weg wird aus Zeitfenstern geschätzt, damit Vogel-Punkte rund um dich keinen Zickzack ergeben.
- **Landkreise in ganz Deutschland:** Die Kreise aller Bundesländer erscheinen mit Namen, nach ornithos eigenen Kreiskürzeln (auch die mit „*“ für den Landkreis um eine gleichnamige Stadt). Orte mit solchen Kürzeln verloren vorher ihr Bundesland und ihren Kreis.
- Die Erläuterung zum Klick auf Regionsnamen steht jetzt bei den Tabellen, zu denen sie gehört.

### Programm
- `update.py` / `update.bat` fragt nach, ob lokale Änderungen an Programmdateien verworfen oder eigene Dateien ersetzt werden sollen, die dem Update im Weg liegen, statt nur abzubrechen.
- `tools/export_fields.py` listet die Felder eines Exports auf, ohne Werte preiszugeben.
- Die README zeigt Beispielbilder aus erfundenen Daten; `tools/make_demo_export.py` und `tools/make_screenshots.py` erzeugen sie. Die HOWTO-Bilder haben rote Rahmen.

## 0.3.0 (2026-09-25)

### Seite
- **Überall klickbar:** Ein Tag im Kalender, eine Zelle der Monatstabellen oder ein Punkt der Lebenslistenkurve zeigt die Arten dahinter; jede Art öffnet ihren Eintrag in der Lebensliste.
- **Ziele:** Saisongruppen lassen sich einklappen, die Liste ist durchsuchbar, jede Art hat einen Saisonstreifen. Die eigene Wunschliste lässt sich als Datei sichern und wieder laden.
- **Tagesaktivität:** Tagesverlauf als Kurve über Tageszeiten, Wochentage als Anteil der Tage mit Werktag/Wochenende-Ring, neue Tabelle „Wochentag und Uhrzeit“.
- **Regionen:** neue Tabelle „Wann bist du wo?“ (Region × Monat), eigene Regionsauswahl bei der Abdeckung.
- **Karte:** neue Marker, Cluster, Popups und Legende.
- **Aussehen:** überarbeitete Kopfzeile, Kacheln und Diagrammfarben; die Seite passt jetzt auch aufs Handy; Diagramme folgen dem hellen/dunklen Design und werden hell gedruckt.

### Programm
- `--check-update` sieht auf GitHub nach einer neuen Version, `--version` zeigt die installierte.
- `update.py` / `update.bat` aktualisiert eine git-Kopie.
- `verify.bat` prüft die Prüfsumme der heruntergeladenen `lifelist.exe`.
- Neue bebilderte Anleitung für den Export (HOWTO) und überarbeitete README.

## 0.2.0 (2026-09-25)

### Seite
- **Tagesaktivität** als Kurve über den Tag mit hinterlegten Tageszeiten; die Auswahl der Kennzahl steht direkt beim Diagramm.
- **Farben mit Bedeutung** in den Diagrammen, dazu Saisonstreifen auf der Wunschliste.
- **Lebenslistenkurve** endet bei der letzten Beobachtung des Exports.
- **Karte:** neu gestaltete Marker, Gruppen und Popups mit Legende; kleine Marker bleiben anklickbar.
- Kompakterer Kopf, neu gestaltete Kennzahlen, Karten und Überschriften.
- Diagramme passen sich beim Wechsel zwischen hell und dunkel an und werden hell gedruckt; Infotexte kommen mit in den Druck.

### Programm
- Automatische Tests mit erfundenen Beispieldaten, auch im Browser.

## 0.1.0 (2026-09-23)

Erste veröffentlichte Version.

- Interaktive Lebensliste aus dem ornitho.de-Export als eine einzige, offline nutzbare HTML-Datei: Übersicht mit Kalender und Kurve, Lebensliste, Wunschliste mit Saisonhinweisen, Tagesaktivität, Regionen und Karte.
- Deutsch und Englisch, hell und dunkel, als PDF druckbar.
- `--redact` für eine Version ohne Ortsangaben zum Weitergeben.
- Bebilderte Anleitung zum Export (`HOWTO.md`).
- Fertige `lifelist.exe` für Windows, ohne Python.
