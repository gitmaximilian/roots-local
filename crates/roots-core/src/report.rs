use crate::{
    analysis::{Finding, Status, Summary},
    catalog::{structure, Chapter},
    external::{External, Family},
    locale::{self, Language},
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Options {
    pub short: bool,
    pub name: Option<String>,
    pub include_calls: bool,
    pub include_relatives: bool,
    pub include_clinical: bool,
    pub include_lineage: bool,
    pub language: Language,
    /// Render the one-page medicine pass instead of the report. Exporting the
    /// pass is the explicit opt-in for its medication findings.
    pub pass: bool,
}

#[derive(Clone, Serialize)]
pub struct Model {
    pub summary: Summary,
    pub catalog_version: String,
    pub findings: Vec<Finding>,
    pub chapters: Vec<Chapter>,
    pub external: External,
    pub family: Option<Family>,
    pub trio: Option<crate::external::Trio>,
    pub clinical: Option<crate::clinical::Matches>,
    pub maternal_lineage: Option<crate::lineage::Maternal>,
    pub sequence: Option<crate::cram::Coverage>,
    pub example: bool,
    pub scores: Vec<crate::pgs::Result>,
    pub provenance: Option<crate::catalog::Manifest>,
    pub gwas_total: usize,
}
#[derive(Serialize)]
struct Document {
    #[serde(flatten)]
    model: Model,
    options: Options,
    personal: usize,
    research: usize,
    missing: usize,
    variant_index: Vec<(String, String, String)>,
    version: &'static str,
}

impl Model {
    pub fn new(
        summary: Summary,
        catalog_version: String,
        findings: Vec<Finding>,
        example: bool,
    ) -> Self {
        Self {
            summary,
            catalog_version,
            findings,
            chapters: structure(),
            external: External::default(),
            family: None,
            trio: None,
            clinical: None,
            maternal_lineage: None,
            sequence: None,
            example,
            scores: Vec::new(),
            provenance: None,
            gwas_total: 0,
        }
    }
    pub fn apply_catalog(
        &mut self,
        data: &crate::import::Import,
        catalog: &crate::catalog::Catalog,
    ) -> Result<(), String> {
        let (gwas_total, findings) = crate::analysis::evaluate_with_coverage(data, catalog)?;
        self.findings = findings;
        if let Some(trio) = &self.trio {
            crate::analysis::resolve_bitter_phase(&mut self.findings, trio);
        }
        self.gwas_total = gwas_total;
        self.catalog_version = catalog.version.clone();
        self.scores = crate::pgs::calculate(data, &catalog.scores);
        self.provenance = catalog.provenance.clone();
        Ok(())
    }

    pub fn apply_trio(&mut self, trio: crate::external::Trio) {
        crate::analysis::resolve_bitter_phase(&mut self.findings, &trio);
        self.trio = Some(trio);
    }
}

fn document(model: &Model, mut options: Options) -> Document {
    if options.pass {
        options.include_clinical = true;
    }
    options.name = options
        .name
        .take()
        .map(|v| {
            v.trim()
                .chars()
                .filter(|c| !c.is_control())
                .take(120)
                .collect()
        })
        .filter(|s: &String| !s.is_empty());
    let mut model = model.clone();
    model.chapters = crate::catalog::localized_structure(options.language);
    if options.language == Language::En {
        for finding in &mut model.findings {
            locale::translate(&mut finding.item.title);
            locale::translate(&mut finding.item.evidence);
            locale::translate(&mut finding.item.summary);
            locale::translate(&mut finding.item.population);
            locale::translate(&mut finding.item.limits);
            locale::translate(&mut finding.message);
            if let Some(conclusion) = &mut finding.conclusion {
                locale::translate(conclusion);
            }
            for (label, _) in &mut finding.item.sources {
                locale::translate(label);
            }
            for check in &mut finding.checks {
                check.status = locale::english(check.status);
                locale::translate(&mut check.gene);
            }
        }
        for score in &mut model.scores {
            locale::translate(&mut score.title);
            locale::translate(&mut score.population);
        }
    }
    if !options.include_clinical {
        model.clinical = None;
        for finding in &mut model.findings {
            if finding.item.is_clinical() && finding.conclusion.is_some() {
                finding.conclusion = None;
                finding.confidence = None;
                finding.dosage = None;
                finding.status = Status::Research;
                finding.message = locale::english_if(
                    options.language,
                    "Medizinischer Befund ausgeblendet. Aktiviere medizinische Befunde, um ihn zu sehen.",
                );
            }
        }
    }
    let personal = model
        .findings
        .iter()
        .filter(|f| f.status == Status::Personal)
        .count();
    let research = model
        .findings
        .iter()
        .filter(|f| f.status == Status::Research)
        .count();
    let missing = model.findings.len() - personal - research;
    if !options.include_lineage {
        model.maternal_lineage = None;
    }
    if !options.include_relatives {
        for (i, relative) in model.external.matches.iter_mut().enumerate() {
            relative.name = format!(
                "{} {}",
                if options.language == Language::En {
                    "Match"
                } else {
                    "Treffer"
                },
                i + 1
            );
        }
        for (i, segment) in model.external.segments.iter_mut().enumerate() {
            segment.name = format!("Segment {}", i + 1);
        }
    }
    if !options.include_calls {
        for finding in &mut model.findings {
            finding.dosage = None;
            for check in &mut finding.checks {
                check.call = None;
            }
        }
        if let Some(trio) = &mut model.trio {
            trio.assignments.clear();
        }
        if let Some(sequence) = &mut model.sequence {
            for target in &mut sequence.targets {
                target.bases = [0; 4];
            }
        }
        if let Some(clinical) = &mut model.clinical {
            for variant in &mut clinical.variants {
                variant.alternate = ' ';
                variant.copies = 0;
            }
        }
    }
    let mut variant_index: Vec<_> = model
        .findings
        .iter()
        .flat_map(|item| {
            item.checks
                .iter()
                .map(|c| (c.id.clone(), c.gene.clone(), item.item.id.clone()))
        })
        .collect();
    variant_index.sort();
    variant_index.dedup();
    Document {
        model,
        options,
        personal,
        research,
        missing,
        variant_index,
        version: env!("CARGO_PKG_VERSION"),
    }
}

/// Renders the report or the medicine pass as PDF bytes.
pub fn render(model: &Model, options: Options) -> Result<Vec<u8>, String> {
    let template = if options.pass {
        include_str!("../../../report/pass.typ")
    } else {
        include_str!("../../../report/report.typ")
    };
    let document = document(model, options);
    let data = serde_json::to_vec(&document).map_err(|_| "Das Reportmodell ist ungültig.")?;
    crate::pdf::compile(template, data)
}
