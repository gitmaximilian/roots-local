# Implementation and test status

| Platform | Verified |
|---|---|
| **MacBook Air M4, macOS 15.6.1** | Native app built and installed. Imported a synthetic MyHeritage file with the native dialog, inspected results, previewed the full report, and exported a PDF. |
| **M4 with network access denied** | Used the installed debug bundle with `--verify-offline` to evaluate synthetic data. Tested the native file import, preview, and export. The app process and spawned helpers were covered by the restriction. Independent macOS WebKit services were not separately instrumented. |
| **Windows x64 and ARM64** | The [verified Windows run](https://github.com/gitmaximilian/roots-local/actions/runs/43669395976) tested native builds, bilingual PDFs, installation, same-version reinstallation, app startup, PDF generation with the installed Typst binary, and uninstall. Interactive offline Windows acceptance remains open. |
| **Older macOS versions and Intel** | The configured macOS minimum is 15.6. Earlier releases and Intel Macs have not been tested. |

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
5. **Packages.** The native macOS app and DMG were built and checked. Separate Windows installers are available as CI artifacts. The Windows workflow includes silent installation, same-version reinstallation, execution of the bundled Typst binary, and removal. The local ARM64 Windows VM reached its sign-in screen after removing one duplicate virtual display device. Interactive Windows acceptance and signed release builds remain open.

Tests use synthetic genotype data. The repository contains no personal DNA files.

## Release acceptance

On each Windows architecture, boot a Windows desktop with no internet access. Install from the NSIS artifact, then open the app, import the synthetic raw file, and preview and export the full PDF in both languages. Run a newer installer over the existing installation, repeat the PDF export, and verify removal through Windows Settings. Use a clean VM without an existing Evergreen WebView2 runtime to exercise the installer payload.

On Apple Silicon, mount the built DMG and copy the app into Applications. A signed release requires a Developer ID Application identity and Apple notarization credentials. Use Tauri's signing configuration for the app bundle and staple the notarization ticket to the distribution package. Windows release signing requires a configured signing service or Authenticode identity. Verify the signatures and regenerate the installer checksums from the signed artifacts. [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/) · [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/)

For provider CRAM acceptance, use the desktop workflow or pass `--cram <CRAM> <indexed FASTA>` to `roots-check` alongside the raw DNA file and PDF destination. The tool prints aggregate coverage and exports the per-site depth from the active catalog. Add `--include-calls` to include per-base counts in that local test report. Record the reference identifier, build, and expected coverage at selected positions using an independent decoder.

To rerun the synthetic comparison, install `pysam==0.23.3` and `pypdf==7.1.0` in a test environment. Build the `roots-check` example, then run `python scripts/verify_cram_reference.py --roots-check <binary> --typst <binary> --openssl <OpenSSL 3 binary>`. The fixture, Ed25519 key for the test catalog, and report are temporary.
