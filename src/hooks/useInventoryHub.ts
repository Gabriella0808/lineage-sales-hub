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

export interface OpenPO {
  po_number: string;
  po_status: string | null;
  vendor_id: string | null;
  due_date: string | null;
  estimated_arrival: string | null;
  warehouse: string | null;
  percent_received: number | null;
  percent_invoiced: number | null;
  total_amount: number;
  outstanding_qty: number;
  outstanding_amount: number;
  ship_via: string | null;
  container_num: string | null;
  vessel: string | null;
  forwarder: string | null;
  shipment_status: string | null;
  days_late: number | null;
  pi_factory_date: string | null;
  cargo_ready_date: string | null;
  factory_days_late: number | null;
  factory_late_status: string | null;
}

export interface OpenPOLine {
  sku: string;
  description: string | null;
  po_number: string;
  vendor_id: string | null;
  warehouse: string | null;
  quantity_ordered: number;
  quantity_received: number;
  quantity_outstanding: number;
  amount_open: number;
  estimated_arrival: string | null;
  shipment_status: string | null;
  days_late: number | null;
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

export interface InventorySummaryRow {
  guid_product_warehouse: string;
  sku: string;
  product: string | null;
  warehouse: string | null;
  collection: string | null;
  on_hand: number;
  available: number;
  inventory_value: number;
  unit_cost: number | null;
}

export interface CloseoutRow {
  guid_product_warehouse: string;
  sku: string;
  product: string | null;
  warehouse: string | null;
  collection: string | null;
  on_hand: number;
  available: number;
  unit_cost: number | null;
  inventory_value: number;
  discontinued: boolean | null;
  active_product: boolean | null;
  avail_on_web: boolean | null;
  is_closeout: boolean | null;
}

export function useInventoryHub() {
  const [openOrders, setOpenOrders] = useState<OpenSalesOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poLines, setPoLines] = useState<PurchaseOrderLine[]>([]);
  const [openPOs, setOpenPOs] = useState<OpenPO[]>([]);
  const [openPOLines, setOpenPOLines] = useState<OpenPOLine[]>([]);
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryRow[]>([]);
  const [closeoutInventory, setCloseoutInventory] = useState<CloseoutRow[]>([]);
  const [clearanceInventoryValue, setClearanceInventoryValue] = useState<number>(0);
  const [salesHistory, setSalesHistory] = useState<SkuSalesHistory[]>([]);
  const [lostSales, setLostSales] = useState<LostSaleEvent[]>([]);
  const [demandSignals, setDemandSignals] = useState<DealerDemandSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadPOs = async () => {
      const [po, pol, vpo, vpol] = await Promise.all([
        supabase.from("purchase_orders").select("id, po_number, factory, status, production_stage, order_date, eta, total_value, prepaid_amount, is_prepaid, container_type").limit(1000),
        supabase.from("purchase_order_lines").select("id, po_id, sku, qty_ordered, qty_received, unit_cost, eta").limit(1000),
        supabase.from("v_portal_open_pos").select("po_number, po_status, vendor_id, due_date, estimated_arrival, warehouse, percent_received, percent_invoiced, total_amount, outstanding_qty, outstanding_amount, ship_via, container_num, vessel, forwarder, shipment_status, days_late, pi_factory_date, cargo_ready_date, factory_days_late, factory_late_status").limit(2000),
        supabase.from("v_portal_open_po_lines").select("sku, description, po_number, vendor_id, warehouse, quantity_ordered, quantity_received, quantity_outstanding, amount_open, estimated_arrival, shipment_status, days_late").limit(5000),
      ]);
      if (!active) return;
      setPurchaseOrders((po.data ?? []) as PurchaseOrder[]);
      setPoLines((pol.data ?? []) as PurchaseOrderLine[]);
      if (vpo.error) console.error("[useInventoryHub] v_portal_open_pos:", vpo.error);
      else setOpenPOs((vpo.data ?? []).map((r: any) => ({ ...r, total_amount: Number(r.total_amount), outstanding_qty: Number(r.outstanding_qty), outstanding_amount: Number(r.outstanding_amount), percent_received: r.percent_received != null ? Number(r.percent_received) : null, percent_invoiced: r.percent_invoiced != null ? Number(r.percent_invoiced) : null, days_late: r.days_late != null ? Number(r.days_late) : null, factory_days_late: r.factory_days_late != null ? Number(r.factory_days_late) : null })) as OpenPO[]);
      if (vpol.error) console.error("[useInventoryHub] v_portal_open_po_lines:", vpol.error);
      else setOpenPOLines((vpol.data ?? []).map((r: any) => ({ ...r, quantity_ordered: Number(r.quantity_ordered), quantity_received: Number(r.quantity_received), quantity_outstanding: Number(r.quantity_outstanding), amount_open: Number(r.amount_open), days_late: r.days_late != null ? Number(r.days_late) : null })) as OpenPOLine[]);
    };

    const fetchAllOpenOrders = async () => {
      const pageSize = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("open_sales_orders")
          .select("id, order_number, sku, dealer_name, qty_open, unit_price, extended_value, order_date, promised_date, stock_class")
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    };

    const fetchInventorySummary = async () => {
      const pageSize = 2000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("v_portal_inventory_summary")
          .select("guid_product_warehouse, sku, product, warehouse, collection, on_hand, available, inventory_value, unit_cost")
          .order("inventory_value", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) { console.error("[useInventoryHub] v_portal_inventory_summary:", error); break; }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all.map((r: any) => ({
        ...r,
        on_hand: Number(r.on_hand),
        available: Number(r.available),
        inventory_value: Number(r.inventory_value),
        unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
      })) as InventorySummaryRow[];
    };

    const fetchCloseoutInventory = async () => {
      const pageSize = 2000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("v_portal_closeout_inventory")
          .select("guid_product_warehouse, sku, product, warehouse, collection, on_hand, available, unit_cost, inventory_value, discontinued, active_product, avail_on_web, is_closeout")
          .order("inventory_value", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) { console.error("[useInventoryHub] v_portal_closeout_inventory:", error); break; }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all.map((r: any) => ({
        ...r,
        on_hand: Number(r.on_hand),
        available: Number(r.available),
        unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
        inventory_value: Number(r.inventory_value),
      })) as CloseoutRow[];
    };

    const fetchClearanceInventoryValue = async () => {
      const pageSize = 2000;
      let total = 0;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("v_portal_clearance_products")
          .select("inventory_value")
          .range(from, from + pageSize - 1);
        if (error) { console.error("[useInventoryHub] v_portal_clearance_products (value):", error); break; }
        if (!data || data.length === 0) break;
        total += (data as any[]).reduce((s, r) => s + (r.inventory_value != null ? Number(r.inventory_value) : 0), 0);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return total;
    };

    (async () => {
      const [oso, ssh, ls, ds, inv, co, clv] = await Promise.all([
        fetchAllOpenOrders(),
        supabase.from("sku_sales_history").select("id, sku, year, month, units_sold, revenue, forecast_units").limit(1000),
        supabase.from("lost_sales_events").select("id, sku, event_date, qty_requested, estimated_value, reason, dealer_name").limit(1000),
        supabase.from("dealer_demand_signals").select("id, sku, dealer_name, signal_type, signal_strength, signal_date, notes").limit(1000),
        fetchInventorySummary(),
        fetchCloseoutInventory(),
        fetchClearanceInventoryValue(),
      ]);
      if (!active) return;
      setOpenOrders(oso as OpenSalesOrder[]);
      setSalesHistory((ssh.data ?? []) as SkuSalesHistory[]);
      setLostSales((ls.data ?? []) as LostSaleEvent[]);
      setDemandSignals((ds.data ?? []) as DealerDemandSignal[]);
      setInventorySummary(inv);
      setCloseoutInventory(co);
      setClearanceInventoryValue(clv);
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

  return { openOrders, purchaseOrders, poLines, openPOs, openPOLines, inventorySummary, closeoutInventory, clearanceInventoryValue, salesHistory, lostSales, demandSignals, loading };
}
