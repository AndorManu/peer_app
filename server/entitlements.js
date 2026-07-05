// Peer — server-side entitlements: plans, daily token quotas, model routing,
// and usage metering. The client is never trusted: it sends a JWT, the server
// decides everything else. subscriptions/usage_events are client-read-only
// (RLS), so a browser can neither self-upgrade nor forge its meter.
import { createClient } from "@supabase/supabase-js";

// Freemium economics (see FABLE5 plan M5): free is enough to get hooked on
// Haiku; Pro runs Sonnet with a fair-use ceiling that soft-falls back to
// Haiku so one power user can't run a loss.
export const PLANS = {
  free: {
    id: "free",
    dailyTokens: 30_000,
    model: () => process.env.PEER_MODEL_FREE || "claude-haiku-4-5-20251001",
  },
  pro: {
    id: "pro",
    dailyTokens: 500_000,
    model: (usedToday) => (
      usedToday > 150_000
        ? (process.env.PEER_MODEL_FREE || "claude-haiku-4-5-20251001") // fair-use soft fallback
        : (process.env.PEER_MODEL_PRO || "claude-sonnet-4-6")
    ),
  },
};

// $ per 1M tokens (input, output) — for cost tracking in usage_events.
const MODEL_COST = {
  "claude-haiku-4-5-20251001": [1, 5],
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-8": [15, 75],
  "claude-fable-5": [10, 50],
};

export function costUsd(model, tokensIn, tokensOut) {
  const [inRate, outRate] = MODEL_COST[model] || [3, 15];
  return (tokensIn * inRate + tokensOut * outRate) / 1_000_000;
}

let serviceClient = null;
export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return serviceClient;
}

// Resolve the caller from a Bearer token. Returns { userId } or null.
export async function resolveUser(authHeader) {
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { userId: data.user.id };
}

// "Daily" means the USER'S day: the client sends its UTC offset in minutes
// (x-peer-tz-offset, JS getTimezoneOffset convention) and we meter from their
// most recent local midnight.
export function localMidnightUtc(tzOffsetMinutes, now = new Date()) {
  const offset = Number.isFinite(Number(tzOffsetMinutes)) ? Number(tzOffsetMinutes) : 0;
  const localMs = now.getTime() - offset * 60_000;
  const local = new Date(localMs);
  const midnightLocalMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightLocalMs + offset * 60_000);
}

export async function getPlan(userId) {
  const admin = getServiceClient();
  if (!admin) return PLANS.free;
  const { data } = await admin
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  const active = data
    && data.plan === "pro"
    && ["active", "trialing"].includes(data.status)
    && (!data.current_period_end || Date.parse(data.current_period_end) > Date.now());
  return active ? PLANS.pro : PLANS.free;
}

export async function getUsageToday(userId, tzOffsetMinutes) {
  const admin = getServiceClient();
  if (!admin) return 0;
  const since = localMidnightUtc(tzOffsetMinutes).toISOString();
  const { data } = await admin
    .from("usage_events")
    .select("tokens_in, tokens_out")
    .eq("user_id", userId)
    .gte("created_at", since);
  return (data || []).reduce((sum, row) => sum + (row.tokens_in || 0) + (row.tokens_out || 0), 0);
}

// Everything the chat proxy needs to admit (or refuse) a request.
export async function checkEntitlement(userId, tzOffsetMinutes) {
  const plan = await getPlan(userId);
  const usedToday = await getUsageToday(userId, tzOffsetMinutes);
  return {
    plan: plan.id,
    usedToday,
    allowance: plan.dailyTokens,
    remaining: Math.max(0, plan.dailyTokens - usedToday),
    exhausted: usedToday >= plan.dailyTokens,
    model: plan.model(usedToday),
  };
}

export async function recordUsage({ userId, kind = "chat", model, tokensIn = 0, tokensOut = 0 }) {
  const admin = getServiceClient();
  if (!admin || !userId) return;
  await admin.from("usage_events").insert({
    user_id: userId,
    kind,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd(model, tokensIn, tokensOut),
  }).then(() => {}, () => {});
}
