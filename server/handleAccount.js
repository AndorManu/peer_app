// Account deletion: verifies the caller's own JWT, then erases their auth
// user via the service role — FK cascades wipe every table row. A user can
// only ever delete themselves; the service key never leaves the server.
import { createClient } from "@supabase/supabase-js";

// Mirrors DOC_PREVIEW_BUCKET in src/materials.js — not imported directly
// because that module pulls in the browser-only pdf.js (Vite `?url` import),
// which doesn't resolve under plain Node.
const DOC_PREVIEW_BUCKET = "doc-previews";

// Best-effort purge of every Storage object under doc-previews/<user_id>/,
// run BEFORE the auth user is deleted. `userId` must always come from the
// JWT-verified session (admin.auth.getUser), never a client-supplied value.
// list() pages can include virtual folder/sub-prefix entries (id: null)
// alongside real objects (RLS only pins the first path segment, so a
// user's own nested sub-prefixes can fill a page with nothing but folder
// entries); remove() silently no-ops on those, so they're filtered out
// before removal. Folders are never removed, so they keep occupying their
// slot in the name-sorted listing, while removed real objects vanish from
// it — so the offset for the NEXT list() call only advances by the number
// of folder entries left behind in THIS page, never by the full page
// size. That way a page composed entirely (or mostly) of folders — which
// an attacker could arrange to sort alphabetically before a victim's real
// objects — still advances the scan instead of stalling on page one.
// maxPages is a hard backstop bounding worst-case adversarial folder-only
// listings to a fixed number of round trips instead of looping unbounded.
export async function purgeDocPreviews(admin, userId) {
  const bucket = admin.storage.from(DOC_PREVIEW_BUCKET);
  const pageSize = 100;
  const maxPages = 1000;
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await bucket.list(userId, { limit: pageSize, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    const objects = data.filter((entry) => entry.id != null);
    if (objects.length > 0) {
      const paths = objects.map((entry) => `${userId}/${entry.name}`);
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw removeError;
    }
    if (data.length < pageSize) break;
    offset += data.length - objects.length;
  }
}

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

  try {
    await purgeDocPreviews(admin, data.user.id);
  } catch (purgeError) {
    // Non-fatal: a Storage hiccup must never block account deletion. The
    // orphaned objects are harmless and this is logged for follow-up.
    console.error("account deletion: doc-previews purge failed", purgeError);
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
