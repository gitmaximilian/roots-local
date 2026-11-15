# Roots Local

*Explore your DNA. Offline.*

Roots Local is an open-source desktop app for analyzing MyHeritage raw DNA exports on your own computer. It matches selected genotypes against a versioned reference catalog and creates a PDF report with 17 chapters and 76 sections.

## Try it

Open the app and select **View example**, choose **File › Open DNA File…** (⌘O), or drag the [synthetic MyHeritage file](fixtures/synthetic-myheritage.txt) into the window. The overview answers what your DNA says, with a confidence level for each conclusion. Press ⌘K to search findings, genes, markers, and commands. The **Atlas** shows every catalog marker on its chromosome. Open **PDF report** to preview or save the report locally. The app and PDF default to English. Select **Deutsch** from the language menu to switch both while keeping the current analysis.

- [Platform verification and remaining milestones](docs/test-status.md)
- [Report outline](docs/report-structure.md)
- [Implementation brief](docs/implementation-brief.md)
- [Product review and delivery plan](docs/product-plan.md)
- [Build and import reference catalogs](docs/catalogs.md)

## Install

```sh
brew install --cask gitmaximilian/tap/roots-local
```

Roots Local needs an Apple Silicon Mac with macOS 15.6 or later. Builds are signed ad hoc and not notarized, so the cask clears the download quarantine flag after installing. [Distribution and verification](docs/distribution.md)

## Build from source

Roots Local runs on macOS 15.6 or later on Apple Silicon. Install the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/), stable Rust, Node.js 22, and Python 3.13. The initial build downloads dependencies and verifies the bundled Typst compiler with SHA-256. The installed app imports files, previews reports, and exports PDFs offline.

```sh
npm ci
python3 scripts/prepare_tools.py
npm run tauri -- dev
```

Use `npm run tauri -- build --bundles app` for macOS. The script `scripts/package_macos.sh` creates a DMG from the app bundle. See the [CI workflow](.github/workflows/desktop.yml) for the build steps and artifacts.

## What the app analyzes

- **Raw exports.** CSV, TSV, TXT, and ZIP with declared GRCh37 or GRCh38 assemblies. Unknown assemblies, missing markers, and conflicting entries remain unresolved.
- **Variant register.** Search by marker ID, exact coordinate, or inclusive range, such as `chr2:136600000-136650000`. Filter by chromosome or genotype status. Open a marker from a finding to inspect the matching rows and return to the finding.
- **Conclusions.** Catalog rules map genotypes to plain-language conclusions with a confidence level. Verified effect alleles turn single markers into copy-number statements, for example one copy of ALDH2*2. Medical conclusions about medicines and disease risk stay hidden until you switch on **Medical**.
- **Starter catalog.** Rules for lactase activity, earwax type, bitter taste, ACTN3, alcohol metabolism (ALDH2, ADH1B), pigmentation, APOE type, metabolizer types for CYP2C9, CYP2C19, TPMT, and CYP3A5, warfarin (VKORC1), thiopurines (NUDT15), and thrombophilia variants (factor V Leiden, prothrombin G20210A).
- **Data quality.** Missing, conflicting, and skipped rows, and an XX or XY pattern from X-chromosome heterozygosity. Data quality and scientific evidence are shown separately.
- **Companion data.** Import ancestry results, matches, or shared segments. Compare autosomal calls against one family file or assign alleles at individual markers using two parent files.
- **Maternal lineage.** Run the local Haplogrep helper from a prepared mitochondrial profile. Import its candidates, tree version, and quality checks into the ancestry chapter. [Offline lineage workflow](docs/catalogs.md#maternal-lineage)
- **CRAM.** Measures catalog marker coverage using aligned reads and an indexed local FASTA. Checks the lengths and available MD5 values of the reference sequences used during decoding.
- **Clinical reference data.** Import local ClinVar VCF and ClinGen gene–disease validity CSV files. The report displays matched variant classifications and gene–disease evidence with their sources. [Reference downloads and matching rules](docs/catalogs.md)
- **GWAS research.** Optional local packages associate matching loci with published studies, samples, and reported effects.
- **Polygenic research.** Signed catalog packages can contain additive scores. The app requires complete marker coverage and displays a raw score without personal disease-risk calibration.
- **PDF export.** Full and summary reports, clickable contents, sources, and coverage. Names, explicit genotype details, and imported ClinVar and ClinGen annotations are optional. The full report shows sections that have no applicable rule.

Raw DNA stays in the active session. PDF generation uses a temporary directory and cleans it up after rendering. The chosen PDF destination may be synchronized by other software. Clinically relevant findings from consumer data require independent clinical confirmation.

## Tests

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
npm run build
```

Set `ROOTS_TEST_TYPST` to the absolute path of the prepared Typst binary to include PDF rendering tests. Set `ROOTS_TEST_PYTHON` to a Python interpreter with `pypdf` installed to also verify exported content in both languages. Please use synthetic data in GitHub issues, pull requests, and CI.

## License

[Apache 2.0](LICENSE) covers the project code. External components and datasets retain their respective terms. [Third-party notices](licenses/README.md)
