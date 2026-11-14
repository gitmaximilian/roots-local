use ed25519_dalek::{Signature, VerifyingKey};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, io::Read, path::Path};
use tempfile::NamedTempFile;

pub const STRUCTURE: &str = include_str!("../../docs/reportstruktur.md");
pub const STARTER: &str = include_str!("../../catalog/starter.json");
const MAX_PAYLOAD: u64 = 32 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
pub struct Section {
    pub id: String,
    pub title: String,
    pub scope: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub part: String,
    pub sections: Vec<Section>,
}
pub fn structure() -> Vec<Chapter> {
    let mut result: Vec<Chapter> = Vec::new();
    let mut part = "";
    for line in STRUCTURE.lines() {
        if let Some(title) = line.strip_prefix("## Teil ") {
            part = title;
        }
        if let Some((id, title)) = line
            .strip_prefix("### ")
            .and_then(|line| line.split_once(" · "))
        {
            result.push(Chapter {
                id: id.into(),
                title: title.into(),
                part: part.into(),
                sections: Vec::new(),
            });
        }
        if let Some((heading, scope)) = line
            .strip_prefix("- **")
            .and_then(|line| line.split_once("** · "))
        {
            if let Some((id, title)) = heading
                .split_once(' ')
                .filter(|(id, _)| id.as_bytes().get(2) == Some(&b'.'))
            {
                if let Some(chapter) = result.last_mut() {
                    chapter.sections.push(Section {
                        id: id.into(),
                        title: title.into(),
                        scope: scope.into(),
                    });
                }
            }
        }
    }
    result
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Marker(
    pub String,
    pub String,
    pub String,
    pub u32,
    pub u32,
    pub String,
);
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Trait {
    pub id: String,
    pub section: String,
    pub title: String,
    pub markers: Vec<String>,
    pub method: Method,
    pub evidence: String,
    pub summary: String,
    pub limits: String,
    pub population: String,
    pub sources: Vec<(String, String)>,
    #[serde(default)]
    pub cross: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Method {
    Single,
    Bitter,
    Research,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Payload {
    pub version: String,
    pub markers: Vec<Marker>,
    pub traits: Vec<Trait>,
    #[serde(default)]
    pub scores: Vec<crate::pgs::Score>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema: u8,
    pub version: String,
    pub origin: String,
    pub license: String,
    pub builds: Vec<String>,
    pub sha256: String,
}

pub struct Catalog {
    pub version: String,
    db: Connection,
    pub scores: Vec<crate::pgs::Score>,
    pub provenance: Option<Manifest>,
}
impl Catalog {
    pub fn starter() -> Result<Self, String> {
        Self::from_payload(
            serde_json::from_str(STARTER).map_err(|_| "Der Startkatalog ist beschädigt.")?,
        )
    }
    fn from_payload(payload: Payload) -> Result<Self, String> {
        let sections: HashSet<_> = structure()
            .into_iter()
            .flat_map(|chapter| chapter.sections)
            .map(|s| s.id)
            .collect();
        let marker_ids: HashSet<_> = payload
            .markers
            .iter()
            .map(|marker| marker.0.as_str())
            .collect();
        let valid_id = |id: &str| {
            !id.is_empty()
                && id.len() <= 80
                && id
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        };
        let valid_version = !payload.version.is_empty()
            && payload.version.len() <= 64
            && payload
                .version
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b".-_".contains(&c));
        if !valid_version
            || marker_ids.len() != payload.markers.len()
            || payload
                .traits
                .iter()
                .map(|t| &t.id)
                .collect::<HashSet<_>>()
                .len()
                != payload.traits.len()
        {
            return Err("Katalogversion oder IDs sind ungültig.".into());
        }
        for Marker(id, gene, chr, old, new, alleles) in &payload.markers {
            if !id
                .strip_prefix("rs")
                .is_some_and(|n| !n.is_empty() && n.bytes().all(|c| c.is_ascii_digit()))
                || crate::import::chromosome(chr).as_ref() != Some(chr)
                || *old == 0
                || *new == 0
                || !matches!(alleles.as_str(), "AC" | "AG" | "AT" | "CG" | "CT" | "GT")
                || gene.is_empty()
                || gene.len() > 150
            {
                return Err("Ein Katalogmarker ist ungültig.".into());
            }
        }
        for item in &payload.traits {
            let signature_ok = match item.method {
                Method::Single => {
                    matches!((item.id.as_str(), item.markers.as_slice()), ("earwax", [id]) if id == "rs17822931")
                        || matches!((item.id.as_str(), item.markers.as_slice()), ("lactase", [id]) if id == "rs4988235")
                        || matches!((item.id.as_str(), item.markers.as_slice()), ("actn3", [id]) if id == "rs1815739")
                }
                Method::Bitter => {
                    item.id == "bitter" && item.markers == ["rs713598", "rs1726866", "rs10246939"]
                }
                Method::Research => true,
            };
            if !valid_id(&item.id)
                || !sections.contains(&item.section)
                || !item.cross.iter().all(|s| sections.contains(s))
                || item.markers.is_empty()
                || item.markers.len() > 128
                || !item
                    .markers
                    .iter()
                    .all(|id| marker_ids.contains(id.as_str()))
                || item.markers.iter().collect::<HashSet<_>>().len() != item.markers.len()
                || item.sources.is_empty()
                || !item.sources.iter().all(|(name, url)| {
                    !name.is_empty()
                        && url.starts_with("https://")
                        && !url.contains(char::is_whitespace)
                })
                || !signature_ok
            {
                return Err("Eine Merkmalsregel hat ein ungültiges Schema.".into());
            }
        }
        // Built-in interpretation is tied to the reviewed definitions, including alleles and coordinates.
        let original: Payload =
            serde_json::from_str(STARTER).map_err(|_| "Der Startkatalog ist beschädigt.")?;
        for marker in &original.markers {
            if let Some(other) = payload.markers.iter().find(|other| other.0 == marker.0) {
                if (other.2.as_str(), other.3, other.4, other.5.as_str())
                    != (marker.2.as_str(), marker.3, marker.4, marker.5.as_str())
                {
                    return Err("Der Katalog ändert eine geprüfte Markerdefinition.".into());
                }
            }
        }
        if !payload.scores.iter().all(crate::pgs::Score::valid)
            || payload
                .scores
                .iter()
                .map(|s| &s.id)
                .collect::<HashSet<_>>()
                .len()
                != payload.scores.len()
        {
            return Err("Ein polygenetisches Forschungsmodell ist ungültig.".into());
        }
        let mut db = Connection::open_in_memory().map_err(sql_error)?;
        db.execute_batch("CREATE TABLE marker (id TEXT PRIMARY KEY, gene TEXT NOT NULL, chr TEXT NOT NULL, b37 INTEGER NOT NULL, b38 INTEGER NOT NULL, alleles TEXT NOT NULL);
            CREATE INDEX marker_b37 ON marker(chr, b37);
            CREATE INDEX marker_b38 ON marker(chr, b38);
            CREATE TABLE trait (id TEXT PRIMARY KEY, section TEXT NOT NULL, content TEXT NOT NULL);
            CREATE INDEX trait_section ON trait(section);").map_err(sql_error)?;
        let transaction = db.transaction().map_err(sql_error)?;
        {
            let mut marker_sql = transaction
                .prepare("INSERT INTO marker VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                .map_err(sql_error)?;
            for Marker(id, gene, chr, old, new, alleles) in payload.markers {
                marker_sql
                    .execute(params![id, gene, chr, old, new, alleles])
                    .map_err(sql_error)?;
            }
            let mut trait_sql = transaction
                .prepare("INSERT INTO trait VALUES (?1, ?2, ?3)")
                .map_err(sql_error)?;
            for item in payload.traits {
                let encoded = serde_json::to_string(&item)
                    .map_err(|_| "Merkmalsregel kann nicht gelesen werden.")?;
                trait_sql
                    .execute(params![item.id, item.section, encoded])
                    .map_err(sql_error)?;
            }
        }
        transaction.commit().map_err(sql_error)?;
        Ok(Self {
            version: payload.version,
            db,
            scores: payload.scores,
            provenance: None,
        })
    }

    pub fn markers(&self) -> Result<Vec<Marker>, String> {
        let mut query = self
            .db
            .prepare("SELECT id, gene, chr, b37, b38, alleles FROM marker ORDER BY id")
            .map_err(sql_error)?;
        let values = query
            .query_map([], |r| {
                Ok(Marker(
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            })
            .map_err(sql_error)?;
        values.collect::<Result<Vec<_>, _>>().map_err(sql_error)
    }

    pub fn traits(&self) -> Result<Vec<Trait>, String> {
        let mut query = self
            .db
            .prepare("SELECT content FROM trait ORDER BY section, id")
            .map_err(sql_error)?;
        let values = query
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(sql_error)?;
        values
            .map(|value| {
                serde_json::from_str(&value.map_err(sql_error)?)
                    .map_err(|_| "Die Merkmalsregel ist beschädigt.".into())
            })
            .collect()
    }
}

fn sql_error(_: rusqlite::Error) -> String {
    "Der Referenzkatalog konnte nicht gelesen oder aufgebaut werden.".into()
}

pub fn bounded_read(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let input = fs::File::open(path).map_err(|_| "Die Datei konnte nicht geöffnet werden.")?;
    if input
        .metadata()
        .map_err(|_| "Die Dateigröße konnte nicht geprüft werden.")?
        .len()
        > max
    {
        return Err("Die Datei überschreitet das Größenlimit.".into());
    }
    let mut data = Vec::new();
    input
        .take(max + 1)
        .read_to_end(&mut data)
        .map_err(|_| "Die Datei konnte nicht gelesen werden.")?;
    if data.len() as u64 > max {
        return Err("Die Datei überschreitet das Größenlimit.".into());
    }
    Ok(data)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Package {
    manifest: String,
    payload: String,
    signature: String,
}
fn hex<const N: usize>(value: &str) -> Option<[u8; N]> {
    if !value.is_ascii() || value.len() != N * 2 {
        return None;
    }
    let mut bytes = [0; N];
    for (i, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(bytes)
}
pub fn package(path: &Path, trusted_key: &str) -> Result<Catalog, String> {
    let bytes = bounded_read(path, MAX_PAYLOAD)?;
    let package: Package =
        serde_json::from_slice(&bytes).map_err(|_| "Ungültiges Katalogpaket.")?;
    let key = hex::<32>(trusted_key.trim())
        .and_then(|bytes| VerifyingKey::from_bytes(&bytes).ok())
        .ok_or("Der öffentliche Ed25519-Schlüssel ist ungültig.")?;
    let signature =
        Signature::from_bytes(&hex(&package.signature).ok_or("Die Katalogsignatur ist ungültig.")?);
    key.verify_strict(package.manifest.as_bytes(), &signature)
        .map_err(|_| {
            "Die Katalogsignatur stimmt nicht mit dem vertrauenswürdigen Schlüssel überein."
        })?;
    let manifest: Manifest =
        serde_json::from_str(&package.manifest).map_err(|_| "Das Katalogmanifest ist ungültig.")?;
    let digest = format!("{:x}", Sha256::digest(package.payload.as_bytes()));
    if manifest.schema != 1
        || manifest.sha256 != digest
        || manifest.origin.trim().is_empty()
        || manifest.license.trim().is_empty()
        || manifest.builds != ["GRCh37", "GRCh38"]
    {
        return Err("Katalogmanifest, Referenzbuilds oder Prüfsumme sind ungültig.".into());
    }
    let payload: Payload =
        serde_json::from_str(&package.payload).map_err(|_| "Ungültige Katalogdaten.")?;
    if payload.version != manifest.version {
        return Err("Die Katalogversionen stimmen nicht überein.".into());
    }
    let mut catalog = Catalog::from_payload(payload)?;
    catalog.provenance = Some(manifest);
    Ok(catalog)
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temporary =
        NamedTempFile::new_in(parent).map_err(|_| "Der Exportordner ist nicht beschreibbar.")?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| "Der Export konnte nicht geschrieben werden.")?;
    temporary
        .persist(path)
        .map_err(|_| "Der Export konnte nicht gespeichert werden.")?;
    Ok(())
}
