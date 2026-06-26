// Peer — Coding practice tab
// A focused code playground: editor + sandboxed JS runner (Web Worker with a
// timeout so infinite loops can't freeze the app) + an AI tutor that SEES the
// current code and teaches (hints before answers, bug-finding, challenges).
// Styled to the design language. Wires to the same /api/chat proxy and the
// learner's profile (level/language) so coding help is adaptive too.
import React, { useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Sparkles, Bug, Lightbulb, ClipboardCheck, Send, Loader2, Trophy } from "lucide-react";
import { Markdown } from "./markdown.jsx";
import { streamChat } from "./peerChat.js";
import { COLORS, GRADIENTS, EASE } from "./peerTheme.js";

const LANGUAGES = [
  { id: "javascript", label: "JavaScript", runnable: true },
  { id: "python", label: "Python", runnable: false },
  { id: "typescript", label: "TypeScript", runnable: false },
  { id: "c", label: "C", runnable: false },
  { id: "cpp", label: "C++", runnable: false },
  { id: "java", label: "Java", runnable: false },
  { id: "sql", label: "SQL", runnable: false },
  { id: "html", label: "HTML/CSS", runnable: false },
];

const STARTERS = {
  javascript: "// Try it — write JavaScript and press Run.\nfunction reverse(str) {\n  return str.split('').reverse().join('');\n}\n\nconsole.log(reverse('hello'));\n",
  python: "# Peer can run JS in-browser; for Python it traces and teaches.\ndef reverse(s):\n    return s[::-1]\n\nprint(reverse('hello'))\n",
};

// run JS in a terminable Web Worker so infinite loops can't lock the page
function runJavaScript(code, onResult) {
  const workerSrc = `
    const logs = [];
    function fmt(x){ try { return typeof x === 'object' ? JSON.stringify(x) : String(x); } catch(e){ return String(x); } }
    self.console = {
      log:(...a)=>logs.push(a.map(fmt).join(' ')),
      error:(...a)=>logs.push('\\u26a0 ' + a.map(fmt).join(' ')),
      warn:(...a)=>logs.push(a.map(fmt).join(' ')),
      info:(...a)=>logs.push(a.map(fmt).join(' ')),
    };
    self.onmessage = (e) => {
      try { (0, eval)(e.data); }
      catch (err) { logs.push('\\u26a0 ' + (err && err.message ? err.message : String(err))); }
      self.postMessage(logs);
    };
  `;
  let worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" })));
  } catch {
    onResult(["⚠ Could not start the sandbox in this browser."]);
    return;
  }
  const timer = setTimeout(() => { worker.terminate(); onResult(["⏱ Execution timed out (possible infinite loop)."]); }, 3000);
  worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); onResult(e.data.length ? e.data : ["(no output — nothing was logged)"]); };
  worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); onResult(["⚠ " + (e.message || "Runtime error")]); };
  worker.postMessage(code);
}

export default function CodingPanel({ profile }) {
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(STARTERS.javascript);
  const [output, setOutput] = useState([]);
  const [running, setRunning] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTitle, setAiTitle] = useState("");
  const [question, setQuestion] = useState("");
  const abortRef = useRef(null);

  const lang = useMemo(() => LANGUAGES.find((l) => l.id === language) || LANGUAGES[0], [language]);

  function changeLanguage(id) {
    setLanguage(id);
    if (STARTERS[id]) setCode(STARTERS[id]);
    setOutput([]);
  }

  function run() {
    setOutput([]);
    if (!lang.runnable) {
      setOutput([`ℹ In-browser Run supports JavaScript. For ${lang.label}, use "Trace & explain" and Peer will walk through it.`]);
      return;
    }
    setRunning(true);
    runJavaScript(code, (logs) => { setOutput(logs); setRunning(false); });
  }

  async function askPeer(title, request) {
    if (aiBusy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAiTitle(title);
    setAiResponse("");
    setAiBusy(true);
    const level = profile?.level || "beginner";
    const system = `You are Peer, a patient ${lang.label} coding tutor for a ${level}-level learner. Teach by guiding: explain the concept, give a hint before the full answer, point out bugs AND the underlying idea, and keep examples small. Use markdown with fenced code blocks. Never just dump a solution without explaining the reasoning.

The learner's current ${lang.label} code:
\`\`\`${language}
${code || "(empty)"}
\`\`\``;
    try {
      await streamChat({
        system,
        messages: [{ role: "user", content: request }],
        onChunk: (c) => setAiResponse(c),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name !== "AbortError") setAiResponse(`⚠ ${err.message || "The AI request failed. Add an API key in .env."}`);
    } finally {
      setAiBusy(false);
    }
  }

  const actions = [
    { label: "Challenge me", icon: Trophy, title: "New challenge", req: `Give me one small ${lang.label} coding challenge suited to a ${profile?.level || "beginner"} learner. State the problem clearly with an example input/output. Don't give the solution yet — I'll attempt it in the editor.` },
    { label: "Review my code", icon: ClipboardCheck, title: "Code review", req: "Review my code above. Point out correctness issues, style, and edge cases, and explain the reasoning. Be specific but encouraging." },
    { label: "Hint", icon: Lightbulb, title: "A hint", req: "I'm stuck. Give me ONE small hint to move forward — not the full solution." },
    { label: lang.runnable ? "Explain this" : "Trace & explain", icon: Sparkles, title: "Explanation", req: `Explain what my code does step by step${lang.runnable ? "" : ", and trace what it would output"}. Highlight the key concepts I should understand.` },
    { label: "Find the bug", icon: Bug, title: "Debugging", req: "Is there a bug in my code? If so, guide me to it with a hint first, then explain the fix and why it works." },
  ];

  function submitQuestion(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    askPeer("Your question", q);
  }

  const panel = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" };

  return (
    <section className="peer-skin" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#07070e", color: COLORS.text }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 30px 14px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: "-.4px" }}>Code practice</div>
          <div style={{ fontSize: 13, color: COLORS.text45, marginTop: 2 }}>Write code, run it, and learn with a tutor that can see exactly what you wrote.</div>
        </div>
        <select value={language} onChange={(e) => changeLanguage(e.target.value)} style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", padding: "9px 12px", fontFamily: "Geist, sans-serif", fontSize: 13 }}>
          {LANGUAGES.map((l) => <option key={l.id} value={l.id} style={{ background: "#14141b" }}>{l.label}</option>)}
        </select>
      </div>

      {/* body: editor + tutor */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(320px,0.9fr)", gap: 16, padding: "0 30px 24px" }}>
        {/* editor column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div style={{ ...panel, flex: 1, minHeight: 220, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: "#8b5cf6", boxShadow: "0 0 8px #8b5cf6" }} />
              <span style={{ fontSize: 12.5, color: COLORS.text60, fontFamily: "'Geist Mono',monospace" }}>{lang.label}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => { setCode(STARTERS[language] || ""); setOutput([]); }} style={btn(false)}><RotateCcw size={14} /> Reset</button>
                <button onClick={run} disabled={running} style={btn(true)}>{running ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Run</button>
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              style={{ flex: 1, resize: "none", border: "none", outline: "none", background: "transparent", color: "rgba(255,255,255,0.92)", fontFamily: "'Geist Mono', monospace", fontSize: 13.5, lineHeight: 1.6, padding: "14px 16px", tabSize: 2 }}
              onKeyDown={(e) => {
                if (e.key === "Tab") { e.preventDefault(); const t = e.target; const s = t.selectionStart, en = t.selectionEnd; setCode(code.slice(0, s) + "  " + code.slice(en)); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); }
              }}
            />
          </div>
          {/* output console */}
          <div style={{ ...panel, minHeight: 110, maxHeight: 220, overflow: "auto", padding: "12px 16px", fontFamily: "'Geist Mono',monospace", fontSize: 12.5, background: "rgba(10,10,18,0.6)" }}>
            <div style={{ fontSize: 10.5, letterSpacing: ".5px", textTransform: "uppercase", color: COLORS.text40, marginBottom: 8 }}>Output</div>
            {output.length === 0 ? (
              <div style={{ color: COLORS.text35 }}>Press Run to see your output here.</div>
            ) : output.map((line, i) => (
              <div key={i} style={{ color: line.startsWith("⚠") ? "#fb7185" : line.startsWith("⏱") || line.startsWith("ℹ") ? "#f59e0b" : "rgba(255,255,255,0.82)", whiteSpace: "pre-wrap", padding: "1px 0" }}>{line}</div>
            ))}
          </div>
        </div>

        {/* AI tutor column */}
        <div style={{ ...panel, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: GRADIENTS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={13} color="#0a0a14" />
              </span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14 }}>Peer · coding tutor</span>
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
              <div className="markdown" style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.86)" }}><Markdown content={aiResponse} /></div>
            ) : aiBusy ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.text50, fontSize: 13 }}><Loader2 size={15} className="spin" /> Thinking…</div>
            ) : (
              <div style={{ color: COLORS.text40, fontSize: 13, lineHeight: 1.6 }}>Write some code, then ask for a challenge, a hint, a review, or a bug hunt. Peer sees your editor and teaches — it won't just hand you the answer.</div>
            )}
          </div>
          <form onSubmit={submitQuestion} style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your code…" style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "Geist, sans-serif" }} />
            <button type="submit" disabled={aiBusy || !question.trim()} style={{ ...btn(true), padding: "0 12px" }}><Send size={15} /></button>
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
