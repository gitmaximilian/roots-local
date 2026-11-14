#let report = json("report.json")
#let theme = rgb("#15443c")
#let ink = rgb("#202f2c")
#let secondary = rgb("#526861")
#let paper = rgb("#ecf4ef")
#set document(title: "Roots Local · DNA-Report")
#set text(font: "Libertinus Serif", lang: "de", size: 11pt, fill: ink)
#set par(leading: 0.67em, justify: false)
#set heading(numbering: none)
#show heading.where(level: 1): set text(size: 22pt, fill: theme)
#show heading.where(level: 2): set text(size: 15pt, fill: theme)
#set page(
  paper: "a4", margin: (left: 20mm, right: 20mm, top: 21mm, bottom: 20mm),
  header: context if counter(page).get().first() > 1 {
    text(size: 9pt, fill: secondary)[Roots Local #h(1fr) DNA-Report]
    line(length: 100%, stroke: 0.5pt + rgb("#dbe4df"))
  },
  footer: context if counter(page).get().first() > 1 {
    text(size: 9pt, fill: secondary)[Referenzkatalog #report.catalog_version #h(1fr) #counter(page).display()]
  }
)
#let status(value) = (personal: "Persönlich auswertbar", research: "Studienbezug", missing: "Nicht beurteilbar").at(value)
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
    #caption([Evidenz · #finding.evidence \
      Studienpopulation · #finding.population \
      #finding.limits])
    #parbreak()
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
#text(size: 41pt, fill: theme, weight: "bold")[Dein DNA-Report]
#v(4mm)
#text(size: 16pt, fill: secondary)[Explore your DNA. Offline.]
#v(16mm)
#if report.options.name != none { text(size: 17pt, report.options.name); v(4mm) }
#if report.example { block(fill: paper, inset: 8pt, radius: 4pt)[Synthetisches Profil] }
#grid(columns: (1fr, 1fr, 1fr), gutter: 7pt,
  box-stat(report.personal, "Auswertbare Merkmale"),
  box-stat(report.research, "Studienbezüge"),
  box-stat(report.summary.rows, "Genotypzeilen")
)
#v(11mm)
#caption([MyHeritage-Format · #report.summary.format · Referenzgenom #(if report.summary.build == none { "unbekannt" } else { report.summary.build }) \
  Roots Local #report.version · Referenzkatalog #report.catalog_version])
#pagebreak()

#outline(title: [Inhalt], depth: 1, indent: auto)
#if not report.options.short [
  #pagebreak(weak: true)
  #outline(title: [Unterkapitel], depth: 2, indent: auto)
]
#pagebreak(weak: true)

= Datenübersicht
#grid(columns: (1fr, 1fr, 1fr), gutter: 7pt,
  box-stat(report.missing, "Offene Merkmalsregeln"),
  box-stat(report.summary.no_call, "Zeilen ohne Genotyp"),
  box-stat(report.summary.conflicts, "Widersprüchliche Positionen")
)

#v(5mm)
Der Bericht wertet die importierten Positionen anhand des dokumentierten Referenzkatalogs aus. Die Quellen sind bei den Befunden verlinkt.

#if report.summary.skipped > 0 [#report.summary.skipped ungültige Rohdatenzeilen wurden übersprungen.]
#if report.summary.duplicates > 0 [#report.summary.duplicates zusätzliche Zeilen lagen an bereits erfassten Positionen.]
#if report.family != none [
  == Familiendatei
  #report.family.compared gemeinsam auswertbare autosomale Positionen.
  #report.family.compatible mit mindestens einem geteilten Allel.
  #report.family.discordant ohne geteiltes Allel.
  Dieser Vergleich ist keine Verwandtschaftsbestimmung.
]
#if report.sequence != none [
  == Sequenzierdaten
  #report.sequence.reads untersuchte Reads. #report.sequence.targets.len() geprüfte Referenzpositionen.
  Die Lesetiefe bezieht sich auf die ausgewählten Positionen. Sie liefert hier keine Genotypen.
  #for target in report.sequence.targets [
    #caption([#target.id · #target.coordinate · #target.depth qualifizierte Basen])
    #linebreak()
  ]
]

#for chapter in report.chapters {
  let chapter-findings = report.findings.filter(f => f.section.split(".").first() == chapter.id)
  let has-import = (chapter.id == "01" and report.external.origins.len() > 0) or (chapter.id == "02" and report.external.matches.len() + report.external.segments.len() > 0)
  if not report.options.short or has-import or chapter-findings.any(f => f.status != "missing") {
    if not report.options.short { pagebreak(weak: true) }
    heading(level: 1, [#chapter.id · #chapter.title])
    if chapter.id == "01" and report.external.origins.len() > 0 {
      heading(level: 2, "Übernommene Herkunftsangaben")
      for origin in report.external.origins {
        [#origin.label#if origin.percent != none [ · #origin.percent %] \
        ]
      }
    }
    if chapter.id == "02" and (report.external.matches.len() + report.external.segments.len() > 0) {
      heading(level: 2, "Importierte Begleitdaten")
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
      if not report.options.short or own.len() > 0 {
        heading(level: 2, [#section.id · #section.title])
        if not report.options.short { caption(section.scope); parbreak() }
        if own.len() == 0 and cross.len() == 0 and not report.options.short {
          if section.id == "03.1" {
            [#report.summary.rows Zeilen aus #report.summary.format · Referenzgenom #(if report.summary.build == none { "unbekannt" } else { report.summary.build }).]
          } else if section.id == "03.4" {
            link(label("method"), [Siehe Methodik und Abdeckung.])
          } else {
            caption([Der aktuelle Katalog enthält hier keine anwendbare Auswertungsregel.])
          }
        }
        for finding in own {
          [#card(finding) #label("finding-" + finding.id)]
        }
        for finding in cross {
          caption(link(label("finding-" + finding.id), [Siehe #finding.title]))
        }
      }
    }
  }
}

#pagebreak(weak: true)
= Methodik & Abdeckung <method>
- Analysiert werden nur die im Referenzkatalog beschriebenen Positionen. Zuordnung anhand von Referenzbuild, Chromosom, Koordinate und unterstützten Allelen.
- Fehlende und widersprüchliche Positionen bleiben offen. Die Messmethode einzelner Genotypen ist ohne entsprechende Daten im Export unbekannt.
- Studienbezüge beschreiben veröffentlichte Zusammenhänge. Medizinisch relevante Consumer-Befunde benötigen klinische Bestätigung.
- Bei ausgeschalteter Genotypanzeige bleiben Aussagen im Report erhalten. Sie können indirekt Hinweise auf Varianten enthalten.

#if not report.options.short {
  heading(level: 2, "Erfasste Chromosomen")
  for (chromosome, count) in report.summary.chromosomes {
    caption([#chromosome · #count]); h(9pt)
  }
  parbreak()
  heading(level: 1, "Variantenregister")
  for entry in report.variant_index {
    link(label("finding-" + entry.at(2)), [#entry.at(0) · #entry.at(1)])
    linebreak()
  }
}
