# Local reference catalogs

The [starter catalog](../catalog/starter.json) initializes an indexed, in-memory SQLite catalog. The app validates rules against stable chapter and section IDs. Reference packages and build scripts contain public reference material only.

## Sign a package

```sh
openssl genpkey -algorithm Ed25519 -out /private/path/catalog-key.pem
python3 scripts/build_catalog.py \
  --version 1.1.0 \
  --origin "Curated reference catalog" \
  --license "Apache-2.0" \
  --key /private/path/catalog-key.pem \
  --output my-catalog.rootscat
```

In **Data sources → Reference catalog**, enter the public key and open the package. Activation verifies the Ed25519 signature, SHA-256 checksum, origin, license, genome builds, and schema. An invalid package leaves the previous catalog active. The active catalog is session-scoped. Obtain third-party public keys from a trusted channel separate from the package.

## Add a published polygenic score

Pass `--add-pgs` with the harmonized TSV or TSV.GZ file for **PGS000001**, a published 77-variant breast cancer research model. The coefficients are not bundled. The additive raw score requires all 77 positions to match. The report states the validation population. Population percentiles, clinical validation, and individual disease probabilities remain outside the current implementation. [PGS000001](https://www.pgscatalog.org/score/PGS000001/) · [File format and licensing](https://www.pgscatalog.org/downloads/)

## Add GWAS associations

Download the **ontology-annotated v1.0.2 association export**. The builder reads the full ZIP or a TSV/TSV.GZ. [Ontology-to-chapter mapping](../catalog/gwas_topics.json) · [EMBL-EBI downloads](https://www.ebi.ac.uk/gwas/docs/file-downloads/) · [Field descriptions](https://www.ebi.ac.uk/gwas/docs/fileheaders/)

```sh
python3 scripts/build_catalog.py \
  --add-gwas /local/path/ebi-associations.zip \
  --hg38-to-hg19-chain /local/path/hg38ToHg19.over.chain.gz \
  --version 2026.11.02-gwas \
  --origin "NHGRI-EBI GWAS Catalog, 2026-11-02" \
  --license "EMBL-EBI Terms of Use" \
  --key /private/path/catalog-key.pem \
  --output gwas.rootscat
```

The builder keeps significant single-marker associations for mapped topics. It collapses duplicate rows for the same publication, marker, and term, and keeps up to 100 entries per topic by default. Use `--gwas-limit-per-topic` to set a limit between 1 and 300. Starter rules remain in the resulting package.

GWAS Catalog positions use GRCh38. The optional [UCSC chain](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/liftOver/) maps unambiguous forward positions on the same chromosome to GRCh37. Without that chain, newly imported loci require GRCh38. A report association requires a matching rsID, position, and usable genotype. The UI and PDF show the study, reported trait, sample description, p-value, and effect where available. The user's effect allele and personal effect direction are undetermined.

The November 2, 2026 export yielded 4,153 associations across 46 topics under the default filter. The synthetic MyHeritage file matched 52 of them. Reference data and packages are stored locally. Original study descriptions and third-party catalog entries retain the language and terms supplied by their authors.
