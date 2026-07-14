// Peer — transport security: headers, origin allow-listing, rate limiting.
// Applied to every response by server/dev.js; the same policies are the spec
// for production hosting (see supabase/README.md deploy notes).

// Origins allowed to call /api (browser Origin header check — blocks
// cross-site POSTs/SSE from foreign pages). Localhost on any port is allowed
// for dev; production origins come from PEER_ALLOWED_ORIGINS (comma-separated).
export function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin/no-Origin (curl, server-to-server)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  const extra = (process.env.PEER_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

export function applySecurityHeaders(res, { supabaseUrl = "" } = {}) {
  const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // 'unsafe-inline'/'unsafe-eval' in script-src are required by Vite DEV
  // tooling (HMR preamble) — a production host should drop them; everything
  // else is the real policy.
  // cdn.jsdelivr.net: Pyodide (in-browser Python + its package wheels) loads
  // from there — script for pyodide.js, connect for the .wasm/.whl fetches.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https://*.fal.media${supabaseHost ? ` https://${supabaseHost}` : ""}`,
    `connect-src 'self' ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=()");
  // meaningful only over HTTPS (production), harmless locally
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}

// ---- in-memory sliding-window rate limiter (per route + caller) ----
// Caller key = authenticated user id when available, else remote IP.
const buckets = new Map();
const LIMITS = {
  chat: { limit: 20, windowMs: 60_000 },
  image: { limit: 6, windowMs: 60_000 },
  "embed-doc": { limit: 12, windowMs: 60_000 },
  ocr: { limit: 6, windowMs: 60_000 },
  run: { limit: 10, windowMs: 60_000 },
  "delete-account": { limit: 3, windowMs: 3_600_000 },
  checkout: { limit: 10, windowMs: 60_000 },
  default: { limit: 120, windowMs: 60_000 },
};

export function callerKey(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) {
    // JWT payload sub — identification only (signature is verified later by
    // the endpoint itself before anything sensitive happens)
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      if (payload.sub) return `u:${payload.sub}`;
    } catch { /* fall through to IP */ }
  }
  return `ip:${req.socket?.remoteAddress || "unknown"}`;
}

export function rateLimit(route, req, res) {
  const rule = LIMITS[route] || LIMITS.default;
  const key = `${route}:${callerKey(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const fresh = bucket.filter((ts) => now - ts < rule.windowMs);
  if (fresh.length >= rule.limit) {
    const retryAfter = Math.ceil((rule.windowMs - (now - fresh[0])) / 1000);
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
    res.end(JSON.stringify({ error: "Slow down a little — too many requests. Try again shortly.", code: "rate_limited" }));
    return false;
  }
  fresh.push(now);
  buckets.set(key, fresh);
  // opportunistic cleanup so the map can't grow unbounded
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (!v.some((ts) => now - ts < 3_600_000)) buckets.delete(k);
    }
  }
  return true;
}

// Origin gate for state-changing/expensive API routes.
export function enforceOrigin(req, res) {
  if (isAllowedOrigin(req.headers.origin)) return true;
  res.statusCode = 403;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Origin not allowed." }));
  return false;
}
