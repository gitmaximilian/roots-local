import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Coffee,
  Eye,
  Globe,
  HeartPulse,
  Pill,
  Search,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { getLanguage, resultText, t } from "./locale";
import { ConfidenceMeter, isMedical, visibleConclusion } from "./finding-ui";
import type { Confidence, Finding } from "./types";

export type AreaId =
  | "food"
  | "alcohol"
  | "body"
  | "looks"
  | "senses"
  | "origins"
  | "health"
  | "medicines";

export const areas = (): {
  id: AreaId;
  label: string;
  Icon: LucideIcon;
}[] => [
  { id: "food", label: t("Essen & Verdauung"), Icon: Utensils },
  { id: "alcohol", label: t("Alkohol & Kaffee"), Icon: Coffee },
  { id: "body", label: t("Sport & Körper"), Icon: Activity },
  { id: "looks", label: t("Aussehen"), Icon: Sparkles },
  { id: "senses", label: t("Sinne"), Icon: Eye },
  { id: "origins", label: t("Herkunft"), Icon: Globe },
  { id: "health", label: t("Gesundheit"), Icon: HeartPulse },
  { id: "medicines", label: t("Medikamente"), Icon: Pill },
];

const chapterArea: Record<string, AreaId> = {
  "01": "origins",
  "02": "origins",
  "03": "origins",
  "04": "looks",
  "05": "senses",
  "06": "body",
  "07": "food",
};

/** Everyday area of a finding. Medicines first, then medical findings, then chapter. */
export function areaOf(finding: Finding): AreaId {
  if (finding.section.startsWith("15.")) return "medicines";
  if (isMedical(finding)) return "health";
  if (finding.section.startsWith("07.2")) return "alcohol";
  return chapterArea[finding.section.slice(0, 2)] ?? "health";
}

const confidenceValue: Record<Confidence, number> = {
  high: 1,
  moderate: 0.66,
  low: 0.33,
};

export function LifeAreas({
  findings,
  showMedical,
  selected,
  onSelect,
  onOpenPass,
}: {
  findings: Finding[];
  showMedical: boolean;
  selected?: AreaId;
  onSelect: (area: AreaId) => void;
  onOpenPass: () => void;
}) {
  const groups = areas()
    .map((area) => {
      const items = findings.filter((f) => areaOf(f) === area.id);
      const concluded = items.filter((f) => f.conclusion);
      const visible = concluded.filter((f) => showMedical || !isMedical(f));
      const best = [...visible].sort(
        (a, b) =>
          confidenceValue[b.confidence ?? "low"] -
          confidenceValue[a.confidence ?? "low"],
      )[0];
      const score = visible.length
        ? visible.reduce(
            (sum, f) => sum + confidenceValue[f.confidence ?? "low"],
            0,
          ) / visible.length
        : 0;
      return { ...area, items, concluded, visible, best, score };
    })
    .filter((group) => group.items.some((f) => f.status !== "missing"));
  return (
    <div className="areas">
      {groups.map(
        ({ id, label, Icon, concluded, visible, best, score, items }) => {
          const locked = concluded.length > visible.length;
          const research = items.filter((f) => f.status === "research").length;
          return (
            <button
              key={id}
              className={`area${selected === id ? " active" : ""}`}
              aria-pressed={selected === id}
              onClick={() => (id === "medicines" ? onOpenPass() : onSelect(id))}
            >
              <span className="area-top">
                <Icon size={16} />
                <span>{label}</span>
                {id === "medicines" && <ArrowRight size={14} />}
              </span>
              <strong>
                {best
                  ? resultText(best.conclusion!)
                  : locked
                    ? t("Gesperrt, bis du medizinische Befunde einschaltest")
                    : t("Bisher nur Studienbezüge")}
              </strong>
              <span className="area-meta">
                {visible.length}{" "}
                {visible.length === 1
                  ? t("Schlussfolgerung")
                  : t("Schlussfolgerungen")}
                {locked &&
                  ` · ${concluded.length - visible.length} ${t("gesperrt")}`}
                {research > 0 &&
                  ` · ${research} ${research === 1 ? t("Studienbezug") : t("Studienbezüge")}`}
              </span>
              <span className="area-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(score * 100)}%` }} />
              </span>
            </button>
          );
        },
      )}
    </div>
  );
}

/** The logo as a map: areas are sectors, confidence pulls a conclusion toward the nucleus. */
export function NucleusRadar({
  findings,
  showMedical,
  selected,
  onOpen,
  onSelectArea,
}: {
  findings: Finding[];
  showMedical: boolean;
  selected?: string;
  onOpen: (finding: Finding) => void;
  onSelectArea: (area: AreaId) => void;
}) {
  const present = areas().filter((area) =>
    findings.some((f) => areaOf(f) === area.id && f.status !== "missing"),
  );
  const size = 300;
  const center = size / 2;
  const outer = 118;
  const ringFor = (f: Finding) => {
    if (!f.conclusion) return 0.95;
    return { high: 0.42, moderate: 0.64, low: 0.84 }[f.confidence ?? "low"];
  };
  const sector = (2 * Math.PI) / Math.max(present.length, 1);
  return (
    <svg
      className="radar"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t("Kern-Radar deiner Schlussfolgerungen")}
    >
      {[0.42, 0.64, 0.84, 1].map((r) => (
        <circle
          key={r}
          className="ring"
          cx={center}
          cy={center}
          r={outer * r}
        />
      ))}
      {present.map((area, index) => {
        const angle = -Math.PI / 2 + index * sector;
        const mid = angle + sector / 2;
        const items = findings.filter(
          (f) => areaOf(f) === area.id && f.status !== "missing",
        );
        return (
          <g key={area.id}>
            <line
              className="spoke"
              x1={center}
              y1={center}
              x2={center + Math.cos(angle) * outer}
              y2={center + Math.sin(angle) * outer}
            />
            <text
              className="sector-label"
              x={center + Math.cos(mid) * (outer + 26)}
              y={center + Math.sin(mid) * (outer + 26)}
              textAnchor="middle"
              dominantBaseline="middle"
              onClick={() => onSelectArea(area.id)}
            >
              {area.label.split(" ")[0]}
            </text>
            {items.map((f, i) => {
              const hidden = isMedical(f) && !showMedical;
              const spread = sector * 0.7;
              const a = mid - spread / 2 + (spread * (i + 0.5)) / items.length;
              const r = outer * (hidden ? 0.95 : ringFor(f));
              const kind = hidden
                ? "hidden"
                : f.conclusion
                  ? "concluded"
                  : "research";
              return (
                <circle
                  key={f.id}
                  className={`dot ${kind}${selected === f.id ? " selected" : ""}`}
                  cx={center + Math.cos(a) * r}
                  cy={center + Math.sin(a) * r}
                  r={selected === f.id ? 6.5 : 5}
                  onClick={() => onOpen(f)}
                >
                  <title>
                    {resultText(f.title)}
                    {!hidden && f.conclusion
                      ? ` · ${resultText(f.conclusion)}`
                      : ""}
                  </title>
                </circle>
              );
            })}
          </g>
        );
      })}
      <circle className="core-ring" cx={center} cy={center} r={22} />
      <circle className="core-dot" cx={center + 6} cy={center + 6} r={7} />
    </svg>
  );
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9*]+/g, " ")
    .trim();
/** An answer requires an exact documented question or an unambiguous catalog topic. */
export function answer(query: string, findings: Finding[]) {
  const asked = normalize(query);
  if (!asked) return undefined;
  const matches = (terms: string[]) => terms.some((term) =>
    normalize(term) === asked || normalize(resultText(term)) === asked,
  );
  const topics = findings.filter((finding) =>
    matches([finding.title, ...(finding.questions ?? [])]),
  );
  if (topics.length) return topics.length === 1 ? topics[0] : undefined;
  const markers = findings.filter((finding) =>
    matches(finding.checks.flatMap((check) => [check.id, ...check.gene.split(" / ")])),
  );
  return markers.length === 1 ? markers[0] : undefined;
}

export function AskDna({
  findings,
  showMedical,
  onShowMedical,
  onOpen,
}: {
  findings: Finding[];
  showMedical: boolean;
  onShowMedical: () => void;
  onOpen: (finding: Finding) => void;
}) {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState<{ findingId?: string }>();
  const suggestions = useMemo(
    () =>
      findings
        .filter(
          (f) =>
            f.questions?.length &&
            f.conclusion &&
            (showMedical || !isMedical(f)),
        )
        .slice(0, 4)
        .map((f) => ({ question: resultText(f.questions![0]), finding: f })),
    // The language changes the question text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, showMedical, getLanguage()],
  );
  function ask(value: string, finding?: Finding) {
    setQuery(value);
    setAsked({ findingId: (finding ?? answer(value, findings))?.id });
  }
  const found = findings.find((finding) => finding.id === asked?.findingId);
  const hidden = found && isMedical(found) && !showMedical;
  const conclusion = found && visibleConclusion(found, showMedical);
  return (
    <section className="ask" aria-label={t("Frag deine DNA")}>
      <h2>{t("Frag deine DNA")}</h2>
      <p className="ask-help">{t("Die Suche gleicht deine Frage mit lokalen Katalogregeln ab.")}</p>
      <form
        className="ask-field"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) ask(query.trim());
        }}
      >
        <Search size={16} />
        <input
          id="ask-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Zum Beispiel: Vertrage ich Milch?")}
          aria-label={t("Frage an deine DNA")}
        />
        <button
          className="button compact"
          type="submit"
          disabled={!query.trim()}
        >
          {t("Fragen")}
        </button>
      </form>
      <div className="chips">
        {suggestions.map(({ question, finding }) => (
          <button key={finding.id} onClick={() => ask(question, finding)}>
            {question}
          </button>
        ))}
      </div>
      {asked && (
        <div className="ask-answer" role="status">
          {!found && (
            <p>
              {t(
                "Dazu gibt es noch keine Regel im Katalog. Versuche es mit einem Merkmal, einem Gen oder einer der Fragen oben.",
              )}
            </p>
          )}
          {found && (
            <>
              <span className="ask-topic">{resultText(found.title)}</span>
              {conclusion && <strong>{conclusion}</strong>}
              {conclusion && <p>{resultText(found.limits)}</p>}
              {hidden && (
                <p>
                  {t(
                    "Die Antwort ist ein medizinischer Befund und ist ausgeblendet.",
                  )}{" "}
                  <button className="text-button" onClick={onShowMedical}>
                    {t("Medizinische Befunde anzeigen")}
                  </button>
                </p>
              )}
              {!conclusion && !hidden && (
                <p>
                  {t(
                    "Zu dieser Frage kann deine Datei noch keine Schlussfolgerung stützen.",
                  )}{" "}
                  {resultText(found.message)}
                  {" "}{found.checks.filter((check) => !check.call)
                    .map((check) => `${check.id} (${resultText(check.status)})`).join(" · ")}
                </p>
              )}
              <span className="ask-foot">
                {found.confidence && !hidden && (
                  <ConfidenceMeter value={found.confidence} />
                )}
                <button className="text-button" onClick={() => onOpen(found)}>
                  {t("Details und Quellen")} <ArrowRight size={13} />
                </button>
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
