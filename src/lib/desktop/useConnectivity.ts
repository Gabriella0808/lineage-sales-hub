import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// The real Supabase fetch is the ONLY authoritative signal — navigator.onLine
// is used purely to trigger an extra re-check when it fires, never to gate
// or override the result. It's unreliable in a packaged WKWebView (Tauri's
// macOS webview): unlike a real browser tab, it can report false/stale
// values with no real relationship to actual connectivity, so trusting it
// as a hard "offline" verdict produces false positives in the desktop app
// even when the network and backend are both fine.
export function useConnectivity() {
  const [backendReachable, setBackendReachable] = useState(true);
  const [checking, setChecking] = useState(false);

  const checkBackend = async () => {
    setChecking(true);
    try {
      // Supabase requires the apikey header on every request, including
      // this health check — omitting it returns 401 even though the
      // service is perfectly reachable (root cause of an earlier false
      // "offline" reading in the desktop build).
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        method: "GET",
        cache: "no-store",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      setBackendReachable(res.ok);
    } catch (err) {
      console.error("[connectivity] backend health check failed:", err);
      setBackendReachable(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 30_000);
    window.addEventListener("online", checkBackend);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", checkBackend);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isConnected: backendReachable,
    checking,
    retry: checkBackend,
  };
}

// Kept separate from useConnectivity so components that just need a quick
// "is auth even configured to reach Supabase" check don't pull in polling.
export async function pingSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").select("user_id", { head: true, count: "exact" }).limit(1);
    return !error;
  } catch {
    return false;
  }
}
