import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "manager" | "rep";

export interface UserRoleInfo {
  role: AppRole;
  managerId: string | null;
  repId: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isRep: boolean;
}

/**
 * Resolves the current user's effective role + linked manager/rep id.
 * Priority: admin > manager > rep > rep (default fallback for unrecognized users).
 */
export function useUserRole() {
  const { user, loading: authLoading } = useAuth();

  return useQuery<UserRoleInfo | null>({
    queryKey: ["user_role", user?.id],
    enabled: !!user && !authLoading,
    queryFn: async () => {
      if (!user) return null;

      const [rolesRes, managerRes, repRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("user_managers").select("manager_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_reps").select("rep_id").eq("user_id", user.id).maybeSingle(),
      ]);

      const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
      const managerId = managerRes.data?.manager_id ?? null;
      const repId = repRes.data?.rep_id ?? null;

      let role: AppRole;
      if (roles.includes("admin")) role = "admin";
      else if (roles.includes("manager") || managerId) role = "manager";
      else if (roles.includes("rep") || repId) role = "rep";
      else role = "rep"; // safest default — most restrictive

      return {
        role,
        managerId,
        repId,
        isAdmin: role === "admin",
        isManager: role === "manager",
        isRep: role === "rep",
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
