use roots_local::{analysis, catalog::Catalog, import, report};
use std::{env, path::Path, sync::atomic::AtomicBool};

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let [Some(input), Some(output), Some(typst), example] =
        [args.next(), args.next(), args.next(), args.next()]
    else {
        return Err("Verwendung: roots-check <synthetische-oder-lokale-rohdatei> <report.pdf> <typst-binary>".into());
    };
    if example
        .as_deref()
        .is_some_and(|value| value != "--synthetic")
        || args.next().is_some()
    {
        return Err("Option: --synthetic für gekennzeichnete Beispieldaten.".into());
    }
    let data = import::file(Path::new(&input), &AtomicBool::new(false))?;
    let catalog = Catalog::starter()?;
    let summary = analysis::summary(&data);
    let model = report::Model::new(
        summary,
        catalog.version.clone(),
        analysis::evaluate(&data, &catalog)?,
        example.is_some(),
    );
    report::export(
        &model,
        report::Options::default(),
        Path::new(&typst),
        Path::new(&output),
    )?;
    println!(
        "{} Kapitel · {} Unterkapitel · {} Merkmale · {} Genotypzeilen",
        model.chapters.len(),
        model
            .chapters
            .iter()
            .map(|c| c.sections.len())
            .sum::<usize>(),
        model.findings.len(),
        model.summary.rows
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
