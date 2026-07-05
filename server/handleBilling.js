// Peer — Stripe billing (checkout, customer portal, webhooks) + /api/usage.
// Card data never touches this server (Stripe Checkout hosts it); Pro is
// granted ONLY from a signature-verified webhook, never from a client
// callback; entitlement writes go through the service role (clients are
// RLS-blocked from subscriptions). Uses Stripe's REST API directly — no SDK.
import { createHmac, timingSafeEqual } from "node:crypto";
import { checkEntitlement, getServiceClient, resolveUser } from "./entitlements.js";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeRequest(path, params) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Stripe request failed (${response.status}).`);
  return data;
}

// ---- GET/POST /api/usage — the meter the client displays ----
export async function handleUsageRequest(req, res) {
  const user = await resolveUser(req.headers.authorization);
  if (!user) {
    sendJson(res, 401, { error: "Sign in first.", code: "auth_required" });
    return;
  }
  const entitlement = await checkEntitlement(user.userId, req.headers["x-peer-tz-offset"]);
  sendJson(res, 200, {
    plan: entitlement.plan,
    usedToday: entitlement.usedToday,
    allowance: entitlement.allowance,
    remaining: entitlement.remaining,
  });
}

// ---- POST /api/checkout — start a Pro subscription ----
export async function handleCheckoutRequest(req, res) {
  const user = await resolveUser(req.headers.authorization);
  if (!user) {
    sendJson(res, 401, { error: "Sign in first.", code: "auth_required" });
    return;
  }
  if (!stripeConfigured()) {
    sendJson(res, 501, { error: "Payments aren't configured yet — Pro is coming very soon." });
    return;
  }
  const body = await readJson(req);
  const interval = body.interval === "yearly" ? "yearly" : "monthly";
  const price = interval === "yearly" ? process.env.STRIPE_PRICE_ID_YEARLY : process.env.STRIPE_PRICE_ID_MONTHLY;
  if (!price) {
    sendJson(res, 501, { error: "Pricing isn't configured yet." });
    return;
  }
  const origin = String(body.origin || "").replace(/\/$/, "") || "http://localhost:5173";

  try {
    const session = await stripeRequest("/checkout/sessions", {
      mode: "subscription",
      client_reference_id: user.userId,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/?upgraded=1`,
      cancel_url: `${origin}/?upgrade=cancelled`,
      "subscription_data[metadata][user_id]": user.userId,
      "metadata[user_id]": user.userId,
      allow_promotion_codes: "true",
    });
    sendJson(res, 200, { url: session.url });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

// ---- POST /api/portal — manage/cancel the subscription ----
export async function handlePortalRequest(req, res) {
  const user = await resolveUser(req.headers.authorization);
  if (!user) {
    sendJson(res, 401, { error: "Sign in first.", code: "auth_required" });
    return;
  }
  if (!stripeConfigured()) {
    sendJson(res, 501, { error: "Payments aren't configured yet." });
    return;
  }
  const admin = getServiceClient();
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("user_id", user.userId).maybeSingle();
  if (!sub?.stripe_customer_id) {
    sendJson(res, 404, { error: "No subscription found." });
    return;
  }
  const body = await readJson(req);
  try {
    const session = await stripeRequest("/billing_portal/sessions", {
      customer: sub.stripe_customer_id,
      return_url: String(body.origin || "http://localhost:5173"),
    });
    sendJson(res, 200, { url: session.url });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

// ---- POST /api/stripe-webhook — the ONLY writer of Pro entitlements ----
export async function handleStripeWebhookRequest(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    sendJson(res, 501, { error: "Webhook secret not configured." });
    return;
  }
  const rawBody = await readRaw(req);
  if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"], secret)) {
    sendJson(res, 400, { error: "Invalid signature." });
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    sendJson(res, 400, { error: "Invalid payload." });
    return;
  }

  const admin = getServiceClient();
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.user_id;
      if (userId && session.mode === "subscription") {
        // idempotent: upserting the same completed session twice is a no-op
        await admin.from("subscriptions").upsert({
          user_id: userId,
          status: "active",
          plan: "pro",
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        }, { onConflict: "user_id" });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const userId = subscription.metadata?.user_id;
      const active = ["active", "trialing"].includes(subscription.status) && event.type !== "customer.subscription.deleted";
      const patch = {
        status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
        plan: active ? "pro" : "free",
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      };
      if (userId) {
        await admin.from("subscriptions").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
      } else {
        await admin.from("subscriptions").update(patch).eq("stripe_customer_id", subscription.customer);
      }
    }

    sendJson(res, 200, { received: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

// Stripe-Signature: t=<ts>,v1=<hmac sha256 of "<ts>.<payload>">
export function verifyStripeSignature(payload, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(
    String(header || "").split(",").map((pair) => pair.split("=").map((piece) => piece.trim())).filter((pair) => pair.length === 2),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req) {
  try {
    return JSON.parse(await readRaw(req) || "{}");
  } catch {
    return {};
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
