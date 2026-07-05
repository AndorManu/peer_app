// The Peer mark — the alchemical "squaring the circle": a circle, an
// inscribed equilateral triangle (apex up, vertices on the circle), a square
// inscribed in the triangle, and one small circle at the square's center.
// Transformation, a path inward, interlocking parts — said with geometry,
// not ornament. Precise construction: circle r44; triangle vertices at 90°,
// 210°, 330°; square side = s(2√3−3) sitting on the triangle's base.
// currentColor throughout so every theme wears it natively (mono most of
// all). `bold` switches to the heavier small-size cut where thin nested
// lines would turn to mud; it defaults on below 26px.
import React from "react";

export default function PeerLogo({ size = 28, bold }) {
  const heavy = bold ?? size < 26;
  const sw = heavy ? 6.5 : 3;
  return (
    <svg
      className="peer-logo-mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth={sw} />
      <path d="M50 6 L88.105 72 L11.895 72 Z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
      <rect x="32.315" y="36.63" width="35.37" height="35.37" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
      {heavy
        ? <circle cx="50" cy="54.315" r="8" fill="currentColor" />
        : <circle cx="50" cy="54.315" r="6.5" stroke="currentColor" strokeWidth={sw} />}
    </svg>
  );
}
