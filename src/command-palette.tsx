import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { t } from "./locale";

export type Command = {
  id: string;
  label: string;
  hint: string;
  keywords?: string;
  run: () => void;
};

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
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands
      .filter((command) => {
        const text =
          `${command.label} ${command.hint} ${command.keywords ?? ""}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .slice(0, 40);
  }, [commands, query]);
  useLayoutEffect(() => {
    const popup = dialog.current!;
    popup.showModal();
    input.current?.focus();
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
      onMouseDown={(event) => {
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
          <ul ref={list} id="palette-results" role="listbox">
            {results.map((command, index) => (
              <li key={command.id}>
                <button
                  id={`palette-${index}`}
                  data-index={index}
                  role="option" tabIndex={-1}
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(index)}
                >
                  <span>{command.label}</span>
                  <span>{command.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="none">{t("Keine Treffer.")}</p>
        )}
      </div>
    </dialog>
  );
}
