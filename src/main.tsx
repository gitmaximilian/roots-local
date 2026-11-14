import {
  t,
  getLanguage,
  setLanguage,
  resultText,
  type Language,
} from "./locale";
import englishChapters from "../catalog/report-structure.en.json";
import germanChapters from "../catalog/report-structure.de.json";
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
  study?: {
    reported_trait: string;
    accession: string;
    p_value: string;
    effect: string;
    effect_context: string;
  };
};
type Report = {
  scores: {
    id: string;
    title: string;
    population: string;
    source: string;
    matched: number;
    total: number;
    raw: number | null;
  }[];
  catalog_version: string;
  gwas_total: number;
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

const number = {
  format(value: number) {
    return new Intl.NumberFormat(
      getLanguage() === "de" ? "de-AT" : "en-US",
    ).format(value);
  },
};
const statusLabels = () => ({
  personal: t("Auswertbar"),
  research: t("Studienbezug"),
  missing: t("Offen"),
});
const navigation = (): { id: Page; label: string; Icon: LucideIcon }[] => [
  { id: "home", label: t("Übersicht"), Icon: Layers },
  { id: "chapters", label: t("Kapitel"), Icon: BookOpen },
  { id: "variants", label: t("Varianten"), Icon: ScanLine },
  { id: "report", label: t("PDF-Report"), Icon: FileText },
  { id: "data", label: t("Datenquellen"), Icon: Database },
];

function StatusLabel({ status }: { status: Status }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {statusLabels()[status]}
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
        <span>{resultText(finding.title)}</span>
        <StatusLabel status={finding.status} />
        <ChevronDown size={16} />
      </summary>
      <div className="finding-content">
        <p>{resultText(finding.summary)}</p>
        <p className="interpretation">{resultText(finding.message)}</p>
        <dl className="definition">
          <dt>{t("Evidenz")}</dt>
          <dd>{resultText(finding.evidence)}</dd>
          <dt>{t("Studienpopulation")}</dt>
          <dd>{resultText(finding.population)}</dd>
          {finding.study && (
            <>
              <dt>{t("Merkmal in der Studie")}</dt>
              <dd>{finding.study.reported_trait}</dd>
              <dt>{t("Signifikanz in der Studie")}</dt>
              <dd>p = {finding.study.p_value}</dd>
              {finding.study.effect && (
                <>
                  <dt>{t("Berichteter Effekt (OR oder Beta)")}</dt>
                  <dd>
                    {finding.study.effect} {finding.study.effect_context}
                  </dd>
                </>
              )}
            </>
          )}
          <dt>{t("Grenzen")}</dt>
          <dd>{resultText(finding.limits)}</dd>
        </dl>
        <table>
          <thead>
            <tr>
              <th>Marker</th>
              <th>Position</th>
              <th>{t("Genotyp")}</th>
              <th>{t("Datenqualität")}</th>
            </tr>
          </thead>
          <tbody>
            {finding.checks.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="mono">{c.id}</span>
                  <small>{resultText(c.gene)}</small>
                </td>
                <td>{c.coordinate || "–"}</td>
                <td className="mono">{c.call || "–"}</td>
                <td>{resultText(c.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sources">
          {finding.sources.map(([label, url]) => (
            <div key={url}>
              <span>{resultText(label)}</span>
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
                {copied === url ? t("Kopiert") : t("Link kopieren")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
function FindingList({
  findings,
  anchor,
}: {
  findings: Finding[];
  anchor: string;
}) {
  const [limit, setLimit] = useState(30);
  const anchorIndex = findings.findIndex((finding) => finding.id === anchor);
  const shown = Math.max(limit, anchorIndex + 1);
  useEffect(() => {
    if (anchorIndex >= limit) setLimit(anchorIndex + 1);
  }, [anchorIndex, limit]);
  return (
    <>
      {findings.slice(0, shown).map((finding) => (
        <FindingDetail key={finding.id} finding={finding} />
      ))}
      {shown < findings.length && (
        <button
          className="text-button more-findings"
          onClick={() => setLimit(shown + 30)}
        >
          {t("Weitere Einträge anzeigen (")}
          {number.format(findings.length - shown)})
        </button>
      )}
    </>
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
            setError(t("Das Variantenregister konnte nicht geladen werden."));
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
        title={t("Variantenregister")}
        description={t("Positionen und Genotypen aus der importierten Datei.")}
      />
      <label className="search">
        <Search size={17} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
          placeholder={t("Nach rsID oder Chromosom:Position suchen")}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Marker</th>
              <th>{t("Chromosom")}</th>
              <th>Position</th>
              <th>{t("Genotyp")}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                <td className="mono">{row.id || "–"}</td>
                <td>{row.chromosome}</td>
                <td>{number.format(row.position)}</td>
                <td className="mono">{row.alleles || t("Fehlt")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pagination">
          <span>
            {result.total ? offset + 1 : 0}–
            {Math.min(offset + 50, result.total)}
            {t("von")} {number.format(result.total)}
          </span>
          <button
            onClick={() => setOffset(Math.max(offset - 50, 0))}
            disabled={offset === 0}
            aria-label={t("Vorige Seite")}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={() => setOffset(offset + 50)}
            disabled={offset + 50 >= result.total}
            aria-label={t("Nächste Seite")}
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
  const [language, setUiLanguage] = useState<Language>(getLanguage);
  const chapters: Chapter[] =
    language === "de" ? germanChapters : englishChapters;
  const [model, setModel] = useState<Report>();
  function switchLanguage(value: Language) {
    setLanguage(value);
    setUiLanguage(value);
    setPreview(undefined);
    setError("");
    setNotice("");
  }
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
          resultText(f.title),
          resultText(f.summary),
          f.section,
          f.study?.reported_trait ?? "",
          f.study?.accession ?? "",
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
          ? resultText(e)
          : t("Der Vorgang konnte nicht abgeschlossen werden."),
      );
    } finally {
      setBusy("");
    }
  }
  function importData(example: boolean) {
    void run(
      t("DNA-Datei einlesen"),
      () => invoke<Report | null>("import_dna", { example, language }),
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
      () => invoke<Report | null>("import_extra", { kind, language }),
      (result) => {
        if (result) {
          setReport(result);
          setNotice(t("Begleitdaten übernommen."));
        }
      },
    );
  }
  function renderPdf() {
    void run(
      t("PDF-Vorschau erstellen"),
      () =>
        invoke<ArrayBuffer>("preview_pdf", {
          options: { ...options, language },
        }),
      (bytes) => {
        setPreview(bytes);
      },
    );
  }
  function savePdf() {
    void run(
      t("PDF exportieren"),
      () =>
        invoke<boolean>("export_pdf", { options: { ...options, language } }),
      (saved) => {
        if (saved) setNotice(t("Der PDF-Report wurde gespeichert."));
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
        <nav aria-label={t("Hauptnavigation")}>
          {navigation().map(({ id, label, Icon }) => (
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
          <span>{t("Lokal auf diesem Gerät")}</span>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            {navigation().find((n) => n.id === page)?.label}
            {model?.example && (
              <span className="example">{t("Beispielprofil")}</span>
            )}
          </span>
          <div className="toolbar-actions">
            <label className="language-control">
              <span>{language === "de" ? "Sprache" : "Language"}</span>
              <select
                aria-label={language === "de" ? "Sprache" : "Language"}
                value={language}
                disabled={!!busy}
                onChange={(event) =>
                  switchLanguage(event.target.value as Language)
                }
              >
                <option value="en" lang="en">
                  English
                </option>
                <option value="de" lang="de">
                  Deutsch
                </option>
              </select>
            </label>
            <button
              className="button secondary compact"
              onClick={() => importData(false)}
              disabled={!!busy}
            >
              {t("Datei öffnen")}
              <ArrowRight size={15} />
            </button>
          </div>
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
                    {t("Abbrechen")}
                  </button>
                )
              ) : (
                <button
                  className="text-button"
                  aria-label={t("Meldung schließen")}
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
                  title={t("Dein DNA-Profil")}
                  description={`${t("MyHeritage-Format")} · ${model.summary.format} · ${model.summary.build || t("Referenzgenom unbekannt")}`}
                />
                <div className="stats">
                  <div>
                    <Check size={20} />
                    <strong>{totals.personal}</strong>
                    <span>{t("Auswertbare Merkmale")}</span>
                  </div>
                  <div>
                    <FlaskConical size={20} />
                    <strong>{totals.research}</strong>
                    <span>{t("Studienbezüge")}</span>
                  </div>
                  <div>
                    <List size={20} />
                    <strong>{number.format(model.summary.rows)}</strong>
                    <span>{t("Genotypzeilen")}</span>
                  </div>
                </div>
                <header className="section-heading">
                  <h2>{t("Ergebnisse")}</h2>
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                      navigate("chapters");
                    }}
                  >
                    {t("Alle Kapitel")}
                    <ArrowRight size={15} />
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
                        <strong>{resultText(f.title)}</strong>
                        <span>{resultText(f.message)}</span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                </div>
                {!totals.personal && !totals.research && (
                  <div className="empty">
                    <CircleHelp size={20} />
                    {t(
                      "Die Datenbasis für die vorhandenen Merkmalsregeln ist nicht ausreichend.",
                    )}
                  </div>
                )}
                <header className="section-heading">
                  <h2>{t("Datenqualität")}</h2>
                </header>
                <div className="panel quality">
                  <span>
                    <strong>{number.format(model.summary.no_call)}</strong>
                    {t("ohne Genotyp")}
                  </span>
                  <span>
                    <strong>{number.format(model.summary.conflicts)}</strong>{" "}
                    {t("widersprüchlich")}
                  </span>
                  <span>
                    <strong>{number.format(model.summary.skipped)}</strong>{" "}
                    {t("übersprungen")}
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
                    title={t("Deine DNA. Dein Gerät.")}
                    description={t(
                      "Öffne deinen MyHeritage-Rohdatenexport und erkunde Herkunft, Merkmale und Forschungsbefunde.",
                    )}
                  />
                  <div className="actions">
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={() => importData(false)}
                    >
                      {t("DNA-Datei öffnen")}
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => importData(true)}
                    >
                      {t("Beispiel ansehen")}
                    </button>
                  </div>
                  <p className="formats">{t("CSV, TSV, TXT oder ZIP")}</p>
                </div>
                <div className="helix" aria-hidden="true">
                  <Dna size={210} strokeWidth={0.72} />
                </div>
              </section>
            ))}
          {page === "chapters" && (
            <>
              <Heading
                title={t("Kapitel")}
                description={t("17 Hauptkapitel für deinen DNA-Vollreport.")}
              />
              <div className="browse">
                <nav className="chapter-list" aria-label={t("Reportkapitel")}>
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
                          placeholder={t("Merkmal, Gen oder rsID")}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label={t("Auswertungsstatus")}
                        value={filter}
                        onChange={(e) =>
                          setFilter(e.target.value as typeof filter)
                        }
                      >
                        <option value="all">{t("Alle Status")}</option>
                        <option value="personal">{t("Auswertbar")}</option>
                        <option value="research">{t("Studienbezug")}</option>
                        <option value="missing">{t("Offen")}</option>
                      </select>
                    </div>
                  )}
                  {search ? (
                    <>
                      <h2>{t("Suchergebnisse")}</h2>
                      {visible.length ? (
                        <FindingList
                          key={search + filter}
                          findings={visible}
                          anchor={anchor}
                        />
                      ) : (
                        <p>{t("Keine passenden Merkmale gefunden.")}</p>
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
                              {section.id === "14.4" &&
                                model?.scores.map((score) => (
                                  <div className="score" key={score.id}>
                                    <strong>{resultText(score.title)}</strong>
                                    <p>
                                      {score.matched} / {score.total}{" "}
                                      {t("Modellpositionen ·")}{" "}
                                      {score.raw === null
                                        ? t("Kein Rohscore")
                                        : `${t("Rohscore")} ${number.format(score.raw)}`}
                                    </p>
                                    <p>
                                      {t("Vergleichspopulation der Studie:")}{" "}
                                      {resultText(score.population)}
                                      {t(
                                        ". Forschungswert ohne persönliches Risiko.",
                                      )}
                                    </p>
                                    <small>
                                      {score.id} · {score.source}
                                    </small>
                                  </div>
                                ))}
                              <FindingList
                                findings={findings}
                                anchor={anchor}
                              />
                              {cross.map((f) => (
                                <button
                                  className="text-button"
                                  key={f.id}
                                  onClick={() => openFinding(f)}
                                >
                                  {t("Siehe")}
                                  {resultText(f.title)} <ArrowRight size={14} />
                                </button>
                              ))}
                              {model && !findings.length && !cross.length && (
                                <small>
                                  {t(
                                    "Für diesen Abschnitt liegt aktuell keine passende Merkmalsregel vor.",
                                  )}
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
                title={t("PDF-Report")}
                description={t(
                  "Gestalteter Export mit Inhaltsverzeichnis, Quellen und Abdeckung.",
                )}
              />
              {model ? (
                <div className="report-layout">
                  <div className="panel report-settings">
                    <h2>{t("Umfang")}</h2>
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
                        <strong>{t("Vollreport")}</strong>
                        <small>
                          {t("17 Hauptkapitel und Variantenanhang")}
                        </small>
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
                        <strong>{t("Kurzreport")}</strong>
                        <small>
                          {t("Auswertbare Merkmale und Studienbezüge")}
                        </small>
                      </span>
                    </label>
                    <h2>{t("Persönliche Angaben")}</h2>
                    <label className="field">
                      {t("Name im Report")}{" "}
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
                      {t("Konkrete Genotypen anzeigen")}
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
                      {t("Namen von DNA-Matches anzeigen")}
                    </label>
                    <div className="actions">
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={savePdf}
                      >
                        {t("PDF exportieren")}
                        <ArrowDownToLine size={16} />
                      </button>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={renderPdf}
                      >
                        {t("Vorschau")}
                      </button>
                    </div>
                  </div>
                  <div className="preview">
                    {preview ? (
                      <Suspense
                        fallback={
                          <p role="status">{t("PDF wird geöffnet …")}</p>
                        }
                      >
                        <PdfPreview bytes={preview} />
                      </Suspense>
                    ) : (
                      <div className="mock-report">
                        <span>ROOTS LOCAL</span>
                        <strong>
                          {t("Dein")}
                          <br />
                          {t("DNA-Report")}
                        </strong>
                        <i />
                        <p>{t("Entdecke deine DNA. Offline.")}</p>
                        <small>
                          {options.short
                            ? t("Kurzreport")
                            : t("Vollreport · 17 Kapitel")}
                        </small>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty">
                  <FileText size={22} />
                  {t("Öffne eine DNA-Datei, um einen Report zu erstellen.")}
                </div>
              )}
            </>
          )}
          {page === "data" && (
            <>
              <Heading
                title={t("Datenquellen")}
                description={t(
                  "Lokale Begleitdateien und Referenzkataloge für deine Auswertung.",
                )}
              />
              <div className="data-grid">
                <section className="panel data-card">
                  <Dna size={22} />
                  <h2>{t("Genotypdatei")}</h2>
                  <p>
                    {model
                      ? `${model.summary.format} · ${model.summary.build || t("Build unbekannt")} · ${resultText(model.summary.strand)}`
                      : t("Keine Datei geöffnet.")}
                  </p>
                  <div className="actions">
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => importData(false)}
                    >
                      {t("Öffnen")}
                    </button>
                    {model && (
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() =>
                          void run(
                            t("Sitzung schließen"),
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
                        {t("Sitzung schließen")}
                      </button>
                    )}
                  </div>
                </section>
                <section className="panel data-card">
                  <Database size={22} />
                  <h2>{t("Referenzkatalog")}</h2>
                  <p>
                    {t("Aktiver Katalog")}
                    {version}
                    {t(". Signierte Pakete können lokal geladen werden.")}
                  </p>
                  <label className="field">
                    {t("Öffentlicher Ed25519-Schlüssel")}
                    <input
                      value={key}
                      maxLength={64}
                      placeholder={t("64 Hex-Zeichen")}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  <button
                    className="button secondary"
                    disabled={!!busy || !/^[0-9a-f]{64}$/i.test(key)}
                    onClick={() =>
                      void run(
                        t("Katalog überprüfen"),
                        () =>
                          invoke<{
                            version: string;
                            model: Report | null;
                          } | null>("load_catalog", {
                            trustedKey: key,
                            language,
                          }),
                        (value) => {
                          if (value) {
                            setVersion(value.version);
                            if (value.model) setReport(value.model);
                            setNotice(t("Der Katalog wurde übernommen."));
                          }
                        },
                      )
                    }
                  >
                    {t("Paket öffnen")}
                  </button>
                  {model && model.gwas_total > 0 && (
                    <p>
                      {number.format(
                        model.findings.filter((finding) => finding.study)
                          .length,
                      )}{" "}
                      {t("passende Studienassoziationen von")}{" "}
                      {number.format(model.gwas_total)}
                      {t("GWAS-Katalogeinträgen.")}
                    </p>
                  )}
                </section>
                {model && (
                  <>
                    <section className="panel data-card">
                      <GitBranch size={22} />
                      <h2>{t("Herkunft & Familie")}</h2>
                      <label className="field">
                        {t("Vorhandene Herkunftsergebnisse")}
                        <textarea
                          value={origins}
                          onChange={(e) => setOrigins(e.target.value)}
                          placeholder={t("Region; 42.5\nGenetische Gruppe")}
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
                              t("Herkunft übernehmen"),
                              () =>
                                invoke<Report>("save_origins", {
                                  entries: origins,
                                }),
                              (result) => {
                                setReport(result);
                                setNotice(t("Herkunftsangaben übernommen."));
                              },
                            )
                          }
                        >
                          {t("Herkunft speichern")}
                        </button>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            extra("relatives", t("Begleitdatei einlesen"))
                          }
                        >
                          {t("Matches oder Segmente")}
                        </button>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            extra("family", t("Familiendatei vergleichen"))
                          }
                        >
                          {t("Familiendatei")}
                        </button>
                      </div>
                      <small>
                        {model.external.origins.length}
                        {t("Herkunftsangaben ·")}{" "}
                        {model.external.matches.length} Matches ·{" "}
                        {model.external.segments.length}
                        {t("Segmente")}
                      </small>
                      {model.family && (
                        <p>
                          {number.format(model.family.compared)}
                          {t("gemeinsam ausgewertete Positionen ·")}{" "}
                          {number.format(model.family.discordant)}
                          {t("ohne gemeinsames Allel")}
                        </p>
                      )}
                    </section>
                    <section className="panel data-card">
                      <ScanLine size={22} />
                      <h2>{t("Sequenzierdaten")}</h2>
                      <p>
                        {t(
                          "CRAM und passende lokale FASTA mit Index. Die App ermittelt die Abdeckung der Katalogmarker.",
                        )}
                      </p>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() =>
                          extra("cram", t("CRAM-Abdeckung berechnen"))
                        }
                      >
                        {t("CRAM öffnen")}
                      </button>
                      {model.sequence && (
                        <p>
                          {number.format(model.sequence.reads)} Reads ·{" "}
                          {model.sequence.targets.length}
                          {t("Positionen ·")} {model.sequence.build}
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

document.documentElement.lang = getLanguage();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
