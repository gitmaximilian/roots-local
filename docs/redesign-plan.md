# Roots Local redesign: review and plan

Status: November 15, 2026. Scope decision: **macOS on Apple Silicon only**. Product goal: **interpret the DNA so the user can draw conclusions from it.** Every finding answers "what does this mean for me?" in plain language, with evidence grade, confidence, and limits next to it.

Design decision: a native macOS shell (sidebar, ⌘K command palette, inspector, native menus) with an **Atlas** karyogram view as the signature screen and PDF cover motif. Logo: **Nucleus**, a ring with an off-centre dot.

## 1. Technical review

Severity: **critical** blocks the product goal, **high** is a visible defect or large risk, **medium** is a maintainability or quality issue, **low** is polish.

| # | Severity | Area | Finding | Evidence | Resolution |
|---|---|---|---|---|---|
| T1 | critical | Interpretation | Genotype-to-outcome logic is hard-coded in Rust for four traits. Catalog packages cannot add interpretable rules, which contradicts the brief's "keep catalog rules declarative". | `analysis.rs` `interpretation()` | Declarative `outcomes` per trait (genotype pattern → conclusion, explanation, confidence). Migrate the four rules. |
| T2 | critical | Interpretation | Research findings only state that a marker is present. They never say whether the person carries the studied allele, so no conclusion is possible. | `analysis.rs` research branch | Declarative `effect_allele`; report 0, 1, or 2 copies with a per-dosage conclusion. Populate only with verified alleles. |
| T3 | high | Interpretation | Findings carry no headline conclusion or confidence level. The UI and PDF show long hedged prose only. | `Finding` struct | Add `conclusion` and `confidence` to findings; show them first in app and report. |
| T4 | high | Platform | Windows code paths, NSIS config, WebView2 payload, Windows CI jobs, `icon.ico`, `windows_subsystem` attribute, Windows docs. | `tauri.conf.json`, `desktop.yml`, `prepare_tools.py`, `main.rs:1` | Remove. Single target `aarch64-apple-darwin`. |
| T5 | high | UI | One 1,830-line component file, `min-width: 760px`, no dark mode, no command palette, no keyboard navigation between findings. | `src/main.tsx`, `src/style.css` | Native shell with tokens for light and dark, sidebar, ⌘K, inspector. Split shell components out of `main.tsx`. |
| T6 | high | macOS | No native menu bar items, no drag and drop from Finder, no file association. | `main.rs` | Native menu (Open, Export, View example, Language), drag-and-drop import command. |
| T7 | medium | i18n | Backend statuses and errors are German literals, and logic compares them as strings (`strand == "Rückwärtsstrang"`). | `analysis.rs:124`, `pgs.rs` | Keep German source text with the existing translation table for now. Replace string comparisons with typed enums in a follow-up. |
| T8 | medium | Strand | A reverse-strand file is never interpreted. Non-palindromic alleles could be complemented safely. | `analysis.rs:124` | Complement non-palindromic calls; keep A/T and C/G sites unresolved. Follow-up. |
| T9 | medium | Hemizygous calls | Single-allele X, Y, and MT calls are parsed but never usable by rules (rules require two alleles). | `analysis.rs:138` | Needed for Y and mtDNA haplogroups from array data. Follow-up with sex inference. |
| T10 | medium | Performance | The starter catalog is parsed and loaded into SQLite on each import and marker lookup. | `main.rs` `make_model`, `active_markers` | Cache the parsed starter catalog once per process. |
| T11 | medium | Scores | Polygenic scores need 100% marker coverage, so array data almost never yields a value, and raw scores have no percentile. | `pgs.rs` | Allow coverage ≥ 75% with reference-frequency mean imputation; add population percentile from a reference distribution. Follow-up, needs reference data. |
| T12 | medium | Persistence | Results vanish on quit. | `Session` | Optional encrypted local profile, opt-in. Follow-up. |
| T13 | low | Release | No release channel. | `test-status.md` | Homebrew cask with ad-hoc signed DMG from a tagged GitHub release. No Developer ID or notarization. |

Security posture is good: strict CSP, `core:default` capabilities only, navigation allowlist, signed catalogs, bounded parsers.

## 2. Categories

The 17 chapters and 76 sections are broad and stay as the structure. More coverage means more **interpretable** rules inside them, not more empty headings. Each new rule needs a verified plus-strand effect allele, GRCh37 and GRCh38 positions, a per-genotype conclusion, limits, and positive and unresolved tests.

Highest value next, grouped by what array data supports:

| Section | Candidate | Why it helps draw conclusions | Requirement |
|---|---|---|---|
| 03.1 | Inferred chromosomal sex from X heterozygosity | Quality check and prerequisite for X/Y/MT handling | Computable now |
| 01.3 | Y-DNA haplogroup from array SNPs | Paternal line without sequencing | Hemizygous calls (T9), ISOGG tree |
| 01.3 | mtDNA haplogroup from array positions | Maternal line directly from the kit file | HSD export of array positions to the existing Haplogrep helper |
| 01.1 | Own ancestry estimate | Most asked-for conclusion | Reference allele frequencies (1000 Genomes), supervised admixture |
| 02.4 | Runs of homozygosity | Concrete genome-wide number with interpretation | Computable now |
| 07.1 | Celiac HLA-DQ2.5/DQ8 tag SNPs | Strong negative predictive value | Verified tag alleles |
| 09.4 | ABO blood group | Clear personal outcome | Verified alleles for O deletion and A/B |
| 09.3 | Prothrombin G20210A next to Factor V Leiden | Thrombophilia context | Clinical opt-in |
| 15.1 | CYP2C9, VKORC1, TPMT, NUDT15, CYP2C19*17 | Drug-response conclusions | CPIC allele definitions |
| 04.1 | HIrisPlex eye colour model | Probabilities instead of single-marker hints | Published coefficients |
| 14.4 | Percentile-based polygenic scores | Comparative risk | T11 |

Out of scope for array data: CYP2D6 copy number, HLA typing beyond tag SNPs, structural variants, repeat expansions.

## 3. Plan

| Milestone | Work | Acceptance |
|---|---|---|
| M1 | Remove Windows and x64; single macOS ARM64 CI job | CI green on macOS; no Windows references outside history |
| M2 | Declarative outcomes, effect-allele dosage, conclusion and confidence fields; verified alleles for existing research markers | Unit and integration tests for every outcome; PDF shows conclusions in both languages |
| M3 | Native shell: tokens (light and dark), sidebar, toolbar, ⌘K palette, inspector; Nucleus logo and app icons | App runs offline on M4; keyboard reachable; both themes and languages checked |
| M4 | Atlas karyogram with catalog markers by status | Markers at GRCh37/38 positions; click opens the finding |
| M5 | Native menu, Finder drag and drop, PDF cover with brand and karyogram motif | Menu items work; dropped file imports; both PDFs verified |
| M6 | Docs and verification record | `test-status.md` lists architecture, commit, fixtures, network state, results |
| Next | T7–T13 and the category batches above | Each batch with sources and tests |

Allele verification for M2 used the NCBI dbSNP pages of each marker. Verified effect alleles (plus strand): rs671 A, rs7903146 T, rs1800562 A, rs6025 T, rs4149056 C, rs4244285 A, rs3918290 T, rs55886062 C, rs1805007 T, rs4988235 A. rs776746 C is inferred from strand mapping and population frequency. rs762551, rs12913832, rs72921001, and rs11803731 still need a primary source and stay without dosage statements.

## Status

M1–M5 are implemented on the `redesign/native-mac` branch. The verification record is in [test-status.md](test-status.md). T7–T13 and the category batches remain open.
