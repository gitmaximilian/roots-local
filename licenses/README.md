# Third-party components

Roots Local is Apache-2.0. The Typst compiler, compiled into the PDF WebAssembly module, is distributed under Apache-2.0 with a separate upstream notice. See [LICENSE](typst-LICENSE) and [NOTICE](typst-NOTICE). The report fonts in `fonts/` (Libertinus Serif under the SIL Open Font License 1.1, DejaVu Sans Mono under the Bitstream Vera and DejaVu licenses) are copied unchanged from `typst-assets` 0.15.1; their notices are in [typst-assets-NOTICE](typst-assets-NOTICE).

The frontend uses React, Lucide and PDF.js. See their upstream package licenses and the locked versions in the repository. Rust dependencies and their exact versions are listed in Cargo.lock.

The starter catalog contains original summaries and reference variant identifiers and coordinates checked against dbSNP. Scientific papers are linked and are not redistributed. Imported third-party catalogs, PGS weights and reference FASTA files retain their own terms. Their license and origin should travel with the catalog package.
