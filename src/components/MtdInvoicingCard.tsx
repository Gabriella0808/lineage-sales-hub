import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/hooks/usePortalData";
import { startOfMonth, endOfMonth, format } from "date-fns";

/**
 * Live MTD Total Invoicing card. Pulls from dealer_invoices for the current
 * calendar month. Optionally scopes by allowed rep names (matched against
 * dealers.salesperson cleanly via dealers.rep_id → sales_reps.name).
 */
export function MtdInvoicingCard({ allowedRepNames }: { allowedRepNames?: string[] | null }) {
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  // Fetch dealer_ids for the rep scope (if any).
  const { data: scopedDealerIds } = useQuery({
    queryKey: ["mtd_scoped_dealers", (allowedRepNames ?? []).join("|")],
    enabled: !!allowedRepNames && allowedRepNames.length > 0,
    queryFn: async () => {
      const { data: repRows, error: repErr } = await supabase
        .from("sales_reps")
        .select("id, name")
        .in("name", allowedRepNames!);
      if (repErr) throw repErr;
      const repIds = (repRows ?? []).map((r) => r.id);
      if (repIds.length === 0) return [] as string[];
      const ids: string[] = [];
      let start = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("dealers")
          .select("id")
          .in("rep_id", repIds)
          .range(start, start + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as { id: string }[];
        ids.push(...batch.map((b) => b.id));
        if (batch.length < pageSize) break;
        start += pageSize;
      }
      return ids;
    },
  });

  const scopeReady = !allowedRepNames || allowedRepNames.length === 0 || scopedDealerIds !== undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["mtd_invoicing", from, to, (scopedDealerIds ?? []).length],
    enabled: scopeReady,
    queryFn: async () => {
      const totals = { total: 0, count: 0 };
      let start = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase
          .from("dealer_invoices")
          .select("total, dealer_id")
          .gte("invoice_date", from)
          .lte("invoice_date", to)
          .range(start, start + pageSize - 1);
        if (allowedRepNames && allowedRepNames.length > 0) {
          if (!scopedDealerIds || scopedDealerIds.length === 0) return totals;
          q = q.in("dealer_id", scopedDealerIds);
        }
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as { total: number | null }[];
        for (const r of batch) totals.total += Number(r.total ?? 0);
        totals.count += batch.length;
        if (batch.length < pageSize) break;
        start += pageSize;
      }
      return totals;
    },
  });

  const monthLabel = useMemo(() => format(now, "MMMM yyyy"), [now]);

  return (
    <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          MTD Total Invoicing
        </p>
        <p className="text-3xl font-serif mt-1">
          {isLoading || !scopeReady ? "…" : formatCurrency(data?.total ?? 0)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {monthLabel} • {data?.count ?? 0} invoices
          {allowedRepNames && allowedRepNames.length > 0 ? " (scoped)" : ""}
        </p>
      </div>
    </div>
  );
}
