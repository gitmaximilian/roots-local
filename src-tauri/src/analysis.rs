use crate::{
    catalog::{Catalog, Marker, Method, Trait},
    import::{Build, Import, Variant},
    variants::Conflicts,
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
    summary_with_conflicts(data).0
}

pub fn summary_with_conflicts(data: &Import) -> (Summary, Conflicts) {
    let mut counts = HashMap::new();
    let mut positions = HashMap::new();
    let mut conflicts = HashMap::<&str, HashSet<u32>>::new();
    let mut duplicates = 0;
    for row in &data.rows {
        *counts.entry(&row.chromosome).or_insert(0) += 1;
        let key = (&row.chromosome, row.position);
        if let Some(previous) = positions.insert(key, row.alleles.as_ref()) {
            duplicates += 1;
            if previous != row.alleles.as_ref() {
                conflicts
                    .entry(&row.chromosome)
                    .or_default()
                    .insert(row.position);
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
    let total_conflicts = conflicts.values().map(HashSet::len).sum();
    let summary = Summary {
        format: data.format,
        strand: data.strand,
        build: data.build,
        rows: data.rows.len(),
        skipped: data.skipped,
        no_call: data.rows.iter().filter(|r| r.alleles.is_none()).count(),
        chromosomes,
        duplicates,
        conflicts: total_conflicts,
    };
    (
        summary,
        conflicts
            .into_iter()
            .map(|(chr, positions)| (chr.to_owned(), positions))
            .collect(),
    )
}

fn check(
    marker: &Marker,
    data: &Import,
    at_pos: &HashMap<(&str, u32), Vec<&Variant>>,
    ids: &HashSet<&str>,
    require_identifier: bool,
) -> Check {
    let Marker(id, gene, chromosome, old, new, allowed) = marker;
    let position = data
        .build
        .map(|build| if build == Build::Grch37 { *old } else { *new })
        .filter(|position| *position > 0);
    let mut check = Check {
        id: id.clone(),
        gene: gene.clone(),
        coordinate: position.map(|pos| format!("{chromosome}:{pos}")),
        call: None,
        status: "Referenzgenom unbekannt",
    };
    let Some(position) = position else {
        if data.build.is_some() {
            check.status = "Keine Zuordnung zu diesem Referenzgenom";
        }
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
        } else if require_identifier && !rows.iter().any(|row| row.id == *id) {
            check.status = "Genomort ohne bestätigte rsID";
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
    Ok(evaluate_with_coverage(data, catalog)?.1)
}

pub fn resolve_bitter_phase(findings: &mut [Finding], trio: &crate::external::Trio) {
    let Some(finding) = findings
        .iter_mut()
        .find(|finding| finding.item.id == "bitter" && finding.item.method == Method::Bitter)
    else {
        return;
    };
    let [first, second, third] = finding.checks.as_slice() else {
        return;
    };
    if [first.id.as_str(), second.id.as_str(), third.id.as_str()]
        != ["rs713598", "rs1726866", "rs10246939"]
    {
        return;
    }
    if finding.checks.iter().any(|check| check.call.is_none())
        || interpretation(&finding.item, &finding.checks).is_some()
    {
        return;
    }
    finding.status = Status::Missing;
    finding.message = "Die Kombination oder Phase lässt sich mit der implementierten Regel nicht eindeutig einordnen.".into();
    let alleles = |check: &Check| {
        let coordinate = check.coordinate.as_deref()?;
        let call = check.call.as_deref()?;
        let assignment = trio.assignments.iter().find(|assignment| {
            assignment.marker == check.id
                && format!("{}:{}", assignment.chromosome, assignment.position) == coordinate
        })?;
        (assignment.first != assignment.second
            && call.contains(assignment.first)
            && call.contains(assignment.second))
        .then_some((assignment.first, assignment.second))
    };
    let [Some((a, x)), Some((b, y)), Some((c, z))] = [first, second, third].map(alleles) else {
        return;
    };
    if matches!(
        ([a, b, c], [x, y, z]),
        (['G', 'A', 'C'], ['C', 'G', 'T']) | (['C', 'G', 'T'], ['G', 'A', 'C'])
    ) {
        finding.status = Status::Personal;
        finding.message = "Die Elterndateien ordnen die drei Marker als AVI/PAV zu. Studien verbinden diese Kombination mit mittlerer PTC-Empfindlichkeit.".into();
    }
}

pub fn evaluate_with_coverage(
    data: &Import,
    catalog: &Catalog,
) -> Result<(usize, Vec<Finding>), String> {
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
        .filter(|(_, position)| *position > 0)
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
    let mut gwas_total = 0;
    for item in catalog.traits()? {
        let checks: Vec<_> = item
            .markers
            .iter()
            .map(|id| {
                check(
                    by_id[id.as_str()],
                    data,
                    &at_pos,
                    &ids,
                    item.method == Method::Gwas || item.section.starts_with("15."),
                )
            })
            .collect();
        let complete = checks.iter().all(|c| c.call.is_some());
        gwas_total += usize::from(item.method == Method::Gwas);
        // Large catalogs contribute observed loci to the report. Existing curated
        // rules still show missing markers explicitly.
        if item.method == Method::Gwas && !complete {
            continue;
        }
        let (status, message) = if item.method == Method::Gwas {
            (Status::Research, "rsID und Koordinate stimmen mit dem Katalog überein. Die Effektallel-Zuordnung wurde nicht geprüft.".into())
        } else if !complete {
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
    Ok((gwas_total, findings))
}
