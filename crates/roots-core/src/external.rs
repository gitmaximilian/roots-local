use crate::{
    catalog::bounded_read,
    import::{chromosome, Build, Import},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    sync::atomic::{AtomicBool, Ordering::Relaxed},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Related {
    pub name: String,
    pub cm: f64,
    pub relationship: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Segment {
    pub name: String,
    pub chromosome: String,
    pub start: u32,
    pub end: u32,
    pub cm: f64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct External {
    #[serde(default)]
    pub origins: Vec<Origin>,
    #[serde(default)]
    pub matches: Vec<Related>,
    #[serde(default)]
    pub segments: Vec<Segment>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Origin {
    pub label: String,
    pub percent: Option<f64>,
}
fn valid_text(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 160 && !value.chars().any(char::is_control)
}
fn valid_cm(value: f64) -> bool {
    value.is_finite() && (0.0..=8000.0).contains(&value)
}

pub fn origins(value: &str) -> Result<External, String> {
    let rows: Vec<_> = value
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let (label, percent) = if let Some((label, percent)) = line.split_once(';') {
                let percent = percent
                    .trim()
                    .trim_end_matches('%')
                    .replace(',', ".")
                    .parse::<f64>()
                    .ok()
                    .filter(|v| (0.0..=100.0).contains(v))
                    .ok_or("Prozentwerte müssen zwischen 0 und 100 liegen.")?;
                (label.trim(), Some(percent))
            } else {
                (line.trim(), None)
            };
            if !valid_text(label) {
                return Err("Eine Herkunftsbezeichnung ist ungültig.");
            }
            Ok(Origin {
                label: label.to_owned(),
                percent,
            })
        })
        .take(102)
        .collect::<Result<_, _>>()?;
    if rows.len() > 100 {
        return Err("Maximal 100 Herkunftseinträge pro Eingabe.".into());
    }
    Ok(External {
        origins: rows,
        ..External::default()
    })
}

pub fn supporting_file(input: impl Read) -> Result<External, String> {
    let bytes = bounded_read(input, 8 * 1024 * 1024)?;
    let first_line = bytes
        .split(|byte| *byte == b'\n')
        .next()
        .unwrap_or_default();
    let delimiter = if first_line.contains(&b'\t') {
        b'\t'
    } else if first_line.contains(&b';') && !first_line.contains(&b',') {
        b';'
    } else {
        b','
    };
    let mut csv = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_reader(bytes.as_slice());
    let headers = csv
        .headers()
        .map_err(|_| "Die Begleitdatei hat keine gültige Kopfzeile.")?;
    let col = |names: &[&str]| {
        headers.iter().position(|v| {
            let label = v.trim().to_lowercase();
            names.contains(&label.as_str())
        })
    };
    let name = col(&[
        "name",
        "match name",
        "dna match name",
        "dna match",
        "match",
        "name of dna match",
    ])
    .ok_or("Keine Spalte für den Matchnamen gefunden.")?;
    let cm = col(&[
        "cm",
        "shared cm",
        "shared dna (cm)",
        "shared dna (centimorgans)",
        "segment size (cm)",
        "segment size",
        "centimorgans",
    ])
    .ok_or("Keine Centimorgan-Spalte gefunden.")?;
    let chromosome_field = col(&["chr", "chromosome", "chromosom"]);
    let start = col(&[
        "start",
        "start position",
        "genomic start location",
        "start location",
    ]);
    let end = col(&[
        "end",
        "end position",
        "genomic end location",
        "end location",
    ]);
    let relationship = col(&[
        "relationship",
        "estimated relationship",
        "possible relationship",
        "verwandtschaft",
    ]);
    let segment_cols = match (chromosome_field, start, end) {
        (Some(chr), Some(start), Some(end)) => Some((chr, start, end)),
        (None, None, None) => None,
        _ => return Err("Ein Segmentexport benötigt Chromosom, Start und Ende.".into()),
    };
    let mut external = External::default();
    for (index, row) in csv.records().enumerate() {
        if index >= 20_000 {
            return Err("Die Begleitdatei enthält mehr als 20.000 Zeilen.".into());
        }
        let row = row.map_err(|_| "Eine Zeile in der Begleitdatei ist ungültig.")?;
        let get = |i| row.get(i).unwrap_or("").trim();
        let (name, cm) = (
            get(name),
            get(cm)
                .replace(',', ".")
                .parse::<f64>()
                .ok()
                .filter(|v| valid_cm(*v)),
        );
        let cm = cm.ok_or("Ungültiger Centimorgan-Wert.")?;
        if !valid_text(name) {
            return Err("Ungültiger Matchname.".into());
        }
        if let Some((chr, start, end)) = segment_cols {
            let chr = chromosome(get(chr)).ok_or("Ungültiges Segmentchromosom.")?;
            let start = get(start)
                .parse::<u32>()
                .ok()
                .filter(|v| *v > 0)
                .ok_or("Ungültiger Segmentstart.")?;
            let end = get(end)
                .parse::<u32>()
                .ok()
                .filter(|v| *v >= start)
                .ok_or("Ungültiges Segmentende.")?;
            external.segments.push(Segment {
                name: name.into(),
                chromosome: chr,
                start,
                end,
                cm,
            });
        } else {
            external.matches.push(Related {
                name: name.into(),
                cm,
                relationship: relationship
                    .map(get)
                    .filter(|v| valid_text(v))
                    .map(str::to_owned),
            });
        }
    }
    if external.matches.is_empty() && external.segments.is_empty() {
        return Err("Die Begleitdatei enthält keine Datenzeilen.".into());
    }
    Ok(external)
}

#[derive(Clone, Debug, Serialize)]
pub struct Family {
    pub build: Build,
    pub compared: usize,
    pub compatible: usize,
    pub discordant: usize,
    pub identical: usize,
    pub kinship: Option<f64>,
    pub kinship_markers: usize,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Trio {
    pub compared: usize,
    pub phased_heterozygous: usize,
    pub ambiguous: usize,
    pub homozygous: usize,
    pub inconsistent: usize,
    pub assignments: Vec<Assignment>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Assignment {
    pub marker: String,
    pub chromosome: u8,
    pub position: u32,
    pub first: char,
    pub second: char,
}

fn comparable(child: &Import, parent: &Import) -> Result<Build, String> {
    let build = child
        .build
        .filter(|build| Some(*build) == parent.build)
        .ok_or("Beide Dateien müssen dasselbe bekannte Referenzgenom verwenden.")?;
    if child.strand != parent.strand || child.strand == "Rückwärtsstrang" {
        return Err("Der Vergleich erfordert beide Dateien auf dem Vorwärtsstrang.".into());
    }
    Ok(build)
}

pub fn trio(
    child: &Import,
    first: &Import,
    second: &Import,
    markers: &[crate::catalog::Marker],
    cancel: &AtomicBool,
) -> Result<Trio, String> {
    let build = comparable(child, first)?;
    comparable(child, second)?;
    let wanted: HashSet<_> = markers
        .iter()
        .filter_map(|marker| {
            let position = if build == Build::Grch37 {
                marker.3
            } else {
                marker.4
            };
            Some((marker.0.as_str(), marker.2.parse::<u8>().ok()?, position))
        })
        .collect();
    let child = autosomal_calls(child, cancel)?;
    let first = autosomal_calls(first, cancel)?;
    let second = autosomal_calls(second, cancel)?;
    let mut summary = Trio::default();
    for (position, (id, [x, y])) in child
        .into_iter()
        .filter_map(|(key, call)| call.map(|call| (key, call)))
    {
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        let (Some(Some((first_id, first))), Some(Some((second_id, second)))) =
            (first.get(&position), second.get(&position))
        else {
            continue;
        };
        if !id.starts_with("rs") || *first_id != id || *second_id != id {
            continue;
        }
        summary.compared += 1;
        let forward = first.contains(&x) && second.contains(&y);
        let reverse = first.contains(&y) && second.contains(&x);
        match (forward, reverse) {
            (false, false) => summary.inconsistent += 1,
            _ if x == y => summary.homozygous += 1,
            (true, true) => summary.ambiguous += 1,
            _ => {
                summary.phased_heterozygous += 1;
                let (chromosome, coordinate) = position;
                if wanted.contains(&(id, chromosome, coordinate)) {
                    let (first, second) = if forward { (x, y) } else { (y, x) };
                    summary.assignments.push(Assignment {
                        marker: id.to_owned(),
                        chromosome,
                        position: coordinate,
                        first: first.into(),
                        second: second.into(),
                    });
                }
            }
        }
    }
    summary
        .assignments
        .sort_by_key(|assignment| (assignment.chromosome, assignment.position));
    Ok(summary)
}

type AutosomalCalls<'a> = HashMap<(u8, u32), Option<(&'a str, [u8; 2])>>;

fn autosomal_calls<'a>(
    input: &'a Import,
    cancel: &AtomicBool,
) -> Result<AutosomalCalls<'a>, String> {
    let mut values = HashMap::new();
    for row in &input.rows {
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        let Ok(chr) = row.chromosome.parse::<u8>() else {
            continue;
        };
        let call = row.alleles.as_deref().and_then(|alleles| {
            let [first, second] = alleles.as_bytes() else {
                return None;
            };
            (b"ACGT".contains(first) && b"ACGT".contains(second))
                .then_some((row.id.as_str(), [*first, *second]))
        });
        let prior = values.entry((chr, row.position)).or_insert(call);
        if *prior != call {
            *prior = None;
        }
    }
    Ok(values)
}

pub fn compare(child: &Import, parent: &Import) -> Result<Family, String> {
    compare_with_cancel(child, parent, &AtomicBool::new(false))
}

pub fn compare_with_cancel(
    child: &Import,
    parent: &Import,
    cancel: &AtomicBool,
) -> Result<Family, String> {
    let build = comparable(child, parent)?;
    let parent = autosomal_calls(parent, cancel)?;
    let child = autosomal_calls(child, cancel)?;
    let mut summary = Family {
        build,
        compared: 0,
        compatible: 0,
        discordant: 0,
        identical: 0,
        kinship: None,
        kinship_markers: 0,
    };
    let (mut chromosomes, mut het_child, mut het_parent, mut dosage_distance) =
        (HashSet::new(), 0, 0, 0);
    for (position, (id, call)) in child
        .into_iter()
        .filter_map(|(key, call)| call.map(|call| (key, call)))
    {
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        let Some(Some((parent_id, parent))) = parent.get(&position) else {
            continue;
        };
        let identical = call == *parent;
        let has_shared_allele = call.iter().any(|base| parent.contains(base));
        summary.compared += 1;
        summary.compatible += usize::from(has_shared_allele);
        summary.discordant += usize::from(!has_shared_allele);
        summary.identical += usize::from(identical);

        let observed = call.iter().chain(parent).fold(0u8, |mask, base| {
            mask | 1 << b"ACGT".iter().position(|value| value == base).unwrap()
        });
        if id == *parent_id && id.starts_with("rs") && observed.count_ones() <= 2 {
            let child_heterozygous = call[0] != call[1];
            let parent_heterozygous = parent[0] != parent[1];
            summary.kinship_markers += 1;
            chromosomes.insert(position.0);
            het_child += usize::from(child_heterozygous);
            het_parent += usize::from(parent_heterozygous);
            dosage_distance += if !has_shared_allele {
                4
            } else {
                usize::from(!identical)
            };
        }
    }
    let min_het = het_child.min(het_parent);
    // KING-robust between-family estimator, Manichaikul et al., equation 11.
    if summary.kinship_markers >= 10_000 && chromosomes.len() >= 20 && min_het > 0 {
        summary.kinship = Some(0.5 - dosage_distance as f64 / (4.0 * min_het as f64));
    }
    Ok(summary)
}
