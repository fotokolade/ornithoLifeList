# Änderungen

Die neueste Version steht oben. Die Downloads (`lifelist.exe`) gibt es auf der [Releases-Seite](../../releases).

## Noch nicht veröffentlicht

### Programm
- **Klare Meldungen statt Absturz:** Ist eine Datei kein ornitho-Export (kein JSON, falsche Form, nicht lesbar) oder fehlt sie, nennt `lifelist.py` die Datei und verweist auf die Anleitung, statt mit einer Python-Fehlermeldung abzubrechen. Die `lifelist.exe` zeigt jetzt jedes Ende an, auch einen unerwarteten Fehler (mit dem Hinweis, wo er gemeldet werden kann), und wartet auf Enter; vorher schloss sich ihr Fenster dabei sofort. „Done“ erscheint nur noch bei Erfolg, und der Rückgabewert zeigt einem aufrufenden Skript, ob es geklappt hat.
- **Fehlerhafte Einträge werden übersprungen:** Ein Eintrag ohne Art, Ort oder gültiges Datum bricht nicht mehr den ganzen Lauf ab, sondern wird übersprungen und am Ende gezählt. Kleinere Mängel werden geheilt: Eine Anzahl, die keine Zahl ist, zählt als 0, ein Ort ohne brauchbare Koordinaten bleibt ohne sie erhalten. Bleibt keine Beobachtung übrig, wird nichts geschrieben.
- **Ortsnamen mit Sonderzeichen:** Ein Beobachtungsort, dessen Name wie HTML aussieht (etwa `<!--<script>`), legte die ganze Seite still lahm; er wird jetzt sicher eingebettet und als Text angezeigt.
- **Beispieldaten:** `tools/make_demo_export.py` schreibt jetzt `demo_export.json` statt `export_demo.json`. Der alte Name passte auf `export_*.json`, sodass ein späteres `python lifelist.py` im selben Ordner die erfundenen Daten unter die eigenen mischte. Wer noch eine `export_demo.json` neben seinen Exporten liegen hat, sollte sie löschen.
- Exporte mit Byte-Order-Mark (etwa nach dem Speichern in einem Windows-Editor) werden gelesen, und Exporte in einem Ordner mit eckigen Klammern im Namen (`Vögel [2024]`) werden gefunden.

### Seite
- **Bedienung mit der Tastatur:** Die Zeilen der Lebensliste, der neuesten Lifer und der Touren sowie alle sortierbaren Spaltenköpfe sind jetzt mit Tab erreichbar; Enter oder Leertaste öffnen, schließen oder sortieren wie ein Klick, und der Fokus bleibt danach auf derselben Zeile oder Spalte. Spaltenköpfe sagen Screenreadern, wonach sortiert ist, Zeilen, ob sie offen sind. Ein Sprung von einer neuen Art zur Lebensliste nimmt den Fokus mit.
- Was den Fokus bekommt oder angesprungen wird, verschwindet nicht mehr unter der festen Kopfzeile.
- **Einzahl und Datum:** „1 Art an 1 Ort“ statt „1 Arten an 1 Orten“ (ebenso Beobachtung, Tag, Ort, auf Englisch place, day, observation, record). Die englische Oberfläche schreibt Daten als „3 Jan 2024“ statt „03.01.2024“. Ein Dateiname mit Zeichen wie `$&` oder `{1}` wird in der Kopfzeile unverändert angezeigt.
- **„Frühe Arten“ und „Späte Arten“** stehen nur noch nebeneinander, wenn beide ganz Platz haben, sonst untereinander; im Druck war bei „Späte Arten“ die Spalte „Beob.“ abgeschnitten. Die Überschriften bleiben im Druck bei ihren Tabellen.
- **Diagramme im Druck:** „Verlauf über den Tag“ und „Wochentage“ waren im Ausdruck und im PDF leere Kästen, weil sie erst nach dem Druckbeginn gezeichnet wurden. Gedruckt werden sie jetzt als Balkendiagramm, das sofort fertig ist; am Bildschirm bleibt die bisherige Darstellung.
- **NEU in den Heatmaps:** Ein Klick auf eine Zelle markiert neue Arten jetzt in der gewählten Region, wie Kalender, Lebensliste und Karte. Vorher zählte dort nur der erste Nachweis überhaupt, sodass etwa „+10 Neu in 2023“ neben „3 neu“ stand.
- **Urlaubsplaner:** Sammeltaxa und Hybriden (etwa „Silber- oder Mittelmeermöwe“) gelten nicht mehr als gesehene Art; vorher fehlte dadurch die Silbermöwe in der Liste der noch nicht gesehenen Arten, wenn Sammeltaxa eingeblendet waren.
- **Karte:** Zoom und Ausschnitt bleiben erhalten, wenn du den Kartenwert oder den Zeitpunkt änderst; neu eingepasst wird nur bei einer anderen Region oder anderen Filtern.
- **Schalter „Ortsangaben schwärzen“:** blendet jetzt auch den Namen der Exportdatei in der Kopfzeile aus (er enthält die ornitho-Benutzernummer) und sagt, dass er nur die Anzeige betrifft; zum Weitergeben bleibt `--redact` nötig.
- **Bessere Kontraste:** Der gesamte Text der Seite erreicht in beiden Farbmodi mindestens 4,5:1 (WCAG AA). Im Dunkelmodus ist die Schrift auf grünen Knöpfen, auf „Gesamt“ und auf dem NEU-Zeichen jetzt dunkel statt weiß (vorher nur 2,3:1); im hellen Modus ist das Grün der Seite einen Ton kräftiger. Die Zahlen in den Heatmap-Tabellen sind je nach Zellfarbe weiß oder schwarz, die Atlas-Codes A und B haben dunklere Farben, graue Schrift ist etwas dunkler, und die Rahmen von Auswahlfeldern und Schaltern heben sich deutlicher ab. Ein Test misst den Kontrast auf allen Tabs, auch den Text in den Diagrammen (Achsen, Tagesabschnitte, Prozentwerte) und in den Hinweisen beim Überfahren (Kalender, Heatmap, Diagramme, Karte und ihr Popup). Im Karten-Popup sind die grauen Beschriftungen und das Schließen-Kreuz dunkler.
- **Kalender im Überblick:** Das Birding-Jahr ist jetzt ein durchgehender Streifen aus Wochen (je eine Spalte, Montag oben) statt zwölf getrennter Monatskästen. Die Monate gehen ineinander über; ihre Grenze zeigt eine feine Stufenlinie, und die leeren Tage jedes zweiten Monats sind einen Ton dunkler. Auf schmalen Bildschirmen lässt sich der Streifen seitlich verschieben. Jeder zweite Monat ist auch bei den farbigen Tagen einen Ton dunkler, und beim Überfahren eines Tages leuchtet sein ganzer Monat auf, während die übrigen zurücktreten.
- **Karte, Zeitraffer:** Ein Jahr Beobachtungen, Tag für Tag abgespielt. Jeder Besuch ist ein weicher Fleck (Gaußsche Unschärfe), der danach langsam abklingt; Flecken von Orten und Besuchen, die nah beieinander liegen, addieren sich, und wo du oft warst, leuchtet es stärker. Die Flecken behalten beim Abklingen ihre Größe, wachsen aber beim Hineinzoomen mit. Das Nachleuchten ist einstellbar (14, 30, 90 oder 365 Tage; Standard 30), ein grüner Ring markiert Erstbeobachtungen. Mit Abspielen/Pause, Schieberegler, Jahr und Tempo (7 bis 60 Tage pro Sekunde). Er startet nie von selbst, folgt der gewählten Region und lässt beim Einpassen der Karte Platz für die Legende. Über das Suchfeld lässt sich eine einzelne Art verfolgen: Dann spielen nur ihre Orte, die Stärke zeigt die Vögel an dem Tag, die Jahreswahl bietet nur ihre Jahre an, und die Leiste zählt Beobachtungen und Orte.
- **Kennzahlen im Überblick:** Die großen Zahlen (Lifer, Beobachtungen, Beobachtungstage, Orte) stehen jetzt in Schriftfarbe; die Farbe dessen, was sie zählen, sitzt nur noch im Punkt am Namen (auf „Aktivität“ und „Touren“ im Rand der Kachel). Unter jeder Zahl steht das gewählte Jahr gegen das Vorjahr, mit Pfeil und Unterschied (▲ +45 ggü. 2024), im letzten Jahr des Exports beide nur bis zum Tag seiner letzten Beobachtung (ein älterer Export zeigt so keinen Rückgang, den es nicht gibt), und kleine Balken zeigen alle Jahre. Darunter: Arten im gewählten Jahr (mit „Rekord“, wenn es so viele wie nie sind), der Fotoanteil als Balken und der beste Tag des Jahres, den ein Klick im Kalender öffnet. „Neu in den letzten 30 Tagen“ erscheint nur, wenn es etwas Neues gibt.
- **Lebenslistenkurve:** wächst jetzt in Stufen und erzählt ihre Geschichte: beschriftet sind die letzten runden Zahlen (etwa die 100. und 150. Art mit Datum), der Tag mit den meisten neuen Arten und der aktuelle Stand mit der zuletzt neuen Art. Darunter stehen auf derselben Zeitachse die neuen Arten je Jahr. Die Beschriftungen weichen einander aus; passt eine nirgends hin (etwa auf dem Handy), entfällt sie.
- **Deine Stufe:** Unter den Kennzahlen steht jetzt, wie weit du als Beobachter bist, nach der Zahl deiner Lifer. Es gibt acht Stufen in vier Rängen: Anfänger (Nestling, ab 25 Arten Ästling), Fortgeschritten (ab 50 Futterhaus-Profi, ab 100 Spektiv-Schlepper), Experte (ab 150 Möwen-Bestimmer, ab 200 Laubsänger-Flüsterer, ab 250 Twitcher) und ab 300 Arten Vogelgott als „Orakel von Helgoland“. Jede Stufe hat einen eigenen Spruch und fünf Zwischenstufen (Bronze, Silber, Gold, Platin, Diamant); eine Leiste zeigt den Weg durch alle Stufen und wie viele Arten bis zur nächsten Zwischenstufe und Stufe fehlen. Wie die höheren Stufen heißen, bleibt geheim, bis du sie erreichst.
- Im Kalender bleibt der Monat auch dann hell, wenn die Maus genau die Ecke zwischen vier Tagen trifft.

## 0.6.0 (2026-09-29)

### Programm
- **Mehrere Exporte:** `lifelist.py` wertet alle `export_*.json` im Ordner zusammen aus, statt nur die neueste. So lässt sich die Historie auf mehrere Exporte verteilen (etwa einen pro Jahr), und nur der Export des laufenden Jahres muss neu von ornitho.de geholt werden. Beobachtungen, die in mehreren Dateien stehen, zählen einmal; es gilt der Stand aus dem neuesten Export. `--source` nimmt auch mehrere Dateien und `*`-Platzhalter.

### Seite
- Aus mehreren Exporten erstellt, nennt die Kopfzeile die Zahl der Exportdateien; ihre Namen erscheinen beim Überfahren mit der Maus.

## 0.5.7 (2026-09-26)

### Seite
- **PDF:** Das Datum „Stand: …“ steht mit der Version rechtsbündig in der Titelzeile; die Fußzeile fällt weg, sie landete manchmal allein auf einer sonst leeren letzten Seite.
- **Weitergeben (`--redact`):** Die Seite nennt den Namen der Exportdatei nicht mehr, denn er enthält die ornitho-Benutzernummer.

## 0.5.6 (2026-09-26)

### Seite
- **Chrome-Konsole sauber:** Eine lokal geöffnete Seite merkt sich den Reiter beim Neuladen, ohne ihre Adresse umzuschreiben (Chrome meldete „Unsafe attempt to load URL“), und alle Formularfelder haben einen Namen.

### Programm
- Das Projekt heißt auf GitHub jetzt `fotokolade/ornithoLifeList`; die Update-Prüfung nutzt den neuen Namen (der alte leitet weiter).

## 0.5.5 (2026-09-26)

### Seite
- **PDF-Auswahl:** „PDF erstellen“ fragt, welche Reiter ins PDF kommen; vorgewählt sind Übersicht und Lebensliste, der Browser merkt sich die Auswahl. Auch Strg+P druckt die gewählten Reiter.
- **Reiseziele:** Die Tauben, die GBIF als Felsentaube führt, heißen jetzt wie bei ornitho.de „Straßentaube (Haustaube)“: Wilde Felsentauben kommen in Deutschland nicht vor.
- **Reiseziele:** Alle Arten haben einen deutschen Namen (etwa Taigazilpzalp), Namen folgen ornitho.de, und Dubletten unter veralteten wissenschaftlichen Namen (Schwarzkehlchen, Weidenmeise) sind weg.
- **Reiseziele:** Arten, die in allen Bundesländern mindestens möglich sind (Amsel, Kranich, Straßentaube …), gelten als weit verbreitet: Sie zählen bei den Zielen nicht mit und stehen bei „Nach Art“ am Ende, nur mit ihren Monaten.

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
