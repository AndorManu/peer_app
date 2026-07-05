import { createServer as createHttpServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import { handleChatRequest } from "./handleChat.js";
import { handleImageRequest } from "./handleImage.js";
import { handleRunRequest } from "./handleRun.js";

loadDotEnv();

const port = Number(process.env.PORT || 5173);

// `vite` is assigned right after the server is constructed; requests only
// arrive once listen() runs, so the closure below never sees it undefined.
let vite;

const server = createHttpServer(async (req, res) => {
  try {
    // Public client config — ONLY values that are safe in a browser
    // (the anon key is designed to be public; RLS does the protecting).
    if (req.url?.startsWith("/api/config")) {
      loadDotEnv({ override: true });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        supabaseUrl: process.env.SUPABASE_URL || "",
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
      }));
      return;
    }

    if (req.url?.startsWith("/api/chat")) {
      loadDotEnv({ override: true });
      await handleChatRequest(req, res);
      return;
    }

    if (req.url?.startsWith("/api/image")) {
      loadDotEnv({ override: true });
      await handleImageRequest(req, res);
      return;
    }

    if (req.url?.startsWith("/api/run")) {
      await handleRunRequest(req, res);
      return;
    }

    vite.middlewares(req, res, (err) => {
      if (err) {
        vite.ssrFixStacktrace(err);
        res.statusCode = 500;
        res.end(err.stack);
      }
    });
  } catch (err) {
    vite.ssrFixStacktrace(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message || "Unexpected server error" }));
  }
});

vite = await createViteServer({
  appType: "spa",
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    middlewareMode: true,
    // Bind HMR's websocket to this same http server so hot reload works on
    // whatever port we were given (instead of trying Vite's default port).
    hmr: { server },
  },
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Peer is running at http://127.0.0.1:${port}`);
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
