// One-page medicine pass: a credit-card-sized card to cut out and a full table.
#let report = json("report.json")
#let lang = report.options.language
#let tr(de, en) = if lang == "de" { de } else { en }
#let theme = rgb("#1b6b59")
#let ink = rgb("#202f2c")
#let secondary = rgb("#526861")
#set document(title: "Roots Local · " + tr("Medikamentenpass", "Medicine pass"))
#set text(font: "Libertinus Serif", lang: lang, size: 10.5pt, fill: ink)
#set page(paper: "a4", margin: (x: 18mm, top: 18mm, bottom: 16mm))
#let confidence(value) = (high: tr("hoch", "high"), moderate: tr("mittel", "moderate"), low: tr("gering", "low")).at(value)
#let first-sentence(text) = text.split(". ").at(0).trim(".") + "."
#let medicines = report.findings.filter(f => f.section.starts-with("15.") and f.conclusion != none)
#let gene(f) = f.checks.at(0).gene

#text(size: 9pt, weight: "bold", fill: theme, tracking: 0.1em)[ROOTS LOCAL]
#v(2mm)
#text(size: 24pt, weight: "bold", fill: theme)[#tr("Medikamentenpass", "Medicine pass")]
#v(1mm)
#text(fill: secondary)[#tr("Pharmakogenetische Hinweise aus deiner Rohdatei. Zeige diese Seite deiner Ärztin, deinem Arzt oder in der Apotheke.", "Drug-response notes from your raw data file. Show this page to your physician or pharmacist.")]
#v(6mm)

#if medicines.len() == 0 [
  #tr("Für diese Datei liegen keine pharmakogenetischen Schlussfolgerungen vor.", "There are no drug-response conclusions for this file.")
] else [
  // ISO/IEC 7810 ID-1 card: 85.60 × 53.98 mm, with a dashed cut line.
  #box(stroke: (dash: "dashed", paint: secondary, thickness: 0.5pt), inset: 2mm, radius: 4mm)[
    #box(width: 85.6mm, height: 53.98mm, radius: 3.2mm, fill: theme, inset: (x: 4mm, y: 3.4mm), clip: true)[
      #set text(fill: white, size: 6.6pt, font: "DejaVu Sans Mono")
      #grid(columns: (1fr, auto), text(font: "Libertinus Serif", size: 10pt, weight: "bold")[#tr("Medikamentenpass", "Medicine pass")], text(size: 6pt)[Roots Local])
      #v(1.6mm)
      #grid(columns: (auto, 1fr), column-gutter: 2.4mm, row-gutter: 1.3mm,
        ..medicines.slice(0, calc.min(medicines.len(), 7)).map(f => {
          let line = first-sentence(f.conclusion)
          if line.starts-with(gene(f) + " ") { line = line.slice(gene(f).len() + 1) }
          (text(weight: "bold", gene(f)), line)
        }).flatten())
      #place(bottom + left, text(size: 5.4pt)[#tr("Unbestätigte Verbraucherdaten · nicht für Dosisentscheidungen ohne Arzt", "Unconfirmed consumer data · not for dosing decisions without a physician")])
    ]
  ]
  #v(7mm)
  #table(columns: (22%, 1fr, 13%), stroke: (x, y) => if y > 0 { (top: 0.5pt + rgb("#dbe4df")) }, inset: (x: 0pt, y: 5pt), column-gutter: 4mm,
    text(size: 8.5pt, fill: secondary)[#tr("Gen", "Gene")],
    text(size: 8.5pt, fill: secondary)[#tr("Ergebnis und Bedeutung", "Result and meaning")],
    text(size: 8.5pt, fill: secondary)[#tr("Sicherheit", "Confidence")],
    ..medicines.map(f => (
      [#text(weight: "bold", fill: theme, gene(f)) \ #text(size: 8pt, fill: secondary, f.checks.map(c => c.id).join(", "))],
      [#f.conclusion \ #text(size: 8.5pt, fill: secondary, f.summary)],
      text(size: 9pt, confidence(f.confidence)),
    )).flatten())
]
#v(1fr)
#text(size: 8.5pt, fill: secondary)[
  #tr("Diese Hinweise stammen aus einem Verbraucher-Rohdatenexport und sind nicht im Labor bestätigt. Andere, nicht getestete Varianten können das Ergebnis ändern. Ändere Medikamente oder Dosen nur nach ärztlicher Rücksprache.", "These notes come from a consumer raw data export and are not lab-confirmed. Untested variants can change the result. Change medicines or doses only after talking to a physician.") \
  #tr("Referenzkatalog", "Reference catalog") #report.catalog_version · Roots Local #report.version
]
