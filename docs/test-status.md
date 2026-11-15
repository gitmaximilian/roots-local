# Implementation and test status

| Platform | Verified |
|---|---|
| **MacBook Air M4, macOS 15.6.1** | Native app built and installed. Imported a synthetic MyHeritage file with the native dialog, inspected results, previewed the full report, and exported a PDF. |
| **M4 with network access denied** | Used the installed debug bundle with `--verify-offline` to evaluate synthetic data. Tested the native file import, preview, and export. The app process and spawned helpers were covered by the restriction. Independent macOS WebKit services were not separately instrumented. |
| **CI, macOS 15 ARM64** | [CI run 43673110939](https://github.com/gitmaximilian/roots-local/actions/runs/43673110939) at `883d0ed` built and tested the macOS ARM64 app and bilingual PDFs. |
| **Scope** | Roots Local supports macOS 15.6 or later on Apple Silicon only. Windows and Intel builds were removed on 2026-11-15. |

English is the default for the app and its PDF report. The language switch was tested in the native M4 app with the same synthetic profile, and the German PDF preview rendered with network access denied. Verified exports in both languages contained 24 pages, 17 chapters, 76 sections, and 151 links. The starter reference report included embedded fonts. Representative pages were visually inspected. On the M4, the debug smoke test imported 700,015 synthetic rows and exported a PDF in 2.84 seconds, with approximately 165 MiB peak RSS. The benchmark used the command-line harness.

The native M4 app imported 116 synthetic rows with the network restriction enabled. The variant register paginated the file, returned both conflicting calls for an inclusive region and an exact coordinate, and found the separate row with no genotype. The finding-to-marker link and its return action worked, and switching between English and German preserved the active search or filter.

The native M4 app also imported the public ClinVar GRCh37 VCF dated 2026-11-08 and the ClinGen gene–disease validity CSV dated 2026-11-15 while the app's network access was denied. The synthetic profile matched one ClinVar record and one separate ClinGen curation. The two-parent import assigned A and G at the synthetic `rs4988235` site. The extended reports in both languages had 25 pages, 17 chapters, 76 sections, and 162 links.

The full CRAM import test used a synthetic CRAM and indexed FASTA. It accepted the matching reference, counted the expected bases after filtering, and rejected a same-length FASTA with a different checksum.

An independent run used HTSlib through pysam 0.23.3 to write an indexed synthetic CRAM and compare its pileup with the Roots Local report. Both decoders reported depth 2 at each test site. Bases were C 1 and G 1 at chr22:2 and T 2 at chr22:4. The comparison excluded low base quality, low or unknown mapping quality, duplicate, and supplementary reads. [Reproducible comparison script](../scripts/verify_cram_reference.py)

The pinned Haplogrep 3 workflow ran under denied network access on the M4 using a public rCRS HSD example. The summary showed H100 at 0.8351, H at 0.8054, and one upstream quality warning. The installed app imported the summary and previewed the report with explicit inclusion. Report tests cover both languages and lengths and verify that the lineage and clinical inclusion options act independently. Assay validation and direct mitochondrial or Y-DNA prediction from the MyHeritage kit export remain open.

The PDF content checks cover 16 combinations of language, report format, clinical annotation selection, and allele detail selection. They verify the clinical inclusion choices and both complete and incomplete research score output, including when the score and a separate finding share the same section. In the native M4 app with network access denied, the exported PDF contained the ClinVar record only after opt-in. A synthetic file without assembly metadata remained available in the variant register and produced no trait interpretations.

## Milestones

1. **Offline workflow.** Import, analysis, chapter navigation, preview, and full report work on synthetic genotypes. Four personal trait rules and selected research associations are available.
2. **Catalog breadth.** All chapters, search, filters, coverage, signed packages, and basic ancestry, match, and segment imports are available. The GWAS importer was verified against a full EMBL-EBI export. Its test package contained 4,153 associations across 46 topics. The installed M4 app matched 52 supplemental associations and rendered a 41-page preview. The app imports local ClinVar VCF and ClinGen gene–disease validity CSV files. Four additional marker rules link CYP2C19, DPYD, and CYP3A5 to CPIC sources. More curated coverage remains open. Companion CSV fixtures are synthetic and export schemas may vary.
3. **Sequencing and family.** CRAM coverage agrees with HTSlib on the synthetic fixture. The decoder checks reference length and available MD5 values when requesting FASTA sequences. The family comparison reports shared autosomal alleles and an exploratory KING coefficient when at least 10,000 eligible markers span at least 20 autosomes. The two-parent comparison counts Mendelian inconsistencies and resolves individual autosomal sites when one assignment fits. Prepared rCRS mitochondrial profiles can be classified with the local Haplogrep workflow. Long-range phasing, MyHeritage-specific lineage and CRAM validation, Y-DNA calling, and relationship-degree validation remain open.
4. **Advanced interpretation.** TAS2R38 homozygous combinations and uniquely phased AVI/PAV from two parent files, strict additive research scores, and selected gene–drug study links are available. Complex clinically validated haplotypes, copy-number analysis, broader pharmacogenetics, and calibrated disease risks are pending.
5. **Packages.** The native macOS app and DMG were built and checked. Releases are distributed through a Homebrew cask with ad-hoc signed builds.

## Verification log

**2026-11-15, commit `883d0ed`, MacBook Air M4, macOS 15.6.1.** Local checks: 5 Python tests and 18 Rust tests (4 unit, 14 integration) passed. Baseline PDFs from CI run 43673110939 passed `scripts/verify_pdf.py` with 26 pages, 17 chapters, 76 sections, and 165 links each. Windows acceptance was dropped when the project moved to Apple Silicon only.

**2026-11-15, branch `redesign/native-mac`, MacBook Air M4, macOS 15.6.1.** 5 Python tests and 18 Rust tests passed, including the PDF content check across 16 language, length, and privacy combinations. It now also asserts that conclusions appear and that medical conclusions follow the clinical opt-in. Full reports in both languages passed `scripts/verify_pdf.py` with 27 pages, 17 chapters, 76 sections, and 167 links. The debug app bundle was built with an ad-hoc signature, passed `codesign --verify --deep --strict`, was installed, and started under `--verify-offline` with its main window open. The new interface was exercised in a browser against a model exported by `roots-check --model-json`: overview conclusions, the medical toggle, the inspector, the command palette, the Atlas, light and dark appearance, and the German locale with the active profile preserved. The native menu and Finder drag and drop were not exercised interactively.

**2026-11-15, catalog 1.4.0 and version 0.2.0, MacBook Air M4, macOS 15.6.1.** 5 Python tests and 20 Rust tests passed. New tests cover APOE, CYP2C9, CYP2C19, and TPMT combinations including unresolved patterns, the X heterozygosity check, and reverse-strand complementing. New effect alleles were checked against the NCBI dbSNP record of each marker. The release app bundle was built, ad-hoc signed, and passed `codesign --verify --deep --strict`. Its DMG was installed through a local Homebrew 7.0.13 tap with the release cask. The installed app had no quarantine flag, kept a valid signature, and launched. `spctl` rejects the app as expected without notarization.

**2026-11-15, life areas, Ask your DNA, Nucleus radar, and Medicine pass.** 5 Python tests and 21 Rust tests passed. A new test renders the medicine pass without a separate clinical opt-in and checks that it has one page, lists the drug-response conclusions, and leaves out non-medical findings. In the browser QA page, 12 typed questions were matched: 11 reached the expected finding and an unrelated question returned the no-rule message. Overview, area filter, radar, pass, and the German locale were checked visually in light and dark. The debug bundle was rebuilt, ad-hoc signed, installed, and started under `--verify-offline`.

**2026-11-15, release v0.2.0.** The [release workflow](https://github.com/gitmaximilian/roots-local/actions/runs/43716508969) built and published [v0.2.0](https://github.com/gitmaximilian/roots-local/releases/tag/v0.2.0). The DMG matched its published SHA-256. The cask was added to `gitmaximilian/homebrew-tap` through a reviewed pull request whose checks passed. `brew install --cask gitmaximilian/tap/roots-local` with Homebrew 7.0.13 downloaded the release, removed the quarantine flag, kept a valid ad-hoc signature, installed version 0.2.0, and the app launched. The test installation was removed afterwards.

**Blocked on external input:**

| Step | Waiting for |
|---|---|
| Provider data validation | An authorized MyHeritage tabular export and a WGS CRAM with its matching indexed FASTA |
| Native menu and drag-and-drop check | A person using the installed app on the Mac |
| Further inference validation | Assay benchmarks, known pedigrees, validated clinical diplotype and copy-number references, and suitable risk calibration data |

Tests use synthetic genotype data. The repository contains no personal DNA files.

## Release acceptance

On an Apple Silicon Mac with networking disabled, mount the built DMG, copy the app into Applications, import the synthetic raw file, and preview and export the full PDF in both languages. Replace it with a newer build, repeat the export, and remove it. For a release, install through the Homebrew cask instead and confirm the checksum, `codesign --verify --deep --strict`, and that the app opens. [Distribution](distribution.md)

For provider CRAM acceptance, use the desktop workflow or pass `--cram <CRAM> <indexed FASTA>` to `roots-check` alongside the raw DNA file and PDF destination. The tool prints aggregate coverage and exports the per-site depth from the active catalog. Add `--include-calls` to include per-base counts in that local test report. Record the reference identifier, build, and expected coverage at selected positions using an independent decoder.

To rerun the synthetic comparison, install `pysam==0.23.3` and `pypdf==7.1.0` in a test environment. Build the `roots-check` example, then run `python scripts/verify_cram_reference.py --roots-check <binary> --typst <binary> --openssl <OpenSSL 3 binary>`. The fixture, Ed25519 key for the test catalog, and report are temporary.
