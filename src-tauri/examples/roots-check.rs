use roots_local::{analysis, catalog::Catalog, import, report};
use std::{env, path::Path, sync::atomic::AtomicBool};

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let [Some(input), Some(output), Some(typst)] = [args.next(), args.next(), args.next()] else {
        return Err("Verwendung: roots-check <Rohdatei> <report.pdf> <typst> [--synthetic] [--catalog <Paket> <öffentlicher Schlüssel>]".into());
    };
    let mut example = false;
    let mut catalog = None;
    while let Some(option) = args.next() {
        match option.to_str() {
            Some("--synthetic") if !example => example = true,
            Some("--catalog") if catalog.is_none() => {
                let path = args.next().ok_or("Katalogdatei fehlt.")?;
                let key = args
                    .next()
                    .and_then(|v| v.into_string().ok())
                    .ok_or("Öffentlicher Katalogschlüssel fehlt.")?;
                catalog = Some(roots_local::catalog::package(Path::new(&path), &key)?);
            }
            _ => return Err("Unbekannte oder doppelte Option.".into()),
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
        report::Options::default(),
        Path::new(&typst),
        Path::new(&output),
    )?;
    println!(
        "{} Kapitel · {} Unterkapitel · {} Ergebniseinträge · {} Genotypzeilen",
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
            "{hits} passende GWAS-Einträge von {} Katalogassoziationen",
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
