import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Single shared source for "which Acctivate product_class codes are a
// real, currently-active collection" - used by every Collection filter
// in the portal (Dealer/Rep Reporting, Inventory, Backlog) so they all
// agree, rather than each page deriving its own list from whatever
// happens to appear in its own data (which let freight/tax/QC/returns/
// discontinued-with-zero-product collections slip into the option list).
// Backed by public.v_active_acctivate_collection_codes - see that
// migration for the exact "real" + "active" definition.
export interface ActiveCollection {
  code: string;
  displayName: string;
  brand: string | null;
}

export function useActiveCollectionCodes() {
  const query = useQuery({
    queryKey: ["v_active_acctivate_collection_codes"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ActiveCollection[]> => {
      const { data, error } = await supabase
        .from("v_active_acctivate_collection_codes")
        .select("code, display_name, brand")
        .order("display_name");
      if (error) throw error;
      return (data ?? []).map((r) => ({ code: r.code, displayName: r.display_name, brand: r.brand ?? null }));
    },
  });

  const collections = query.data ?? [];
  const activeCodes = new Set(collections.map((c) => c.code));
  const displayNameByCode = new Map(collections.map((c) => [c.code, c.displayName]));
  // A code can appear more than once under the same display name (e.g.
  // MONBLANC/MONBLEU both show as "Monaco") - de-duplicate for anything
  // that wants one option per visible name, not one per raw code.
  const uniqueDisplayNames = Array.from(new Set(collections.map((c) => c.displayName))).sort();

  return {
    isLoading: query.isLoading,
    collections,
    activeCodes,
    uniqueDisplayNames,
    // code -> display name, falling back to the raw code itself for
    // anything not in the active set (never hides a value just because
    // it's unmapped - see each caller for how it uses this).
    displayName: (code: string) => displayNameByCode.get(code.toUpperCase()) ?? code,
    isActiveCode: (code: string) => activeCodes.has(code.toUpperCase()),
  };
}
