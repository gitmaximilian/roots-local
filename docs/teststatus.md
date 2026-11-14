# Implementierungs- und Teststatus

## Plattformen

| Plattform | Verifikation |
|---|---|
| **MacBook Air, Apple M4, macOS 15.6.1** | Nativ gebaut. Installierte App aus dem Benutzerordner gestartet. Synthetische Textdatei über den nativen Dialog importiert, Ergebnisse in der Oberfläche geprüft, PDF-Vorschau gerendert und Vollreport per Speicherdialog exportiert. |
| **M4 mit verweigertem Netzwerkzugriff** | Im installierten Debug-Bundle mit `--verify-offline` den eingebauten synthetischen Export ausgewertet, die Vorschau geöffnet und den Vollreport gespeichert. Der Start prüft, dass der App-Prozess keine Verbindung zu einer öffentlichen IP herstellen kann. Zusätzlich wurde die externe synthetische Datei per Prüfprogramm unter `sandbox-exec` importiert und exportiert. Die Netzsperre galt dem App-Prozess und gestarteten Hilfsprogrammen. Eigenständige macOS-WebKit-Prozesse und Betriebssystemdienste wurden nicht separat instrumentiert. |
| **Windows x64 und Windows ARM64** | In [GitHub Actions](https://github.com/gitmaximilian/roots-local/actions/runs/43636864272) liefen native Kern- und PDF-Tests auf beiden Architekturen durch. Beide NSIS-Installer wurden gebaut. Die Desktop-Abnahme auf einem vollständig offline installierten Windows-System, einschließlich Update und Deinstallation, ist offen. |
| **Ältere macOS-Versionen und Intel Macs** | macOS 15.6 als Mindestziel konfiguriert. Kein Test auf älteren Versionen oder Intel. |

Für den synthetischen Referenzreport wurden alle 17 Haupt- und 76 Unterkapitel, PDF-Lesezeichen, 151 interne und externe Links und eingebettete Schriften geprüft. Das geprüfte Beispiel umfasst 24 Seiten. Repräsentative Seiten wurden in der App und mit Poppler gerendert. Ein Lauf mit 700.015 synthetischen Zeilen benötigte auf dem Apple M4 mit dem Debug-Prüfprogramm 2,84 Sekunden einschließlich PDF-Export und rund 165 MiB Spitzen-RSS. Der gemessene Lauf ging über das Prüfprogramm, ohne aktiven UI-Prozess.

## Stand der Meilensteine

1. **Durchgängiger Offline-Ablauf.** Implementiert und mit synthetischen Genotypen geprüft. Vier kuratierte persönliche Regeln, zusätzliche Forschungsbezüge und Vollreport.
2. **Breite und Referenzkatalog.** Die komplette Gliederung, Suche, Statusfilter, Abdeckungsangaben, signierte Katalogpakete und Basisimport für Herkunft, Matches und Segmente sind vorhanden. Größere Datenbankimporte und kuratierte Merkmale über sämtliche Bereiche sind offen. Die Begleitimporte wurden mit synthetischen Tabellen geprüft. Weitere tatsächliche Exporte können abweichende Feldnamen und Gliederungen enthalten.
3. **Sequenzierung und Familie.** CRAM-Abdeckung wurde gegen synthetische Reads mit bekannten Basen und unterschiedlicher Qualität geprüft. Der Familienvergleich prüft gemeinsame autosomale Allele. Validierung mit einem realen MyHeritage-CRAM, phasenbasierte Zuordnung, Haplogruppen und Verwandtschaftsschätzungen stehen aus.
4. **Fortgeschrittene Interpretation.** TAS2R38-Regel für eindeutig homozygote Kombinationen, strenge additive Forschungsscores und ausgewählte Gen-Wirkstoff-Bezüge sind implementiert. Klinisch validierte komplexe Haplotypen, Kopienzahl, breite Pharmakogenetik und kalibrierte Krankheitsrisiken stehen aus.
5. **Plattformpakete.** Das native macOS-Bundle wurde gebaut. Das DMG wurde erstellt, per Prüfsumme verifiziert und auf dem M4 eingebunden. Getrennte Windows-Installer liegen als CI-Artefakte vor. Öffentliche stabile Releases setzen Windows-Desktop-Abnahme und entsprechende Signierung voraus. Entwicklerartefakte sind als solche zu behandeln.

Es wurden synthetische Genotypen verwendet. Im Repository liegen keine personenbezogenen DNA-Dateien.
