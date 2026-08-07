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
  /** Pre-calculated % from mv_portal_monthly_invoiced_actuals (null when unavailable or dealer-scoped) */
  ytdIContainerPct: number | null;
  ytdIWarehousePct: number | null;
};

type ViewRow = {
  year: number;
  month: number;
  dealer_id: string | null;
  invoiced: number | null;
  invoiced_container: number | null;
  invoiced_warehouse: number | null;
  invoiced_container_pct?: number | null;
  invoiced_warehouse_pct?: number | null;
};

type InvoiceLineFallbackRow = {
  dealer_id: string | null;
  invoice_date: string | null;
  invoice_acctivate_id: string | null;
  extended_price: number | null;
  sku: string | null;
  product_name: string | null;
};

type InvoiceHeaderFallbackRow = {
  acctivate_id: string;
  dealer_id: string | null;
  branch: string | null;
  invoice_date: string | null;
  subtotal: number | null;
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
 * calendar year. When `repNames` is provided (non-empty), the aggregates are
 * scoped to dealers owned by those reps. Pass `null`/`undefined` for
 * company-wide totals.
 *
 * Invoicing totals come from the server-side view
 * `dealer_monthly_invoice_totals`, which already excludes Acctivate "C" charge
 * lines (freight, tariffs, surcharges, AvaTax, etc.) and pre-aggregates by
 * month + dealer + branch - so the browser fetches a few hundred summary rows
 * instead of paginating tens of thousands of invoice lines.
 */
export function useDealerSalesAggregates(
  repNames?: string[] | null,
  repResolution?: { repIds: string[]; repNames: string[] } | null,
) {
  const [data, setData] = useState<MonthlyAgg[]>(() => emptyYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repKey = !repNames
    ? "__all__"
    : [...repNames].sort().join("|") +
      (repResolution?.repIds?.length ? "|ids:" + [...repResolution.repIds].sort().join(",") : "");

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

      // Resolve rep scope -  dealer ids.
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

      // ---------- Bookings ----------
      if (dealerIds === null) {
        // Company-wide: source from mv_portal_monthly_net_bookings_actuals
        const { data: bookingRows, error: bookingErr } = await (supabase as any)
          .from("mv_portal_monthly_net_bookings_actuals")
          .select("year, month_number, net_bookings_actual, container_bookings_actual, warehouse_bookings_actual")
          .in("year", [currentYear, prevYear]);
        if (bookingErr) { if (!cancelled) { setError(bookingErr.message); setLoading(false); } return; }
        for (const r of (bookingRows ?? []) as any[]) {
          const monthIdx = (Number(r.month_number) || 0) - 1;
          if (monthIdx < 0 || monthIdx > 11) continue;
          const name = MONTH_NAMES[monthIdx];
          const bk  = Number(r.net_bookings_actual)       || 0;
          const bkC = Number(r.container_bookings_actual) || 0;
          const bkW = Number(r.warehouse_bookings_actual) || 0;
          if (Number(r.year) === currentYear) {
            // Only accumulate current-year booking actuals from the cutoff date onwards.
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
      } else {
        // Rep-scoped: use RPC with dealer filter
        const { data: bookingRows, error: bookingErr } = await (supabase as any).rpc(
          "kpi_monthly_booking_rollup",
          { p_years: [currentYear, prevYear], p_dealer_ids: dealerIds },
        );
        if (bookingErr) { if (!cancelled) { setError(bookingErr.message); setLoading(false); } return; }
        for (const r of (bookingRows ?? []) as any[]) {
          const monthIdx = (Number(r.month) || 0) - 1;
          if (monthIdx < 0 || monthIdx > 11) continue;
          const name = MONTH_NAMES[monthIdx];
          const bk  = Number(r.bookings)           || 0;
          const bkC = Number(r.bookings_container) || 0;
          const bkW = Number(r.bookings_warehouse) || 0;
          if (Number(r.year) === currentYear) {
            if (isBookingVisible(currentYear, Number(r.month))) {
              agg[name].ytdB          += bk;
              agg[name].ytdBContainer += bkC;
              agg[name].ytdBWarehouse += bkW;
            }
          } else if (Number(r.year) === prevYear) {
            agg[name].b25          += bk;
            agg[name].b25Container += bkC;
            agg[name].b25Warehouse += bkW;
          }
        }
      }

      // ---------- Invoicing (server-side view first, then client-side fallback) ----------
      const viewRows = await fetchInvoiceAggregateViewRows(currentYear, prevYear, dealerIds, repNames ?? null, repResolution ?? null);
      const invoiceRows = viewRows ?? await fetchInvoiceAggregateFallbackRows(currentYear, prevYear, dealerIds);
      if (!invoiceRows) {
        if (!cancelled) {
          setError("Unable to load invoicing totals.");
          setLoading(false);
        }
        return;
      }
      for (const r of invoiceRows) {
        const monthIdx = (Number(r.month) || 0) - 1;
        if (monthIdx < 0 || monthIdx > 11) continue;
        const name = MONTH_NAMES[monthIdx];
        const v = Number(r.invoiced) || 0;
        const vC = Number(r.invoiced_container) || 0;
        const vW = Number(r.invoiced_warehouse) || 0;
        if (Number(r.year) === currentYear) {
          agg[name].ytdI += v;
          agg[name].ytdIContainer += vC;
          agg[name].ytdIWarehouse += vW;
          agg[name].ytdIContainerPct = r.invoiced_container_pct != null ? Number(r.invoiced_container_pct) : null;
          agg[name].ytdIWarehousePct = r.invoiced_warehouse_pct != null ? Number(r.invoiced_warehouse_pct) : null;
        } else if (Number(r.year) === prevYear) {
          agg[name].i25 += v;
          agg[name].i25Container += vC;
          agg[name].i25Warehouse += vW;
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

async function fetchInvoiceAggregateViewRows(
  currentYear: number,
  prevYear: number,
  dealerIds: string[] | null,
  repNames: string[] | null,
  repResolution: { repIds: string[]; repNames: string[] } | null,
): Promise<ViewRow[] | null> {
  // Company-wide: query mv_portal_monthly_invoiced_actuals directly.
  // Backed by QBO P&L sync — columns: year, month_number, invoiced_actual.
  if (dealerIds === null) {
    const { data, error } = await supabase
      .from("mv_portal_monthly_invoiced_actuals" as any)
      .select("year, month_number, invoiced_actual")
      .in("year", [currentYear, prevYear]);
    if (error) {
      console.error(
        "[invoice] mv_portal_monthly_invoiced_actuals fetch failed:",
        error.message,
        error,
      );
      // Return empty array (not null) so the invoice-header fallback is NOT triggered.
      return [];
    }
    return (data as any[]).map((r) => ({
      year:                   Number(r.year),
      month:                  Number(r.month_number),
      dealer_id:              null,
      invoiced:               Number(r.invoiced_actual) || 0,
      invoiced_container:     0,
      invoiced_warehouse:     0,
      invoiced_container_pct: null,
      invoiced_warehouse_pct: null,
    }));
  }

  // Rep-scoped: kpi_monthly_invoice_rollup reads dbo_Invoice which has null InvoiceDates
  // (Skyvia sync gap). Instead, query v_portal_dealer_rep_reporting_lines — its invoiced
  // branch reads portal_acctivate_invoices via SECURITY DEFINER and has current data.
  //
  // Filter order (most to least stable):
  //   1. rep_id IN (repResolution.repIds)   — Acctivate rep code, stable
  //   2. rep_name IN (repResolution.repNames) — exact view names, resolved by fuzzy match
  //   3. rep_name IN (repNames)              — raw display names, last resort
  const resolvedRepIds   = repResolution?.repIds   ?? [];
  const resolvedRepNames = repResolution?.repNames ?? repNames ?? [];

  if (resolvedRepIds.length === 0 && resolvedRepNames.length === 0) {
    console.warn("[invoice] rep-scoped but no identifiers to filter by — returning empty");
    return [];
  }

  const filterMethod = resolvedRepIds.length > 0 ? "rep_id" : "rep_name";
  const monthAgg = new Map<string, { year: number; month: number; invoiced: number; lines: number }>();
  const PAGE = 2000;
  let offset = 0;
  let totalLines = 0;

  while (true) {
    let q = (supabase as any)
      .from("v_portal_dealer_rep_reporting_lines")
      .select("transaction_date, amount")
      .eq("metric_type", "invoiced")
      .gte("transaction_date", `${prevYear}-01-01`)
      .lt("transaction_date", `${currentYear + 1}-01-01`)
      .range(offset, offset + PAGE - 1);

    if (resolvedRepIds.length > 0) {
      q = q.in("rep_id", resolvedRepIds);
    } else {
      q = q.in("rep_name", resolvedRepNames);
    }

    const { data, error } = await q;

    if (error) {
      console.error("[invoice] v_portal_dealer_rep_reporting_lines (rep-scoped) failed:", error.message);
      return null;
    }

    const batch = (data ?? []) as any[];
    totalLines += batch.length;

    for (const r of batch) {
      const d = new Date(r.transaction_date + "T00:00:00");
      if (isNaN(d.getTime())) continue;
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${month}`;
      const cur = monthAgg.get(key) ?? { year, month, invoiced: 0, lines: 0 };
      cur.invoiced += Number(r.amount) || 0;
      cur.lines += 1;
      monthAgg.set(key, cur);
    }

    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  const rows = Array.from(monthAgg.values());
  console.log("[invoice] rep-scoped invoice fetch:", {
    filterMethod,
    resolvedRepIds,
    resolvedRepNames,
    totalLines,
    months: rows
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map((r) => `${r.year}-${String(r.month).padStart(2, "0")}: $${r.invoiced.toFixed(0)} (${r.lines} lines)`)
      .join(", "),
  });

  return rows.map((r) => ({
    year:               r.year,
    month:              r.month,
    dealer_id:          null,
    invoiced:           r.invoiced,
    invoiced_container: 0,
    invoiced_warehouse: 0,
  }));
}

async function fetchInvoiceAggregateFallbackRows(
  currentYear: number,
  prevYear: number,
  dealerIds: string[] | null,
): Promise<ViewRow[] | null> {
  const monthly = new Map<string, ViewRow>();
  const invoiceHeaders = new Map<string, InvoiceHeaderFallbackRow>();
  const pageSize = 1000;
  const dealerChunks: (string[] | null)[] = dealerIds ? chunk(dealerIds, 200) : [null];

  for (const ch of dealerChunks) {
    let invoiceFrom = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase
        .from("dealer_invoices")
        .select("acctivate_id, dealer_id, branch, invoice_date, subtotal")
        .gte("invoice_date", `${prevYear}-01-01`)
        .lt("invoice_date", `${currentYear + 1}-01-01`)
        .range(invoiceFrom, invoiceFrom + pageSize - 1);
      if (ch) q = q.in("dealer_id", ch);
      const { data, error } = await q;
      if (error) return null;
      const batch = (data ?? []) as InvoiceHeaderFallbackRow[];
      for (const invoice of batch) {
        if (!invoice.invoice_date || !invoice.dealer_id) continue;
        const date = new Date(`${invoice.invoice_date}T00:00:00`);
        if (Number.isNaN(date.getTime())) continue;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const key = `${year}-${month}-${invoice.dealer_id}`;
        const branch = classifyBranch(invoice.branch ?? null);
        const amount = Number(invoice.subtotal) || 0;
        const row = monthly.get(key) ?? {
          year,
          month,
          dealer_id: invoice.dealer_id,
          invoiced: 0,
          invoiced_container: 0,
          invoiced_warehouse: 0,
        };
        row.invoiced = (Number(row.invoiced) || 0) + amount;
        if (branch === "container") row.invoiced_container = (Number(row.invoiced_container) || 0) + amount;
        if (branch === "warehouse") row.invoiced_warehouse = (Number(row.invoiced_warehouse) || 0) + amount;
        monthly.set(key, row);
        invoiceHeaders.set(invoice.acctivate_id, invoice);
      }
      if (batch.length < pageSize) break;
      invoiceFrom += pageSize;
    }

    let excludedFrom = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let excludedQuery = supabase
        .from("dealer_invoice_lines")
        .select("dealer_id, invoice_date, invoice_acctivate_id, extended_price, sku, product_name")
        .gte("invoice_date", `${prevYear}-01-01`)
        .lt("invoice_date", `${currentYear + 1}-01-01`)
        .or(
          "sku.ilike.%tariff%,product_name.ilike.%tariff%," +
          "sku.ilike.%freight%,product_name.ilike.%freight%," +
          "sku.ilike.%ecsur%,product_name.ilike.%ecsur%," +
          "sku.ilike.%processing fee%,product_name.ilike.%processing fee%",
        )
        .range(excludedFrom, excludedFrom + pageSize - 1);
      if (ch) excludedQuery = excludedQuery.in("dealer_id", ch);
      const { data, error } = await excludedQuery;
      if (error) return null;
      const batch = (data ?? []) as InvoiceLineFallbackRow[];
      for (const line of batch) {
        if (!line.invoice_date || !line.dealer_id || !shouldExcludeInvoiceLine(line)) continue;
        const date = new Date(`${line.invoice_date}T00:00:00`);
        if (Number.isNaN(date.getTime())) continue;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const key = `${year}-${month}-${line.dealer_id}`;
        const invoice = invoiceHeaders.get(line.invoice_acctivate_id ?? "");
        const branch = classifyBranch(invoice?.branch ?? null);
        const amount = Number(line.extended_price) || 0;
        const row = monthly.get(key) ?? {
          year,
          month,
          dealer_id: line.dealer_id,
          invoiced: 0,
          invoiced_container: 0,
          invoiced_warehouse: 0,
        };
        row.invoiced = (Number(row.invoiced) || 0) - amount;
        if (branch === "container") row.invoiced_container = (Number(row.invoiced_container) || 0) - amount;
        if (branch === "warehouse") row.invoiced_warehouse = (Number(row.invoiced_warehouse) || 0) - amount;
        monthly.set(key, row);
      }
      if (batch.length < pageSize) break;
      excludedFrom += pageSize;
    }
  }

  return Array.from(monthly.values());
}

function shouldExcludeInvoiceLine(line: Pick<InvoiceLineFallbackRow, "sku" | "product_name">) {
  const haystack = `${line.sku ?? ""} ${line.product_name ?? ""}`.toLowerCase();
  return /tariff|freight|ecsur|processing fee/.test(haystack);
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
