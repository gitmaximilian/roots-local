# Lokale Referenzkataloge

Der ausgelieferte Startkatalog liegt in [starter.json](../catalog/starter.json). Roots Local baut daraus einen indizierten SQLite-Katalog im Speicher auf. Merkmalsregeln werden gegen die verbindliche Kapitelstruktur geprüft. Persönliche DNA gehört weder in den Katalog noch in die Bauskripte.

## Signiertes Paket lokal erstellen

```sh
openssl genpkey -algorithm Ed25519 -out /privater/pfad/katalog-key.pem
python3 scripts/build_catalog.py \
  --version 1.1.0 \
  --origin "Eigener kuratierter Katalog" \
  --license "Apache-2.0" \
  --key /privater/pfad/katalog-key.pem \
  --output mein-katalog.rootscat
```

Verwende unter **Datenquellen → Referenzkatalog** den ausgegebenen öffentlichen Schlüssel und die Paketdatei. Die App überprüft Ed25519-Signatur, SHA-256-Prüfsumme, Herkunft, Lizenz, Build und Inhalt vor dem Wechsel. Eine fehlerhafte Datei lässt den bisherigen Katalog verfügbar. Aktuell gilt der Wechsel für die laufende Sitzung. Verifiziere bei einem Drittanbieterpaket den öffentlichen Schlüssel unabhängig vom Paket.

## Veröffentlichtes Forschungsmodell ergänzen

Der Builder akzeptiert mit `--add-pgs` die harmonisierte TSV- oder TSV.GZ-Datei für **PGS000001**, ein veröffentlichtes 77-Varianten-Modell zur Brustkrebsforschung. Die Datei bleibt lokal und ist im Repository nicht gebündelt. Das Modell liefert eine additive Rohsumme bei 77 von 77 passenden Positionen. Der Report nennt die Validierungspopulation und enthält weder Perzentil noch persönliche Erkrankungswahrscheinlichkeit. Eine Prüfung mit echten Daten oder eine klinische Validierung durch dieses Projekt steht aus. [PGS000001](https://www.pgscatalog.org/score/PGS000001/) · [Format und Lizenzhinweise](https://www.pgscatalog.org/downloads/)

Weitere Forschungseinträge können über das JSON-Eingabeformat ergänzt werden. Die neu eingeführte Scorelogik deckt autosomale, additive, biallelische Modelle ab. Klassifikationen aus ClinVar und komplexe Pharmakogenetik brauchen zusätzliche, bibliografisch nachvollziehbare Importer und Validierung.

## GWAS-Studienkatalog ergänzen

Lade den **ontologieannotierten Assoziationsexport v1.0.2** von EMBL-EBI. Der Builder liest das Vollarchiv als ZIP oder die Tabelle als TSV beziehungsweise TSV.GZ. Die Zuordnung der Ontologie-IDs zu den Reportkapiteln steht in [gwas_topics.json](../catalog/gwas_topics.json). [EBI-Downloads](https://www.ebi.ac.uk/gwas/docs/file-downloads/) · [Spaltendokumentation](https://www.ebi.ac.uk/gwas/docs/fileheaders/)

```sh
python3 scripts/build_catalog.py \
  --add-gwas /lokaler/pfad/ebi-associations.zip \
  --hg38-to-hg19-chain /lokaler/pfad/hg38ToHg19.over.chain.gz \
  --version 2026.11.02-gwas \
  --origin "NHGRI-EBI GWAS Catalog, Datenstand 2026-11-02" \
  --license "EMBL-EBI Terms of Use" \
  --key /privater/pfad/katalog-key.pem \
  --output gwas.rootscat
```

Der Builder behält signifikante Einzelmarker-Assoziationen für die zugeordneten Themen. Mehrere Zeilen derselben Publikation zum selben Marker und Ontologieterm werden zusammengefasst. Standardmäßig gehen bis zu 100 Einträge je Thema in das Paket ein. Mit `--gwas-limit-per-topic` lässt sich die Grenze auf bis zu 300 erhöhen. Das Paket behält die eingebauten Merkmalsregeln.

Der GWAS Catalog liefert GRCh38-Positionen. Die optionale [UCSC-Chain](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/liftOver/) ergänzt GRCh37 nur bei eindeutigem vorwärtsgerichtetem Mapping auf demselben Chromosom. Ohne Chain sind neu importierte Marker nur mit GRCh38 abgleichbar. Bereits geprüfte Marker behalten ihre hinterlegten Koordinaten. Die App zeigt einen GWAS-Eintrag bei übereinstimmender rsID, Position und auswertbarem Genotyp. Studienbefund, ursprüngliches Merkmal, p-Wert, Stichprobenbeschreibung und gegebenenfalls berichteter Effekt erscheinen in der Detailansicht und im PDF. Effektallele und persönliche Effektrichtungen werden dabei nicht zugeordnet.

Mit dem EBI-Datenstand vom 2. November 2026 ergab der Standardfilter **4.153 Studienassoziationen zu 46 Themen**. Die synthetische MyHeritage-Datei enthielt passende Positionen für **52** dieser Assoziationen. Die externen Referenzdateien und das daraus erzeugte Paket werden lokal verwaltet. Verwende in öffentlich verteilten Paketen die jeweiligen Nutzungsbedingungen.
