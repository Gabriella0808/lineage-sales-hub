import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OpenSalesOrder {
  id: string;
  order_number: string | null;
  sku: string;
  dealer_name: string | null;
  qty_open: number;
  unit_price: number;
  extended_value: number;
  order_date: string | null;
  promised_date: string | null;
}

export interface PurchaseOrder {
  id: string;
  po_number: string | null;
  factory: string | null;
  status: string | null;
  production_stage: string | null;
  order_date: string | null;
  eta: string | null;
  total_value: number;
  prepaid_amount: number;
  is_prepaid: boolean;
  container_type: string | null;
}

export interface PurchaseOrderLine {
  id: string;
  po_id: string;
  sku: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
  eta: string | null;
}

export interface SkuSalesHistory {
  id: string;
  sku: string;
  year: number;
  month: number;
  units_sold: number;
  revenue: number;
  forecast_units: number | null;
}

export interface LostSaleEvent {
  id: string;
  sku: string;
  event_date: string;
  qty_requested: number;
  estimated_value: number;
  reason: string | null;
  dealer_name: string | null;
}

export interface DealerDemandSignal {
  id: string;
  sku: string;
  dealer_name: string | null;
  signal_type: string;
  signal_strength: number;
  signal_date: string;
  notes: string | null;
}

export function useInventoryHub() {
  const [openOrders, setOpenOrders] = useState<OpenSalesOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poLines, setPoLines] = useState<PurchaseOrderLine[]>([]);
  const [salesHistory, setSalesHistory] = useState<SkuSalesHistory[]>([]);
  const [lostSales, setLostSales] = useState<LostSaleEvent[]>([]);
  const [demandSignals, setDemandSignals] = useState<DealerDemandSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadPOs = async () => {
      const [po, pol] = await Promise.all([
        supabase.from("purchase_orders").select("id, po_number, factory, status, production_stage, order_date, eta, total_value, prepaid_amount, is_prepaid, container_type").limit(1000),
        supabase.from("purchase_order_lines").select("id, po_id, sku, qty_ordered, qty_received, unit_cost, eta").limit(1000),
      ]);
      if (!active) return;
      setPurchaseOrders((po.data ?? []) as PurchaseOrder[]);
      setPoLines((pol.data ?? []) as PurchaseOrderLine[]);
    };

    (async () => {
      const [oso, ssh, ls, ds] = await Promise.all([
        supabase.from("open_sales_orders").select("id, order_number, sku, dealer_name, qty_open, unit_price, extended_value, order_date, promised_date").limit(1000),
        supabase.from("sku_sales_history").select("id, sku, year, month, units_sold, revenue, forecast_units").limit(1000),
        supabase.from("lost_sales_events").select("id, sku, event_date, qty_requested, estimated_value, reason, dealer_name").limit(1000),
        supabase.from("dealer_demand_signals").select("id, sku, dealer_name, signal_type, signal_strength, signal_date, notes").limit(1000),
      ]);
      if (!active) return;
      setOpenOrders((oso.data ?? []) as OpenSalesOrder[]);
      setSalesHistory((ssh.data ?? []) as SkuSalesHistory[]);
      setLostSales((ls.data ?? []) as LostSaleEvent[]);
      setDemandSignals((ds.data ?? []) as DealerDemandSignal[]);
      await loadPOs();
      setLoading(false);
    })();

    // Debounced refetch for live PO updates from Acctivate sync
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { loadPOs(); }, 400);
    };

    const channel = supabase
      .channel("inventory-hub-pos")
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_order_lines" }, scheduleReload)
      .subscribe();

    // Safety net: poll every 60s in case realtime drops
    const poll = setInterval(loadPOs, 60_000);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  return { openOrders, purchaseOrders, poLines, salesHistory, lostSales, demandSignals, loading };
}
