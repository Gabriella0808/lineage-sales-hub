import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Canonical Open SO source — same view backing the Dealer/Rep Reporting Open
// SOs card (public.v_portal_open_sales_order_line_facts). Replaces the old
// open_sales_orders table (different Acctivate source, no discount applied,
// no freight/tariff/misc exclusion — overstated backlog by roughly 3x) and
// the static backlogSummary.json snapshot fallback, which is no longer used.

export interface OpenSalesOrderRow {
  id: string;
  order_number: string | null;
  customer_id: string | null;
  dealer_name: string | null;
  rep_id: string | null;
  rep_name: string | null;
  sku: string | null;
  description: string | null;
  product_class: string | null;
  qty_open: number;
  unit_price: number;
  open_so_amount: number;
  order_date: string | null;
  requested_ship_date: string | null;
  branch_id: string | null;
  fulfillment_type: string | null;
}

export function useOpenSalesOrders() {
  const [rows, setRows] = useState<OpenSalesOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const pageSize = 1000;
        const all: OpenSalesOrderRow[] = [];
        let from = 0;
        let index = 0;
        while (true) {
          const { data, error } = await (supabase as any)
            .from("v_portal_open_sales_order_line_facts")
            .select("guid_order, order_number, customer_id, dealer_name, rep_id, rep_name, sku, description, product_class, qty_open, unit_price, open_so_amount, order_date, requested_ship_date, branch_id, fulfillment_type")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data as any[]) {
            all.push({
              id: `${r.guid_order}::${r.sku ?? ""}::${index++}`,
              order_number: r.order_number ?? null,
              customer_id: r.customer_id ?? null,
              dealer_name: r.dealer_name ?? null,
              rep_id: r.rep_id ?? null,
              rep_name: r.rep_name ?? null,
              sku: r.sku ?? null,
              description: r.description ?? null,
              product_class: r.product_class ?? null,
              qty_open: Number(r.qty_open) || 0,
              unit_price: Number(r.unit_price) || 0,
              open_so_amount: Number(r.open_so_amount) || 0,
              order_date: r.order_date ?? null,
              requested_ship_date: r.requested_ship_date ?? null,
              branch_id: r.branch_id ?? null,
              fulfillment_type: r.fulfillment_type ?? null,
            });
          }
          if (data.length < pageSize) break;
          from += pageSize;
        }
        if (active) setRows(all);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load open sales orders");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { rows, loading, error };
}
