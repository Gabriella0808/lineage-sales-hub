import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/hooks/usePortalData";
import { format } from "date-fns";

/**
 * Live MTD Total Invoicing card. Reads from kpi_monthly_invoice_rollup which
 * pulls from dbo_Invoice + dbo_InvoiceDetail (synced nightly from Acctivate).
 */
export function MtdInvoicingCard({ allowedRepNames }: { allowedRepNames?: string[] | null }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthLabel = useMemo(() => format(now, "MMMM yyyy"), []);

  // Resolve dealer IDs for rep scope
  const { data: scopedDealerIds } = useQuery({
    queryKey: ["mtd_scoped_dealers", (allowedRepNames ?? []).join("|")],
    enabled: !!allowedRepNames && allowedRepNames.length > 0,
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

  const scopeReady = !allowedRepNames || allowedRepNames.length === 0 || scopedDealerIds !== undefined;
  const dealerIds = (allowedRepNames && allowedRepNames.length > 0) ? (scopedDealerIds ?? []) : null;

  const { data, isLoading } = useQuery({
    queryKey: ["mtd_invoicing", currentYear, currentMonth, dealerIds?.length ?? -1],
    enabled: scopeReady,
    queryFn: async () => {
      if (dealerIds !== null && dealerIds.length === 0) return { total: 0, count: 0 };

      const { data: rpcData, error } = await (supabase as any).rpc(
        "kpi_monthly_invoice_rollup",
        { p_years: [currentYear], p_dealer_ids: dealerIds ?? null },
      );
      if (error) throw error;

      const monthRow = ((rpcData ?? []) as any[]).find(
        (r) => Number(r.month) === currentMonth,
      );
      return {
        total: Number(monthRow?.invoiced ?? 0),
        count: Number(monthRow?.invoice_count ?? 0),
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
          {allowedRepNames && allowedRepNames.length > 0 ? " (scoped)" : ""}
        </p>
      </div>
    </div>
  );
}
