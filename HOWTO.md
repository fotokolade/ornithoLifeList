# Datenexport von ornitho.de

Kurzanleitung, wie du deinen Beobachtungsexport für [`lifelist.py`](lifelist.py) von [ornitho.de](https://www.ornitho.de/) herunterlädst. Rot umrahmt ist in jedem Bild, worauf du im jeweiligen Schritt klickst.

1. Im Menü unter **Aktuelles** auf **Aktuelle Beobachtungen** klicken.

   ![Schritt 1](howto/01.png)

2. Unten auf **Abfrage ändern** klicken.

   ![Schritt 2](howto/02.png)

3. Im Tab **Zeitraum** die Option **Gesamter Zeitraum, für den Daten vorliegen** wählen.

   ![Schritt 3](howto/03.png)

   Alternativ nur einen Teilzeitraum exportieren, zum Beispiel ein einzelnes Jahr vom 01.01. bis 31.12. Das entlastet den ornitho-Server: Abgeschlossene Jahre werden nur einmal exportiert, danach wird nur noch der Export des laufenden Jahres erneuert. Alle Exporte im Ordner werden zusammen ausgewertet (siehe [README](README.md#export-in-mehrere-zeiträume-aufteilen)).

4. Im Tab **Arten** **Alle Taxa** auswählen.

   ![Schritt 4](howto/04.png)

5. Im Tab **Orte** **Alle Orte** auswählen.

   ![Schritt 5](howto/05.png)

6. Im Tab **andere Einschränkungen** den Haken bei **Abfrage auf meine Daten beschränken** setzen (die anderen Felder bleiben leer).

   ![Schritt 6](howto/06.png)

7. Auf **Abfrage starten** klicken.

   ![Schritt 7](howto/07.png)

8. Im Ergebnis unter **Export** das Format **BASIC+** auswählen und auf das orangene **JS**-Symbol klicken.

   ![Schritt 8](howto/08.png)

9. Nach kurzer Zeit erscheint darunter ein grüner Kasten mit der fertigen Exportdatei. Auf ihren Namen (`export_….json`) klicken, um sie herunterzuladen.

   ![Schritt 9](howto/09.png)

Die heruntergeladene Datei (`export_*.json`) neben `lifelist.py` legen (bei aufgeteilten Exporten alle Dateien) und wie in der [README](README.md#schnellstart) beschrieben weiterverwenden.
