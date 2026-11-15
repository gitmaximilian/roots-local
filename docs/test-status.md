# Implementation and test status

| Platform | Verified |
|---|---|
| **MacBook Air M4, macOS 15.6.1** | Native app built and installed. Imported a synthetic MyHeritage file with the native dialog, inspected results, previewed the full report, and exported a PDF. |
| **M4 with network access denied** | Used the installed debug bundle with `--verify-offline` to evaluate synthetic data. Tested the native file import, preview, and export. The app process and spawned helpers were covered by the restriction. Independent macOS WebKit services were not separately instrumented. |
| **Windows x64 and ARM64** | Native core and bilingual PDF tests passed on both [GitHub Actions runners](https://github.com/gitmaximilian/roots-local/actions/runs/43650151290), and both NSIS installers were built for that revision. Interactive offline Windows installation, update, and removal remain unverified. |
| **Older macOS versions and Intel** | The configured macOS minimum is 15.6. Earlier releases and Intel Macs have not been tested. |

English is the default for the app and its PDF report. The language switch was tested in the native M4 app with the same synthetic profile, and the German PDF preview rendered with network access denied. Verified exports in both languages contained 24 pages, 17 chapters, 76 sections, and 151 links. The starter reference report included embedded fonts. Representative pages were visually inspected. On the M4, the debug smoke test imported 700,015 synthetic rows and exported a PDF in 2.84 seconds, with approximately 165 MiB peak RSS. The benchmark used the command-line harness.

The native M4 app imported 116 synthetic rows with the network restriction enabled. The variant register paginated the file, returned both conflicting calls for an inclusive region and an exact coordinate, and found the separate row with no genotype. The finding-to-marker link and its return action worked, and switching between English and German preserved the active search or filter.

## Milestones

1. **Offline workflow.** Import, analysis, chapter navigation, preview, and full report work on synthetic genotypes. Four personal trait rules and selected research associations are available.
2. **Catalog breadth.** All chapters, search, filters, coverage, signed packages, and basic ancestry, match, and segment imports are available. The GWAS importer was verified against a full EMBL-EBI export. Its test package contained 4,153 associations across 46 topics. The installed M4 app matched 52 supplemental associations and rendered a 41-page preview. The app imports local ClinVar VCF and ClinGen gene–disease validity CSV files. Four additional marker rules link CYP2C19, DPYD, and CYP3A5 to CPIC sources. More curated coverage remains open. Companion CSV fixtures are synthetic and export schemas may vary.
3. **Sequencing and family.** CRAM coverage was tested against synthetic reads. The decoder checks reference length and available MD5 values when requesting FASTA sequences. The family comparison reports shared autosomal alleles and an exploratory KING coefficient when at least 10,000 eligible markers span at least 20 autosomes. The two-parent comparison counts Mendelian inconsistencies and resolves individual autosomal sites when one assignment fits. Long-range phasing, haplogroup calling, relationship-degree validation, and validation with a MyHeritage CRAM remain open.
4. **Advanced interpretation.** TAS2R38 homozygous combinations, strict additive research scores, and selected gene–drug study links are available. Complex clinically validated haplotypes, copy-number analysis, broader pharmacogenetics, and calibrated disease risks are pending.
5. **Packages.** The native macOS app and DMG were built and checked. Separate Windows installers are available as CI artifacts. The Windows workflow includes silent installation, same-version reinstallation, execution of the bundled Typst binary, and removal. The local Windows VM failed to start with a duplicate QEMU framebuffer error. Interactive Windows acceptance and signed release builds remain open.

Tests use synthetic genotype data. The repository contains no personal DNA files.
