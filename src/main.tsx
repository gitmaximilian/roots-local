import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  Dna,
  FileText,
  FlaskConical,
  GitBranch,
  Layers,
  List,
  LockKeyhole,
  ScanLine,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
const PdfPreview = lazy(() =>
  import("./pdf-preview").then((module) => ({ default: module.PdfPreview })),
);
import "./style.css";

type Status = "personal" | "research" | "missing";
type Section = { id: string; title: string; scope: string };
type Chapter = { id: string; title: string; part: string; sections: Section[] };
type MarkerCheck = {
  id: string;
  gene: string;
  coordinate: string | null;
  call: string | null;
  status: string;
};
type Finding = {
  id: string;
  section: string;
  title: string;
  summary: string;
  status: Status;
  message: string;
  evidence: string;
  population: string;
  limits: string;
  checks: MarkerCheck[];
  sources: [string, string][];
  cross: string[];
};
type Report = {
  catalog_version: string;
  example: boolean;
  chapters: Chapter[];
  findings: Finding[];
  summary: {
    format: string;
    build: string | null;
    rows: number;
    skipped: number;
    no_call: number;
    conflicts: number;
    duplicates: number;
    strand: string;
    chromosomes: [string, number][];
  };
  external: {
    origins: { label: string; percent: number | null }[];
    matches: { name: string; cm: number; relationship: string | null }[];
    segments: {
      name: string;
      chromosome: string;
      start: number;
      end: number;
      cm: number;
    }[];
  };
  family: { compared: number; compatible: number; discordant: number } | null;
  sequence: {
    reads: number;
    build: string;
    targets: {
      id: string;
      coordinate: string;
      depth: number;
      bases: number[];
    }[];
  } | null;
};
type Variant = {
  id: string;
  chromosome: string;
  position: number;
  alleles: string | null;
};
type Page = "home" | "chapters" | "variants" | "report" | "data";
type Options = {
  short: boolean;
  name: string | null;
  include_calls: boolean;
  include_relatives: boolean;
};

const number = new Intl.NumberFormat("de-AT");
const statuses = {
  personal: "Auswertbar",
  research: "Studienbezug",
  missing: "Offen",
};
const navigation: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: "home", label: "Übersicht", Icon: Layers },
  { id: "chapters", label: "Kapitel", Icon: BookOpen },
  { id: "variants", label: "Varianten", Icon: ScanLine },
  { id: "report", label: "PDF-Report", Icon: FileText },
  { id: "data", label: "Datenquellen", Icon: Database },
];

function StatusLabel({ status }: { status: Status }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {statuses[status]}
    </span>
  );
}
function Heading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="heading">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
function FindingDetail({ finding }: { finding: Finding }) {
  const [copied, setCopied] = useState<string>();
  return (
    <details className="finding" id={`finding-${finding.id}`}>
      <summary>
        <span>{finding.title}</span>
        <StatusLabel status={finding.status} />
        <ChevronDown size={16} />
      </summary>
      <div className="finding-content">
        <p>{finding.summary}</p>
        <p className="interpretation">{finding.message}</p>
        <dl className="definition">
          <dt>Evidenz</dt>
          <dd>{finding.evidence}</dd>
          <dt>Studienpopulation</dt>
          <dd>{finding.population}</dd>
          <dt>Grenzen</dt>
          <dd>{finding.limits}</dd>
        </dl>
        <table>
          <thead>
            <tr>
              <th>Marker</th>
              <th>Position</th>
              <th>Genotyp</th>
              <th>Datenqualität</th>
            </tr>
          </thead>
          <tbody>
            {finding.checks.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="mono">{c.id}</span>
                  <small>{c.gene}</small>
                </td>
                <td>{c.coordinate || "–"}</td>
                <td className="mono">{c.call || "–"}</td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sources">
          {finding.sources.map(([label, url]) => (
            <div key={url}>
              <span>{label}</span>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(url);
                  } catch {
                    setCopied(undefined);
                  }
                }}
              >
                {copied === url ? "Kopiert" : "Link kopieren"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
function VariantRegister({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ total: number; rows: Variant[] }>({
    total: 0,
    rows: [],
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const timer = setTimeout(() => {
      invoke<typeof result>("variants", { query, offset })
        .then((value) => {
          if (mounted) {
            setResult(value);
            setError("");
          }
        })
        .catch(() => {
          if (mounted)
            setError("Das Variantenregister konnte nicht geladen werden.");
        });
    }, 120);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [active, offset, query]);
  return (
    <>
      <Heading
        title="Variantenregister"
        description="Positionen und Genotypen aus der importierten Datei."
      />
      <label className="search">
        <Search size={17} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
          placeholder="Nach rsID oder Chromosom:Position suchen"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Marker</th>
              <th>Chromosom</th>
              <th>Position</th>
              <th>Genotyp</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                <td className="mono">{row.id || "–"}</td>
                <td>{row.chromosome}</td>
                <td>{number.format(row.position)}</td>
                <td className="mono">{row.alleles || "Fehlt"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pagination">
          <span>
            {result.total ? offset + 1 : 0}–
            {Math.min(offset + 50, result.total)} von{" "}
            {number.format(result.total)}
          </span>
          <button
            onClick={() => setOffset(Math.max(offset - 50, 0))}
            disabled={offset === 0}
            aria-label="Vorige Seite"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={() => setOffset(offset + 50)}
            disabled={offset + 50 >= result.total}
            aria-label="Nächste Seite"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

function App() {
  const [page, setPage] = useState<Page>("home");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [model, setModel] = useState<Report>();
  const [activeChapter, setActiveChapter] = useState("01");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [origins, setOrigins] = useState("");
  const [key, setKey] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [options, setOptions] = useState<Options>({
    short: false,
    name: "",
    include_calls: false,
    include_relatives: false,
  });
  const [preview, setPreview] = useState<ArrayBuffer>();
  const [anchor, setAnchor] = useState("");
  useEffect(() => {
    invoke<Chapter[]>("chapters")
      .then(setChapters)
      .catch(() =>
        setError("Die Kapitelübersicht konnte nicht geladen werden."),
      );
  }, []);
  useEffect(() => {
    if (!anchor || page !== "chapters") return;
    const element = document.getElementById(`finding-${anchor}`);
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
      element.scrollIntoView({ block: "center" });
      setAnchor("");
    }
  }, [anchor, page, activeChapter]);
  const totals = useMemo(
    () => ({
      personal:
        model?.findings.filter((f) => f.status === "personal").length ?? 0,
      research:
        model?.findings.filter((f) => f.status === "research").length ?? 0,
      missing:
        model?.findings.filter((f) => f.status === "missing").length ?? 0,
    }),
    [model],
  );
  const groups = [...new Set(chapters.map((c) => c.part))];
  const chapter = chapters.find((c) => c.id === activeChapter);
  const results = model?.findings || [];
  const search = query.trim().toLowerCase();
  const visible = results.filter(
    (f) =>
      (filter === "all" || f.status === filter) &&
      (!search ||
        [
          f.title,
          f.summary,
          f.section,
          ...f.checks.flatMap((c) => [c.gene, c.id]),
        ].some((v) => v.toLowerCase().includes(search))),
  );
  const dataReady = Boolean(model);
  const setReport = (result: Report) => {
    setModel(result);
    setVersion(result.catalog_version);
    setPreview(undefined);
  };
  function navigate(page: Page) {
    setPage(page);
    window.scrollTo(0, 0);
  }
  function selectChapter(id: string) {
    setActiveChapter(id);
    setQuery("");
    setFilter("all");
    navigate("chapters");
  }
  function openFinding(finding: Finding) {
    selectChapter(finding.section.split(".")[0]);
    setAnchor(finding.id);
  }

  async function run<T>(
    label: string,
    action: () => Promise<T>,
    done: (value: T) => void,
  ) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      done(await action());
    } catch (e) {
      setError(
        typeof e === "string"
          ? e
          : "Der Vorgang konnte nicht abgeschlossen werden.",
      );
    } finally {
      setBusy("");
    }
  }
  function importData(example: boolean) {
    void run(
      "DNA-Datei einlesen",
      () => invoke<Report | null>("import_dna", { example }),
      (result) => {
        if (result) {
          setReport(result);
          setOrigins("");
          setOptions({
            short: false,
            name: "",
            include_calls: false,
            include_relatives: false,
          });
          navigate("home");
        }
      },
    );
  }
  function extra(kind: string, label: string) {
    void run(
      label,
      () => invoke<Report | null>("import_extra", { kind }),
      (result) => {
        if (result) {
          setReport(result);
          setNotice("Begleitdaten übernommen.");
        }
      },
    );
  }
  function renderPdf() {
    void run(
      "PDF-Vorschau erstellen",
      () => invoke<ArrayBuffer>("preview_pdf", { options }),
      (bytes) => {
        setPreview(bytes);
      },
    );
  }
  function savePdf() {
    void run(
      "PDF exportieren",
      () => invoke<boolean>("export_pdf", { options }),
      (saved) => {
        if (saved) setNotice("Der PDF-Report wurde gespeichert.");
      },
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("home")}>
          <span>
            <Dna size={24} />
          </span>
          <strong>Roots Local</strong>
        </button>
        <nav aria-label="Hauptnavigation">
          {navigation.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
              disabled={id === "variants" && !dataReady}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <LockKeyhole size={16} />
          <span>Lokal auf diesem Gerät</span>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            {navigation.find((n) => n.id === page)?.label}
            {model?.example && <span className="example">Beispielprofil</span>}
          </span>
          <button
            className="button secondary compact"
            onClick={() => importData(false)}
            disabled={!!busy}
          >
            Datei öffnen <ArrowRight size={15} />
          </button>
        </div>
        <div className="content">
          {(busy || error || notice) && (
            <div
              className={`feedback ${error ? "error" : ""}`}
              role={error ? "alert" : "status"}
            >
              <span>{busy ? `${busy} …` : error || notice}</span>
              {busy ? (
                !busy.includes("PDF") && (
                  <button
                    className="text-button"
                    onClick={() => void invoke("cancel_job")}
                  >
                    Abbrechen
                  </button>
                )
              ) : (
                <button
                  className="text-button"
                  aria-label="Meldung schließen"
                  onClick={() => {
                    setError("");
                    setNotice("");
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {page === "home" &&
            (model ? (
              <>
                <Heading
                  title="Dein DNA-Profil"
                  description={`MyHeritage-Format · ${model.summary.format} · ${model.summary.build || "Referenzgenom unbekannt"}`}
                />
                <div className="stats">
                  <div>
                    <Check size={20} />
                    <strong>{totals.personal}</strong>
                    <span>Auswertbare Merkmale</span>
                  </div>
                  <div>
                    <FlaskConical size={20} />
                    <strong>{totals.research}</strong>
                    <span>Studienbezüge</span>
                  </div>
                  <div>
                    <List size={20} />
                    <strong>{number.format(model.summary.rows)}</strong>
                    <span>Genotypzeilen</span>
                  </div>
                </div>
                <header className="section-heading">
                  <h2>Ergebnisse</h2>
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                      navigate("chapters");
                    }}
                  >
                    Alle Kapitel <ArrowRight size={15} />
                  </button>
                </header>
                <div className="result-grid">
                  {results
                    .filter((f) => f.status !== "missing")
                    .slice(0, 8)
                    .map((f) => (
                      <button
                        key={f.id}
                        className="result-tile"
                        onClick={() => openFinding(f)}
                      >
                        <StatusLabel status={f.status} />
                        <strong>{f.title}</strong>
                        <span>{f.message}</span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                </div>
                {!totals.personal && !totals.research && (
                  <div className="empty">
                    <CircleHelp size={20} />
                    Die Datenbasis für die vorhandenen Merkmalsregeln ist nicht
                    ausreichend.
                  </div>
                )}
                <header className="section-heading">
                  <h2>Datenqualität</h2>
                </header>
                <div className="panel quality">
                  <span>
                    <strong>{number.format(model.summary.no_call)}</strong> ohne
                    Genotyp
                  </span>
                  <span>
                    <strong>{number.format(model.summary.conflicts)}</strong>{" "}
                    widersprüchlich
                  </span>
                  <span>
                    <strong>{number.format(model.summary.skipped)}</strong>{" "}
                    übersprungen
                  </span>
                </div>
              </>
            ) : (
              <section className="welcome">
                <div className="welcome-copy">
                  <div className="logo-glyph">
                    <Dna size={30} />
                  </div>
                  <Heading
                    title="Deine DNA. Dein Gerät."
                    description="Öffne deinen MyHeritage-Rohdatenexport und erkunde Herkunft, Merkmale und Forschungsbefunde."
                  />
                  <div className="actions">
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={() => importData(false)}
                    >
                      DNA-Datei öffnen <ArrowRight size={16} />
                    </button>
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => importData(true)}
                    >
                      Beispiel ansehen
                    </button>
                  </div>
                  <p className="formats">CSV, TSV, TXT oder ZIP</p>
                </div>
                <div className="helix" aria-hidden="true">
                  <Dna size={210} strokeWidth={0.72} />
                </div>
              </section>
            ))}
          {page === "chapters" && (
            <>
              <Heading
                title="Kapitel"
                description="17 Hauptkapitel für deinen DNA-Vollreport."
              />
              <div className="browse">
                <nav className="chapter-list" aria-label="Reportkapitel">
                  {groups.map((group) => (
                    <div key={group}>
                      <h3>{group}</h3>
                      {chapters
                        .filter((c) => c.part === group)
                        .map((c) => (
                          <button
                            key={c.id}
                            className={
                              c.id === activeChapter && !search
                                ? "selected"
                                : ""
                            }
                            onClick={() => selectChapter(c.id)}
                          >
                            <span className="mono">{c.id}</span>
                            {c.title}
                          </button>
                        ))}
                    </div>
                  ))}
                </nav>
                <section className="chapter-detail">
                  {model && (
                    <div className="filters">
                      <label className="search">
                        <Search size={16} />
                        <input
                          placeholder="Merkmal, Gen oder rsID"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Auswertungsstatus"
                        value={filter}
                        onChange={(e) =>
                          setFilter(e.target.value as typeof filter)
                        }
                      >
                        <option value="all">Alle Status</option>
                        <option value="personal">Auswertbar</option>
                        <option value="research">Studienbezug</option>
                        <option value="missing">Offen</option>
                      </select>
                    </div>
                  )}
                  {search ? (
                    <>
                      <h2>Suchergebnisse</h2>
                      {visible.length ? (
                        visible.map((f) => (
                          <FindingDetail key={f.id} finding={f} />
                        ))
                      ) : (
                        <p>Keine passenden Merkmale gefunden.</p>
                      )}
                    </>
                  ) : (
                    chapter && (
                      <>
                        <h2>{chapter.title}</h2>
                        {chapter.sections.map((section) => {
                          const findings = visible.filter(
                            (item) => item.section === section.id,
                          );
                          const cross = visible.filter((item) =>
                            item.cross.includes(section.id),
                          );
                          return (
                            <section className="subchapter" key={section.id}>
                              <h3>
                                <span className="mono">{section.id}</span>{" "}
                                {section.title}
                              </h3>
                              <p>{section.scope}</p>
                              {findings.map((f) => (
                                <FindingDetail key={f.id} finding={f} />
                              ))}
                              {cross.map((f) => (
                                <button
                                  className="text-button"
                                  key={f.id}
                                  onClick={() => openFinding(f)}
                                >
                                  Siehe {f.title} <ArrowRight size={14} />
                                </button>
                              ))}
                              {model && !findings.length && !cross.length && (
                                <small>
                                  Für diesen Abschnitt liegt aktuell keine
                                  passende Merkmalsregel vor.
                                </small>
                              )}
                            </section>
                          );
                        })}
                      </>
                    )
                  )}
                </section>
              </div>
            </>
          )}
          {page === "variants" && <VariantRegister active={dataReady} />}
          {page === "report" && (
            <>
              <Heading
                title="PDF-Report"
                description="Gestalteter Export mit Inhaltsverzeichnis, Quellen und Abdeckung."
              />
              {model ? (
                <div className="report-layout">
                  <div className="panel report-settings">
                    <h2>Umfang</h2>
                    <label className="choice">
                      <input
                        type="radio"
                        name="scope"
                        checked={!options.short}
                        onChange={() => {
                          setOptions({ ...options, short: false });
                          setPreview(undefined);
                        }}
                      />
                      <span>
                        <strong>Vollreport</strong>
                        <small>17 Hauptkapitel und Variantenanhang</small>
                      </span>
                    </label>
                    <label className="choice">
                      <input
                        type="radio"
                        name="scope"
                        checked={options.short}
                        onChange={() => {
                          setOptions({ ...options, short: true });
                          setPreview(undefined);
                        }}
                      />
                      <span>
                        <strong>Kurzreport</strong>
                        <small>Auswertbare Merkmale und Studienbezüge</small>
                      </span>
                    </label>
                    <h2>Persönliche Angaben</h2>
                    <label className="field">
                      Name im Report{" "}
                      <input
                        value={options.name || ""}
                        placeholder="Optional"
                        maxLength={120}
                        onChange={(e) => {
                          setOptions({ ...options, name: e.target.value });
                          setPreview(undefined);
                        }}
                      />
                    </label>
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={options.include_calls}
                        onChange={(e) => {
                          setOptions({
                            ...options,
                            include_calls: e.target.checked,
                          });
                          setPreview(undefined);
                        }}
                      />
                      Konkrete Genotypen anzeigen
                    </label>
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={options.include_relatives}
                        onChange={(e) => {
                          setOptions({
                            ...options,
                            include_relatives: e.target.checked,
                          });
                          setPreview(undefined);
                        }}
                      />
                      Namen von DNA-Matches anzeigen
                    </label>
                    <div className="actions">
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={savePdf}
                      >
                        PDF exportieren <ArrowDownToLine size={16} />
                      </button>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={renderPdf}
                      >
                        Vorschau
                      </button>
                    </div>
                  </div>
                  <div className="preview">
                    {preview ? (
                      <Suspense
                        fallback={<p role="status">PDF wird geöffnet …</p>}
                      >
                        <PdfPreview bytes={preview} />
                      </Suspense>
                    ) : (
                      <div className="mock-report">
                        <span>ROOTS LOCAL</span>
                        <strong>
                          Dein
                          <br />
                          DNA-Report
                        </strong>
                        <i />
                        <p>Explore your DNA. Offline.</p>
                        <small>
                          {options.short
                            ? "Kurzreport"
                            : "Vollreport · 17 Kapitel"}
                        </small>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty">
                  <FileText size={22} />
                  Öffne eine DNA-Datei, um einen Report zu erstellen.
                </div>
              )}
            </>
          )}
          {page === "data" && (
            <>
              <Heading
                title="Datenquellen"
                description="Lokale Begleitdateien und Referenzkataloge für deine Auswertung."
              />
              <div className="data-grid">
                <section className="panel data-card">
                  <Dna size={22} />
                  <h2>Genotypdatei</h2>
                  <p>
                    {model
                      ? `${model.summary.format} · ${model.summary.build || "Build unbekannt"} · ${model.summary.strand}`
                      : "Keine Datei geöffnet."}
                  </p>
                  <div className="actions">
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => importData(false)}
                    >
                      Öffnen
                    </button>
                    {model && (
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() =>
                          void run(
                            "Sitzung schließen",
                            () => invoke("reset"),
                            () => {
                              setModel(undefined);
                              setOrigins("");
                              setPreview(undefined);
                              navigate("home");
                            },
                          )
                        }
                      >
                        Sitzung schließen
                      </button>
                    )}
                  </div>
                </section>
                <section className="panel data-card">
                  <Database size={22} />
                  <h2>Referenzkatalog</h2>
                  <p>
                    Aktiver Katalog {version}. Signierte Pakete können lokal
                    geladen werden.
                  </p>
                  <label className="field">
                    Öffentlicher Ed25519-Schlüssel
                    <input
                      value={key}
                      maxLength={64}
                      placeholder="64 Hex-Zeichen"
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  <button
                    className="button secondary"
                    disabled={!!busy || !/^[0-9a-f]{64}$/i.test(key)}
                    onClick={() =>
                      void run(
                        "Katalog überprüfen",
                        () =>
                          invoke<{
                            version: string;
                            model: Report | null;
                          } | null>("load_catalog", { trustedKey: key }),
                        (value) => {
                          if (value) {
                            setVersion(value.version);
                            if (value.model) setReport(value.model);
                            setNotice("Der Katalog wurde übernommen.");
                          }
                        },
                      )
                    }
                  >
                    Paket öffnen
                  </button>
                </section>
                {model && (
                  <>
                    <section className="panel data-card">
                      <GitBranch size={22} />
                      <h2>Herkunft & Familie</h2>
                      <label className="field">
                        Vorhandene Herkunftsergebnisse
                        <textarea
                          value={origins}
                          onChange={(e) => setOrigins(e.target.value)}
                          placeholder={"Region; 42.5\nGenetische Gruppe"}
                          rows={3}
                          maxLength={18000}
                        />
                      </label>
                      <div className="actions">
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            void run(
                              "Herkunft übernehmen",
                              () =>
                                invoke<Report>("save_origins", {
                                  entries: origins,
                                }),
                              (result) => {
                                setReport(result);
                                setNotice("Herkunftsangaben übernommen.");
                              },
                            )
                          }
                        >
                          Herkunft speichern
                        </button>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            extra("relatives", "Begleitdatei einlesen")
                          }
                        >
                          Matches oder Segmente
                        </button>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            extra("family", "Familiendatei vergleichen")
                          }
                        >
                          Familiendatei
                        </button>
                      </div>
                      <small>
                        {model.external.origins.length} Herkunftsangaben ·{" "}
                        {model.external.matches.length} Matches ·{" "}
                        {model.external.segments.length} Segmente
                      </small>
                      {model.family && (
                        <p>
                          {number.format(model.family.compared)} gemeinsam
                          ausgewertete Positionen ·{" "}
                          {number.format(model.family.discordant)} ohne
                          gemeinsames Allel
                        </p>
                      )}
                    </section>
                    <section className="panel data-card">
                      <ScanLine size={22} />
                      <h2>Sequenzierdaten</h2>
                      <p>
                        CRAM und passende lokale FASTA mit Index. Die App
                        ermittelt die Abdeckung der Katalogmarker.
                      </p>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() =>
                          extra("cram", "CRAM-Abdeckung berechnen")
                        }
                      >
                        CRAM öffnen
                      </button>
                      {model.sequence && (
                        <p>
                          {number.format(model.sequence.reads)} Reads ·{" "}
                          {model.sequence.targets.length} Positionen ·{" "}
                          {model.sequence.build}
                        </p>
                      )}
                    </section>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
