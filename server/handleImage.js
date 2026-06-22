const MAX_BODY = 4_000;

export async function handleImageRequest(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: "Add OPENAI_API_KEY to .env to enable image generation." });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const prompt = String(payload.prompt || "").slice(0, 900);
  if (!prompt) return sendJson(res, 400, { error: "Missing prompt." });

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, { error: data.error?.message || "Image generation failed." });
    }

    sendJson(res, 200, { url: data.data[0].url });
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
