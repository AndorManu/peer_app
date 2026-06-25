// Peer — Visual Identity Rebuild · left vertical nav rail
// Ported from Peer.dc.html (NAV RAIL block). Floating gradient logo, a gradient
// pill that measures the active item and slides to it, avatar at the bottom.
// Wired to the existing `view` / `setView` routing — design keys map to app keys.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COLORS, GRADIENTS, EASE, SHADOW, SURFACE } from "../peerTheme.js";

// design rail order; `key` is the app's `view` routing key
const NAV_ITEMS = [
  { key: "chat", label: "Chat", d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { key: "brain", label: "Brain", d: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" },
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

  // measure the active item and slide the pill to it (matches the design's measure())
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
    <div
      style={{
        position: "relative",
        zIndex: 40,
        width: 78,
        flex: "0 0 78px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 0 22px",
        background: SURFACE.s025,
        backdropFilter: "blur(34px)",
        WebkitBackdropFilter: "blur(34px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* floating logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, marginBottom: 26 }}>
        <div
          style={{
            width: 38, height: 38, borderRadius: 13, background: GRADIENTS.accent140,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: SHADOW.glowViolet, animation: "pfloat 6s ease-in-out infinite",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#0b0b16">
            <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
          </svg>
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: ".5px", color: COLORS.text50 }}>
          Peer
        </div>
      </div>

      {/* nav list with gliding gradient pill */}
      <div ref={listRef} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
        <div
          style={{
            position: "absolute", left: 15, top: pill.top, width: 48, height: pill.height || 48,
            borderRadius: 14, background: GRADIENTS.accent155, boxShadow: SHADOW.navPill,
            transition: `top .3s ${EASE}`, opacity: pill.height ? 1 : 0, pointerEvents: "none", zIndex: 1,
          }}
        />
        {NAV_ITEMS.map((item) => {
          const active = view === item.key;
          return (
            <div
              key={item.key}
              onClick={() => setView(item.key)}
              style={{
                position: "relative", zIndex: 2, display: "flex", flexDirection: "column",
                alignItems: "center", gap: 5, width: "100%", cursor: "pointer", userSelect: "none",
              }}
            >
              <div
                data-nav={item.key}
                style={{
                  width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center",
                  justifyContent: "center", color: active ? "#fff" : COLORS.text42,
                  transition: `color .25s ${EASE}`,
                }}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.d} />
                </svg>
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: ".3px", color: active ? COLORS.text : COLORS.text40, transition: "color .25s" }}>
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* avatar */}
      <div
        onClick={onAvatar}
        title="Profile & settings"
        style={{
          marginTop: "auto", width: 34, height: 34, borderRadius: 999, background: GRADIENTS.avatarWarm,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600,
          color: "#0b0b16", boxShadow: "0 0 16px -3px rgba(251,113,133,.7)", cursor: "pointer",
        }}
      >
        {initialsOf(account)}
      </div>
    </div>
  );
}
