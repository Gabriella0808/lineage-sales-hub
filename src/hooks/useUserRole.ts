import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "manager" | "rep" | "dealer";

// These accounts must always resolve to admin regardless of query state
const ADMIN_EMAIL_OVERRIDES = new Set([
  "justin@lineage-collections.com",
  "scott@lineage-collections.com",
  "andrew@lineage-collections.com",
  "gabriella@lineage-collections.com",
]);

export interface UserRoleInfo {
  role: AppRole;
  managerId: string | null;
  /** First of repIds, kept for callers that only need a single rep (e.g. an
   *  unambiguous "is a rep mapped at all" check). Prefer repIds for anything
   *  that should cover a rep who legitimately spans multiple territories
   *  (multiple sales_reps rows), like Jordan Shindell (PA/OH + Beach). */
  repId: string | null;
  repIds: string[];
  dealerId: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isRep: boolean;
  isDealer: boolean;
}

/**
 * Resolves the current user's effective role + linked manager/rep id(s).
 * Priority: admin > manager > rep > rep (default fallback for unrecognized users).
 */
export function useUserRole() {
  const { user, loading: authLoading } = useAuth();

  return useQuery<UserRoleInfo | null>({
    queryKey: ["user_role", user?.id],
    enabled: !!user && !authLoading,
    queryFn: async () => {
      if (!user) return null;

      const [rolesRes, managerRes, repRes, dealerRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("user_managers").select("manager_id").eq("user_id", user.id).maybeSingle(),
        // A user can be linked to more than one sales_reps row (a rep who
        // legitimately covers multiple territories under separate Acctivate
        // codes) — no .maybeSingle() here.
        supabase.from("user_reps").select("rep_id").eq("user_id", user.id),
        supabase.from("user_dealers").select("dealer_id").eq("user_id", user.id).maybeSingle(),
      ]);

      const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
      const managerId = managerRes.data?.manager_id ?? null;
      const repIds = (repRes.data ?? []).map((r) => r.rep_id).filter((id): id is string => !!id);
      const repId = repIds[0] ?? null;
      const dealerId = dealerRes.data?.dealer_id ?? null;

      let role: AppRole;
      const emailOverride = ADMIN_EMAIL_OVERRIDES.has(user.email?.toLowerCase() ?? "");
      if (roles.includes("admin") || emailOverride) role = "admin";
      else if (roles.includes("manager") || managerId) role = "manager";
      else if (roles.includes("rep") || repId) role = "rep";
      else if (roles.includes("dealer") || dealerId) role = "dealer";
      else role = "rep";

      return {
        role,
        managerId,
        repId,
        repIds,
        dealerId,
        isAdmin: role === "admin",
        isManager: role === "manager",
        isRep: role === "rep",
        isDealer: role === "dealer",
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
