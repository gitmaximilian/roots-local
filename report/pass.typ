// One page of medicine notes for information: what studies report about the drug-response variants in the file.
#let report = json("report.json")
#let lang = report.options.language
#let tr(de, en) = if lang == "de" { de } else { en }
#let theme = rgb("#1b6b59")
#let ink = rgb("#202f2c")
#let secondary = rgb("#526861")
#set document(title: "Roots Local · " + tr("Medikamenten-Notizen", "Medicine notes"))
#set text(font: "Libertinus Serif", lang: lang, size: 10.5pt, fill: ink)
#set page(paper: "a4", margin: (x: 18mm, top: 18mm, bottom: 16mm))
#let confidence(value) = (high: tr("hoch", "high"), moderate: tr("mittel", "moderate"), low: tr("gering", "low")).at(value)
#let first-sentence(text) = text.split(". ").at(0).trim(".") + "."
#let medicines = report.findings.filter(f => f.section.starts-with("15.") and f.conclusion != none)
#let dense = medicines.len() > 6
#let gene(f) = f.checks.at(0).gene

#text(size: 9pt, weight: "bold", fill: theme, tracking: 0.1em)[ROOTS LOCAL]
#v(2mm)
#text(size: 24pt, weight: "bold", fill: theme)[#tr("Medikamenten-Notizen", "Medicine notes")]
#v(1mm)
#text(fill: secondary)[#tr("Studienwissen zu Genvarianten, die beeinflussen können, wie Medikamente wirken.", "What studies report about gene variants that can affect how medicines work.")]
#v(6mm)

#if medicines.len() == 0 [
  #tr("Für diese Datei liegen keine pharmakogenetischen Schlussfolgerungen vor.", "There are no drug-response conclusions for this file.")
] else [
  #block(fill: rgb("#fdf3e3"), inset: 3.5mm, radius: 2mm, width: 100%)[
    #set text(size: 9.5pt)
    #strong(tr("Nur zur Information.", "For information only.")) #tr("Diese Seite ist kein medizinischer Befund und keine Empfehlung zu Medikamenten oder Dosen. Sie fasst zusammen, was Studien über einzelne Genvarianten berichten, die in deiner Rohdatei vorkommen.", "This page is not a medical result and not a recommendation about medicines or doses. It summarizes what studies report about individual gene variants found in your raw data file.")
  ]
  #v(if dense { 4mm } else { 6mm })
  #set text(size: if dense { 9pt } else { 10.5pt })
  #table(columns: (22%, 1fr, 13%), stroke: (x, y) => if y > 0 { (top: 0.5pt + rgb("#dbe4df")) }, inset: (x: 0pt, y: if dense { 3pt } else { 5pt }), column-gutter: 4mm,
    table.header(
      text(size: 8.5pt, fill: secondary)[#tr("Gen", "Gene")],
      text(size: 8.5pt, fill: secondary)[#tr("Ergebnis und Bedeutung", "Result and meaning")],
      text(size: 8.5pt, fill: secondary)[#tr("Sicherheit", "Confidence")],
    ),
    ..medicines.map(f => (
      [#text(weight: "bold", fill: theme, gene(f)) \ #text(size: 8pt, fill: secondary, f.checks.map(c => c.id).join(", "))],
      [#f.conclusion \ #text(size: 8.5pt, fill: secondary, f.summary)],
      text(size: 9pt, confidence(f.confidence)),
    )).flatten())
]
#v(1fr)
#text(size: 8.5pt, fill: secondary)[
  #tr("Diese Notizen stammen aus einem Verbraucher-Rohdatenexport und sind nicht im Labor bestätigt. Andere, nicht getestete Varianten können das Ergebnis ändern. Roots Local ist kein Medizinprodukt. Ändere keine Medikamente und keine Dosis aufgrund dieser Seite. Wenn dich ein Ergebnis beschäftigt, sprich mit einer Ärztin oder einem Arzt; nur eine Laboruntersuchung kann es bestätigen.", "These notes come from a consumer raw data export and are not lab-confirmed. Untested variants can change the result. Roots Local is not a medical device. Do not change any medicine or dose because of this page. If a result concerns you, talk to a physician; only a laboratory test can confirm it.") \
  #tr("Referenzkatalog", "Reference catalog") #report.catalog_version · Roots Local #report.version
]
