import {
  t,
  getLanguage,
  setLanguage,
  resultText,
  type Language,
} from "./locale";
import starterCatalog from "../catalog/starter.json";
import englishChapters from "../catalog/report-structure.en.json";
import germanChapters from "../catalog/report-structure.de.json";
import React, {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  call,
  cancel,
  canCancel,
  download,
  onProgress,
  pickFiles,
  isApple,
  registerOffline,
} from "./platform";
import { LEGAL_URL, Privacy } from "./privacy";
import { PdfPreview, preparePdfPreview } from "./pdf-preview";
import { usePanelFocus } from "./panel-focus";
import type { ExtraKind } from "./protocol";
import { Logo, Mark } from "./brand";
import { CommandPalette, type Command } from "./command-palette";
import {
  ConfidenceMeter,
  Inspector,
  StatusLabel,
  isMedical,
  visibleConclusion,
} from "./finding-ui";
import { Atlas } from "./atlas";
import {
  AskDna,
  LifeAreas,
  NucleusRadar,
  areaOf,
  areas,
  type AreaId,
} from "./life";
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
  Map as MapIcon,
  Pill,
  ScanLine,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
// WebKit needs the renderer initialized while online to display a preview
// after a connection loss. The document itself is generated only on demand.
void preparePdfPreview().then(() => {
  document.documentElement.dataset.preview = "ready";
}).catch(() => undefined);
import "./style.css";

import type {
  Confidence,
  Status,
  Section,
  Chapter,
  MarkerCheck,
  Finding,
  Report,
  Variant,
  VariantQuality,
  VariantPage,
  Page,
  Options,
} from "./types";

const number = {
  format(value: number) {
    return new Intl.NumberFormat(
      getLanguage() === "de" ? "de-AT" : "en-US",
    ).format(value);
  },
};
const MedicalContext = createContext(false);
const defaultOptions: Options = {
  short: false,
  name: "",
  include_calls: false,
  include_relatives: false,
  include_clinical: false,
  include_lineage: false,
};
const navigation = (): { id: Page; label: string; Icon: LucideIcon }[] => [
  { id: "home", label: t("Übersicht"), Icon: Layers },
  { id: "chapters", label: t("Kapitel"), Icon: BookOpen },
  { id: "atlas", label: t("Atlas"), Icon: MapIcon },
  { id: "variants", label: t("Varianten"), Icon: ScanLine },
  { id: "report", label: t("PDF-Report"), Icon: FileText },
  { id: "pass", label: t("Medikamentenpass"), Icon: Pill },
  { id: "data", label: t("Datenquellen"), Icon: Database },
];

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
type OpenVariant = (finding: Finding, marker: MarkerCheck) => void;
type FindingLocation = Pick<Finding, "id" | "section">;

function FindingDetail({
  finding,
  openVariant,
}: {
  finding: Finding;
  openVariant: OpenVariant;
}) {
  const [copied, setCopied] = useState<string>();
  const showMedical = useContext(MedicalContext);
  const conclusion = visibleConclusion(finding, showMedical);
  const hidden = isMedical(finding) && !showMedical;
  return (
    <details className="finding" id={`finding-${finding.id}`}>
      <summary>
        <span>
          {resultText(finding.title)}
          {conclusion && <span className="answer">{conclusion}</span>}
          {hidden && (
            <span className="answer">
              {t("Medizinischer Befund ausgeblendet")}
            </span>
          )}
        </span>
        {isMedical(finding) && (
          <span className="medical">{t("Medizinisch")}</span>
        )}
        <StatusLabel status={hidden ? "research" : finding.status} />
        <ChevronDown size={16} />
      </summary>
      <div className="finding-content">
        {finding.confidence && !hidden && (
          <ConfidenceMeter value={finding.confidence} />
        )}
        <p>{resultText(finding.summary)}</p>
        {!hidden && (
          <p className="interpretation">{resultText(finding.message)}</p>
        )}
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
                  <button
                    className="text-button marker-link mono"
                    aria-label={`${t("Rohdaten durchsuchen")}: ${c.id}`}
                    onClick={() => openVariant(finding, c)}
                  >
                    {c.id} <ArrowRight size={13} />
                  </button>
                  <small>{resultText(c.gene)}</small>
                </td>
                <td>{c.coordinate || "–"}</td>
                <td className="mono">{hidden ? "•••" : c.call || "–"}</td>
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
  openVariant,
}: {
  findings: Finding[];
  anchor: string;
  openVariant: OpenVariant;
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
        <FindingDetail
          key={finding.id}
          finding={finding}
          openVariant={openVariant}
        />
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

function variantQualityLabel(quality: VariantQuality) {
  return {
    present: t("Genotyp vorhanden"),
    no_call: t("Kein Genotyp"),
    conflict: t("Widersprüchliche Werte"),
  }[quality];
}

function VariantRegister({
  initialQuery,
  chromosomes,
  onBack,
}: {
  initialQuery: string;
  chromosomes: Report["summary"]["chromosomes"];
  onBack?: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [chromosome, setChromosome] = useState("");
  const [quality, setQuality] = useState<VariantQuality | "">("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<VariantPage>();
  const [error, setError] = useState<unknown>();
  function resetPage() {
    setResult(undefined);
    setOffset(0);
  }
  useEffect(() => {
    let mounted = true;
    setError(undefined);
    const timer = setTimeout(() => {
      call<VariantPage>("variants", {
        query,
        offset,
        chromosome: chromosome || null,
        quality: quality || null,
      })
        .then((value) => {
          if (mounted) setResult(value);
        })
        .catch((reason: unknown) => {
          if (mounted) {
            setResult(undefined);
            setError(typeof reason === "string" ? reason : new Error());
          }
        });
    }, 120);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [chromosome, offset, quality, query]);
  const hasRows = result && result.rows.length > 0;
  const loading = result?.offset !== offset && error === undefined;
  return (
    <>
      {onBack && (
        <button className="text-button variant-back" onClick={onBack}>
          <ArrowLeft size={15} /> {t("Zurück zum Befund")}
        </button>
      )}
      <Heading
        title={t("Variantenregister")}
        description={t("Positionen und Genotypen aus der importierten Datei.")}
      />
      <div className="filters variant-filters">
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
            aria-label={t("Varianten suchen")}
            placeholder={t("rsID, Position oder Bereich")}
          />
        </label>
        <select
          aria-label={t("Chromosom")}
          value={chromosome}
          onChange={(e) => {
            setChromosome(e.target.value);
            resetPage();
          }}
        >
          <option value="">{t("Alle Chromosomen")}</option>
          {chromosomes.map(([chr]) => (
            <option key={chr} value={chr}>
              {chr}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Datenqualität")}
          value={quality}
          onChange={(e) => {
            setQuality(e.target.value as VariantQuality | "");
            resetPage();
          }}
        >
          <option value="">{t("Alle Genotypstatus")}</option>
          {(["present", "no_call", "conflict"] as const).map((status) => (
            <option key={status} value={status}>
              {variantQualityLabel(status)}
            </option>
          ))}
        </select>
      </div>
      <p className="variant-hint">
        {t("Beispiele: rs4988235, 2:136608646 oder chr2:136600000-136650000")}
      </p>
      {error !== undefined && (
        <p role="alert">
          {typeof error === "string"
            ? resultText(error)
            : t("Das Variantenregister konnte nicht geladen werden.")}
        </p>
      )}
      {!result && error === undefined && (
        <p role="status">{t("Varianten werden gesucht …")}</p>
      )}
      {result && !hasRows && (
        <p role="status">{t("Keine passenden Rohzeilen gefunden.")}</p>
      )}
      {hasRows && (
        <div className="panel variant-table" aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>Marker</th>
                <th>{t("Chromosom")}</th>
                <th>Position</th>
                <th>{t("Genotyp")}</th>
                <th>{t("Datenqualität")}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  <td className="mono">{row.id || "–"}</td>
                  <td>{row.chromosome}</td>
                  <td>{number.format(row.position)}</td>
                  <td className="mono">{row.alleles || t("Fehlt")}</td>
                  <td>{variantQualityLabel(row.quality)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <span aria-live="polite">
              {number.format(result.offset + 1)}–
              {number.format(result.offset + result.rows.length)} {t("von")}{" "}
              {number.format(result.total)}
            </span>
            <button
              onClick={() =>
                !loading && setOffset(result.offset - result.page_size)
              }
              aria-disabled={loading || result.offset === 0}
              disabled={result.offset === 0}
              aria-label={t("Vorige Seite")}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={() =>
                !loading && setOffset(result.offset + result.page_size)
              }
              aria-disabled={
                loading || result.offset + result.page_size >= result.total
              }
              disabled={result.offset + result.page_size >= result.total}
              aria-label={t("Nächste Seite")}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MaternalResult({
  data,
}: {
  data: NonNullable<Report["maternal_lineage"]>;
}) {
  return (
    <div className="score">
      <strong>{t("Importiertes mtDNA-Ergebnis")}</strong>
      <p>
        {data.candidates
          .map(
            (hit) =>
              `${hit.haplogroup} · ${number.format(hit.quality * 100)} %`,
          )
          .join(" / ")}
      </p>
      <p>{t("Haplogrep-Übereinstimmung mit dem Referenzbaum")}</p>
      <p>
        Haplogrep {data.tool_version} · {data.tree}
      </p>
      <p>
        {number.format(data.covered_positions)} / {number.format(16_569)}{" "}
        {t("Positionen im angegebenen Bereich")}
      </p>
      <p>
        {data.warnings} {data.warnings === 1 ? t("Warnung") : t("Warnungen")} ·{" "}
        {data.errors}{" "}
        {data.errors === 1
          ? t("Fehler bei der Qualitätsprüfung (Einzahl)")
          : t("Fehler bei der Qualitätsprüfung")}
      </p>
      {data.errors > 0 && (
        <p>{t("Haplogrep meldet Fehler. Die Zuordnung bleibt offen.")}</p>
      )}
    </div>
  );
}

function ClinicalMatches({ data }: { data: NonNullable<Report["clinical"]> }) {
  const [limit, setLimit] = useState(25);
  return (
    <>
      <p>
        {data.release} · {data.build} · {number.format(data.variants.length)}{" "}
        {t("passende ClinVar-Einträge")}
      </p>
      {data.variants.slice(0, limit).map((variant) => (
        <details className="finding" key={variant.id}>
          <summary>
            <span>
              {variant.marker} · {variant.classifications}
            </span>
            <ChevronDown size={16} />
          </summary>
          <dl className="definition finding-content">
            <dt>{t("Position")}</dt>
            <dd>
              {variant.chromosome}:{variant.position}
            </dd>
            <dt>{t("Alternativallel")}</dt>
            <dd>
              {variant.alternate} × {variant.copies}
            </dd>
            <dt>{t("Review-Status")}</dt>
            <dd>{variant.review_status}</dd>
            {variant.conflicting_classifications && (
              <>
                <dt>{t("Abweichende Einreichungen")}</dt>
                <dd>{variant.conflicting_classifications}</dd>
              </>
            )}
            <dt>{t("Erfasste Erkrankungen")}</dt>
            <dd>{variant.conditions || "–"}</dd>
            <dt>ClinVar</dt>
            <dd>Variation ID {variant.id}</dd>
          </dl>
        </details>
      ))}
      {limit < data.variants.length && (
        <button
          className="text-button more-findings"
          onClick={() => setLimit(limit + 25)}
        >
          {t("Weitere Einträge anzeigen (")}
          {number.format(data.variants.length - limit)})
        </button>
      )}
      {data.gene_validity && (
        <details>
          <summary>
            {t("ClinGen-Gen-Krankheits-Evidenz")} ·{" "}
            {data.gene_validity.records.length}
          </summary>
          <p>
            {data.gene_validity.date} ·{" "}
            {t(
              "ClinGen beurteilt den Zusammenhang zwischen Gen und Erkrankung.",
            )}
          </p>
          <ul>
            {data.gene_validity.records.map((entry) => (
              <li key={entry.evidence_url}>
                {entry.gene} · {entry.disease} ({entry.mondo}) ·{" "}
                {entry.inheritance} · {entry.classification}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function TrioSummary({ trio }: { trio: NonNullable<Report["trio"]> }) {
  const [limit, setLimit] = useState(25);
  return (
    <>
      <dl className="definition">
        <dt>{t("Gemeinsam geprüfte Marker")}</dt>
        <dd>{number.format(trio.compared)}</dd>
        <dt>{t("Zuordenbare heterozygote Marker")}</dt>
        <dd>{number.format(trio.phased_heterozygous)}</dd>
        <dt>{t("Mehrdeutige Zuordnung")}</dt>
        <dd>{number.format(trio.ambiguous)}</dd>
        <dt>{t("Kompatible homozygote Marker")}</dt>
        <dd>{number.format(trio.homozygous)}</dd>
        <dt>{t("Unvereinbare Genotypen")}</dt>
        <dd>{number.format(trio.inconsistent)}</dd>
      </dl>
      {trio.assignments.length > 0 && (
        <details>
          <summary>{t("Allelzuordnung für Katalogmarker")}</summary>
          <table>
            <thead>
              <tr>
                <th>Marker</th>
                <th>Position</th>
                <th>{t("Erster Elternteil")}</th>
                <th>{t("Zweiter Elternteil")}</th>
              </tr>
            </thead>
            <tbody>
              {trio.assignments.slice(0, limit).map((row) => (
                <tr key={`${row.marker}-${row.chromosome}-${row.position}`}>
                  <td>{row.marker}</td>
                  <td>
                    {row.chromosome}:{row.position}
                  </td>
                  <td>{row.first}</td>
                  <td>{row.second}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {limit < trio.assignments.length && (
            <button
              className="text-button more-findings"
              onClick={() => setLimit(limit + 25)}
            >
              {t("Weitere Einträge anzeigen (")}
              {number.format(trio.assignments.length - limit)})
            </button>
          )}
        </details>
      )}
    </>
  );
}

function SequenceCoverage({ data }: { data: NonNullable<Report["sequence"]> }) {
  const [limit, setLimit] = useState(25);
  const covered = data.targets.filter((target) => target.depth > 0).length;
  return (
    <>
      <p>
        {data.build} · {number.format(data.reads)} Reads · {covered}/
        {data.targets.length} {t("Marker mit Basen nach Qualitätsfilter")}
      </p>
      {data.targets.length > 0 && (
        <details>
          <summary>{t("Lesetiefe pro Marker")}</summary>
          <div className="variant-table">
            <table>
              <thead>
                <tr>
                  <th>Marker</th>
                  <th>Position</th>
                  <th>{t("Lesetiefe")}</th>
                  {["A", "C", "G", "T"].map((base) => (
                    <th key={base}>{base}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.targets.slice(0, limit).map((target) => (
                  <tr key={`${target.id}-${target.coordinate}`}>
                    <td>{target.id}</td>
                    <td>{target.coordinate}</td>
                    <td>{number.format(target.depth)}</td>
                    {target.bases.map((count, i) => (
                      <td key={i}>{number.format(count)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {limit < data.targets.length && (
            <button
              className="text-button more-findings"
              onClick={() => setLimit(limit + 25)}
            >
              {t("Weitere Einträge anzeigen (")}
              {number.format(data.targets.length - limit)})
            </button>
          )}
        </details>
      )}
    </>
  );
}

function App() {
  const [page, setPage] = useState<Page>("home");
  const [language, setUiLanguage] = useState<Language>(getLanguage);
  const chapters: Chapter[] =
    language === "de" ? germanChapters : englishChapters;
  const [model, setModel] = useState<Report>();
  const [phone, setPhone] = useState(() => matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const resize = () => setPhone(media.matches);
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  function switchLanguage(value: Language) {
    if (running.current || value === language) return;
    setLanguage(value);
    setUiLanguage(value);
    setPreview(undefined);
    setPassPreview(undefined);
    setError("");
    setNotice("");
  }
  const [activeChapter, setActiveChapter] = useState("01");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const running = React.useRef(false);
  const [progress, setProgress] = useState<number>();
  const [update, setUpdate] = useState<(onBlocked: () => void) => void>();
  const [navOpen, setNavOpen] = useState(false);
  const sidebar = React.useRef<HTMLElement>(null);
  usePanelFocus(sidebar, phone && navOpen, true, () => setNavOpen(false));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [origins, setOrigins] = useState("");
  const [key, setKey] = useState("");
  const [version, setVersion] = useState(starterCatalog.version);
  const [options, setOptions] = useState<Options>(defaultOptions);
  const [preview, setPreview] = useState<ArrayBuffer>();
  const [anchor, setAnchor] = useState("");
  const [variantJump, setVariantJump] = useState<{
    query: string;
    finding: FindingLocation;
  }>();
  const [inspected, setInspected] = useState<string>();
  const [area, setArea] = useState<AreaId>();
  const [passPreview, setPassPreview] = useState<ArrayBuffer>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [showMedical, setMedicalVisible] = useState(false);
  function setShowMedical(value: boolean) {
    if (running.current) return;
    setMedicalVisible(value);
    setPassPreview(undefined);
  }
  useEffect(() => setPassPreview(undefined), [options]);
  useEffect(() => {
    if (!anchor || page !== "chapters") return;
    const element = document.getElementById(`finding-${anchor}`);
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
      element.scrollIntoView({ block: "center" });
      element.querySelector("summary")?.focus({ preventScroll: true });
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
    setPassPreview(undefined);
  };
  function navigate(page: Page) {
    setPage(page);
    setNavOpen(false);
    setInspected(undefined);
    document.querySelector(".content")?.scrollTo(0, 0);
  }
  function selectChapter(id: string) {
    setActiveChapter(id);
    setQuery("");
    setFilter("all");
    navigate("chapters");
  }
  function openFinding(finding: FindingLocation) {
    selectChapter(finding.section.split(".")[0]);
    setAnchor(finding.id);
  }
  function openVariant(finding: Finding, marker: MarkerCheck) {
    setVariantJump({
      query: marker.coordinate || marker.id,
      finding: { id: finding.id, section: finding.section },
    });
    navigate("variants");
  }

  async function run<T>(
    label: string,
    action: () => Promise<T>,
    done: (value: T) => void,
  ) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      done(await action());
    } catch (e) {
      setError(
        typeof e === "string" && e
          ? resultText(e)
          : t("Der Vorgang konnte nicht abgeschlossen werden."),
      );
    } finally {
      running.current = false;
      setBusy("");
      setProgress(undefined);
    }
  }
  function clearProfileControls() {
    setVariantJump(undefined);
    setInspected(undefined);
    setAnchor("");
    setArea(undefined);
    setQuery("");
    setFilter("all");
    setOrigins("");
    setMedicalVisible(false);
    setOptions(defaultOptions);
    setPreview(undefined);
    setPassPreview(undefined);
  }
  function imported(result: Report) {
    clearProfileControls();
    setReport(result);
    navigate("home");
  }
  function importData(example: boolean) {
    if (example) {
      void run(
        t("DNA-Datei einlesen"),
        () => call<Report>("importDna", { file: null }),
        imported,
      );
      return;
    }
    void pickFiles(".csv,.tsv,.txt,.zip").then(([file]) => {
      if (file) importFile(file);
    });
  }
  function importFile(file: File) {
    if (!/\.(csv|tsv|txt|zip)$/i.test(file.name)) {
      setError(t("Bitte eine CSV-, TSV-, TXT- oder ZIP-Datei verwenden."));
      return;
    }
    void run(
      t("DNA-Datei einlesen"),
      () => call<Report>("importDna", { file }),
      imported,
    );
  }
  async function extraFiles(kind: ExtraKind): Promise<File[] | string> {
    const accept: Record<ExtraKind, string> = {
      relatives: ".csv,.tsv,.txt",
      family: ".csv,.tsv,.txt,.zip",
      trio: ".csv,.tsv,.txt,.zip",
      clinical: ".vcf,.gz",
      gene_validity: ".csv",
      maternal_lineage: ".json",
      cram: ".cram,.fa,.fasta,.fna,.fai",
    };
    const files = await pickFiles(accept[kind], kind === "trio" || kind === "cram");
    if (files.length === 0) return [];
    if (kind === "trio") {
      return files.length === 2
        ? files
        : t("Bitte genau zwei Elterndateien auswählen.");
    }
    if (kind === "cram") {
      const find = (pattern: RegExp) => files.find((f) => pattern.test(f.name));
      const cram = find(/\.cram$/i);
      const fasta = find(/\.(fa|fasta|fna)$/i);
      const index = find(/\.fai$/i);
      return cram && fasta && index && files.length === 3
        ? [cram, fasta, index]
        : t("Bitte CRAM, FASTA und den .fai-Index gemeinsam auswählen.");
    }
    return files.slice(0, 1);
  }
  function extra(kind: ExtraKind, label: string) {
    void extraFiles(kind).then((files) => {
      if (typeof files === "string") {
        setError(files);
        return;
      }
      if (files.length === 0) return;
      void run(
        label,
        () => call<Report>("importExtra", { kind, files }),
        (result) => {
          setReport(result);
          setNotice(t("Begleitdaten übernommen."));
        },
      );
    });
  }
  function pdfBytes(pass: boolean) {
    return call<Uint8Array>("renderPdf", {
      options: { ...options, language, pass },
    });
  }
  function renderPdf() {
    void run(
      t("PDF-Vorschau erstellen"),
      () => pdfBytes(false),
      (bytes) => setPreview(bytes.slice().buffer),
    );
  }
  function renderPass() {
    void run(
      t("PDF-Vorschau erstellen"),
      () => pdfBytes(true),
      (bytes) => setPassPreview(bytes.slice().buffer),
    );
  }
  function savePass() {
    void run(
      t("PDF exportieren"),
      () => pdfBytes(true),
      (bytes) => {
        download(bytes, "Roots Local Medicine Pass.pdf");
        setNotice(t("Der Medikamentenpass wurde gespeichert."));
      },
    );
  }
  function savePdf() {
    void run(
      t("PDF exportieren"),
      () => pdfBytes(false),
      (bytes) => {
        download(bytes, "Roots Local Report.pdf");
        setNotice(t("Der PDF-Report wurde gespeichert."));
      },
    );
  }

  const latest = React.useRef({
    importData,
    importFile,
    savePdf,
    navigate,
    busy,
    model,
  });
  latest.current = { importData, importFile, savePdf, navigate, busy, model };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const app = latest.current;
      if (key === "o") {
        event.preventDefault();
        if (!app.busy) app.importData(false);
      } else if (key === "e" && app.model) {
        event.preventDefault();
        if (!app.busy) app.savePdf();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => registerOffline((apply) => setUpdate(() => apply)), []);
  useEffect(() => {
    const stop = onProgress(setProgress);
    return () => void stop();
  }, []);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;
    function enter(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDropping(true);
    }
    function over(event: DragEvent) {
      if (hasFiles(event)) event.preventDefault();
    }
    function leave(event: DragEvent) {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    }
    function drop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDropping(false);
      const file = event.dataTransfer?.files[0];
      if (file && !latest.current.busy) latest.current.importFile(file);
    }
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const inspectedFinding = results.find((finding) => finding.id === inspected);
  const mobileInspector = phone && Boolean(inspectedFinding);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const finding of results) {
      if (finding.status === "missing") continue;
      const id = finding.section.split(".")[0];
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [results]);
  const conclusions = results.filter(
    (finding) => finding.status === "personal" && finding.conclusion,
  );
  const shownConclusions = conclusions.filter(
    (finding) => showMedical || !isMedical(finding),
  );
  const hiddenMedical = conclusions.length - shownConclusions.length;
  const medicines = results.filter(
    (finding) => finding.section.startsWith("15.") && finding.conclusion,
  );
  const commands: Command[] = [
    ...navigation().map((item) => ({
      id: `page-${item.id}`,
      label: item.label,
      hint: t("Ansicht"),
      run: () => navigate(item.id),
    })),
    {
      id: "open",
      label: t("DNA-Datei öffnen"),
      hint: isApple ? "⌘O" : "Ctrl O",
      run: () => importData(false),
    },
    {
      id: "example",
      label: t("Beispiel ansehen"),
      hint: t("Befehl"),
      run: () => importData(true),
    },
    ...(model
      ? [
          {
            id: "export",
            label: t("PDF exportieren"),
            hint: isApple ? "⌘E" : "Ctrl E",
            run: savePdf,
          },
          {
            id: "medical",
            label: showMedical
              ? t("Medizinische Befunde ausblenden")
              : t("Medizinische Befunde anzeigen"),
            hint: t("Befehl"),
            run: () => setShowMedical(!showMedical),
          },
        ]
      : []),
    {
      id: "language",
      label: language === "de" ? "Switch to English" : "Auf Deutsch wechseln",
      hint: t("Befehl"),
      run: () => switchLanguage(language === "de" ? "en" : "de"),
    },
    ...results.flatMap((finding) =>
      (finding.questions ?? []).map((question, index) => ({
        id: `question-${finding.id}-${index}`,
        label: resultText(question),
        hint: t("Frage"),
        run: () => {
          if (page !== "home" && page !== "atlas") navigate("home");
          setInspected(finding.id);
        },
      })),
    ),
    ...chapters.map((chapter) => ({
      id: `chapter-${chapter.id}`,
      label: `${chapter.id} ${chapter.title}`,
      hint: t("Kapitel"),
      run: () => selectChapter(chapter.id),
    })),
    ...results
      .filter((finding) => finding.status !== "missing" || !finding.study)
      .map((finding) => ({
        id: `finding-${finding.id}`,
        label: resultText(finding.title),
        hint: finding.checks.map((check) => check.id).join(", "),
        keywords: `${finding.checks.map((check) => check.gene).join(" ")} ${finding.section}`,
        run: () => {
          if (page !== "home" && page !== "atlas") navigate("home");
          setInspected(finding.id);
        },
      })),
  ];

  return (
    <MedicalContext.Provider value={showMedical}>
      <div
        className={`app${inspectedFinding ? " with-inspector" : ""}${dropping ? " dropping" : ""}${navOpen ? " nav-open" : ""}`}
      >
        {navOpen && (
          <div
            className="nav-scrim"
            aria-hidden="true"
            onClick={() => setNavOpen(false)}
          />
        )}
        <aside ref={sidebar} className="sidebar" id="app-sidebar" tabIndex={-1}
          inert={mobileInspector} role={phone && navOpen ? "dialog" : undefined}
          aria-modal={phone && navOpen ? true : undefined}
          aria-label={phone && navOpen ? t("Hauptnavigation") : undefined}>
          {phone && navOpen && (
            <button type="button" className="close-menu" data-initial-focus
              onClick={() => setNavOpen(false)} aria-label={t("Menü schließen")}>
              <X size={20} aria-hidden="true" />
            </button>
          )}
          <button className="brand" onClick={() => navigate("home")}>
            <Logo size={24} />
            <span>Roots Local</span>
          </button>
          <nav aria-label={t("Hauptnavigation")}>
            <div className="group">{t("Bibliothek")}</div>
            {navigation()
              .filter(({ id }) => id !== "data")
              .map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={page === id ? "selected" : ""}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => {
                    if (id === "variants") setVariantJump(undefined);
                    navigate(id);
                  }}
                  disabled={(id === "variants" || id === "atlas") && !dataReady}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {id === "chapters" && model && (
                    <span className="count">
                      {totals.personal + totals.research}
                    </span>
                  )}
                </button>
              ))}
            {model && (
              <>
                <div className="group">{t("Kapitel")}</div>
                {chapters
                  .filter((chapter) => counts.has(chapter.id))
                  .map((chapter) => (
                    <button
                      key={chapter.id}
                      className={
                        page === "chapters" && activeChapter === chapter.id
                          ? "selected"
                          : ""
                      }
                      onClick={() => selectChapter(chapter.id)}
                    >
                      <span>
                        <span className="mono">{chapter.id}</span>{" "}
                        {chapter.title}
                      </span>
                      <span className="count">{counts.get(chapter.id)}</span>
                    </button>
                  ))}
              </>
            )}
            <div className="group">{t("Quellen")}</div>
            {navigation()
              .filter(({ id }) => id === "data")
              .map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={page === id ? "selected" : ""}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => navigate(id)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className={page === "privacy" ? "selected" : ""}
              aria-current={page === "privacy" ? "page" : undefined}
              onClick={() => navigate("privacy")}
            >
              <LockKeyhole size={14} />
              <span>{t("Lokal auf diesem Gerät")}</span>
            </button>
            <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer">
              {t("Impressum & Datenschutz")}
            </a>
          </div>
        </aside>
        <main inert={(phone && navOpen) || mobileInspector}>
          <div className="topbar">
            <button
              className="menu-button"
              aria-label={t("Menü")}
              aria-expanded={navOpen}
              aria-controls="app-sidebar"
              onClick={() => setNavOpen(true)}
            >
              <List size={20} />
            </button>
            <span className="title">
              {page === "privacy"
                ? t("Datenschutz")
                : navigation().find((n) => n.id === page)?.label}
              {model?.example && (
                <span className="example">{t("Beispielprofil")}</span>
              )}
            </span>
            <div className="toolbar-actions">
              {model && (
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showMedical}
                    disabled={!!busy}
                    onChange={(event) => setShowMedical(event.target.checked)}
                  />
                  <span className="track" aria-hidden="true" />
                  {t("Medizinisch")}
                </label>
              )}
              <button
                className="palette-trigger"
                aria-label={t("Suchen")}
                onClick={() => setPaletteOpen(true)}
              >
                <Search size={14} />
                <span>{t("Suchen")}</span>
                <kbd>{isApple ? "⌘K" : "Ctrl K"}</kbd>
              </button>
              <div className="language-control" role="group" aria-label={t("Sprache")}>
                {([["en", "English"], ["de", "Deutsch"]] as const).map(([code, label]) => (
                  <button key={code} type="button" lang={code} aria-label={label}
                    aria-pressed={language === code} disabled={!!busy}
                    onClick={() => switchLanguage(code)}>
                    <span className="language-full">{label}</span>
                    <span className="language-short" aria-hidden="true">{code.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="content">
            {update && (
              <div className="feedback" role="status">
                <span>{t("Eine neue Version von Roots Local ist bereit.")}{" "}
                  {model && t("Beim Neuladen endet deine aktuelle Sitzung.")}</span>
                <button className="text-button" disabled={!!busy}
                  onClick={() => update(() => setNotice(t("Schließe die anderen Roots-Local-Tabs und versuche es erneut.")))}>
                  {t("Neu laden")}
                </button>
              </div>
            )}
            {(busy || error || notice) && (
              <div
                className={`feedback ${error ? "error" : ""}`}
                role={error ? "alert" : "status"}
              >
                <span>
                  {busy
                    ? `${busy} …${progress !== undefined ? ` ${Math.round(progress * 100)} %` : ""}`
                    : error || notice}
                </span>
                {busy ? (
                  !busy.includes("PDF") &&
                  canCancel && (
                    <button className="text-button" onClick={cancel}>
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
                    title={t("Was deine DNA sagt")}
                    description={`${t("MyHeritage-Format")} · ${model.summary.format} · ${model.summary.build || t("Referenzgenom unbekannt")} · ${t("Katalog")} ${model.catalog_version}`}
                  />
                  {model.example && <p className="example example-mobile">{t("Synthetisches Beispielprofil")}</p>}
                  <div className="stats">
                    <div>
                      <small>{t("Schlussfolgerungen")}</small>
                      <strong>{shownConclusions.length}</strong>
                    </div>
                    <div>
                      <small>{t("Studienbezüge")}</small>
                      <strong>{totals.research}</strong>
                    </div>
                    <div>
                      <small>{t("Offen")}</small>
                      <strong>{totals.missing}</strong>
                    </div>
                    <div>
                      <small>{t("Genotypzeilen")}</small>
                      <strong>{number.format(model.summary.rows)}</strong>
                    </div>
                  </div>
                  {hiddenMedical > 0 && (
                    <div className="notice-card">
                      <p>
                        <strong>
                          {hiddenMedical}{" "}
                          {t("medizinische Befunde ausgeblendet.")}
                        </strong>{" "}
                        {t(
                          "Sie betreffen Medikamente oder Erkrankungsrisiken und brauchen eine Laborbestätigung.",
                        )}
                      </p>
                      <button
                        className="button secondary compact"
                        onClick={() => setShowMedical(true)}
                      >
                        {t("Anzeigen")}
                      </button>
                    </div>
                  )}
                  <div className="overview-hero">
                    <AskDna
                      findings={results}
                      showMedical={showMedical}
                      onShowMedical={() => setShowMedical(true)}
                      onOpen={(finding) => setInspected(finding.id)}
                    />
                    <div>
                    <NucleusRadar
                      findings={results}
                      showMedical={showMedical}
                      selected={inspected}
                      onOpen={(finding) => setInspected(finding.id)}
                      onSelectArea={(id) =>
                        id === "medicines" ? navigate("pass") : setArea(id)
                      }
                    />
                    <p className="radar-key">{t("Je näher am Zentrum, desto höher die Einstufung der Katalogregel.")}</p>
                    </div>
                  </div>
                  <header className="section-heading">
                    <h2>{t("Deine Lebensbereiche")}</h2>
                  </header>
                  <LifeAreas
                    findings={results}
                    showMedical={showMedical}
                    selected={area}
                    onSelect={(id) => setArea(area === id ? undefined : id)}
                    onOpenPass={() => navigate("pass")}
                  />
                  <header className="section-heading">
                    <h2>
                      {area
                        ? areas().find((a) => a.id === area)?.label
                        : t("Alle Schlussfolgerungen")}
                    </h2>
                    {area && (
                      <button
                        className="text-button"
                        onClick={() => setArea(undefined)}
                      >
                        {t("Alle anzeigen")}
                      </button>
                    )}
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
                  {shownConclusions.length ? (
                    <div className="conclusions">
                      {shownConclusions
                        .filter((finding) => !area || areaOf(finding) === area)
                        .map((finding) => (
                          <button
                            key={finding.id}
                            className={`conclusion-tile${inspected === finding.id ? " active" : ""}`}
                            onClick={() =>
                              setInspected(
                                inspected === finding.id
                                  ? undefined
                                  : finding.id,
                              )
                            }
                          >
                            <span className="top">
                              <strong>{resultText(finding.title)}</strong>
                              {isMedical(finding) && (
                                <span className="medical">
                                  {t("Medizinisch")}
                                </span>
                              )}
                            </span>
                            <span className="answer">
                              {visibleConclusion(finding, showMedical)}
                            </span>
                            {finding.confidence && (
                              <ConfidenceMeter value={finding.confidence} />
                            )}
                            <span className="gene">
                              {finding.checks
                                .map(
                                  (check) =>
                                    `${resultText(check.gene)} · ${check.id}`,
                                )
                                .join("  ")}
                            </span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <div className="empty">
                      <CircleHelp size={20} />
                      {model.summary.build
                        ? t(
                            "Die Datenbasis für die vorhandenen Merkmalsregeln ist nicht ausreichend.",
                          )
                        : t(
                            "Der Dateikopf nennt kein unterstütztes Referenzgenom. Die Rohdaten bleiben im Variantenregister sichtbar.",
                          )}
                    </div>
                  )}
                  {totals.research > 0 && (
                    <>
                      <header className="section-heading">
                        <h2>{t("Studienbezüge")}</h2>
                      </header>
                      <div className="result-grid">
                        {results
                          .filter((f) => f.status === "research")
                          .slice(0, 9)
                          .map((f) => (
                            <button
                              key={f.id}
                              className={`conclusion-tile${inspected === f.id ? " active" : ""}`}
                              onClick={() => setInspected(f.id)}
                            >
                              <StatusLabel status={f.status} />
                              <strong>{resultText(f.title)}</strong>
                              <span className="gene">
                                {f.checks.map((check) => check.id).join(", ")}
                              </span>
                            </button>
                          ))}
                      </div>
                    </>
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
                    <span>
                      <strong>
                        {model.summary.sex_check.pattern === "xx"
                          ? t("XX-Muster")
                          : model.summary.sex_check.pattern === "xy"
                            ? t("XY-Muster")
                            : t("nicht bestimmbar")}
                      </strong>{" "}
                      {t("Geschlechtschromosomen")} ·{" "}
                      {number.format(model.summary.sex_check.x_called)}{" "}
                      {t("X-Positionen")}
                    </span>
                  </div>
                </>
              ) : (
                <section className="welcome">
                  <div className="welcome-copy">
                    <Heading
                      title={t("Deine DNA. Dein Gerät.")}
                      description={t(
                        "Öffne deinen MyHeritage-Rohdatenexport. Roots Local zieht Schlüsse aus deinen Genotypen und zeigt, wie sicher sie sind.",
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
                    <p className="local-note">{t("Die Analyse läuft im Browser auf diesem Gerät.")}</p>
                    <p className="formats">
                      {t("CSV, TSV, TXT oder ZIP")} ·{" "}
                      {t("Oder die Datei einfach ins Fenster ziehen.")}
                    </p>
                  </div>
                  <div className="helix" aria-hidden="true">
                    <Mark size={200} />
                  </div>
                </section>
              ))}
            {page === "pass" && (
              <>
                <Heading
                  title={t("Medikamentenpass")}
                  description={t(
                    "Hinweise zu geprüften Medikamentenmarkern für das ärztliche Gespräch.",
                  )}
                />
                {!model ? (
                  <div className="empty">
                    {t("Öffne eine DNA-Datei, um einen Report zu erstellen.")}
                  </div>
                ) : !showMedical ? (
                  <div className="notice-card">
                    <p>
                      <strong>
                        {t("Der Pass zeigt medizinische Befunde.")}
                      </strong>{" "}
                      {t(
                        "Sie stammen aus Verbraucherdaten und brauchen eine Laborbestätigung.",
                      )}
                    </p>
                    <button
                      className="button secondary compact"
                      onClick={() => setShowMedical(true)}
                    >
                      {t("Anzeigen")}
                    </button>
                  </div>
                ) : (
                  <div className="pass-layout">
                    <div className="pass-card">
                      <div className="pass-head">
                        <strong>{t("Medikamentenpass")}</strong>
                        <span>Roots Local</span>
                      </div>
                      {medicines.length ? (
                        <dl>
                          {medicines.slice(0, 7).map((finding) => {
                            const gene = finding.checks[0]?.gene ?? "";
                            let line = resultText(finding.conclusion!).split(
                              ". ",
                            )[0];
                            if (line.startsWith(`${gene} `))
                              line = line.slice(gene.length + 1);
                            return (
                              <React.Fragment key={finding.id}>
                                <dt>{gene}</dt>
                                <dd>{line.replace(/\.$/, "")}</dd>
                              </React.Fragment>
                            );
                          })}
                        </dl>
                      ) : (
                        <p>
                          {t("Keine pharmakogenetischen Schlussfolgerungen.")}
                        </p>
                      )}
                      <small>
                        {t(
                          "Unbestätigte Verbraucherdaten · nicht für Dosisentscheidungen ohne Arzt",
                        )}
                      </small>
                    </div>
                    <div className="actions">
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={savePass}
                      >
                        {t("Pass als PDF exportieren")}
                        <ArrowDownToLine size={16} />
                      </button>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={renderPass}
                      >
                        {t("Vorschau")}
                      </button>
                    </div>
                    <div className="variant-table">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("Gen")}</th>
                            <th>{t("Ergebnis und Bedeutung")}</th>
                            <th>{t("Sicherheit")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medicines.map((finding) => (
                            <tr
                              key={finding.id}
                              className="clickable"
                              onClick={() => setInspected(finding.id)}
                            >
                              <td>
                                <strong>{finding.checks[0]?.gene}</strong>
                                <small className="mono">
                                  {finding.checks.map((c) => c.id).join(", ")}
                                </small>
                              </td>
                              <td>
                                {resultText(finding.conclusion!)}
                                <small>{resultText(finding.summary)}</small>
                              </td>
                              <td>
                                {finding.confidence && (
                                  <ConfidenceMeter value={finding.confidence} />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {passPreview && (
                      <div className="preview">
                        <Suspense
                          fallback={
                            <p role="status">{t("PDF wird geöffnet …")}</p>
                          }
                        >
                          <PdfPreview bytes={passPreview} />
                        </Suspense>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {page === "atlas" && model && (
              <>
                <Heading
                  title={t("Atlas")}
                  description={t(
                    "Jeder Katalogmarker an seiner Position im Genom. Wähle einen Marker, um den Befund zu öffnen.",
                  )}
                />
                <Atlas
                  findings={results}
                  build={model.summary.build}
                  showMedical={showMedical}
                  selected={inspected}
                  onOpen={(finding) => setInspected(finding.id)}
                />
              </>
            )}
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
                            openVariant={openVariant}
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
                            const maternal =
                              section.id === "01.3"
                                ? model?.maternal_lineage
                                : null;
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
                                {maternal && <MaternalResult data={maternal} />}
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
                                  openVariant={openVariant}
                                />
                                {cross.map((f) => (
                                  <button
                                    className="text-button"
                                    key={f.id}
                                    onClick={() => openFinding(f)}
                                  >
                                    {t("Siehe")} {resultText(f.title)}{" "}
                                    <ArrowRight size={14} />
                                  </button>
                                ))}
                                {model &&
                                  !findings.length &&
                                  !cross.length &&
                                  !maternal && (
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
            {page === "variants" && model && (
              <VariantRegister
                key={variantJump?.query ?? ""}
                initialQuery={variantJump?.query ?? ""}
                chromosomes={model.summary.chromosomes}
                onBack={
                  variantJump &&
                  (() => {
                    setVariantJump(undefined);
                    openFinding(variantJump.finding);
                  })
                }
              />
            )}
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
                          disabled={!!busy}
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
                          disabled={!!busy}
                          onChange={() => {
                            setOptions({ ...options, short: true });
                            setPreview(undefined);
                          }}
                        />
                        <span>
                          <strong>{t("Kurzreport")}</strong>
                          <small>
                            {t(
                              "Ausgewählte Ergebnisse und importierte Zusatzdaten",
                            )}
                          </small>
                        </span>
                      </label>
                      <h2>{t("Persönliche Angaben")}</h2>
                      <label className="field">
                        {t("Name im Report")}{" "}
                        <input
                          value={options.name || ""}
                          disabled={!!busy}
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
                          disabled={!!busy}
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
                          disabled={!!busy}
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
                      {
                        <label className="choice">
                          <input
                            type="checkbox"
                            checked={options.include_clinical}
                            disabled={!!busy}
                            onChange={(e) => {
                              setOptions({
                                ...options,
                                include_clinical: e.target.checked,
                              });
                              setPreview(undefined);
                            }}
                          />
                          <span>
                            <strong>
                              {t("Medizinische Befunde aufnehmen")}
                            </strong>
                            <small>
                              {t(
                                "Medikamente, Erkrankungsrisiken sowie ClinVar und ClinGen. Quellenlinks können beobachtete Varianten offenlegen.",
                              )}
                            </small>
                          </span>
                        </label>
                      }
                      {model.maternal_lineage && (
                        <label className="choice">
                          <input
                            type="checkbox"
                            checked={options.include_lineage}
                            disabled={!!busy}
                            onChange={(event) => {
                              setOptions({
                                ...options,
                                include_lineage: event.target.checked,
                              });
                              setPreview(undefined);
                            }}
                          />
                          {t("Importiertes mtDNA-Ergebnis aufnehmen")}
                        </label>
                      )}
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
                    <div className="preview" role="region" aria-label={t("Vorschau")} tabIndex={0}>
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
            {page === "privacy" && <Privacy />}
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
                              () => call("reset", {}),
                              () => {
                                setModel(undefined);
                                clearProfileControls();
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
                          async () => {
                            const [file] = await pickFiles(".json,.rootscat");
                            if (!file) return null;
                            return call<{
                              version: string;
                              model: Report | null;
                            }>("loadCatalog", { file, key });
                          },
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
                                  call<Report>("saveOrigins", {
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
                          <button
                            className="button secondary"
                            disabled={!!busy}
                            onClick={() =>
                              extra("trio", t("Elterndateien abgleichen"))
                            }
                          >
                            {t("Zwei Elterndateien")}
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
                          <>
                            <p>
                              {number.format(model.family.compared)}{" "}
                              {t("gemeinsam ausgewertete Positionen ·")}{" "}
                              {number.format(model.family.discordant)}{" "}
                              {t("ohne gemeinsames Allel")}
                            </p>
                            {model.family.kinship !== null && (
                              <p>
                                {t("KING-Koeffizient (Forschungswert)")}{" "}
                                {number.format(
                                  Number(model.family.kinship.toFixed(4)),
                                )}{" "}
                                · {number.format(model.family.kinship_markers)}{" "}
                                {t("geprüfte Marker")}
                              </p>
                            )}
                          </>
                        )}
                        {model.trio && <TrioSummary trio={model.trio} />}
                      </section>
                      <section className="panel data-card">
                        <GitBranch size={22} />
                        <h2>{t("Mütterliche Linie")}</h2>
                        <p>
                          {t(
                            "Übernimm Kandidaten und Qualitätswerte aus einer lokal erstellten Haplogrep-Zusammenfassung.",
                          )}
                        </p>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            extra(
                              "maternal_lineage",
                              t("Haplogrep-Ergebnis einlesen"),
                            )
                          }
                        >
                          {t("Haplogrep-Ergebnis öffnen")}
                        </button>
                        {model.maternal_lineage && (
                          <MaternalResult data={model.maternal_lineage} />
                        )}
                      </section>
                      <section className="panel data-card">
                        <Database size={22} />
                        <h2>ClinVar</h2>
                        <p>
                          {t(
                            "Gleiche eine lokale ClinVar-VCF mit deiner Genotypdatei ab. Treffer aus Verbrauchertests benötigen eine unabhängige Bestätigung.",
                          )}
                        </p>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            extra("clinical", t("ClinVar-Datei abgleichen"))
                          }
                        >
                          {t("ClinVar-VCF öffnen")}
                        </button>
                        {model.clinical && (
                          <>
                            <button
                              className="button secondary"
                              disabled={!!busy}
                              onClick={() =>
                                extra(
                                  "gene_validity",
                                  t("ClinGen-Datei abgleichen"),
                                )
                              }
                            >
                              {t("ClinGen-CSV öffnen")}
                            </button>
                            <ClinicalMatches data={model.clinical} />
                          </>
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
                          <SequenceCoverage data={model.sequence} />
                        )}
                      </section>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
        {inspectedFinding && (
          <Inspector
            key={inspectedFinding.id}
            finding={inspectedFinding}
            showMedical={showMedical}
            onShowMedical={() => setShowMedical(true)}
            onClose={() => setInspected(undefined)}
            openVariant={openVariant}
            modal={mobileInspector}
          />
        )}
        {paletteOpen && (
          <CommandPalette
            commands={commands}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </div>
    </MedicalContext.Provider>
  );
}

document.documentElement.lang = getLanguage();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
