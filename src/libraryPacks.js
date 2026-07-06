// Peer — Code lab library packs.
// Curated, toggleable GROUPS of real libraries per language — the same UX as
// the "Extensions" popover: a learner flips a pack on, not twenty checkboxes.
//
// HONESTY TABLE (what is genuinely real, per language — see PROGRESS.md):
//   • Python      REAL — Pyodide (WASM CPython) ships prebuilt wheels; packs
//                 preload them with pyodide.loadPackage, imports just work.
//   • JavaScript  REAL — the sandbox Worker importScripts() pinned UMD builds
//                 from cdn.jsdelivr.net; the pack's globals (_, dayjs, math,
//                 Papa) are live in the learner's code.
//   • TypeScript  NOT YET — TS runs on the server runner (Wandbox) today, so
//                 the JS CDN packs can't reach it. In-browser TS (transpile +
//                 the same sandbox) is the documented follow-up.
//   • C/C++/Java/Go/Rust/C#/Ruby/PHP/SQL/Bash — NOT FEASIBLE in this pass:
//                 no mature in-browser runtime with a package ecosystem;
//                 the server runner is stdlib-only. We say so in the UI
//                 rather than faking toggles.
// Pure data + tiny helpers (no React) so it can be unit-tested.

export const LIBRARY_PACKS = {
  python: [
    {
      id: "py-data",
      label: "Data science",
      desc: "numpy · pandas · matplotlib · scipy",
      example: "import numpy as np",
      packages: ["numpy", "pandas", "matplotlib", "scipy"],
    },
    {
      id: "py-math",
      label: "Math & symbols",
      desc: "sympy — exact algebra, calculus, equation solving",
      example: "from sympy import solve",
      packages: ["sympy"],
    },
    {
      id: "py-ml",
      label: "Machine learning",
      desc: "scikit-learn — models, datasets, metrics",
      example: "from sklearn.linear_model import LinearRegression",
      packages: ["scikit-learn"],
    },
  ],
  javascript: [
    {
      id: "js-utils",
      label: "Utilities",
      desc: "lodash (_) · dayjs — everyday helpers, dates",
      example: "_.chunk([1,2,3,4], 2)",
      scripts: [
        "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js",
        "https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js",
      ],
      globals: ["_", "dayjs"],
    },
    {
      id: "js-data",
      label: "Data & math",
      desc: "mathjs (math) · PapaParse (Papa) — math, CSV",
      example: "math.evaluate('sqrt(3^2 + 4^2)')",
      scripts: [
        "https://cdn.jsdelivr.net/npm/mathjs@13.2.3/lib/browser/math.min.js",
        "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js",
      ],
      globals: ["math", "Papa"],
    },
  ],
};

// Languages with no packs get an honest one-liner instead of fake toggles.
export const NO_PACKS_NOTE = {
  typescript: "TypeScript runs on the server runner today, so the JavaScript CDN packs can't reach it. In-browser TS with the same packs is a planned follow-up.",
  default: (label) => `${label} runs on the server runner with its standard library only — there's no mature in-browser package runtime for it yet. Python and JavaScript have real library packs today.`,
};

export function packsFor(language) {
  return LIBRARY_PACKS[language] || [];
}

// CDN scripts for the enabled JS packs (order preserved, deduped).
export function scriptUrlsFor(language, enabled = {}) {
  const urls = [];
  for (const pack of packsFor(language)) {
    if (!enabled[pack.id] || !pack.scripts) continue;
    for (const url of pack.scripts) if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

// Pyodide package names for the enabled Python packs (deduped).
export function pyPackagesFor(language, enabled = {}) {
  const names = [];
  for (const pack of packsFor(language)) {
    if (!enabled[pack.id] || !pack.packages) continue;
    for (const name of pack.packages) if (!names.includes(name)) names.push(name);
  }
  return names;
}

// Short label for the terminal meta line, e.g. "Utilities, Data & math".
export function enabledPackLabels(language, enabled = {}) {
  return packsFor(language).filter((p) => enabled[p.id]).map((p) => p.label);
}
