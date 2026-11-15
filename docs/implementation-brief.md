# Roots Local implementation brief

Implement and maintain an open-source web app that analyzes MyHeritage raw DNA exports locally in the browser. It is served as static files from `https://rootslocal.maximilianauer.at` and must work in current desktop browsers, iOS Safari, and Android Chrome. The macOS desktop app was retired on 2026-11-15. See the [web app plan](web-plan.md) for the architecture and privacy enforcement.

Use the [report outline](report-structure.md) as the product specification. Include its 17 chapters and 76 sections in the full PDF and the application. English is the default language. Provide a persistent German switch for the interface and reports, preserving the active analysis when it changes. Keep GitHub documentation in English. Use synthetic samples or licensed reference data suitable for testing and public CI.

Use the [product review and delivery plan](product-plan.md) to prioritize work and decide when a capability is ready to ship. An existing chapter heading meets the outline requirement. Verify scientific coverage separately against the inputs and rules available for that chapter.

## Architecture

- Use Rust compiled to WebAssembly, React, and TypeScript. Run expensive work in a Web Worker.
- Keep parsing, normalization, catalog validation, analysis, and report generation independent of the host (`crates/roots-core`). Reuse the same typed report model for the app and PDF. Expose a small CLI harness for end-to-end verification.
- Use indexed SQLite for versioned reference data. Keep personal session data in memory by default. Any persistent project format requires explicit selection and documented deletion.
- Use background workers for expensive operations. Stream large inputs, allow cancellation, paginate large result sets, and avoid sending the whole genotype file to the WebView.
- Separate timestamps and display options from reproducible analysis results. Given the same data and rule versions, results should agree across platforms.

## Offline and privacy

- Bundle fonts, assets, templates, examples, and the starter catalog locally. Importing, analysis, preview, and PDF export must work without a network connection.
- Keep the page local using a restrictive Content Security Policy, no third-party resources, and automated network tests. External citations may be copied or explicitly opened outside the app. The runtime requires no account, backend, telemetry, or remote model.
- Keep genotypes, names, match data, and private paths out of logs. Avoid extra copies and clean up temporary export files. Let users choose the export destination and whether names, explicit allele detail, match names, or imported clinical annotations are included. Clinical annotations require a separate opt-in because a reference link can identify the observed allele.
- Activate an offline catalog update only after verifying its signature, manifest, checksums, and schema. Keep the previous catalog usable if validation fails. Build reference packages separately from private analysis.

## Import and normalization

- Support documented MyHeritage CSV, TSV, and TXT exports and their ZIP packaging. Handle BOM, CRLF, quoting, and combined or separate allele columns. Limit archive entries, decompressed size, and row counts. Report malformed and ambiguous input.
- Retain source, build, chromosome, coordinate, rsID, alleles, and available quality and phasing metadata. Leave an unknown assembly unresolved. Match on build, position, and supported alleles, using rsID for verification. Check for ambiguous strands, conflicting rows, multiallelic calls, merged identifiers, and incompletely identified indels.
- Distinguish a missing position, a missing genotype, an ambiguous call, and a valid genotype. A missing call never implies the reference allele.
- Support CRAM with an appropriate indexed local reference and no remote reference retrieval. Verify reference identity and report base, alignment, and coverage quality. Call genotypes only after validating the method. Use separate importers for ancestry, matches, family data, and shared segments.

## Reference interpretation

- Maintain stable IDs for chapters, sections, findings, markers, studies, and models. Every rule records inputs, assembly, alleles, method, quality requirements, evidence, studied population, limits, and sources. Keep catalog rules declarative.
- Show data quality separately from evidence and interpretation status. Distinguish individually interpretable outcomes, research associations, externally supplied data, and unresolved cases.
- Start with lactase activity, earwax type, PTC bitter taste, and ACTN3 muscle biology. Require the relevant genotype combinations and unambiguous phase for a combined result.
- Match GWAS research by the exact stated inputs and preserve the original reported trait, cohort, effect, and source. For polygenic scores, check effect alleles, weights, coverage, model validation, reference population, and calibration before reporting an estimate.
- Separate ClinVar variant classification from ClinGen gene–disease evidence. Clinical findings from consumer raw data remain unconfirmed, conflicting assessments stay visible, and incomplete coverage does not establish that a gene is clear.
- Model pharmacogenetics by gene and drug, with explicit phase and copy-number requirements. Keep separately confirmed results attributable to their source. Consumer findings do not determine dosage or treatment.
- Normalize ontology references with EFO, HPO, or Mondo where appropriate. Record version, source, assembly, license, redistribution terms, and checksum for each imported reference dataset. Use a user-supplied local import for restricted data.

## Interface and report

- Provide import, overview, chapter browser, trait details, variant index, data sources, and PDF preview and export. Make controls usable with the keyboard and keep status labels understandable without color. Preserve the current result and settings during locale changes.
- Show interpretation, evidence, coverage, missing markers, and linked sources on each result. Enable search by trait, gene, disease, and variant.
- Use the bundled Typst compiler and a local, data-driven template. Treat imported text as text. Verify page breaks, fonts, tables, links, bookmarks, and cross-references.
- Default to the full A4 report with a cover, summary, contents, all chapters, research findings, methods, coverage, and a variant index. Offer a shorter report and optional identity fields. Both formats show the coverage and availability of imported scores. Preserve every included finding in very long exports, with numbered volumes if needed.

## Milestones and acceptance

1. Ship a working vertical slice with synthetic import, four curated traits, coverage, and the offline full PDF.
2. Add signed catalog packages, search and filters, public research sources, and companion imports. Extend the catalog across the planned chapters.
3. Validate CRAM coverage and interpretation against known reference results. Implement validated family comparisons and haplogroups as their data requirements are met.
4. Extend validated interpretation to multi-marker rules, research scores, clinically sourced variants, and pharmacogenetics. Track every model's coverage and validation status.
5. Build the web app reproducibly, publish `SHA256SUMS`, and deploy only after the privacy suite passes.

Test malformed data, missing calls, strand and reference mismatches, conflicts, large inputs, Unicode paths, cancellation, repeated imports, and PDF links. Run the installed app with internet access unavailable. Import the example, inspect results, switch between both languages, and export and verify both PDFs. Record the platforms and hardware actually used. Benchmark a large synthetic file and document runtime, peak memory, and UI responsiveness.

Use pinned CI dependencies, least-privilege permissions, and public synthetic fixtures. Verify the static build, its checksums, the security headers, and offline operation. Label experimental builds explicitly and publish checksums, notices, and a changelog.

## Primary references

- [Content Security Policy](https://developer.mozilla.org/docs/Web/HTTP/CSP) · [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [MyHeritage raw data](https://www.myheritage.com/help/en/articles/12852246-how-should-i-interpret-my-raw-dna-data) · [CRAM downloads](https://www.myheritage.com/help/en/articles/12851869-how-do-i-download-my-raw-dna-data-file-or-cram-file-from-myheritage) · [HTSlib references](https://www.htslib.org/doc/reference_seqs.html)
- [GWAS Catalog](https://www.ebi.ac.uk/gwas/docs/downloads/) · [PGS Catalog](https://www.pgscatalog.org/downloads/) · [ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/docs/downloads/) · [ClinGen](https://www.clinicalgenome.org/docs/gene-disease-validity-standard-operating-procedure/) · [PharmCAT](https://pharmcat.clinpgx.org/methods/)
- [Typst headings and bookmarks](https://typst.app/docs/reference/model/heading/)
