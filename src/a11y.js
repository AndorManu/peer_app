// Small accessibility/responsive primitives shared across the app.
import { useEffect, useRef, useState } from "react";

// Reactive media query — re-renders only when the match flips.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// Focus trap for dialogs/drawers. Returns a ref for the container.
// While `active`: focus moves inside (preferring [data-autofocus]), Tab cycles
// within the container, Escape calls onEscape, and focus returns to the
// previously focused element when the trap deactivates.
export function useFocusTrap(active, { onEscape } = {}) {
  const ref = useRef(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    const previous = document.activeElement;
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE))
      .filter((el) => el.getClientRects().length > 0);

    const initial = node.querySelector("[data-autofocus]") || focusables()[0] || node;
    initial.focus?.();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [active]);

  return ref;
}
