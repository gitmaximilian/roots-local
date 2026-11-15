use csv::{ReaderBuilder, StringRecord};
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::Path,
    sync::atomic::{AtomicBool, Ordering::Relaxed},
};
use zip::ZipArchive;

pub const MAX_INPUT: u64 = 128 * 1024 * 1024;
const MAX_ROWS: usize = 2_000_000;
const MAX_LINE: u64 = 32 * 1024;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Build {
    #[serde(rename = "GRCh37")]
    Grch37,
    #[serde(rename = "GRCh38")]
    Grch38,
}
impl Build {
    pub fn label(self) -> &'static str {
        match self {
            Self::Grch37 => "GRCh37",
            Self::Grch38 => "GRCh38",
        }
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Variant {
    pub id: String,
    pub chromosome: String,
    pub position: u32,
    pub alleles: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct Import {
    pub build: Option<Build>,
    pub format: &'static str,
    pub strand: &'static str,
    pub rows: Vec<Variant>,
    pub skipped: usize,
}

pub fn chromosome(value: &str) -> Option<String> {
    let upper = value.trim().to_ascii_uppercase();
    let bare = upper.strip_prefix("CHR").unwrap_or(&upper);
    match bare {
        "X" | "Y" | "XY" => Some(bare.into()),
        "M" | "MT" => Some("MT".into()),
        n => n
            .parse::<u8>()
            .ok()
            .filter(|n| (1..=22).contains(n))
            .map(|n| n.to_string()),
    }
}

fn canonical_call(raw: &str) -> Option<Option<String>> {
    let call = raw.trim().to_ascii_uppercase();
    if ["", "-", "--", "—", "0", "00", "NN", "N", ".", "NA", "NC"].contains(&call.as_str()) {
        return Some(None);
    }
    if (1..=2).contains(&call.len()) && call.bytes().all(|c| b"ACGTID".contains(&c)) {
        let mut bytes = call.into_bytes();
        bytes.sort_unstable();
        return Some(String::from_utf8(bytes).ok());
    }
    None
}
fn field(row: &StringRecord, index: usize) -> &str {
    row.get(index).unwrap_or("").trim()
}
fn normalized(s: &str) -> String {
    s.to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

pub fn parse(input: impl Read, cancel: &AtomicBool) -> Result<Import, String> {
    let mut input = BufReader::new(input.take(MAX_INPUT + 1));
    let mut line = String::new();
    let mut build = None;
    let mut strand = "Vorwärtsstrang (MyHeritage-Format)";
    let mut read = 0;
    loop {
        line.clear();
        let n = (&mut input)
            .take(MAX_LINE)
            .read_line(&mut line)
            .map_err(|_| "Datei ist keine gültige UTF-8-Textdatei.")?;
        if n == 0 || n as u64 == MAX_LINE {
            return Err("Keine gültige MyHeritage-Kopfzeile gefunden.".into());
        }
        read += n;
        if read > 256 * 1024 {
            return Err("Der Dateikopf ist unerwartet groß.".into());
        }
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        let content = line.trim_start_matches('\u{feff}').trim();
        if content.is_empty() {
            continue;
        }
        if !content.starts_with('#') {
            line = content.to_owned();
            break;
        }
        let metadata = content.to_ascii_lowercase();
        if ["build", "assembly", "reference", "grch"]
            .iter()
            .any(|token| metadata.contains(token))
        {
            let old = [
                "grch37",
                "hg19",
                "build 37",
                "build=37",
                "build37",
                "build: 37",
            ]
            .iter()
            .any(|t| metadata.contains(t));
            let new = [
                "grch38",
                "hg38",
                "build 38",
                "build=38",
                "build38",
                "build: 38",
            ]
            .iter()
            .any(|t| metadata.contains(t));
            if old && new {
                return Err("Widersprüchliche Referenzgenome im Dateikopf.".into());
            }
            let candidate = if old {
                Some(Build::Grch37)
            } else if new {
                Some(Build::Grch38)
            } else {
                None
            };
            if let Some(candidate) = candidate {
                if build.is_some_and(|existing| existing != candidate) {
                    return Err("Widersprüchliche Referenzgenome im Dateikopf.".into());
                }
                build = Some(candidate);
            }
        }
        if metadata.contains("strand")
            && (metadata.contains("reverse") || metadata.contains("minus"))
        {
            strand = "Rückwärtsstrang";
        }
    }
    let delim = if line.contains('\t') { b'\t' } else { b',' };
    line.push('\n');
    let mut csv = ReaderBuilder::new()
        .delimiter(delim)
        .comment(Some(b'#'))
        .flexible(true)
        .from_reader(line.as_bytes().chain(input));
    let header = csv.headers().map_err(|_| "Ungültige Tabellenkopfzeile.")?;
    let index = |aliases: &[&str]| {
        header
            .iter()
            .position(|field| aliases.contains(&normalized(field).as_str()))
    };
    let id = index(&["rsid", "snp", "marker", "id"]);
    let chr = index(&["chromosome", "chr"]);
    let pos = index(&["position", "pos"]);
    let genotype = index(&["result", "genotype", "alleles"]);
    let pair = index(&["allele1"]).zip(index(&["allele2"]));
    let (Some(chr), Some(pos), true) = (chr, pos, genotype.is_some() || pair.is_some()) else {
        return Err(
            "Erwartet werden Chromosom, Position und Genotyp oder zwei Allelspalten.".into(),
        );
    };
    let mut rows = Vec::new();
    let mut skipped = 0;
    let mut record = StringRecord::new();
    while csv
        .read_record(&mut record)
        .map_err(|_| "Die Tabelle enthält ungültigen Text.")?
    {
        if cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        if rows.len() + skipped >= MAX_ROWS
            || csv.position().byte() > MAX_INPUT
            || record.as_slice().len() as u64 >= MAX_LINE
        {
            return Err("Die Tabelle überschreitet das Größenlimit.".into());
        }
        let value = genotype
            .map(|i| field(&record, i).to_owned())
            .or_else(|| {
                pair.map(|(a, b)| {
                    let (a, b) = (field(&record, a), field(&record, b));
                    if (a.is_empty()) != (b.is_empty()) || a.len() > 1 || b.len() > 1 {
                        return "00".into();
                    }
                    format!("{a}{b}")
                })
            })
            .unwrap_or_default();
        let row_id = id.map(|i| field(&record, i)).unwrap_or("");
        let position = field(&record, pos).parse::<u32>().ok().filter(|p| *p > 0);
        let (Some(chromosome), Some(position), Some(alleles)) = (
            chromosome(field(&record, chr)),
            position,
            canonical_call(&value),
        ) else {
            skipped += 1;
            continue;
        };
        if row_id.len() > 80 || row_id.chars().any(char::is_control) {
            skipped += 1;
            continue;
        }
        rows.push(Variant {
            id: row_id.to_owned(),
            chromosome,
            position,
            alleles,
        });
    }
    if rows.is_empty() {
        return Err("Keine gültigen Genotypzeilen im Export gefunden.".into());
    }
    Ok(Import {
        build,
        format: if delim == b'\t' { "TSV" } else { "CSV" },
        strand,
        rows,
        skipped,
    })
}

/// Imports a raw data file (CSV, TSV, TXT, or a ZIP with one such table).
pub fn file(mut file: impl Read + Seek, cancel: &AtomicBool) -> Result<Import, String> {
    let length = file
        .seek(SeekFrom::End(0))
        .and_then(|length| file.seek(SeekFrom::Start(0)).map(|_| length))
        .map_err(|_| "Dateigröße konnte nicht gelesen werden.")?;
    if length > MAX_INPUT {
        return Err("Die Datei überschreitet 128 MiB.".into());
    }
    let mut reader = BufReader::with_capacity(1 << 20, file);
    if reader
        .fill_buf()
        .map_err(|_| "Die Datei konnte nicht gelesen werden.")?
        .starts_with(b"PK\x03\x04")
    {
        let mut zip = ZipArchive::new(reader).map_err(|_| "Ungültiges ZIP-Archiv.")?;
        if zip.len() > 64 {
            return Err("Das ZIP enthält zu viele Einträge.".into());
        }
        let candidates: Vec<_> = zip
            .file_names()
            .filter(|name| {
                Path::new(name)
                    .extension()
                    .and_then(|s| s.to_str())
                    .is_some_and(|ext| {
                        ["csv", "txt", "tsv"]
                            .iter()
                            .any(|item| ext.eq_ignore_ascii_case(item))
                    })
            })
            .map(str::to_owned)
            .collect();
        let [name] = candidates.as_slice() else {
            return Err("Das ZIP muss genau eine Genotyp-Tabelle enthalten.".into());
        };
        let mut entry = zip
            .by_name(name)
            .map_err(|_| "Die ZIP-Tabelle ist nicht lesbar.")?;
        if entry.size() > MAX_INPUT {
            return Err("Die entpackte Tabelle überschreitet 128 MiB.".into());
        }
        let mut out = parse(&mut entry, cancel)?;
        // Drain through the ZIP reader to validate CRC even at the parser's input limit.
        let tail = std::io::copy(&mut entry.take(1), &mut std::io::sink())
            .map_err(|_| "Die ZIP-Tabelle ist beschädigt.")?;
        if tail != 0 {
            return Err("Die entpackte Tabelle überschreitet das Größenlimit.".into());
        }
        out.format = if out.format == "TSV" {
            "ZIP / TSV"
        } else {
            "ZIP / CSV"
        };
        Ok(out)
    } else {
        parse(reader, cancel)
    }
}
