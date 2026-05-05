import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InventoryItem, InventoryStatus } from "@/data/inventoryMock";
import { inventoryItems as mockInventory } from "@/data/inventoryMock";

interface DbInventoryRow {
  id: string;
  sku: string;
  product: string;
  collection: string | null;
  supplier: string | null;
  on_hand: number | null;
  available: number | null;
  avg_monthly_sales: number | null;
  months_supply: number | null;
  status: string | null;
  link: string | null;
  last_synced_at: string | null;
  unit_cost: number | null;
  list_price: number | null;
  is_closeout: boolean | null;
  is_discontinued: boolean | null;
  factory: string | null;
  moq: number | null;
  lead_time_days: number | null;
  forecast_monthly: number | null;
  units_l12m: number | null;
  units_l6m: number | null;
  units_l3m: number | null;
  on_po: number | null;
  on_sales_order: number | null;
  in_transit: number | null;
  on_hand_nc: number | null;
  on_hand_vn: number | null;
  reorder_basis: string | null;
  reorder_override_per_week: number | null;
  lead_time_months: number | null;
  cubes: number | null;
  reorder_min: number | null;
  reorder_max: number | null;
  is_clearance: boolean | null;
}

function deriveStatus(onHand: number, monthsSupply: number | null): InventoryStatus {
  if (onHand <= 0) return "out-of-stock";
  if (onHand <= 5) return "critical";
  if (onHand <= 20) return "reorder-soon";
  if (monthsSupply != null && monthsSupply > 12) return "overstock";
  if (monthsSupply != null && monthsSupply >= 3) return "fast-moving";
  return "healthy";
}

const ALLOWED: ReadonlySet<InventoryStatus> = new Set([
  "out-of-stock", "critical", "reorder-soon", "stockout-risk",
  "fast-moving", "overstock", "liquidate", "healthy",
]);

function normalizeStatus(raw: string | null, onHand: number, monthsSupply: number | null): InventoryStatus {
  if (raw && ALLOWED.has(raw as InventoryStatus)) return raw as InventoryStatus;
  return deriveStatus(onHand, monthsSupply);
}

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);

    const { data, error } = await supabase
      .from("inventory")
      .select("id, sku, product, collection, supplier, on_hand, available, avg_monthly_sales, months_supply, status, link, last_synced_at, unit_cost, list_price, is_closeout, is_discontinued, factory, moq, lead_time_days, forecast_monthly, units_l12m, units_l6m, units_l3m, on_po, on_sales_order, in_transit, on_hand_nc, on_hand_vn, reorder_basis, reorder_override_per_week, lead_time_months, cubes, reorder_min, reorder_max, is_clearance")
      .order("status", { ascending: true })
      .limit(1000);

    if (error || !data || data.length === 0) {
      setItems(mockInventory);
      setUsingMock(true);
      setLastSyncedAt(null);
    } else {
      const rows = (data as DbInventoryRow[]).map((r) => {
        const onHand = Number(r.on_hand ?? 0);
        const available = Number(r.available ?? 0);
        const avg = Number(r.avg_monthly_sales ?? 0);
        const mos = r.months_supply == null ? null : Number(r.months_supply);
        return {
          sku: r.sku,
          product: r.product,
          collection: r.collection ?? "Uncategorized",
          supplier: r.supplier ?? "—",
          onHand,
          available,
          avgMonthlySales: avg,
          monthsSupply: mos,
          status: normalizeStatus(r.status, onHand, mos),
          link: r.link ?? undefined,
          unitCost: r.unit_cost == null ? undefined : Number(r.unit_cost),
          listPrice: r.list_price == null ? undefined : Number(r.list_price),
          isCloseout: r.is_closeout ?? false,
          isDiscontinued: r.is_discontinued ?? false,
          factory: r.factory ?? undefined,
          moq: r.moq ?? undefined,
          leadTimeDays: r.lead_time_days ?? undefined,
          forecastMonthly: r.forecast_monthly == null ? undefined : Number(r.forecast_monthly),
          unitsL12m: r.units_l12m == null ? undefined : Number(r.units_l12m),
          unitsL6m: r.units_l6m == null ? undefined : Number(r.units_l6m),
          unitsL3m: r.units_l3m == null ? undefined : Number(r.units_l3m),
          onPo: r.on_po == null ? undefined : Number(r.on_po),
          onSalesOrder: r.on_sales_order == null ? undefined : Number(r.on_sales_order),
          inTransit: r.in_transit == null ? undefined : Number(r.in_transit),
          onHandNc: r.on_hand_nc == null ? undefined : Number(r.on_hand_nc),
          onHandVn: r.on_hand_vn == null ? undefined : Number(r.on_hand_vn),
          reorderBasis: (r.reorder_basis as InventoryItem["reorderBasis"]) ?? "L12M",
          reorderOverridePerWeek: r.reorder_override_per_week == null ? undefined : Number(r.reorder_override_per_week),
          leadTimeMonths: r.lead_time_months == null ? undefined : Number(r.lead_time_months),
          cubes: r.cubes == null ? undefined : Number(r.cubes),
          reorderMin: r.reorder_min == null ? undefined : Number(r.reorder_min),
          reorderMax: r.reorder_max == null ? undefined : Number(r.reorder_max),
          isClearance: r.is_clearance ?? false,
        } satisfies InventoryItem;
      });

      const newest = data.reduce<string | null>((acc, r) => {
        const t = (r as DbInventoryRow).last_synced_at;
        if (!t) return acc;
        if (!acc || t > acc) return t;
        return acc;
      }, null);

      setItems(rows);
      setLastSyncedAt(newest);
      setUsingMock(false);
    }

    setLastFetchedAt(new Date().toISOString());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const refresh = useCallback(() => load("refresh"), [load]);

  return { items, loading, refreshing, lastSyncedAt, lastFetchedAt, usingMock, refresh };
}
