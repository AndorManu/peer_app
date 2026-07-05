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
