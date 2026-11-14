use ed25519_dalek::{Signer, SigningKey};
use roots_local::{
    analysis::{self, Status},
    catalog::{self, Catalog},
    external, import, report,
};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path, sync::atomic::AtomicBool};

const SAMPLE: &[u8] = include_bytes!("../../fixtures/synthetic-myheritage.txt");
const COLUMNS: &str = "# reference=GRCh37\nRSID,CHROMOSOME,POSITION,RESULT\n";

#[test]
fn full_taxonomy_and_four_reviewed_interpretations() {
    let catalog = Catalog::starter().unwrap();
    let data = import::parse(SAMPLE, &AtomicBool::new(false)).unwrap();
    let findings = analysis::evaluate(&data, &catalog).unwrap();
    let rules: Vec<_> = findings
        .iter()
        .filter(|x| x.status == Status::Personal)
        .map(|x| x.item.id.as_str())
        .collect();
    assert_eq!(rules, ["earwax", "bitter", "actn3", "lactase"]);
    let model = report::Model::new(analysis::summary(&data), catalog.version, findings, true);
    assert_eq!(
        model
            .chapters
            .iter()
            .map(|c| c.sections.len())
            .sum::<usize>(),
        76
    );
    assert_eq!(model.chapters.len(), 17);
    assert_eq!(model.summary.rows, 15);
    assert_eq!(model.summary.no_call, 1);
    assert_eq!(
        model
            .findings
            .iter()
            .filter(|x| x.status == Status::Research)
            .count(),
        7
    );
}

#[test]
fn missing_and_incompatible_data_do_not_create_calls() {
    let input = format!("{COLUMNS}rs4988235,2,136608646,AG\nrs4988235,2,136608646,AA\nrs17822931,16,48258198,--\nrs1815739,11,66560624,CT\n");
    let data = import::parse(input.as_bytes(), &AtomicBool::new(false)).unwrap();
    let out = analysis::evaluate(&data, &Catalog::starter().unwrap()).unwrap();
    let reason = |id: &str| out.iter().find(|f| f.item.id == id).unwrap().checks[0].status;
    assert_eq!(reason("lactase"), "Widersprüchliche Einträge");
    assert_eq!(reason("earwax"), "Position ohne Genotyp");
    assert_eq!(
        reason("actn3"),
        "Position oder Referenzbuild stimmt nicht überein"
    );
    assert_eq!(reason("bitter"), "Position fehlt");
    assert!(out.iter().all(|f| f.status == Status::Missing));
    assert_eq!(analysis::summary(&data).conflicts, 1);
    let unknown =
        b"rsID\tChromosome\tPosition\tAllele 1\tAllele 2\nrs4988235\t2\t136608646\tA\tG\n";
    let data = import::parse(&unknown[..], &AtomicBool::new(false)).unwrap();
    assert!(out.iter().all(|f| f.status == Status::Missing));
    assert_eq!(
        analysis::evaluate(&data, &Catalog::starter().unwrap())
            .unwrap()
            .iter()
            .find(|f| f.item.id == "lactase")
            .unwrap()
            .checks[0]
            .status,
        "Referenzgenom unbekannt"
    );
}

#[test]
fn build_38_bom_and_unphased_bitter_markers() {
    let input = "\u{feff}# assembly GRCh38\r\nrsID\tChromosome\tPosition\tAllele 1\tAllele 2\r\nrs4988235\tchr2\t135851076\tG\tA\r\nrs713598\t7\t141973545\tC\tG\r\nrs1726866\t7\t141972905\tA\tG\r\nrs10246939\t7\t141972804\tC\tT\r\n";
    let data = import::parse(input.as_bytes(), &AtomicBool::new(false)).unwrap();
    let findings = analysis::evaluate(&data, &Catalog::starter().unwrap()).unwrap();
    assert_eq!(
        findings
            .iter()
            .find(|f| f.item.id == "lactase")
            .unwrap()
            .status,
        Status::Personal
    );
    let bitter = findings.iter().find(|f| f.item.id == "bitter").unwrap();
    assert_eq!(bitter.status, Status::Missing);
    assert!(bitter.checks.iter().all(|c| c.call.is_some()));
}

#[test]
fn zip_and_cancellation_are_safe_and_repeatable() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("Öffnen – Beispieldatei.zip");
    let mut zip = zip::ZipWriter::new(fs::File::create(&path).unwrap());
    zip.start_file("export/dna.txt", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(SAMPLE).unwrap();
    zip.finish().unwrap();
    assert!(import::file(&path, &AtomicBool::new(true)).is_err());
    for _ in 0..2 {
        let imported = import::file(&path, &AtomicBool::new(false)).unwrap();
        assert_eq!(imported.rows.len(), 15);
        assert_eq!(imported.format, "ZIP / CSV");
    }
    fs::write(&path, b"PK\x03\x04not a zip").unwrap();
    assert!(import::file(&path, &AtomicBool::new(false)).is_err());
}

#[test]
fn local_origins_matches_segments_and_family() {
    let roots = external::origins("Region; 42,5%\nGruppe").unwrap();
    assert_eq!(roots.origins[0].percent, Some(42.5));
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("matches.csv");
    fs::write(
        &path,
        "Name,Shared DNA (cM),Relationship\nSynthetisch,400,Cousin\n",
    )
    .unwrap();
    assert_eq!(external::supporting_file(&path).unwrap().matches.len(), 1);
    fs::write(&path, "Name,Chromosome,Start Location,End Location,Segment Size (cM)\nSynthetisch,2,125,440,4.6\n").unwrap();
    assert_eq!(external::supporting_file(&path).unwrap().segments.len(), 1);
    let child = import::parse(SAMPLE, &AtomicBool::new(false)).unwrap();
    let parent = format!("{COLUMNS}rs4988235,2,136608646,AA\nrs17822931,16,48258198,CC\n");
    let parent = import::parse(parent.as_bytes(), &AtomicBool::new(false)).unwrap();
    let compare = external::compare(&child, &parent).unwrap();
    assert_eq!(
        (compare.compared, compare.compatible, compare.discordant),
        (2, 1, 1)
    );
}

#[test]
fn signed_catalog_rejects_tampering() {
    let key = SigningKey::from_bytes(&[42; 32]);
    let hex = |bytes: &[u8]| {
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    };
    let pubkey = hex(key.verifying_key().as_bytes());
    let payload = catalog::STARTER;
    let manifest = serde_json::json!({"schema":1,"version":"1.0.0","origin":"Test",
        "license":"Apache-2.0","builds":["GRCh37","GRCh38"],"sha256":format!("{:x}",Sha256::digest(payload.as_bytes()))}).to_string();
    let signature = hex(&key.sign(manifest.as_bytes()).to_bytes());
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("catalog.json");
    let mut package =
        serde_json::json!({"manifest":manifest,"payload":payload,"signature":signature});
    fs::write(&path, package.to_string()).unwrap();
    assert_eq!(catalog::package(&path, &pubkey).unwrap().version, "1.0.0");
    package["payload"] = serde_json::Value::String(format!("{payload} "));
    fs::write(&path, package.to_string()).unwrap();
    assert!(catalog::package(&path, &pubkey).is_err());
}

#[test]
fn optional_pdf_full_and_short() {
    let Some(typst) = std::env::var_os("ROOTS_TEST_TYPST") else {
        return;
    };
    let typst = Path::new(&typst);
    let catalog = Catalog::starter().unwrap();
    let data = import::parse(SAMPLE, &AtomicBool::new(false)).unwrap();
    let model = report::Model::new(
        analysis::summary(&data),
        catalog.version.clone(),
        analysis::evaluate(&data, &catalog).unwrap(),
        true,
    );
    let full = report::render(&model, report::Options::default(), typst).unwrap();
    let short = report::render(
        &model,
        report::Options {
            short: true,
            ..Default::default()
        },
        typst,
    )
    .unwrap();
    assert!(full.starts_with(b"%PDF") && short.starts_with(b"%PDF"));
    assert!(full.len() > short.len());
}
