import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OpenSalesOrderRow {
  id: string;
  acctivate_id: string | null;
  order_number: string | null;
  sku: string | null;
  dealer_name: string | null;
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
            .select("id, acctivate_id, order_number, sku, dealer_name, qty_open, unit_price, extended_value, order_date, promised_date, rep, stock_class")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...(data as OpenSalesOrderRow[]));
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
