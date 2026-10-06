/**
 * Shared Acctivate Rep Catalog hook.
 *
 * Single source of truth for rep identity, labels, dropdowns, territory, and
 * manager mapping across the portal.  Invoice and booking AMOUNTS still come
 * from the reporting views — this hook is for identity/labels/filter scope only.
 *
 * Usage
 * -----
 *   const { reps, activeReps, territories, managers, getRepByAcId, getRepsByTerritory } =
 *     useAcctivateRepCatalog();
 *
 * Rep dropdown (value = acctivate_id, label = name):
 *   <Select options={activeReps.map(r => ({ value: r.acctivate_id, label: r.name }))} />
 *
 * Territory dropdown (derived from reps, no separate table needed):
 *   <Select options={territories.map(t => ({ value: t, label: t }))} />
 *
 * Filtering reporting rows by rep:
 *   rows.filter(r => selectedAcIds.includes(r.rep_id))
 *
 * Filtering by territory (find all acctivate_ids in that territory):
 *   const ids = getRepsByTerritory("Mid Atlantic");
 *   rows.filter(r => ids.has(r.rep_id))
 *
 * FK-requiring pickers (Capture Leads, task/lead assignment, etc.) that still
 * need to submit a real public.sales_reps.id / public.managers.id:
 *   const { getSalesRepIdByAcId, managersWithPortalOnly, getManagerIdByName } =
 *     useAcctivateRepCatalog();
 *   // label = r.name (Acctivate's name), value submitted = getSalesRepIdByAcId(r.acctivate_id)
 *
 * `managers` (Acctivate-only, 4 names: Hospitality/House/Mateo/Will) is kept
 * for places that only need Acctivate's own manager labels. `managersWithPortalOnly`
 * adds the small, fixed set of real portal managers who have no Acctivate
 * salesperson code at all (Chris De Lisa, Justin Jeangerard, Kate Jones,
 * Scott Grisack, Sergio) so they don't disappear from manager pickers.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Real portal managers with no Acctivate salesperson code at all (confirmed
// 2026-10-06: acctivate_sales_reps.manager_name only ever has 4 distinct
// values - Hospitality, House, Mateo, Will - these 5 never appear there even
// though they're real, actively-used managers today).
const PORTAL_ONLY_MANAGERS: { name: string; managersTableName: string }[] = [
  { name: "Chris De Lisa", managersTableName: "Chris De Lisa" },
  { name: "Justin Jeangerard", managersTableName: "Justin Jeangerard" },
  { name: "Kate Jones", managersTableName: "Kate Jones" },
  { name: "Scott Grisack", managersTableName: "Scott Grisack" },
  { name: "Sergio", managersTableName: "Sergio" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AcctivateRepEntry {
  acctivate_id: string;
  rep_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  manager_name: string | null;
  manager_acctivate_id: string | null;
  territory_name: string | null;
  territory_code: string | null;
  active: boolean;
  synced_at: string | null;
}

// ── Raw fetch ─────────────────────────────────────────────────────────────────

function useRawAcctivateReps() {
  return useQuery<AcctivateRepEntry[]>({
    queryKey: ["acctivate_rep_catalog"],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acctivate_sales_reps")
        .select(
          "acctivate_id, rep_code, name, email, phone, " +
          "manager_name, manager_acctivate_id, " +
          "territory_name, territory_code, active, synced_at",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as AcctivateRepEntry[];
    },
  });
}

// Lightweight lookup of the portal's own id space, used only to resolve an
// Acctivate-labeled dropdown selection to the real FK a form needs to submit.
// Kept separate from the main acctivate_sales_reps fetch (different table,
// different staleness needs - these ids don't change often).
function usePortalIdLookup() {
  return useQuery({
    queryKey: ["portal_rep_manager_id_lookup"],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const [repsRes, managersRes] = await Promise.all([
        supabase.from("sales_reps").select("id, acctivate_id"),
        supabase.from("managers").select("id, name"),
      ]);
      if (repsRes.error) throw repsRes.error;
      if (managersRes.error) throw managersRes.error;
      return {
        repsByAcId: new Map(
          (repsRes.data ?? [])
            .filter((r) => r.acctivate_id)
            .map((r) => [String(r.acctivate_id).toLowerCase(), r.id as string]),
        ),
        managersByName: new Map(
          (managersRes.data ?? []).map((m) => [String(m.name).toLowerCase(), m.id as string]),
        ),
      };
    },
  });
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAcctivateRepCatalog() {
  const { data: reps = [], isLoading, error } = useRawAcctivateReps();
  const { data: portalIds } = usePortalIdLookup();

  // Active reps only — use for dropdowns
  const activeReps = useMemo(
    () => reps.filter((r) => r.active !== false),
    [reps],
  );

  // Unique territory names (non-null, sorted) derived from the rep catalog.
  // Use this to build territory dropdown options — no separate territories table needed.
  const territories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of activeReps) {
      if (r.territory_name && r.territory_name.trim() !== "") {
        seen.add(r.territory_name.trim());
      }
    }
    return Array.from(seen).sort();
  }, [activeReps]);

  // Unique manager names derived from the rep catalog.
  const managers = useMemo(() => {
    const seen = new Set<string>();
    for (const r of activeReps) {
      if (r.manager_name && r.manager_name.trim() !== "") {
        seen.add(r.manager_name.trim());
      }
    }
    return Array.from(seen).sort();
  }, [activeReps]);

  // Fast O(1) lookup: acctivate_id → rep entry
  const repByAcId = useMemo(() => {
    const map = new Map<string, AcctivateRepEntry>();
    for (const r of reps) {
      map.set(r.acctivate_id.toLowerCase(), r);
    }
    return map;
  }, [reps]);

  // territory_name (lowercased) → Set<acctivate_id (lowercase)>
  const territoryToRepIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of reps) {
      if (!r.territory_name) continue;
      const key = r.territory_name.trim().toLowerCase();
      let set = map.get(key);
      if (!set) { set = new Set(); map.set(key, set); }
      set.add(r.acctivate_id.toLowerCase());
    }
    return map;
  }, [reps]);

  // manager_name (lowercased) → Set<acctivate_id (lowercase)>
  const managerToRepIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of reps) {
      if (!r.manager_name) continue;
      const key = r.manager_name.trim().toLowerCase();
      let set = map.get(key);
      if (!set) { set = new Set(); map.set(key, set); }
      set.add(r.acctivate_id.toLowerCase());
    }
    return map;
  }, [reps]);

  // acctivate_id (exact, any case) → rep entry
  function getRepByAcId(id: string | null | undefined): AcctivateRepEntry | undefined {
    if (!id) return undefined;
    return repByAcId.get(id.toLowerCase());
  }

  // Returns acctivate_ids (lowercase) for all reps in a territory.
  // Matching is case-insensitive. Returns empty Set if territory unknown.
  function getRepsByTerritory(territoryName: string): Set<string> {
    return territoryToRepIds.get(territoryName.trim().toLowerCase()) ?? new Set();
  }

  // Returns acctivate_ids (lowercase) for all reps under a manager.
  function getRepsByManager(managerName: string): Set<string> {
    return managerToRepIds.get(managerName.trim().toLowerCase()) ?? new Set();
  }

  // Resolve a reporting row's rep_id (from v_portal_dealer_rep_reporting_lines)
  // to an Acctivate rep. The reporting view's rep_id is the Acctivate SalespersonID code,
  // which is the same value stored as acctivate_id in acctivate_sales_reps.
  function resolveReportingRepId(repId: string | null | undefined): AcctivateRepEntry | undefined {
    return getRepByAcId(repId);
  }

  // For FK-requiring pickers only (Capture Leads, task/lead assignment):
  // resolve an Acctivate rep's acctivate_id to the real public.sales_reps.id
  // a form needs to submit. Label still comes from the Acctivate entry's
  // `name` - this only resolves the value. Returns undefined if this
  // Acctivate rep has no matching portal sales_reps row yet (e.g. a stale
  // "Old ..." code, or a newly-added Acctivate rep not yet created in the
  // portal) - callers should treat that as "not selectable" for a form that
  // must submit a real FK.
  function getSalesRepIdByAcId(acId: string | null | undefined): string | undefined {
    if (!acId || !portalIds) return undefined;
    return portalIds.repsByAcId.get(acId.toLowerCase());
  }

  // Acctivate-only manager names (4: Hospitality, House, Mateo, Will).
  // Use `managersWithPortalOnly` instead for any picker where a real manager
  // disappearing would be a problem - see note above PORTAL_ONLY_MANAGERS.
  const managersWithPortalOnly = useMemo(() => {
    const combined = new Set(managers);
    for (const m of PORTAL_ONLY_MANAGERS) combined.add(m.name);
    return Array.from(combined).sort();
  }, [managers]);

  // For FK-requiring manager pickers: resolve a manager display name (as
  // shown in managersWithPortalOnly) to the real public.managers.id.
  function getManagerIdByName(name: string | null | undefined): string | undefined {
    if (!name || !portalIds) return undefined;
    return portalIds.managersByName.get(name.toLowerCase());
  }

  return {
    reps,
    activeReps,
    territories,
    managers,
    managersWithPortalOnly,
    isLoading,
    error,
    getRepByAcId,
    getRepsByTerritory,
    getRepsByManager,
    resolveReportingRepId,
    getSalesRepIdByAcId,
    getManagerIdByName,
  };
}
