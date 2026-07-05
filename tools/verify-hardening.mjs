// Peer — transport hardening verification against the running dev server.
// Usage: PEER_DEV_URL=http://127.0.0.1:<port> node tools/verify-hardening.mjs
const DEV_URL = process.env.PEER_DEV_URL || "http://127.0.0.1:5173";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

// 1) security headers on every response
const page = await fetch(`${DEV_URL}/`);
const h = (name) => page.headers.get(name);
check("Content-Security-Policy present", Boolean(h("content-security-policy")), (h("content-security-policy") || "").slice(0, 60) + "…");
check("CSP frame-ancestors 'none'", /frame-ancestors 'none'/.test(h("content-security-policy") || ""));
check("CSP has no wildcard default-src", !/default-src[^;]*\*/.test(h("content-security-policy") || ""));
check("X-Content-Type-Options nosniff", h("x-content-type-options") === "nosniff");
check("X-Frame-Options DENY", h("x-frame-options") === "DENY");
check("Referrer-Policy set", Boolean(h("referrer-policy")));
check("HSTS set", /max-age=\d+/.test(h("strict-transport-security") || ""));

// 2) foreign Origin is rejected on API routes
const foreign = await fetch(`${DEV_URL}/api/config`, { headers: { Origin: "https://evil.example.com" } });
check("foreign Origin rejected on /api (403)", foreign.status === 403);
const local = await fetch(`${DEV_URL}/api/config`, { headers: { Origin: "http://localhost:5173" } });
check("localhost Origin accepted", local.status === 200);

// 3) burst of unauthenticated chat requests gets throttled (limit 20/min)
let saw401 = 0;
let saw429 = 0;
for (let i = 0; i < 30; i += 1) {
  const res = await fetch(`${DEV_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: "x", messages: [{ role: "user", content: "x" }] }),
  });
  if (res.status === 401) saw401 += 1;
  if (res.status === 429) saw429 += 1;
  await res.text();
}
check("burst throttled: 429s after the per-minute limit", saw429 >= 8, `401×${saw401}, 429×${saw429} of 30`);

// 4) rate-limited response is well-formed
const last = await fetch(`${DEV_URL}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ system: "x", messages: [{ role: "user", content: "x" }] }),
});
if (last.status === 429) {
  const body = await last.json();
  check("429 carries Retry-After + friendly error", Boolean(last.headers.get("retry-after")) && body.code === "rate_limited");
} else {
  check("429 carries Retry-After + friendly error", false, `expected 429, got ${last.status}`);
}

process.exit(failures ? 1 : 0);
