// Peer — production account deletion (Supabase Edge Function).
// Mirrors server/handleAccount.js: verifies the caller's own JWT, then erases
// their auth user via the service role; FK cascades wipe every table row.
// Deploy: supabase functions deploy delete-account --project-ref <ref>
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS: only the app's own origins (PEER_ALLOWED_ORIGINS, comma-separated)
// plus localhost for development — never *.
const ALLOWED_ORIGINS = (Deno.env.get("PEER_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const ok = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || ALLOWED_ORIGINS.includes(origin);
  return {
    ...(ok && origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
let CORS_HEADERS: Record<string, string> = {};

// Mirrors DOC_PREVIEW_BUCKET in src/materials.js.
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
async function purgeDocPreviews(admin: ReturnType<typeof createClient>, userId: string) {
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

Deno.serve(async (req) => {
  CORS_HEADERS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sign in first." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json(401, { error: "Invalid session." });

  try {
    await purgeDocPreviews(admin, data.user.id);
  } catch (purgeError) {
    // Non-fatal: a Storage hiccup must never block account deletion. The
    // orphaned objects are harmless and this is logged for follow-up.
    console.error("account deletion: doc-previews purge failed", purgeError);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) return json(500, { error: deleteError.message || "Deletion failed." });

  return json(200, { ok: true });
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
