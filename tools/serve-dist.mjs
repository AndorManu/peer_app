// Peer — serves the production build (`dist/`) with the EXACT headers from
// `public/_headers`, so the strict CSP can be verified against a real build
// instead of the dev server's relaxed policy. `/api/*` is proxied to the
// same request handlers `server/dev.js` uses, so chat/run/rag/billing all
// work for a real smoke test.
//
// Usage: npm run build && node tools/serve-dist.mjs [port]
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve, extname, join, sep } from "node:path";
import { handleChatRequest } from "../server/handleChat.js";
import { handleImageRequest } from "../server/handleImage.js";
import { handleRunRequest } from "../server/handleRun.js";
import { handleDeleteAccountRequest } from "../server/handleAccount.js";
import {
  handleCheckoutRequest,
  handlePortalRequest,
  handleStripeWebhookRequest,
  handleUsageRequest,
} from "../server/handleBilling.js";
import { handleEmbedDocRequest, handleOcrRequest } from "../server/handleRag.js";
import { enforceOrigin, rateLimit } from "../server/security.js";

loadDotEnv();

const port = Number(process.argv[2] || process.env.PORT || 4174);
const distDir = resolve(process.cwd(), "dist");
if (!existsSync(distDir)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const headers = parseHeadersFile(resolve(process.cwd(), "public/_headers"));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain",
};

const server = createServer(async (req, res) => {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);

  try {
    if (req.url?.startsWith("/api/")) {
      if (!enforceOrigin(req, res)) return;
      const route = req.url.split("?")[0].replace("/api/", "").split("/")[0];
      if (!rateLimit(route, req, res)) return;
    }

    if (req.url?.startsWith("/api/config")) {
      loadDotEnv({ override: true });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        supabaseUrl: process.env.SUPABASE_URL || "",
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
      }));
      return;
    }
    if (req.url?.startsWith("/api/chat")) { loadDotEnv({ override: true }); await handleChatRequest(req, res); return; }
    if (req.url?.startsWith("/api/image")) { loadDotEnv({ override: true }); await handleImageRequest(req, res); return; }
    if (req.url?.startsWith("/api/run")) { await handleRunRequest(req, res); return; }
    if (req.url?.startsWith("/api/delete-account")) { loadDotEnv({ override: true }); await handleDeleteAccountRequest(req, res); return; }
    if (req.url?.startsWith("/api/embed-doc")) { loadDotEnv({ override: true }); await handleEmbedDocRequest(req, res); return; }
    if (req.url?.startsWith("/api/ocr")) { loadDotEnv({ override: true }); await handleOcrRequest(req, res); return; }
    if (req.url?.startsWith("/api/usage")) { loadDotEnv({ override: true }); await handleUsageRequest(req, res); return; }
    if (req.url?.startsWith("/api/checkout")) { loadDotEnv({ override: true }); await handleCheckoutRequest(req, res); return; }
    if (req.url?.startsWith("/api/portal")) { loadDotEnv({ override: true }); await handlePortalRequest(req, res); return; }
    if (req.url?.startsWith("/api/stripe-webhook")) { loadDotEnv({ override: true }); await handleStripeWebhookRequest(req, res); return; }

    serveStatic(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message || "Unexpected server error" }));
  }
});

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = join(distDir, urlPath);
  // guard against escaping dist/ before falling back to the SPA shell
  if (!filePath.startsWith(distDir + sep)) filePath = join(distDir, "index.html");
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(distDir, "index.html");
  try {
    res.setHeader("Content-Type", MIME[extname(filePath)] || "application/octet-stream");
    createReadStream(filePath).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

// Minimal Netlify/Cloudflare-Pages "_headers" file parser: a "/*" (or exact
// path) block followed by indented "Name: value" lines. Only the "/*" block
// is applied here since verification serves the whole SPA under one policy.
function parseHeadersFile(path) {
  if (!existsSync(path)) { console.warn(`No _headers file at ${path} — serving with no security headers.`); return {}; }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const result = {};
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { inBlock = line.trim() === "/*"; continue; }
    if (!inBlock) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving dist/ with production headers at http://127.0.0.1:${port}`);
});

function loadDotEnv({ override = false } = {}) {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key || !value) continue;
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}
