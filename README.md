# Roots Local

*Explore your DNA. Offline.*

Roots Local is an open-source web app for analyzing MyHeritage raw DNA exports in your browser. Your file is read and analyzed on your device: nothing is uploaded. It matches selected genotypes against a versioned reference catalog and creates a PDF report with 17 chapters and 76 sections.

## Use in your browser

Open **[rootslocal.maximilianauer.at](https://rootslocal.maximilianauer.at)** in a current browser on a computer, iPhone, or Android phone. Select **View example**, choose **Open DNA file** (⌘O or Ctrl+O), or drag the [synthetic MyHeritage file](fixtures/synthetic-myheritage.txt) into the window. The overview answers what your DNA says, with a confidence level for each conclusion. Ask questions such as *Can I drink milk?* in **Ask your DNA**; answers come from the catalog rules in your browser. Your conclusions are grouped by area of life, from food to medicines, and the **Nucleus radar** shows how certain each one is. The **Medicine pass** collects drug-response findings on one page to show your physician. Press ⌘K or Ctrl+K to search findings, questions, genes, and commands. The **Atlas** shows every catalog marker on its chromosome. Open **PDF report** to preview or download the report. The app and PDF default to English; select **Deutsch** to switch both while keeping the current analysis.

After the first visit the app also works offline, and you can add it to your home screen. [Roots Local on maximilianauer.at](https://maximilianauer.at/projects/rootslocal/)

### Your data stays on your device

- Files are read by a background worker in your browser tab. There is no server, API, or upload.
- The page's Content Security Policy blocks direct network connections. Workers load the app's WebAssembly and fonts from the same host.
- The browser stores your language choice and caches the app's program files for offline use. Closing the tab clears the in-memory analysis.
- PDF reports and the medicine pass are created in your browser and saved as normal downloads.
- Automated tests fail on any request after start-up, on any request to another origin, and on stored data, and repeat the workflow offline. [Web app plan and enforcement](docs/web-plan.md)

**Check it yourself:** open the developer tools, select the Network tab, reload Roots Local, wait for the app and its offline cache to finish loading, and clear the list. Open your file and export a PDF. Or switch to airplane mode once the app has been cached. Every build includes [`SHA256SUMS`](https://rootslocal.maximilianauer.at/SHA256SUMS) for its output files. The in-app **Privacy** page explains the same steps and describes the technical connection data Cloudflare Pages processes when serving the files.

Roots Local does not replace a diagnosis. Medically relevant findings from consumer data need confirmation in a certified laboratory.

- [Product and technical audit](docs/audit/2026-11-17.md)
- [Audit verification and local LLM comparison](docs/audit/verification.md)
- [Web app plan](docs/web-plan.md)
- [Deployment and portfolio handover](docs/deployment.md)
- [Platform verification and remaining milestones](docs/test-status.md)
- [Report outline](docs/report-structure.md)
- [Implementation brief](docs/implementation-brief.md)
- [Product review and delivery plan](docs/product-plan.md)
- [Build and import reference catalogs](docs/catalogs.md)

## Build from source

Install stable Rust with the `wasm32-unknown-unknown` target, [wasm-bindgen-cli](https://github.com/rustwasm/wasm-bindgen) 0.2.100, [Binaryen](https://github.com/WebAssembly/binaryen) (`wasm-opt`), Node.js 22, and Python 3.13.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100 --locked
npm ci
npm run build:wasm
npm run build
npm run preview
```

`npm run build` writes the static site to `dist/`, adds Subresource Integrity, generates the service worker, and writes `dist/SHA256SUMS`. The [web workflow](.github/workflows/web.yml) runs the same steps with all tests.

The macOS desktop app (v0.2.0, Homebrew cask) was retired on 2026-11-15. Roots Local is now web only.

## What the app analyzes

- **Raw exports.** CSV, TSV, TXT, and ZIP with declared GRCh37 or GRCh38 assemblies. Unknown assemblies, missing markers, and conflicting entries remain unresolved.
- **Variant register.** Search by marker ID, exact coordinate, or inclusive range, such as `chr2:136600000-136650000`. Filter by chromosome or genotype status. Open a marker from a finding to inspect the matching rows and return to the finding.
- **Conclusions.** Catalog rules map genotypes to plain-language conclusions with a confidence level. Verified effect alleles turn single markers into copy-number statements, for example one copy of ALDH2*2. Medical conclusions about medicines and disease risk stay hidden until you switch on **Medical**.
- **Starter catalog.** Rules for lactase activity, earwax type, bitter taste, ACTN3, alcohol metabolism (ALDH2, ADH1B), pigmentation, APOE type, metabolizer types for CYP2C9, CYP2C19, TPMT, and CYP3A5, warfarin (VKORC1), thiopurines (NUDT15), and thrombophilia variants (factor V Leiden, prothrombin G20210A).
- **Data quality.** Missing, conflicting, and skipped rows, and an XX or XY pattern from X-chromosome heterozygosity. Data quality and scientific evidence are shown separately.
- **Companion data.** Import ancestry results, matches, or shared segments. Compare autosomal calls against one family file or assign alleles at individual markers using two parent files.
- **Maternal lineage.** Run the Haplogrep helper on a computer from a prepared mitochondrial profile (it needs Java, so it does not run in the browser). Import its candidates, tree version, and quality checks into the ancestry chapter. [Offline lineage workflow](docs/catalogs.md#maternal-lineage)
- **CRAM.** Measures catalog marker coverage using aligned reads and an uncompressed local FASTA with its .fai index, selected together. The files are read in slices, so large CRAMs need little memory. Checks the lengths and available MD5 values of the reference sequences used during decoding.
- **Clinical reference data.** Import local ClinVar VCF and ClinGen gene–disease validity CSV files. The report displays matched variant classifications and gene–disease evidence with their sources. [Reference downloads and matching rules](docs/catalogs.md)
- **GWAS research.** Optional local packages associate matching loci with published studies, samples, and reported effects.
- **Polygenic research.** Signed catalog packages can contain additive scores. The app requires complete marker coverage and displays a raw score without personal disease-risk calibration.
- **PDF export.** Full and summary reports, clickable contents, sources, and coverage. Names, explicit genotype details, and imported ClinVar and ClinGen annotations are optional. The full report shows sections that have no applicable rule.

Raw DNA stays in the active browser tab. The downloaded PDF may be synchronized by other software, depending on your download folder. Clinically relevant findings from consumer data require independent clinical confirmation.

## Tests

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
ROOTS_TEST_PYTHON=python3 cargo test --locked -p roots-core -p roots-pdf
npm run build:wasm && npm run build
ROOTS_TEST_PYTHON=python3 npm run test:e2e
```

`ROOTS_TEST_PYTHON` names a Python interpreter with `pypdf` installed; it enables the PDF content checks. The Playwright suite in `e2e/` runs against the production build in Chromium, WebKit, and iPhone and Pixel emulation. Please use synthetic data in GitHub issues, pull requests, and CI.

## License

[Apache 2.0](LICENSE) covers the project code. External components and datasets retain their respective terms. [Third-party notices](licenses/README.md)
