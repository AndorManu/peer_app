// Background cloud sync loop. Local IndexedDB stays the source of truth; when
// a Supabase session exists this pushes local changes and pulls remote ones
// every SYNC_INTERVAL_MS, on tab focus, and on reconnect. Without a session
// (guest mode, offline, no config) it stays dormant — the app works fully.
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase.js";
import { runSyncCycle } from "./sync.js";
import { loadSyncMeta, saveSyncMeta } from "./storage.js";

const SYNC_INTERVAL_MS = 30_000;

export function useCloudSync({ getState, applyState, enabled = true }) {
  const [status, setStatus] = useState("starting"); // starting | signed-out | idle | syncing | error | offline
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [lastError, setLastError] = useState("");
  const busyRef = useRef(false);
  const metaRef = useRef(null);
  const sessionRef = useRef(null);

  const syncNow = useCallback(async () => {
    if (busyRef.current || !sessionRef.current) return;
    const client = await getSupabase();
    if (!client) return;
    busyRef.current = true;
    setStatus("syncing");
    try {
      if (metaRef.current === null) metaRef.current = (await loadSyncMeta()) || {};
      const result = await runSyncCycle({
        client,
        userId: sessionRef.current.user.id,
        getState,
        applyState,
        meta: metaRef.current,
      });
      metaRef.current = result.meta;
      await saveSyncMeta(result.meta);
      setLastSyncAt(Date.now());
      setLastError("");
      setStatus("idle");
    } catch (error) {
      setLastError(error?.message || "Sync failed");
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    } finally {
      busyRef.current = false;
    }
  }, [getState, applyState]);

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let interval = null;
    let unsubscribe = null;

    (async () => {
      const client = await getSupabase();
      if (disposed) return;
      if (!client) {
        setStatus("signed-out");
        return;
      }

      const { data } = await client.auth.getSession();
      sessionRef.current = data?.session || null;
      setStatus(sessionRef.current ? "idle" : "signed-out");
      if (sessionRef.current) syncNow();

      const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
        sessionRef.current = session || null;
        if (session) {
          metaRef.current = null; // new user context — reload cursor/snapshot
          setStatus("idle");
          syncNow();
        } else {
          setStatus("signed-out");
        }
      });
      unsubscribe = () => sub?.subscription?.unsubscribe();

      interval = setInterval(syncNow, SYNC_INTERVAL_MS);
    })();

    const onFocus = () => syncNow();
    const onOnline = () => syncNow();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      unsubscribe?.();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, syncNow]);

  return { status, lastSyncAt, lastError, syncNow };
}
