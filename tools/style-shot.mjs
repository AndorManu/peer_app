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
      id: pC, name: "C Programming", color: "#6d5dfc",
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
      id: pN, name: "Networking", color: "#12a594",
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
      id: pW, name: "Web Security", color: "#ef6f6c",
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

state.activeId = state.chats[0].id;

async function launch() {
  const channels = ["msedge", "chrome", "chrome-beta"];
  let lastErr;
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({ channel, headless: true });
      console.log(`Launched via channel: ${channel}`);
      return browser;
    } catch (err) { lastErr = err; }
  }
  try { return await chromium.launch({ headless: true }); } catch (err) { lastErr = err; }
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
await page.waitForTimeout(1500);

// 1) Chat view
await page.screenshot({ path: resolve(outDir, `${outPrefix}-chat.png`) });

// 2) Profile/insights view if present
try {
  await page.getByRole("button", { name: "Brain", exact: false }).first().click();
  await page.waitForSelector(".brain-3d-canvas canvas", { timeout: 10000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(outDir, `${outPrefix}-brain.png`) });
  const card = page.locator(".brain-map-card");
  if (await card.count()) await card.screenshot({ path: resolve(outDir, `${outPrefix}-brain-card.png`) });
} catch (e) { console.log("brain capture failed:", e.message); }


for (const [label, key] of [["Notes","notes"],["Cards","flashcards"],["Rooms","community"],["Code","code"]]) {
  try {
    await page.click(`[data-nav="${key}"]`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(outDir, `${outPrefix}-${key}.png`) });
  } catch (e) { console.log(label+" capture failed:", e.message); }
}


try {
  const gc = await page.locator('[title="Settings"]').count();
  console.log("settings gear present:", gc);
  if (gc>0){ await page.locator('[title="Settings"]').first().click(); await page.waitForTimeout(700); await page.screenshot({ path: resolve(outDir, `${outPrefix}-settings.png`) }); }
} catch(e){ console.log("settings capture:", e.message); }


try {
  await page.click('[data-nav="code"]');
  await page.waitForTimeout(500);
  await page.getByText("Run", { exact: true }).click();
  await page.waitForTimeout(1000);
  console.log("RUN_PRODUCED_olleh:", await page.evaluate(() => document.body.innerText.includes("olleh")));
} catch (e) { console.log("run test:", e.message); }


try { await page.click('[title="Profile"]'); await page.waitForTimeout(700); await page.screenshot({ path: resolve(outDir, `${outPrefix}-profile.png`) }); } catch(e){ console.log("profile cap:", e.message); }


try {
  await page.click('[data-nav="chat"]'); await page.waitForTimeout(500);
  await page.evaluate(()=>{ const t=document.querySelector('.messages'); if(t) t.scrollTop=0; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, `${outPrefix}-chattop.png`) });
  await page.click('[data-nav="brain"]'); await page.waitForTimeout(3200);
  await page.screenshot({ path: resolve(outDir, `${outPrefix}-brain.png`) });
} catch(e){ console.log("extra cap:", e.message); }

console.log("Saved screenshots to artifacts/");
await browser.close();
