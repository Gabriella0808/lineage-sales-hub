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

// Kate has a 'manager' user_roles row (for other pages she legitimately
// needs manager access to), but in Pre-Sale and Team Updates specifically
// she should be treated exactly like a rep - her own data/activity only,
// no company-wide view, no posting rights. This is a data-scoping/UI
// decision each page makes for itself (see PreSalePage.tsx's "isRep"
// check and TeamUpdatesPage.tsx's "canPost"), not a role change - her
// resolved role from resolveRole() stays 'manager' everywhere else.
const REP_VIEW_OVERRIDE_EMAILS = new Set([
  "kate@lineage-collections.com",
]);

export function hasRepViewOverride(email?: string | null) {
  return !!email && REP_VIEW_OVERRIDE_EMAILS.has(email.toLowerCase());
}

/**
 * Digital Assets upload/manage access (create, rename, move, delete) is
 * restricted to these 4 named people specifically, not the admin/manager
 * role generally - everyone else (including other admins/managers) gets
 * view + download only, the same as a rep. Reuses the same override list
 * as admin-email resolution above (there's no one else it should be),
 * but as its own explicit check so it stays correct even if ADMIN_EMAIL_
 * OVERRIDES is ever broadened for unrelated reasons. Mirrors
 * public.is_digital_assets_manager() on the backend (RLS) - keep in sync.
 */
export function isDigitalAssetsManager(email?: string | null) {
  return !!email && ADMIN_EMAIL_OVERRIDES.has(email.toLowerCase());
}

/**
 * The single rule for turning a user's database rows into their effective
 * role: admin > manager > rep > dealer, defaulting to rep. Shared by the
 * live portal (useUserRole) and the Portal Access page so they can never
 * disagree about what role someone has.
 */
export function resolveRole(input: {
  email?: string | null;
  roles: string[];
  hasManager: boolean;
  hasRep: boolean;
  hasDealer: boolean;
}): AppRole {
  const emailOverride = ADMIN_EMAIL_OVERRIDES.has(input.email?.toLowerCase() ?? "");
  if (input.roles.includes("admin") || emailOverride) return "admin";
  if (input.roles.includes("manager") || input.hasManager) return "manager";
  if (input.roles.includes("rep") || input.hasRep) return "rep";
  if (input.roles.includes("dealer") || input.hasDealer) return "dealer";
  return "rep";
}

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

      const role = resolveRole({ email: user.email, roles, hasManager: !!managerId, hasRep: !!repId, hasDealer: !!dealerId });

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
