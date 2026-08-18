import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/hooks/usePortalData";
import { getReportingYear, getReportingMonth } from "@/utils/reportingDate";

/**
 * Live MTD Total Invoicing card.
 *
 * Company-wide (managerId = null): reads mv_portal_monthly_invoiced_actuals.
 * Manager-scoped (managerId = UUID): calls get_manager_reporting_monthly, the
 *   same canonical source as the Monthly Results table in Live KPI, so both
 *   surfaces always show identical numbers.
 * Rep-scoped (repAcIds provided): filters by individual Acctivate rep IDs.
 */
export function MtdInvoicingCard({
  managerId,
  repAcIds,
}: {
  managerId?: string | null;
  repAcIds?: string[] | null;
}) {
  const currentYear  = getReportingYear();
  const currentMonth = getReportingMonth();
  const monthLabel   = useMemo(() => {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return `${months[currentMonth - 1]} ${currentYear}`;
  }, [currentYear, currentMonth]);

  const isCompanyWide = managerId == null && (repAcIds == null || repAcIds.length === 0);

  const queryKey = isCompanyWide
    ? ["mtd_invoicing_cw", currentYear, currentMonth]
    : ["mtd_invoicing_mgr", managerId ?? "none", repAcIds?.join("|") ?? "", currentYear, currentMonth];

  const { data, isLoading } = useQuery({
    queryKey,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      // ── Company-wide: materialized view ──────────────────────────────────
      if (isCompanyWide) {
        const { data: viewData, error } = await supabase
          .from("mv_portal_monthly_invoiced_actuals" as any)
          .select("year, month_number, invoice_count, invoiced_actual")
          .eq("year", currentYear)
          .eq("month_number", currentMonth)
          .maybeSingle();
        if (error) {
          console.error("[mtd] mv_portal_monthly_invoiced_actuals failed:", error.message);
          throw error;
        }
        return {
          total: Number(viewData?.invoiced_actual ?? 0),
          count: Number(viewData?.invoice_count   ?? 0),
        };
      }

      // ── Manager / rep scoped: canonical view RPC ──────────────────────────
      // Same source as useDealerSalesAggregates + Monthly Results table.
      const { data: rpcData, error } = await (supabase as any).rpc(
        "get_manager_reporting_monthly",
        {
          p_manager_id: managerId ?? null,
          p_rep_ac_ids: repAcIds && repAcIds.length > 0 ? repAcIds : null,
          p_years:      [currentYear],
        },
      );
      if (error) {
        console.error("[mtd] get_manager_reporting_monthly failed:", error.message);
        throw error;
      }
      const rows = ((rpcData ?? []) as any[]).filter(
        (r: any) => r.metric_type === "invoiced" && Number(r.month_number) === currentMonth,
      );
      const total = rows.reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
      const count = rows.reduce((s: number, r: any) => s + (Number(r.row_count)    || 0), 0);
      console.log("[mtd] manager-scoped invoice total:", { managerId, repAcIds, currentMonth, total, count });
      return { total, count };
    },
  });

  return (
    <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          MTD Total Invoicing
        </p>
        <p className="text-3xl font-serif mt-1">
          {isLoading ? "…" : formatCurrency(data?.total ?? 0)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {monthLabel} • {data?.count ?? 0} invoices
          {!isCompanyWide ? " (scoped)" : ""}
        </p>
      </div>
    </div>
  );
}
