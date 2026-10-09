import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

// How often a signed-in tab is allowed to ping last_activity_at. This is
// deliberately not "on every page/route change" - onAuthStateChange already
// fires on initial load, on sign-in, and periodically on token refresh
// (roughly hourly), which is enough signal for a "last activity" field
// without writing to profiles on every click. Keyed per-user in
// sessionStorage so switching accounts in the same tab doesn't inherit the
// previous user's throttle window.
const ACTIVITY_PING_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

function maybePingActivity(userId: string) {
  try {
    const key = `lineage_activity_ping_${userId}`;
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < ACTIVITY_PING_THROTTLE_MS) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode, etc) - fall through and
    // ping anyway rather than silently never recording activity.
  }
  // Fire-and-forget: a failed activity ping should never block or surface
  // an error to the user, it's a best-effort signal only. Cast to any since
  // this RPC isn't in the generated Supabase types yet (same pattern as
  // get_rep_last_logins in useSignInFeed.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (supabase as any).rpc("touch_last_activity").then(({ error }: { error: { message: string } | null }) => {
    if (error) console.warn("touch_last_activity failed:", error.message);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Set listener BEFORE getSession to avoid missing the initial auth event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      const newUserId = sess?.user?.id ?? null;
      if (initializedRef.current && prevUserIdRef.current !== newUserId) {
        // A different person is now signed in (or signed out) - drop every
        // cached query so nothing from the previous session's data lingers
        // on screen until a manual refresh.
        queryClient.clear();
      }
      initializedRef.current = true;
      prevUserIdRef.current = newUserId;

      setSession(sess);
      setLoading(false);
      if (newUserId) maybePingActivity(newUserId);
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      initializedRef.current = true;
      prevUserIdRef.current = sess?.user?.id ?? null;
      setSession(sess);
      setLoading(false);
      if (sess?.user?.id) maybePingActivity(sess.user.id);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
