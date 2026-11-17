# Implementation and test status

Roots Local is a web app. The macOS desktop app (v0.2.0) was retired on 2026-11-15; its verification history is in the git log up to commit `d654f65`.

| Check | Result |
|---|---|
| Rust core and PDF renderer | 21 tests (4 unit, 17 integration) including PDF content checks across 16 language, length, and privacy combinations, rendered with the same Typst crate and fonts as the browser |
| Web ↔ native parity | `scripts/parity.mjs`: the analysis model from the shipped WebAssembly is byte-identical to the native core; full report EN and DE, summary report, and medicine pass have identical text |
| 0.2.0 ↔ 0.3.0 | Model JSON for the synthetic fixture byte-identical in EN and DE; PDF text identical on all pages except the version number |
| Privacy suite | `e2e/privacy.spec.ts`, 8 runs: Chromium, WebKit, iPhone 15 and Pixel 7 emulation, each online and offline |
| CRAM in the browser | `e2e/cram.spec.ts`: synthetic CRAM, FASTA, and `.fai` decoded in the worker in all four configurations without any request |
| Python | 5 tests for the GWAS importer and Haplogrep helper |

## Verification log

**2026-11-17, inherited deployment.** The Pages project `rootslocal` already serves build `6b1a0dd0be00d2c1` at [rootslocal.pages.dev](https://rootslocal.pages.dev/), deployment `a2cab228`. The planned custom domain has no DNS response. On the existing deployment, 10 of 12 browser checks passed. The offline cases in Desktop Chromium and Pixel emulation failed while waiting for the service worker to take control. Chromium reported a network failure during `Cache.addAll()`. The Pages endpoint also sends Cloudflare's `NEL` and `Report-To` headers.

**2026-11-17, local release candidate.** Rebuilt both WebAssembly modules. Their SHA-256 hashes matched the previous deployment. Repeated the frontend build with the same toolchain and got matching output checksums. Rust 1.99.1, wasm-bindgen 0.2.100, Binaryen 133 and Node.js 23.11.0 were used for the local build. Rust tests (21), Python tests (5) and parity checks (5) passed. The Chromium and Pixel regression injects a connection reset during precaching and verifies that the failed asset is requested again and the offline cache then activates. The release candidate remains local pending approval of the production destination.

- Build `9697c896d2e990f2` passed all 12 browser checks against local Cloudflare Pages emulation with the production `_headers`. In first-visit testing, WebKit sometimes activates the worker without attaching it to the initial page. The suite waits for activation and reloads while online if a controller is missing. The WebKit offline tests still use the built-in synthetic profile because Playwright's offline emulation blocks file selection and reloads.
- The portfolio preview includes the fourth card, the bilingual detail page and the Roots Local privacy section. The English and German links and images were checked at 390 and 1280 pixels. All three prior project cards matched production.
- Still open for release: verify the custom domain and its Cloudflare response headers, test with physical iPhone and Android devices, and confirm the regulatory status of the medicine-pass feature for its intended use.

**2026-11-15, branch `web/local-only`, MacBook Air M4, macOS 15.6.1.**

- `cargo test -p roots-core -p roots-pdf` with `ROOTS_TEST_PYTHON`: 21 passed.
- `npm run build:wasm && npm run build`: analysis module 1.06 MB (337 KB Brotli), PDF module 21.95 MB (6.4 MB Brotli), below the 25 MiB Cloudflare Pages file limit.
- `npm run test:parity`: all five comparisons identical.
- `npm run test:e2e`: 12 passed. The privacy test proves that the recorder sees the worker's requests (both engines appear during start-up), that no request follows start-up, that no request goes to another origin, and that only `roots-local-language` is stored. Full reports in both languages from the browser pass `scripts/verify_pdf.py` (17 chapters, 76 sections).
- WebKit limits in Playwright: its offline emulation cannot reload a page and also blocks reading picked files, so the WebKit offline run keeps the loaded page and analyzes the built-in example. Chromium and Pixel run the cold offline start with the real file. Screenshot captures inject a style that WebKit reports as a CSP violation; that is Playwright, not the app.

### Performance

A synthetic file with 700,015 rows (24.6 MB CSV), production build:

| Browser | Engines ready | Import 700k rows | PDF export |
|---|---|---|---|
| Chromium, desktop | 79 ms analysis, 166 ms PDF | 0.33 s | 0.25 s |
| Chromium, Pixel 7 emulation, CPU 4× slower | 71 ms, 151 ms | 0.85 s | – |
| WebKit, desktop | 189 ms, 280 ms | 0.80 s | – |
| WebKit, iPhone 15 emulation | 192 ms, 281 ms | 0.80 s | – |

Peak WebAssembly memory after the 700k import and a PDF export: 98 MiB analysis, 38 MiB PDF engine. Times are with files served from localhost; the first visit additionally downloads about 9 MB compressed. A measurement on a physical iPhone is still open.

**Open:**

| Step | Waiting for |
|---|---|
| Physical iPhone and Android phone | A person with the devices, after deployment |
| Provider data validation | An authorized MyHeritage tabular export and a WGS CRAM with its matching indexed FASTA |
| Further inference validation | Assay benchmarks, known pedigrees, validated clinical diplotype and copy-number references, and suitable risk calibration data |

Tests use synthetic genotype data. The repository contains no personal DNA files.
