# Local reference catalogs

The [starter catalog](../catalog/starter.json) is loaded into indexed in-memory structures (by rsID and by coordinate). The app validates rules against stable chapter and section IDs. Reference packages and build scripts contain public reference material only.

## Interpretation rules

A rule turns genotypes into a conclusion the user can act on. Each conclusion carries a confidence level (`high`, `moderate`, or `low`).

- **Outcomes** (`method: "single"` or `"bitter"`): `outcomes` lists genotype patterns with a short `conclusion`, a longer `message`, and a `confidence`. Calls are sorted per marker (`"AG"`, not `"GA"`). For several markers, join the calls with `/` in marker order, for example `"GG/AA/CC"`.
- **Effect allele** (`method: "research"`): `effect` names one marker, its verified plus-strand `allele`, three `conclusions` for zero, one, and two copies, and a `confidence`. Set `clinical: true` for medically relevant results. Reports omit those conclusions unless the user opts in to clinical annotations.

Only add an effect allele after confirming its plus-strand orientation in a primary source such as the marker's dbSNP or ClinVar record. - **Questions.** `questions` lists up to eight everyday questions a rule answers, written in German with English translations in `catalog/result-strings.json`. *Ask your DNA* matches typed questions against them offline.
- **Medical flag.** Set `clinical: true` on a rule whose outcomes concern medicines or disease risk, such as APOE or metabolizer types. The app hides those conclusions until the user turns on medical findings, and reports include them only with the clinical opt-in.

Catalog 1.7.0 adds 32 single-marker effect-allele rules, for 65 rules on 69 markers:

- **Appearance and senses:** OCA2 rs1800407, IRF4 rs12203592, TYR rs1393350 and rs1042602, KITLG rs12821256, HMGA2 rs1042725, OR7D4 rs61729907, OR2M7 region rs4481887.
- **Nutrition and behaviour:** ADORA2A rs5751876, AHR rs4410790, BCO1 rs7501331, FADS1 rs174537, FTO rs1421085, MC4R rs17782313, COMT rs4680, FOXO3 rs2802292.
- **Medical flag:** CHRNA5 rs16969968, 9p21 rs10757278, PITX2 region rs2200733, LPA rs10455872, PCSK9 rs11591147, ACKR1 rs2814778, SERPINA1 rs28929474, CFH rs1061170, ARMS2 rs10490924, HLA-DQ2.5 tag rs2187668, HLA-DQ8 tag rs7454108, HLA-B27 tag rs4349859, NOD2 rs2066844, UGT1A1 rs887829, ABCG2 rs2231142, CYP4F2 rs2108622.

Coordinates, plus-strand alleles, and 1000 Genomes frequencies come from the NCBI Variation API. Effect directions were checked against the primary study and the GWAS Catalog v2 API, whose minus-strand report of rs2187668 (A) corresponds to T on the plus strand. PubMed IDs were checked with E-utilities on 2026-11-20. Low confidence marks small or single studies (TYR S192Y, asparagus odour, ADORA2A, BCO1, COMT, FOXO3).

Left out on purpose: strand-symmetric A/T and C/G markers such as FTO rs9939609, PPARG rs1801282, HFE rs1799945, and HBB rs334, because providers can report them on different strands; rare pathogenic variants such as LRRK2 G2019S and BRCA1/2, because consumer arrays often miscall them; indels and multi-variant haplotypes such as CFTR F508del, APOL1 G2, and CYP2D6, which a single SNP call cannot represent; X-linked markers such as G6PD and AR, because hemizygous calls need their own rule type.

Catalog 1.6.0 adds effect-allele rules for SLC24A5 rs1426654 (skin pigmentation), FUT2 rs601338 (secretor status), GC rs2282679 (vitamin D level, low confidence), EDAR rs3827760 (hair thickness), MTHFR rs1801133 (folate metabolism, medical flag, with the ACMG guideline against routine testing), and MC1R rs1805008 (red hair). Coordinates and plus-strand alleles were checked against the NCBI Variation API and the sources against PubMed on 2026-11-20. The strand-symmetric SLC45A2 rs16891982 (C/G) was left out because providers can report it on different strands. Earlier releases use effect alleles for rs671, rs1229984, rs7903146, rs1800562, rs6025, rs1799963, rs4149056, rs3918290, rs55886062, rs116855232, rs9923231, rs776746, rs1805007, and rs4988235. Two-marker outcomes define APOE, CYP2C9, CYP2C19, and TPMT types. Phase is assumed where both markers are heterozygous, and the rule says so.

## Built-in genetic scores

The app includes genetic scores for the traits in [gwas_score_topics.json](../catalog/gwas_score_topics.json), built by [scripts/gwas_scores.py](../scripts/gwas_scores.py) from the NHGRI-EBI GWAS Catalog association export into [gwas-scores.json](../catalog/gwas-scores.json). They load with the app and run on the device like every other rule.

How a score is built:

1. **One study per trait.** Among genome-wide significant single-trait associations (p ≤ 5 × 10⁻⁸), the builder takes the study with the most usable rows. All weights in a score therefore share one unit: log odds for diseases, the study's beta for measurements. Rows without a clear direction (a beta without "increase" or "decrease") are dropped.
2. **Independent loci.** Lead variants are taken by significance, keeping at most one per 500 kb on a chromosome. This limits double counting through linkage; it is not a formal clumping with an LD reference. Up to four other significant variants of the same study within 250 kb of a lead are kept as stand-ins. The app uses the first variant of each locus that the file contains, so a locus counts once.
3. **Verified effect allele.** The GRCh37 position, alleles, and 1000 Genomes frequencies come from the Ensembl GRCh37 REST API; GRCh38 positions come from the catalog. The two alleles observed in 1000 Genomes define the variant. Strand-symmetric A/T and C/G variants are dropped. A reported risk allele that is not one of the two alleles is mapped through its complement; if that fails, the variant is dropped. If the study's allele frequency differs from the European 1000 Genomes frequency by more than 0.25, the variant is dropped as a likely strand or allele error.
4. **Frequency.** The study's risk-allele frequency is used, or the European 1000 Genomes frequency where the study reports none. Variants with a frequency below 0.5 % or above 99.5 % are dropped.

In the app, each genotyped variant contributes copies × weight. The expected value (Σ 2fw) and variance (Σ 2f(1 − f)w²) over the same variants give a z-score and an estimated percentile in the study population, reported between 1 and 99 because the normal approximation is coarse in the tails. A score needs at least 8 genotyped loci and at least 10 % of its loci. The conclusion names five ranges (below the 10th percentile, 10th to 30th, 30th to 70th, 70th to 90th, above the 90th), and the detail view shows the percentile, the number of loci found in the file, and the eight variants that contribute most. Scores for diseases and laboratory values carry the medical flag and stay hidden until the user opts in. Confidence is always low: a score of lead variants explains only part of the heritability and is calibrated only to the study population.

Rebuild the scores from a new export:

```sh
python3 scripts/gwas_scores.py select /local/path/ebi-associations.zip tmp/scores/selected.json
python3 scripts/gwas_scores.py resolve tmp/scores/selected.json tmp/scores/ensembl.json
python3 scripts/gwas_scores.py build tmp/scores/selected.json tmp/scores/ensembl.json catalog/gwas-scores.json "2026-10-29"
```

Traits left out on purpose: social outcomes (educational attainment, income, intelligence), because they mostly reflect environment and invite misreading; pooled measurements such as "protein measurement" or "fatty acid amount", whose associations mix different molecules; pigmentation scores, whose direction has no single meaning; and traits whose largest study has fewer than five independent variants.

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
## Clinical reference files

Download the official ClinVar VCF for the same reference assembly as the raw DNA export. In **Data sources → ClinVar**, open its `.vcf` or `.vcf.gz` file. Roots Local matches diploid autosomal SNPs by assembly, chromosome, position, rsID, and compatible alleles. It shows matching alternate alleles with pathogenic, likely pathogenic, or conflicting germline classifications. The report preserves ClinVar's classification, review status, and available conflicting submissions. [NCBI ClinVar downloads](https://www.ncbi.nlm.nih.gov/clinvar/docs/downloads/)

After ClinVar, open the **Gene-Disease Validity Curations** CSV from ClinGen. Roots Local looks up single-gene ClinVar records when the gene symbol and the MONDO condition both agree. The report shows ClinGen evidence for the gene–disease relationship with its own source link. [ClinGen downloads](https://search.clinicalgenome.org/kb/downloads)

Independent confirmation is required for a clinical finding from consumer raw data. A missing match leaves the condition unresolved. Raw DNA and selected reference files stay on the device during the import. Select **Include ClinVar and ClinGen records** in the PDF settings to export the clinical annotations. Their source links can reveal a variant even when explicit allele details are hidden.

## Maternal lineage

Use a single mitochondrial HSD profile aligned to rCRS with the assayed positions identified in its range. The standard tabular kit file and the coverage report are separate inputs. Obtain an HSD profile independently from mitochondrial sequence results or a validated assay conversion. [Haplogrep input formats](https://haplogrep.readthedocs.io/en/latest/input-formats/)

Haplogrep needs Java, so it cannot run inside the browser. Run the helper on a computer, then open its JSON summary in the web app.

Download the Haplogrep 3.3.2 Linux archive and the PhyloTree rCRS 17.3 archive, then disconnect from the internet. The helper uses the cross-platform JAR in the Linux archive. Run it with Python 3.11 or newer and Java 21. The helper verifies both archive SHA-256 values before loading the local tree. Its output contains the candidates, version, reported range size, and counts of warnings and errors. [Haplogrep 3.3.2 release](https://github.com/genepi/haplogrep3/releases/tag/v3.3.2) · [PhyloTree rCRS 17.3 release](https://github.com/genepi/phylotree-rcrs-17/releases/tag/17.3)

```sh
python scripts/classify_mtdna.py \
  --input mitochondrial-profile.hsd \
  --tool-archive haplogrep3-3.3.2-linux.tar.gz \
  --tree-archive phylotree-rcrs-17.3.zip \
  --output maternal-result.json
```

Open the JSON in **Data sources → Maternal lineage** after opening the corresponding raw DNA profile. Check that the mtDNA input belongs to that profile. The haplogroup score measures fit to the tree. The app keeps the candidates visible when Haplogrep reports errors and labels the assignment unresolved. Select **Include imported mtDNA result** to add it to section 01.3 in the PDF. [Haplogrep quality checks](https://haplogrep.readthedocs.io/en/latest/errors-warnings/)

## Curated hair research

The starter catalog adds MC1R rs1805007 for pigmentation and TCHH rs11803731 for hair shape. The rules require matching rsID, position, forward-strand alleles used in the cited study, and the declared reference assembly. The app reports the study context, tested populations, and limits. [MC1R study](https://doi.org/10.1038/s41467-018-07691-z) · [TCHH study](https://doi.org/10.1016/j.ajhg.2009.10.009) · [dbSNP rs1805007](https://www.ncbi.nlm.nih.gov/snp/rs1805007) · [dbSNP rs11803731](https://www.ncbi.nlm.nih.gov/snp/rs11803731)
