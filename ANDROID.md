# KCal auf Android

1. Die Dateien aus diesem Ordner auf deiner bestehenden HTTPS-Seite veröffentlichen (z. B. GitHub Pages).
2. Die Seite in Chrome auf Android öffnen.
3. Im Profil auf **App installieren** tippen, sobald Chrome die Installation anbietet. Alternativ im Chrome-Menü **Zum Startbildschirm hinzufügen → Installieren** wählen.
4. KCal über das neue App-Symbol öffnen. Die Browserleiste entfällt.

Dies ist eine installierbare Web-App (PWA), keine APK. Für eine Veröffentlichung im Play Store wäre zusätzlich eine Android-Verpackung erforderlich.

Nach dem ersten erfolgreichen Laden sind die Oberfläche und manuelle Einträge offline verfügbar. Die Fotoanalyse, Barcode-Produktsuche und das erstmalige Laden der externen Scanner-Bibliothek benötigen Internet. Updates werden nach dem Schließen aller offenen App-Fenster und erneutem Öffnen aktiv.

Einträge, Favoriten, Ziele, Einstellungen und Eingabeentwürfe liegen in IndexedDB. Vorhandene localStorage-Daten werden beim ersten Start automatisch übernommen; erst nach erfolgreicher Speicherung wird die alte Kopie entfernt. Jede Änderung wird unmittelbar gespeichert. Ein Mahlzeiteintrag wird erst nach erfolgreichem Abschluss der Datenbanktransaktion bestätigt. Unfertige Eingaben werden als Entwurf gesichert, ohne bereits zur Tagesbilanz zu zählen.

Beim Start fragt die App über `navigator.storage.persist()` dauerhaften Browserspeicher an. Die Gewährung hängt vom Browser ab; der Status steht im Profil. Das Löschen der Website-Daten, ein privates Browserfenster oder Geräteverlust können Daten trotzdem entfernen.

## Kostenlose Sicherungen und Wiederherstellung

Unter **Profil → Datensicherung auf deinem Gerät** stehen JSON-Export und JSON-Import bereit. Importe werden vor jeder Änderung vollständig geprüft (Schema-Version, IDs, echte Kalenderdaten, Kategorien, endliche nicht negative Nährwerte, Ziele und Entwürfe). Anschließend kann der Nutzer zusammenführen oder ersetzen. Beim Zusammenführen gewinnen bestehende Eintrags-IDs; Ziele und Entwürfe bleiben erhalten. Favoriten werden anhand von Name, Kategorie und Nährwerten dedupliziert. Ersetzen übernimmt Einträge, Favoriten, Ziele und Entwürfe atomar. Der lokale API Key bleibt erhalten und wird nicht in JSON-Dateien exportiert.

**Automatisches Dateisystem-Backup** verwendet eine einmalig ausgewählte lokale JSON-Datei. Der Datei-Handle bleibt in IndexedDB und die App aktualisiert die Datei nach Änderungen. Die Datei enthält den aktuellen Bestand, keine Versionshistorie; auch Löschungen werden übernommen. Es gibt keine laufenden Kosten und keinen Cloud-Dienst. Die App kann nur schreiben, während sie geöffnet ist und Schreibrechte besitzt. Nach Browserneustarts kann eine erneute Freigabe erforderlich sein. Ein fehlgeschlagenes oder pausiertes Dateibackup wird sichtbar angezeigt; die Speicherung in IndexedDB funktioniert unabhängig davon. Unterstützt der Browser `showSaveFilePicker` nicht, bleiben IndexedDB und manueller JSON-Export verfügbar.

## Favoriten und Auswertungen

Ein Stern neben einer Mahlzeit speichert die Portion als eigenständigen Favoriten. Die Schnellauswahl trägt sie mit einem Klick am ausgewählten Tag ein; sie bleibt auch nach dem Löschen des ursprünglichen Tagebucheintrags erhalten. Die Tagesübersicht gruppiert Frühstück, Mittagessen, Abendessen und Snacks. Die Makro-Prozente beziehen sich auf die Makro-Energie (Protein und Kohlenhydrate 4 kcal/g, Fett 9 kcal/g). Im Kalender zeigt die Wochenanalyse Montag bis Sonntag, die Kaloriensumme und den Durchschnitt ausschließlich erfasster Tage.

Kameraaufnahmen und hochgeladene Bilder werden vor der Analyse auf höchstens 1024 Pixel pro Seite und JPEG-Qualität 0,8 komprimiert. Aufnehmen, Tabwechsel, Verlassen der Seite und Ausblenden der App beenden aktive Kamerastreams. Während der KI-Analyse erscheinen Nährwert-Skeletons. Unplausible Werte erhalten einen Prüfhinweis.

## Lokale Prüfung

`npm ci` installiert ausschließlich Entwicklungsabhängigkeiten. `npm test` prüft KI-Abläufe, Migration, IndexedDB-Transaktionen einschließlich paralleler Sitzungen, Schema-Validierung und Dateibackup-Fehler. `npm run test:browser` prüft die Oberfläche in lokal installiertem Chrome inklusive Wiederherstellung, Import/Export, serialisierbarer Datei-Handles, Bildkomprimierung und Offline-Start. Mit `KCAL_BROWSER=msedge` kann alternativ Edge verwendet werden. Externe KI-Anfragen werden im Browsertest simuliert. Für Kamera und Dateiauswahl sind HTTPS oder localhost erforderlich. Es wird kein Backend benötigt.

Für die Fotoanalyse im Profil einen eigenen Gemini API Key eintragen. Foto und optionale Beschreibung werden erst beim Tippen auf **Foto analysieren** an Google gesendet. Der bisher im Quelltext enthaltene gemeinsame Schlüssel wurde entfernt; falls er öffentlich veröffentlicht war, sollte er in Google AI Studio widerrufen werden. Bereits gespeicherte Schlüssel werden nicht automatisch gelöscht.

Die Fotoanalyse fragt die verfügbaren Flash-Modelle über die Models API ab und bevorzugt aktuelle stabile Varianten: https://ai.google.dev/api/models . Bei einem Modell-404 versucht sie bis zu zwei weitere verfügbare Modelle. Nährwerte aus Bildern sind Schätzungen und vor dem Speichern bearbeitbar.

## Foto mit Beschreibung

Foto aufnehmen oder auswählen, dann bei Bedarf Mengen, Zutaten, Öl, Soßen, Zubereitung und die gegessene Portion ergänzen. **Foto analysieren** sendet beides zusammen. Änderungen an der Beschreibung verwerfen das bisherige Ergebnis; **Erneut analysieren** berücksichtigt die neuen Angaben mit demselben Foto.

Bei Zeitüberschreitungen, Verbindungsfehlern und Serverfehlern versucht die App eine weitere Anfrage (höchstens drei Versuche, bei nur einem verfügbaren Modell höchstens zwei). Jede Anfrage hat maximal 45 Sekunden, die gesamte Analyse inklusive Modellsuche maximal 100 Sekunden. **Analyse abbrechen** beendet das Warten in der App; eine bereits auf dem Server gestartete Verarbeitung kann dort trotzdem weiterlaufen. Foto und Beschreibung bleiben bei Fehlern erhalten. Ein niedrigeres Thinking-Level bei Gemini 3/4 bzw. deaktiviertes Thinking bei 2.5 Flash reduziert die zusätzliche Rechenzeit: https://ai.google.dev/gemini-api/docs/generate-content/thinking .

## Mahlzeit als Text

Unter **Text** die Mahlzeit frei beschreiben und **An KI senden** wählen. Die Textanalyse bevorzugt verfügbare stabile Flash-Lite-Modelle und fordert ein festes JSON-Antwortformat an. Die Modellsuche wartet höchstens 8 Sekunden pro Seite, jede Analyseanfrage höchstens 12 Sekunden. Insgesamt gelten höchstens zwei Analyseversuche und eine Grenze von 35 Sekunden inklusive Modellsuche. Auch bei einer abgelehnten Anfrage (HTTP 400), einem Modellkontingent (HTTP 429) oder einer unlesbaren Antwort kann innerhalb dieser Grenzen ein weiterer Versuch erfolgen. Ein erfolgreicher Textmodell-Fallback wird für weitere Textanfragen in derselben Sitzung bevorzugt. Fehler zeigen HTTP 400, 401/403 und 429 getrennt an. Text und bearbeitbare Schätzwerte werden erst nach **Speichern** als Eintrag übernommen.
