use ed25519_dalek::{Signer, SigningKey};
use roots_local::{
    analysis::{self, Status},
    catalog::{self, Catalog, Confidence},
    clinical, external, import, lineage, report,
};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path, sync::atomic::AtomicBool};

const SAMPLE: &[u8] = include_bytes!("../../fixtures/synthetic-myheritage.txt");
const MATERNAL: &str = include_str!("../../fixtures/synthetic-maternal.json");
const COLUMNS: &str = "##reference=build37\nRSID,CHROMOSOME,POSITION,RESULT\n";

#[test]
fn maternal_summary_rejects_other_references_and_invalid_coverage() {
    let file = tempfile::NamedTempFile::new().unwrap();
    fs::write(file.path(), MATERNAL).unwrap();
    assert!(lineage::maternal_file(file.path()).is_ok());
    for invalid in [
        MATERNAL.replace("phylotree-rcrs@17.3", "phylotree-rsrs@17.2"),
        MATERNAL.replace("1200", "16570"),
        MATERNAL.replace("0.8351", "0.02"),
        MATERNAL.replace("H100", "unsupported markup"),
    ] {
        fs::write(file.path(), invalid).unwrap();
        assert!(lineage::maternal_file(file.path()).is_err());
    }
}

#[test]
fn trio_counts_unique_ambiguous_and_inconsistent_transmissions() {
    let parse = |rows: &str| {
        import::parse(
            format!("{COLUMNS}{rows}").as_bytes(),
            &AtomicBool::new(false),
        )
        .unwrap()
    };
    let child = parse("rs1,2,1,AG\nrs2,2,2,AG\nrs3,2,3,AA\nrs4,2,4,GG\nrs5,2,5,AG\n");
    let first = parse("rs1,2,1,AA\nrs2,2,2,AG\nrs3,2,3,AG\nrs4,2,4,AA\nrs5,2,5,AA\nrs5,2,5,GG\n");
    let second = parse("rs1,2,1,GG\nrs2,2,2,AG\nrs3,2,3,AA\nrs4,2,4,GG\nrs5,2,5,GG\n");
    let markers = [catalog::Marker(
        "rs1".into(),
        "Synthetic".into(),
        "2".into(),
        1,
        0,
        "AG".into(),
    )];
    let result =
        external::trio(&child, &first, &second, &markers, &AtomicBool::new(false)).unwrap();
    assert_eq!(result.compared, 4);
    assert_eq!(result.phased_heterozygous, 1);
    assert_eq!(result.ambiguous, 1);
    assert_eq!(result.homozygous, 1);
    assert_eq!(result.inconsistent, 1);
    assert_eq!(result.assignments.len(), 1);
    assert_eq!(
        (result.assignments[0].first, result.assignments[0].second),
        ('A', 'G')
    );
}

#[test]
fn kinship_uses_shared_biallelic_markers_after_coverage_gate() {
    let mut first = COLUMNS.to_owned();
    let mut second = COLUMNS.to_owned();
    for chromosome in 1..=20 {
        for position in 1..=1000 {
            let marker = chromosome * 1000 + position;
            let second_call = if position <= 500 { "AG" } else { "AA" };
            first.push_str(&format!("rs{marker},{chromosome},{position},AG\n"));
            second.push_str(&format!(
                "rs{marker},{chromosome},{position},{second_call}\n"
            ));
        }
    }
    let cancel = AtomicBool::new(false);
    let first = import::parse(first.as_bytes(), &cancel).unwrap();
    let mut second = import::parse(second.as_bytes(), &cancel).unwrap();
    let full = external::compare(&first, &second).unwrap();
    assert_eq!(full.kinship, Some(0.25));
    assert_eq!(full.kinship_markers, 20_000);
    second.rows.truncate(19_000);
    assert_eq!(external::compare(&first, &second).unwrap().kinship, None);
}

#[test]
fn clinvar_vcf_requires_consistent_assembly_identifier_and_alleles() {
    let cancel = AtomicBool::new(false);
    let data = import::parse(
        format!("{COLUMNS}rs1,2,1,AG\nrs2,2,2,AA\nrs3,2,3,AG\nrs4,2,4,AG\nrs4,2,4,GG\n").as_bytes(),
        &cancel,
    )
    .unwrap();
    let file = tempfile::NamedTempFile::new().unwrap();
    let source = concat!(
        "##fileformat=VCFv4.1\n##source=ClinVar\n##fileDate=2026-01-01\n##reference=GRCh37\n",
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n",
        "2\t1\t999999991\tA\tG\t.\t.\tRS=1;CLNSIG=Conflicting_classifications_of_pathogenicity;CLNSIGCONF=Pathogenic(1)|Benign(2);CLNREVSTAT=criteria_provided;CLNDN=Synthetic_condition;GENEINFO=TESTGENE:123;CLNDISDB=MONDO:MONDO:9999999\n",
        "2\t2\t999999992\tA\tG\t.\t.\tRS=2;CLNSIG=Pathogenic;CLNREVSTAT=criteria_provided\n",
        "2\t3\t999999993\tA\tG\t.\t.\tRS=10;CLNSIG=Pathogenic;CLNREVSTAT=criteria_provided\n",
        "2\t4\t999999994\tA\tG\t.\t.\tRS=4;CLNSIG=Pathogenic;CLNREVSTAT=criteria_provided\n",
    );
    let mut compressed = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    compressed.write_all(source.as_bytes()).unwrap();
    fs::write(file.path(), compressed.finish().unwrap()).unwrap();
    let matched = clinical::file(file.path(), &data, &cancel).unwrap();
    assert_eq!(matched.variants.len(), 1);
    assert_eq!(matched.variants[0].copies, 1);
    assert_eq!(
        matched.variants[0].conflicting_classifications,
        "Pathogenic(1) · Benign(2)"
    );
    let validity = concat!(
        "CLINGEN GENE DISEASE VALIDITY CURATIONS\nFILE CREATED: 2026-01-01\nWEBPAGE: example\n+++++\n",
        "GENE SYMBOL,GENE ID (HGNC),DISEASE LABEL,DISEASE ID (MONDO),MOI,SOP,CLASSIFICATION,ONLINE REPORT\n+++++\n",
        "TESTGENE,HGNC:123,Synthetic condition,MONDO:9999999,AR,SOP12,Strong,https://search.clinicalgenome.org/kb/gene-validity/test-1\n",
        "TESTGENE,HGNC:123,Other condition,MONDO:9999998,AR,SOP12,Strong,https://search.clinicalgenome.org/kb/gene-validity/test-2\n",
    );
    fs::write(file.path(), validity).unwrap();
    let evidence = clinical::gene_validity(file.path(), &matched, &cancel).unwrap();
    assert_eq!(evidence.records.len(), 1);
    assert_eq!(evidence.records[0].mondo, "MONDO:9999999");
    fs::write(file.path(), source.replace("GRCh37", "GRCh38")).unwrap();
    assert!(clinical::file(file.path(), &data, &cancel).is_err());
}

#[test]
fn full_taxonomy_and_four_reviewed_interpretations() {
    let catalog = Catalog::starter().unwrap();
    let data = import::parse(SAMPLE, &AtomicBool::new(false)).unwrap();
    let findings = analysis::evaluate(&data, &catalog).unwrap();
    let mut rules: Vec<_> = findings
        .iter()
        .filter(|x| x.status == Status::Personal)
        .map(|x| x.item.id.as_str())
        .collect();
    rules.sort_unstable();
    assert_eq!(
        rules,
        [
            "actn3",
            "alcohol",
            "bitter",
            "clotting-study",
            "diabetes",
            "earwax",
            "iron",
            "lactase",
            "lactase-evolution",
            "slco"
        ]
    );
    let by_id = |id: &str| findings.iter().find(|f| f.item.id == id).unwrap();
    assert_eq!(
        by_id("lactase").conclusion.as_deref(),
        Some("Wahrscheinlich laktosetolerant im Erwachsenenalter")
    );
    assert_eq!(by_id("lactase").confidence, Some(Confidence::Moderate));
    assert_eq!(
        by_id("earwax").conclusion.as_deref(),
        Some("Trockenes Ohrenschmalz")
    );
    assert_eq!(by_id("slco").dosage, Some(1));
    assert_eq!(by_id("alcohol").dosage, Some(0));
    assert_eq!(by_id("diabetes").dosage, Some(1));
    assert!(by_id("caffeine").conclusion.is_none());
    assert!(by_id("cyp2c19-clopidogrel").dosage.is_none());
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
        3
    );
}

#[test]
fn curated_hair_associations_match_supported_builds_and_alleles() {
    let catalog = Catalog::starter().unwrap();
    for (build_header, mc1r, tchh) in [
        ("GRCh37", 89986117, 152083325),
        ("GRCh38", 89919709, 152110849),
    ] {
        for (id, section, chromosome, position, observed, reference, unsupported, matched) in [
            (
                "rs1805007",
                "04.1",
                16,
                mc1r,
                "CT",
                "CC",
                "CG",
                Status::Personal,
            ),
            (
                "rs11803731",
                "04.2",
                1,
                tchh,
                "AT",
                "AA",
                "AC",
                Status::Research,
            ),
        ] {
            for (marker, coordinate, call, expected) in [
                (id, position, observed, matched.clone()),
                (id, position, reference, matched.clone()),
                (id, position, unsupported, Status::Missing),
                (id, position + 1, observed, Status::Missing),
                ("", position, observed, Status::Missing),
                (id, position, "--", Status::Missing),
            ] {
                let raw = format!("# reference={build_header}\nRSID,CHROMOSOME,POSITION,RESULT\n{marker},{chromosome},{coordinate},{call}\n");
                let data = import::parse(raw.as_bytes(), &AtomicBool::new(false)).unwrap();
                let findings = analysis::evaluate(&data, &catalog).unwrap();
                let finding = findings
                    .iter()
                    .find(|finding| finding.item.section == section && finding.checks[0].id == id)
                    .unwrap();
                assert_eq!(
                    finding.status, expected,
                    "{build_header} {marker} {coordinate} {call}"
                );
            }
        }
    }
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
fn phased_bitter_result_tracks_the_current_parent_files() {
    let cancel = AtomicBool::new(false);
    let from_rows =
        |rows: &str| import::parse(format!("{COLUMNS}{rows}").as_bytes(), &cancel).unwrap();
    let child =
        from_rows("rs713598,7,141673345,CG\nrs1726866,7,141672705,AG\nrs10246939,7,141672604,CT\n");
    let pav =
        from_rows("rs713598,7,141673345,GG\nrs1726866,7,141672705,AA\nrs10246939,7,141672604,CC\n");
    let avi =
        from_rows("rs713598,7,141673345,CC\nrs1726866,7,141672705,GG\nrs10246939,7,141672604,TT\n");
    let catalog = Catalog::starter().unwrap();
    let markers = catalog.markers().unwrap();
    let mut findings = analysis::evaluate(&child, &catalog).unwrap();
    let bitter = findings
        .iter()
        .position(|entry| entry.item.id == "bitter")
        .unwrap();
    assert_eq!(findings[bitter].status, Status::Missing);
    analysis::resolve_bitter_phase(
        &mut findings,
        &external::trio(&child, &pav, &avi, &markers, &cancel).unwrap(),
    );
    assert_eq!(findings[bitter].status, Status::Personal);
    assert!(findings[bitter].message.contains("AVI/PAV"));
    analysis::resolve_bitter_phase(
        &mut findings,
        &external::trio(&child, &child, &child, &markers, &cancel).unwrap(),
    );
    assert_eq!(findings[bitter].status, Status::Missing);
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
    let mut payload: serde_json::Value = serde_json::from_str(catalog::STARTER).unwrap();
    payload["markers"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!([
            "rs90000001",
            "GWAS-Lokus",
            "1",
            12000,
            14000,
            "ACGT"
        ]));
    payload["traits"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!({
            "id": "gwas-synthetic",
            "section": "09.1",
            "title": "Synthetischer Test",
            "markers": ["rs90000001"],
            "method": "gwas",
            "evidence": "Test",
            "summary": "Test",
            "limits": "Test",
            "population": "Test",
            "sources": [["Test", "https://example.org"]],
            "study": {
                "reported_trait": "Synthetischer Test",
                "accession": "GCST000001",
                "p_value": "2E-28539",
                "effect": "1.4",
                "effect_context": "OR"
            }
        }));
    let version = payload["version"].as_str().unwrap().to_owned();
    let payload = payload.to_string();
    let manifest = serde_json::json!({"schema":1,"version":version,"origin":"Test",
        "license":"Apache-2.0","builds":["GRCh37","GRCh38"],"sha256":format!("{:x}",Sha256::digest(payload.as_bytes()))}).to_string();
    let signature = hex(&key.sign(manifest.as_bytes()).to_bytes());
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("catalog.json");
    let mut package =
        serde_json::json!({"manifest":manifest,"payload":payload,"signature":signature});
    fs::write(&path, package.to_string()).unwrap();
    let verified = catalog::package(&path, &pubkey).unwrap();
    assert_eq!(verified.version, version);
    for (row, matched) in [
        ("rs90000001,1,12000,AG", true),
        ("rs90000001,1,12001,AG", false),
        (",1,12000,AG", false),
        ("rs90000001,1,12000,--", false),
    ] {
        let input = format!("{COLUMNS}{row}\n");
        let data = import::parse(input.as_bytes(), &AtomicBool::new(false)).unwrap();
        let (total, findings) = analysis::evaluate_with_coverage(&data, &verified).unwrap();
        assert_eq!(total, 1);
        let hit = findings.iter().find(|finding| finding.item.study.is_some());
        assert_eq!(
            hit.map(|finding| &finding.status),
            matched.then_some(&Status::Research)
        );
    }
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
    let mut model = report::Model::new(
        analysis::summary(&data),
        catalog.version.clone(),
        analysis::evaluate(&data, &catalog).unwrap(),
        true,
    );
    model.sequence = Some(roots_local::cram::Coverage {
        build: import::Build::Grch37,
        reads: 4,
        targets: vec![roots_local::cram::Target {
            id: "synthetic".into(),
            coordinate: "22:2".into(),
            depth: 2,
            bases: [0, 1, 1, 0],
        }],
    });
    let full = report::render(&model, report::Options::default(), typst).unwrap();
    let short = report::render(
        &model,
        report::Options {
            short: true,
            include_calls: true,
            ..Default::default()
        },
        typst,
    )
    .unwrap();
    assert!(full.starts_with(b"%PDF") && short.starts_with(b"%PDF"));
    assert!(full.len() > short.len());
}

#[test]
fn additive_score_requires_full_matching_build_and_alleles() {
    use roots_local::pgs::{calculate, Score, Term};
    let model = Score {
        id: "synthetic".into(),
        title: "Synthetic model".into(),
        build: import::Build::Grch37,
        population: "Synthetic".into(),
        source: "https://example.org/test".into(),
        terms: vec![
            Term {
                chromosome: "2".into(),
                position: 136608646,
                effect: 'A',
                other: 'G',
                weight: 0.25,
            },
            Term {
                chromosome: "16".into(),
                position: 48258198,
                effect: 'T',
                other: 'C',
                weight: 0.5,
            },
        ],
    };
    let input = import::parse(SAMPLE, &AtomicBool::new(false)).unwrap();
    let result = calculate(&input, std::slice::from_ref(&model));
    assert_eq!(result[0].raw, Some(1.25));
    let malformed = format!("{COLUMNS}rs4988235,2,136608646,AG\nrs17822931,16,48258198,AA\n");
    let malformed = import::parse(malformed.as_bytes(), &AtomicBool::new(false)).unwrap();
    let result = calculate(&malformed, std::slice::from_ref(&model));
    assert_eq!((result[0].matched, result[0].raw), (1, None));

    if let Some(typst) = std::env::var_os("ROOTS_TEST_TYPST") {
        let catalog = Catalog::starter().unwrap();
        let mut pdf = report::Model::new(
            analysis::summary(&input),
            catalog.version.clone(),
            analysis::evaluate(&input, &catalog).unwrap(),
            true,
        );
        pdf.scores = calculate(&input, std::slice::from_ref(&model));
        let mut incomplete = calculate(&malformed, &[model]).remove(0);
        incomplete.title = "Incomplete synthetic score".into();
        pdf.scores.push(incomplete);
        // A normal finding in the same section must not suppress the score.
        pdf.findings
            .iter_mut()
            .find(|entry| entry.item.id == "lactase")
            .unwrap()
            .item
            .section = "14.4".into();
        for short in [false, true] {
            let data = report::render(
                &pdf,
                report::Options {
                    short,
                    ..Default::default()
                },
                Path::new(&typst),
            )
            .unwrap();
            assert!(data.starts_with(b"%PDF"));
        }
        if let Some(python) = std::env::var_os("ROOTS_TEST_PYTHON") {
            verify_pdf_contents(&mut pdf, &input, Path::new(&typst), Path::new(&python));
        }
    }
}

fn verify_pdf_contents(
    pdf: &mut report::Model,
    input: &import::Import,
    typst: &Path,
    python: &Path,
) {
    use roots_local::locale::Language;
    let directory = tempfile::tempdir().unwrap();
    let vcf = directory.path().join("reference.vcf");
    fs::write(&vcf, concat!(
        "##fileformat=VCFv4.1\n##source=ClinVar\n##fileDate=2026-01-01\n##reference=GRCh37\n",
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n",
        "2\t136608646\t999999991\tA\tG\t.\t.\tRS=4988235;CLNSIG=Pathogenic;CLNREVSTAT=criteria_provided;CLNDN=Synthetic_condition\n",
    )).unwrap();
    let mut clinical = clinical::file(&vcf, input, &AtomicBool::new(false)).unwrap();
    clinical.gene_validity = Some(clinical::GeneValidity {
        date: "2026-01-01".into(),
        records: vec![clinical::GeneDisease {
            gene: "TESTGENE".into(),
            hgnc: "HGNC:999999".into(),
            disease: "Synthetic curation".into(),
            mondo: "MONDO:9999999".into(),
            inheritance: "AR".into(),
            classification: "Strong".into(),
            evidence_url: "https://search.clinicalgenome.org/kb/gene-validity/synthetic-test"
                .into(),
        }],
    });
    pdf.clinical = Some(clinical);
    let maternal = directory.path().join("maternal.json");
    fs::write(&maternal, MATERNAL).unwrap();
    pdf.maternal_lineage = Some(lineage::maternal_file(&maternal).unwrap());
    for (language, score, coverage, marker, unavailable) in [
        (
            Language::En,
            "Raw score 1.25",
            "2 / 2 model positions",
            "Lactase activity in adulthood",
            "A raw score requires complete coverage",
        ),
        (
            Language::De,
            "Rohscore 1.25",
            "2 / 2 Modellpositionen",
            "Laktaseaktivität im Erwachsenenalter",
            "Kein Rohscore bei unvollständiger Abdeckung",
        ),
    ] {
        for short in [false, true] {
            for (include_clinical, include_calls) in
                [(false, false), (false, true), (true, false), (true, true)]
            {
                let path = directory.path().join("report.pdf");
                report::export(
                    pdf,
                    report::Options {
                        language,
                        short,
                        include_clinical,
                        include_calls,
                        include_lineage: !include_clinical,
                        ..Default::default()
                    },
                    typst,
                    &path,
                )
                .unwrap();
                let result = std::process::Command::new(python)
                    .env("PYTHONIOENCODING", "utf-8")
                    .arg("-c")
                    .arg("from pypdf import PdfReader; import sys; print(' '.join(' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages).split()))")
                    .arg(&path)
                    .output().unwrap();
                assert!(
                    result.status.success(),
                    "{}",
                    String::from_utf8_lossy(&result.stderr)
                );
                let text = String::from_utf8(result.stdout).unwrap();
                for required in [
                    score,
                    coverage,
                    marker,
                    unavailable,
                    "Synthetic model",
                    "Incomplete synthetic score",
                ] {
                    assert!(
                        text.contains(required),
                        "Missing {required:?} in {language:?}, short={short}"
                    );
                }
                for clinical_detail in [
                    "ClinVar 999999991",
                    "Synthetic condition",
                    "Synthetic curation",
                ] {
                    assert_eq!(
                        text.contains(clinical_detail),
                        include_clinical,
                        "Unexpected {clinical_detail} in {language:?}, short={short}"
                    );
                }
                assert_eq!(text.contains("G × 1"), include_clinical && include_calls);
                assert_eq!(text.contains("H100 · 83.51 %"), !include_clinical);
                assert_eq!(text.contains("phylotree-rcrs@17.3"), !include_clinical);
                let unresolved = language.select(
                    "The assignment remains unresolved.",
                    "Die Zuordnung bleibt offen.",
                );
                assert_eq!(text.contains(unresolved), !include_clinical);
                if !short {
                    let (conclusion, medical) = language.select2(
                        (
                            "Likely lactose tolerant as an adult",
                            "TCF7L2 risk allele T",
                        ),
                        (
                            "Wahrscheinlich laktosetolerant im Erwachsenenalter",
                            "TCF7L2-Risikoallels T",
                        ),
                    );
                    assert!(
                        text.contains(conclusion),
                        "Missing conclusion in {language:?}"
                    );
                    assert_eq!(
                        text.contains(medical),
                        include_clinical,
                        "Medical conclusion gating failed in {language:?}"
                    );
                }
            }
        }
    }
}
