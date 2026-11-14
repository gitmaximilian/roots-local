# Roots Local

*Explore your DNA. Offline.*

Roots Local ist eine Open-Source-Desktop-App zur lokalen Auswertung von MyHeritage-Rohdaten. Sie verbindet ausgewählte Genotypen mit einem versionierten Referenzkatalog und erstellt einen PDF-Vollreport mit 17 Hauptkapiteln und 76 Unterkapiteln.

## Ausprobieren

Auf Apple Silicon wird die App als natives macOS-Bundle gebaut. Öffne **Roots Local**, wähle **Beispiel ansehen** oder importiere [die synthetische MyHeritage-Datei](fixtures/synthetic-myheritage.txt). Unter **PDF-Report** kannst du den Vollreport in der App ansehen und lokal speichern.

- [Plattformen, Abnahme und offene Meilensteine](docs/teststatus.md)
- [Verbindliche Gliederung](docs/reportstruktur.md)
- [Masterprompt](docs/umsetzungsprompt.md)
- [Referenzkataloge erstellen oder importieren](docs/kataloge.md)

## Aus dem Quellcode bauen

Voraussetzungen sind die [Tauri-Systemabhängigkeiten](https://v2.tauri.app/start/prerequisites/), Rust stable, Node.js 22 und Python 3.13. Auf Windows kannst du für die Skripte `python` verwenden. Der erste Build lädt Abhängigkeiten und die anhand eines SHA-256-Digests geprüfte Typst-Komponente. Danach braucht die installierte App keinen Download für Import, Vorschau oder PDF-Export.

```sh
npm ci
python3 scripts/prepare_tools.py
npm run tauri -- dev
```

Für ein macOS-App-Bundle verwende `npm run tauri -- build --bundles app`. Das Skript `scripts/package_macos.sh` erstellt daraus ein DMG. Für Windows verwende auf der Zielarchitektur `npm run tauri -- build --bundles nsis`. Die [Build-Matrix](.github/workflows/desktop.yml) beschreibt die genauen Build-Ziele.

## Was die App auswertet

- **Standardexport.** CSV, TSV, TXT und ZIP. Unterstützt deklarierte Builds GRCh37 und GRCh38. Ein unbekannter Build, fehlende Marker und widersprüchliche Einträge erscheinen als offen.
- **Startkatalog.** Regeln zu Laktaseaktivität, Ohrenschmalztyp, Bitterwahrnehmung und ACTN3 sowie Forschungsbezüge zu ausgewählten weiteren Markern. Die App zeigt Datenqualität und wissenschaftliche Evidenz getrennt.
- **Begleitdaten.** Manuell übernommene Herkunftsangaben, Match- und Segmenttabellen sowie ein Vergleich autosomaler Positionen mit einer angegebenen Eltern- oder Familiendatei. Der Vergleich liefert geteilte Allele.
- **CRAM.** Liest ausgerichtete Reads mit einer passenden lokalen, indexierten FASTA. Zeigt die Abdeckung für Katalogpositionen. Die CRAM-Auswertung liefert derzeit keine Genotypen oder Haplogruppen.
- **Fortgeschrittene Forschung.** Ein separat importiertes, signiertes Katalogpaket kann additive PGS enthalten. Für einen Rohscore ist hier die vollständige, passende Abdeckung nötig. Die App führt keine Kalibrierung auf absolutes Krankheitsrisiko durch.
- **PDF-Export.** Voll- oder Kurzreport, klickbare Inhaltsverzeichnisse und Quellen. Der Vollreport weist auch Kapitel ohne verfügbare Merkmalsregel aus. Name, konkrete Genotypen und Namen von DNA-Matches sind optional.

Rohdaten werden in der Sitzung gehalten. PDF-Erstellung verwendet einen privaten temporären Ordner, den die App nach dem Vorgang aufräumt. Der Zielordner für den PDF-Export kann durch das Betriebssystem oder andere Software synchronisiert werden. Medizinisch relevante Consumer-Befunde brauchen eine unabhängige klinische Bestätigung.

## Tests

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
npm run build
```

Setze `ROOTS_TEST_TYPST` auf den absoluten Pfad zur vorbereiteten Typst-Datei, um auch die vollständigen PDF-Tests auszuführen. Die App und CI verwenden synthetische DNA für Beispiele und Tests. Verwende in öffentlichen Issues, Pull Requests und CI keine privaten DNA-Dateien oder persönlichen Berichte.

## Lizenz

[Apache 2.0](LICENSE) für den Projektcode. Externe Komponenten und Daten behalten ihre jeweiligen Bedingungen. [Drittanbieterhinweise](licenses/README.md)
