// ============================================================================
// Peer — LaTeX math segmentation
// Splits plain text into text/math segments so the markdown renderer can hand
// math to KaTeX. Supports the delimiters tutoring models actually emit:
//   block:  $$...$$   and   \[...\]
//   inline: \(...\)   and   $...$  (with money-safe heuristics)
// Pure functions, no DOM — unit-tested under `node --test`.
// ============================================================================

// A $...$ span only counts as math when it looks like math:
//  - content is non-empty, single line, no leading/trailing whitespace
//  - the closing $ isn't immediately followed by a digit ("$5 and $10")
//  - plain-prose content without any math-ish character is rejected
const MATHISH = /[\\^_{}=+\-*/<>|]|\d/;

function isValidInlineDollar(content, nextChar) {
  if (!content || /\n/.test(content)) return false;
  if (/^\s|\s$/.test(content)) return false;
  if (nextChar >= "0" && nextChar <= "9") return false;
  if (!MATHISH.test(content)) return false;
  return true;
}

// Split a single line (or short text run) into inline segments.
// Returns [{ type: "text" | "inline", value }].
export function splitInlineMath(text) {
  const input = String(text ?? "");
  const segments = [];
  let plain = "";
  let i = 0;

  const flush = () => {
    if (plain) segments.push({ type: "text", value: plain });
    plain = "";
  };

  while (i < input.length) {
    // escaped dollar: \$ renders as a literal $
    if (input[i] === "\\" && input[i + 1] === "$") {
      plain += "$";
      i += 2;
      continue;
    }
    // \( ... \)
    if (input[i] === "\\" && input[i + 1] === "(") {
      const close = input.indexOf("\\)", i + 2);
      if (close !== -1) {
        flush();
        segments.push({ type: "inline", value: input.slice(i + 2, close).trim() });
        i = close + 2;
        continue;
      }
    }
    // $ ... $  (single dollars, heuristically validated)
    if (input[i] === "$" && input[i + 1] !== "$") {
      let close = input.indexOf("$", i + 1);
      // skip escaped closing dollars
      while (close !== -1 && input[close - 1] === "\\") close = input.indexOf("$", close + 1);
      if (close !== -1) {
        const content = input.slice(i + 1, close);
        if (isValidInlineDollar(content, input[close + 1] ?? "")) {
          flush();
          segments.push({ type: "inline", value: content });
          i = close + 1;
          continue;
        }
      }
    }
    // $$ ... $$ appearing mid-line — treat as inline-rendered display math
    if (input[i] === "$" && input[i + 1] === "$") {
      const close = input.indexOf("$$", i + 2);
      if (close !== -1) {
        const content = input.slice(i + 2, close).trim();
        if (content) {
          flush();
          segments.push({ type: "inline", value: content });
          i = close + 2;
          continue;
        }
      }
    }
    plain += input[i];
    i += 1;
  }
  flush();
  return segments;
}

// Detect block-math regions in a list of markdown lines, starting at index i.
// Handles:
//   $$            $$ x^2 $$          \[
//   x^2             (one line)         x^2
//   $$                                \]
// Returns { tex, nextIndex } when lines[i] opens a block, otherwise null.
export function matchBlockMath(lines, i) {
  const line = lines[i].trim();

  const single = line.match(/^\$\$(.+)\$\$$/);
  if (single && single[1].trim()) {
    return { tex: single[1].trim(), nextIndex: i + 1 };
  }

  if (line === "$$" || line === "\\[") {
    const closer = line === "$$" ? "$$" : "\\]";
    const body = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== closer) {
      body.push(lines[j]);
      j += 1;
    }
    if (j < lines.length && body.join("\n").trim()) {
      return { tex: body.join("\n").trim(), nextIndex: j + 1 };
    }
  }

  const bracketSingle = line.match(/^\\\[(.+)\\\]$/);
  if (bracketSingle && bracketSingle[1].trim()) {
    return { tex: bracketSingle[1].trim(), nextIndex: i + 1 };
  }

  return null;
}

// Quick check used to decide whether a piece of text needs the math pipeline
// at all (keeps the common no-math path allocation-free).
export function containsMath(text) {
  const input = String(text ?? "");
  return input.includes("$") || input.includes("\\(") || input.includes("\\[");
}
