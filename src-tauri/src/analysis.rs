use crate::{
    catalog::{Catalog, Marker, Method, Trait},
    import::{Build, Import, Variant},
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Personal,
    Research,
    Missing,
}
#[derive(Clone, Debug, Serialize)]
pub struct Check {
    pub id: String,
    pub gene: String,
    pub coordinate: Option<String>,
    pub call: Option<String>,
    pub status: &'static str,
}
#[derive(Clone, Debug, Serialize)]
pub struct Finding {
    #[serde(flatten)]
    pub item: Trait,
    pub status: Status,
    pub message: String,
    pub checks: Vec<Check>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Summary {
    pub format: &'static str,
    pub strand: &'static str,
    pub build: Option<Build>,
    pub rows: usize,
    pub skipped: usize,
    pub no_call: usize,
    pub duplicates: usize,
    pub conflicts: usize,
    pub chromosomes: Vec<(String, usize)>,
}
pub fn summary(data: &Import) -> Summary {
    let mut counts = HashMap::new();
    let mut positions = HashMap::new();
    let mut conflicts = HashSet::new();
    let mut duplicates = 0;
    for row in &data.rows {
        *counts.entry(&row.chromosome).or_insert(0) += 1;
        let key = (&row.chromosome, row.position);
        if let Some(previous) = positions.insert(key, row.alleles.as_ref()) {
            duplicates += 1;
            if previous != row.alleles.as_ref() {
                conflicts.insert(key);
            }
        }
    }
    let mut chromosomes: Vec<_> = counts
        .into_iter()
        .map(|(chromosome, count)| (chromosome.clone(), count))
        .collect();
    chromosomes.sort_by_key(|(name, _)| {
        name.parse::<u8>().unwrap_or(match name.as_str() {
            "X" => 23,
            "Y" => 24,
            "XY" => 25,
            _ => 26,
        })
    });
    Summary {
        format: data.format,
        strand: data.strand,
        build: data.build,
        rows: data.rows.len(),
        skipped: data.skipped,
        no_call: data.rows.iter().filter(|r| r.alleles.is_none()).count(),
        chromosomes,
        duplicates,
        conflicts: conflicts.len(),
    }
}

fn check(
    marker: &Marker,
    data: &Import,
    at_pos: &HashMap<(&str, u32), Vec<&Variant>>,
    ids: &HashSet<&str>,
) -> Check {
    let Marker(id, gene, chromosome, old, new, allowed) = marker;
    let position = data
        .build
        .map(|build| if build == Build::Grch37 { *old } else { *new });
    let mut check = Check {
        id: id.clone(),
        gene: gene.clone(),
        coordinate: position.map(|pos| format!("{chromosome}:{pos}")),
        call: None,
        status: "Referenzgenom unbekannt",
    };
    let Some(position) = position else {
        return check;
    };
    if data.strand == "Rückwärtsstrang" {
        check.status = "Rückwärtsstrang wird nicht interpretiert";
        return check;
    }
    if let Some(rows) = at_pos.get(&(chromosome, position)) {
        let first = rows[0];
        if rows
            .iter()
            .any(|row| row.alleles != first.alleles || (row.id.starts_with("rs") && row.id != *id))
        {
            check.status = "Widersprüchliche Einträge";
        } else if let Some(alleles) = &first.alleles {
            if alleles.len() == 2 && alleles.bytes().all(|c| allowed.as_bytes().contains(&c)) {
                check.call = Some(alleles.to_owned());
                check.status = "Genotyp aus Rohdatei";
            } else {
                check.status = "Allele für diese Regel nicht auswertbar";
            }
        } else {
            check.status = "Position ohne Genotyp";
        }
    } else if ids.contains(id.as_str()) {
        check.status = "Position oder Referenzbuild stimmt nicht überein";
    } else {
        check.status = "Position fehlt";
    }
    check
}

fn interpretation(item: &Trait, checks: &[Check]) -> Option<String> {
    let first = checks.first()?.call.as_deref()?;
    if item.method == Method::Bitter {
        let (second, third) = (
            checks.get(1)?.call.as_deref()?,
            checks.get(2)?.call.as_deref()?,
        );
        let message = match (first, second, third) {
            ("GG", "AA", "CC") => "Die drei Positionen sind mit zwei PAV-Kopien vereinbar. PAV ist in Studien mit stärkerer Wahrnehmung von PTC verbunden.",
            ("CC", "GG", "TT") => "Die drei Positionen sind mit zwei AVI-Kopien vereinbar. AVI ist in Studien mit schwächerer Wahrnehmung von PTC verbunden.",
            _ => return None,
        };
        return Some(message.into());
    }
    let message = match (item.id.as_str(), first) {
        ("earwax", "TT") => "Dieser Genotyp ist mit trockenem Ohrenschmalz verbunden.",
        ("earwax", "CC" | "CT") => "Dieser Genotyp ist mit überwiegend feuchtem Ohrenschmalz verbunden.",
        ("lactase", "AA" | "AG") => "Der Genotyp enthält die hier untersuchte Variante, die mit erhaltener Laktaseaktivität im Erwachsenenalter verbunden ist.",
        ("lactase", "GG") => "Die hier untersuchte Variante für erhaltene Laktaseaktivität liegt an dieser Position nicht vor. Andere Varianten können ebenfalls eine Rolle spielen.",
        ("actn3", "TT") => "Der vorliegende Genotyp entspricht zwei Stoppvarianten am untersuchten Marker. Das ist mit fehlendem Alpha-Actinin-3 verbunden.",
        ("actn3", "CC" | "CT") => "Am untersuchten Marker ist mindestens eine Kopie ohne diese Stoppvariante vorhanden.",
        _ => return None,
    };
    Some(message.into())
}

pub fn evaluate(data: &Import, catalog: &Catalog) -> Result<Vec<Finding>, String> {
    let markers = catalog.markers()?;
    let by_id: HashMap<_, _> = markers
        .iter()
        .map(|marker| (marker.0.as_str(), marker))
        .collect();
    let wanted: HashSet<_> = markers
        .iter()
        .filter_map(|m| {
            data.build
                .map(|b| (m.2.as_str(), if b == Build::Grch37 { m.3 } else { m.4 }))
        })
        .collect();
    let mut at_pos = HashMap::<_, Vec<_>>::new();
    let mut ids = HashSet::new();
    for row in &data.rows {
        let pos = (row.chromosome.as_str(), row.position);
        if wanted.contains(&pos) {
            at_pos.entry(pos).or_default().push(row);
        }
        if by_id.contains_key(row.id.as_str()) {
            ids.insert(row.id.as_str());
        }
    }
    let mut findings = Vec::new();
    for item in catalog.traits()? {
        let checks: Vec<_> = item
            .markers
            .iter()
            .map(|id| check(by_id[id.as_str()], data, &at_pos, &ids))
            .collect();
        let (status, message) = if checks.iter().any(|c| c.call.is_none()) {
            (
                Status::Missing,
                "Mindestens eine benötigte Position ist für diese Regel nicht auswertbar.".into(),
            )
        } else if item.method == Method::Research {
            (Status::Research, "Der dokumentierte Marker liegt in der Datei vor. Die Quelle beschreibt einen Studienzusammenhang.".into())
        } else if let Some(result) = interpretation(&item, &checks) {
            (Status::Personal, result)
        } else {
            (Status::Missing, "Die Kombination oder Phase lässt sich mit der implementierten Regel nicht eindeutig einordnen.".into())
        };
        findings.push(Finding {
            item,
            status,
            message,
            checks,
        });
    }
    Ok(findings)
}
