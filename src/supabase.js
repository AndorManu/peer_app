// Supabase browser client. Config (URL + anon key — safe for the client)
// comes from the server via /api/config so .env stays the single source of
// truth and no key is baked into the bundle. supabase-js loads lazily so
// logged-out/offline users never pay for it.
let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) return null;
        const { supabaseUrl, supabaseAnonKey } = await response.json();
        if (!supabaseUrl || !supabaseAnonKey) return null;
        const { createClient } = await import("@supabase/supabase-js");
        return createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
      } catch {
        return null;
      }
    })();
  }
  return clientPromise;
}
