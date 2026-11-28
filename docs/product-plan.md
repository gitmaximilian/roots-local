# Roots Local product review and delivery plan

Roots Local helps someone inspect a consumer DNA export in their own browser and share a report with the detail they choose. The first product milestone is a trustworthy local workflow from import to export with reproducible findings, visible gaps, and clear release evidence.

## What the implementation brief leaves unresolved

| Requirement | What the app and tests show | Product decision |
|---|---|---|
| All 17 chapters and 76 sections | The full PDF has the expected structure. Many sections have limited or zero catalog evidence. | Track structural completeness and scientific coverage independently. Publish capabilities by input type and catalog version. |
| MyHeritage import and CRAM | Synthetic tabular and CRAM inputs pass. A MyHeritage CRAM is a distinct WGS export with aligned reads. | Accept tabular calls for supported rules and use CRAM for measured coverage. Use a consented local MyHeritage CRAM and its matching reference for provider acceptance. [MyHeritage download guide](https://www.myheritage.com/help/en/articles/12851869-how-do-i-download-my-raw-dna-data-file-or-cram-file-from-myheritage) |
| Export privacy | Hiding genotype strings still lets a ClinVar hit identify the observed alternate allele through its public record. The renderer previously received optional detail it did not display. | Make clinical annotations opt-in per profile. Apply export settings before sending data to the renderer. Other report interpretations can still reveal genetic information. |
| Research score export | The report template includes the score section title in compact mode, then suppresses the score body. It can also suppress score content when a finding occupies the same section. | Show imported score status and coverage in either report format, alongside other findings. Test the extracted content. |
| Validated interpretation | Research results, case-specific observations, and clinical claims have different data requirements. A measured genotype, reported association, or raw score alone cannot establish individual risk. | Ship evidence, method, match quality, and limits with each rule. Require input and model validation specific to every advanced method. |
| Platform support | Roots Local is a static web app for current desktop browsers, iOS Safari, and Android Chrome. The macOS desktop app (v0.2.0) was retired on 2026-11-15. | Run the privacy, score, CRAM, and layout suites in Chromium, WebKit, iPhone, and Android emulation, locally and against the live site. [Verified platforms](test-status.md) |

## Delivery order and acceptance

| Priority | Work | Acceptance |
|---|---|---|
| P0 | Fix PDF sharing controls, score rendering, and the test gap | In both report formats and languages, the default PDF omits imported clinical records. The same PDF includes them when explicitly selected. Allele detail follows its own choice. Incomplete scores state marker coverage and omit a raw value. Complete scores render with their coverage and source even if the section contains another finding. |
| P1 | Validate source formats and measure coverage | Use synthetic fixtures for automated regressions. Explain a missing assembly in the app and both PDF formats. Separately document accepted MyHeritage export versions after testing consented local files. For CRAM, compare depth and base counts at selected sites with a trusted tool and record reference identity. Show assay limitations and missing coverage in the report. |
| P1 | Prepare releases | Deploy to a preview first, then production. Every served file matches `SHA256SUMS`, the live test suites pass, and the previous deployment stays available as a rollback target. Tag each release on GitHub with its build ID and checksum manifest. [Deployment](deployment.md) |
| P2 | Add evidence in reviewable batches | Each rule has source, assembly, allele orientation, coverage, and expected positive, negative, and unresolved cases. Add a curated topic only after those checks. Track reference licensing and version in the catalog. |
| P2 | Validate advanced inference | Benchmark haplogroups on the supported assay and tree. Compare family estimates against known pedigrees. Validate any clinical diplotype or copy-number method on data that supports phase or dosage. Validate absolute risk on the intended population, endpoint, and time horizon before exposing it in a report. |

The [implementation brief](implementation-brief.md) defines the engineering requirements. The [report outline](report-structure.md) defines the report contents. The [verification record](test-status.md) documents what has run and what remains open.

The P0 report changes and automated content checks are implemented. P1 includes the missing assembly explanation and a reproducible comparison against HTSlib on synthetic CRAM records. P2 includes curated hair research and a local Haplogrep workflow for prepared rCRS inputs, with a versioned tree, fit score, quality checks, and separate export consent. MyHeritage provider validation and validation of the remaining inference methods are open.
