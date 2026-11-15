use roots_local::{analysis, catalog::Catalog, clinical, cram, external, import, lineage, report};
use std::{env, path::Path, sync::atomic::AtomicBool};

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let [Some(input), Some(output), Some(typst)] = [args.next(), args.next(), args.next()] else {
        return Err("Usage: roots-check <raw-data> <report.pdf> <typst> [--synthetic] [--german] [--short] [--include-calls] [--include-clinical] [--catalog <package> <public-key>] [--clinvar <vcf> [--clingen <csv>]] [--parents <first> <second>] [--cram <cram> <indexed-fasta>] [--lineage <summary-json> [--include-lineage]]".into());
    };
    let mut example = false;
    let mut language = roots_local::locale::Language::En;
    let mut include_calls = false;
    let mut include_clinical = false;
    let mut include_lineage = false;
    let mut short = false;
    let mut catalog = None;
    let mut clinvar = None;
    let mut clingen = None;
    let mut parents = None;
    let mut sequencing = None;
    let mut maternal = None;
    while let Some(option) = args.next() {
        match option.to_str() {
            Some("--synthetic") if !example => example = true,
            Some("--german") => language = roots_local::locale::Language::De,
            Some("--include-calls") => include_calls = true,
            Some("--include-clinical") => include_clinical = true,
            Some("--include-lineage") => include_lineage = true,
            Some("--short") => short = true,
            Some("--clinvar") if clinvar.is_none() => {
                clinvar = Some(args.next().ok_or("Missing ClinVar VCF file.")?);
            }
            Some("--clingen") if clingen.is_none() => {
                clingen = Some(args.next().ok_or("Missing ClinGen CSV file.")?);
            }
            Some("--parents") if parents.is_none() => {
                let first = args.next().ok_or("Missing first parent file.")?;
                let second = args.next().ok_or("Missing second parent file.")?;
                parents = Some((first, second));
            }
            Some("--cram") if sequencing.is_none() => {
                let path = args.next().ok_or("Missing CRAM file.")?;
                let reference = args.next().ok_or("Missing indexed FASTA file.")?;
                sequencing = Some((path, reference));
            }
            Some("--lineage") if maternal.is_none() => {
                maternal = Some(args.next().ok_or("Missing Haplogrep summary JSON.")?);
            }
            Some("--catalog") if catalog.is_none() => {
                let path = args.next().ok_or("Missing catalog file.")?;
                let key = args
                    .next()
                    .and_then(|v| v.into_string().ok())
                    .ok_or("Missing catalog public key.")?;
                catalog = Some(roots_local::catalog::package(Path::new(&path), &key)?);
            }
            _ => return Err("Unknown or repeated option.".into()),
        }
    }
    let cancel = AtomicBool::new(false);
    let data = import::file(Path::new(&input), &cancel)?;
    let catalog = match catalog {
        Some(catalog) => catalog,
        None => Catalog::starter()?,
    };
    let mut model = report::Model::new(
        analysis::summary(&data),
        catalog.version.clone(),
        Vec::new(),
        example,
    );
    model.apply_catalog(&data, &catalog)?;
    if let Some(path) = clinvar {
        let mut matches = clinical::file(Path::new(&path), &data, &cancel)?;
        println!("{} matching ClinVar records", matches.variants.len());
        if let Some(path) = clingen {
            let validity = clinical::gene_validity(Path::new(&path), &matches, &cancel)?;
            println!("{} matching ClinGen curations", validity.records.len());
            matches.gene_validity = Some(validity);
        }
        model.clinical = Some(matches);
    } else if clingen.is_some() {
        return Err("ClinGen import requires a ClinVar file.".into());
    }
    if let Some((first, second)) = parents {
        let first = import::file(Path::new(&first), &cancel)?;
        let second = import::file(Path::new(&second), &cancel)?;
        let result = external::trio(&data, &first, &second, &catalog.markers()?, &cancel)?;
        println!("{} shared trio markers", result.compared);
        model.apply_trio(result);
    }
    if let Some((path, reference)) = sequencing {
        let coverage = cram::coverage(
            Path::new(&path),
            Path::new(&reference),
            &catalog.markers()?,
            &cancel,
        )?;
        let covered = coverage
            .targets
            .iter()
            .filter(|site| site.depth > 0)
            .count();
        println!(
            "{covered}/{} catalog targets with qualifying bases",
            coverage.targets.len()
        );
        model.sequence = Some(coverage);
    }
    if let Some(path) = maternal {
        model.maternal_lineage = Some(lineage::maternal_file(Path::new(&path))?);
    }
    report::export(
        &model,
        report::Options {
            language,
            include_calls,
            include_clinical,
            include_lineage,
            short,
            ..Default::default()
        },
        Path::new(&typst),
        Path::new(&output),
    )?;
    println!(
        "{} chapters · {} sections · {} results · {} genotype rows",
        model.chapters.len(),
        model
            .chapters
            .iter()
            .map(|c| c.sections.len())
            .sum::<usize>(),
        model.findings.len(),
        model.summary.rows
    );
    if model.gwas_total > 0 {
        let hits = model
            .findings
            .iter()
            .filter(|f| f.item.study.is_some())
            .count();
        println!(
            "{hits} matching GWAS entries out of {} catalog associations",
            model.gwas_total
        );
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
