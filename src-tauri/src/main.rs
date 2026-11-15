use roots_local::{
    analysis,
    catalog::{self, Catalog, Chapter},
    clinical, cram,
    external::{self, External},
    import::{self, Import},
    lineage,
    locale::Language,
    report::{self, Model, Options},
    variants::{self, Conflicts, Quality},
};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering::Relaxed},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Builder, State};
use tauri_plugin_dialog::DialogExt;

const SAMPLE: &[u8] = include_bytes!("../../fixtures/synthetic-myheritage.txt");

#[derive(Default)]
struct Session {
    catalog: Option<Catalog>,
    imported: Option<Arc<ImportedProfile>>,
    model: Option<Model>,
}
struct ImportedProfile {
    data: Import,
    conflicts: Conflicts,
}
#[derive(Clone, Default)]
struct Workspace {
    session: Arc<Mutex<Session>>,
    job: Arc<Mutex<Option<Arc<AtomicBool>>>>,
}
impl Workspace {
    fn start_job(&self) -> Result<Job, String> {
        let mut current = self
            .job
            .lock()
            .map_err(|_| "Die Sitzung ist nicht verfügbar.")?;
        if current.is_some() {
            return Err("Eine Verarbeitung läuft bereits.".into());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *current = Some(cancel.clone());
        Ok(Job {
            cancel,
            active: self.job.clone(),
        })
    }
}
struct Job {
    cancel: Arc<AtomicBool>,
    active: Arc<Mutex<Option<Arc<AtomicBool>>>>,
}
impl Drop for Job {
    fn drop(&mut self) {
        if let Ok(mut current) = self.active.lock() {
            *current = None;
        }
    }
}
fn state_error<T>(_: std::sync::PoisonError<T>) -> &'static str {
    "Die Sitzung ist nicht verfügbar."
}

#[tauri::command]
fn chapters() -> Vec<Chapter> {
    catalog::structure()
}

#[tauri::command]
fn cancel_job(workspace: State<'_, Workspace>) -> Result<(), String> {
    if let Some(cancel) = workspace.job.lock().map_err(state_error)?.as_ref() {
        cancel.store(true, Relaxed);
    }
    Ok(())
}

#[tauri::command]
async fn reset(workspace: State<'_, Workspace>) -> Result<(), String> {
    let _job = workspace.start_job()?;
    let mut state = workspace.session.lock().map_err(state_error)?;
    state.model = None;
    state.imported = None;
    Ok(())
}

fn choose(handle: &AppHandle, label: &str, extensions: &[&str]) -> Result<Option<PathBuf>, String> {
    handle
        .dialog()
        .file()
        .add_filter(label, extensions)
        .blocking_pick_file()
        .map(|file| {
            file.into_path()
                .map_err(|_| "Es wird eine lokale Datei benötigt.".into())
        })
        .transpose()
}
async fn background<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "Die lokale Verarbeitung konnte nicht abgeschlossen werden.".into())
        .and_then(|result| result)
}
fn make_model(
    data: &Import,
    summary: analysis::Summary,
    catalog: Option<&Catalog>,
    example: bool,
) -> Result<Model, String> {
    let starter;
    let active = if let Some(catalog) = catalog {
        catalog
    } else {
        starter = Catalog::starter()?;
        &starter
    };
    let mut model = Model::new(summary, active.version.clone(), Vec::new(), example);
    model.apply_catalog(data, active)?;
    Ok(model)
}

#[tauri::command]
async fn import_dna(
    handle: AppHandle,
    workspace: State<'_, Workspace>,
    example: bool,
    language: Language,
) -> Result<Option<Model>, String> {
    let workspace = workspace.inner().clone();
    background(move || {
        let job = workspace.start_job()?;
        let data = if example {
            import::parse(SAMPLE, &job.cancel)?
        } else {
            let Some(path) = choose(
                &handle,
                language.select("MyHeritage raw data", "MyHeritage-Rohdaten"),
                &["csv", "tsv", "txt", "zip"],
            )?
            else {
                return Ok(None);
            };
            import::file(&path, &job.cancel)?
        };
        let (summary, conflicts) = analysis::summary_with_conflicts(&data);
        let mut state = workspace.session.lock().map_err(state_error)?;
        let model = make_model(&data, summary, state.catalog.as_ref(), example)?;
        if job.cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        state.imported = Some(Arc::new(ImportedProfile { data, conflicts }));
        state.model = Some(model.clone());
        Ok(Some(model))
    })
    .await
}

#[tauri::command]
async fn variants(
    workspace: State<'_, Workspace>,
    query: String,
    chromosome: Option<String>,
    quality: Option<Quality>,
    offset: usize,
) -> Result<variants::Page, String> {
    let profile = workspace
        .session
        .lock()
        .map_err(state_error)?
        .imported
        .clone()
        .ok_or("Bitte zuerst eine DNA-Datei importieren.")?;
    background(move || {
        variants::page(
            &profile.data.rows,
            &profile.conflicts,
            &query,
            chromosome.as_deref(),
            quality,
            offset,
        )
        .map_err(String::from)
    })
    .await
}

#[tauri::command]
async fn import_extra(
    handle: AppHandle,
    workspace: State<'_, Workspace>,
    kind: String,
    language: Language,
) -> Result<Option<Model>, String> {
    let workspace = workspace.inner().clone();
    background(move || {
        let job = workspace.start_job()?;
        if ![
            "relatives",
            "family",
            "trio",
            "clinical",
            "gene_validity",
            "maternal_lineage",
            "cram",
        ]
        .contains(&kind.as_str())
        {
            return Err("Unbekannter Importtyp.".into());
        }
        let profile = workspace
            .session
            .lock()
            .map_err(state_error)?
            .imported
            .clone()
            .ok_or("Bitte zuerst eine DNA-Datei importieren.")?;
        let extra = match kind.as_str() {
            "relatives" => {
                let Some(path) = choose(
                    &handle,
                    language.select("DNA matches or shared segments", "Match- oder Segmentliste"),
                    &["csv", "tsv", "txt"],
                )?
                else {
                    return Ok(None);
                };
                Extra::Relatives(external::supporting_file(&path)?)
            }
            "family" => {
                let Some(path) = choose(
                    &handle,
                    language.select(
                        "Parent comparison file",
                        "Vergleichsdatei eines Elternteils",
                    ),
                    &["csv", "tsv", "txt", "zip"],
                )?
                else {
                    return Ok(None);
                };
                let relative = import::file(&path, &job.cancel)?;
                Extra::Family(external::compare_with_cancel(
                    &profile.data,
                    &relative,
                    &job.cancel,
                )?)
            }
            "trio" => {
                let extensions = &["csv", "tsv", "txt", "zip"];
                let Some(first) = choose(
                    &handle,
                    language.select("First parent file", "Datei des ersten Elternteils"),
                    extensions,
                )?
                else {
                    return Ok(None);
                };
                let Some(second) = choose(
                    &handle,
                    language.select("Second parent file", "Datei des zweiten Elternteils"),
                    extensions,
                )?
                else {
                    return Ok(None);
                };
                let first = import::file(&first, &job.cancel)?;
                let second = import::file(&second, &job.cancel)?;
                Extra::Trio(external::trio(
                    &profile.data,
                    &first,
                    &second,
                    &active_markers(&workspace)?,
                    &job.cancel,
                )?)
            }
            "clinical" => {
                let Some(path) = choose(
                    &handle,
                    language.select("ClinVar VCF reference", "ClinVar-VCF-Referenz"),
                    &["vcf", "gz"],
                )?
                else {
                    return Ok(None);
                };
                Extra::Clinical(clinical::file(&path, &profile.data, &job.cancel)?)
            }
            "gene_validity" => {
                let Some(path) = choose(
                    &handle,
                    language.select(
                        "ClinGen gene-disease validity",
                        "ClinGen-Gen-Krankheits-Evidenz",
                    ),
                    &["csv"],
                )?
                else {
                    return Ok(None);
                };
                let matches = workspace
                    .session
                    .lock()
                    .map_err(state_error)?
                    .model
                    .as_ref()
                    .and_then(|model| model.clinical.clone())
                    .ok_or("Bitte zuerst eine ClinVar-Datei importieren.")?;
                Extra::GeneValidity(clinical::gene_validity(&path, &matches, &job.cancel)?)
            }
            "maternal_lineage" => {
                let Some(path) = choose(
                    &handle,
                    language.select("Haplogrep result summary", "Haplogrep-Ergebnis"),
                    &["json"],
                )?
                else {
                    return Ok(None);
                };
                Extra::Maternal(lineage::maternal_file(&path)?)
            }
            "cram" => {
                let Some(path) = choose(
                    &handle,
                    language.select("Sequencing data", "Sequenzierdaten"),
                    &["cram"],
                )?
                else {
                    return Ok(None);
                };
                let Some(reference) = choose(
                    &handle,
                    language.select(
                        "Matching local FASTA with .fai",
                        "Passende lokale FASTA mit .fai",
                    ),
                    &["fa", "fasta", "fna", "gz"],
                )?
                else {
                    return Ok(None);
                };
                let markers = active_markers(&workspace)?;
                Extra::Cram(cram::coverage(&path, &reference, &markers, &job.cancel)?)
            }
            _ => unreachable!(),
        };
        if job.cancel.load(Relaxed) {
            return Err("Import abgebrochen.".into());
        }
        let mut state = workspace.session.lock().map_err(state_error)?;
        let model = state
            .model
            .as_mut()
            .ok_or("Bitte zuerst eine DNA-Datei importieren.")?;
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
                model
                    .clinical
                    .as_mut()
                    .ok_or("Bitte zuerst eine ClinVar-Datei importieren.")?
                    .gene_validity = Some(validity);
            }
            Extra::Cram(coverage) => model.sequence = Some(coverage),
            Extra::Maternal(lineage) => model.maternal_lineage = Some(lineage),
        }
        Ok(Some(model.clone()))
    })
    .await
}

fn active_markers(workspace: &Workspace) -> Result<Vec<catalog::Marker>, String> {
    let state = workspace.session.lock().map_err(state_error)?;
    match &state.catalog {
        Some(catalog) => catalog.markers(),
        None => Catalog::starter()?.markers(),
    }
}

enum Extra {
    Relatives(External),
    Family(external::Family),
    Trio(external::Trio),
    Clinical(clinical::Matches),
    GeneValidity(clinical::GeneValidity),
    Cram(cram::Coverage),
    Maternal(lineage::Maternal),
}

#[tauri::command]
fn save_origins(workspace: State<'_, Workspace>, entries: String) -> Result<Model, String> {
    let _job = workspace.start_job()?;
    let mut state = workspace.session.lock().map_err(state_error)?;
    let model = state
        .model
        .as_mut()
        .ok_or("Bitte zuerst eine DNA-Datei importieren.")?;
    model.external.origins = external::origins(&entries)?.origins;
    Ok(model.clone())
}

#[tauri::command]
async fn load_catalog(
    handle: AppHandle,
    workspace: State<'_, Workspace>,
    trusted_key: String,
    language: Language,
) -> Result<Option<CatalogState>, String> {
    let workspace = workspace.inner().clone();
    background(move || {
        let job = workspace.start_job()?;
        let Some(path) = choose(
            &handle,
            language.select("Signed catalog package", "Signiertes Katalogpaket"),
            &["json", "rootscat"],
        )?
        else {
            return Ok(None);
        };
        let new_catalog = catalog::package(&path, &trusted_key)?;
        if job.cancel.load(Relaxed) {
            return Err("Katalogimport abgebrochen.".into());
        }
        let mut state = workspace.session.lock().map_err(state_error)?;
        if let (Some(profile), Some(model)) = (&state.imported, &state.model) {
            let mut fresh = model.clone();
            fresh.apply_catalog(&profile.data, &new_catalog)?;
            fresh.sequence = None;
            state.model = Some(fresh);
        }
        let version = new_catalog.version.clone();
        state.catalog = Some(new_catalog);
        Ok(Some(CatalogState {
            version,
            model: state.model.clone(),
        }))
    })
    .await
}
#[derive(Serialize)]
struct CatalogState {
    version: String,
    model: Option<Model>,
}

#[tauri::command]
async fn preview_pdf(
    workspace: State<'_, Workspace>,
    options: Options,
) -> Result<tauri::ipc::Response, String> {
    let workspace = workspace.inner().clone();
    background(move || {
        let _job = workspace.start_job()?;
        let model = workspace
            .session
            .lock()
            .map_err(state_error)?
            .model
            .clone()
            .ok_or("Bitte zuerst eine DNA-Datei importieren.")?;
        Ok(tauri::ipc::Response::new(report::render(
            &model,
            options,
            &report::typst_binary()?,
        )?))
    })
    .await
}
#[tauri::command]
async fn export_pdf(
    handle: AppHandle,
    workspace: State<'_, Workspace>,
    options: Options,
) -> Result<bool, String> {
    let workspace = workspace.inner().clone();
    background(move || {
        let _job = workspace.start_job()?;
        let model = workspace
            .session
            .lock()
            .map_err(state_error)?
            .model
            .clone()
            .ok_or("Bitte zuerst eine DNA-Datei importieren.")?;
        let Some(file) = handle
            .dialog()
            .file()
            .set_file_name("Roots Local Report.pdf")
            .add_filter("PDF", &["pdf"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file
            .into_path()
            .map_err(|_| "Der Export benötigt eine lokale Datei.")?;
        if !path_is_pdf(&path) {
            return Err("Bitte einen Dateinamen mit .pdf wählen.".into());
        }
        report::export(&model, options, &report::typst_binary()?, &path)?;
        Ok(true)
    })
    .await
}
fn path_is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
}

#[cfg(all(target_os = "macos", debug_assertions))]
fn apply_offline_test_profile() {
    if !std::env::args_os().any(|arg| arg == "--verify-offline") {
        return;
    }
    unsafe extern "C" {
        fn sandbox_init(
            profile: *const std::ffi::c_char,
            flags: u64,
            error: *mut *mut std::ffi::c_char,
        ) -> std::ffi::c_int;
        fn sandbox_free_error(error: *mut std::ffi::c_char);
    }
    let mut error = std::ptr::null_mut();
    let result = unsafe {
        sandbox_init(
            c"(version 1) (allow default) (deny network*)".as_ptr(),
            0,
            &mut error,
        )
    };
    if !error.is_null() {
        unsafe { sandbox_free_error(error) };
    }
    assert_eq!(
        result, 0,
        "Das Offline-Testprofil konnte nicht aktiviert werden."
    );
    if std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([1, 1, 1, 1], 443)),
        std::time::Duration::from_secs(2),
    )
    .is_ok()
    {
        panic!("Die Netzwerkblockade des Offline-Testprofils war unwirksam.");
    }
}

fn main() {
    #[cfg(all(target_os = "macos", debug_assertions))]
    apply_offline_test_profile();
    Builder::default()
        .manage(Workspace::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    matches!(
                        (url.scheme(), url.host_str()),
                        ("tauri", Some("localhost")) | ("http", Some("tauri.localhost"))
                    ) || (cfg!(debug_assertions)
                        && url.scheme() == "http"
                        && url.host_str() == Some("127.0.0.1")
                        && url.port() == Some(1420))
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            chapters,
            cancel_job,
            reset,
            import_dna,
            variants,
            import_extra,
            save_origins,
            load_catalog,
            preview_pdf,
            export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("Roots Local konnte nicht gestartet werden");
}
