//! WebAssembly bindings for Roots Local.
//!
//! This crate runs inside a dedicated Web Worker. Files are read with
//! `FileReaderSync` directly from the `File` objects the user picked, in
//! bounded chunks, so nothing is uploaded and large inputs are streamed. The
//! bindings never touch the network: there is no fetch, XHR, or WebSocket code
//! here, and the page's Content Security Policy blocks them in any case.

use roots_core::{
    analysis,
    catalog::{self, Catalog},
    clinical, cram,
    external::{self, External},
    import::{self, Import},
    lineage,
    report::{self, Model, Options},
    variants::{self, Conflicts, Quality},
};
use serde::Serialize;
use std::{
    io::{self, BufReader, Read, Seek, SeekFrom},
    sync::atomic::{AtomicBool, Ordering::Relaxed},
};
use wasm_bindgen::prelude::*;
use web_sys::{Blob, FileReaderSync};

const SAMPLE: &[u8] = include_bytes!("../../../fixtures/synthetic-myheritage.txt");
const CHUNK: u64 = 1 << 20;

/// Set from JavaScript through a shared cancel flag; see [`Session::poll`].
static CANCEL: AtomicBool = AtomicBool::new(false);

fn cancelled() -> bool {
    poll_cancel();
    CANCEL.load(Relaxed)
}

#[wasm_bindgen]
extern "C" {
    /// Provided by the worker: returns true once the user asked to cancel.
    #[wasm_bindgen(js_namespace = globalThis, js_name = rootsCancelRequested)]
    fn cancel_requested() -> bool;
    /// Provided by the worker: reports how far the current file has been read.
    #[wasm_bindgen(js_namespace = globalThis, js_name = rootsProgress)]
    fn progress(read: f64, total: f64);
}

fn poll_cancel() {
    if cancel_requested() {
        CANCEL.store(true, Relaxed);
    }
}

/// Random-access reader over a browser `Blob`, backed by `FileReaderSync`.
struct BlobReader {
    blob: Blob,
    reader: FileReaderSync,
    size: u64,
    position: u64,
}

impl BlobReader {
    fn new(blob: Blob) -> Result<Self, String> {
        let reader = FileReaderSync::new().map_err(|_| "Dateien können hier nicht gelesen werden.")?;
        Ok(Self {
            size: blob.size() as u64,
            blob,
            reader,
            position: 0,
        })
    }
}

// The module is built without threads; the reader never leaves the worker.
unsafe impl Send for BlobReader {}
unsafe impl Sync for BlobReader {}

impl Read for BlobReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        poll_cancel();
        if self.position >= self.size || out.is_empty() {
            return Ok(0);
        }
        let end = (self.position + (out.len() as u64).min(CHUNK)).min(self.size);
        let slice = self
            .blob
            .slice_with_f64_and_f64(self.position as f64, end as f64)
            .map_err(|_| io::Error::other("slice"))?;
        let buffer = self
            .reader
            .read_as_array_buffer(&slice)
            .map_err(|_| io::Error::other("read"))?;
        let bytes = js_sys::Uint8Array::new(&buffer);
        let length = bytes.length() as usize;
        bytes.copy_to(&mut out[..length]);
        self.position += length as u64;
        progress(self.position as f64, self.size as f64);
        Ok(length)
    }
}

impl Seek for BlobReader {
    fn seek(&mut self, target: SeekFrom) -> io::Result<u64> {
        let next = match target {
            SeekFrom::Start(offset) => Some(offset),
            SeekFrom::End(offset) => self.size.checked_add_signed(offset),
            SeekFrom::Current(offset) => self.position.checked_add_signed(offset),
        };
        self.position = next.ok_or_else(|| io::Error::other("seek"))?;
        Ok(self.position)
    }
}

fn reader(blob: Blob) -> Result<BlobReader, String> {
    BlobReader::new(blob)
}

fn json(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "Das Ergebnis konnte nicht übertragen werden.".into())
}

struct Profile {
    data: Import,
    conflicts: Conflicts,
}

/// The analysis state of one browser tab. It lives only in worker memory.
#[wasm_bindgen]
#[derive(Default)]
pub struct Session {
    catalog: Option<Catalog>,
    profile: Option<Profile>,
    model: Option<Model>,
}

#[derive(Serialize)]
struct CatalogState<'a> {
    version: &'a str,
    model: Option<&'a Model>,
}

#[wasm_bindgen]
impl Session {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // Parse the built-in genetic scores while the app starts, not during
        // the first import.
        roots_core::trait_scores::count();
        Self::default()
    }

    /// Clears the cancel flag before a new job starts.
    pub fn begin(&self) {
        CANCEL.store(false, Relaxed);
    }

    pub fn reset(&mut self) {
        self.model = None;
        self.profile = None;
    }

    /// Imports a raw data file, or the built-in synthetic example when `file` is null.
    pub fn import_dna(&mut self, file: Option<Blob>) -> Result<String, String> {
        let example = file.is_none();
        let data = match file {
            Some(file) => import::file(reader(file)?, &CANCEL)?,
            None => import::parse(SAMPLE, &CANCEL)?,
        };
        let (summary, conflicts) = analysis::summary_with_conflicts(&data);
        let starter;
        let active = match &self.catalog {
            Some(catalog) => catalog,
            None => {
                starter = Catalog::starter()?;
                &starter
            }
        };
        let mut model = Model::new(summary, active.version.clone(), Vec::new(), example);
        model.apply_catalog(&data, active)?;
        if cancelled() {
            return Err("Import abgebrochen.".into());
        }
        let out = json(&model)?;
        self.profile = Some(Profile { data, conflicts });
        self.model = Some(model);
        Ok(out)
    }

    /// Confirms the reference build for a file that does not declare one and
    /// re-runs the analysis. Companion results that depend on coordinates are
    /// cleared, because they were computed without a build.
    pub fn assume_build(&mut self, build: &str) -> Result<String, String> {
        let build = match build {
            "GRCh37" => import::Build::Grch37,
            "GRCh38" => import::Build::Grch38,
            _ => return Err("Unbekanntes Referenzgenom.".into()),
        };
        let profile = self.profile.as_mut().ok_or(NO_PROFILE)?;
        profile.data.assume_build(build)?;
        let example = self.model.as_ref().is_some_and(|model| model.example);
        let (summary, conflicts) = analysis::summary_with_conflicts(&profile.data);
        profile.conflicts = conflicts;
        let starter;
        let active = match &self.catalog {
            Some(catalog) => catalog,
            None => {
                starter = Catalog::starter()?;
                &starter
            }
        };
        let mut model = Model::new(summary, active.version.clone(), Vec::new(), example);
        model.apply_catalog(&profile.data, active)?;
        let out = json(&model)?;
        self.model = Some(model);
        Ok(out)
    }

    pub fn variants(
        &self,
        query: &str,
        chromosome: Option<String>,
        quality: Option<String>,
        offset: usize,
    ) -> Result<String, String> {
        let profile = self.profile.as_ref().ok_or(NO_PROFILE)?;
        let quality: Option<Quality> = quality
            .map(|value| serde_json::from_value(serde_json::Value::String(value)))
            .transpose()
            .map_err(|_| "Unbekannter Filter.")?;
        let page = variants::page(
            &profile.data.rows,
            &profile.conflicts,
            query,
            chromosome.as_deref(),
            quality,
            offset,
        )
        .map_err(String::from)?;
        json(&page)
    }

    /// Imports companion data. `files` holds the files the import kind needs.
    pub fn import_extra(&mut self, kind: &str, files: Vec<Blob>) -> Result<String, String> {
        let profile = self.profile.as_ref().ok_or(NO_PROFILE)?;
        let mut files = files.into_iter();
        let mut next = || files.next().ok_or_else(|| "Es fehlt eine Datei.".to_string()).and_then(reader);
        let markers = || match &self.catalog {
            Some(catalog) => catalog.markers(),
            None => Catalog::starter()?.markers(),
        };
        let extra = match kind {
            "relatives" => Extra::Relatives(external::supporting_file(next()?)?),
            "family" => {
                let relative = import::file(next()?, &CANCEL)?;
                Extra::Family(external::compare_with_cancel(&profile.data, &relative, &CANCEL)?)
            }
            "trio" => {
                let first = import::file(next()?, &CANCEL)?;
                let second = import::file(next()?, &CANCEL)?;
                Extra::Trio(external::trio(&profile.data, &first, &second, &markers()?, &CANCEL)?)
            }
            "clinical" => Extra::Clinical(clinical::file(next()?, &profile.data, &CANCEL)?),
            "gene_validity" => {
                let matches = self
                    .model
                    .as_ref()
                    .and_then(|model| model.clinical.as_ref())
                    .ok_or(NO_CLINVAR)?;
                Extra::GeneValidity(clinical::gene_validity(next()?, matches, &CANCEL)?)
            }
            "maternal_lineage" => Extra::Maternal(lineage::maternal_file(next()?)?),
            "cram" => {
                let cram_file = BufReader::with_capacity(CHUNK as usize, next()?);
                let reference = BufReader::with_capacity(64 * 1024, next()?);
                let index = next()?;
                Extra::Cram(cram::coverage(cram_file, reference, index, &markers()?, &CANCEL)?)
            }
            _ => return Err("Unbekannter Importtyp.".into()),
        };
        if cancelled() {
            return Err("Import abgebrochen.".into());
        }
        let model = self.model.as_mut().ok_or(NO_PROFILE)?;
        match extra {
            Extra::Relatives(mut extra) => {
                if !extra.matches.is_empty() {
                    std::mem::swap(&mut model.external.matches, &mut extra.matches);
                }
                if !extra.segments.is_empty() {
                    std::mem::swap(&mut model.external.segments, &mut extra.segments);
                }
            }
            Extra::Family(family) => model.family = Some(family),
            Extra::Trio(trio) => model.apply_trio(trio),
            Extra::Clinical(matches) => model.clinical = Some(matches),
            Extra::GeneValidity(validity) => {
                model.clinical.as_mut().ok_or(NO_CLINVAR)?.gene_validity = Some(validity);
            }
            Extra::Cram(coverage) => model.sequence = Some(coverage),
            Extra::Maternal(lineage) => model.maternal_lineage = Some(lineage),
        }
        json(model)
    }

    pub fn save_origins(&mut self, entries: &str) -> Result<String, String> {
        let model = self.model.as_mut().ok_or(NO_PROFILE)?;
        model.external.origins = external::origins(entries)?.origins;
        json(model)
    }

    /// Verifies a signed catalog package with the given Ed25519 public key.
    pub fn load_catalog(&mut self, file: Blob, trusted_key: &str) -> Result<String, String> {
        let fresh = catalog::package(reader(file)?, trusted_key)?;
        if cancelled() {
            return Err("Katalogimport abgebrochen.".into());
        }
        if let (Some(profile), Some(model)) = (&self.profile, &mut self.model) {
            model.apply_catalog(&profile.data, &fresh)?;
            model.sequence = None;
        }
        self.catalog = Some(fresh);
        let catalog = self.catalog.as_ref().ok_or(NO_PROFILE)?;
        json(&CatalogState {
            version: &catalog.version,
            model: self.model.as_ref(),
        })
    }

    /// Prepares the `report.json` data for the PDF renderer. `options` is the
    /// JSON form of `Options`; the PDF module decides the template from `pass`.
    pub fn prepare_pdf(&self, options: &str) -> Result<Vec<u8>, String> {
        let options: Options =
            serde_json::from_str(options).map_err(|_| "Ungültige Exportoptionen.")?;
        let model = self.model.as_ref().ok_or(NO_PROFILE)?;
        Ok(report::prepare(model, options)?.data)
    }
}

const NO_PROFILE: &str = "Bitte zuerst eine DNA-Datei importieren.";
const NO_CLINVAR: &str = "Bitte zuerst eine ClinVar-Datei importieren.";

enum Extra {
    Relatives(External),
    Family(external::Family),
    Trio(external::Trio),
    Clinical(clinical::Matches),
    GeneValidity(clinical::GeneValidity),
    Cram(cram::Coverage),
    Maternal(lineage::Maternal),
}

/// The report chapter structure (German, like the desktop command it replaces).
#[wasm_bindgen]
pub fn chapters() -> Result<String, String> {
    json(&catalog::structure())
}
