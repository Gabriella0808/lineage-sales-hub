import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/hooks/usePortalData";
import { format } from "date-fns";

/**
 * Live MTD Total Invoicing card.
 * Company-wide: reads from mv_portal_monthly_invoiced_actuals (year + month_number filter).
 * Dealer-scoped: falls back to kpi_monthly_invoice_rollup (supports dealer filtering).
 */
export function MtdInvoicingCard({ allowedRepNames }: { allowedRepNames?: string[] | null }) {
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthLabel   = useMemo(() => format(now, "MMMM yyyy"), []);

  const isCompanyWide = !allowedRepNames || allowedRepNames.length === 0;

  // Resolve dealer IDs — only needed for dealer-scoped view.
  const { data: scopedDealerIds } = useQuery({
    queryKey: ["mtd_scoped_dealers", (allowedRepNames ?? []).join("|")],
    enabled: !isCompanyWide,
    queryFn: async () => {
      const { data: repRows, error: repErr } = await supabase
        .from("sales_reps")
        .select("id")
        .in("name", allowedRepNames!);
      if (repErr) throw repErr;
      const repIds = (repRows ?? []).map((r: any) => r.id);
      if (repIds.length === 0) return [] as string[];
      const ids: string[] = [];
      let start = 0;
      const pageSize = 1000;
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

  const scopeReady = isCompanyWide || scopedDealerIds !== undefined;
  const dealerIds   = isCompanyWide ? null : (scopedDealerIds ?? []);

  const { data, isLoading } = useQuery({
    queryKey: ["mtd_invoicing", currentYear, currentMonth, isCompanyWide ? "all" : (dealerIds?.length ?? -1)],
    enabled: scopeReady,
    queryFn: async () => {
      // ── Company-wide: mv_portal_monthly_invoiced_actuals ──────────────────
      if (isCompanyWide) {
        const { data: viewData, error } = await supabase
          .from("mv_portal_monthly_invoiced_actuals" as any)
          .select("year, month_number, invoice_count, invoiced_actual")
          .eq("year", currentYear)
          .eq("month_number", currentMonth)
          .maybeSingle();
        if (error) {
          console.error("[mtd] mv_portal_monthly_invoiced_actuals fetch failed:", error.message);
          throw error;
        }
        return {
          total: Number(viewData?.invoiced_actual ?? 0),
          count: Number(viewData?.invoice_count   ?? 0),
        };
      }

      // ── Dealer-scoped: kpi_monthly_invoice_rollup ────────────────────────
      if (dealerIds !== null && dealerIds.length === 0) return { total: 0, count: 0 };

      const { data: rpcData, error } = await (supabase as any).rpc(
        "kpi_monthly_invoice_rollup",
        { p_years: [currentYear], p_dealer_ids: dealerIds ?? null },
      );
      if (error) {
        console.error("[mtd] kpi_monthly_invoice_rollup failed:", error.message);
        throw error;
      }
      const monthRow = ((rpcData ?? []) as any[]).find(
        (r) => Number(r.month) === currentMonth,
      );
      return {
        total: Number(monthRow?.invoiced       ?? 0),
        count: Number(monthRow?.invoice_count  ?? 0),
      };
    },
  });

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
          {!isCompanyWide ? " (scoped)" : ""}
        </p>
      </div>
    </div>
  );
}
