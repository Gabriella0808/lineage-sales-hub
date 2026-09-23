import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// "Pre-Sale" = every product Acctivate currently has flagged as a New
// Product Intro (products.new_intro_unavail, synced from Acctivate's
// tbProduct._NewIntroUnavail custom field). Membership is always evaluated
// against the CURRENT flag, never frozen at order time — uncheck a SKU in
// Acctivate, re-sync, and it drops out of every view here on its own.

export interface PreSaleProduct {
  sku: string;
  name: string | null;
  collection: string | null;
  category: string | null;
  product_type: string | null;
  base_price: number | null;
}

export interface PreSaleBookingLine {
  sku: string | null;
  amount: number;
  transaction_date: string;
  dealer_name: string | null;
  customer_id: string | null;
  rep_id: string | null; // Acctivate rep code
  rep_name: string | null;
  portal_rep_id: string | null; // sales_reps.id
}

export interface PreSalePoLine {
  product_id: string | null;
  po_number: string | null;
  guid_po: string;
  line_amount: number; // Andrew's DisplayAmount
  quantity_outstanding: number;
}

export interface PreSalePoHeader {
  guid_po: string;
  po_status: string | null;
  requested_delivery_date: string | null;
}

const PAGE = 1000;
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await build(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export function usePreSaleProducts() {
  return useQuery({
    queryKey: ["presale_products"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("sku, name, collection, category, product_type, base_price")
        .eq("new_intro_unavail", true)
        .order("collection")
        .order("sku");
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, base_price: r.base_price == null ? null : Number(r.base_price) })) as PreSaleProduct[];
    },
  });
}

// Bookings since Jan 1 of the current year for exactly the currently-flagged
// SKUs. Fetched by explicit SKU list rather than a SQL join so the frontend
// can show "matched N of M flagged SKUs" without a bespoke view/RPC.
export function usePreSaleBookings(skus: string[]) {
  return useQuery({
    queryKey: ["presale_bookings", skus],
    enabled: skus.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => {
      const year = new Date().getFullYear();
      return fetchAll<PreSaleBookingLine>((from, to) =>
        (supabase as any)
          .from("v_companywide_reporting_actuals")
          .select("sku, amount, transaction_date, dealer_name, customer_id, rep_id, rep_name, portal_rep_id")
          .eq("metric_type", "bookings")
          .gte("transaction_date", `${year}-01-01`)
          .in("sku", skus)
          .order("transaction_date", { ascending: true })
          .range(from, to),
      );
    },
  });
}

// Reads presale_po_lines / presale_po_summary — a sync scoped to Pre-Sale
// SKUs only, mirroring Andrew's validated PODetail/POManagementSummary
// Power Query exactly. Not the same table as any other PO view in the
// portal; those aren't produced by a script this repo can verify.
export function usePreSalePoLines(skus: string[]) {
  return useQuery({
    queryKey: ["presale_po_lines", skus],
    enabled: skus.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetchAll<PreSalePoLine>((from, to) =>
        (supabase as any)
          .from("presale_po_lines")
          .select("product_id, po_number, guid_po, display_amount, quantity_outstanding")
          .in("product_id", skus)
          .order("po_number")
          .range(from, to),
      ).then((rows) => rows.map((r: any) => ({ ...r, line_amount: Number(r.display_amount) || 0 }))),
  });
}

export function usePreSalePoHeaders() {
  return useQuery({
    queryKey: ["presale_po_headers"],
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetchAll<PreSalePoHeader>((from, to) =>
        (supabase as any)
          .from("presale_po_summary")
          .select("guid_po, po_status, requested_delivery_date")
          .range(from, to),
      ),
  });
}

export interface RepTargetRow {
  id: string;
  rep_id: string; // Acctivate code
  name: string;
  annual_target: number;
}

// Rep targets joined to sales_reps for name + Acctivate rep code, used to
// spread a Pre-Sale goal across reps by their share of the annual target
// (Andrew's formula: repShare = repTarget / sum(allRepTargets)).
export function usePreSaleRepTargets(year: number) {
  return useQuery({
    queryKey: ["presale_rep_targets", year],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: targets, error: tErr }, { data: reps, error: rErr }] = await Promise.all([
        (supabase as any).from("rep_targets").select("id, rep_id, annual_target").eq("year", year),
        supabase.from("sales_reps").select("id, name, acctivate_id"),
      ]);
      if (tErr) throw tErr;
      if (rErr) throw rErr;
      const repById = new Map((reps ?? []).map((r) => [r.id, r]));
      const out: RepTargetRow[] = [];
      for (const t of (targets ?? []) as { id: string; rep_id: string; annual_target: number }[]) {
        const rep = repById.get(t.rep_id);
        if (!rep?.acctivate_id) continue;
        out.push({ id: t.id, rep_id: rep.acctivate_id, name: rep.name, annual_target: Number(t.annual_target) || 0 });
      }
      return out;
    },
  });
}
