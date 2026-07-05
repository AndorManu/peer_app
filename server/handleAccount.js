// Account deletion: verifies the caller's own JWT, then erases their auth
// user via the service role — FK cascades wipe every table row. A user can
// only ever delete themselves; the service key never leaves the server.
import { createClient } from "@supabase/supabase-js";

export async function handleDeleteAccountRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    sendJson(res, 500, { error: "Account service is not configured." });
    return;
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    sendJson(res, 401, { error: "Sign in first." });
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    sendJson(res, 401, { error: "Invalid session." });
    return;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    sendJson(res, 500, { error: deleteError.message || "Deletion failed." });
    return;
  }

  sendJson(res, 200, { ok: true });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
