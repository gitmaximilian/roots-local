use crate::import::{Build, Import, Variant};
use flate2::bufread::MultiGzDecoder;
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap},
    fs::File,
    io::{BufRead, BufReader, Read},
    path::Path,
    sync::atomic::{AtomicBool, Ordering::Relaxed},
};

const INVALID: &str = "Die Datei ist keine unterstützte ClinVar-VCF.";
const BUILD_MISMATCH: &str = "ClinVar und die Rohdaten benötigen dasselbe bekannte Referenzgenom.";
const MAX_UNCOMPRESSED: u64 = 8 * 1024 * 1024 * 1024;
const MAX_LINE: u64 = 2 * 1024 * 1024;
const COLUMNS: &str = "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO";

#[derive(Clone, Debug, Serialize)]
pub struct Matches {
    pub release: String,
    pub build: Build,
    pub variants: Vec<Match>,
    pub gene_validity: Option<GeneValidity>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Match {
    pub id: u64,
    pub marker: String,
    pub chromosome: String,
    pub position: u32,
    pub alternate: char,
    pub copies: u8,
    pub classifications: String,
    pub conflicting_classifications: String,
    pub review_status: String,
    pub conditions: String,
    pub genes: Vec<String>,
    pub mondo: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct GeneValidity {
    pub date: String,
    pub records: Vec<GeneDisease>,
}

#[derive(Clone, Debug, Serialize)]
pub struct GeneDisease {
    pub gene: String,
    pub hgnc: String,
    pub disease: String,
    pub mondo: String,
    pub inheritance: String,
    pub classification: String,
    pub evidence_url: String,
}

pub fn file(path: &Path, data: &Import, cancel: &AtomicBool) -> Result<Matches, String> {
    let file = File::open(path).map_err(|_| "Datei konnte nicht geöffnet werden.")?;
    let mut reader = BufReader::new(file);
    let compressed = reader
        .fill_buf()
        .map_err(|_| INVALID)?
        .starts_with(&[0x1f, 0x8b]);
    if compressed {
        parse(MultiGzDecoder::new(reader), data, cancel)
    } else {
        parse(reader, data, cancel)
    }
}

fn parse(input: impl Read, data: &Import, cancel: &AtomicBool) -> Result<Matches, String> {
    let build = data.build.ok_or(BUILD_MISMATCH)?;
    if data.strand == "Rückwärtsstrang" {
        return Err("ClinVar benötigt Rohdaten auf dem Vorwärtsstrang.".into());
    }
    let mut positions = HashMap::<(&str, u32), Option<&Variant>>::new();
    for row in &data.rows {
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        positions
            .entry((&row.chromosome, row.position))
            .and_modify(|stored| {
                if stored.is_some_and(|previous| previous != row) {
                    *stored = None;
                }
            })
            .or_insert(Some(row));
    }
    let mut input = BufReader::new(input.take(MAX_UNCOMPRESSED + 1));
    let mut line = String::new();
    let mut release = None;
    let mut reference = None;
    let mut source = false;
    let mut header = false;
    let mut read = 0;
    let mut variants = BTreeMap::new();
    loop {
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        line.clear();
        let count = (&mut input)
            .take(MAX_LINE)
            .read_line(&mut line)
            .map_err(|_| INVALID)?;
        if count == 0 {
            break;
        }
        read += count as u64;
        if read > MAX_UNCOMPRESSED || count as u64 >= MAX_LINE {
            return Err("Die ClinVar-Datei überschreitet das Größenlimit.".into());
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if !header {
            if line == COLUMNS {
                if !source || release.is_none() {
                    return Err(INVALID.into());
                }
                if reference.as_deref() != Some(build.label()) {
                    return Err(BUILD_MISMATCH.into());
                }
                header = true;
            } else if let Some(value) = line.strip_prefix("##reference=") {
                if reference.replace(value.to_owned()).is_some() {
                    return Err(INVALID.into());
                }
            } else if let Some(value) = line.strip_prefix("##fileDate=") {
                if value.len() <= 10
                    && value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || byte == b'-')
                    && !value.is_empty()
                {
                    release = Some(value.to_owned());
                }
            } else if line == "##source=ClinVar" {
                source = true;
            } else if !line.starts_with("##") {
                return Err(INVALID.into());
            }
            continue;
        }
        let mut fields = line.split('\t');
        let [Some(chromosome), Some(position), Some(id), Some(reference), Some(alternate), Some(_), Some(_), Some(info)] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(INVALID.into());
        };
        if let Some(hit) = match_row(
            &positions, chromosome, position, id, reference, alternate, info,
        ) {
            if variants.insert(hit.id, hit).is_some() {
                return Err(INVALID.into());
            }
        }
    }
    if !header {
        return Err(INVALID.into());
    }
    Ok(Matches {
        release: release.ok_or(INVALID)?,
        build,
        variants: variants.into_values().collect(),
        gene_validity: None,
    })
}

fn match_row(
    positions: &HashMap<(&str, u32), Option<&Variant>>,
    chromosome: &str,
    position: &str,
    id: &str,
    reference: &str,
    alternate: &str,
    info: &str,
) -> Option<Match> {
    // Restrict matches to diploid autosomal single-base calls.
    if !(1..=22).contains(&chromosome.parse::<u8>().ok()?) {
        return None;
    }
    let position = position.parse().ok()?;
    let row = positions.get(&(chromosome, position))?.as_ref()?;
    let (reference, alternate) = (reference.as_bytes(), alternate.as_bytes());
    if reference.len() != 1
        || alternate.len() != 1
        || reference == alternate
        || !b"ACGT".contains(&reference[0])
        || !b"ACGT".contains(&alternate[0])
    {
        return None;
    }
    let call = row.alleles.as_deref()?.as_bytes();
    if call.len() != 2
        || !call
            .iter()
            .all(|base| reference.contains(base) || alternate.contains(base))
    {
        return None;
    }
    let copies = call.iter().filter(|base| **base == alternate[0]).count() as u8;
    if copies == 0 {
        return None;
    }
    let field = |key| {
        info.split(';')
            .filter_map(|item| item.split_once('='))
            .find_map(|(name, value)| (name == key).then_some(value))
    };
    let marker = row.id.strip_prefix("rs")?;
    if !field("RS")?.split(['|', ',']).any(|rs| rs == marker) {
        return None;
    }
    let classifications = field("CLNSIG")?;
    if !classifications.split(['|', '/']).any(|value| {
        matches!(
            value,
            "Pathogenic"
                | "Likely_pathogenic"
                | "Conflicting_classifications_of_pathogenicity"
                | "Conflicting_interpretations_of_pathogenicity"
        )
    }) {
        return None;
    }
    let display = |value: &str| value.replace('_', " ").replace('|', " · ");
    let genes = field("GENEINFO")
        .unwrap_or("")
        .split('|')
        .filter_map(|gene| {
            let (symbol, _) = gene.split_once(':')?;
            (!symbol.is_empty()).then(|| symbol.to_owned())
        })
        .collect();
    let mondo = field("CLNDISDB")
        .unwrap_or("")
        .split([',', '|'])
        .filter_map(|term| {
            let suffix = term.strip_prefix("MONDO:")?;
            let digits = suffix.strip_prefix("MONDO:").unwrap_or(suffix);
            (digits.len() == 7 && digits.bytes().all(|byte| byte.is_ascii_digit()))
                .then(|| format!("MONDO:{digits}"))
        })
        .collect();
    Some(Match {
        id: id.parse().ok()?,
        marker: row.id.clone(),
        chromosome: chromosome.to_owned(),
        position,
        alternate: alternate[0].into(),
        copies,
        classifications: display(classifications),
        conflicting_classifications: display(field("CLNSIGCONF").unwrap_or("")),
        review_status: display(field("CLNREVSTAT")?),
        conditions: display(field("CLNDN").unwrap_or("")),
        genes,
        mondo,
    })
}

pub fn gene_validity(
    path: &Path,
    matches: &Matches,
    cancel: &AtomicBool,
) -> Result<GeneValidity, String> {
    const INVALID: &str = "Die Datei ist keine unterstützte ClinGen-CSV.";
    const MAX_BYTES: u64 = 16 * 1024 * 1024;
    let file = File::open(path).map_err(|_| "Datei konnte nicht geöffnet werden.")?;
    if file.metadata().map_err(|_| INVALID)?.len() > MAX_BYTES {
        return Err(INVALID.into());
    }
    let mut csv = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(file.take(MAX_BYTES + 1));
    let mut rows = csv.records();
    let first = rows.next().ok_or(INVALID)?.map_err(|_| INVALID)?;
    let second = rows.next().ok_or(INVALID)?.map_err(|_| INVALID)?;
    if first.get(0) != Some("CLINGEN GENE DISEASE VALIDITY CURATIONS") {
        return Err(INVALID.into());
    }
    let date = second
        .get(0)
        .and_then(|header| header.strip_prefix("FILE CREATED: "))
        .filter(|value| {
            value.len() == 10
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || byte == b'-')
        })
        .ok_or(INVALID)?;
    let columns = rows.nth(2).ok_or(INVALID)?.map_err(|_| INVALID)?;
    let [Some(gene), Some(hgnc), Some(disease), Some(mondo), Some(inheritance), Some(classification), Some(url)] =
        [
            "GENE SYMBOL",
            "GENE ID (HGNC)",
            "DISEASE LABEL",
            "DISEASE ID (MONDO)",
            "MOI",
            "CLASSIFICATION",
            "ONLINE REPORT",
        ]
        .map(|field| columns.iter().position(|name| name == field))
    else {
        return Err(INVALID.into());
    };
    // Use a curated gene symbol and the same MONDO concept. A multi-gene ClinVar
    // record does not attribute all conditions to every gene in its summary.
    let wanted: std::collections::HashSet<_> = matches
        .variants
        .iter()
        .filter(|variant| variant.genes.len() == 1)
        .flat_map(|variant| {
            variant
                .mondo
                .iter()
                .map(|mondo| (variant.genes[0].as_str(), mondo.as_str()))
        })
        .collect();
    let mut records = BTreeMap::new();
    for row in rows {
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        let row = row.map_err(|_| INVALID)?;
        let field = |index| row.get(index).unwrap_or("").trim();
        if !wanted.contains(&(field(gene), field(mondo))) {
            continue;
        }
        let evidence_url = field(url);
        let valid_url = evidence_url
            .strip_prefix("https://search.clinicalgenome.org/kb/gene-validity/")
            .is_some_and(|suffix| {
                !suffix.is_empty()
                    && suffix
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b":_-.+".contains(&byte))
            });
        if !valid_url || field(classification).is_empty() {
            continue;
        }
        records.insert(
            evidence_url.to_owned(),
            GeneDisease {
                gene: field(gene).to_owned(),
                hgnc: field(hgnc).to_owned(),
                disease: field(disease).to_owned(),
                mondo: field(mondo).to_owned(),
                inheritance: field(inheritance).to_owned(),
                classification: field(classification).to_owned(),
                evidence_url: evidence_url.to_owned(),
            },
        );
    }
    let mut records: Vec<_> = records.into_values().collect();
    records.sort_by(|first, second| {
        (&first.gene, &first.disease).cmp(&(&second.gene, &second.disease))
    });
    Ok(GeneValidity {
        date: date.to_owned(),
        records,
    })
}
