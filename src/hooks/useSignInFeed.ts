import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SignInEvent {
  id: string;
  user_id: string;
  signed_in_at: string;
  full_name: string | null;
}

export function useSignInFeed(limit = 10) {
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
