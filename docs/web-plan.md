# Web app plan

Roots Local is a static web app at [rootslocal.maximilianauer.at](https://rootslocal.maximilianauer.at/). It replaces the macOS desktop app, retired on 2026-11-15. See [deployment and maintenance](deployment.md) for live checks, the Cloudflare configuration and rollout history.

## Rule zero: data stays on the device

DNA files, companion files, results, names, and exports never leave the user's device. This is enforced by the browser and checked by automated tests, not only promised.

| Guarantee | Enforcement |
|---|---|
| No upload | Files are read in a Web Worker with `FileReaderSync` from the `File` objects the user picked or dropped. There is no server endpoint, API, backend, or form with a target. |
| Network restricted | The document's CSP meta tag sets `connect-src 'none'`. The HTTP CSP in `public/_headers` allows the workers to fetch same-origin assets and sets `frame-ancestors 'none'`. Both policies permit same-origin scripts and styles plus WebAssembly. |
| No third parties | No CDN, web fonts, analytics, error tracking, or external images. Fonts, catalog, Typst compiler, and templates ship with the app. |
| Local storage | The app stores the language choice in `localStorage` and caches its own static files. Analysis and personal inputs remain in memory. Exports persist as user-controlled downloads. |
| Local exports | PDF report and medicine pass are compiled in the worker and saved through a `blob:` download. |
| Minimal server | Cloudflare Pages delivers static files and processes technical connection data. Its network error reporting settings are verified separately from the app's own request behavior. |
| Verifiable | Apache-2.0 source, a locked build, Subresource Integrity on the page's scripts and stylesheet, integrity checks on each precached asset, and `SHA256SUMS` for every build file. The in-app privacy page explains how to check it. |
| Proven | `e2e/privacy.spec.ts` fails on any request to another origin, on any request after start-up, on any stored data, and runs the full workflow offline. |

The workers need `connect-src 'self'` while fetching the WebAssembly modules, report fonts, and precache files. The tests wait for both engines to load and the service worker to take control before importing any data. The tests then check requests during analysis and export. The browser can check for a service worker update when navigating to the app.

**Opt-in profile storage** ("save profile on this device", encrypted with a passphrase-derived Web Crypto key, with a visible delete action) is not implemented. If it is added, it must be off by default and covered by the storage test.

## Architecture

```
crates/roots-core      parsing, catalog, analysis, report data   (no I/O, no Typst)
crates/roots-pdf       Typst 0.15.1 World with in-memory template, data, fonts
crates/roots-wasm      wasm-bindgen session for the worker        (~1 MB)
crates/roots-pdf-wasm  wasm-bindgen PDF renderer for the worker   (~22 MB)
src/worker.ts          loads both modules, owns the session, reads files
src/platform.ts        page side: worker calls, file picker, drop, download, service worker
src/main.tsx …         React interface (unchanged views, plus phone layout and privacy page)
```

- **One Rust core.** `roots-core` works on readers (`Read`, `Read + Seek`) and byte slices. It has no Tauri, SQLite, processes, or file system access. Native tests and the `roots-check` example open files and pass readers; the web passes a `BlobReader` over `FileReaderSync`.
- **Catalog without SQLite.** Markers and traits are validated, sorted, and indexed in `HashMap`s by rsID and by `(build, position)`. Ed25519 signatures, manifest, and SHA-256 checksums are still verified in Rust.
- **PDF in the browser.** The Typst library is compiled into `roots-pdf-wasm` with a `World` that only exposes the template, `report.json`, and ten font files. Chosen over typst.ts because it is the same compiler version the desktop used (0.15.1), needs no JavaScript runtime package or remote package loading, and produces text-identical output to the previous CLI rendering for all baseline reports (verified with pypdf). The module is 22 MB (6.4 MB with Brotli), below Cloudflare Pages' 25 MiB per-file limit. Fonts: Libertinus Serif and DejaVu Sans Mono, copied unchanged from `typst-assets` 0.15.1 into `fonts/`. The New Computer Modern fonts were dropped; the templates never use them, but characters missing from Libertinus would now fall back to DejaVu Sans Mono instead.
- **Background execution.** Import, analysis, variant queries, and PDF compilation run in a dedicated module worker. Progress is reported per chunk read. Cancellation uses a `SharedArrayBuffer` flag (needs cross-origin isolation, provided by `COOP: same-origin` and `COEP: require-corp`); the worker polls it while reading.
- **Platform adapter.** `platform.ts` replaces Tauri `invoke`, native dialogs, menu events, and drag and drop. Keyboard shortcuts ⌘/Ctrl+O and ⌘/Ctrl+E replace the native menu.

## Phone layout

At widths up to 760 px the sidebar becomes a sheet opened from a menu button, the inspector a full-screen sheet, and grids collapse to one column. Touch devices get targets of at least 44 px and 16 px form fields (no iOS zoom). Safe-area insets are respected with `viewport-fit=cover`. Required browsers: iOS Safari and Android Chrome.

## PWA

`manifest.webmanifest`, icons from the app logo (192, 512, maskable 512, Apple touch 180, SVG). `scripts/finalize.mjs` writes `sw.js` with each static URL and its SHA-256 integrity value. The worker downloads files in batches, retries a failed download once, and removes a partial cache if installation fails. It serves same-origin GET requests and deletes old caches on activation. A new version waits for the user to choose **Reload**.

## Feature scope

| Feature | Desktop 0.2.0 | Web |
|---|---|---|
| Import CSV, TSV, TXT, ZIP | ✓ | ✓ streamed from the `File` |
| Analysis, Ask your DNA, Nucleus radar, life areas, Atlas, chapters, variants | ✓ | ✓ same Rust core |
| Full and summary PDF, medicine pass | ✓ | ✓ Typst in WebAssembly, saved as download |
| Signed catalog packages | ✓ | ✓ |
| ClinVar VCF (plain or gzip) and ClinGen CSV | ✓ | ✓ |
| Family file, two parent files | ✓ | ✓ (both parent files picked together) |
| CRAM with indexed FASTA | ✓ (FASTA plain or bgzip) | ✓ uncompressed FASTA plus `.fai`, picked together; read with random access through `File.slice`, so memory stays bounded |
| Haplogrep classification | ✓ helper with Java | ✗ needs Java. Importing a finished Haplogrep summary works. |
| Native menu, Finder drag and drop | ✓ | Replaced by keyboard shortcuts and browser drag and drop |

## Hosting

Cloudflare Pages project `rootslocal` with custom domain `rootslocal.maximilianauer.at`, the same pattern as Rookie (`chess.`) and Pacepact (`pacepact.`). Headers come from `public/_headers`: CSP, HSTS, `COOP: same-origin`, `COEP: require-corp`, `CORP: same-origin`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a `Permissions-Policy` that disables camera, microphone, geolocation, sensors, payment, USB, and similar APIs. The mail DNS records of the domain are not touched.

## Build and deploy

```sh
npm ci
npm run build:wasm     # scripts/build_wasm.sh: cargo, wasm-bindgen 0.2.100, wasm-opt -Oz
npm run build          # tsc, vite, scripts/finalize.mjs (SRI, sw.js, SHA256SUMS)
npm run test:e2e       # Playwright privacy suite against the production build
```

The [web workflow](../.github/workflows/web.yml) runs the Rust and Python tests, builds the web app, runs the privacy suite, and uploads `dist/` with `SHA256SUMS` as an artifact. Deployment to Cloudflare Pages is a separate manual step after approval.

The existing Pages project `rootslocal` can receive a Direct Upload on `main`. Associate `rootslocal.maximilianauer.at` through the Pages custom-domain settings and wait for DNS and TLS activation. Verify the live response headers, checksums, and complete privacy suite against the custom domain before publishing the portfolio links. Check for `NEL`, `Report-To`, and `Reporting-Endpoints` on both the document and its workers. Cloudflare can add those headers outside the application. If they persist on the custom host, inspect the Cloudflare zone's Network Error Logging setting before any zone-wide change.

## Milestones

| # | Milestone | Acceptance |
|---|---|---|
| 1 | Core crate extracted | `cargo test -p roots-core` passes; Tauri removed |
| 2 | Catalog without SQLite | Model JSON for the synthetic fixture byte-identical to 0.2.0 in English and German |
| 3 | WebAssembly build and worker | Both modules build for `wasm32-unknown-unknown`; import and analysis run in the worker |
| 4 | Platform adapter | No `@tauri-apps` dependency; picker, drop, download, cancel work in the browser |
| 5 | PDF in the browser | Report EN/DE and pass from the browser pass `scripts/verify_pdf.py`; text identical to 0.2.0 except the version |
| 6 | Phone layout | Screenshots at iPhone width, light and dark, EN and DE; workflow test passes in iPhone and Pixel emulation |
| 7 | PWA and offline | Offline test passes after the first visit |
| 8 | Privacy tests | `e2e/privacy.spec.ts` passes in Chromium and WebKit |
| 9 | Hosting | Live headers documented with `curl -I` |
| 10 | Project page | Roots Local listed on `maximilianauer.at/projects/` with detail page and legal text |
