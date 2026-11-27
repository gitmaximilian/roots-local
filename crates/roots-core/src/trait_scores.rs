//! Genetic scores per trait from independent GWAS Catalog lead variants.
//!
//! Each score uses one study, so all weights share a unit. The expected value
//! and spread come from the effect-allele frequencies, which gives a position
//! relative to the study population. Linkage between the variants is limited
//! by keeping one variant per 500 kb when the data is built.
use crate::analysis::{Check, Finding, Status};
use crate::catalog::{Confidence, Method, Trait};
use crate::import::{Build, Import, Variant};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

const DATA: &str = include_str!("../../../catalog/gwas-scores.json");
/// Minimum number of genotyped loci, and minimum share of the score's loci.
const MIN_MATCHED: usize = 8;
const MIN_SHARE: f64 = 0.10;
/// Variants listed with each score, ordered by their contribution.
const SHOWN: usize = 8;

#[derive(Deserialize)]
struct Data {
    release: String,
    traits: Vec<ScoreTrait>,
}

/// rsID, chromosome, GRCh37 and GRCh38 position, effect and other allele on
/// the plus strand, signed weight, effect-allele frequency, gene, locus. Within
/// a locus the lead variant comes first, followed by stand-ins from the same
/// study for files that lack the lead.
type ScoreVariant = (String, String, u32, u32, char, char, f64, f64, String, u32);

#[derive(Deserialize)]
struct ScoreTrait {
    id: String,
    section: String,
    title: String,
    clinical: bool,
    disease: bool,
    accession: String,
    pmid: String,
    citation: String,
    sample: String,
    variants: Vec<ScoreVariant>,
}

/// The numbers behind a score finding. Shown with the conclusion.
#[derive(Clone, Debug, Serialize)]
pub struct ScoreDetail {
    pub matched: usize,
    pub total: usize,
    /// Estimated percentile in the study population, 0–100.
    pub percentile: Option<f64>,
    pub z: Option<f64>,
    /// True when the trait is a disease, false for a measurement.
    pub disease: bool,
    pub release: String,
}

fn data() -> &'static Data {
    static DATA_SET: OnceLock<Data> = OnceLock::new();
    DATA_SET.get_or_init(|| serde_json::from_str(DATA).expect("valid built-in GWAS scores"))
}

pub fn release() -> &'static str {
    &data().release
}

pub fn count() -> usize {
    data().traits.len()
}

const MEASURE: [&str; 5] = [
    "Dein Score ist niedriger als bei den meisten Menschen in der Studie. Das deutet leicht auf niedrigere Werte hin.",
    "Dein Score liegt etwas unter der Mitte der Studienpopulation.",
    "Dein Score liegt im mittleren Bereich der Studienpopulation.",
    "Dein Score liegt etwas über der Mitte der Studienpopulation.",
    "Dein Score ist höher als bei den meisten Menschen in der Studie. Das deutet leicht auf höhere Werte hin.",
];
const DISEASE: [&str; 5] = [
    "Dein Score ist niedriger als bei den meisten Menschen in der Studie. Über dein persönliches Risiko sagt das wenig.",
    "Dein Score liegt etwas unter der Mitte der Studienpopulation. Über dein persönliches Risiko sagt das wenig.",
    "Dein Score liegt im mittleren Bereich der Studienpopulation.",
    "Dein Score liegt etwas über der Mitte der Studienpopulation. Über dein persönliches Risiko sagt das wenig.",
    "Dein Score ist höher als bei den meisten Menschen in der Studie. Das ist keine Diagnose und sagt wenig über dein persönliches Risiko.",
];
pub const SUMMARY: &str = "Der Score fasst unabhängige Varianten aus der größten Studie zu diesem Merkmal im GWAS-Katalog zusammen. Jede Variante zählt mit ihrem Effekt aus der Studie.";
pub const LIMITS: &str = "Ein genetischer Score erklärt meist nur einen kleinen Teil der Unterschiede zwischen Menschen. Lebensstil, Umwelt und seltene Varianten fehlen. Der Vergleich gilt für die Studienpopulation, meist europäischer Abstammung, und ist keine Diagnose.";
pub const EVIDENCE: &str = "Genetischer Score aus einer genomweiten Assoziationsstudie";
const MESSAGE: &str = "Die Kopien der Effektallele wurden aus der Rohdatei gezählt, mit den Effekten der Studie gewichtet und mit dem Durchschnitt verglichen, der aus den Allelfrequenzen zu erwarten ist.";
const TOO_FEW: &str = "Zu wenige Varianten dieses Scores sind in der Rohdatei enthalten, um ihn auszuwerten.";

/// Standard normal distribution function (Abramowitz and Stegun 7.1.26).
fn phi(z: f64) -> f64 {
    let x = z.abs() / std::f64::consts::SQRT_2;
    let t = 1.0 / (1.0 + 0.327_591_1 * x);
    let poly = t
        * (0.254_829_592
            + t * (-0.284_496_736 + t * (1.421_413_741 + t * (-1.453_152_027 + t * 1.061_405_429))));
    let erf = 1.0 - poly * (-x * x).exp();
    if z >= 0.0 { 0.5 * (1.0 + erf) } else { 0.5 * (1.0 - erf) }
}

fn category(z: f64) -> usize {
    match z {
        z if z <= -1.2816 => 0,
        z if z <= -0.5244 => 1,
        z if z < 0.5244 => 2,
        z if z < 1.2816 => 3,
        _ => 4,
    }
}

fn complement(base: char) -> char {
    match base {
        'A' => 'T',
        'T' => 'A',
        'C' => 'G',
        'G' => 'C',
        other => other,
    }
}

/// Scores every built-in trait against the imported genotypes.
pub fn evaluate(data: &Import) -> Vec<Finding> {
    let Some(build) = data.build else {
        return Vec::new();
    };
    let set = self::data();
    let reverse = data.strand == "Rückwärtsstrang";
    let wanted: std::collections::HashSet<(&str, u32)> = set
        .traits
        .iter()
        .flat_map(|t| t.variants.iter())
        .map(|v| (v.1.as_str(), if build == Build::Grch37 { v.2 } else { v.3 }))
        .collect();
    // Rows at a wanted position; conflicting rows invalidate the position.
    let mut rows: HashMap<(&str, u32), Option<&Variant>> = HashMap::new();
    for row in &data.rows {
        let key = (row.chromosome.as_str(), row.position);
        if wanted.contains(&key) {
            rows.entry(key)
                .and_modify(|seen| {
                    if seen.is_some_and(|s| s.alleles != row.alleles) {
                        *seen = None;
                    }
                })
                .or_insert(Some(row));
        }
    }
    set.traits
        .iter()
        .filter_map(|score| {
            let mut sum = 0.0;
            let mut mean = 0.0;
            let mut variance = 0.0;
            let mut contributions = Vec::new();
            let mut used = std::collections::HashSet::new();
            for (rsid, chromosome, old, new, effect, other, weight, frequency, gene, locus) in &score.variants {
                if used.contains(locus) {
                    continue;
                }
                let position = if build == Build::Grch37 { *old } else { *new };
                let Some(Some(row)) = rows.get(&(chromosome.as_str(), position)) else {
                    continue;
                };
                if row.id.starts_with("rs") && row.id != *rsid {
                    continue;
                }
                let Some(call) = row.alleles.as_deref() else {
                    continue;
                };
                let bases: Vec<char> = call
                    .chars()
                    .map(|b| if reverse { complement(b) } else { b })
                    .collect();
                if bases.len() != 2 || !bases.iter().all(|b| b == effect || b == other) {
                    continue;
                }
                used.insert(*locus);
                let copies = bases.iter().filter(|b| *b == effect).count() as f64;
                sum += copies * weight;
                mean += 2.0 * frequency * weight;
                variance += 2.0 * frequency * (1.0 - frequency) * weight * weight;
                let mut genotype = bases.clone();
                genotype.sort_unstable();
                contributions.push((
                    ((copies - 2.0 * frequency) * weight).abs(),
                    Check {
                        id: rsid.clone(),
                        gene: gene.clone(),
                        coordinate: Some(format!("{chromosome}:{position}")),
                        call: Some(genotype.into_iter().collect()),
                        status: if (copies - 2.0 * frequency) * weight >= 0.0 {
                            "Erhöht den Score"
                        } else {
                            "Senkt den Score"
                        },
                    },
                ));
            }
            let matched = contributions.len();
            if matched == 0 {
                return None;
            }
            let total = score.variants.iter().map(|v| v.9).collect::<std::collections::HashSet<_>>().len();
            let enough = matched >= MIN_MATCHED
                && matched as f64 >= MIN_SHARE * total as f64
                && variance > 0.0;
            let z = enough.then(|| (sum - mean) / variance.sqrt());
            contributions.sort_by(|a, b| b.0.total_cmp(&a.0));
            let checks = contributions.into_iter().take(SHOWN).map(|(_, c)| c).collect();
            let texts = if score.disease { &DISEASE } else { &MEASURE };
            Some(Finding {
                item: Trait {
                    id: score.id.clone(),
                    section: score.section.clone(),
                    title: score.title.clone(),
                    markers: Vec::new(),
                    method: Method::Score,
                    evidence: EVIDENCE.into(),
                    summary: SUMMARY.into(),
                    limits: LIMITS.into(),
                    population: score.sample.clone(),
                    sources: vec![
                        (score.citation.clone(), format!("https://pubmed.ncbi.nlm.nih.gov/{}/", score.pmid)),
                        (
                            format!("GWAS Catalog · {}", score.accession),
                            format!("https://www.ebi.ac.uk/gwas/studies/{}", score.accession),
                        ),
                    ],
                    require_identifier: true,
                    cross: Vec::new(),
                    study: None,
                    outcomes: Vec::new(),
                    effect: None,
                    clinical: score.clinical,
                    questions: Vec::new(),
                },
                status: if enough { Status::Personal } else { Status::Missing },
                message: if enough { MESSAGE } else { TOO_FEW }.into(),
                checks,
                conclusion: z.map(|z| texts[category(z)].to_owned()),
                confidence: enough.then_some(Confidence::Low),
                dosage: None,
                score: Some(ScoreDetail {
                    matched,
                    total,
                    // The normal approximation is coarse in the tails, so the
                    // estimate is reported between the 1st and 99th percentile.
                    percentile: z.map(|z| ((phi(z) * 1000.0).round() / 10.0).clamp(1.0, 99.0)),
                    z: z.map(|z| (z * 100.0).round() / 100.0),
                    disease: score.disease,
                    release: set.release.clone(),
                }),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_distribution() {
        assert!((phi(0.0) - 0.5).abs() < 1e-7);
        assert!((phi(1.96) - 0.975).abs() < 1e-4);
        assert!((phi(-1.2816) - 0.1).abs() < 1e-3);
    }

    #[test]
    fn built_in_scores_are_consistent() {
        let set = data();
        assert!(set.traits.len() >= 100);
        for score in &set.traits {
            let loci: std::collections::HashSet<_> = score.variants.iter().map(|v| v.9).collect();
            assert!(loci.len() >= 5, "{}", score.id);
            for v in &score.variants {
                assert!(v.4 != v.5 && "ACGT".contains(v.4) && "ACGT".contains(v.5), "{} {}", score.id, v.0);
                assert!(complement(v.4) != v.5, "strand-symmetric {} {}", score.id, v.0);
                assert!(v.6.is_finite() && v.6 != 0.0 && (0.0..1.0).contains(&v.7), "{} {}", score.id, v.0);
            }
        }
    }
}
