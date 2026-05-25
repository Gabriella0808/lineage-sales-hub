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

type ViewRow = {
  year: number;
  month: number;
  dealer_id: string | null;
  invoiced: number | null;
  invoiced_container: number | null;
  invoiced_warehouse: number | null;
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
 * month + dealer + branch — so the browser fetches a few hundred summary rows
 * instead of paginating tens of thousands of invoice lines.
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

      // ---------- Bookings (dealer_sales monthly rollup) ----------
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

      // ---------- Invoicing (server-side view first, then client-side fallback) ----------
      const viewRows = await fetchInvoiceAggregateViewRows(currentYear, prevYear, dealerIds);
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
): Promise<ViewRow[] | null> {
  const viewRows: ViewRow[] = [];
  const dealerChunks: (string[] | null)[] = dealerIds ? chunk(dealerIds, 200) : [null];
  for (const ch of dealerChunks) {
    let from = 0;
    const pageSize = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase
        .from("dealer_monthly_invoice_totals" as any)
        .select("year, month, dealer_id, invoiced, invoiced_container, invoiced_warehouse")
        .in("year", [currentYear, prevYear])
        .range(from, from + pageSize - 1);
      if (ch) q = q.in("dealer_id", ch);
      const { data, error } = await q;
      if (error) return null;
      const batch = (data ?? []) as unknown as ViewRow[];
      viewRows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
  }
  return viewRows;
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
  }));
}
