// The one dropdown for the whole app — v2. The trigger was already skinned,
// but the OPEN list of a native <select> is OS-rendered chrome that CSS can
// never fully style (the "ugly default bar"). So the popup is now our own
// listbox, with the full keyboard contract (arrows, Home/End, Enter/Space,
// Escape, typeahead) and ARIA roles. The API is unchanged: value, onChange
// (receives an event-shaped { target: { value } }), and <option> children.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

function itemsFromChildren(children) {
  const items = [];
  React.Children.forEach(children, (child) => {
    if (!child || child.type !== "option") return;
    items.push({ value: String(child.props.value), label: child.props.children });
  });
  return items;
}

export default function StyledSelect({ value, onChange, children, wrapClassName = "", wrapStyle, style, title, disabled, "aria-label": ariaLabel, ...rest }) {
  const items = useMemo(() => itemsFromChildren(children), [children]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const typeaheadRef = useRef({ text: "", at: 0 });
  const selectedIndex = Math.max(0, items.findIndex((item) => item.value === String(value)));
  const selected = items[selectedIndex] || items[0];

  function choose(index) {
    const item = items[index];
    if (!item) return;
    setOpen(false);
    if (item.value !== String(value)) onChange?.({ target: { value: item.value } });
    rootRef.current?.querySelector("button")?.focus();
  }

  function openList() {
    if (disabled || !items.length) return;
    setHighlight(selectedIndex);
    setOpen(true);
  }

  function onKeyDown(event) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(highlight); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((h) => Math.min(items.length - 1, h + 1)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); return; }
    if (event.key === "Home") { event.preventDefault(); setHighlight(0); return; }
    if (event.key === "End") { event.preventDefault(); setHighlight(items.length - 1); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    // typeahead: jump to the first label starting with what was typed
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const now = Date.now();
      const state = typeaheadRef.current;
      state.text = now - state.at < 700 ? state.text + event.key.toLowerCase() : event.key.toLowerCase();
      state.at = now;
      const hit = items.findIndex((item) => String(item.label).toLowerCase().startsWith(state.text));
      if (hit >= 0) setHighlight(hit);
    }
  }

  // close on outside pointerdown; keep the highlighted row scrolled into view
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  return (
    <span className={`sh-select ${open ? "open" : ""} ${wrapClassName}`} style={wrapStyle} ref={rootRef}>
      <button
        type="button"
        className="sh-select-trigger"
        style={style}
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        {...rest}
      >
        <span className="sh-select-value">{selected?.label ?? ""}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="sh-select-pop" role="listbox" aria-label={ariaLabel} ref={listRef}>
          {items.map((item, index) => (
            <button
              type="button"
              key={item.value}
              role="option"
              aria-selected={item.value === String(value)}
              className={`${index === highlight ? "hl" : ""} ${item.value === String(value) ? "sel" : ""}`}
              onPointerEnter={() => setHighlight(index)}
              onClick={() => choose(index)}
            >
              <span>{item.label}</span>
              {item.value === String(value) && <Check size={13} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
