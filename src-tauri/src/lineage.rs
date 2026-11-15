use serde::{Deserialize, Serialize};
use std::{fs::File, io::Read, path::Path};

const MAX_BYTES: u64 = 16 * 1024;
const INVALID: &str = "Die Datei enthält kein unterstütztes Haplogrep-Ergebnis.";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Maternal {
    schema: u8,
    tool_version: String,
    tree: String,
    covered_positions: u32,
    candidates: Vec<Candidate>,
    warnings: u32,
    errors: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Candidate {
    haplogroup: String,
    quality: f64,
}

pub fn maternal_file(path: &Path) -> Result<Maternal, String> {
    let file = File::open(path).map_err(|_| "Datei konnte nicht geöffnet werden.")?;
    let mut contents = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut contents)
        .map_err(|_| INVALID)?;
    if contents.len() as u64 > MAX_BYTES {
        return Err(INVALID.into());
    }
    let result: Maternal = serde_json::from_slice(&contents).map_err(|_| INVALID)?;
    if result.schema != 1
        || result.tool_version != "3.3.2"
        || result.tree != "phylotree-rcrs@17.3"
        || !(1..=16_569).contains(&result.covered_positions)
        || !(1..=2).contains(&result.candidates.len())
        || result.candidates.iter().any(|candidate| !candidate.valid())
        || result
            .candidates
            .windows(2)
            .any(|hits| hits[0].quality < hits[1].quality)
    {
        return Err(INVALID.into());
    }
    Ok(result)
}

impl Candidate {
    fn valid(&self) -> bool {
        let label = self.haplogroup.as_bytes();
        (1..=40).contains(&label.len())
            && label[0].is_ascii_uppercase()
            && label
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(byte))
            && (0.0..=1.0).contains(&self.quality)
    }
}
