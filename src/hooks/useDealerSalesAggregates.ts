import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
 * Fetches dealer_sales rows for the current and previous calendar year and
 * aggregates them by month. When `repNames` is provided (and non-empty), the
 * aggregates are scoped to dealers whose `rep_id` resolves to one of those
 * sales_reps names. Pass `null`/`undefined` for company-wide totals.
 */
export function useDealerSalesAggregates(repNames?: string[] | null) {
  const [data, setData] = useState<MonthlyAgg[]>(() => emptyYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repKey = !repNames
    ? "__all__"
    : [...repNames].map((s) => s.toLowerCase()).sort().join("|");

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
        }]),
      );

      // Resolve rep scope → dealer ids.
      let dealerIds: string[] | null = null;
      if (repNames && repNames.length > 0) {
        const { data: repRows, error: repErr } = await supabase
          .from("sales_reps")
          .select("id")
          .in("name", repNames);
        if (repErr) { if (!cancelled) { setError(repErr.message); setLoading(false); } return; }
        const repIds = (repRows ?? []).map((r: any) => r.id);
        if (repIds.length === 0) {
          if (!cancelled) { setData(MONTH_NAMES.map((m) => agg[m])); setLoading(false); }
          return;
        }
        const { data: dealerRows, error: dealerErr } = await supabase
          .from("dealers")
          .select("id")
          .in("rep_id", repIds);
        if (dealerErr) { if (!cancelled) { setError(dealerErr.message); setLoading(false); } return; }
        dealerIds = (dealerRows ?? []).map((d: any) => d.id);
        if (dealerIds.length === 0) {
          if (!cancelled) { setData(MONTH_NAMES.map((m) => agg[m])); setLoading(false); }
          return;
        }
      }

      // Bookings still come from dealer_sales rollup if populated.
      {
        const dealerChunks: (string[] | null)[] = dealerIds ? chunk(dealerIds, 200) : [null];
        for (const ch of dealerChunks) {
          let q = supabase
            .from("dealer_sales")
            .select("year, month, bookings, dealer_id")
            .in("year", [currentYear, prevYear]);
          if (ch) q = q.in("dealer_id", ch);
          const { data: salesRows, error: salesErr } = await q;
          if (salesErr) { if (!cancelled) { setError(salesErr.message); setLoading(false); } return; }
          for (const r of salesRows ?? []) {
            const monthIdx = parseInt(String(r.month), 10) - 1;
            if (monthIdx < 0 || monthIdx > 11) continue;
            const name = MONTH_NAMES[monthIdx];
            const bk = Number(r.bookings) || 0;
            if (r.year === currentYear) agg[name].ytdB += bk;
            else if (r.year === prevYear) agg[name].b25 += bk;
          }
        }
      }

      // Invoices come from dealer_invoices (live Acctivate sync).
      const start = `${prevYear}-01-01`;
      const end = `${currentYear + 1}-01-01`;
      const invoices: { invoice_date: string | null; total: number | null; branch: string | null }[] = [];
      const dealerChunks: (string[] | null)[] = dealerIds ? chunk(dealerIds, 200) : [null];
      for (const ch of dealerChunks) {
        let from = 0;
        const pageSize = 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let q = supabase
            .from("dealer_invoices")
            .select("invoice_date, total, branch")
            .gte("invoice_date", start)
            .lt("invoice_date", end)
            .range(from, from + pageSize - 1);
          if (ch) q = q.in("dealer_id", ch);
          const { data, error } = await q;
          if (error) { if (!cancelled) { setError(error.message); setLoading(false); } return; }
          const batch = (data ?? []) as typeof invoices;
          invoices.push(...batch);
          if (batch.length < pageSize) break;
          from += pageSize;
        }
      }
      for (const r of invoices) {
        if (!r.invoice_date) continue;
        const d = new Date(r.invoice_date);
        if (Number.isNaN(d.getTime())) continue;
        const y = d.getUTCFullYear();
        const name = MONTH_NAMES[d.getUTCMonth()];
        const v = Number(r.total) || 0;
        const bucket = classifyBranch(r.branch);
        if (y === currentYear) {
          agg[name].ytdI += v;
          if (bucket === "container") agg[name].ytdIContainer += v;
          else if (bucket === "warehouse") agg[name].ytdIWarehouse += v;
        } else if (y === prevYear) {
          agg[name].i25 += v;
          if (bucket === "container") agg[name].i25Container += v;
          else if (bucket === "warehouse") agg[name].i25Warehouse += v;
        }
      }

      if (cancelled) return;
      setData(MONTH_NAMES.map((m) => agg[m]));
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repKey]);

  return { data, loading, error };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function emptyYear(): MonthlyAgg[] {
  return MONTH_NAMES.map((m) => ({
    m, b25: 0, i25: 0, ytdB: 0, ytdI: 0,
    i25Container: 0, i25Warehouse: 0,
    ytdIContainer: 0, ytdIWarehouse: 0,
  }));
}
