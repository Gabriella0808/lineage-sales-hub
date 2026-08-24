import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBookingVisible } from "@/utils/bookingCutoff";

export type MonthlyAgg = {
  /** Long month name, e.g. "January" */
  m: string;
  b25: number;
  i25: number;
  ytdB: number;
  ytdI: number;
  /** Prior-year invoice totals split by branch */
  i25Container: number;
  i25Warehouse: number;
  /** Current-year YTD invoice totals split by branch */
  ytdIContainer: number;
  ytdIWarehouse: number;
  /** Prior-year booking totals split by branch (MIXED=container, WHSALES=warehouse) */
  b25Container: number;
  b25Warehouse: number;
  /** Current-year YTD booking totals split by branch */
  ytdBContainer: number;
  ytdBWarehouse: number;
  /** Pre-calculated % from mv_portal_monthly_invoiced_actuals (null when unavailable or scoped) */
  ytdIContainerPct: number | null;
  ytdIWarehousePct: number | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Normalizes the raw branch string from Acctivate into a coarse bucket. */
export function classifyBranch(raw: string | null | undefined): "container" | "warehouse" | "direct" | "other" {
  if (!raw) return "other";
  const s = raw.toLowerCase();
  if (s.includes("container")) return "container";
  if (s.includes("warehouse")) return "warehouse";
  if (s.includes("direct")) return "direct";
  return "other";
}

/**
 * Fetches monthly bookings + invoicing aggregates for the current and previous
 * calendar year.
 *
 * Scope logic:
 *   - managerId = null/undefined  → company-wide (mat views, best performance)
 *   - managerId = "<uuid>"        → manager-scoped via canonical join
 *                                   (v_companywide_reporting_actuals.manager_id)
 *   - repAcIds = string[]         → specific rep override (Acctivate acctivate_id values)
 *                                   takes priority over managerId
 *
 * All scoped queries use get_manager_reporting_monthly, which joins through
 * sales_reps.acctivate_id = rep_id → managers.id with no frontend name resolution.
 */
export function useDealerSalesAggregates(params: {
  managerId: string | null | undefined;
  repAcIds?: string[] | null;
  refreshKey?: number;
}) {
  const { managerId, repAcIds, refreshKey } = params;

  const [data, setData] = useState<MonthlyAgg[]>(() => emptyYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache key: changes when manager or rep selection changes.
  // When repAcIds are set (even company-wide), include them so different rep
  // selections don't share the same cached result.
  const hasRepFilter = repAcIds != null && repAcIds.length > 0;
  const cacheKey = managerId == null && !hasRepFilter
    ? "__all__"
    : `mgr:${managerId ?? "null"}` + (repAcIds?.length ? `|reps:${[...repAcIds].sort().join(",")}` : "");

  useEffect(() => {
    let cancelled = false;
    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;

    (async () => {
      setLoading(true);

      const agg: Record<string, MonthlyAgg> = Object.fromEntries(
        MONTH_NAMES.map((m) => [m, {
          m, b25: 0, i25: 0, ytdB: 0, ytdI: 0,
          i25Container: 0, i25Warehouse: 0,
          ytdIContainer: 0, ytdIWarehouse: 0,
          b25Container: 0, b25Warehouse: 0,
          ytdBContainer: 0, ytdBWarehouse: 0,
          ytdIContainerPct: null,
          ytdIWarehousePct: null,
        }]),
      );

      // ── Company-wide (no rep filter): use mat views (pre-aggregated, fastest) ─
      // When repAcIds are set, fall through to the RPC path so the rep filter is
      // applied consistently — the same way daily cards filter by rep_id.
      if (managerId == null && !hasRepFilter) {
        // Bookings from materialized view — try with branch columns, fall back if unavailable
        let bookingRows: any[] = [];
        {
          const { data: rows, error: err } = await (supabase as any)
            .from("mv_portal_monthly_net_bookings_actuals")
            .select("year, month_number, net_bookings_actual, container_bookings_actual, warehouse_bookings_actual")
            .in("year", [currentYear, prevYear]);
          if (err) {
            // Branch columns may not exist yet — retry with guaranteed columns only
            const { data: basic, error: basicErr } = await (supabase as any)
              .from("mv_portal_monthly_net_bookings_actuals")
              .select("year, month_number, net_bookings_actual")
              .in("year", [currentYear, prevYear]);
            if (basicErr) { if (!cancelled) { setError(basicErr.message); setLoading(false); } return; }
            bookingRows = (basic ?? []).map((r: any) => ({ ...r, container_bookings_actual: 0, warehouse_bookings_actual: 0 }));
          } else {
            bookingRows = rows ?? [];
          }
        }
        for (const r of bookingRows as any[]) {
          const monthIdx = (Number(r.month_number) || 0) - 1;
          if (monthIdx < 0 || monthIdx > 11) continue;
          const name = MONTH_NAMES[monthIdx];
          const bk  = Number(r.net_bookings_actual)       || 0;
          const bkC = Number(r.container_bookings_actual) || 0;
          const bkW = Number(r.warehouse_bookings_actual) || 0;
          if (Number(r.year) === currentYear) {
            if (isBookingVisible(currentYear, Number(r.month_number))) {
              agg[name].ytdB          = bk;
              agg[name].ytdBContainer = bkC;
              agg[name].ytdBWarehouse = bkW;
            }
          } else if (Number(r.year) === prevYear) {
            agg[name].b25          = bk;
            agg[name].b25Container = bkC;
            agg[name].b25Warehouse = bkW;
          }
        }

        // Invoiced from materialized view — try with branch columns, fall back if unavailable
        let invRows: any[] = [];
        {
          const { data: rows, error: err } = await (supabase as any)
            .from("mv_portal_monthly_invoiced_actuals")
            .select("year, month_number, invoiced_actual, invoiced_container, invoiced_warehouse")
            .in("year", [currentYear, prevYear]);
          if (err) {
            const { data: basic, error: basicErr } = await (supabase as any)
              .from("mv_portal_monthly_invoiced_actuals")
              .select("year, month_number, invoiced_actual")
              .in("year", [currentYear, prevYear]);
            if (basicErr) { if (!cancelled) { setError(basicErr.message); setLoading(false); } return; }
            invRows = (basic ?? []).map((r: any) => ({ ...r, invoiced_container: 0, invoiced_warehouse: 0 }));
          } else {
            invRows = rows ?? [];
          }
        }
        for (const r of invRows as any[]) {
          const monthIdx = (Number(r.month_number) || 0) - 1;
          if (monthIdx < 0 || monthIdx > 11) continue;
          const name = MONTH_NAMES[monthIdx];
          if (Number(r.year) === currentYear) {
            agg[name].ytdI = Number(r.invoiced_actual) || 0;
            agg[name].ytdIContainer = Number(r.invoiced_container) || 0;
            agg[name].ytdIWarehouse = Number(r.invoiced_warehouse) || 0;
          } else if (Number(r.year) === prevYear) {
            agg[name].i25 = Number(r.invoiced_actual) || 0;
            agg[name].i25Container = Number(r.invoiced_container) || 0;
            agg[name].i25Warehouse = Number(r.invoiced_warehouse) || 0;
          }
        }

        if (!cancelled) { setData(MONTH_NAMES.map((m) => agg[m])); setLoading(false); }
        return;
      }

      // ── Manager-scoped or rep-scoped: canonical view via RPC ─────────────────
      // get_manager_reporting_monthly joins through sales_reps.acctivate_id = rep_id
      // → managers.id, so manager_id UUID maps directly to Acctivate rows.

      console.log("[reporting] fetching monthly actuals:", {
        managerId,
        repAcIds,
        years: [currentYear, prevYear],
      });

      const { data: rpcRows, error: rpcErr } = await (supabase as any).rpc(
        "get_manager_reporting_monthly",
        {
          p_manager_id: managerId,
          p_rep_ac_ids: repAcIds && repAcIds.length > 0 ? repAcIds : null,
          p_years:      [currentYear, prevYear],
        },
      );
      if (rpcErr) { if (!cancelled) { setError(rpcErr.message); setLoading(false); } return; }

      const rows = (rpcRows ?? []) as Array<{
        metric_type: string;
        year: number;
        month_number: number;
        total_amount: number | string;
        row_count: number | string;
      }>;

      // Debugging: log the raw monthly totals for traceability
      const augBookings = rows.find(r => r.metric_type === "bookings" && Number(r.year) === currentYear && Number(r.month_number) === 8);
      const augInvoiced = rows.find(r => r.metric_type === "invoiced" && Number(r.year) === currentYear && Number(r.month_number) === 8);
      console.log("[reporting] get_manager_reporting_monthly results:", {
        managerId,
        repAcIds,
        totalRows: rows.length,
        aug2026Bookings: augBookings ? Number(augBookings.total_amount).toFixed(0) : "none",
        aug2026Invoiced: augInvoiced ? Number(augInvoiced.total_amount).toFixed(0) : "none",
        monthlyBreakdown: rows.map(r =>
          `${r.metric_type} ${r.year}-${String(r.month_number).padStart(2,"0")}: $${Number(r.total_amount).toFixed(0)} (${r.row_count} rows)`
        ),
      });

      for (const r of rows) {
        const monthIdx = (Number(r.month_number) || 0) - 1;
        if (monthIdx < 0 || monthIdx > 11) continue;
        const name = MONTH_NAMES[monthIdx];
        const amt = Number(r.total_amount) || 0;

        if (r.metric_type === "bookings") {
          if (Number(r.year) === currentYear) {
            // Live KPI hide-before-August rule: client-side only, does not affect
            // Dealer Reporting or Rep Reporting (those go through separate RPCs).
            if (isBookingVisible(currentYear, Number(r.month_number))) {
              agg[name].ytdB += amt;
            }
          } else if (Number(r.year) === prevYear) {
            agg[name].b25 += amt;
          }
        } else if (r.metric_type === "invoiced") {
          if (Number(r.year) === currentYear) {
            agg[name].ytdI += amt;
          } else if (Number(r.year) === prevYear) {
            agg[name].i25 += amt;
          }
        }
      }

      if (!cancelled) { setData(MONTH_NAMES.map((m) => agg[m])); setLoading(false); }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, refreshKey]);

  return { data, loading, error };
}

function emptyYear(): MonthlyAgg[] {
  return MONTH_NAMES.map((m) => ({
    m, b25: 0, i25: 0, ytdB: 0, ytdI: 0,
    i25Container: 0, i25Warehouse: 0,
    ytdIContainer: 0, ytdIWarehouse: 0,
    b25Container: 0, b25Warehouse: 0,
    ytdBContainer: 0, ytdBWarehouse: 0,
    ytdIContainerPct: null,
    ytdIWarehousePct: null,
  }));
}
