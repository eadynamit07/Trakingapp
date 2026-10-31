# KCal auf Android

1. Die Dateien aus diesem Ordner auf deiner bestehenden HTTPS-Seite veröffentlichen (z. B. GitHub Pages).
2. Die Seite in Chrome auf Android öffnen.
3. Im Profil auf **App installieren** tippen, sobald Chrome die Installation anbietet. Alternativ im Chrome-Menü **Zum Startbildschirm hinzufügen → Installieren** wählen.
4. KCal über das neue App-Symbol öffnen. Die Browserleiste entfällt.

Dies ist eine installierbare Web-App (PWA), keine APK. Für eine Veröffentlichung im Play Store wäre zusätzlich eine Android-Verpackung erforderlich.

Nach dem ersten erfolgreichen Laden sind die Oberfläche und manuelle Einträge offline verfügbar. Die Fotoanalyse, Barcode-Produktsuche und das erstmalige Laden der externen Scanner-Bibliothek benötigen Internet. Updates werden nach dem Schließen aller offenen App-Fenster und erneutem Öffnen aktiv.

Einträge und Einstellungen liegen im lokalen Browser-Speicher. Durch das Löschen der Website-Daten gehen sie verloren. Vorhandene Einträge werden bei diesem Update beibehalten.

Für die Fotoanalyse im Profil einen eigenen Gemini API Key eintragen. Foto und optionale Beschreibung werden erst beim Tippen auf **Foto analysieren** an Google gesendet. Der bisher im Quelltext enthaltene gemeinsame Schlüssel wurde entfernt; falls er öffentlich veröffentlicht war, sollte er in Google AI Studio widerrufen werden. Bereits gespeicherte Schlüssel werden nicht automatisch gelöscht.

Die Fotoanalyse fragt die verfügbaren Flash-Modelle über die Models API ab und bevorzugt aktuelle stabile Varianten: https://ai.google.dev/api/models . Bei einem Modell-404 versucht sie bis zu zwei weitere verfügbare Modelle. Nährwerte aus Bildern sind Schätzungen und vor dem Speichern bearbeitbar.

## Foto mit Beschreibung

Foto aufnehmen oder auswählen, dann bei Bedarf Mengen, Zutaten, Öl, Soßen, Zubereitung und die gegessene Portion ergänzen. **Foto analysieren** sendet beides zusammen. Änderungen an der Beschreibung verwerfen das bisherige Ergebnis; **Erneut analysieren** berücksichtigt die neuen Angaben mit demselben Foto.

Bei Zeitüberschreitungen, Verbindungsfehlern und Serverfehlern versucht die App eine weitere Anfrage (höchstens drei Versuche, bei nur einem verfügbaren Modell höchstens zwei). Jede Anfrage hat maximal 45 Sekunden, die gesamte Analyse inklusive Modellsuche maximal 100 Sekunden. **Analyse abbrechen** beendet das Warten in der App; eine bereits auf dem Server gestartete Verarbeitung kann dort trotzdem weiterlaufen. Foto und Beschreibung bleiben bei Fehlern erhalten. Ein niedrigeres Thinking-Level bei Gemini 3/4 bzw. deaktiviertes Thinking bei 2.5 Flash reduziert die zusätzliche Rechenzeit: https://ai.google.dev/gemini-api/docs/generate-content/thinking .
