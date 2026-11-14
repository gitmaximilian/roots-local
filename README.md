# Roots Local

*Explore your DNA. Offline.*

Roots Local is an open-source desktop app for analyzing MyHeritage raw DNA exports on your own computer. It matches selected genotypes against a versioned reference catalog and creates a PDF report with 17 chapters and 76 sections.

## Try it

Open the app and select **View example** or import the [synthetic MyHeritage file](fixtures/synthetic-myheritage.txt). Open **PDF report** to preview or save the report locally. The app and PDF default to English. Select **Deutsch** from the language menu to switch both while keeping the current analysis.

- [Platform verification and remaining milestones](docs/test-status.md)
- [Report outline](docs/report-structure.md)
- [Implementation brief](docs/implementation-brief.md)
- [Build and import reference catalogs](docs/catalogs.md)

## Build from source

Install the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/), stable Rust, Node.js 22, and Python 3.13. Use `python` in place of `python3` on Windows if needed. The initial build downloads dependencies and verifies the bundled Typst compiler with SHA-256. The installed app imports files, previews reports, and exports PDFs offline.

```sh
npm ci
python3 scripts/prepare_tools.py
npm run tauri -- dev
```

Use `npm run tauri -- build --bundles app` for macOS. The script `scripts/package_macos.sh` creates a DMG from the app bundle. Use `npm run tauri -- build --bundles nsis` on the target Windows architecture. See the [build matrix](.github/workflows/desktop.yml) for the exact targets and available artifacts.

## What the app analyzes

- **Raw exports.** CSV, TSV, TXT, and ZIP with declared GRCh37 or GRCh38 assemblies. Unknown assemblies, missing markers, and conflicting entries remain unresolved.
- **Variant register.** Search by marker ID, exact coordinate, or inclusive range, such as `chr2:136600000-136650000`. Filter by chromosome or genotype status. Open a marker from a finding to inspect the matching rows and return to the finding.
- **Starter catalog.** Rules for lactase activity, earwax type, bitter taste, and ACTN3 alongside selected studies. Data quality and scientific evidence are shown separately.
- **Companion data.** Manually entered ancestry results, match and shared segment lists, and comparison of autosomal alleles against a family file.
- **CRAM.** Measures catalog marker coverage using aligned reads and a matching, indexed local FASTA. Genotype and haplogroup inference are pending.
- **GWAS research.** Optional local packages associate matching loci with published studies, samples, and reported effects.
- **Polygenic research.** Signed catalog packages can contain additive scores. The app requires complete marker coverage and displays a raw score without personal disease-risk calibration.
- **PDF export.** Full and summary reports, clickable contents, sources, and coverage. Names and explicit genotypes are optional. The full report shows sections that have no applicable rule.

Raw DNA stays in the active session. PDF generation uses a temporary directory and cleans it up after rendering. The chosen PDF destination may be synchronized by other software. Clinically relevant findings from consumer data require independent clinical confirmation.

## Tests

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
npm run build
```

Set `ROOTS_TEST_TYPST` to the absolute path of the prepared Typst binary to include PDF rendering tests. Please use synthetic data in GitHub issues, pull requests, and CI.

## License

[Apache 2.0](LICENSE) covers the project code. External components and datasets retain their respective terms. [Third-party notices](licenses/README.md)
