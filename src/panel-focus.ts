import { useLayoutEffect, useRef, type RefObject } from "react";

export function usePanelFocus(
  panel: RefObject<HTMLElement | null>,
  active: boolean,
  modal: boolean,
  onClose: () => void,
) {
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const region = panel.current;
    if (!active || !region) return;
    const returnTo = document.activeElement;
    const controls = () => [...region.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
    )].filter((element) => element.getClientRects().length > 0);
    (region.querySelector<HTMLElement>("[data-initial-focus]") ?? region).focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab" || !modal) return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if ((!event.shiftKey && document.activeElement === last)
        || (event.shiftKey && (document.activeElement === first || document.activeElement === region))) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
    region.addEventListener("keydown", keydown);
    return () => {
      region.removeEventListener("keydown", keydown);
      if (returnTo instanceof HTMLElement && returnTo.isConnected) {
        queueMicrotask(() => {
          if (document.activeElement === document.body) returnTo.focus({ preventScroll: true });
        });
      }
    };
  }, [panel, active, modal]);
}
