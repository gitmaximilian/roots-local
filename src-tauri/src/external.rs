use crate::{
    catalog::bounded_read,
    import::{chromosome, Build, Import},
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};

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

pub fn supporting_file(path: &Path) -> Result<External, String> {
    let bytes = bounded_read(path, 8 * 1024 * 1024)?;
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
}
pub fn compare(child: &Import, parent: &Import) -> Result<Family, String> {
    let build = child
        .build
        .filter(|b| Some(*b) == parent.build)
        .ok_or("Beide Dateien müssen dasselbe bekannte Referenzgenom verwenden.")?;
    if child.strand != parent.strand || child.strand == "Rückwärtsstrang" {
        return Err("Der Vergleich erfordert beide Dateien auf dem Vorwärtsstrang.".into());
    }
    let index = |input: &Import| {
        let mut values = HashMap::new();
        for row in &input.rows {
            if row.chromosome.parse::<u8>().is_err() {
                continue;
            }
            let call = row
                .alleles
                .as_ref()
                .filter(|c| c.len() == 2 && c.bytes().all(|base| b"ACGT".contains(&base)))
                .cloned();
            let prior = values
                .entry((row.chromosome.clone(), row.position))
                .or_insert_with(|| call.clone());
            if *prior != call {
                *prior = None;
            }
        }
        values
    };
    let parent = index(parent);
    let child = index(child);
    let mut summary = Family {
        build,
        compared: 0,
        compatible: 0,
        discordant: 0,
    };
    for (position, child) in child {
        if let (Some(child), Some(Some(parent))) = (child, parent.get(&position)) {
            summary.compared += 1;
            if child.bytes().any(|base| parent.as_bytes().contains(&base)) {
                summary.compatible += 1;
            } else {
                summary.discordant += 1;
            }
        }
    }
    Ok(summary)
}
