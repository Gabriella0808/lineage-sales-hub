import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_OVERRIDES, type AccessOverrides, type AccessProfile, type RoleOverride, type UserOverride,
} from "@/config/accessOverrides";

export const PAGE_ACCESS_QUERY_KEY = ["page_access_overrides"];

/**
 * Loads the deliberate access changes from the database. Everyone can read the
 * role rules; the database only returns a person's OWN changes and profile to
 * them (Gabriella's account gets everyone's, for the Portal Access page).
 *
 * FAIL-SAFE: if the lookup fails, we fall back to no changes at all - i.e. the
 * coded defaults, exactly how the portal behaved before this feature existed.
 */
export function usePageAccessOverrides() {
  const q = useQuery({
    queryKey: PAGE_ACCESS_QUERY_KEY,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<AccessOverrides> => {
      // New tables - not in the generated Supabase types yet.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const db = supabase as any;
      const [roles, users, profiles] = await Promise.all([
        db.from("page_access_role_overrides").select("page_key, profile, menu, route"),
        db.from("page_access_user_overrides").select("page_key, email, menu, route"),
        db.from("portal_access_profiles").select("email, profile"),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      for (const r of [roles, users, profiles]) if (r.error) throw new Error(r.error.message);
      const profileMap: Record<string, AccessProfile> = {};
      for (const p of (profiles.data ?? []) as { email: string; profile: AccessProfile }[]) profileMap[p.email.toLowerCase()] = p.profile;
      return {
        roleOverrides: (roles.data ?? []) as RoleOverride[],
        userOverrides: (users.data ?? []) as UserOverride[],
        profiles: profileMap,
      };
    },
  });
  return {
    overrides: q.data ?? EMPTY_OVERRIDES,
    /** True only until the first answer (or failure) arrives. */
    loading: q.isLoading,
    failed: q.isError,
  };
}
