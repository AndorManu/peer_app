import React, { useEffect, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import "highlight.js/styles/atom-one-dark.css";

hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);

export function Markdown({ text }) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", lang, text: code.join("\n") });
      i += 1;
      continue;
    }

    // markdown table: a "| a | b |" row followed by a "| --- | --- |" separator
    if (line.trim().startsWith("|") && i + 1 < lines.length) {
      const sep = lines[i + 1].trim();
      if (/^[\s|:-]+$/.test(sep) && sep.includes("--")) {
        const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
        const header = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          rows.push(cells(lines[i]));
          i += 1;
        }
        blocks.push({ type: "table", header, rows });
        continue;
      }
    }

    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (line.startsWith("### ")) blocks.push({ type: "h3", text: line.slice(4) });
    else if (line.startsWith("## ")) blocks.push({ type: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ type: "h1", text: line.slice(2) });
    else if (/^-{3,}$/.test(line.trim())) blocks.push({ type: "hr" });
    else if (line.trim() === "") blocks.push({ type: "space" });
    else blocks.push({ type: "p", text: line });
    i += 1;
  }

  return (
    <div className="markdown">
      {blocks.map((block, idx) => {
        if (block.type === "code") return <CodeBlock key={idx} lang={block.lang} code={block.text} />;
        if (block.type === "table") return (
          <div key={idx} className="md-table-wrap">
            <table className="md-table">
              <thead><tr>{block.header.map((h, j) => <th key={j}>{inline(h)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{inline(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        if (block.type === "ul") return <ul key={idx}>{block.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</ul>;
        if (block.type === "ol") return <ol key={idx}>{block.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</ol>;
        if (block.type === "h1") return <h1 key={idx}>{inline(block.text)}</h1>;
        if (block.type === "h2") return <h2 key={idx}>{inline(block.text)}</h2>;
        if (block.type === "h3") return <h3 key={idx}>{inline(block.text)}</h3>;
        if (block.type === "hr") return <hr key={idx} />;
        if (block.type === "space") return <div key={idx} className="markdown-space" />;
        return <p key={idx}>{inline(block.text)}</p>;
      })}
    </div>
  );
}

function CodeBlock({ lang, code }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.removeAttribute("data-highlighted");
    hljs.highlightElement(ref.current);
  }, [code, lang]);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{lang || "text"}</span>
        <button className="code-copy" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre><code ref={ref} className={lang ? `language-${lang}` : ""}>{code}</code></pre>
    </div>
  );
}

function inline(text) {
  return String(text)
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
      return part;
    });
}
