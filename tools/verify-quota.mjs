// Peer — live verification of AI quota enforcement against the running dev
// server + Supabase project. Proves the gate can't be bypassed by clients:
//   unauth → 401 · authed free → 200 + metered · spent quota → 402 ·
//   Pro plan → Sonnet model + big allowance · webhook signature required.
// Usage: PEER_DEV_URL=http://127.0.0.1:<port> node tools/verify-quota.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { verifyStripeSignature } from "../server/handleBilling.js";

loadDotEnv();
const DEV_URL = process.env.PEER_DEV_URL || "http://127.0.0.1:5173";

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const stamp = Date.now();
const email = `peer-quota-${stamp}@example.com`;
const password = `Peer-quota-${stamp}!`;
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const userId = created.user.id;

try {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn } = await client.auth.signInWithPassword({ email, password });
  const token = signIn.session.access_token;

  const chatBody = JSON.stringify({
    system: "You are a terse test assistant.",
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
  });
  const headers = (withAuth = true) => ({
    "Content-Type": "application/json",
    "x-peer-tz-offset": String(new Date().getTimezoneOffset()),
    ...(withAuth ? { Authorization: `Bearer ${token}` } : {}),
  });

  // 1. unauthenticated AI call is refused
  const unauth = await fetch(`${DEV_URL}/api/chat`, { method: "POST", headers: headers(false), body: chatBody });
  check("unauthenticated chat is refused (401)", unauth.status === 401);

  // 2. authed free user streams + gets metered
  const ok = await fetch(`${DEV_URL}/api/chat`, { method: "POST", headers: headers(), body: chatBody });
  check("authed free chat streams (200)", ok.status === 200);
  await ok.text(); // drain the stream so usage is recorded
  await new Promise((r) => setTimeout(r, 1200));
  const { data: events } = await admin.from("usage_events").select("model, tokens_in, tokens_out").eq("user_id", userId);
  check("usage was metered server-side", (events || []).length >= 1, JSON.stringify(events?.[0] || {}));
  check("free plan routed to Haiku", /haiku/.test(events?.[0]?.model || ""), events?.[0]?.model);

  // 3. usage endpoint reports the meter
  const usage = await (await fetch(`${DEV_URL}/api/usage`, { headers: headers() })).json();
  check("usage endpoint reports free allowance", usage.plan === "free" && usage.allowance === 30000, JSON.stringify(usage));

  // 4. spend the day's quota (server-side insert; clients are RLS-blocked) → 402
  await admin.from("usage_events").insert({ user_id: userId, kind: "chat", model: "test", tokens_in: 15000, tokens_out: 15000 });
  const spent = await fetch(`${DEV_URL}/api/chat`, { method: "POST", headers: headers(), body: chatBody });
  const spentBody = await spent.json().catch(() => ({}));
  check("exhausted quota hits a clean paywall (402)", spent.status === 402 && spentBody.code === "quota_exhausted", `status ${spent.status}`);

  // 5. Pro plan lifts the cap and routes to Sonnet
  await admin.from("subscriptions").upsert({ user_id: userId, status: "active", plan: "pro" }, { onConflict: "user_id" });
  const proUsage = await (await fetch(`${DEV_URL}/api/usage`, { headers: headers() })).json();
  check("Pro allowance is 500k", proUsage.plan === "pro" && proUsage.allowance === 500000, JSON.stringify(proUsage));
  const pro = await fetch(`${DEV_URL}/api/chat`, { method: "POST", headers: headers(), body: chatBody });
  check("Pro chat admitted past the free cap (200)", pro.status === 200);
  await pro.text();
  await new Promise((r) => setTimeout(r, 1200));
  const { data: proEvents } = await admin.from("usage_events").select("model").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
  check("Pro routed to Sonnet", /sonnet/.test(proEvents?.[0]?.model || ""), proEvents?.[0]?.model);

  // 6. webhook signature verification: forged payloads rejected, signed accepted
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const secret = "whsec_test_secret";
  const ts = Math.floor(Date.now() / 1000);
  const good = `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex")}`;
  check("valid webhook signature accepted", verifyStripeSignature(payload, good, secret) === true);
  check("forged webhook signature rejected", verifyStripeSignature(payload, `t=${ts},v1=${"0".repeat(64)}`, secret) === false);
  check("stale webhook timestamp rejected", verifyStripeSignature(payload, `t=${ts - 9999},v1=${createHmac("sha256", secret).update(`${ts - 9999}.${payload}`).digest("hex")}`, secret) === false);

  // 7. checkout without Stripe keys degrades gracefully
  const checkout = await fetch(`${DEV_URL}/api/checkout`, { method: "POST", headers: headers(), body: JSON.stringify({ interval: "monthly" }) });
  check("checkout is graceful without Stripe keys (501)", checkout.status === 501);
} finally {
  await admin.auth.admin.deleteUser(userId).catch(() => {});
  console.log("cleanup: test user removed");
}

process.exit(failures ? 1 : 0);

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && value && process.env[key] === undefined) process.env[key] = value;
  }
}
