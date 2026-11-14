use roots_local::{analysis, catalog::Catalog, import, report};
use std::{env, path::Path, sync::atomic::AtomicBool};

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let [Some(input), Some(output), Some(typst)] = [args.next(), args.next(), args.next()] else {
        return Err("Usage: roots-check <raw-data> <report.pdf> <typst> [--synthetic] [--german] [--catalog <package> <public-key>]".into());
    };
    let mut example = false;
    let mut language = roots_local::locale::Language::En;
    let mut catalog = None;
    while let Some(option) = args.next() {
        match option.to_str() {
            Some("--synthetic") if !example => example = true,
            Some("--german") => language = roots_local::locale::Language::De,
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
    let data = import::file(Path::new(&input), &AtomicBool::new(false))?;
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
    report::export(
        &model,
        report::Options {
            language,
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
