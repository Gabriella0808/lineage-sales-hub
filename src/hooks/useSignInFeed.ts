import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

export interface SignInEvent {
  id: string;
  user_id: string;
  signed_in_at: string;
  full_name: string | null;
}

export function useSignInFeed(limit = 10) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("sign-in-feed-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sign_in_log" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["sign-in-feed"] });
          queryClient.invalidateQueries({ queryKey: ["last-seen-users"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["sign-in-feed", limit],
    queryFn: async (): Promise<SignInEvent[]> => {
      const { data: logs, error } = await supabase
        .from("sign_in_log")
        .select("id, user_id, signed_in_at")
        .order("signed_in_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      if (!logs || logs.length === 0) return [];

      const userIds = [...new Set(logs.map(l => l.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      return logs.map(l => ({ ...l, full_name: nameMap.get(l.user_id) ?? null }));
    },
    refetchInterval: 30000,
  });
}

export interface UserLastSeen {
  user_id: string;
  full_name: string | null;
  last_signed_in_at: string;
}

export function useLastSeenUsers() {
  return useQuery({
    queryKey: ["last-seen-users"],
    queryFn: async (): Promise<UserLastSeen[]> => {
      const { data: logs, error } = await supabase
        .from("sign_in_log")
        .select("user_id, signed_in_at")
        .order("signed_in_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      if (!logs || logs.length === 0) return [];

      const latest = new Map<string, string>();
      logs.forEach(l => {
        if (!latest.has(l.user_id)) latest.set(l.user_id, l.signed_in_at);
      });

      const userIds = [...latest.keys()];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      return userIds.map(id => ({
        user_id: id,
        full_name: nameMap.get(id) ?? null,
        last_signed_in_at: latest.get(id)!,
      }));
    },
    refetchInterval: 30000,
  });
}

export interface RepLastLogin {
  rep_id: string;
  rep_name: string;
  last_signed_in_at: string | null;
}

// Admin/manager-only: uses a SECURITY DEFINER RPC because sign_in_log (admin-only)
// and user_reps (own-row-only) are both too locked down for a manager to read
// directly via RLS. The RPC does the admin/manager scoping itself.
export function useRepLastLogins() {
  const { data: roleInfo } = useUserRole();
  const enabled = !!roleInfo?.isAdmin || !!roleInfo?.isManager;

  return useQuery({
    queryKey: ["rep-last-logins"],
    queryFn: async (): Promise<RepLastLogin[]> => {
      const { data, error } = await (supabase as any).rpc("get_rep_last_logins");
      if (error) throw error;
      return (data ?? []) as RepLastLogin[];
    },
    enabled,
    refetchInterval: 60000,
  });
}
