import { useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { resultText, t } from "./locale";
import type { Confidence, Finding, MarkerCheck, Status } from "./types";
import { usePanelFocus } from "./panel-focus";

export const statusLabels = () => ({
  personal: t("Auswertbar"),
  research: t("Studienbezug"),
  missing: t("Offen"),
});

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
  const [copied, setCopied] = useState<string>();
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
        <table>
          <thead>
            <tr>
              <th>Marker</th>
              <th>{t("Genotyp")}</th>
              <th>{t("Datenqualität")}</th>
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
                <td className="mono">{hidden ? "•••" : check.call || "–"}</td>
                <td>{resultText(check.status)}</td>
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
    </aside>
  );
}
