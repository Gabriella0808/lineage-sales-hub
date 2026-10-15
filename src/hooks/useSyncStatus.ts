import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Header "Catalog synced" pill - a plain read of the most recent
// products.last_synced_at (populated by the existing Acctivate sync
// pipeline on every products sync run). No new table, view, RPC, or
// write - just surfacing a timestamp that already exists.
//
// Scoped to products only, not a composite status across every
// Acctivate-backed area (dealers, inventory, invoices, etc. each sync
// independently and aren't reflected here) - the header label says
// "Catalog synced" rather than a generic "Synced" for exactly this
// reason. Widening this to a true cross-area status would mean reading
// several more tables' timestamps and taking the max - worth doing, but
// as a deliberate follow-up, not bundled into this.
export function useSyncStatus() {
  return useQuery({
    queryKey: ["header_catalog_sync_status"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Date | null> => {
      const { data, error } = await supabase
        .from("products")
        .select("last_synced_at")
        .not("last_synced_at", "is", null)
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.last_synced_at ? new Date(data.last_synced_at) : null;
    },
  });
}
