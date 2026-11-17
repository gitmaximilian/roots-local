# Auftrag: Roots Local gründlich prüfen, verbessern und live veröffentlichen

## Aktuelle Schwerpunkte und Abnahme

Beginne jede Nachricht an mich mit dem aktuellen Kapitel dieses Masterprompts und dem konkreten Arbeitsschritt. Zeige bei einem Phasenwechsel, was geprüft ist und was als Nächstes ansteht.

1. **Befund schließen.** Reproduziere den gemeldeten X-Fehler nach „Frag deine DNA“, im Kern-Radar und im Atlas. Prüfe Desktop und Handy, Klick, Touch, Tastatur und Escape. Das X muss gut erreichbar und mit „Details schließen“ beschriftet sein. Nach dem Schließen soll der Fokus zur auslösenden Aktion zurückkehren. Prüfe auch den direkten Wechsel vom Befund in die Rohdaten und zurück.
2. **Sprachauswahl.** Englisch ist beim ersten Besuch die feste Standardsprache von Roots Local, auch bei deutsch eingestelltem Browser oder Betriebssystem. App und neu erzeugte PDFs verwenden Englisch, bis man ausdrücklich Deutsch wählt. Überarbeite die sichtbare Sprachauswahl im Toolbar-Design. Sie soll Englisch und Deutsch verständlich benennen, die aktive Sprache zeigen und auf kleinen Geräten Platz für die übrigen Aktionen lassen. Prüfe hell/dunkel, Tastatur und Touch, lange deutsche Titel sowie den Sprachwechsel während eines importierten Profils. Kontrolliere die Sprache von Oberfläche, Befund und PDF. Die Browser-Speicherung bleibt auf die Sprachwahl begrenzt.
3. **Interpretationsqualität.** Überprüfe die Befundkette mit synthetischen Referenzfällen und Primärquellen. Ein fairer Vergleich verwendet dieselben Eingaben und dieselbe vorab definierte Bewertung für Roots Local und ein namentlich benanntes LLM. Bewerte richtige Genotypzuordnung, begründete Enthaltung bei unbekannter Phase oder unzureichenden Markern sowie Nachvollziehbarkeit der Aussage. Halte Katalogabdeckung, klinische Validierung und LLM-Vergleich getrennt fest.
4. **Lokalität.** Beweise Import, Analyse, PDF-Vorschau und Downloads mit abgeschaltetem Netzwerk nach der einmaligen Installation. Untersuche auch Worker-Netzwerk, Browser-Speicher, Cloudflare-Header, separate Einwilligung für medizinische PDF-Inhalte und Sitzungswechsel.


Übernimm Roots Local als bestehendes Produkt. Prüfe die gesamte Nutzererfahrung und die technische Umsetzung kritisch. Schreibe zuerst einen nachvollziehbaren Auditbericht, leite daraus einen priorisierten Umsetzungsplan ab und setze ihn um. Veröffentliche anschließend den geprüften Stand und verifiziere die öffentlichen Seiten. Eine Liste von Verbesserungsvorschlägen allein erfüllt den Auftrag nicht.

Mit mir sprichst du Deutsch. Code, Commits und technische GitHub-Dokumentation schreibst du Englisch. App, Portfolio und PDF-Ausgaben pflegst du auf Englisch und Deutsch.

## Ausgangslage

- Arbeitsverzeichnis der App: `/Users/maximilianauer/Documents/ChatGPT/DNA analyse`
- GitHub: `gitmaximilian/roots-local`
- Bisheriger Web-Branch: `web/local-only`
- App: `https://rootslocal.maximilianauer.at/`
- Portfolio: `https://maximilianauer.at/projects/`
- Detailseite: `https://maximilianauer.at/projects/rootslocal/`
- Datenschutzhinweise: `https://maximilianauer.at/legal/#rootslocal`
- Portfolio-Quellstand: `/Users/maximilianauer/Documents/ChatGPT/website maximilianauer.at/portfolio`
- Cloudflare Pages: `rootslocal` für die App und `maximilianauer` für das Portfolio

Prüfe Branches, Arbeitsbaum, offene PRs und Deployments selbst. Beginne mit `README.md`, `docs/deployment.md`, `docs/web-plan.md`, `docs/test-status.md` und dem `PUBLISHING.md` des Portfolios. Bestimme den tatsächlich ausgelieferten Build über `version.txt` und den Prüfsummenvergleich. Sichere den Ausgangsstand und halte bestehende lokale Änderungen fest, bevor du Dateien bearbeitest. Arbeite auf einem eigenen Branch vom verifizierten Web-Stand.

## Feste Produktanforderungen

- Roots Local bleibt eine reine Web-App. Es gibt keinen Upload, kein Analyse-Backend, kein Konto, keine Analytics und keine extern geladenen App-Ressourcen.
- DNA-Dateien, ergänzende Daten, Namen, Ergebnisse und Exporte werden ausschließlich lokal verarbeitet. Im Browser dürfen die Sprachwahl und statische App-Dateien gespeichert werden. Nutzerexporte entstehen als lokale Downloads.
- Prüfe die Datenschutzanforderungen am ausgelieferten Build. Berücksichtige sowohl Anwendungscode als auch Effekte von Cloudflare, etwa eingefügte Skripte, Reporting-Header, Prefetch und Caching.
- Verwende ausschließlich synthetische Testdaten. In GitHub, Screenshots, Logs und Testartefakten dürfen keine echten genetischen Daten oder Zugangsdaten landen.
- Erhalte die bestehende Funktionalität und die Zweisprachigkeit. Behandle geänderte Analyseergebnisse als fachliche Änderung, die einen Beleg und einen Vergleichstest braucht.
- Prüfe, ob Aussagen zu Befunden, Evidenz, Sicherheit, Medikamenten und Diagnostik durch die tatsächliche Funktion gedeckt sind. Dokumentiere offene medizinische oder regulatorische Fragen als solche. Bei ungeklärter Einordnung darfst du keine neue klinische Eignung behaupten.
- Verändere am Portfolio nur Inhalte und Komponenten, die Roots Local betreffen. Der primäre Button heißt „Roots Local öffnen“ beziehungsweise „Open Roots Local“.

## Phase 1 – Prüfen und reproduzieren

Erkunde die öffentliche App und den lokalen Produktionsbuild wie eine neue Nutzerin oder ein neuer Nutzer. Teste den tatsächlichen Ablauf im Browser. Lies den Code gezielt, um beobachtete Fehler zu erklären und weitere Randfälle zu finden.

### Design und Bedienung

Prüfe den Einstieg ohne Vorwissen. Ist sofort klar, welche Dateien akzeptiert werden, was ausgewertet wird, was lokal passiert und wie man ein Beispiel ausprobieren kann? Teste, ob eine Person mit einer konkreten Frage zum Ergebnis gelangt und nachvollziehen kann, auf welchen Daten es beruht.

Gehe jede Hauptansicht durch: Einstieg, Übersicht, „Frag deine DNA“, Kern-Radar, Lebensbereiche, Atlas, Kapitel, Varianten, Datenquellen, PDF-Ansicht, Medikamentenpass und Datenschutz. Prüfe Navigation, Zurückwege, Zustandswechsel, verständliche Beschriftungen, Informationsdichte und Wiederauffindbarkeit. Bewerte bei Radar und Atlas insbesondere, welche Frage die Visualisierung beantwortet und welche Fehlinterpretationen möglich sind.

Beurteile visuelle Hierarchie, Typografie, Kontraste, Abstände, Lesbarkeit, konsistente Bedienelemente und Licht- sowie Dunkelmodus. Prüfe schmale Displays, Querformat, breite Desktop-Fenster und Zoom. Achte auf abgeschnittene Inhalte, lange deutsche Texte, überlagerte Bedienelemente, Scrollfallen und Sprünge beim Laden. Jede vorgeschlagene Designänderung soll ein beobachtetes Problem lösen.

### Barrierefreiheit

Prüfe den Kernablauf mit Tastatur, sichtbarem Fokus und sinnvoller Fokusreihenfolge. Teste Dialoge und mobile Menüs auf Fokusführung und Rückkehr zum Ausgangspunkt. Prüfe Überschriften, zugängliche Namen, Formularfehler, Statusmeldungen, Textkontraste, Zoom, Touch-Ziele und reduzierte Bewegung. Nutze automatische Prüfungen und manuelle Stichproben mit einem Screenreader, soweit verfügbar. Dokumentiere, welche Prüfungen tatsächlich durchgeführt wurden.

### Vertrauen und Verständlichkeit der Ergebnisse

Prüfe, ob Nutzer zwischen einem gemessenen Genotyp, einer Kataloginterpretation, fehlenden Daten und einem unklaren Ergebnis unterscheiden können. Prüfe, ob Sicherheitsgrad, Studienpopulation, Quellen, Abdeckung und Grenzen verständlich erklärt und am Ergebnis auffindbar sind. Achte darauf, dass fehlende Evidenz nicht wie ein unauffälliger Befund erscheint.

Prüfe besonders, wie medizinische Ergebnisse eingeblendet werden, welche Informationen der Medikamentenpass enthält und welche Handlung seine Formulierungen nahelegen. Vergleiche App, Projektseite, Datenschutzhinweise und PDF-Ausgaben auf widersprüchliche Aussagen. Untersuche auch, ob optionale persönliche Angaben vor dem Export klar erkennbar und kontrollierbar sind.

### Abläufe und Ausnahmen

- Erster Besuch, synthetisches Beispiel und eigener synthetischer Import
- Unterstützte Formate, beschädigte oder leere Dateien, falsche Referenz, doppelte und widersprüchliche Einträge
- Große Importe, Fortschrittsanzeige, Abbruch, Wiederholung, Wechsel der Datei und Schließen der Sitzung
- Begleitdateien, Familien- und Elterndaten, lokale ClinVar- und ClinGen-Dateien, signierte Kataloge sowie CRAM mit passendem FASTA und Index
- Suche, Filter, fehlende Treffer, Sprachwechsel mitten in einer Analyse und Zustand nach dem Neuladen
- PDF-Vorschau, Vollreport, Kurzreport und Medikamentenpass in beiden Sprachen. Prüfe Inhalt, Umbruch, Schrift, Dateinamen und Download.
- PWA-Installation, erster Offline-Start, Offline-Import und -Export, Update während einer laufenden Sitzung und Wiederherstellung nach einem unterbrochenen Start

Teste Desktop-Chromium und WebKit sowie iPhone- und Android-Ansichten. Nutze echte Geräte, wenn sie verfügbar sind. Kennzeichne Emulation ausdrücklich. Wenn Playwright eine Plattformfunktion nicht zuverlässig abbildet, benenne die Einschränkung und prüfe, was sich auf anderem Weg verifizieren lässt.

### Technik, Datenschutz und Leistung

Prüfe Worker-Grenzen, Speicherhaltung, Bereinigung nach Dateiwechsel oder Sitzungsende, parallele Vorgänge, Fehlerbehandlung und die Integrität der Offline-Dateien. Untersuche, ob Updates oder unvollständige Downloads einen alten und einen neuen Build vermischen können.

Miss Startzeit, Zeitpunkt bis zum ersten nutzbaren Zustand, Importdauer, PDF-Dauer, Spitzenspeicher und Downloadgröße. Trenne kalten Online-Start vom wiederholten Start. Verwende auch eine synthetische Datei mit ungefähr 700.000 Zeilen. Dokumentiere Gerät, Browser und Messbedingungen. Vergleiche mit dem Ausgangsstand.

Prüfe Netzwerkanfragen vor und nach dem Start, einschließlich Anfragen aus Workern. Prüfe Local Storage, Session Storage, IndexedDB, Cookies und Cache Storage. Teste Import, Analyse und Exporte offline erneut. Verifiziere live HTTPS, CSP, relevante Sicherheits-Header, Integrität, ausgelieferte Prüfsummen und die statischen Dateien. Prüfe den Code defensiv auf unsichere Dateiverarbeitung, unbeschränkte Ressourcenlast, unbeabsichtigte Datenübertragung und versehentliche Speicherung.

## Phase 2 – Kritik schreiben und Plan ableiten

Dokumentiere den Audit im GitHub-Repo, beispielsweise unter `docs/audit/`. Halte pro Befund fest:

- Betroffene Ansicht, Ablauf und Plattform
- Reproduktionsschritte mit synthetischen Daten
- Tatsächliches und erwartetes Verhalten
- Konkrete Auswirkung auf Nutzerinnen und Nutzer
- Belege, etwa Screenshot, Messung, Testausgabe oder Codeverweis
- Priorität und ein prüfbares Abnahmekriterium

Unterscheide bestätigte Fehler, begründete Designkritik und offene Fragen. Benenne auch Entscheidungen, deren Nutzen durch den Test sichtbar wurde und die bei Änderungen erhalten werden sollen.

Schreibe daraus einen Umsetzungsplan. Ordne zuerst Daten- und Vertrauensprobleme, kaputte Kernabläufe und Barrieren ein. Danach kommen Verständlichkeit, visuelle Hierarchie, Leistung und Feinschliff. Jeder Arbeitspunkt soll auf einen Auditbefund verweisen und sagen, wie er abgenommen wird. Vermeide einen Komplettumbau, wenn eine gezielte Änderung das Problem löst. Zeige mir kurz die wichtigsten Befunde und deine Reihenfolge. Arbeite anschließend weiter.

## Phase 3 – Umsetzen und nachprüfen

Setze den Plan in kleinen, nachvollziehbaren Commits um. Arbeite an betroffenen Abläufen von der Eingabe bis zum Ergebnis. Prüfe jeweils Englisch und Deutsch, Desktop und Mobil, hell und dunkel. Nutze Vorher-nachher-Screenshots für visuelle Änderungen.

Führe die vorhandenen Rust-, WebAssembly-, Paritäts-, PDF- und Browserprüfungen aus. Ergänze Regressionstests für konkrete Fehler, die der bisherige Testbestand übersieht. Vergleiche die Leistung und die PDF-Ergebnisse mit der Baseline. Aktualisiere Audit und Plan anhand der tatsächlichen Ergebnisse. Markiere einen Befund erst als erledigt, wenn sein Abnahmekriterium erfüllt ist.

## Phase 4 – GitHub, Produktion und Abschluss

Pushe den Arbeitsbranch und erstelle einen PR mit den wichtigsten Befunden, Änderungen, Vorher-nachher-Belegen und Testergebnissen. Die dauerhafte Dokumentation gehört in versionierte Dateien. Halte dort auch technische Entscheidungen, ausgelassene Punkte mit Grund, reproduzierbare Prüfkommandos und bekannte Einschränkungen fest.

Veröffentliche den geprüften App-Build im bestehenden Cloudflare-Pages-Projekt `rootslocal`. Verwende `rootslocal.maximilianauer.at` als Produktionsziel. Prüfe den Live-Build anhand der Prüfsummen und wiederhole dort den Datenschutz-, Import-, Offline- und PDF-Kernablauf. Vergleiche Cache- und Update-Verhalten mit der vorherigen Version. Veröffentliche nötige Portfolio-Korrekturen im bestehenden Projekt `maximilianauer` und prüfe Karten, Links, Detailseite und Datenschutzhinweise live, einschließlich WWW und Pages-Alias.

Dokumentiere in GitHub den veröffentlichten Commit, Build-ID, Deployment-URL, Datum, Live-Prüfungen und Rückrollmöglichkeit. Aktualisiere bei Portfolio-Änderungen zusätzlich `PUBLISHING.md` und `deployment.json`. Wenn nach dem Deploy ein Fehler auftritt, behebe ihn oder stelle den zuletzt überprüften Stand wieder her und verifiziere das Ergebnis.

Arbeite bis zum verifizierten Live-Stand. Halte nur bei einem konkreten Blocker an, den ich selbst lösen muss, etwa einer persönlichen Anmeldung oder einem fehlenden Zugang. Schließe mit den Live-Links, dem GitHub-PR, den wichtigsten Änderungen und den Prüfungen ab, die tatsächlich noch offen sind.
