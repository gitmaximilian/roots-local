import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { t } from "./locale";
import { highlight, prepare, search, type SearchGroup } from "./search";

export type Command = {
  id: string;
  label: string;
  hint: string;
  /** Extra searchable text such as the other language, questions, or a summary. */
  keywords?: string;
  /** Shown under the label, e.g. the conclusion of a finding. */
  detail?: string;
  group?: SearchGroup;
  genes?: string[];
  markers?: string[];
  run: () => void;
};

const GROUPS: [SearchGroup, () => string][] = [
  ["finding", () => t("Befunde")],
  ["question", () => t("Fragen an die DNA")],
  ["marker", () => t("Gene und Marker")],
  ["chapter", () => t("Kapitel")],
  ["command", () => t("Befehle und Ansichten")],
];

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((part, index) =>
        part.mark ? <mark key={index}>{part.text}</mark> : part.text,
      )}
    </>
  );
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const index = useMemo(
    () =>
      prepare(
        commands.map((command) => ({
          id: command.id,
          group: command.group ?? "command",
          value: command,
          genes: command.genes,
          markers: command.markers,
          fields: [
            { text: command.label, weight: 3 },
            { text: command.keywords ?? "", weight: 1.5 },
            { text: command.detail ?? "", weight: 1 },
            { text: command.hint, weight: 0.8 },
          ],
        })),
      ),
    [commands],
  );
  // Without a query, show questions and views to start from; otherwise rank
  // all entries and keep the groups in a fixed order.
  const results = useMemo(() => {
    const ranked = query.trim()
      ? search(query, index, 60).map((hit) => hit.doc.value)
      : commands.filter((c) => (c.group ?? "command") === "question").slice(0, 6)
          .concat(commands.filter((c) => (c.group ?? "command") === "command").slice(0, 8));
    const order = GROUPS.map(([group]) => group);
    const best = new Map<SearchGroup, number>();
    ranked.forEach((command, rank) => {
      const group = command.group ?? "command";
      if (!best.has(group)) best.set(group, rank);
    });
    return [...ranked]
      .map((command, rank) => ({ command, rank }))
      .sort((a, b) => {
        const ga = a.command.group ?? "command";
        const gb = b.command.group ?? "command";
        return ga === gb
          ? a.rank - b.rank
          : (best.get(ga)! - best.get(gb)!) || order.indexOf(ga) - order.indexOf(gb);
      })
      .map(({ command }) => command)
      .slice(0, 40);
  }, [commands, index, query]);
  useLayoutEffect(() => {
    const popup = dialog.current!;
    popup.showModal();
    input.current?.focus({ preventScroll: true });
    return () => popup.close();
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function choose(index: number) {
    const command = results[index];
    if (!command) return;
    onClose();
    command.run();
  }
  return (
    <dialog
      ref={dialog}
      className="palette-backdrop"
      aria-label={t("Befehle und Suche")}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        onKeyDown={(event) => {
          if (event.target !== input.current || !results.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(active);
          }
        }}
      >
        <div className="palette-field">
          <Search size={17} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Befund, Gen, rsID oder Befehl")}
            aria-label={t("Befund, Gen, rsID oder Befehl")}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={results.length ? "palette-results" : undefined}
            aria-activedescendant={results.length ? `palette-${active}` : undefined}
          />
          <button type="button" className="palette-close" onClick={onClose}
            aria-label={t("Suche schließen")}><X size={18} aria-hidden="true" /></button>
        </div>
        {results.length ? (
          <div ref={list} id="palette-results" role="listbox" aria-label={t("Suchergebnisse")}>
            {results.map((command, index) => {
              const group = command.group ?? "command";
              const heading =
                index === 0 || (results[index - 1].group ?? "command") !== group
                  ? GROUPS.find(([id]) => id === group)?.[1]()
                  : undefined;
              return (
                <div key={command.id} role="presentation">
                  {heading && <p className="palette-group" role="presentation">{heading}</p>}
                  <button
                    id={`palette-${index}`}
                    data-index={index}
                    role="option" tabIndex={-1}
                    aria-selected={index === active}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(index)}
                  >
                    <span className="palette-label">
                      <Marked text={command.label} query={query} />
                      {command.detail && (
                        <small><Marked text={command.detail} query={query} /></small>
                      )}
                    </span>
                    <span>{command.hint}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="none">
            {t("Keine Treffer.")}{" "}
            {t("Versuche ein Alltagswort wie Milch, Kaffee oder Blutverdünner, ein Gen oder eine rsID.")}
          </p>
        )}
      </div>
    </dialog>
  );
}
