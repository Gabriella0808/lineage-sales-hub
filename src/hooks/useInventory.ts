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
  on_hand_value: number | null;
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

// Lead time per Acctivate model: ~32 weeks
const LEAD_WEEKS = 32;

function deriveStatus(available: number, weeks: number | null): InventoryStatus {
  if (available <= 0) return "out-of-stock";
  if (weeks == null) return available <= 5 ? "critical" : "healthy";
  if (weeks < LEAD_WEEKS * 0.5) return "critical";       // < 16 wk
  if (weeks < LEAD_WEEKS) return "reorder-soon";          // < 32 wk
  if (weeks > LEAD_WEEKS * 2) return "overstock";         // > 64 wk
  if (weeks >= LEAD_WEEKS && weeks <= LEAD_WEEKS * 1.5) return "fast-moving";
  return "healthy";
}

const ALLOWED: ReadonlySet<InventoryStatus> = new Set([
  "out-of-stock", "critical", "reorder-soon", "stockout-risk",
  "fast-moving", "overstock", "liquidate", "healthy",
]);

function normalizeStatus(raw: string | null, available: number, weeks: number | null): InventoryStatus {
  if (available <= 0) return "out-of-stock";
  if (raw && raw !== "out-of-stock" && ALLOWED.has(raw as InventoryStatus)) return raw as InventoryStatus;
  return deriveStatus(available, weeks);
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

    const [{ data, error }, { data: prodRows }, { data: liveRows }] = await Promise.all([
      supabase
        .from("inventory")
        .select("id, sku, product, collection, supplier, on_hand, available, avg_monthly_sales, months_supply, status, link, last_synced_at, unit_cost, on_hand_value, list_price, is_closeout, is_discontinued, factory, moq, lead_time_days, forecast_monthly, units_l12m, units_l6m, units_l3m, on_po, on_sales_order, in_transit, on_hand_nc, on_hand_vn, reorder_basis, reorder_override_per_week, lead_time_months, cubes, reorder_min, reorder_max, is_clearance")
        .order("status", { ascending: true })
        .limit(1000),
      supabase.from("products").select("sku, brand").limit(1000),
      // Fresh per-SKU on-hand & value from the Acctivate Skyvia sync
      // (dbo_InventoryOnHandByLocationSummary aggregated by ProductID).
      (supabase.from("inventory_live_onhand" as never) as unknown as {
        select: (cols: string) => { limit: (n: number) => Promise<{ data: { sku: string; on_hand: number | string; on_hand_value: number | string; last_synced_at: string | null }[] | null }> };
      }).select("sku, on_hand, on_hand_value, last_synced_at").limit(2000),
    ]);

    const brandBySku = new Map<string, string>();
    for (const p of prodRows ?? []) {
      if (p.sku && p.brand) brandBySku.set(p.sku, p.brand);
    }

    // SKU -> live (on_hand, on_hand_value) from the freshest Acctivate sync.
    const liveBySku = new Map<string, { onHand: number; onHandValue: number; syncedAt: string | null }>();
    for (const r of liveRows ?? []) {
      if (!r.sku) continue;
      liveBySku.set(r.sku, {
        onHand: Number(r.on_hand ?? 0),
        onHandValue: Number(r.on_hand_value ?? 0),
        syncedAt: r.last_synced_at,
      });
    }

    if (error || !data || data.length === 0) {
      setItems(mockInventory);
      setUsingMock(true);
      setLastSyncedAt(null);
    } else {
      const rows = (data as DbInventoryRow[]).map((r) => {
        const live = liveBySku.get(r.sku);
        const onHand = live ? live.onHand : Number(r.on_hand ?? 0);
        // When live Acctivate on-hand is present, treat it as the source of truth
        // for availability so the Out-of-Stock / Lost Sales section reflects the
        // same data powering Total Inventory Value. We subtract reserved units
        // (on sales orders) implied by the curated table to approximate available.
        const curatedOnHand = Number(r.on_hand ?? 0);
        const curatedAvailable = Number(r.available ?? 0);
        const reserved = Math.max(0, curatedOnHand - curatedAvailable);
        const available = live ? Math.max(0, live.onHand - reserved) : curatedAvailable;
        const avg = Number(r.avg_monthly_sales ?? 0);
        const mos = r.months_supply == null ? null : Number(r.months_supply);
        // Derive weeks of supply from (Available + On PO) ÷ Sales/Week (Acctivate model)
        const onPo = r.on_po == null ? 0 : Number(r.on_po);
        const salesPerWeek = avg / 4.333;
        const weeks = salesPerWeek > 0 ? (available + onPo) / salesPerWeek : null;
        const onHandValue = live ? live.onHandValue : (r.on_hand_value == null ? undefined : Number(r.on_hand_value));
        return {
          sku: r.sku,
          product: r.product,
          collection: r.collection ?? "Uncategorized",
          brand: brandBySku.get(r.sku),
          supplier: r.supplier ?? "-",
          onHand,
          available,
          avgMonthlySales: avg,
          monthsSupply: mos,
          status: normalizeStatus(r.status, available, weeks),
          link: r.link ?? undefined,
          unitCost: r.unit_cost == null ? undefined : Number(r.unit_cost),
          onHandValue,
          listPrice: r.list_price == null ? undefined : Number(r.list_price),
          isCloseout: /^C:/i.test(r.sku ?? ""),
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

      let newest = data.reduce<string | null>((acc, r) => {
        const t = (r as DbInventoryRow).last_synced_at;
        if (!t) return acc;
        if (!acc || t > acc) return t;
        return acc;
      }, null);
      for (const v of liveBySku.values()) {
        if (v.syncedAt && (!newest || v.syncedAt > newest)) newest = v.syncedAt;
      }

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
