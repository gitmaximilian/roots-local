use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
};

use crate::locale::Language;
pub const STARTER: &str = include_str!("../../../catalog/starter.json");
const MAX_PAYLOAD: u64 = 32 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Section {
    pub id: String,
    pub title: String,
    pub scope: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub part: String,
    pub sections: Vec<Section>,
}
pub fn structure() -> Vec<Chapter> {
    localized_structure(Language::De)
}

pub fn localized_structure(language: Language) -> Vec<Chapter> {
    let data = match language {
        Language::En => include_str!("../../../catalog/report-structure.en.json"),
        Language::De => include_str!("../../../catalog/report-structure.de.json"),
    };
    serde_json::from_str(data).expect("valid built-in chapter structure")
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
    pub require_identifier: bool,
    #[serde(default)]
    pub cross: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub study: Option<Study>,
    /// Genotype patterns and the conclusion each one supports. Calls of several
    /// markers are joined with "/" in marker order; each call is sorted, e.g. "AG".
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub outcomes: Vec<Outcome>,
    /// A verified plus-strand effect allele for dosage-based conclusions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectAllele>,
    /// Medically relevant outcomes stay hidden until the user opts in.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub clinical: bool,
    /// Everyday questions this rule answers, used by "Ask your DNA".
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub questions: Vec<String>,
}
impl Trait {
    pub fn is_clinical(&self) -> bool {
        self.clinical || self.effect.as_ref().is_some_and(|e| e.clinical)
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    High,
    Moderate,
    Low,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Outcome {
    pub calls: Vec<String>,
    pub conclusion: String,
    pub message: String,
    pub confidence: Confidence,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EffectAllele {
    pub marker: String,
    pub allele: char,
    /// Conclusions for zero, one, and two copies of the effect allele.
    pub conclusions: [String; 3],
    pub confidence: Confidence,
    /// Medically relevant conclusions stay hidden until the user opts in.
    #[serde(default)]
    pub clinical: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Study {
    pub reported_trait: String,
    pub accession: String,
    pub p_value: String,
    pub effect: String,
    pub effect_context: String,
}
impl Study {
    fn valid(&self) -> bool {
        !self.reported_trait.trim().is_empty()
            && self.reported_trait.chars().count() <= 250
            && self.accession.strip_prefix("GCST").is_some_and(|n| {
                (6..=12).contains(&n.len()) && n.bytes().all(|c| c.is_ascii_digit())
            })
            && self.p_value.len() <= 32
            && self.p_value.parse::<f64>().is_ok_and(|p| {
                // The catalog can report positive p-values below f64's range.
                (p > 0.0 && p <= 5e-8)
                    || (p == 0.0
                        && self.p_value.split_once(['e', 'E']).is_some_and(
                            |(mantissa, exponent)| {
                                mantissa
                                    .parse::<f64>()
                                    .is_ok_and(|v| v.is_finite() && v > 0.0)
                                    && exponent.parse::<i32>().is_ok_and(|v| v < 0)
                            },
                        ))
            })
            && self.effect.chars().count() <= 40
            && self.effect_context.chars().count() <= 160
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Method {
    Single,
    Bitter,
    Research,
    Gwas,
    /// Built-in genetic scores; never accepted from a catalog package.
    Score,
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

fn valid_text(value: &str, limit: usize) -> bool {
    !value.trim().is_empty()
        && value.chars().count() <= limit
        && !value.chars().any(char::is_control)
}

/// A validated catalog, indexed by marker ID and by coordinate on both builds.
pub struct Catalog {
    pub version: String,
    /// Markers sorted by ID.
    markers: Vec<Marker>,
    /// Traits sorted by section, then ID.
    traits: Vec<Trait>,
    by_id: HashMap<String, usize>,
    by_position: HashMap<(crate::import::Build, u32), Vec<usize>>,
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
        let research_loci = payload
            .markers
            .iter()
            .filter(|marker| marker.5 == "ACGT")
            .map(|marker| marker.0.as_str())
            .collect::<HashSet<_>>();
        for Marker(id, gene, chr, old, new, alleles) in &payload.markers {
            if !id
                .strip_prefix("rs")
                .is_some_and(|n| !n.is_empty() && n.bytes().all(|c| c.is_ascii_digit()))
                || crate::import::chromosome(chr).as_ref() != Some(chr)
                || (*old == 0 && alleles != "ACGT")
                || *new == 0
                || !matches!(
                    alleles.as_str(),
                    "AC" | "AG" | "AT" | "CG" | "CT" | "GT" | "ACGT"
                )
                || gene.is_empty()
                || gene.len() > 150
            {
                return Err("Ein Katalogmarker ist ungültig.".into());
            }
        }
        for item in &payload.traits {
            let alleles_of = |id: &str| {
                payload
                    .markers
                    .iter()
                    .find(|marker| marker.0 == id)
                    .map(|marker| marker.5.as_str())
            };
            let outcomes_ok = item.outcomes.iter().all(|outcome| {
                !outcome.calls.is_empty()
                    && valid_text(&outcome.conclusion, 160)
                    && valid_text(&outcome.message, 600)
                    && outcome.calls.iter().all(|key| {
                        let parts: Vec<_> = key.split('/').collect();
                        parts.len() == item.markers.len()
                            && parts.iter().zip(&item.markers).all(|(call, marker)| {
                                let allowed = alleles_of(marker).unwrap_or("");
                                call.len() == 2
                                    && call.as_bytes()[0] <= call.as_bytes()[1]
                                    && call.bytes().all(|c| allowed.as_bytes().contains(&c))
                            })
                    })
            });
            let effect_ok = item.effect.as_ref().is_none_or(|effect| {
                item.method == Method::Research
                    && item.markers.contains(&effect.marker)
                    && alleles_of(&effect.marker)
                        .is_some_and(|a| a.len() == 2 && a.contains(effect.allele))
                    && effect.conclusions.iter().all(|c| valid_text(c, 600))
            });
            let questions_ok =
                item.questions.len() <= 8 && item.questions.iter().all(|q| valid_text(q, 160));
            let signature_ok = questions_ok
                && outcomes_ok
                && effect_ok
                && match item.method {
                    Method::Single => !item.outcomes.is_empty(),
                    Method::Bitter => {
                        item.id == "bitter"
                            && item.markers == ["rs713598", "rs1726866", "rs10246939"]
                            && !item.outcomes.is_empty()
                    }
                    Method::Research => item.outcomes.is_empty(),
                    Method::Score => false,
                    Method::Gwas => {
                        item.markers.len() == 1
                            && item.study.as_ref().is_some_and(Study::valid)
                            && item.outcomes.is_empty()
                            && item.effect.is_none()
                    }
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
                || (item.method != Method::Gwas
                    && (item.study.is_some()
                        || item
                            .markers
                            .iter()
                            .any(|marker| research_loci.contains(marker.as_str()))))
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
        let mut markers = payload.markers;
        markers.sort_by(|a, b| a.0.cmp(&b.0));
        let mut traits = payload.traits;
        traits.sort_by(|a, b| (&a.section, &a.id).cmp(&(&b.section, &b.id)));
        let by_id = markers
            .iter()
            .enumerate()
            .map(|(index, marker)| (marker.0.clone(), index))
            .collect();
        let mut by_position: HashMap<_, Vec<usize>> = HashMap::new();
        for (index, marker) in markers.iter().enumerate() {
            use crate::import::Build;
            for (build, position) in [(Build::Grch37, marker.3), (Build::Grch38, marker.4)] {
                if position > 0 {
                    by_position
                        .entry((build, position))
                        .or_default()
                        .push(index);
                }
            }
        }
        Ok(Self {
            version: payload.version,
            markers,
            traits,
            by_id,
            by_position,
            scores: payload.scores,
            provenance: None,
        })
    }

    pub fn markers(&self) -> Result<Vec<Marker>, String> {
        Ok(self.markers.clone())
    }

    pub fn traits(&self) -> Result<Vec<Trait>, String> {
        Ok(self.traits.clone())
    }

    /// Looks up a marker by its rsID.
    pub fn marker(&self, id: &str) -> Option<&Marker> {
        self.by_id.get(id).map(|&index| &self.markers[index])
    }

    /// Whether a catalog marker sits at this coordinate of the given build.
    pub fn has_position(
        &self,
        build: crate::import::Build,
        chromosome: &str,
        position: u32,
    ) -> bool {
        self.by_position
            .get(&(build, position))
            .is_some_and(|found| {
                found
                    .iter()
                    .any(|&index| self.markers[index].2 == chromosome)
            })
    }
}

/// Reads at most `max` bytes and fails if the input is longer.
pub fn bounded_read(input: impl Read, max: u64) -> Result<Vec<u8>, String> {
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
pub fn package(input: impl Read, trusted_key: &str) -> Result<Catalog, String> {
    let bytes = bounded_read(input, MAX_PAYLOAD)?;
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
