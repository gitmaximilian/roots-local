import { useMemo, useState } from "react";
import { resultText, t } from "./locale";
import { StatusLabel, isMedical } from "./finding-ui";
import type { Finding, Status } from "./types";

// Chromosome lengths in Mb and approximate centromere midpoints (UCSC).
const GRCH37: Record<string, [number, number]> = {
  "1": [249.25, 125],
  "2": [243.2, 93.3],
  "3": [198.02, 91],
  "4": [191.15, 50.4],
  "5": [180.92, 48.4],
  "6": [171.12, 61],
  "7": [159.14, 59.9],
  "8": [146.36, 45.6],
  "9": [141.21, 49],
  "10": [135.53, 40.2],
  "11": [135.01, 53.7],
  "12": [133.85, 35.8],
  "13": [115.17, 17.9],
  "14": [107.35, 17.6],
  "15": [102.53, 19],
  "16": [90.35, 36.6],
  "17": [81.2, 24],
  "18": [78.08, 17.2],
  "19": [59.13, 26.5],
  "20": [63.03, 27.5],
  "21": [48.13, 13.2],
  "22": [51.3, 14.7],
  X: [155.27, 60.6],
  Y: [59.37, 12.5],
};
const GRCH38: Record<string, [number, number]> = {
  "1": [248.96, 123.4],
  "2": [242.19, 93.9],
  "3": [198.3, 90.9],
  "4": [190.21, 50],
  "5": [181.54, 48.8],
  "6": [170.81, 59.8],
  "7": [159.35, 60.1],
  "8": [145.14, 45.2],
  "9": [138.39, 43],
  "10": [133.8, 39.8],
  "11": [135.09, 53.4],
  "12": [133.28, 35.5],
  "13": [114.36, 17.7],
  "14": [107.04, 17.2],
  "15": [101.99, 19],
  "16": [90.34, 36.8],
  "17": [83.26, 25.1],
  "18": [80.37, 18.5],
  "19": [58.62, 26.2],
  "20": [64.44, 28.1],
  "21": [46.71, 12],
  "22": [50.82, 15],
  X: [156.04, 60.6],
  Y: [57.23, 10.4],
};
const ORDER = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "X",
  "Y",
];

type Placed = {
  finding: Finding;
  chromosome: string;
  position: number;
  marker: string;
  status: Status;
};

export function Atlas({
  findings,
  build,
  showMedical,
  selected,
  onOpen,
}: {
  findings: Finding[];
  build: string | null;
  showMedical: boolean;
  selected?: string;
  onOpen: (finding: Finding) => void;
}) {
  const sizes = build === "GRCh38" ? GRCH38 : GRCH37;
  const placed = useMemo(() => {
    const out: Placed[] = [];
    for (const finding of findings) {
      for (const check of finding.checks) {
        const [chromosome, position] = (check.coordinate ?? "").split(":");
        if (!sizes[chromosome] || !Number(position)) continue;
        const hidden = isMedical(finding) && !showMedical;
        out.push({
          finding,
          chromosome,
          position: Number(position) / 1e6,
          marker: check.id,
          status:
            hidden && finding.status === "personal"
              ? "research"
              : finding.status,
        });
      }
    }
    return out;
  }, [findings, sizes, showMedical]);
  const [chromosome, setChromosome] = useState(
    () => placed[0]?.chromosome ?? "1",
  );
  const width = 640;
  const column = width / 12;
  const rowHeight = 150;
  const scale = (rowHeight - 20) / sizes["1"][0];
  const here = placed.filter((item) => item.chromosome === chromosome);
  if (!build) {
    return (
      <div className="empty">
        {t(
          "Ohne bekanntes Referenzgenom lassen sich Marker nicht auf Chromosomen platzieren.",
        )}
      </div>
    );
  }
  return (
    <div className="atlas">
      <div className="atlas-board">
        <svg
          viewBox={`0 0 ${width} ${rowHeight * 2 + 30}`}
          role="img"
          aria-label={t("Karyogramm mit Katalogmarkern")}
        >
          {ORDER.map((name, index) => {
            const [length, centromere] = sizes[name];
            const x = (index % 12) * column + column / 2 - 6;
            const y = 8 + Math.floor(index / 12) * (rowHeight + 22);
            const height = length * scale;
            const notch = y + centromere * scale;
            return (
              <g key={name}>
                <rect
                  className={`chromosome${name === chromosome ? " selected" : ""}`}
                  x={x}
                  y={y}
                  width={12}
                  height={height}
                  rx={6}
                  onClick={() => setChromosome(name)}
                >
                  <title>
                    {t("Chromosom")} {name}
                  </title>
                </rect>
                <path
                  d={`M${x - 0.5} ${notch - 2.5} l6.5 2.5 l6.5 -2.5 v5 l-6.5 -2.5 l-6.5 2.5 z`}
                  fill="var(--surface)"
                  pointerEvents="none"
                />
                <text
                  className="label"
                  x={x + 6}
                  y={y + height + 13}
                  textAnchor="middle"
                >
                  {name}
                </text>
                {placed
                  .filter((item) => item.chromosome === name)
                  .map((item) => {
                    const my = y + item.position * scale;
                    return (
                      <g
                        key={`${item.finding.id}-${item.marker}`}
                        className={`marker ${item.status}`}
                        onClick={() => {
                          setChromosome(name);
                          onOpen(item.finding);
                        }}
                      >
                        <title>
                          {resultText(item.finding.title)} · {item.marker}
                        </title>
                        <line
                          x1={x - 3}
                          x2={x + 15}
                          y1={my}
                          y2={my}
                          strokeWidth={2}
                        />
                        <circle
                          cx={x + 20}
                          cy={my}
                          r={item.finding.id === selected ? 4.2 : 3}
                          strokeWidth={1.5}
                        />
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </svg>
        <div className="atlas-legend">
          <StatusLabel status="personal" />
          <StatusLabel status="research" />
          <StatusLabel status="missing" />
          <span>
            {build} · {t("Zentromere schematisch")}
          </span>
        </div>
      </div>
      <aside className="atlas-side" aria-live="polite">
        <h2>
          {t("Chromosom")} {chromosome}
        </h2>
        {here.length ? (
          here.map((item) => (
            <button
              key={`${item.finding.id}-${item.marker}`}
              onClick={() => onOpen(item.finding)}
            >
              <StatusLabel status={item.status} />
              <strong>{resultText(item.finding.title)}</strong>
              <span className="mono">
                {item.marker} ·{" "}
                {Math.round(item.position * 1e6).toLocaleString()}
              </span>
            </button>
          ))
        ) : (
          <small>{t("Auf diesem Chromosom liegen keine Katalogmarker.")}</small>
        )}
      </aside>
    </div>
  );
}
