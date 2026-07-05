// Peer — image generation proxy (fal.ai FLUX schnell). Gated + metered like
// chat: requires a Supabase session and remaining daily quota; images are
// heavier-weighted (IMAGE_TOKEN_EQUIVALENT) since the per-call cost is real
// even on a cheap model. Alt text always accompanies the image (a11y spec).
import { IMAGE_TOKEN_EQUIVALENT, checkEntitlement, recordUsage, resolveUser } from "./entitlements.js";

const MAX_BODY = 4_000;
const FAL_MODEL = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";
// Actual fal.ai list price for FLUX schnell is roughly $0.003/image; kept
// configurable since the owner may switch models.
const FAL_IMAGE_COST_USD = Number(process.env.FAL_IMAGE_COST_USD || 0.003);

export async function handleImageRequest(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.IMAGE_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: "Add IMAGE_API_KEY to .env to enable image generation." });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const prompt = String(payload.prompt || "").slice(0, 900);
  const altText = String(payload.altText || payload.topic || prompt).slice(0, 300);
  if (!prompt) return sendJson(res, 400, { error: "Missing prompt." });

  // ---- entitlement gate (same pattern as chat: auth + quota required when
  // Supabase is configured; a bare clone without Supabase keys skips it) ----
  let userId = null;
  const gated = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (gated) {
    const user = await resolveUser(req.headers.authorization);
    if (!user) {
      return sendJson(res, 401, { error: "Sign in to generate images.", code: "auth_required" });
    }
    userId = user.userId;
    const entitlement = await checkEntitlement(userId, req.headers["x-peer-tz-offset"]);
    if (entitlement.exhausted || entitlement.remaining < IMAGE_TOKEN_EQUIVALENT) {
      return sendJson(res, 402, {
        error: "You're out of today's AI allowance for images. Upgrade to Pro for a much bigger daily allowance, or come back after midnight.",
        code: "quota_exhausted",
        plan: entitlement.plan,
        usedToday: entitlement.usedToday,
        allowance: entitlement.allowance,
      });
    }
  }

  try {
    const response = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: "landscape_16_9",
        num_images: 1,
        num_inference_steps: 4,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, { error: data.detail || data.error || "Image generation failed." });
    }

    const image = data.images?.[0];
    if (!image?.url) {
      return sendJson(res, 502, { error: "The image provider returned no image." });
    }

    if (userId) {
      await recordUsage({
        userId,
        kind: "image",
        model: FAL_MODEL,
        tokensOut: IMAGE_TOKEN_EQUIVALENT,
        costUsdOverride: FAL_IMAGE_COST_USD,
      });
    }

    sendJson(res, 200, { url: image.url, altText, width: image.width, height: image.height });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Image generation failed." });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error("Request too large."));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid JSON.")); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}
