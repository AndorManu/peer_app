// Screenshot harness for the Learning Brain.
// Seeds a rich local state, opens the brain view, and captures screenshots
// so we can iterate on the visualization without manual clicking.
//
// Usage: node tools/brain-shot.mjs [outPrefix] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outPrefix = process.argv[2] || "brain-after";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
const outDir = resolve(process.cwd(), "artifacts");
mkdirSync(outDir, { recursive: true });

const now = Date.now();
const day = 86400000;

function concept(label, confidence, status, ago = 1) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    key: label.toLowerCase(),
    label,
    confidence,
    status,
    evidence: `Seen across your work on ${label}.`,
    createdAt: now - ago * day,
    updatedAt: now - ago * day,
  };
}
function misc(conceptName, belief, correction, ago = 2) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    concept: conceptName,
    belief,
    correction,
    createdAt: now - ago * day,
  };
}
function note(projectId, title, content, tags, ago = 1) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    projectId,
    title,
    content,
    tags,
    category: "note",
    createdAt: now - ago * day,
  };
}
function chat(projectId, name, msgs, ago = 1) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    projectId,
    createdAt: now - ago * day,
    updatedAt: now - ago * day,
    messages: msgs.map((m, i) => ({
      id: Math.random().toString(36).slice(2, 10),
      role: i % 2 === 0 ? "user" : "assistant",
      content: m,
      createdAt: now - ago * day,
    })),
  };
}
function doc(name, kind = "pdf") {
  return { id: Math.random().toString(36).slice(2, 10), name, kind, pages: 4, chars: 4200, text: name, addedAt: now - day };
}

const pC = "p_c", pN = "p_net", pW = "p_web";

const state = {
  theme: "dark",
  landingComplete: true,
  onboardingComplete: true,
  account: { id: "a1", name: "Andor", email: "andor@example.com", provider: "email", verified: true, createdAt: now, lastLoginAt: now },
  profile: { subject: "C Programming", goal: "Build a small shell in C", level: "intermediate", updatedAt: now },
  notes: [
    note(pC, "Pointers cheat sheet", "A pointer stores an address. Dereferencing with * reads the value at that address.", ["pointers", "memory"]),
    note(pC, "Struct memory layout", "Structs pack fields in order; padding aligns memory for the CPU.", ["structs", "memory"]),
    note(pC, "Recursion base cases", "Every recursion needs a base case or it overflows the stack.", ["recursion"]),
    note(pN, "TCP handshake", "SYN, SYN-ACK, ACK establishes a TCP connection before data flows.", ["tcp", "networking"]),
    note(pW, "SQL injection notes", "Never concatenate user input into SQL; use parameterized queries.", ["security", "sql"]),
  ],
  studyRooms: [],
  projects: [
    {
      id: pC, name: "C Programming", color: "#00d4ff",
      docs: [doc("pointers-cheatsheet.pdf"), doc("memory-layout-diagram.png", "image"), doc("structs-reference.pdf")],
      mastery: {
        concepts: [
          concept("Pointers", 0.72, "strengthening", 1),
          concept("Memory", 0.55, "learning", 2),
          concept("Structs", 0.38, "weak", 1),
          concept("Recursion", 0.61, "learning", 3),
          concept("Arrays", 0.81, "strong", 5),
          concept("Functions", 0.9, "strong", 6),
        ],
        misconceptions: [
          misc("Pointers", "Pointer stores the value itself.", "A pointer stores an address; dereferencing reads the value."),
          misc("Structs", "Struct size equals the sum of fields.", "Padding/alignment can make it larger."),
        ],
        reflections: [],
        updatedAt: now - day,
      },
    },
    {
      id: pN, name: "Networking", color: "#00ff99",
      docs: [doc("tcp-ip-stack.pdf"), doc("osi-model.png", "image")],
      mastery: {
        concepts: [
          concept("TCP", 0.48, "learning", 2),
          concept("Networking", 0.5, "learning", 2),
          concept("DNS", 0.33, "weak", 4),
          concept("Routing", 0.66, "strengthening", 3),
        ],
        misconceptions: [misc("DNS", "DNS uses TCP only.", "DNS mostly uses UDP, TCP for large responses.")],
        reflections: [],
        updatedAt: now - 2 * day,
      },
    },
    {
      id: pW, name: "Web Security", color: "#ff5b80",
      docs: [doc("owasp-top-10.pdf"), doc("auth-flows.pdf")],
      mastery: {
        concepts: [
          concept("Security", 0.44, "weak", 1),
          concept("Authentication", 0.58, "learning", 2),
          concept("SQL", 0.4, "weak", 3),
          concept("Sessions", 0.62, "learning", 4),
        ],
        misconceptions: [misc("Authentication", "Hashing passwords is the same as encrypting.", "Hashing is one-way; encryption is reversible.")],
        reflections: [],
        updatedAt: now - day,
      },
    },
  ],
  chats: [
    chat(pC, "Why use pointers?", ["Why do we even need pointers in C?", "Pointers let you share and mutate memory without copying."]),
    chat(pC, "Recursion vs loops", ["When is recursion better than a loop?", "Recursion shines for trees and divide-and-conquer."]),
    chat(pN, "TCP vs UDP", ["What is the difference between TCP and UDP?", "TCP is reliable and ordered; UDP is fast and connectionless."]),
    chat(pW, "Stop SQL injection", ["How do I prevent SQL injection?", "Use parameterized queries and never trust user input."]),
  ],
  activeId: null,
  flashcards: [
    { id: "d1", projectId: pC, chatName: "Pointers recall", createdAt: now - day, cards: [{ id: "c1", question: "What does a pointer store?", answer: "An address." }] },
    { id: "d2", projectId: pN, chatName: "Networking recall", createdAt: now - day, cards: [{ id: "c2", question: "TCP handshake steps?", answer: "SYN, SYN-ACK, ACK." }] },
  ],
};

async function launch() {
  const channels = ["msedge", "chrome", "chrome-beta"];
  let lastErr;
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({ channel, headless: true });
      console.log(`Launched via channel: ${channel}`);
      return browser;
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    const browser = await chromium.launch({ headless: true });
    console.log("Launched bundled chromium");
    return browser;
  } catch (err) {
    lastErr = err;
  }
  throw lastErr;
}

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
page.on("console", (msg) => { if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text()); });

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.evaluate((s) => localStorage.setItem("peer-app-state-v1", JSON.stringify(s)), state);
await page.reload({ waitUntil: "networkidle" });

// Open the brain view.
await page.getByRole("button", { name: "Brain", exact: false }).first().click();
await page.waitForSelector(".brain-3d-canvas canvas", { timeout: 10000 });
await page.waitForTimeout(3200); // let the simulation settle

const card = page.locator(".brain-map-card");
await card.screenshot({ path: resolve(outDir, `${outPrefix}.png`) });
await page.screenshot({ path: resolve(outDir, `${outPrefix}-full.png`) });

// Hover a specific high-connectivity node to verify the focus effect.
const target = page.locator(".brain-node-label", { hasText: "C Programming" }).first();
if (await target.count()) {
  const lb = await target.boundingBox();
  if (lb) {
    // The label sits ~14px below the node centre; aim slightly above it to hit the sphere.
    const nx = lb.x + lb.width / 2;
    const ny = lb.y - 20;
    await page.mouse.move(nx, ny);
    await page.waitForTimeout(900);
    await card.screenshot({ path: resolve(outDir, `${outPrefix}-hover.png`) });

    // Click to select, then move the cursor away to clear hover — selection should
    // emphasise the node without dimming the rest of the graph.
    await page.mouse.click(nx, ny);
    const cardBox = await card.boundingBox();
    await page.mouse.move(cardBox.x + cardBox.width - 12, cardBox.y + 12);
    await page.waitForTimeout(900);
    await card.screenshot({ path: resolve(outDir, `${outPrefix}-selected.png`) });
  }
}

console.log("Saved screenshots to artifacts/");
await browser.close();
