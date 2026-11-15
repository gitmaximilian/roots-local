use crate::{
    catalog::{Catalog, Confidence, Marker, Method, Trait},
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
    /// One-line answer to "what does this mean for me?".
    pub conclusion: Option<String>,
    pub confidence: Option<Confidence>,
    /// Copies of the verified effect allele, when the rule defines one.
    pub dosage: Option<u8>,
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
    pub sex_check: SexCheck,
}
/// Heterozygosity outside the pseudoautosomal regions of X. Two X copies
/// show heterozygous calls; a single X copy shows almost none.
#[derive(Clone, Debug, Serialize, Default, PartialEq)]
pub struct SexCheck {
    pub x_called: usize,
    pub x_heterozygous: usize,
    pub y_called: usize,
    /// "xx", "xy", or none when the data do not separate the two patterns.
    pub pattern: Option<&'static str>,
}
const MIN_X_CALLS: usize = 500;

fn in_par(build: Option<Build>, position: u32) -> bool {
    let ranges: &[(u32, u32)] = match build {
        Some(Build::Grch37) => &[(60_001, 2_699_520), (154_931_044, 155_260_560)],
        Some(Build::Grch38) => &[(10_001, 2_781_479), (155_701_383, 156_030_895)],
        None => &[(10_001, 2_781_479), (154_931_044, 156_030_895)],
    };
    ranges
        .iter()
        .any(|(start, end)| (*start..=*end).contains(&position))
}

pub fn sex_check(data: &Import) -> SexCheck {
    let mut check = SexCheck::default();
    for row in &data.rows {
        let Some(call) = row.alleles.as_deref() else {
            continue;
        };
        match row.chromosome.as_str() {
            "X" if !in_par(data.build, row.position) && !call.contains(['I', 'D']) => {
                check.x_called += 1;
                let bytes = call.as_bytes();
                if bytes.len() == 2 && bytes[0] != bytes[1] {
                    check.x_heterozygous += 1;
                }
            }
            "Y" => check.y_called += 1,
            _ => {}
        }
    }
    if check.x_called >= MIN_X_CALLS {
        let rate = check.x_heterozygous as f64 / check.x_called as f64;
        check.pattern = if rate < 0.02 {
            Some("xy")
        } else if rate > 0.1 {
            Some("xx")
        } else {
            None
        };
    }
    check
}

fn complement(base: u8) -> u8 {
    match base {
        b'A' => b'T',
        b'T' => b'A',
        b'C' => b'G',
        b'G' => b'C',
        other => other,
    }
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
        sex_check: sex_check(data),
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
    let reverse = data.strand == "Rückwärtsstrang";
    if reverse && (allowed == "AT" || allowed == "CG") {
        check.status = "Rückwärtsstrang bei A/T- oder C/G-Marker nicht eindeutig";
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
            let mut bytes = alleles.as_bytes().to_vec();
            if reverse {
                bytes.iter_mut().for_each(|b| *b = complement(*b));
                bytes.sort_unstable();
            }
            let alleles = String::from_utf8(bytes).unwrap_or_default();
            if alleles.len() == 2 && alleles.bytes().all(|c| allowed.as_bytes().contains(&c)) {
                check.call = Some(alleles);
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

fn outcome<'a>(item: &'a Trait, checks: &[Check]) -> Option<&'a crate::catalog::Outcome> {
    let key = checks
        .iter()
        .map(|check| check.call.as_deref())
        .collect::<Option<Vec<_>>>()?
        .join("/");
    item.outcomes
        .iter()
        .find(|outcome| outcome.calls.iter().any(|call| *call == key))
}

fn dosage(item: &Trait, checks: &[Check]) -> Option<u8> {
    let effect = item.effect.as_ref()?;
    let call = checks
        .iter()
        .find(|c| c.id == effect.marker)?
        .call
        .as_deref()?;
    Some(call.chars().filter(|c| *c == effect.allele).count() as u8)
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
        || outcome(&finding.item, &finding.checks).is_some()
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
        finding.conclusion = Some("Wahrscheinlich mittlere Bitter-Wahrnehmung (AVI/PAV)".into());
        finding.confidence = Some(Confidence::Moderate);
    }
}

pub fn evaluate_with_coverage(
    data: &Import,
    catalog: &Catalog,
) -> Result<(usize, Vec<Finding>), String> {
    let mut at_pos = HashMap::<_, Vec<_>>::new();
    let mut ids = HashSet::new();
    for row in &data.rows {
        let pos = (row.chromosome.as_str(), row.position);
        if data
            .build
            .is_some_and(|build| catalog.has_position(build, pos.0, pos.1))
        {
            at_pos.entry(pos).or_default().push(row);
        }
        if catalog.marker(&row.id).is_some() {
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
                let marker = catalog
                    .marker(id)
                    .ok_or("Der Referenzkatalog ist unvollständig.")?;
                Ok(check(
                    marker,
                    data,
                    &at_pos,
                    &ids,
                    item.require_identifier
                        || item.method == Method::Gwas
                        || item.section.starts_with("15."),
                ))
            })
            .collect::<Result<_, String>>()?;
        let complete = checks.iter().all(|c| c.call.is_some());
        gwas_total += usize::from(item.method == Method::Gwas);
        // Large catalogs contribute observed loci to the report. Existing curated
        // rules still show missing markers explicitly.
        if item.method == Method::Gwas && !complete {
            continue;
        }
        let mut conclusion = None;
        let mut confidence = None;
        let copies = dosage(&item, &checks);
        let (status, message) = if item.method == Method::Gwas {
            (Status::Research, "rsID und Koordinate stimmen mit dem Katalog überein. Die Effektallel-Zuordnung wurde nicht geprüft.".into())
        } else if !complete {
            (
                Status::Missing,
                "Mindestens eine benötigte Position ist für diese Regel nicht auswertbar.".into(),
            )
        } else if let (Some(effect), Some(n)) = (&item.effect, copies) {
            conclusion = Some(effect.conclusions[n as usize].clone());
            confidence = Some(effect.confidence);
            (
                Status::Personal,
                "Die Anzahl der Kopien des geprüften Allels wurde aus der Rohdatei bestimmt."
                    .into(),
            )
        } else if item.method == Method::Research {
            (Status::Research, "Der dokumentierte Marker liegt in der Datei vor. Die Quelle beschreibt einen Studienzusammenhang.".into())
        } else if let Some(result) = outcome(&item, &checks) {
            conclusion = Some(result.conclusion.clone());
            confidence = Some(result.confidence);
            (Status::Personal, result.message.clone())
        } else {
            (Status::Missing, "Die Kombination oder Phase lässt sich mit der implementierten Regel nicht eindeutig einordnen.".into())
        };
        findings.push(Finding {
            item,
            status,
            message,
            checks,
            conclusion,
            confidence,
            dosage: copies,
        });
    }
    Ok((gwas_total, findings))
}
