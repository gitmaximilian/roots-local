import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import { resultText, t } from "./locale";
import type { Confidence, Finding, MarkerCheck, Status } from "./types";
import { usePanelFocus } from "./panel-focus";

export const statusLabels = () => ({
  personal: t("Ergebnis"),
  research: t("Nur Studienhinweis"),
  missing: t("Ohne Ergebnis"),
});

/** Short explanations for terms people meet for the first time. */
const terms = () => ({
  genotype: t("Die zwei Buchstaben an einer Stelle deiner DNA, je einer von jedem Elternteil."),
  locus: t("Eine Stelle im Genom, die in einer Studie mit dem Merkmal zusammenhing."),
  percentile: t("Wie viel Prozent der Studienpopulation einen niedrigeren Score haben."),
});

/** A term with a short explanation that opens on click or tap. */
export function Term({ name, children }: { name: keyof ReturnType<typeof terms>; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="term">
      <button type="button" aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}>
        {children}
      </button>
      {open && <span role="tooltip" id={id}>{terms()[name]}</span>}
    </span>
  );
}

/** The coarse range of a score, from the same cut-offs as the conclusion text. */
export function scoreBand(z: number) {
  return z <= -1.2816 ? 0 : z <= -0.5244 ? 1 : z < 0.5244 ? 2 : z < 1.2816 ? 3 : 4;
}
const BANDS: [number, number][] = [[0, 10], [10, 30], [30, 70], [70, 90], [90, 100]];
const bandLabels = () => [
  t("untere 10 %"),
  t("10–30 %"),
  t("mittlerer Bereich, 30–70 %"),
  t("70–90 %"),
  t("obere 10 %"),
];
/** A few words on what the range means for this kind of trait. */
export function scoreDirection(score: NonNullable<Finding["score"]>) {
  if (score.z == null) return "";
  const band = scoreBand(score.z);
  if (band === 2) return t("im Mittelfeld");
  const higher = band > 2;
  if (score.disease) return higher ? t("eher höhere Veranlagung") : t("eher niedrigere Veranlagung");
  return higher ? t("eher höhere Werte") : t("eher niedrigere Werte");
}

export function StatusLabel({ status }: { status: Status }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {statusLabels()[status]}
    </span>
  );
}

const confidenceLevel: Record<Confidence, number> = {
  high: 3,
  moderate: 2,
  low: 1,
};

export function ConfidenceMeter({ value }: { value: Confidence }) {
  const label = {
    high: t("Hohe Sicherheit"),
    moderate: t("Mittlere Sicherheit"),
    low: t("Geringe Sicherheit"),
  }[value];
  return (
    <span className="confidence" title={t("Einstufung der Katalogregel, keine persönliche Wahrscheinlichkeit.")}>
      <b aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= confidenceLevel[value] ? "on" : ""} />
        ))}
      </b>
      {label}
    </span>
  );
}

/** Position of a genetic score in the study population, as a coarse range. */
export function ScoreMeter({ score }: { score: NonNullable<Finding["score"]> }) {
  const band = score.z == null ? null : scoreBand(score.z);
  return (
    <div className="score-meter">
      {band !== null && (
        <>
          <div className="track" aria-hidden="true">
            <span className="range" style={{ left: `${BANDS[band][0]}%`, width: `${BANDS[band][1] - BANDS[band][0]}%` }} />
            <span className="tick" style={{ left: "50%" }} />
          </div>
          <div className="scale" aria-hidden="true">
            <span>{t("niedriger")}</span>
            <span>{t("Mitte")}</span>
            <span>{t("höher")}</span>
          </div>
          <p>
            {t("Geschätzter Bereich")}: <b>{bandLabels()[band]}</b> · {scoreDirection(score)}
          </p>
          <p className="muted">
            {t("Grobe Schätzung mit geringer Sicherheit. Ein")}{" "}
            <Term name="percentile">{t("Perzentil")}</Term>{" "}
            {t("von 90 hieße: 90 % der Studienpopulation liegen darunter.")}
          </p>
        </>
      )}
      <p className="muted">
        {score.matched} / {score.total} <Term name="locus">{t("Genorte")}</Term>{" "}
        {t("des Scores sind in deiner Datei")} · GWAS Catalog {score.release}
      </p>
    </div>
  );
}

/** The most notable genetic scores, furthest from the middle first. */
export function ScoreOverview({
  findings,
  showMedical,
  onOpen,
}: {
  findings: Finding[];
  showMedical: boolean;
  onOpen: (finding: Finding) => void;
}) {
  const [all, setAll] = useState(false);
  const scored = findings.filter((f) => f.score?.z != null);
  const visible = scored
    .filter((f) => showMedical || !isMedical(f))
    .sort((a, b) => Math.abs(b.score!.z!) - Math.abs(a.score!.z!));
  if (!scored.length) return null;
  const hidden = scored.length - visible.length;
  const shown = all ? visible : visible.slice(0, 5);
  return (
    <section className="score-overview" aria-labelledby="score-heading">
      <header className="section-heading">
        <h2 id="score-heading">{t("Genetische Scores")}</h2>
      </header>
      <p className="muted">
        {scored.length} {t("Merkmale aus großen Studien, verglichen mit der Studienpopulation. Am weitesten von der Mitte zuerst. Jeder Score ist eine grobe Schätzung.")}
        {hidden > 0 && ` ${hidden} ${t("medizinische Scores sind ausgeblendet.")}`}
      </p>
      <ul>
        {shown.map((f) => {
          const band = scoreBand(f.score!.z!);
          return (
            <li key={f.id}>
              <button className="score-row" data-finding={f.id} onClick={() => onOpen(f)}>
                <span className="score-name">{resultText(f.title)}</span>
                <span className="mini-track" aria-hidden="true">
                  <i style={{ left: `${BANDS[band][0]}%`, width: `${BANDS[band][1] - BANDS[band][0]}%` }} />
                </span>
                <span className="score-read">
                  <span className="num">{bandLabels()[band]}</span>
                  <small>{scoreDirection(f.score!)}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length > 5 && (
        <button className="text-button more-findings" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? t("Weniger anzeigen") : `${t("Alle anzeigen")} (${visible.length})`}
        </button>
      )}
    </section>
  );
}

export const isMedical = (finding: Finding) =>
  Boolean(finding.clinical || finding.effect?.clinical);

/** The conclusion the user may see, respecting the medical opt-in. */
export function visibleConclusion(finding: Finding, showMedical: boolean) {
  if (!finding.conclusion) return null;
  if (isMedical(finding) && !showMedical) return null;
  return resultText(finding.conclusion);
}

export type OpenVariant = (finding: Finding, marker: MarkerCheck) => void;

export function Inspector({
  finding,
  showMedical,
  onShowMedical,
  onClose,
  openVariant,
  modal,
}: {
  finding: Finding;
  showMedical: boolean;
  onShowMedical: () => void;
  onClose: () => void;
  openVariant: OpenVariant;
  modal: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  usePanelFocus(panel, true, modal, onClose);
  const conclusion = visibleConclusion(finding, showMedical);
  const hidden = isMedical(finding) && !showMedical;
  return (
    <aside ref={panel} className="inspector" role={modal ? "dialog" : undefined}
      aria-modal={modal || undefined} aria-label={t("Befunddetails")} tabIndex={-1}>
      <header>
        <span>{t("Befund")}</span>
        <button type="button" data-initial-focus onClick={onClose} aria-label={t("Details schließen")}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="body">
        <div className="meta">
          <StatusLabel status={hidden ? "research" : finding.status} />
          {isMedical(finding) && (
            <span className="medical">{t("Medizinisch")}</span>
          )}
        </div>
        <h2>{resultText(finding.title)}</h2>
        {conclusion && <p className="answer">{conclusion}</p>}
        {hidden && (
          <div className="answer medical-hidden">
            <p>
              {t(
                "Dieser medizinische Befund ist ausgeblendet. Er stammt aus Verbraucherdaten und braucht eine Laborbestätigung.",
              )}
            </p>
            <button className="text-button" onClick={onShowMedical}>
              {t("Medizinische Befunde anzeigen")} <ArrowRight size={13} />
            </button>
          </div>
        )}
        {finding.confidence && !hidden && (
          <ConfidenceMeter value={finding.confidence} />
        )}
        {finding.score && !hidden && <ScoreMeter score={finding.score} />}
        <p>{resultText(finding.summary)}</p>
        {!hidden && (
          <p className="interpretation">{resultText(finding.message)}</p>
        )}
        <dl className="definition">
          <dt>{t("Evidenz")}</dt>
          <dd>{resultText(finding.evidence)}</dd>
          <dt>{t("Studienpopulation")}</dt>
          <dd>{resultText(finding.population)}</dd>
          <dt>{t("Grenzen")}</dt>
          <dd>{resultText(finding.limits)}</dd>
        </dl>
        <table className="marker-table">
          <thead>
            <tr>
              <th>Marker</th>
              <th><Term name="genotype">{t("Genotyp")}</Term></th>
              <th>{finding.score ? t("Wirkung") : t("Datenqualität")}</th>
            </tr>
          </thead>
          <tbody>
            {finding.checks.map((check) => (
              <tr key={check.id}>
                <td>
                  <button
                    className="text-button marker-link"
                    onClick={() => openVariant(finding, check)}
                    aria-label={`${t("Rohdaten durchsuchen")}: ${check.id}`}
                  >
                    {check.id} <ArrowRight size={12} />
                  </button>
                  <small>
                    {resultText(check.gene)}
                    {check.coordinate ? ` · ${check.coordinate}` : ""}
                  </small>
                </td>
                <td className="mono" data-label={t("Genotyp")}>{hidden ? "•••" : check.call || "–"}</td>
                <td data-label={finding.score ? t("Wirkung") : t("Datenqualität")}>{resultText(check.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SourceList sources={finding.sources} />
      </div>
    </aside>
  );
}


/** Sources as links that open in a new tab, with a copy button for the address. */
export function SourceList({ sources }: { sources: [string, string][] }) {
  const [copied, setCopied] = useState<string>();
  return (
    <div className="sources">
      <h3>{t("Quellen")}</h3>
      {sources.map(([label, url]) => (
        <div key={url}>
          <a href={url} target="_blank" rel="noopener noreferrer"
            title={t("Öffnet die Quelle in einem neuen Tab. Die Website sieht, welche Quelle du aufrufst.")}>
            {resultText(label)} <ExternalLink size={12} aria-hidden="true" />
          </a>
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
            {copied === url ? t("Adresse kopiert") : t("Adresse kopieren")}
          </button>
        </div>
      ))}
    </div>
  );
}
