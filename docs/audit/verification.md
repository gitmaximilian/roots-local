# Audit implementation and verification

[Original findings and plan](2026-11-17.md) · [Versioned master prompt](master-prompt.md)

| Finding | Implementation and evidence |
| --- | --- |
| GEN-1 / GEN-2 | Catalog 1.5.0 reports the observed CYP2C9, CYP2C19 and TPMT marker copies, discloses incomplete panels and phase, and abstains on double-heterozygous APOE. Clinical rules require a concordant rsID as well as build, coordinate and compatible alleles. Lactase findings describe an association with persistence or the absence of the tested allele. Symptoms and individual tolerance require different evidence. |
| GEN-3 | Question matching accepts documented English and German searches and unambiguous catalog terms, then reads the current profile. The example compound question about milk and melanoma abstains. Direct lactase questions retain the result and link to the evidence and markers. |
| DATA-1 | View controls and PDF export options are independent. Hidden clinical calls stay out of the genotype appendix. Closing or replacing a profile clears the active React and Rust state and both previews. WebAssembly linear memory can retain capacity for reuse until the worker is terminated. |
| LOCAL-1 / LOCAL-2 | The checksum link serves the manifest even under the service worker. A two-tab test checks that accepting an update preserves the other session until its tab closes. The update announces when reloading ends the current session. The PDF preview worker initializes during startup. |
| UX-1 | The finding close button has a 44 px target. Pointer and touch tests close the inspector, and keyboard tests cover Escape and focus return. Mobile navigation and the search dialog have close controls and keyboard focus handling. Atlas has a keyboard-operated chromosome selector. |
| UX-2 / UX-3 | The new language switch starts in English even with a German browser, persists explicit choices and preserves the open profile. The synthetic label remains visible on phones. Chapter controls fit at 320 px. The radar has a rule-grade legend. |
| PDF | A synthetic file containing all positioned GRCh37 starter markers originally produced a two-page medicine pass. The compact layout produces one page in each language and keeps extended custom reports paginatable. Rendered PNGs were inspected in English and German. |
| Portfolio | Updated Roots Local screenshots and English/German text about marker evidence, local catalog questions and the report export option. The detail page links to this web branch. The three other project cards and the existing central privacy wording were used as the comparison baseline. |

## Visual evidence

All screenshots use the built-in synthetic profile. The phone captures are browser emulation.

| View | Before | After |
| --- | --- | --- |
| Desktop toolbar and overview | [Desktop baseline](assets/before-desktop.jpg) | [Language control and rule context](assets/after-desktop.jpg) |
| Phone overview | [Phone baseline](assets/before-phone.jpg) | [EN/DE control and synthetic badge](assets/after-phone.jpg) |
| Finding drawer | | [Close control on the mobile drawer](assets/finding-close-phone.jpg) |

## Local LLM comparison

The [benchmark runner](../../scripts/interpretation-benchmark.mjs) uses nine synthetic CSV files. The reference cases specify validated genotypes and outcome classes before scoring. Both systems receive the same CSV rows. Qwen also receives marker/build metadata and the interpretation policy. Ollama ran on loopback with Qwen2.5 7B, Q4_K_M (ID `845dbda0ea48`), seed 21 and temperature 0. The app runtime uses the Rust catalog and WebAssembly. [Model card](https://ollama.com/library/qwen2.5:7b)

| Case | Expected | Roots Local | Qwen strict result |
| --- | --- | --- | --- |
| Lactase, valid AG | Limited marker association | Pass | Extra/inconsistent genotypes |
| Lactase, wrong reference position | Abstain | Pass | Association despite mismatch |
| Lactase, missing declared build | Abstain | Pass | Association despite missing build |
| Lactase, conflicting rows | Abstain | Pass | Conflicting genotypes treated as results |
| APOE, double heterozygote | Phase unresolved, both calls retained | Pass | Both calls correct. Explanation acknowledges uncertainty, class differs |
| APOE, missing second locus | Abstain, retain the valid first call | Pass | Association and incomplete call list |
| CYP2C9, two heterozygotes | Marker copies only | Pass | Calls correct, association class |
| CYP2C19, reference markers | Report the two marker calls. Full type unresolved | Pass | Wrong first call in structured output. Prose acknowledges incomplete type |
| TPMT, two heterozygotes | Marker copies only | Pass | Calls correct. Prose claims a complete diplotype |

Roots Local scored 9/9 and Qwen scored 0/9 for an exact match on both fields. Qwen supplied 3/9 exact validated-call lists. The benchmark tests a deliberately small and rule-bounded set and scores structured responses strictly. It does not estimate general LLM performance, clinical validity, or coverage of arbitrary DNA questions. Some model explanations were appropriately cautious even when their structured output failed. The initial catalog review used the [lactase association study](https://pubmed.ncbi.nlm.nih.gov/11788828/), [CPIC warfarin](https://files.cpicpgx.org/data/guideline/publication/warfarin/2017/28198005.pdf), [CPIC clopidogrel](https://files.cpicpgx.org/data/guideline/publication/clopidogrel/2022/35034351.pdf), [CPIC thiopurines](https://cpicpgx.org/guidelines/guideline-for-thiopurines-and-tpmt/), and [APOE genotyping research](https://pmc.ncbi.nlm.nih.gov/articles/PMC7984319/).

Run the deterministic cases with `node scripts/interpretation-benchmark.mjs`. To compare the named model, run Ollama on port 11446 and use `node scripts/interpretation-benchmark.mjs qwen2.5:7b`. Only synthetic rows are sent to the loopback tool.

## Local verification and performance

- Rust tests exercise reference/strand handling, missing calls, phase, input sizes, invalid signed packages, companion files, CRAM, and PDF structure/redaction. The local Rust suite passed 22 cases with PDF extraction enabled.
- The browser suite covers all four Playwright profiles and renders the WebAssembly PDFs. Chromium and Pixel imported a synthetic file after offline reload. Playwright WebKit used its resident page and the built-in synthetic fixture after network disconnection, since its offline emulation blocks reload and local file selection. Both modes display the multipage preview and export locally. The online test records requests and checks browser storage.
- Axe Core 4.11.1 scanned nine states each at 1280 px light and 320 px dark. The second scan reported no automated WCAG-tagged violations. Keyboard and touch tests exercised focus and language switching. Device emulation and automated tools cover selected behaviors. A physical device/Safari offline install and a manual screen reader session are still open.
- [Performance harness](../../scripts/audit-performance.mjs), Chromium, desktop, local Cloudflare Pages emulation, one run each, synthetic sample plus 700,000 rows. Baseline/candidate in ms: analysis ready cold 327/162, PDF engine ready cold 1107/1447, offline cache ready 1316/1761, warm analysis 43/48, warm PDF engine 67/73, import 335/308, PDF download 205/215. This is a smoke measurement, not a statistically controlled device benchmark. Peak WASM linear memory was approximately 106 MiB analysis and 38 MiB PDF for both. The preview renderer starts sooner to keep WebKit offline preview functional. It adds startup work; the installed static file set remains approximately 28 MB uncompressed.
- Clinical sign-off and comparison against independently validated assay output remain open. No actual patient data was used.

## Release

The prior live app is [c95d1886](https://c95d1886.rootslocal.pages.dev/) and the prior portfolio is [7e29e27d](https://7e29e27d.maximilianauer.pages.dev/). See [deployment notes](../deployment.md) for the final production record.
