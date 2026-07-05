// Peer — Code lab
// A VS Code-style coding workspace:
//  • syntax-highlighted editor (line-number gutter + highlight.js layer perfectly
//    aligned under a transparent textarea) with a file tab
//  • toggleable "extensions" (line numbers, word wrap, auto-close brackets,
//    auto-indent, syntax highlighting) — turn the assists on/off like VS Code
//  • a real integrated terminal that runs ANY language (JS instantly in a sandboxed
//    Web Worker; everything else on the server runner at /api/run)
//  • an AI tutor that SEES your code AND your learning brain (the subject's tracked
//    concepts + weak spots) and can EDIT your code on request — its suggestions get
//    an "Apply to editor" button, and "Improve my code" rewrites the file for you.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Sparkles, Bug, Lightbulb, ClipboardCheck, Send, Loader2, Trophy, BrainCircuit, Puzzle, Wand2, Check } from "lucide-react";
import hljs from "highlight.js/lib/core";
import { Markdown } from "./markdown.jsx";
import { streamChat } from "./peerChat.js";
import { COLORS, GRADIENTS, EASE } from "./peerTheme.js";

const LANGUAGES = [
  { id: "javascript", label: "JavaScript", ext: "main.js", local: true },
  { id: "python", label: "Python", ext: "main.py" },
  { id: "typescript", label: "TypeScript", ext: "main.ts" },
  { id: "c", label: "C", ext: "main.c" },
  { id: "cpp", label: "C++", ext: "main.cpp" },
  { id: "java", label: "Java", ext: "Main.java" },
  { id: "go", label: "Go", ext: "main.go" },
  { id: "rust", label: "Rust", ext: "main.rs" },
  { id: "csharp", label: "C#", ext: "Main.cs" },
  { id: "ruby", label: "Ruby", ext: "main.rb" },
  { id: "php", label: "PHP", ext: "main.php" },
  { id: "sql", label: "SQL", ext: "query.sql" },
  { id: "bash", label: "Bash", ext: "main.sh" },
];

const HL_MAP = { javascript: "javascript", typescript: "typescript", python: "python", c: "c", cpp: "cpp", java: "java", go: "go", rust: "rust", bash: "bash" };

const STARTERS = {
  javascript: "// JavaScript runs instantly, right here.\nfunction reverse(str) {\n  return str.split('').reverse().join('');\n}\n\nconsole.log(reverse('hello'));\n",
  python: "def reverse(s):\n    return s[::-1]\n\nprint(reverse('hello'))\n",
  typescript: "function reverse(str: string): string {\n  return str.split('').reverse().join('');\n}\n\nconsole.log(reverse('hello'));\n",
  c: "#include <stdio.h>\n\nint main(void) {\n    printf(\"hello %d\\n\", 6 * 7);\n    return 0;\n}\n",
  cpp: "#include <iostream>\n\nint main() {\n    std::cout << \"hello \" << 6 * 7 << std::endl;\n}\n",
  java: "// Wandbox compiles this as prog.java, so the class isn't public.\nclass Main {\n    public static void main(String[] args) {\n        System.out.println(\"hello \" + 6 * 7);\n    }\n}\n",
  go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"hello\", 6*7)\n}\n",
  rust: "fn main() {\n    println!(\"hello {}\", 6 * 7);\n}\n",
  csharp: "using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine(\"hello \" + 6 * 7);\n    }\n}\n",
  ruby: "puts \"hello #{6 * 7}\"\n",
  php: "<?php\necho \"hello \" . (6 * 7) . \"\\n\";\n",
  sql: "CREATE TABLE t(n INT);\nINSERT INTO t VALUES (6), (7);\nSELECT SUM(n) AS total FROM t;\n",
  bash: "echo \"hello $((6 * 7))\"\n",
};

const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);

const PLUGIN_LIST = [
  { id: "lineNumbers", label: "Line numbers", desc: "Show the gutter" },
  { id: "highlight", label: "Syntax highlighting", desc: "Colorize the code" },
  { id: "autoClose", label: "Auto-close brackets", desc: "Insert the matching ) ] } \" '" },
  { id: "autoIndent", label: "Smart indent", desc: "Keep indentation on new lines" },
  { id: "wordWrap", label: "Word wrap", desc: "Wrap long lines" },
];
const DEFAULT_PLUGINS = { lineNumbers: true, highlight: true, autoClose: true, autoIndent: true, wordWrap: false };

function loadPlugins() {
  try { return { ...DEFAULT_PLUGINS, ...JSON.parse(localStorage.getItem("peer-code-plugins") || "{}") }; }
  catch { return { ...DEFAULT_PLUGINS }; }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// pull the first fenced code block out of an AI answer (prefer the current language)
function firstCodeBlock(text, language) {
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m; let firstAny = null;
  while ((m = re.exec(String(text || "")))) {
    const info = (m[1] || "").toLowerCase();
    if (firstAny == null) firstAny = m[2];
    if (info === language || info === HL_MAP[language]) return m[2].replace(/\n$/, "");
  }
  return firstAny != null ? firstAny.replace(/\n$/, "") : null;
}

function runJavaScript(code, onResult) {
  const workerSrc = `
    const logs = [];
    function fmt(x){ try { return typeof x === 'object' ? JSON.stringify(x) : String(x); } catch(e){ return String(x); } }
    self.console = {
      log:(...a)=>logs.push({k:'out',t:a.map(fmt).join(' ')}),
      error:(...a)=>logs.push({k:'err',t:a.map(fmt).join(' ')}),
      warn:(...a)=>logs.push({k:'out',t:a.map(fmt).join(' ')}),
      info:(...a)=>logs.push({k:'out',t:a.map(fmt).join(' ')}),
    };
    self.onmessage = (e) => {
      try { (0, eval)(e.data); }
      catch (err) { logs.push({k:'err',t:(err && err.message ? err.message : String(err))}); }
      self.postMessage(logs);
    };
  `;
  let worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" })));
  } catch {
    onResult([{ k: "err", t: "Could not start the sandbox in this browser." }], 1);
    return;
  }
  const timer = setTimeout(() => { worker.terminate(); onResult([{ k: "err", t: "Execution timed out (possible infinite loop)." }], 124); }, 3000);
  worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); onResult(e.data.length ? e.data : [{ k: "muted", t: "(no output — nothing was logged)" }], 0); };
  worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); onResult([{ k: "err", t: e.message || "Runtime error" }], 1); };
  worker.postMessage(code);
}

// ── syntax-highlighted editor: transparent textarea over an aligned highlight layer ──
function CodeEditor({ value, onChange, language, plugins }) {
  const taRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const hlName = HL_MAP[language];

  const highlighted = useMemo(() => {
    const safe = value || "";
    if (plugins.highlight && hlName && hljs.getLanguage(hlName)) {
      try { return hljs.highlight(safe, { language: hlName }).value; } catch { /* fall through */ }
    }
    return escapeHtml(safe);
  }, [value, hlName, plugins.highlight]);

  const lineCount = useMemo(() => (value || "").split("\n").length, [value]);

  function sync() {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }

  function apply(next, caret) {
    onChange(next);
    requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.selectionStart = ta.selectionEnd = caret; } });
  }

  function onKeyDown(e) {
    const t = e.target;
    const s = t.selectionStart, en = t.selectionEnd;
    if (e.key === "Tab") {
      e.preventDefault();
      apply(value.slice(0, s) + "  " + value.slice(en), s + 2);
      return;
    }
    if (plugins.autoClose && PAIRS[e.key]) {
      e.preventDefault();
      const close = PAIRS[e.key];
      const sel = value.slice(s, en);
      const next = value.slice(0, s) + e.key + sel + close + value.slice(en);
      apply(next, sel ? en + 2 : s + 1);
      return;
    }
    if (plugins.autoClose && s === en && CLOSERS.has(e.key) && value[s] === e.key) {
      e.preventDefault();
      apply(value, s + 1);
      return;
    }
    if (plugins.autoClose && e.key === "Backspace" && s === en && s > 0 && PAIRS[value[s - 1]] === value[s]) {
      e.preventDefault();
      apply(value.slice(0, s - 1) + value.slice(s + 1), s - 1);
      return;
    }
    if (plugins.autoIndent && e.key === "Enter") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const lineText = value.slice(lineStart, s);
      const indent = (lineText.match(/^[ \t]*/) || [""])[0];
      const prev = value[s - 1];
      const next = value[en];
      const opensBlock = prev === "{" || prev === "[" || prev === "(" || prev === ":";
      if (opensBlock && ((prev === "{" && next === "}") || (prev === "[" && next === "]") || (prev === "(" && next === ")"))) {
        const insert = "\n" + indent + "  ";
        apply(value.slice(0, s) + insert + "\n" + indent + value.slice(en), s + insert.length);
      } else if (opensBlock) {
        const insert = "\n" + indent + "  ";
        apply(value.slice(0, s) + insert + value.slice(en), s + insert.length);
      } else {
        const insert = "\n" + indent;
        apply(value.slice(0, s) + insert + value.slice(en), s + insert.length);
      }
    }
  }

  return (
    <div className={`vscode-editor${plugins.wordWrap ? " wrap" : ""}`}>
      {plugins.lineNumbers && (
        <div className="vscode-gutter" ref={gutterRef}>
          {Array.from({ length: lineCount }).map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
      )}
      <div className="vscode-code">
        <pre ref={preRef} aria-hidden="true"><code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted + "\n" }} /></pre>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off" autoCorrect="off" autoCapitalize="off"
          aria-label={`Code editor, ${language}`}
        />
      </div>
    </div>
  );
}

export default function CodingPanel({ profile, projects = [], onSaveToBrain }) {
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(STARTERS.javascript);
  const [output, setOutput] = useState([]);
  const [exit, setExit] = useState(null);
  const [running, setRunning] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [plugins, setPlugins] = useState(loadPlugins);
  const [showExt, setShowExt] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTitle, setAiTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [applied, setApplied] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => { if (!projectId && projects[0]) setProjectId(projects[0].id); }, [projects, projectId]);
  useEffect(() => { localStorage.setItem("peer-code-plugins", JSON.stringify(plugins)); }, [plugins]);

  const lang = useMemo(() => LANGUAGES.find((l) => l.id === language) || LANGUAGES[0], [language]);
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const suggestedCode = useMemo(() => firstCodeBlock(aiResponse, language), [aiResponse, language]);

  function togglePlugin(id) { setPlugins((p) => ({ ...p, [id]: !p[id] })); }

  function changeLanguage(id) {
    setLanguage(id);
    if (STARTERS[id]) setCode(STARTERS[id]);
    setOutput([]); setExit(null);
  }

  function applySuggestion() {
    if (!suggestedCode) return;
    setCode(suggestedCode);
    setApplied(true);
    setTimeout(() => setApplied(false), 1800);
  }

  async function run() {
    setOutput([]); setExit(null);
    setRunning(true);
    const started = performance.now();
    if (lang.local) {
      runJavaScript(code, (logs, codeNum) => {
        setOutput(logs);
        setExit({ code: codeNum, ms: Math.round(performance.now() - started), where: "sandbox" });
        setRunning(false);
      });
      return;
    }
    try {
      const r = await fetch("/api/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code }),
      });
      const data = await r.json();
      if (data.error) {
        setOutput([{ k: "err", t: data.error }]);
        setExit({ code: 1, ms: Math.round(performance.now() - started) });
      } else {
        const lines = [];
        const push = (text, k) => String(text).replace(/\n$/, "").split("\n").forEach((t) => lines.push({ k, t }));
        if (data.compileStderr) push(data.compileStderr, "err");
        if (data.stdout) push(data.stdout, "out");
        if (data.stderr) push(data.stderr, "err");
        if (!lines.length) lines.push({ k: "muted", t: "(no output)" });
        setOutput(lines);
        setExit({ code: data.code, ms: Math.round(performance.now() - started), version: data.version });
      }
    } catch {
      setOutput([{ k: "err", t: "Couldn't reach the runner. Is the dev server running?" }]);
      setExit({ code: 1, ms: Math.round(performance.now() - started) });
    }
    setRunning(false);
  }

  async function askPeer(title, request) {
    if (aiBusy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAiTitle(title); setAiResponse(""); setAiBusy(true);
    const level = profile?.level || "beginner";
    const concepts = (project?.mastery?.concepts || []).slice(0, 8).map((c) => c.label).filter(Boolean);
    const weak = (project?.mastery?.misconceptions || []).slice(0, 5).map((m) => m.concept).filter(Boolean);
    const brainCtx = project
      ? `\n\nLearner's brain for "${project.name}": tracked concepts = ${concepts.join(", ") || "none yet"}; weak spots to reinforce = ${weak.join(", ") || "none yet"}. When relevant, connect your teaching to these and gently shore up the weak spots.`
      : "";
    const system = `You are Peer, a patient ${lang.label} coding tutor for a ${level}-level learner. Teach by guiding: explain the concept, give a hint before the full answer, point out bugs AND the underlying idea, keep examples small. Use markdown. When you provide code the learner should put in their editor, give it as ONE fenced \`\`\`${language} code block. Never dump a full solution without explaining the reasoning.

The learner's current ${lang.label} code:
\`\`\`${language}
${code || "(empty)"}
\`\`\`${brainCtx}`;
    try {
      await streamChat({ system, messages: [{ role: "user", content: request }], onChunk: (c) => setAiResponse(c), signal: controller.signal });
    } catch (err) {
      if (err.name !== "AbortError") setAiResponse(`⚠ ${err.message || "The AI request failed. Add an API key in .env."}`);
    } finally {
      setAiBusy(false);
    }
  }

  const actions = [
    { label: "Improve my code", icon: Wand2, title: "Improved version", req: `Rewrite my ${lang.label} code to be correct, clean, and idiomatic. Return the FULL updated file as one \`\`\`${language} code block, then 2-3 short bullet points explaining what you changed and why.` },
    { label: "Challenge me", icon: Trophy, title: "New challenge", req: `Give me one small ${lang.label} coding challenge suited to a ${profile?.level || "beginner"} learner${project ? ` and tied to ${project.name}` : ""}. State the problem with an example input/output. Don't give the solution — I'll attempt it.` },
    { label: "Review my code", icon: ClipboardCheck, title: "Code review", req: "Review my code above. Point out correctness issues, style, and edge cases, and explain the reasoning. Be specific but encouraging." },
    { label: "Hint", icon: Lightbulb, title: "A hint", req: "I'm stuck. Give me ONE small hint to move forward — not the full solution." },
    { label: "Trace & explain", icon: Sparkles, title: "Explanation", req: "Explain what my code does step by step and trace what it outputs. Highlight the key concepts I should understand." },
    { label: "Find the bug", icon: Bug, title: "Debugging", req: "Is there a bug in my code? If so, guide me to it with a hint first, then explain the fix. If you show a corrected version, put it in one fenced code block." },
  ];

  function submitQuestion(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    askPeer("Your question", q);
  }

  const panel = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" };
  const selStyle = { background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", padding: "9px 12px", fontFamily: "Geist, sans-serif", fontSize: 13 };

  return (
    <section className="peer-skin" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#07070e", color: COLORS.text }}>
      <div className="code-lab-head" style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 30px 12px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 23, fontWeight: 600, letterSpacing: "-.4px" }}>Code lab</div>
          <div style={{ fontSize: 13, color: COLORS.text45, marginTop: 2 }}>Write, run any language, and learn with a tutor that sees your code and your brain.</div>
        </div>
        {projects.length > 0 && (
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={selStyle} title="Which subject this connects to in your brain" aria-label="Subject to connect in your brain">
            {projects.map((p) => <option key={p.id} value={p.id} style={{ background: "#14141b" }}>{p.name}</option>)}
          </select>
        )}
        <select value={language} onChange={(e) => changeLanguage(e.target.value)} style={selStyle} aria-label="Programming language">
          {LANGUAGES.map((l) => <option key={l.id} value={l.id} style={{ background: "#14141b" }}>{l.label}</option>)}
        </select>
      </div>

      <div className="code-lab-layout" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(320px,0.85fr)", gap: 16, padding: "0 30px 24px" }}>
        {/* editor + terminal */}
        <div className="code-lab-editor-col" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
          <div style={{ ...panel, flex: 1, minHeight: 240, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="vscode-tabbar">
              <div className="vscode-tab">
                <span className="vscode-dot" style={{ background: GRADIENTS.accent }} />
                <span>{lang.ext}</span>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, position: "relative" }}>
                <button onClick={() => setShowExt((v) => !v)} style={btn(false)} title="Extensions — toggle coding assists"><Puzzle size={14} /> Extensions</button>
                {showExt && (
                  <>
                    <div onClick={() => setShowExt(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div className="ext-popover">
                      <div className="ext-title">Coding assists</div>
                      {PLUGIN_LIST.map((pl) => (
                        <button key={pl.id} className="ext-row" onClick={() => togglePlugin(pl.id)}>
                          <span className={`ext-switch${plugins[pl.id] ? " on" : ""}`}><i /></span>
                          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                            <span className="ext-label">{pl.label}</span>
                            <span className="ext-desc">{pl.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {onSaveToBrain && (
                  <button onClick={() => onSaveToBrain({ language, code, title: `${lang.ext}`, projectId })} style={btn(false)} title="Save this snippet as a cell in your brain">
                    <BrainCircuit size={14} /> Save to brain
                  </button>
                )}
                <button onClick={() => { setCode(STARTERS[language] || ""); setOutput([]); setExit(null); }} style={btn(false)}><RotateCcw size={14} /> Reset</button>
                <button onClick={run} disabled={running} style={btn(true)}>{running ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Run</button>
              </div>
            </div>
            <CodeEditor value={code} onChange={setCode} language={language} plugins={plugins} />
          </div>

          <div className="vscode-terminal" style={{ ...panel, height: 200, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="term-tabbar">
              <span className="term-tab active">TERMINAL</span>
              <span className="term-meta">
                {exit ? <>exit {exit.code} · {exit.ms}ms{exit.where === "sandbox" ? " · sandbox" : exit.version ? ` · ${lang.label} ${exit.version}` : ""}</> : lang.local ? "in-browser sandbox" : "server runner"}
              </span>
            </div>
            <div className="term-body" tabIndex={0} role="log" aria-label="Terminal output">
              <div className="term-cmd">$ run {lang.ext}{lang.local ? "" : "  →  server"}</div>
              {running ? (
                <div className="term-line muted">running…<span className="term-caret" /></div>
              ) : output.length === 0 ? (
                <div className="term-line muted">Press Run to execute. JavaScript runs instantly; other languages run on the server.</div>
              ) : output.map((line, i) => (
                <div key={i} className={`term-line ${line.k}`}>{line.t || " "}</div>
              ))}
            </div>
          </div>
        </div>

        {/* AI tutor */}
        <div className="code-lab-tutor" style={{ ...panel, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: GRADIENTS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={13} color="#0a0a14" />
              </span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14 }}>Peer · coding tutor</span>
              {project && <span style={{ marginLeft: "auto", fontSize: 11, color: COLORS.text40 }}>knows your {project.name} brain</span>}
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.label} onClick={() => askPeer(a.title, a.req)} disabled={aiBusy} style={chip()}>
                    <Icon size={13} /> {a.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px" }}>
            {aiTitle && <div style={{ fontSize: 10.5, letterSpacing: ".5px", textTransform: "uppercase", color: COLORS.text40, marginBottom: 8 }}>{aiTitle}</div>}
            {aiResponse ? (
              <div className="markdown" style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.86)" }}><Markdown text={aiResponse} /></div>
            ) : aiBusy ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.text50, fontSize: 13 }}><Loader2 size={15} className="spin" /> Thinking…</div>
            ) : (
              <div style={{ color: COLORS.text40, fontSize: 13, lineHeight: 1.6 }}>Write some code, then ask for a challenge, a hint, a review, or a bug hunt. Peer sees your editor and your learning brain — and can rewrite your code: when it suggests code, an <strong style={{ color: COLORS.text60 }}>Apply to editor</strong> button drops it straight in.</div>
            )}
          </div>
          {suggestedCode && !aiBusy && (
            <button onClick={applySuggestion} className="apply-bar">
              {applied ? <><Check size={15} /> Applied to editor</> : <><Wand2 size={15} /> Apply Peer's code to the editor</>}
            </button>
          )}
          <form onSubmit={submitQuestion} style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask Peer to change your code…" aria-label="Ask Peer about your code" style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "Geist, sans-serif" }} />
            <button type="submit" aria-label="Send question to Peer" disabled={aiBusy || !question.trim()} style={{ ...btn(true), padding: "0 12px" }}><Send size={15} /></button>
          </form>
        </div>
      </div>
    </section>
  );
}

function btn(primary) {
  return {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 10, cursor: "pointer",
    fontSize: 12.5, fontWeight: 500, border: primary ? "none" : "1px solid rgba(255,255,255,0.1)",
    background: primary ? "linear-gradient(135deg,#8b5cf6,#22d3ee)" : "rgba(255,255,255,0.04)",
    color: primary ? "#0a0a14" : "rgba(255,255,255,0.8)",
    boxShadow: primary ? "0 0 18px -6px rgba(139,92,246,0.7)" : "none",
    transition: `transform .2s ${EASE}, background .2s ease`,
  };
}
function chip() {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 999, cursor: "pointer",
    fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.75)", transition: `background .2s ${EASE}, border-color .2s ease, color .2s ease`,
  };
}
