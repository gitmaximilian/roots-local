#let report = json("report.json")
#let lang = report.options.language
#let tr(de, en) = if lang == "de" { de } else { en }
#let theme = rgb("#15443c")
#let ink = rgb("#202f2c")
#let secondary = rgb("#526861")
#let paper = rgb("#ecf4ef")
#set document(title: "Roots Local · " + tr("DNA-Report", "DNA report"))
#set text(font: "Libertinus Serif", lang: lang, size: 11pt, fill: ink)
#set par(leading: 0.67em, justify: false)
#set heading(numbering: none)
#show heading.where(level: 1): set text(size: 22pt, fill: theme)
#show heading.where(level: 2): set text(size: 15pt, fill: theme)
#set page(
  paper: "a4", margin: (left: 20mm, right: 20mm, top: 21mm, bottom: 20mm),
  header: context if counter(page).get().first() > 1 {
    text(size: 9pt, fill: secondary)[Roots Local #h(1fr) #tr("DNA-Report", "DNA report")]
    line(length: 100%, stroke: 0.5pt + rgb("#dbe4df"))
  },
  footer: context if counter(page).get().first() > 1 {
    text(size: 9pt, fill: secondary)[#tr("Referenzkatalog", "Reference catalog") #report.catalog_version #h(1fr) #counter(page).display()]
  }
)
#let status(value) = (personal: tr("Persönlich auswertbar", "Interpretable"), research: tr("Studienbezug", "Research association"), missing: tr("Nicht beurteilbar", "Unresolved")).at(value)
#let box-stat(number, title) = block(width: 100%, fill: paper, inset: 12pt, radius: 5pt)[
  #text(size: 20pt, fill: theme, weight: "bold")[#number]
  #linebreak()
  #text(size: 10pt, fill: secondary)[#title]
]
#let caption(body) = text(size: 9.5pt, fill: secondary, body)
#let card(finding) = {
  block(breakable: false, width: 100%, inset: (left: 11pt, top: 8pt, bottom: 6pt), stroke: (left: 1.6pt + theme))[
    #text(size: 12.5pt, fill: theme, weight: "bold")[#finding.title] #h(0.5em) #caption(status(finding.status))
    #parbreak()
    #finding.summary #finding.message
    #parbreak()
    #caption([#tr("Evidenz", "Evidence") · #finding.evidence \
      #tr("Studienpopulation", "Study population") · #finding.population \
      #finding.limits])
    #parbreak()
    #if "study" in finding [
      #caption([#tr("Merkmal in der Studie", "Reported trait") · #finding.study.reported_trait \
        #tr("Signifikanz in der Studie", "Study significance") · p = #finding.study.p_value])
      #if finding.study.effect != "" [
        #linebreak()
        #caption([#tr("Berichteter Effekt (OR oder Beta)", "Reported effect (OR or beta)") · #finding.study.effect #finding.study.effect_context])
      ]
      #parbreak()
    ]
    #for check in finding.checks {
      caption([#check.id · #check.gene#if check.coordinate != none [ · #check.coordinate] · #check.status#if check.call != none [ · #check.call]])
      linebreak()
    }
    #caption(finding.sources.map(source => link(source.at(1), source.at(0))).join([ · ]))
  ]
}

#v(22mm)
#text(size: 11pt, weight: "bold", fill: theme, tracking: 0.1em)[ROOTS LOCAL]
#v(11mm)
#text(size: 41pt, fill: theme, weight: "bold")[#tr("Dein DNA-Report", "Your DNA report")]
#v(4mm)
#text(size: 16pt, fill: secondary)[#tr("Entdecke deine DNA. Offline.", "Explore your DNA. Offline.")]
#v(16mm)
#if report.options.name != none { text(size: 17pt, report.options.name); v(4mm) }
#if report.example { block(fill: paper, inset: 8pt, radius: 4pt)[#tr("Synthetisches Profil", "Synthetic profile")] }
#grid(columns: (1fr, 1fr, 1fr), gutter: 7pt,
  box-stat(report.personal, tr("Auswertbare Merkmale", "Interpretable traits")),
  box-stat(report.research, tr("Studienbezüge", "Research associations")),
  box-stat(report.summary.rows, tr("Genotypzeilen", "Genotype rows"))
)
#v(11mm)
#caption([#tr("MyHeritage-Format", "MyHeritage format") · #report.summary.format · #tr("Referenzgenom", "Reference genome") #(if report.summary.build == none { tr("unbekannt", "unknown") } else { report.summary.build }) \
  Roots Local #report.version · #tr("Referenzkatalog", "Reference catalog") #report.catalog_version])
#pagebreak()

#outline(title: [#tr("Inhalt", "Contents")], depth: 1, indent: auto)
#if not report.options.short [
  #pagebreak(weak: true)
  #outline(title: [#tr("Unterkapitel", "Sections")], depth: 2, indent: auto)
]
#pagebreak(weak: true)

#heading(level: 1, [#tr("Datenübersicht", "Data overview")])
#grid(columns: (1fr, 1fr, 1fr), gutter: 7pt,
  box-stat(report.missing, tr("Offene Merkmalsregeln", "Unresolved trait rules")),
  box-stat(report.summary.no_call, tr("Zeilen ohne Genotyp", "Rows without a genotype")),
  box-stat(report.summary.conflicts, tr("Widersprüchliche Positionen", "Conflicting positions"))
)

#v(5mm)
#tr("Der Bericht wertet die importierten Positionen anhand des dokumentierten Referenzkatalogs aus. Die Quellen sind bei den Befunden verlinkt.", "The report evaluates imported positions using the documented reference catalog. Sources are linked alongside each finding.")

#if report.summary.build == none [
  #parbreak()
  #tr("Der Dateikopf nennt kein unterstütztes Referenzgenom. Merkmalsregeln bleiben für diesen Import offen.", "The file header does not identify a supported reference assembly. Trait interpretations remain unresolved for this import.")
]

#if report.gwas_total > 0 [
  #tr("GWAS-Katalog", "GWAS Catalog") · #report.findings.filter(f => "study" in f).len() #tr("passende Studienassoziationen von", "matching research associations out of") #report.gwas_total #tr("Katalogeinträgen.", "catalog entries.")
  #parbreak()
]
#if report.summary.skipped > 0 [#report.summary.skipped #tr("ungültige Rohdatenzeilen wurden übersprungen.", "invalid rows were skipped.")]
#if report.summary.duplicates > 0 [#report.summary.duplicates #tr("zusätzliche Zeilen lagen an bereits erfassten Positionen.", "extra rows repeated previously recorded positions.")]
#if report.family != none [
  #heading(level: 2, [#tr("Familiendatei", "Family DNA file")])
  #report.family.compared #tr("gemeinsam auswertbare autosomale Positionen.", "comparable autosomal positions.")
  #report.family.compatible #tr("mit mindestens einem geteilten Allel.", "with at least one shared allele.")
  #report.family.discordant #tr("ohne geteiltes Allel.", "without a shared allele.")
  #report.family.identical #tr("mit identischem Genotyp.", "with identical genotypes.")
  #if report.family.kinship != none [
    #parbreak()
    #tr("KING-Koeffizient (Forschungswert)", "KING coefficient (research use)") #str(calc.round(report.family.kinship, digits: 4)) · #report.family.kinship_markers #tr("geprüfte Marker", "markers checked"). #link("https://doi.org/10.1093/bioinformatics/btq559", [#tr("Methode", "Method")]).
    #parbreak()
  ]
  #tr("Dieser Vergleich ist keine Verwandtschaftsbestimmung.", "This comparison on its own cannot determine a family relationship.")
]
#if report.trio != none [
  #heading(level: 2, [#tr("Abgleich zweier Elterndateien", "Two-parent comparison")])
  #report.trio.compared #tr("gemeinsam geprüfte autosomale Marker.", "shared autosomal markers checked.")
  #report.trio.phased_heterozygous #tr("heterozygote Marker mit eindeutiger Zuordnung.", "heterozygous markers with a unique assignment.")
  #report.trio.ambiguous #tr("mehrdeutige Zuordnungen.", "ambiguous assignments.")
  #report.trio.homozygous #tr("kompatible homozygote Marker.", "compatible homozygous markers.")
  #report.trio.inconsistent #tr("unvereinbare Genotypen.", "inconsistent genotypes.")
  #tr("Die Auswertung prüft einzelne Positionen und setzt die angegebenen Elternrollen voraus.", "The comparison evaluates single positions and assumes the supplied parent roles.")
  #if report.options.include_calls and report.trio.assignments.len() > 0 [
    #parbreak()
    *#tr("Allelzuordnung für Katalogmarker", "Allele assignments at catalog markers")*
    #block(breakable: true, table(
      columns: (1fr, 1fr, 1fr, 1fr),
      table.header([Marker], [Position], [#tr("Erster Elternteil", "First parent")], [#tr("Zweiter Elternteil", "Second parent")]),
      ..report.trio.assignments.map(row => (row.marker, [#row.chromosome:#row.position], row.first, row.second)).flatten()
    ))
  ]
]
#if report.sequence != none [
  #heading(level: 2, [#tr("Sequenzierdaten", "Sequencing data")])
  #report.sequence.build · #report.sequence.reads #tr("untersuchte Reads.", "reads examined.") #report.sequence.targets.filter(target => target.depth > 0).len() / #report.sequence.targets.len() #tr("Marker mit Basen nach Qualitätsfilter.", "markers with bases passing quality filters.")
  #parbreak()
  #tr("Die Lesetiefe bezieht sich auf die ausgewählten Positionen. Sie liefert hier keine Genotypen.", "Read depth is reported for the selected positions. The analysis does not call genotypes.")
  #for target in report.sequence.targets [
    #caption([#target.id · #target.coordinate · #target.depth #tr("qualifizierte Basen", "bases passing quality filters")])
    #if report.options.include_calls [
      #caption([A #target.bases.at(0) · C #target.bases.at(1) · G #target.bases.at(2) · T #target.bases.at(3)])
    ]
    #linebreak()
  ]
]

#for chapter in report.chapters {
  let chapter-findings = report.findings.filter(f => f.section.split(".").first() == chapter.id)
  let has-import = (chapter.id == "01" and (report.external.origins.len() > 0 or report.maternal_lineage != none)) or (chapter.id == "02" and report.external.matches.len() + report.external.segments.len() > 0)
  if not report.options.short or has-import or (chapter.id == "14" and (report.scores.len() > 0 or report.clinical != none)) or chapter-findings.any(f => f.status != "missing") {
    if not report.options.short { pagebreak(weak: true) }
    heading(level: 1, [#chapter.id · #chapter.title])
    if chapter.id == "01" and report.external.origins.len() > 0 {
      heading(level: 2, tr("Übernommene Herkunftsangaben", "Imported ancestry results"))
      for origin in report.external.origins {
        [#origin.label#if origin.percent != none [ · #origin.percent %] \
        ]
      }
    }
    if chapter.id == "02" and (report.external.matches.len() + report.external.segments.len() > 0) {
      heading(level: 2, tr("Importierte Begleitdaten", "Imported companion data"))
      for person in report.external.matches {
        [#person.name · #person.cm cM#if person.relationship != none [ · #person.relationship] \
        ]
      }
      for segment in report.external.segments {
        [#segment.name · #segment.chromosome:#segment.start–#segment.end · #segment.cm cM \
        ]
      }
    }
    for section in chapter.sections {
      let own = chapter-findings.filter(f => f.section == section.id and (not report.options.short or f.status != "missing"))
      let cross = report.findings.filter(f => section.id in f.cross and (not report.options.short or f.status != "missing"))
      let has-clinvar = section.id == "14.1" and report.clinical != none
      let has-scores = section.id == "14.4" and report.scores.len() > 0
      let has-maternal = section.id == "01.3" and report.maternal_lineage != none
      if not report.options.short or own.len() > 0 or has-clinvar or has-scores or has-maternal {
        heading(level: 2, [#section.id · #section.title])
        if not report.options.short { caption(section.scope); parbreak() }
        if has-maternal {
          let result = report.maternal_lineage
          [
            *#tr("Importiertes mtDNA-Ergebnis", "Imported mtDNA result")* · Haplogrep #result.tool_version · #result.tree \
            #result.covered_positions / 16569 #tr("Positionen im angegebenen Bereich", "positions in the reported range") \
            #result.warnings #if result.warnings == 1 { tr("Warnung", "warning") } else { tr("Warnungen", "warnings") } · #result.errors #if result.errors == 1 { tr("Fehler bei der Qualitätsprüfung", "quality control error") } else { tr("Fehler bei der Qualitätsprüfung", "quality control errors") } \
            #if result.errors > 0 [
              #tr("Haplogrep meldet Fehler. Die Zuordnung bleibt offen.", "Haplogrep reported errors. The assignment remains unresolved.") \
            ]
            #for hit in result.candidates [
              *#hit.haplogroup* · #str(calc.round(hit.quality * 100, digits: 2)) % #tr("Übereinstimmung", "tree match score") \
            ]
            #link("https://doi.org/10.1093/nar/gkad284", [Haplogrep 3])
          ]
          parbreak()
        }
        if has-clinvar {
          [*ClinVar* · #report.clinical.release · #report.clinical.build · #report.clinical.variants.len() #tr("passende Einträge", "matching records")]
          parbreak()
          [#tr("Treffer aus Verbrauchertests benötigen eine unabhängige Bestätigung. Fehlende Treffer erlauben keine Aussage über Erkrankungsrisiken.", "Matches from consumer DNA data require independent confirmation. An empty result gives no information about disease risk.")]
          parbreak()
          for variant in report.clinical.variants [
            *#variant.marker* · #variant.chromosome:#variant.position · #link("https://www.ncbi.nlm.nih.gov/clinvar/variation/" + str(variant.id) + "/", [ClinVar #variant.id]) \
            #variant.classifications · #variant.review_status
            #if report.options.include_calls [ · #variant.alternate × #variant.copies]
            #if variant.conditions != "" [\ #variant.conditions]
            #if variant.conflicting_classifications != "" [\ #variant.conflicting_classifications]
            #parbreak()
          ]
          if report.clinical.gene_validity != none [
            *#tr("ClinGen-Gen-Krankheits-Evidenz", "ClinGen gene–disease validity")* · #report.clinical.gene_validity.date
            #parbreak()
            #tr("ClinGen beurteilt den Zusammenhang zwischen Gen und Erkrankung.", "ClinGen evaluates the evidence linking a gene to a disease.")
            #parbreak()
            #for entry in report.clinical.gene_validity.records [
              #entry.gene (#entry.hgnc) · #entry.disease (#entry.mondo) · #entry.inheritance · #entry.classification ·
              #link(entry.evidence_url, [ClinGen]) \
            ]
          ]
        }
        if has-scores {
          for score in report.scores [
            *#score.title* · #score.id \
            #score.matched / #score.total #tr("Modellpositionen.", "model positions.")
            #if score.raw != none [#tr("Rohscore", "Raw score") #str(calc.round(score.raw, digits: 5)).] else [#tr("Kein Rohscore bei unvollständiger Abdeckung.", "A raw score requires complete coverage.")]
            #tr("Studienpopulation", "Study population") · #score.population. #link(score.source, [#tr("Quelle", "Source")]). \
            #tr("Forschungswert ohne Perzentil oder persönliche Erkrankungswahrscheinlichkeit.", "Research score without a percentile or individual disease risk estimate.")
            #parbreak()
          ]
        }
        if own.len() == 0 and cross.len() == 0 and not report.options.short and not has-clinvar and not has-scores and not has-maternal {
          if section.id == "03.1" {
            [#report.summary.rows #tr("Zeilen aus", "rows from") #report.summary.format · #tr("Referenzgenom", "Reference genome") #(if report.summary.build == none { tr("unbekannt", "unknown") } else { report.summary.build }).]
          } else if section.id == "03.4" {
            link(label("method"), [#tr("Siehe Methodik und Abdeckung.", "See methods and coverage.")])
          } else {
            caption([#tr("Der aktuelle Katalog enthält hier keine anwendbare Auswertungsregel.", "The active catalog has no applicable rule for this section.")])
          }
        }
        for finding in own {
          [#card(finding) #label("finding-" + finding.id)]
        }
        for finding in cross {
          caption(link(label("finding-" + finding.id), [#tr("Siehe", "See") #finding.title]))
        }
      }
    }
  }
}

#pagebreak(weak: true)
#heading(level: 1, [#tr("Methodik & Abdeckung", "Methods & coverage")]) <method>
#if report.provenance != none [#tr("Referenzkatalog", "Reference catalog") · #report.provenance.origin · #report.provenance.license. #parbreak()]
- #tr("Analysiert werden nur die im Referenzkatalog beschriebenen Positionen. Zuordnung anhand von Referenzbuild, Chromosom, Koordinate und unterstützten Allelen.", "The analysis covers positions documented in the active catalog. Rules match on assembly, chromosome, position, and supported alleles.")
- #tr("Fehlende und widersprüchliche Positionen bleiben offen. Die Messmethode einzelner Genotypen ist ohne entsprechende Daten im Export unbekannt.", "Missing or conflicting positions remain unresolved. The source of a genotype call is unknown unless the export provides it.")
- #tr("GWAS-Studienbezüge erscheinen für übereinstimmende rsIDs und Koordinaten. Der Abgleich berücksichtigt keine Effektallele. Der Bericht weist fehlende Marker bei den kuratierten Einzelregeln aus.", "GWAS associations require matching rsIDs and positions. The match does not consider effect alleles. The report identifies missing markers for curated rules.")
- #tr("Studienbezüge beschreiben veröffentlichte Zusammenhänge. Medizinisch relevante Consumer-Befunde benötigen klinische Bestätigung.", "Research associations summarize published findings. Clinically relevant consumer findings require clinical confirmation.")
- #tr("Bei ausgeschalteter Genotypanzeige bleiben Aussagen im Report erhalten. Sie können indirekt Hinweise auf Varianten enthalten.", "Hiding explicit genotypes preserves the report's conclusions, which may indirectly identify variants.")

#if not report.options.short {
  heading(level: 2, tr("Erfasste Chromosomen", "Chromosomes in the input"))
  for (chromosome, count) in report.summary.chromosomes {
    caption([#chromosome · #count]); h(9pt)
  }
  parbreak()
  heading(level: 1, tr("Variantenregister", "Variant index"))
  for entry in report.variant_index {
    link(label("finding-" + entry.at(2)), [#entry.at(0) · #entry.at(1)])
    linebreak()
  }
}
