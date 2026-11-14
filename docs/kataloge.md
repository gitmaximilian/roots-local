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

Weitere Forschungseinträge können über das JSON-Eingabeformat ergänzt werden. Die neu eingeführte Scorelogik deckt autosomale, additive, biallelische Modelle ab. Klassifikationen aus ClinVar, komplexe Pharmakogenetik und größere Referenzimporte brauchen zusätzliche, bibliografisch nachvollziehbare Importer und Validierung.
