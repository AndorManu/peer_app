// Peer — in-browser Python via Pyodide (WASM CPython).
// This is what makes real libraries work in the Code lab: Pyodide ships
// prebuilt wheels for the scientific stack (numpy, pandas, matplotlib,
// scipy, sympy, scikit-learn, ...) and loadPackagesFromImports() fetches
// exactly what the code imports. Runs entirely client-side — nothing to
// install server-side, works in the packaged apps too.
//
// Graphical libraries are a DIFFERENT problem: pygame/tkinter/turtle need a
// real window, which no stdout terminal (local or remote) can ever show.
// We detect those up front and explain honestly instead of hanging.
// (A real canvas target via pygame-web/pygbag is a documented follow-up.)

const PYODIDE_VERSION = "v0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`;

// Windowed libraries a text terminal fundamentally cannot host.
const GRAPHICAL_LIBS = [
  { pattern: /^\s*(?:import|from)\s+pygame\b/m, name: "PyGame" },
  { pattern: /^\s*(?:import|from)\s+tkinter\b/m, name: "Tkinter" },
  { pattern: /^\s*(?:import|from)\s+turtle\b/m, name: "Turtle graphics" },
];

export function detectGraphicalLib(code) {
  const hit = GRAPHICAL_LIBS.find((lib) => lib.pattern.test(String(code || "")));
  return hit ? hit.name : null;
}

export function graphicalLibMessage(name) {
  return [
    { k: "err", t: `${name} needs a graphical window — a text terminal can't show one.` },
    { k: "muted", t: `${name} draws into a real display, and this terminal only shows text output (that's true of any terminal, not a limitation Peer can patch).` },
    { k: "muted", t: "What DOES work here: the full Python standard library plus real packages like numpy, pandas, sympy, scipy, and matplotlib for computation." },
    { k: "muted", t: "A browser-canvas mode for graphical Python (pygame-web) is on the roadmap." },
  ];
}

let pyodidePromise = null;

async function getPyodide(onStatus) {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    onStatus?.("Loading the Python runtime (first run only — it's cached after this)…");
    await new Promise((resolveLoad, rejectLoad) => {
      if (window.loadPyodide) { resolveLoad(); return; }
      const s = document.createElement("script");
      s.src = PYODIDE_URL;
      s.onload = resolveLoad;
      s.onerror = () => rejectLoad(new Error("Could not load the Python runtime (offline?)."));
      document.head.appendChild(s);
    });
    const pyodide = await window.loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/` });
    return pyodide;
  })();
  pyodidePromise.catch(() => { pyodidePromise = null; }); // allow retry after failure
  return pyodidePromise;
}

// Run Python with real package support. Returns { lines, code, ms, where }.
// Throws only if the RUNTIME can't load (caller falls back to the server
// runner); Python errors come back as terminal lines like any other output.
// `packages`: Pyodide package names from enabled library packs — preloaded
// so the pack's imports are guaranteed available (imports auto-load too).
export async function runPython(code, { onStatus, packages = [] } = {}) {
  const graphical = detectGraphicalLib(code);
  if (graphical) {
    return { lines: graphicalLibMessage(graphical), code: 1, ms: 0, where: "browser" };
  }

  const pyodide = await getPyodide(onStatus);
  const started = performance.now();
  const lines = [];
  const push = (text, k) => String(text).replace(/\n$/, "").split("\n").forEach((t) => lines.push({ k, t }));
  pyodide.setStdout({ batched: (text) => push(text, "out") });
  pyodide.setStderr({ batched: (text) => push(text, "err") });

  let exitCode = 0;
  try {
    if (packages.length) {
      onStatus?.("Loading library packs…");
      // non-fatal: a pack that fails to fetch shouldn't kill the run —
      // loadPackagesFromImports below still resolves what the code uses
      try { await pyodide.loadPackage(packages); } catch { /* keep going */ }
    }
    // fetch exactly the packages the code imports (numpy, pandas, ...)
    onStatus?.("Resolving imports…");
    await pyodide.loadPackagesFromImports(code);
    onStatus?.(null);
    await pyodide.runPythonAsync(code);
  } catch (err) {
    exitCode = 1;
    // Pyodide's PythonError message contains the real traceback
    push(String(err?.message || err), "err");
  }
  if (!lines.length) lines.push({ k: "muted", t: "(no output — nothing was printed)" });
  return { lines, code: exitCode, ms: Math.round(performance.now() - started), where: "browser" };
}
