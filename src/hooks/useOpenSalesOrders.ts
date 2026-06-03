import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import backlogData from "@/data/backlogSummary.json";

export interface OpenSalesOrderRow {
  id: string;
  acctivate_id: string | null;
  order_number: string | null;
  sku: string | null;
  dealer_name: string | null;
  dealer_acctivate_id: string | null;
  qty_open: number;
  unit_price: number;
  extended_value: number;
  order_date: string | null;
  promised_date: string | null;
  rep: string | null;
  stock_class: string | null;
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
        while (true) {
          const { data, error } = await supabase
            .from("open_sales_orders")
            .select("id, acctivate_id, order_number, sku, dealer_name, dealer_acctivate_id, qty_open, unit_price, extended_value, order_date, promised_date, rep, stock_class")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...(data as OpenSalesOrderRow[]));
          if (data.length < pageSize) break;
          from += pageSize;
        }

        // Hydrate dealer_name / rep from the dealers table when the sync
        // didn't populate them on open_sales_orders. Then fall back by order
        // number to the last backlog snapshot so live rows don't render as dashes.
        const missingIds = Array.from(
          new Set(
            all
              .filter((r) => (!r.dealer_name || !r.rep) && r.dealer_acctivate_id)
              .map((r) => r.dealer_acctivate_id as string),
          ),
        );
        if (missingIds.length > 0) {
          const dealerMap = new Map<string, { name: string | null; rep: string | null }>();
          const chunk = 500;
          for (let i = 0; i < missingIds.length; i += chunk) {
            const slice = missingIds.slice(i, i + chunk);
            const { data: dealers, error: dErr } = await supabase
              .from("dealers")
              .select("acctivate_id, name, salesperson")
              .in("acctivate_id", slice);
            if (dErr) break;
            for (const d of (dealers ?? []) as { acctivate_id: string | null; name: string | null; salesperson: string | null }[]) {
              if (d.acctivate_id) dealerMap.set(d.acctivate_id, { name: d.name, rep: d.salesperson });
            }
          }
          for (const r of all) {
            if (r.dealer_acctivate_id) {
              const d = dealerMap.get(r.dealer_acctivate_id);
              if (d) {
                if (!r.dealer_name) r.dealer_name = d.name;
                if (!r.rep) r.rep = d.rep;
              }
            }
          }
        }

        const snapshotByOrder = new Map<string, { name: string | null; rep: string | null }>();
        for (const r of (backlogData as { detail: { num?: string | number | null; customer?: string | null; rep?: string | null }[] }).detail) {
          if (!r.num || snapshotByOrder.has(String(r.num))) continue;
          snapshotByOrder.set(String(r.num), { name: r.customer ?? null, rep: r.rep ?? null });
        }

        for (const r of all) {
          if (!r.order_number) continue;
          const snapshot = snapshotByOrder.get(r.order_number);
          if (!snapshot) continue;
          if (!r.dealer_name) r.dealer_name = snapshot.name;
          if (!r.rep) r.rep = snapshot.rep;
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
