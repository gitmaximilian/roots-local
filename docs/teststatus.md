# Implementierungs- und Teststatus

## Plattformen

| Plattform | Verifikation |
|---|---|
| **MacBook Air, Apple M4, macOS 15.6.1** | Nativ gebaut. Installierte App aus dem Benutzerordner gestartet. Synthetische Textdatei über den nativen Dialog importiert, Ergebnisse in der Oberfläche geprüft, PDF-Vorschau gerendert und Vollreport per Speicherdialog exportiert. |
| **M4 mit verweigertem Netzwerkzugriff** | Import, Regeln und identischer Typst-Export zusätzlich über das lokale Rust-Prüfprogramm unter `sandbox-exec` mit `deny network*` getestet. Ein Kontrollaufruf an eine öffentliche IP scheiterte unter demselben Profil. Die separate GUI-Abnahme lief im normalen macOS-Startkontext. |
| **Windows x64 und Windows ARM64** | Getrennte native GitHub-Actions-Jobs für Kern- und PDF-Tests sowie NSIS-Pakete. Die Desktop-Abnahme auf einem vollständig offline installierten Windows-System, einschließlich Update und Deinstallation, ist offen. |
| **Ältere macOS-Versionen und Intel Macs** | macOS 15.6 als Mindestziel konfiguriert. Kein Test auf älteren Versionen oder Intel. |

Für den synthetischen Referenzreport wurden alle 17 Haupt- und 76 Unterkapitel, PDF-Lesezeichen, interne und externe Links und eingebettete Schriften geprüft. Repräsentative Seiten wurden in der App und mit Poppler gerendert. Ein Lauf mit 700.015 synthetischen Zeilen benötigte auf dem Apple M4 mit dem Debug-Prüfprogramm 2,84 Sekunden einschließlich PDF-Export und rund 165 MiB Spitzen-RSS. Der gemessene Lauf ging über das Prüfprogramm, ohne aktiven UI-Prozess.

## Stand der Meilensteine

1. **Durchgängiger Offline-Ablauf.** Implementiert und mit synthetischen Genotypen geprüft. Vier kuratierte persönliche Regeln, zusätzliche Forschungsbezüge und Vollreport.
2. **Breite und Referenzkatalog.** Die komplette Gliederung, Suche, Statusfilter, Abdeckungsangaben, signierte Katalogpakete und Basisimport für Herkunft, Matches und Segmente sind vorhanden. Größere Datenbankimporte und kuratierte Merkmale über sämtliche Bereiche sind offen. Die Begleitimporte wurden mit synthetischen Tabellen geprüft. Weitere tatsächliche Exporte können abweichende Feldnamen und Gliederungen enthalten.
3. **Sequenzierung und Familie.** CRAM-Abdeckung wurde gegen synthetische Reads mit bekannten Basen und unterschiedlicher Qualität geprüft. Der Familienvergleich prüft gemeinsame autosomale Allele. Validierung mit einem realen MyHeritage-CRAM, phasenbasierte Zuordnung, Haplogruppen und Verwandtschaftsschätzungen stehen aus.
4. **Fortgeschrittene Interpretation.** Phasenarme TAS2R38-Regel für eindeutig homozygote Kombinationen, strenge additive Forschungsscores und ausgewählte Gen-Wirkstoff-Bezüge sind implementiert. Klinisch validierte komplexe Haplotypen, Kopienzahl, breite Pharmakogenetik und kalibrierte Krankheitsrisiken stehen aus.
5. **Plattformpakete.** macOS-Bundle, DMG-Erstellung und getrennte Windows-Installer-Jobs. Öffentliche stabile Releases setzen Windows-Desktop-Abnahme und entsprechende Signierung voraus. Entwicklerartefakte sind als solche zu behandeln.

Es wurden synthetische Genotypen verwendet. Im Repository liegen keine personenbezogenen DNA-Dateien.
