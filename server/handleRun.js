// Peer — multi-language code execution proxy.
// Compiles/runs the learner's code on Wandbox (https://wandbox.org), a long-running
// free compile service, so the in-app terminal can execute C, C++, Python, Java,
// Rust, Go, C#, Ruby, PHP, TypeScript, etc. — not just JS. We proxy server-side to
// dodge CORS. The compiler list is fetched once and cached to map a language -> a
// concrete compiler id (preferring the rolling "head" build, else newest version).
const WANDBOX = "https://wandbox.org/api";

// our language id -> Wandbox `language` field
const LANG_MAP = {
  c: "C",
  cpp: "C++",
  python: "Python",
  java: "Java",
  rust: "Rust",
  go: "Go",
  csharp: "C#",
  ruby: "Ruby",
  php: "PHP",
  typescript: "TypeScript",
  javascript: "JavaScript",
  sql: "SQL",
  bash: "Bash script",
  lua: "Lua",
};

let listCache = null;
let listAt = 0;

async function getCompilers() {
  if (listCache && Date.now() - listAt < 30 * 60_000) return listCache;
  const r = await fetch(`${WANDBOX}/list.json`);
  if (!r.ok) throw new Error(`Could not reach the code runner (${r.status}).`);
  listCache = await r.json();
  listAt = Date.now();
  return listCache;
}

function resolveCompiler(list, language) {
  const matches = list.filter((c) => c.language === language);
  if (!matches.length) return null;
  // prefer the newest STABLE build (Wandbox lists newest-first); "head" builds
  // are often broken (e.g. cpython-head), so only use one as a last resort.
  const stable = matches.find((c) => !/head/i.test(c.name));
  return stable || matches[0];
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 200_000) reject(new Error("Code too large.")); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export async function handleRunRequest(req, res) {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ error: "POST only" })); return; }
    const { language, code, stdin } = JSON.parse(await readBody(req) || "{}");
    const wandboxLang = LANG_MAP[language];
    if (!wandboxLang) { res.statusCode = 400; res.end(JSON.stringify({ error: `${language} can't be run here yet.` })); return; }

    const list = await getCompilers();
    const compiler = resolveCompiler(list, wandboxLang);
    if (!compiler) { res.statusCode = 400; res.end(JSON.stringify({ error: `No ${language} runner is available right now.` })); return; }

    const payload = { code: String(code || ""), compiler: compiler.name, stdin: String(stdin || "") };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    let data;
    try {
      const exec = await fetch(`${WANDBOX}/compile.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      data = await exec.json();
      if (!exec.ok) { res.statusCode = 502; res.end(JSON.stringify({ error: data?.error || "Runner error." })); return; }
    } finally {
      clearTimeout(timer);
    }

    res.end(JSON.stringify({
      language: wandboxLang,
      version: compiler.version || compiler.name,
      compileStderr: data.compiler_error || "",
      stdout: data.program_output || "",
      stderr: data.program_error || "",
      code: data.status != null ? Number(data.status) : null,
      signal: data.signal || null,
    }));
  } catch (err) {
    const msg = err?.name === "AbortError" ? "The runner timed out." : (err?.message || "Run failed.");
    res.statusCode = 500;
    res.end(JSON.stringify({ error: msg }));
  }
}
