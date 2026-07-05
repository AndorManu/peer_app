// Peer — Visual Identity Rebuild · primary navigation
// Desktop/tablet: left vertical rail with a gradient pill that slides to the
// active item. Mobile (≤760px, via .peer-rail CSS): a fixed bottom nav bar.
// Real <nav>/<button> semantics: keyboard focusable, aria-current on the
// active view. Wired to the existing `view` / `setView` routing.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

// design rail order; `key` is the app's `view` routing key
const NAV_ITEMS = [
  { key: "chat", label: "Chat", d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { key: "brain", label: "Brain", d: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" },
  { key: "code", label: "Code", d: "M16 18l6-6-6-6M8 6l-6 6 6 6" },
  { key: "notes", label: "Notes", d: "M4 4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM14 2v6h6M8 13h8M8 17h5" },
  { key: "flashcards", label: "Cards", d: "M3 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 5V3h12a2 2 0 0 1 2 2v12h-2" },
  { key: "community", label: "Rooms", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
];

function initialsOf(account) {
  const name = (account?.name || "").trim();
  if (!name) return "Me";
  const parts = name.split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "Me";
}

export default function PeerNavRail({ view, setView, account, onAvatar }) {
  const listRef = useRef(null);
  const [pill, setPill] = useState({ top: 0, height: 0 });

  // measure the active item and slide the pill to it (desktop rail only —
  // the pill is hidden by CSS in the mobile bottom-nav layout)
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector(`[data-nav="${view}"]`);
    if (el) setPill({ top: el.offsetTop, height: el.offsetHeight });
  }, [view]);

  useEffect(() => {
    const onResize = () => {
      const el = listRef.current?.querySelector(`[data-nav="${view}"]`);
      if (el) setPill({ top: el.offsetTop, height: el.offsetHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [view]);

  return (
    <nav className="peer-rail" aria-label="Primary">
      {/* floating logo */}
      <div className="peer-rail-logo" aria-hidden="true">
        <div className="peer-rail-logo-mark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#0b0b16">
            <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
          </svg>
        </div>
        <div className="peer-rail-logo-word">Peer</div>
      </div>

      {/* nav list with gliding gradient pill */}
      <div ref={listRef} className="peer-rail-list">
        <span
          className="peer-rail-pill"
          aria-hidden="true"
          style={{ top: pill.top, height: pill.height || 48, opacity: pill.height ? 1 : 0 }}
        />
        {NAV_ITEMS.map((item) => {
          const active = view === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`peer-rail-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => setView(item.key)}
            >
              <span className="peer-rail-icon" data-nav={item.key}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={item.d} />
                </svg>
              </span>
              <span className="peer-rail-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* bottom cluster: settings gear + avatar (profile) */}
      <div className="peer-rail-bottom">
        <button
          type="button"
          className={`peer-rail-item peer-rail-settings${view === "settings" ? " active" : ""}`}
          aria-current={view === "settings" ? "page" : undefined}
          aria-label="Settings"
          onClick={() => setView("settings")}
        >
          <span className="peer-rail-icon"><Settings size={20} strokeWidth={1.7} aria-hidden="true" /></span>
          <span className="peer-rail-label">Settings</span>
        </button>
        <button
          type="button"
          className={`peer-rail-item peer-rail-profile${view === "profile" ? " active" : ""}`}
          aria-current={view === "profile" ? "page" : undefined}
          aria-label={`Profile — ${account?.name || "learner"}`}
          onClick={onAvatar}
        >
          <span className="peer-rail-avatar">{initialsOf(account)}</span>
          <span className="peer-rail-label">Profile</span>
        </button>
      </div>
    </nav>
  );
}
