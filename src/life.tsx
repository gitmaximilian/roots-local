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
import { count, getLanguage, resultText, t } from "./locale";
import { clearWinner, prepare, search } from "./search";
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
      const concluded = items.filter((f) => f.conclusion && f.method !== "score");
      const visible = concluded.filter((f) => showMedical || !isMedical(f));
      const scores = items.filter((f) => f.method === "score" && f.score?.z != null && (showMedical || !isMedical(f)));
      const hiddenScores = items.filter((f) => f.method === "score" && f.score?.z != null && isMedical(f) && !showMedical).length;
      const research = items.filter((f) => f.status === "research").length;
      const score = visible.length
        ? visible.reduce(
            (sum, f) => sum + confidenceValue[f.confidence ?? "low"],
            0,
          ) / visible.length
        : 0;
      return { ...area, items, concluded, visible, scores, hiddenScores, research, score };
    })
    .filter((group) => group.items.some((f) => f.status !== "missing"));
  return (
    <div className="areas">
      {groups.map(({ id, label, Icon, concluded, visible, scores, hiddenScores, research, score }) => {
        const locked = concluded.length - visible.length + hiddenScores;
        // The tile names the topics; the statements follow in the list below.
        const topics = visible
          .slice()
          .sort((a, b) => confidenceValue[b.confidence ?? "low"] - confidenceValue[a.confidence ?? "low"])
          .slice(0, 3)
          .map((f) => resultText(f.title));
        const parts = [
          visible.length > 0 && count(visible.length, "Ergebnis", "Ergebnisse"),
          scores.length > 0 && count(scores.length, "Score", "Scores"),
          research > 0 && count(research, "Studienhinweis", "Studienhinweise"),
          locked > 0 && `${locked} ${t("ausgeblendet")}`,
        ].filter(Boolean);
        return (
          <button
            key={id}
            className={`area${selected === id ? " active" : ""}`}
            aria-pressed={id === "medicines" ? undefined : selected === id}
            onClick={() => (id === "medicines" ? onOpenPass() : onSelect(id))}
          >
            <span className="area-top">
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
              {id === "medicines" && <ArrowRight size={14} aria-hidden="true" />}
            </span>
            <strong>
              {topics.length
                ? topics.join(", ")
                : locked
                  ? t("Ausgeblendet, bis du medizinische Befunde einschaltest")
                  : scores.length
                    ? t("Nur genetische Scores")
                    : t("Bisher nur Studienhinweise")}
            </strong>
            <span className="area-meta">{parts.join(" · ")}</span>
            <span className="area-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(score * 100)}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Conclusions as a compact list, grouped by life area when no area is chosen. */
export function ResultList({
  findings,
  showMedical,
  inspected,
  grouped,
  limit,
  onOpen,
}: {
  findings: Finding[];
  showMedical: boolean;
  inspected?: string;
  grouped: boolean;
  limit?: number;
  onOpen: (finding: Finding) => void;
}) {
  const [all, setAll] = useState(false);
  const order = areas().map((area) => area.id);
  const sorted = [...findings].sort(
    (a, b) =>
      order.indexOf(areaOf(a)) - order.indexOf(areaOf(b)) ||
      confidenceValue[b.confidence ?? "low"] - confidenceValue[a.confidence ?? "low"],
  );
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  const sections = grouped
    ? areas()
        .map((area) => ({ area, items: shown.filter((f) => areaOf(f) === area.id) }))
        .filter((entry) => entry.items.length)
    : [{ area: undefined, items: shown }];
  return (
    <div className="result-list">
      {sections.map(({ area, items }) => (
        <div className="result-group" key={area?.id ?? "all"}>
          {area && <h3>{area.label}</h3>}
          <ul>
            {items.map((finding) => (
              <li key={finding.id}>
                <button
                  data-finding={finding.id}
                  className={inspected === finding.id ? "active" : ""}
                  aria-pressed={inspected === finding.id}
                  onClick={() => onOpen(finding)}
                >
                  <span className="result-title">
                    {resultText(finding.title)}
                    {isMedical(finding) && <span className="medical">{t("Medizinisch")}</span>}
                  </span>
                  <span className="result-answer">{visibleConclusion(finding, showMedical)}</span>
                  {finding.confidence && <ConfidenceMeter value={finding.confidence} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {limit && sorted.length > limit && (
        <button className="text-button more-findings" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? t("Weniger anzeigen") : `${t("Alle anzeigen")} (${sorted.length})`}
        </button>
      )}
    </div>
  );
}

/** What the three kinds of points in the radar mean. */
export function RadarLegend() {
  return (
    <figcaption className="radar-legend">
      <span><i className="concluded" aria-hidden="true" />{t("Ergebnis")}</span>
      <span><i className="research" aria-hidden="true" />{t("Nur Studienhinweis")}</span>
      <span><i className="hidden" aria-hidden="true" />{t("Medizinisch, ausgeblendet")}</span>
      <small>{t("Je näher am Zentrum, desto höher die Einstufung der Katalogregel.")}</small>
    </figcaption>
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
  const size = 340;
  const center = size / 2;
  const outer = 112;
  const ringFor = (f: Finding) => {
    if (!f.conclusion) return 0.95;
    return { high: 0.42, moderate: 0.64, low: 0.84 }[f.confidence ?? "low"];
  };
  const sector = (2 * Math.PI) / Math.max(present.length, 1);
  return (
    <svg
      className="radar"
      // Room around the rings so the area labels stay inside the drawing.
      viewBox={`-36 -8 ${size + 72} ${size + 16}`}
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
        const inArea = findings.filter(
          (f) => areaOf(f) === area.id && f.status !== "missing",
        );
        // Hidden medical findings collapse into one point per area.
        const hiddenItems = inArea.filter((f) => isMedical(f) && !showMedical);
        const items = inArea.filter((f) => !(isMedical(f) && !showMedical));
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
              x={center + Math.cos(mid) * (outer + 30)}
              y={center + Math.sin(mid) * (outer + 30)}
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
                {hiddenItems.length > 0 && (
              <circle
                className="dot hidden"
                cx={center + Math.cos(mid) * outer * 0.95}
                cy={center + Math.sin(mid) * outer * 0.95}
                r={6}
                onClick={() => onSelectArea(area.id)}
              >
                <title>
                  {hiddenItems.length} {t("medizinische Befunde ausgeblendet.")}
                </title>
              </circle>
            )}
          </g>
        );
      })}
      <circle className="core-ring" cx={center} cy={center} r={22} />
      <circle className="core-dot" cx={center + 6} cy={center + 6} r={7} />
    </svg>
  );
}

/** Search documents for findings: both languages, questions, genes, and markers. */
function findingIndex(findings: Finding[]) {
  return prepare(
    findings.map((finding) => ({
      id: finding.id,
      group: "finding" as const,
      value: finding,
      genes: finding.checks.map((check) => check.gene),
      markers: finding.checks.map((check) => check.id),
      fields: [
        { text: `${finding.title} ${resultText(finding.title)}`, weight: 3 },
        {
          text: (finding.questions ?? []).flatMap((q) => [q, resultText(q)]).join(" "),
          weight: 2.5,
        },
        { text: `${finding.summary} ${resultText(finding.summary)}`, weight: 0.8 },
      ],
    })),
  );
}

/**
 * Finds the catalog rule a question is about. Returns an answer only when one
 * finding clearly ranks first; otherwise up to three candidates to choose from.
 * Every meaningful word of the question has to match the finding, so a
 * question about something the catalog does not cover gets no answer.
 */
export function answer(query: string, findings: Finding[]) {
  const hits = search(query, findingIndex(findings), 8);
  const winner = clearWinner(hits);
  return {
    finding: winner?.doc.value,
    options: winner ? [] : hits.slice(0, 3).map((hit) => hit.doc.value),
  };
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
  const [asked, setAsked] = useState<{ findingId?: string; options: string[] }>();
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
    const result = finding ? { finding, options: [] } : answer(value, findings);
    setAsked({ findingId: result.finding?.id, options: result.options.map((f) => f.id) });
  }
  const found = findings.find((finding) => finding.id === asked?.findingId);
  const hidden = found && isMedical(found) && !showMedical;
  const conclusion = found && visibleConclusion(found, showMedical);
  return (
    <section className="ask" aria-label={t("Frag deine DNA")}>
      <h2>{t("Frag deine DNA")}</h2>
      <p className="ask-help">{t("Stell eine Alltagsfrage, etwa zu Milch, Kaffee oder Sonne. Die Antwort zeigt, was deine Datei dazu hergibt und wo die Grenzen liegen.")}</p>
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
          {!found && asked.options.length > 0 && (
            <>
              <p>{t("Meintest du eines dieser Themen?")}</p>
              <div className="chips">
                {asked.options
                  .map((id) => findings.find((finding) => finding.id === id))
                  .filter((finding): finding is Finding => !!finding)
                  .map((finding) => (
                    <button key={finding.id} onClick={() => ask(query, finding)}>
                      {resultText(finding.title)}
                    </button>
                  ))}
              </div>
            </>
          )}
          {!found && asked.options.length === 0 && (
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
