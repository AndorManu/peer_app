// Exhaustive color-literal scanner: every hex/rgb()/rgba() in CSS + JSX that
// is NOT part of a var() fallback or a blessed semantic/data-viz color.
const fs = require("fs");
const path = require("path");

// Colors that are INTENTIONALLY fixed across themes (documented):
const BLESSED = new Set([
  // pure neutrals / shadows
  "#fff", "#ffffff", "#000", "#000000",
  // domain/data-viz identity colors (subjects.js taxonomy + brain node types + badges)
  "#3f8f74", "#c96a5a", "#c9a875", "#8a95a3", "#b57ba6", "#2dd4bf", "#b98a63",
  "#6fa8c9", "#d4b283", "#a9b3bf", "#e8ab9e", "#b3d4ea", "#e3d2b3", "#9ccfb8",
  "#dbbc9e", "#d9b3cc", "#c2ccd6", "#f0d9a8", "#f0c987",
  // semantic status
  "#e25555", "#d64545", // danger reds if present
  // theme DEFINITIONS (the studyhall/indigo/mono blocks + brand icon)
  "#15120d", "#1c1811", "#221d15", "#2a241a", "#0c0a07", "#f4e8d5", "#e0a039", "#f0b354", "#1c1509",
  "#05060e", "#0a0c1a", "#101326", "#151932", "#1c2140", "#e8e8f6", "#8b7cf7", "#22d3ee", "#0a0618",
  "#0a0a0a", "#101010", "#161616", "#1e1e1e", "#f2f2f2",
  // light theme warm paper family
  "#faf6ee", "#fffdf8", "#f3ecdd", "#ece3d0", "#2a2318", "#746a58", "#e5dcc9", "#7a5a1e", "#8a5a14",
  // semantic status tones (danger stays red / success stays green in all themes)
  "#d98a7c", "#7fc4a8", "#c53a30",
  // subject-domain identity accents (subjects.js) + default project taupe
  "#8fb573", "#4a9d8e", "#d18e5f", "#9c8b74",
  // third-party brand marks (Google / Facebook sign-in logos)
  "#ea4335", "#4285f4", "#fbbc05", "#34a853", "#1877f2",
  // mono palette-picker swatch gradient stop
  "#4a4a4a",
]);

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g;

const offenders = [];
function scanFile(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (i === 9 && file.endsWith("styles.css")) return; // minified base + hljs syntax palette (re-mapped at source / data-viz)
    if (file.endsWith("constants.js") && /"#[0-9a-f]{6}":\s*"#/i.test(line)) return; // legacy->warm migration TABLE (keys are old palette by definition)
    // skip lines that are clearly theme definitions or var fallbacks only
    const stripped = line.replace(/var\(--[^)]*\)/g, ""); // remove var(...) incl. fallbacks
    if (/^\s*--sh-[\w-]+\s*:/.test(line)) return;         // theme contract definitions
    const hits = [...(stripped.match(HEX_RE) || []), ...(stripped.match(RGB_RE) || [])];
    for (const hit of hits) {
      const norm = hit.toLowerCase();
      if (BLESSED.has(norm)) continue;
      // rgba neutrals: pure black/white overlays and shadows are fine
      const m = norm.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) {
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) continue;
        // blessed data-viz rgb forms
        const key = "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
        if (BLESSED.has(key)) continue;
      }
      offenders.push(`${path.relative(".", file)}:${i + 1}  ${hit}  |  ${line.trim().slice(0, 110)}`);
    }
  });
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); }
  else if (/\.(css|jsx|js)$/.test(e.name) && !/test|\.min\./.test(e.name)) scanFile(p);
});
walk("src");
console.log(offenders.join("\n"));
console.log("\nTOTAL OFFENDERS:", offenders.length);
