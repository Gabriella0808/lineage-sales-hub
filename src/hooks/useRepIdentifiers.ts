import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RepIdentifier } from "@/utils/repResolver";

/**
 * Fetches the distinct (rep_name, rep_id) pairs from
 * v_portal_dealer_rep_reporting_lines via the get_distinct_rep_identifiers()
 * SECURITY DEFINER function. Used by LiveKpiReport to resolve dropdown display
 * names to the exact Acctivate identifiers stored in the view.
 */
export function useRepIdentifiers() {
  return useQuery<RepIdentifier[]>({
    queryKey: ["rep-reporting-identifiers"],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_distinct_rep_identifiers");
      if (error) {
        console.warn("[rep-ids] get_distinct_rep_identifiers failed:", error.message,
          "— resolution will fall back to display-name matching");
        return [];
      }
      const rows = (data ?? []) as RepIdentifier[];
      console.log(`[rep-ids] loaded ${rows.length} distinct rep identifiers`);
      return rows;
    },
  });
}
