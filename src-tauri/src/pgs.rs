//! Strictly additive, biallelic research scoring. Calibration is outside this model.
use crate::import::{Build, Import, Variant};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Term {
    pub chromosome: String,
    pub position: u32,
    pub effect: char,
    pub other: char,
    pub weight: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Score {
    pub id: String,
    pub title: String,
    pub build: Build,
    pub population: String,
    pub source: String,
    pub terms: Vec<Term>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Result {
    pub id: String,
    pub title: String,
    pub population: String,
    pub source: String,
    pub matched: usize,
    pub total: usize,
    pub raw: Option<f64>,
}
impl Score {
    pub fn valid(&self) -> bool {
        let mut positions = HashSet::new();
        !self.id.is_empty()
            && !self.title.trim().is_empty()
            && !self.population.trim().is_empty()
            && self.source.starts_with("https://")
            && !self.source.contains(char::is_whitespace)
            && (2..=100_000).contains(&self.terms.len())
            && self.terms.iter().all(|term| {
                crate::import::chromosome(&term.chromosome).as_ref() == Some(&term.chromosome)
                    && term.chromosome.parse::<u8>().is_ok()
                    && term.position > 0
                    && "ACGT".contains(term.effect)
                    && "ACGT".contains(term.other)
                    && term.effect != term.other
                    && term.weight.is_finite()
                    && term.weight.abs() <= 100.0
                    && positions.insert((&term.chromosome, term.position))
            })
    }
}

pub fn calculate(data: &Import, models: &[Score]) -> Vec<Result> {
    let positions: HashSet<_> = models
        .iter()
        .filter(|score| Some(score.build) == data.build)
        .flat_map(|score| {
            score
                .terms
                .iter()
                .map(|term| (term.chromosome.as_str(), term.position))
        })
        .collect();
    let mut rows: HashMap<(&str, u32), Option<&Variant>> = HashMap::new();
    if data.strand != "Rückwärtsstrang" {
        for row in &data.rows {
            let key = (row.chromosome.as_str(), row.position);
            if positions.contains(&key) {
                rows.entry(key)
                    .and_modify(|previous| {
                        if previous.is_some_and(|existing| existing.alleles != row.alleles) {
                            *previous = None;
                        }
                    })
                    .or_insert(Some(row));
            }
        }
    }
    models
        .iter()
        .map(|score| {
            let mut sum = 0.0;
            let mut matched = 0;
            if Some(score.build) == data.build {
                for term in &score.terms {
                    let genotype = rows
                        .get(&(term.chromosome.as_str(), term.position))
                        .and_then(|row| row.and_then(|row| row.alleles.as_deref()));
                    if let Some(genotype) = genotype.filter(|call| {
                        call.len() == 2
                            && call
                                .chars()
                                .all(|base| base == term.effect || base == term.other)
                    }) {
                        sum += term.weight
                            * genotype.chars().filter(|base| *base == term.effect).count() as f64;
                        matched += 1;
                    }
                }
            }
            Result {
                id: score.id.clone(),
                title: score.title.clone(),
                population: score.population.clone(),
                source: score.source.clone(),
                matched,
                total: score.terms.len(),
                raw: (matched == score.terms.len() && score.valid()).then_some(sum),
            }
        })
        .collect()
}
