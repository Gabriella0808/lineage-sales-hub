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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Set listener BEFORE getSession to avoid missing the initial auth event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
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

      // Log sign-in events (defer to avoid Supabase deadlock inside callback)
      if (event === "SIGNED_IN" && sess?.user) {
        setTimeout(() => {
          supabase.from("sign_in_log").insert({ user_id: sess.user.id }).then();
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      initializedRef.current = true;
      prevUserIdRef.current = sess?.user?.id ?? null;
      setSession(sess);
      setLoading(false);
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
