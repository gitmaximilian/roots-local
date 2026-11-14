use crate::{
    analysis::{Finding, Status, Summary},
    catalog::{structure, write_atomic, Chapter},
    external::{External, Family},
    locale::{self, Language},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Options {
    pub short: bool,
    pub name: Option<String>,
    pub include_calls: bool,
    pub include_relatives: bool,
    pub language: Language,
}

#[derive(Clone, Serialize)]
pub struct Model {
    pub summary: Summary,
    pub catalog_version: String,
    pub findings: Vec<Finding>,
    pub chapters: Vec<Chapter>,
    pub external: External,
    pub family: Option<Family>,
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
        self.gwas_total = gwas_total;
        self.catalog_version = catalog.version.clone();
        self.scores = crate::pgs::calculate(data, &catalog.scores);
        self.provenance = catalog.provenance.clone();
        Ok(())
    }
}

pub fn typst_binary() -> Result<PathBuf, String> {
    let filename = if cfg!(windows) { "typst.exe" } else { "typst" };
    let native = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join(filename)));
    let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(if cfg!(windows) {
            format!("typst-{}.exe", env!("ROOTS_TARGET"))
        } else {
            format!("typst-{}", env!("ROOTS_TARGET"))
        });
    native
        .into_iter()
        .chain(cfg!(debug_assertions).then_some(dev))
        .find(|path| path.is_file())
        .ok_or_else(|| "Das gebündelte PDF-Werkzeug wurde nicht gefunden.".into())
}

pub fn render(model: &Model, mut options: Options, typst: &Path) -> Result<Vec<u8>, String> {
    let directory = tempfile::tempdir()
        .map_err(|_| "Der temporäre Exportordner konnte nicht geöffnet werden.")?;
    let view = directory.path().join("report.typ");
    let data = directory.path().join("report.json");
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
            for check in &mut finding.checks {
                check.call = None;
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
    let document = Document {
        model,
        options,
        personal,
        research,
        missing,
        variant_index,
        version: env!("CARGO_PKG_VERSION"),
    };
    fs::write(&view, include_str!("../../report/report.typ"))
        .map_err(|_| "Die PDF-Vorlage konnte nicht geöffnet werden.")?;
    fs::write(
        &data,
        serde_json::to_vec(&document).map_err(|_| "Das Reportmodell ist ungültig.")?,
    )
    .map_err(|_| "Die Daten konnten nicht für den PDF-Export vorbereitet werden.")?;
    let output = directory.path().join("report.pdf");
    let mut renderer = Command::new(typst);
    renderer
        .current_dir(directory.path())
        .arg("compile")
        .arg("--root")
        .arg(directory.path())
        .arg("--ignore-system-fonts")
        .arg(&view)
        .arg(&output);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        renderer.creation_flags(0x08000000);
    }
    let result = renderer
        .output()
        .map_err(|_| "Das lokale PDF-Werkzeug konnte nicht gestartet werden.")?;
    if !result.status.success() {
        return Err("Der Report konnte nicht gerendert werden.".into());
    }
    fs::read(output).map_err(|_| "Das erzeugte PDF konnte nicht gelesen werden.".into())
}

pub fn export(
    model: &Model,
    options: Options,
    typst: &Path,
    destination: &Path,
) -> Result<(), String> {
    write_atomic(destination, &render(model, options, typst)?)
}
