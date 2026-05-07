import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, PackageOpen, TrendingUp, TrendingDown, Tag, Activity,
  Truck, Factory, AlertCircle, ShoppingCart, CalendarClock, Layers,
  Heart, Trophy, Ban, Target, Users, Search,
  Package, AlertTriangle, XCircle, RefreshCw, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from "recharts";
import type { InventoryItem } from "@/data/inventoryMock";
import { useInventoryHub, type PurchaseOrder } from "@/hooks/useInventoryHub";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { weeksOfSupply, weeksTone, LEAD_TIME_WEEKS } from "@/lib/inventoryMath";
import ComparePeriodsReport from "@/components/ComparePeriodsReport";

const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` :
  n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` :
  `$${n.toFixed(0)}`;
const fmtNum = (n: number) => n.toLocaleString();

const STAGES = [
  { key: "in_manufacturing", label: "In Manufacturing" },
  { key: "loaded", label: "Loaded" },
  { key: "in_transit", label: "In Transit" },
  { key: "at_port", label: "At Port" },
  { key: "arrived", label: "Arrived" },
  { key: "closed", label: "Closed" },
] as const;

const STAGE_COLOR: Record<string, string> = {
  in_manufacturing: "bg-muted text-muted-foreground border-border",
  loaded: "bg-accent/15 text-accent-foreground border-accent/30",
  in_transit: "bg-primary/10 text-primary border-primary/20",
  at_port: "bg-warning/15 text-warning-foreground border-warning/30",
  arrived: "bg-success/15 text-success border-success/25",
  closed: "bg-muted text-muted-foreground border-border",
};

function KPI({ label, value, hint, icon: Icon, accent, onClick, active }: {
  label: string; value: string | number; hint?: string;
  icon: React.ComponentType<{ className?: string }>; accent?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const inner = (
    <>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
        {hint && <div className={cn("text-xs mt-1", accent ?? "text-muted-foreground")}>{hint}</div>}
      </div>
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "text-left rounded-lg border bg-card p-5 flex items-start justify-between transition-colors hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring",
          active ? "border-primary ring-1 ring-primary/40" : "border-border",
        )}
      >
        {inner}
      </button>
    );
  }
  return <Card className="p-5 flex items-start justify-between">{inner}</Card>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
      {message}
    </div>
  );
}


function ReportSkuValue({ items, total }: { items: InventoryItem[]; total: number }) {
  const rows = useMemo(() => items
    .map((it) => ({ it, value: it.onHandValue ?? (it.unitCost ?? 0) * it.onHand }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value), [items]);
  if (rows.length === 0) return <EmptyState message="No SKUs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-left px-3 py-2">Collection</th>
          <th className="text-right px-3 py-2">On Hand</th>
          <th className="text-right px-3 py-2">Unit Cost</th>
          <th className="text-right px-3 py-2">Value</th>
          <th className="text-right px-3 py-2">% of Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ it, value }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-xs text-muted-foreground">{it.collection}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.onHand)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{it.unitCost ? `$${it.unitCost.toFixed(2)}` : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(value)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportPOs({ pos, prepaidMode }: { pos: PurchaseOrder[]; prepaidMode?: boolean }) {
  const rows = [...pos].sort((a, b) => Number(b.total_value) - Number(a.total_value));
  if (rows.length === 0) return <EmptyState message="No POs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">PO #</th>
          <th className="text-left px-3 py-2">Factory</th>
          <th className="text-left px-3 py-2">Stage</th>
          <th className="text-left px-3 py-2">ETA</th>
          <th className="text-right px-3 py-2">Total Value</th>
          {prepaidMode && <th className="text-right px-3 py-2">Prepaid</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{p.po_number ?? "—"}</td>
            <td className="px-3 py-2">{p.factory ?? "—"}</td>
            <td className="px-3 py-2 text-xs">{p.production_stage ?? p.status ?? "—"}</td>
            <td className="px-3 py-2 text-xs">{p.eta ? new Date(p.eta).toLocaleDateString() : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(Number(p.total_value))}</td>
            {prepaidMode && <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(p.prepaid_amount ?? 0))}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportBacklog({ rows }: { rows: { id: string; order_number: string | null; sku: string; dealer_name: string | null; qty_open: number; unit_price: number; extended_value: number; order_date: string | null; promised_date: string | null }[] }) {
  if (rows.length === 0) return <EmptyState message="No open sales orders." />;
  const sorted = [...rows].sort((a, b) => Number(b.extended_value) - Number(a.extended_value));
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">Order #</th>
          <th className="text-left px-3 py-2">Dealer</th>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-right px-3 py-2">Qty Open</th>
          <th className="text-right px-3 py-2">Unit Price</th>
          <th className="text-right px-3 py-2">Value</th>
          <th className="text-left px-3 py-2">Promised</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{r.order_number ?? "—"}</td>
            <td className="px-3 py-2 max-w-[200px] truncate">{r.dealer_name ?? "—"}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(Number(r.qty_open))}</td>
            <td className="px-3 py-2 text-right tabular-nums">${Number(r.unit_price).toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(Number(r.extended_value))}</td>
            <td className="px-3 py-2 text-xs">{r.promised_date ? new Date(r.promised_date).toLocaleDateString() : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportSalesRatio({ items }: { items: InventoryItem[] }) {
  const rows = useMemo(() => items.map((it) => {
    const value = it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
    const monthlySales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
    const ratio = value > 0 ? monthlySales / value : 0;
    return { it, value, monthlySales, ratio };
  }).filter((r) => r.value > 0).sort((a, b) => a.ratio - b.ratio), [items]);
  if (rows.length === 0) return <EmptyState message="No SKUs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-right px-3 py-2">Inv Value</th>
          <th className="text-right px-3 py-2">Mo Sales $</th>
          <th className="text-right px-3 py-2">Ratio</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map(({ it, value, monthlySales, ratio }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(value)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(monthlySales)}</td>
            <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", ratio < 0.2 && "text-destructive", ratio >= 0.5 && "text-success")}>{ratio.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportTurnover({ items }: { items: InventoryItem[] }) {
  const rows = useMemo(() => items.map((it) => {
    const value = it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
    const annualSales = it.avgMonthlySales * 12 * (it.listPrice ?? it.unitCost ?? 0);
    const turns = value > 0 ? annualSales / value : 0;
    return { it, value, turns };
  }).filter((r) => r.value > 0).sort((a, b) => b.turns - a.turns), [items]);
  if (rows.length === 0) return <EmptyState message="No SKUs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-right px-3 py-2">Inv Value</th>
          <th className="text-right px-3 py-2">Mo Sales</th>
          <th className="text-right px-3 py-2">Turns / yr</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map(({ it, value, turns }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(value)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales.toFixed(1)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{turns.toFixed(1)}×</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportLost({ items }: { items: InventoryItem[] }) {
  const rows = useMemo(() => items.map((it) => ({
    it, lost: it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0),
  })).filter((r) => r.lost > 0).sort((a, b) => b.lost - a.lost), [items]);
  if (rows.length === 0) return <EmptyState message="No active stockouts with sales history." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-right px-3 py-2">Mo Sales (units)</th>
          <th className="text-right px-3 py-2">On PO</th>
          <th className="text-right px-3 py-2">Lost / mo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ it, lost }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales.toFixed(1)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.onPo ?? 0)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">{fmtMoney(lost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = STAGE_COLOR[stage] ?? "bg-muted text-muted-foreground border-border";
  const label = STAGES.find((s) => s.key === stage)?.label ?? stage;
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs border", cls)}>{label}</span>;
}

type StatusFilter = "all" | InventoryItem["status"];

interface Props {
  items: InventoryItem[];
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (s: StatusFilter) => void;
}

export default function InventoryDashboards({ items, statusFilter, onStatusFilterChange }: Props) {
  const hub = useInventoryHub();

  // Status counts for clickable summary tiles
  const statusCounts = useMemo(() => {
    const c = { total: items.length, critical: 0, outOfStock: 0, reorder: 0, fast: 0 };
    for (const it of items) {
      if (it.status === "critical") c.critical++;
      if (it.status === "out-of-stock") c.outOfStock++;
      if (it.status === "reorder-soon") c.reorder++;
      if (it.status === "fast-moving") c.fast++;
    }
    return c;
  }, [items]);


  // ============ SECTION 1: HIGH LEVEL SUMMARY ============
  const summary = useMemo(() => {
    let value = 0, units = 0, monthlySales = 0, lostSales = 0;
    let outOfStockValue = 0, closeoutValue = 0, annualUnits = 0;
    for (const it of items) {
      const cost = it.unitCost ?? 0;
      const lineValue = it.onHandValue ?? cost * it.onHand;
      value += lineValue;
      units += it.onHand;
      monthlySales += it.avgMonthlySales * (it.listPrice ?? cost);
      annualUnits += it.avgMonthlySales * 12;
      if (it.status === "out-of-stock") {
        lostSales += it.avgMonthlySales * (it.listPrice ?? cost);
        outOfStockValue += it.avgMonthlySales * (it.listPrice ?? cost);
      }
      if (it.isCloseout || it.isClearance) closeoutValue += lineValue;
    }
    const backlogValue = hub.openOrders.reduce((s, o) => s + Number(o.extended_value ?? 0), 0);
    const backlogUnits = hub.openOrders.reduce((s, o) => s + Number(o.qty_open ?? 0), 0);
    const openPoValue = hub.purchaseOrders
      .filter((p) => p.production_stage !== "closed" && p.production_stage !== "arrived")
      .reduce((s, p) => s + Number(p.total_value ?? 0), 0);
    const prepaidValue = hub.purchaseOrders
      .filter((p) => p.is_prepaid)
      .reduce((s, p) => s + Number(p.prepaid_amount ?? 0), 0);
    const salesToInv = value > 0 ? monthlySales / value : 0;
    // Annual turnover ≈ annual COGS / avg inventory value (proxy: annual units * cost / value)
    const turnover = value > 0 ? (monthlySales * 12) / value : 0;
    return { value, units, monthlySales, backlogValue, backlogUnits, openPoValue, prepaidValue, salesToInv, lostSales, outOfStockValue, closeoutValue, turnover };
  }, [items, hub.openOrders, hub.purchaseOrders]);

  // Value by collection / brand for drilldown
  const valueByCollection = useMemo(() => {
    const m = new Map<string, { value: number; skus: number; units: number }>();
    for (const it of items) {
      const k = it.collection || "—";
      const e = m.get(k) ?? { value: 0, skus: 0, units: 0 };
      e.value += it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
      e.skus += 1;
      e.units += it.onHand;
      m.set(k, e);
    }
    return Array.from(m, ([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
  }, [items]);

  const valueByBrand = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const k = it.brand || "—";
      m.set(k, (m.get(k) ?? 0) + (it.onHandValue ?? (it.unitCost ?? 0) * it.onHand));
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [items]);

  const newProducts = useMemo(
    () => items.filter((it) => it.avgMonthlySales === 0 && (it.unitsL12m ?? 0) === 0).slice(0, 50),
    [items],
  );

  // PO arrival buckets (next 30/60/90, late)
  const poBuckets = useMemo(() => {
    const today = new Date();
    const buckets = { late: [] as PurchaseOrder[], d30: [] as PurchaseOrder[], d60: [] as PurchaseOrder[], d90: [] as PurchaseOrder[] };
    for (const po of hub.purchaseOrders) {
      if (po.production_stage === "closed" || po.production_stage === "arrived") continue;
      if (!po.eta) continue;
      const eta = new Date(po.eta);
      const days = Math.floor((eta.getTime() - today.getTime()) / 86400000);
      if (days < 0) buckets.late.push(po);
      else if (days <= 30) buckets.d30.push(po);
      else if (days <= 60) buckets.d60.push(po);
      else if (days <= 90) buckets.d90.push(po);
    }
    return buckets;
  }, [hub.purchaseOrders]);

  // PO stage counts
  const stageCounts = useMemo(() => {
    const m = new Map<string, { count: number; value: number }>();
    for (const po of hub.purchaseOrders) {
      const k = po.production_stage ?? "unknown";
      const e = m.get(k) ?? { count: 0, value: 0 };
      e.count++;
      e.value += Number(po.total_value ?? 0);
      m.set(k, e);
    }
    return STAGES.map((s) => ({ ...s, ...(m.get(s.key) ?? { count: 0, value: 0 }) }));
  }, [hub.purchaseOrders]);

  // ============ SECTION 2: ANALYSIS ============
  const totalInvValue = summary.value || 1;
  const totalSalesAmount = items.reduce((s, it) => s + it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0), 0) || 1;

  const analysisRows = useMemo(() => {
    return items.map((it) => {
      const value = it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
      const sales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
      return {
        ...it,
        value,
        pctTotalInv: (value / totalInvValue) * 100,
        pctTotalSales: (sales / totalSalesAmount) * 100,
      };
    }).sort((a, b) => b.value - a.value);
  }, [items, totalInvValue, totalSalesAmount]);

  // Vendor performance
  const vendorPerf = useMemo(() => {
    const m = new Map<string, { sales: number; value: number }>();
    for (const it of items) {
      const v = it.supplier ?? "—";
      const sales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
      const e = m.get(v) ?? { sales: 0, value: 0 };
      e.sales += sales;
      e.value += (it.unitCost ?? 0) * it.onHand;
      m.set(v, e);
    }
    const total = Array.from(m.values()).reduce((s, e) => s + e.sales, 0) || 1;
    return Array.from(m, ([vendor, v]) => ({
      vendor,
      sales: v.sales,
      pctSales: (v.sales / total) * 100,
      value: v.value,
    })).sort((a, b) => b.sales - a.sales);
  }, [items]);

  // Slow movers
  const slowMovers = useMemo(() =>
    [...items]
      .filter((it) => (it.monthsSupply ?? 0) >= 6 && it.onHand > 0)
      .sort((a, b) => (b.monthsSupply ?? 0) - (a.monthsSupply ?? 0))
      .slice(0, 30),
    [items]);

  // Inventory aging (received_date based — only available items shown)
  const aging = useMemo(() => {
    const today = Date.now();
    const buckets = { d030: 0, d3160: 0, d6190: 0, d90plus: 0, unknown: 0 };
    for (const it of items) {
      const received = (it as any).received_date as string | undefined;
      const value = (it.unitCost ?? 0) * it.onHand;
      if (!received) { buckets.unknown += value; continue; }
      const days = Math.floor((today - new Date(received).getTime()) / 86400000);
      if (days <= 30) buckets.d030 += value;
      else if (days <= 60) buckets.d3160 += value;
      else if (days <= 90) buckets.d6190 += value;
      else buckets.d90plus += value;
    }
    return [
      { bucket: "0–30 days", value: buckets.d030 },
      { bucket: "31–60 days", value: buckets.d3160 },
      { bucket: "61–90 days", value: buckets.d6190 },
      { bucket: "90+ days", value: buckets.d90plus },
      { bucket: "Unknown", value: buckets.unknown },
    ];
  }, [items]);

  // Comparative sales: pick 2 periods
  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const r of hub.salesHistory) set.add(`${r.year}-${String(r.month).padStart(2, "0")}`);
    return Array.from(set).sort();
  }, [hub.salesHistory]);
  const [periodA, setPeriodA] = useState<string>("");
  const [periodB, setPeriodB] = useState<string>("");

  const compareRows = useMemo(() => {
    if (!periodA || !periodB) return [];
    const a = new Map<string, number>();
    const b = new Map<string, number>();
    for (const r of hub.salesHistory) {
      const k = `${r.year}-${String(r.month).padStart(2, "0")}`;
      if (k === periodA) a.set(r.sku, (a.get(r.sku) ?? 0) + Number(r.units_sold ?? 0));
      if (k === periodB) b.set(r.sku, (b.get(r.sku) ?? 0) + Number(r.units_sold ?? 0));
    }
    const allSkus = new Set<string>([...a.keys(), ...b.keys()]);
    return Array.from(allSkus, (sku) => {
      const va = a.get(sku) ?? 0;
      const vb = b.get(sku) ?? 0;
      const diff = vb - va;
      const pct = va > 0 ? (diff / va) * 100 : null;
      return { sku, periodA: va, periodB: vb, diff, pct };
    }).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 25);
  }, [hub.salesHistory, periodA, periodB]);

  // ============ SECTION 4: CLOSEOUT ============
  const closeoutRows = useMemo(() =>
    items.filter((it) => it.isCloseout).map((it) => {
      const initial = (it as any).closeout_initial_qty as number | undefined;
      const sold = (it as any).closeout_units_sold as number | undefined;
      const pctSold = initial && initial > 0 ? ((sold ?? 0) / initial) * 100 : null;
      const burnDownMonths = it.avgMonthlySales > 0 ? it.onHand / it.avgMonthlySales : null;
      return { ...it, initial, sold, pctSold, burnDownMonths };
    }), [items]);

  const closeoutTotal = closeoutRows.reduce((s, it) => s + (it.onHandValue ?? (it.unitCost ?? 0) * it.onHand), 0);

  // ============ SECTION 3: REORDER ============
  // Per Justin: weekly unit-sales windows L12M / L6M / L3M / Override.
  // New Min = SalesPerWeek * 4.35 (wks/mo) * leadTimeMonths (default 4.5)
  // Net Avail = OnHand + OnPO + InTransit
  // Order is rounded up to MOQ. Wks of cover = (NetAvail+Order) / SalesPerWeek
  type Basis = "L12M" | "L6M" | "L3M" | "OVERRIDE";
  interface Override { basis?: Basis; perWeek?: number; leadMonths?: number }
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const setOv = (sku: string, patch: Override) =>
    setOverrides((prev) => ({ ...prev, [sku]: { ...prev[sku], ...patch } }));

  // User-entered Order quantities (the ONLY editable column in the InvCut-style sheet)
  const [orderQty, setOrderQty] = useState<Record<string, number>>({});
  const setOrder = (sku: string, qty: number) =>
    setOrderQty((prev) => ({ ...prev, [sku]: qty }));

  const reorderRows = useMemo(() => {
    return items.map((it) => {
      const ov = overrides[it.sku] ?? {};
      const wkL12 = it.unitsL12m != null ? it.unitsL12m / 52
                  : it.ltmUnits != null ? it.ltmUnits / 52
                  : (it.avgMonthlySales || 0) * 12 / 52;
      const wkL6  = it.unitsL6m != null ? it.unitsL6m / 26 : null;
      const wkL3  = it.unitsL3m != null ? it.unitsL3m / 13 : null;

      const basis: Basis = ov.basis ?? (it.reorderBasis as Basis) ?? "L12M";
      const overrideWk = ov.perWeek ?? it.reorderOverridePerWeek;
      const leadMonths = ov.leadMonths ?? it.leadTimeMonths ?? 4.5;

      let salesPerWeek = wkL12;
      if (basis === "L6M" && wkL6 != null) salesPerWeek = wkL6;
      else if (basis === "L3M" && wkL3 != null) salesPerWeek = wkL3;
      else if (basis === "OVERRIDE" && overrideWk != null) salesPerWeek = overrideWk;
      else if (overrideWk != null && basis === "OVERRIDE") salesPerWeek = overrideWk;

      const newMin = salesPerWeek * 4.35 * leadMonths;
      const onPo = it.onPo ?? 0;
      const inTransit = it.inTransit ?? 0;
      const netAvail = it.onHand + onPo + inTransit;
      const overUnder = netAvail - newMin;
      const rawNeed = Math.max(0, Math.ceil(newMin - netAvail));
      const moq = it.moq ?? 0;
      const suggestedOrder = moq > 0
        ? (rawNeed > 0 ? Math.ceil(rawNeed / moq) * moq : 0)
        : rawNeed;
      const projectedWeeks = salesPerWeek > 0 ? (netAvail + suggestedOrder) / salesPerWeek : null;
      return {
        ...it, basis, overrideWk, leadMonths,
        wkL12, wkL6, wkL3, salesPerWeek, newMin, onPo, inTransit,
        netAvail, overUnder, suggestedOrder, projectedWeeks,
        cubesPerUnit: it.cubes ?? 0,
      };
    });
  }, [items, overrides]);

  const reorderSuggestions = useMemo(
    () => reorderRows.filter((r) => r.suggestedOrder > 0).sort((a, b) => a.overUnder - b.overUnder),
    [reorderRows]
  );

  const reorderByFactory = useMemo(() => {
    const m = new Map<string, { suggested: number; moq: number; skus: number; totalCubes: number }>();
    for (const it of reorderSuggestions) {
      const f = it.factory ?? it.supplier ?? "—";
      const e = m.get(f) ?? { suggested: 0, moq: 0, skus: 0, totalCubes: 0 };
      e.suggested += it.suggestedOrder;
      e.moq += it.moq ?? 0;
      e.skus += 1;
      e.totalCubes += it.suggestedOrder * (it.cubes ?? 0);
      m.set(f, e);
    }
    return Array.from(m, ([factory, v]) => ({ factory, ...v }));
  }, [reorderSuggestions]);

  // Segregation: On PO (in production / waiting), In Transit, On Hand (NC + VN)
  const segregation = useMemo(() => {
    let onPoUnits = 0, onPoValue = 0;
    let inTransitUnits = 0, inTransitValue = 0;
    let onHandNc = 0, onHandVn = 0, onHandValue = 0;
    for (const it of items) {
      const cost = it.unitCost ?? 0;
      onPoUnits += it.onPo ?? 0;
      onPoValue += (it.onPo ?? 0) * cost;
      inTransitUnits += it.inTransit ?? 0;
      inTransitValue += (it.inTransit ?? 0) * cost;
      onHandNc += it.onHandNc ?? 0;
      onHandVn += it.onHandVn ?? 0;
      onHandValue += it.onHand * cost;
    }
    return { onPoUnits, onPoValue, inTransitUnits, inTransitValue, onHandNc, onHandVn, onHandValue };
  }, [items]);

  // Health snapshot
  const healthSnapshot = useMemo(() => {
    const buckets = { healthy: 0, low: 0, overstock: 0, risk: 0, outOfStock: 0, discontinued: 0, slow: 0 };
    for (const it of items) {
      if (it.isDiscontinued) buckets.discontinued++;
      if (it.status === "out-of-stock") buckets.outOfStock++;
      else if (it.status === "critical" || it.status === "stockout-risk") buckets.risk++;
      else if (it.status === "reorder-soon") buckets.low++;
      else if (it.status === "overstock") buckets.overstock++;
      else if (it.status === "healthy" || it.status === "fast-moving") buckets.healthy++;
      if ((it.monthsSupply ?? 0) >= 6 && it.onHand > 0) buckets.slow++;
    }
    return buckets;
  }, [items]);

  // Product ranking by sales velocity
  const ranking = useMemo(
    () => [...items]
      .map((it) => ({ ...it, salesValue: it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0) }))
      .sort((a, b) => b.salesValue - a.salesValue)
      .slice(0, 25),
    [items],
  );

  // Discontinued
  const discontinuedRows = useMemo(() => items.filter((it) => it.isDiscontinued), [items]);

  // ============ BUY NOW (Command Center action list) ============
  // Uses the same weekly-sales / lead-time logic as Reorder, plus a projected stockout date
  // and an Order Decision verdict.
  const buyNowRows = useMemo(() => {
    const today = Date.now();
    // Map of next ETA per SKU from PO lines
    const nextEtaBySku = new Map<string, string>();
    for (const l of hub.poLines) {
      if (!l.eta) continue;
      const cur = nextEtaBySku.get(l.sku);
      if (!cur || l.eta < cur) nextEtaBySku.set(l.sku, l.eta);
    }

    return reorderRows.map((it) => {
      const dailySales = it.salesPerWeek / 7;
      const netAvail = it.netAvail;
      const daysOfSupply = dailySales > 0 ? netAvail / dailySales : null;
      const stockoutDate =
        dailySales > 0 && netAvail > 0
          ? new Date(today + (netAvail / dailySales) * 86400000)
          : null;
      const leadDays = (it.leadMonths ?? 4.5) * 30;
      const nextEta = nextEtaBySku.get(it.sku) ?? null;
      const daysUntilEta = nextEta
        ? Math.floor((new Date(nextEta).getTime() - today) / 86400000)
        : null;
      const coveredByPo =
        it.onPo > 0 && stockoutDate && daysUntilEta != null && daysUntilEta < (daysOfSupply ?? 0);

      let decision:
        | "Order Now"
        | "Watch"
        | "Covered by PO"
        | "Discontinue Candidate"
        | "Liquidate"
        | "Do Not Order";
      if (it.isDiscontinued) decision = "Liquidate";
      else if (it.isCloseout || it.isClearance) decision = "Do Not Order";
      else if ((it.monthsSupply ?? 0) >= 12 && it.salesPerWeek < 0.25)
        decision = "Discontinue Candidate";
      else if (coveredByPo) decision = "Covered by PO";
      else if (it.suggestedOrder > 0 && (daysOfSupply ?? Infinity) < leadDays)
        decision = "Order Now";
      else if (it.suggestedOrder > 0) decision = "Watch";
      else decision = "Do Not Order";

      return {
        ...it,
        dailySales,
        daysOfSupply,
        stockoutDate,
        leadDays,
        nextEta,
        daysUntilEta,
        decision,
      };
    });
  }, [reorderRows, hub.poLines]);

  const [buyNowFilter, setBuyNowFilter] = useState<"action" | "all">("action");
  const buyNowFiltered = useMemo(() => {
    const sorted = [...buyNowRows].sort((a, b) => {
      const order = { "Order Now": 0, Watch: 1, "Covered by PO": 2, "Liquidate": 3, "Discontinue Candidate": 4, "Do Not Order": 5 } as const;
      return order[a.decision] - order[b.decision];
    });
    if (buyNowFilter === "action")
      return sorted.filter((r) => r.decision === "Order Now" || r.decision === "Watch");
    return sorted;
  }, [buyNowRows, buyNowFilter]);

  const buyNowKpis = useMemo(() => {
    const orderNow = buyNowRows.filter((r) => r.decision === "Order Now");
    const watch = buyNowRows.filter((r) => r.decision === "Watch");
    const covered = buyNowRows.filter((r) => r.decision === "Covered by PO");
    const orderNowValue = orderNow.reduce((s, r) => s + r.suggestedOrder * (r.unitCost ?? 0), 0);
    return { orderNow: orderNow.length, watch: watch.length, covered: covered.length, orderNowValue };
  }, [buyNowRows]);

  // ============ STOCKOUTS / LOST SALES ============
  const stockoutRows = useMemo(() => {
    return items
      .filter((it) => it.onHand <= 0 || it.status === "out-of-stock")
      .map((it) => {
        const dailySales = (it.avgMonthlySales || 0) / 30;
        const monthlyLost = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
        let priority: "Critical" | "High" | "Medium" | "Low";
        if (it.avgMonthlySales >= 4 && (it.onPo ?? 0) === 0) priority = "Critical";
        else if (it.avgMonthlySales >= 4) priority = "High";
        else if (it.avgMonthlySales >= 1) priority = "Medium";
        else priority = "Low";
        return { ...it, dailySales, monthlyLost, priority };
      })
      .sort((a, b) => b.monthlyLost - a.monthlyLost);
  }, [items]);

  const stockoutKpis = useMemo(() => {
    const oosCount = stockoutRows.length;
    const monthlyLost = stockoutRows.reduce((s, r) => s + r.monthlyLost, 0);
    const backorderUnits = hub.openOrders.reduce((s, o) => s + Number(o.qty_open ?? 0), 0);
    const backorderValue = hub.openOrders.reduce((s, o) => s + Number(o.extended_value ?? 0), 0);
    return { oosCount, monthlyLost, backorderUnits, backorderValue };
  }, [stockoutRows, hub.openOrders]);

  // ============ INCOMING / PO COVERAGE ============
  const poLineCoverage = useMemo(() => {
    const itemBySku = new Map(items.map((it) => [it.sku, it]));
    return hub.poLines
      .map((l) => {
        const it = itemBySku.get(l.sku);
        const remaining = Math.max(0, Number(l.qty_ordered ?? 0) - Number(l.qty_received ?? 0));
        const projectedAvail = (it?.onHand ?? 0) + remaining + (it?.inTransit ?? 0);
        const monthlySales = it?.avgMonthlySales ?? 0;
        const monthsAfter = monthlySales > 0 ? projectedAvail / monthlySales : null;
        const stillNeed =
          monthlySales > 0 && monthsAfter != null && monthsAfter < (it?.leadTimeMonths ?? 4.5);
        return { ...l, item: it, remaining, projectedAvail, monthlySales, monthsAfter, stillNeed };
      })
      .filter((r) => r.remaining > 0)
      .sort((a, b) => (a.eta ?? "9999").localeCompare(b.eta ?? "9999"));
  }, [hub.poLines, items]);

  // Forecast vs Reality
  const forecastRows = useMemo(
    () => items
      .filter((it) => it.forecastMonthly != null && it.forecastMonthly > 0)
      .map((it) => {
        const fc = it.forecastMonthly ?? 0;
        const variance = it.avgMonthlySales - fc;
        const pct = fc > 0 ? (variance / fc) * 100 : 0;
        return { ...it, fc, variance, pct };
      })
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 30),
    [items],
  );

  // Performance by Collection
  const collectionPerf = useMemo(() => {
    const m = new Map<string, { sales: number; value: number; skus: number }>();
    for (const it of items) {
      const k = it.collection || "—";
      const e = m.get(k) ?? { sales: 0, value: 0, skus: 0 };
      e.sales += it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
      e.value += (it.unitCost ?? 0) * it.onHand;
      e.skus += 1;
      m.set(k, e);
    }
    const total = Array.from(m.values()).reduce((s, e) => s + e.sales, 0) || 1;
    return Array.from(m, ([name, v]) => ({
      name, ...v,
      pctSales: (v.sales / total) * 100,
      turnover: v.value > 0 ? (v.sales * 12) / v.value : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [items]);

  // Closeout by brand
  const closeoutByCollection = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (!(it.isCloseout || it.isClearance)) continue;
      const k = (it as any).brand || "—";
      m.set(k, (m.get(k) ?? 0) + (it.onHandValue ?? (it.unitCost ?? 0) * it.onHand));
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [items]);

  // SKU detail drawer
  const [drawerSku, setDrawerSku] = useState<string | null>(null);
  const drawerItem = useMemo(() => items.find((it) => it.sku === drawerSku) ?? null, [items, drawerSku]);

  // Analysis sub-tab
  const [analysisTab, setAnalysisTab] = useState<string>("sku");

  const [skuSearch, setSkuSearch] = useState("");
  const matchesSearch = useCallback((it: { sku: string; product: string; collection?: string; brand?: string }) => {
    if (!skuSearch) return true;
    const q = skuSearch.toLowerCase();
    return it.sku.toLowerCase().includes(q)
      || it.product.toLowerCase().includes(q)
      || (it.collection ?? "").toLowerCase().includes(q)
      || (it.brand ?? "").toLowerCase().includes(q);
  }, [skuSearch]);

  type DrilldownKey = "value" | "openpo" | "prepaid" | "backlog" | "closeout" | "ratio" | "turnover" | "lost";
  const [drilldown, setDrilldown] = useState<null | DrilldownKey>(null);
  const toggleDrill = (k: DrilldownKey) => setDrilldown((curr) => (curr === k ? null : k));

  const drillTitles: Record<DrilldownKey, { title: string; desc: string }> = {
    value: { title: "Total Inventory Value — by SKU", desc: "All on-hand inventory valued at unit cost." },
    openpo: { title: "Total Open POs — not yet arrived", desc: "Purchase orders still in production or transit." },
    prepaid: { title: "Prepaid Inventory — POs with deposits", desc: "Cash already paid out to factories." },
    backlog: { title: "Backlog — Open Sales Orders", desc: "Customer orders placed but not yet shipped." },
    closeout: { title: "Closeout Inventory — clearance & closeout", desc: "SKUs flagged closeout or clearance." },
    ratio: { title: "Sales / Inv Ratio — slowest movers first", desc: "Monthly $ sales ÷ on-hand value, lowest carrying first." },
    turnover: { title: "Annual Turnover — by SKU", desc: "Annualized turns based on monthly sales velocity." },
    lost: { title: "Lost Sales — out-of-stock SKUs", desc: "Estimated monthly $ lost from stockouts." },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KPI label="Total Inventory Value" value={fmtMoney(summary.value)} hint={`${fmtNum(summary.units)} units`} icon={DollarSign} onClick={() => toggleDrill("value")} active={drilldown === "value"} />
        <KPI label="Total Open POs" value={fmtMoney(summary.openPoValue)} hint="not yet arrived" icon={Truck} onClick={() => toggleDrill("openpo")} active={drilldown === "openpo"} />
        <KPI label="Prepaid Inventory" value={fmtMoney(summary.prepaidValue)} icon={DollarSign} onClick={() => toggleDrill("prepaid")} active={drilldown === "prepaid"} />
        <KPI label="Backlog (Open Orders)" value={fmtMoney(summary.backlogValue)} hint={`${fmtNum(summary.backlogUnits)} units`} icon={ShoppingCart} onClick={() => toggleDrill("backlog")} active={drilldown === "backlog"} />
        <KPI label="Closeout Inventory" value={fmtMoney(summary.closeoutValue)} hint="clearance + closeout" icon={Tag} onClick={() => toggleDrill("closeout")} active={drilldown === "closeout"} />
        <KPI label="Sales / Inv Ratio" value={summary.salesToInv.toFixed(2)} hint={summary.salesToInv > 0.5 ? "healthy" : summary.salesToInv > 0.2 ? "OK" : "carrying too much"} icon={Activity} accent={summary.salesToInv < 0.2 ? "text-warning-foreground" : undefined} onClick={() => toggleDrill("ratio")} active={drilldown === "ratio"} />
        <KPI label="Annual Turnover" value={`${summary.turnover.toFixed(1)}×`} hint="sales ÷ inventory" icon={Activity} onClick={() => toggleDrill("turnover")} active={drilldown === "turnover"} />
        <KPI label="Out of Stock — Lost Sales" value={fmtMoney(summary.lostSales)} hint="per month" icon={AlertCircle} accent="text-destructive" onClick={() => toggleDrill("lost")} active={drilldown === "lost"} />
      </div>

      {drilldown && (
        <Card className="p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base font-semibold">{drillTitles[drilldown].title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{drillTitles[drilldown].desc}</p>
            </div>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setDrilldown(null)}>Close</Button>
          </div>
          <div className="overflow-auto max-h-[60vh]">
            {drilldown === "value" && <ReportSkuValue items={items} total={summary.value} />}
            {drilldown === "closeout" && <ReportSkuValue items={items.filter((it) => it.isCloseout || it.isClearance)} total={summary.closeoutValue} />}
            {drilldown === "openpo" && <ReportPOs pos={hub.purchaseOrders.filter((p) => p.production_stage !== "closed" && p.production_stage !== "arrived")} />}
            {drilldown === "prepaid" && <ReportPOs pos={hub.purchaseOrders.filter((p) => p.is_prepaid)} prepaidMode />}
            {drilldown === "backlog" && <ReportBacklog rows={hub.openOrders} />}
            {drilldown === "ratio" && <ReportSalesRatio items={items} />}
            {drilldown === "turnover" && <ReportTurnover items={items} />}
            {drilldown === "lost" && <ReportLost items={items.filter((it) => it.status === "out-of-stock" && it.avgMonthlySales > 0)} />}
          </div>
        </Card>
      )}

      <Tabs defaultValue="stockouts" className="w-full">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="stockouts">Stockouts / Lost Sales</TabsTrigger>
        
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="reorder">Reorder</TabsTrigger>
        <TabsTrigger value="closeout">Closeout</TabsTrigger>
      </TabsList>

      {/* ============ STOCKOUTS / LOST SALES ============ */}
      <TabsContent value="stockouts" className="space-y-6 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI label="SKUs Out of Stock" value={stockoutKpis.oosCount} icon={AlertCircle} accent={stockoutKpis.oosCount > 0 ? "text-destructive" : undefined} />
          <KPI label="Estimated Lost Sales / mo" value={fmtMoney(stockoutKpis.monthlyLost)} icon={TrendingDown} accent="text-destructive" />
          <KPI label="Backorder Units" value={fmtNum(stockoutKpis.backorderUnits)} icon={ShoppingCart} />
          <KPI label="Backorder Value" value={fmtMoney(stockoutKpis.backorderValue)} icon={DollarSign} />
        </div>
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Top Lost-Sales SKUs</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockoutRows.slice(0, 10).map((r) => ({ sku: r.sku, lost: r.monthlyLost }))} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="sku" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="lost" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Out-of-Stock Detail</h3>
          {stockoutRows.length === 0 ? <EmptyState message="No SKUs are currently out of stock." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-left px-3 py-2">Collection</th>
                    <th className="text-right px-3 py-2">Mo Sales</th>
                    <th className="text-right px-3 py-2">Lost / mo</th>
                    <th className="text-right px-3 py-2">On PO</th>
                    <th className="text-right px-3 py-2">In Transit</th>
                    <th className="text-left px-3 py-2">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {stockoutRows.slice(0, 100).map((r) => {
                    const tone =
                      r.priority === "Critical" ? "bg-destructive/10 text-destructive border-destructive/20" :
                      r.priority === "High" ? "bg-warning/15 text-warning-foreground border-warning/30" :
                      r.priority === "Medium" ? "bg-accent/15 text-accent-foreground border-accent/30" :
                      "bg-muted text-muted-foreground border-border";
                    return (
                      <tr key={r.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(r.sku)}>
                        <td className="px-3 py-2 font-mono">{r.sku}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate">{r.product}</td>
                        <td className="px-3 py-2">{r.collection}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.avgMonthlySales.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">{fmtMoney(r.monthlyLost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.onPo ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.inTransit ?? 0}</td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border", tone)}>{r.priority}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>


      {/* ============ SECTION 1: SUMMARY ============ */}
      <TabsContent value="summary" className="space-y-6 mt-4">
        {/* Clickable status tiles — filter the SKU table below */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {([
            { key: "all" as StatusFilter, label: "Total SKUs", value: statusCounts.total, icon: Package, accent: undefined as string | undefined, hint: undefined as string | undefined },
            { key: "critical" as StatusFilter, label: "Critical Items", value: statusCounts.critical, icon: AlertTriangle, accent: "text-destructive", hint: "Needs attention" },
            { key: "out-of-stock" as StatusFilter, label: "Out of Stock", value: statusCounts.outOfStock, icon: XCircle, accent: "text-destructive", hint: undefined },
            { key: "reorder-soon" as StatusFilter, label: "Reorder Soon", value: statusCounts.reorder, icon: RefreshCw, accent: "text-warning-foreground", hint: undefined },
            { key: "fast-moving" as StatusFilter, label: "Fast Moving", value: statusCounts.fast, icon: Zap, accent: "text-success", hint: undefined },
          ]).map((t) => {
            const Icon = t.icon;
            const active = statusFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onStatusFilterChange?.(t.key)}
                className={cn(
                  "text-left rounded-lg border bg-card p-5 flex items-start justify-between transition-colors hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring",
                  active ? "border-primary ring-1 ring-primary/40" : "border-border",
                )}
              >
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</div>
                  <div className="text-3xl font-semibold mt-2 tabular-nums">{t.value}</div>
                  {t.hint && <div className={cn("text-xs mt-1", t.accent ?? "text-muted-foreground")}>{t.hint}</div>}
                </div>
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
              </button>
            );
          })}
        </div>



        {/* Inventory value drilldown by collection / brand */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-base font-semibold mb-3">Inventory Value by Collection</h3>
            <div className="overflow-y-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Collection</th>
                    <th className="text-right px-3 py-2">SKUs</th>
                    <th className="text-right px-3 py-2">Units</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-right px-3 py-2">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {valueByCollection.map((c) => (
                    <tr key={c.name} className="border-t border-border">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.skus}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.units)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{((c.value / (summary.value || 1)) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-base font-semibold mb-3">Inventory Value by Brand</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueByBrand} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {newProducts.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">New Products (no sales history yet)</div>
                <div className="text-2xl font-semibold tabular-nums">{newProducts.length}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {newProducts.slice(0, 6).map((it) => it.sku).join(", ")}{newProducts.length > 6 ? "…" : ""}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* PO stage status board */}
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Purchase Order Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stageCounts.map((s) => (
              <div key={s.key} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-2xl font-semibold mt-1 tabular-nums">{s.count}</div>
                <div className="text-xs text-muted-foreground mt-1">{fmtMoney(s.value)}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Arrival calendar (next 30/60/90) */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Arrival Calendar</h3>
          </div>
          {hub.purchaseOrders.length === 0 ? <EmptyState message="No POs synced yet." /> : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {([
                { label: "Late", pos: poBuckets.late, accent: "border-destructive/40" },
                { label: "Next 30 days", pos: poBuckets.d30, accent: "border-warning/40" },
                { label: "Next 60 days", pos: poBuckets.d60, accent: "border-border" },
                { label: "Next 90 days", pos: poBuckets.d90, accent: "border-border" },
              ]).map((b) => (
                <div key={b.label} className={cn("rounded-lg border p-3 space-y-2", b.accent)}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{b.label}</div>
                    <Badge variant="secondary" className="text-xs">{b.pos.length}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtMoney(b.pos.reduce((s, p) => s + Number(p.total_value), 0))}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {b.pos.slice(0, 8).map((po) => (
                      <div key={po.id} className="text-xs flex items-center justify-between gap-2">
                        <span className="font-mono truncate">{po.po_number ?? "—"}</span>
                        <span className="text-muted-foreground whitespace-nowrap">{po.eta}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Backlog detail */}
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Backlog</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Out of Stock value</div>
              <div className="text-lg font-semibold text-destructive tabular-nums">{fmtMoney(summary.outOfStockValue)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Mixed container POs</div>
              <div className="text-lg font-semibold tabular-nums">{hub.purchaseOrders.filter((p) => p.container_type === "mixed").length}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Direct container POs</div>
              <div className="text-lg font-semibold tabular-nums">{hub.purchaseOrders.filter((p) => p.container_type === "direct").length}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">New product (no avail)</div>
              <div className="text-lg font-semibold tabular-nums">{items.filter((it) => it.onHand === 0 && it.avgMonthlySales === 0).length}</div>
            </div>
          </div>
          {hub.openOrders.length === 0 ? <EmptyState message="No open orders synced." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Order #</th>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Dealer</th>
                    <th className="text-right px-3 py-2">Qty Open</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-left px-3 py-2">Promised</th>
                  </tr>
                </thead>
                <tbody>
                  {hub.openOrders.slice(0, 25).map((o) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{o.order_number ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{o.sku}</td>
                      <td className="px-3 py-2">{o.dealer_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.qty_open}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(o.extended_value))}</td>
                      <td className="px-3 py-2">{o.promised_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* ============ SECTION 2: ANALYSIS ============ */}
      <TabsContent value="analysis" className="space-y-4 mt-4">
        <Tabs value={analysisTab} onValueChange={setAnalysisTab}>
          <TabsList className="flex w-full flex-nowrap overflow-x-auto h-auto justify-start">
            <TabsTrigger value="sku" className="whitespace-nowrap px-2.5 text-sm">SKU Table</TabsTrigger>
            <TabsTrigger value="compare" className="whitespace-nowrap px-2.5 text-sm">Compare Periods</TabsTrigger>
            <TabsTrigger value="vendor" className="whitespace-nowrap px-2.5 text-sm">By Vendor</TabsTrigger>
            
            <TabsTrigger value="slow" className="whitespace-nowrap px-2.5 text-sm">Slow Movers</TabsTrigger>
            
            
            <TabsTrigger value="ranking" className="whitespace-nowrap px-2.5 text-sm">Ranking</TabsTrigger>
            
            
            
          </TabsList>

          <TabsContent value="sku" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold">SKU Analysis</h3>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} placeholder="Search SKU, product, brand…" className="pl-8 h-9 text-sm" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">SKU</th>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-left px-3 py-2">Collection</th>
                      <th className="text-left px-3 py-2">Brand</th>
                      <th className="text-left px-3 py-2">Vendor</th>
                      <th className="text-right px-3 py-2">On Hand</th>
                      <th className="text-right px-3 py-2">Value</th>
                      <th className="text-right px-3 py-2">% Inv</th>
                      <th className="text-right px-3 py-2">% Sales</th>
                      <th className="text-right px-3 py-2">Vel/mo</th>
                      <th className="text-right px-3 py-2">Inv/Sales</th>
                      <th className="text-center px-3 py-2">Clr</th>

                    </tr>
                  </thead>
                  <tbody>
                    {analysisRows.filter(matchesSearch).slice(0, 100).map((it) => {
                      const invToSales = it.avgMonthlySales > 0 ? it.onHand / it.avgMonthlySales : null;
                      return (
                        <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                          <td className="px-3 py-2 font-mono">{it.sku}</td>
                          <td className="px-3 py-2 max-w-[220px] truncate" title={it.product}>{it.product}</td>
                          <td className="px-3 py-2">{it.collection}</td>
                          <td className="px-3 py-2">{it.brand ?? "—"}</td>
                          <td className="px-3 py-2 max-w-[140px] truncate">{it.supplier}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.value)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.pctTotalInv.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.pctTotalSales.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{invToSales == null ? "—" : invToSales.toFixed(1)}</td>
                          <td className="px-3 py-2 text-center">{it.isClearance ? <Badge variant="secondary" className="text-[10px]">Yes</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="mt-4">
            <ComparePeriodsReport items={items} salesHistory={hub.salesHistory} />
          </TabsContent>

          <TabsContent value="vendor" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold">Performance by Vendor / Factory</h3>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vendorPerf} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis type="category" dataKey="vendor" width={140} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" name="Monthly Sales" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full text-sm mt-4">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Vendor</th>
                    <th className="text-right px-3 py-2">Monthly Sales</th>
                    <th className="text-right px-3 py-2">% of Total</th>
                    <th className="text-right px-3 py-2">Inv Value</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorPerf.slice(0, 20).map((v) => (
                    <tr key={v.vendor} className="border-t border-border">
                      <td className="px-3 py-2">{v.vendor}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(v.sales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{v.pctSales.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(v.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="slow" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-warning-foreground" />
                <h3 className="text-base font-semibold">Slow Movers (≥6 months supply)</h3>
              </div>
              {slowMovers.length === 0 ? <EmptyState message="No slow movers." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">SKU</th>
                        <th className="text-left px-3 py-2">Product</th>
                        <th className="text-left px-3 py-2">Collection</th>
                        <th className="text-right px-3 py-2">On Hand</th>
                        <th className="text-right px-3 py-2" title={`Lead time ≈ ${LEAD_TIME_WEEKS} weeks`}>Weeks Supply</th>
                        <th className="text-right px-3 py-2">Tied-up Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slowMovers.map((it) => (
                        <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                          <td className="px-3 py-2 font-mono">{it.sku}</td>
                          <td className="px-3 py-2">{it.product}</td>
                          <td className="px-3 py-2">{it.collection}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{(() => { const w = weeksOfSupply(it); return w == null ? "—" : `${w.toFixed(1)} wk`; })()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney((it.unitCost ?? 0) * it.onHand)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="ranking" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-accent-foreground" />
                <h3 className="text-base font-semibold">Top SKUs by Sales Velocity</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-3 py-2">SKU</th>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-left px-3 py-2">Collection</th>
                      <th className="text-right px-3 py-2">Vel/mo</th>
                      <th className="text-right px-3 py-2">Monthly $</th>
                      <th className="text-right px-3 py-2">On Hand</th>
                      <th className="text-center px-3 py-2">Buy Now?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((it, i) => (
                      <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-mono">{it.sku}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate" title={it.product}>{it.product}</td>
                        <td className="px-3 py-2">{it.collection}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.salesValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                        <td className="px-3 py-2 text-center">
                          {(it.monthsSupply ?? 99) < 2 ? <Badge className="text-[10px]">Buy</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

        </Tabs>
      </TabsContent>

      {/* ============ SECTION 3: REORDER ============ */}
      <TabsContent value="reorder" className="space-y-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Factory className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Reorder by Factory — Suggested vs MOQ</h3>
          </div>
          {reorderByFactory.length === 0 ? <EmptyState message="Nothing to reorder right now." /> : (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Factory</th>
                    <th className="text-right px-3 py-2">SKUs</th>
                    <th className="text-right px-3 py-2">Total MOQ</th>
                    <th className="text-right px-3 py-2">Suggested</th>
                    <th className="text-right px-3 py-2">vs MOQ</th>
                    <th className="text-right px-3 py-2">Total Cubes</th>
                    <th className="text-right px-3 py-2">~Containers</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderByFactory.map((f) => {
                    // 40' HC ≈ 2,350 cu ft usable
                    const containers = f.totalCubes > 0 ? f.totalCubes / 2350 : 0;
                    return (
                      <tr key={f.factory} className="border-t border-border">
                        <td className="px-3 py-2">{f.factory}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.skus}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.moq || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(f.suggested)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", f.moq > 0 && f.suggested >= f.moq ? "text-success" : "text-warning-foreground")}>
                          {f.moq > 0 ? `${Math.round((f.suggested / f.moq) * 100)}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.totalCubes ? f.totalCubes.toFixed(1) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{containers ? containers.toFixed(2) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Inventory segregation: On PO / In Transit / On Hand (NC + VN) */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Inventory Segregation</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">On PO (in production / waiting)</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtNum(segregation.onPoUnits)}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtMoney(segregation.onPoValue)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">In Transit</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtNum(segregation.inTransitUnits)}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtMoney(segregation.inTransitValue)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">On Hand</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtNum(segregation.onHandNc + segregation.onHandVn)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                NC {fmtNum(segregation.onHandNc)} · VN {fmtNum(segregation.onHandVn)} · {fmtMoney(segregation.onHandValue)}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-base font-semibold">InvCut — Reorder Worksheet</h3>
          </div>
          {reorderRows.length === 0 ? <EmptyState message="No items." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-2 border border-border">SKU</th>
                    <th className="text-left px-2 py-2 border border-border">Item Description</th>
                    <th className="text-right px-2 py-2 border border-border">Reorder Pt (Min)</th>
                    <th className="text-right px-2 py-2 border border-border">Max</th>
                    <th className="text-right px-2 py-2 border border-border">On Hand</th>
                    <th className="text-right px-2 py-2 border border-border">On Sales Order</th>
                    <th className="text-right px-2 py-2 border border-border">Available</th>
                    <th className="text-right px-2 py-2 border border-border">On PO</th>
                    <th className="text-right px-2 py-2 border border-border">Sales/Week</th>
                    <th className="text-right px-2 py-2 border border-border">New Min</th>
                    <th className="text-right px-2 py-2 border border-border">Net Avail</th>
                    <th className="text-right px-2 py-2 border border-border">Over/Under</th>
                    <th className="text-right px-2 py-2 border border-border">Weeks</th>
                    <th className="text-right px-2 py-2 border border-border bg-accent/20">Order</th>
                    <th className="text-right px-2 py-2 border border-border">Cubes</th>
                    <th className="text-right px-2 py-2 border border-border">Total Cubes</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group by vendor/factory like the Excel sheet (vendor header + line rows + subtotal)
                    const groups = new Map<string, typeof reorderRows>();
                    for (const it of reorderRows.slice(0, 400)) {
                      const v = (it.factory || it.supplier || "—").toUpperCase();
                      if (!groups.has(v)) groups.set(v, [] as any);
                      (groups.get(v) as any).push(it);
                    }
                    const out: JSX.Element[] = [];
                    for (const [vendor, rows] of groups) {
                      // Vendor header (mirrors Col A in InvCut)
                      out.push(
                        <tr key={`hdr-${vendor}`} className="bg-muted/40">
                          <td colSpan={16} className="px-2 py-1.5 font-semibold border border-border">{vendor}</td>
                        </tr>
                      );
                      let groupCubes = 0;
                      for (const it of rows) {
                        const order = orderQty[it.sku] ?? 0;
                        const reorderMin = Math.round(it.salesPerWeek * 20.25); // =L*4.5*4.5
                        const maxQty = it.reorderMax ?? Math.round(reorderMin * 1.5);
                        const onSalesOrder = it.onSalesOrder ?? 0;
                        const available = it.available ?? Math.max(0, it.onHand - onSalesOrder);
                        const netAvail = available + (it.onPo ?? 0); // =SUM(H,I)
                        const overUnder = netAvail - reorderMin;     // =N-M
                        const weeks = it.salesPerWeek > 0
                          ? (netAvail + order) / it.salesPerWeek     // =(N+R)/L
                          : null;
                        const cubesPer = it.cubes ?? 0;
                        const totalCubes = order * cubesPer;          // =R*S
                        groupCubes += totalCubes;
                        const weeksBelowLead = weeks != null && weeks < 32;
                        out.push(
                          <tr key={it.sku} className="hover:bg-muted/30">
                            <td className="px-2 py-1 font-mono border border-border cursor-pointer" onClick={() => setDrawerSku(it.sku)}>{it.sku}</td>
                            <td className="px-2 py-1 max-w-[260px] truncate border border-border" title={it.product}>{it.product}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{reorderMin}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{maxQty}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{it.onHand}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{onSalesOrder}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{available}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{it.onPo ?? 0}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{it.salesPerWeek.toFixed(1)}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{reorderMin}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{netAvail}</td>
                            <td className={cn("px-2 py-1 text-right tabular-nums border border-border", overUnder < 0 ? "text-destructive" : "")}>
                              {overUnder < 0 ? `(${Math.abs(Math.round(overUnder))})` : Math.round(overUnder)}
                            </td>
                            <td className={cn("px-2 py-1 text-right tabular-nums border border-border", weeksBelowLead && "bg-destructive/10 text-destructive font-semibold")}>
                              {weeks == null ? "—" : weeks.toFixed(1)}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border bg-accent/10">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="h-6 w-20 rounded-sm border border-input bg-background px-1 text-right tabular-nums"
                                value={order || ""}
                                placeholder="0"
                                onChange={(e) => setOrder(it.sku, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                              />
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{cubesPer ? cubesPer.toFixed(2) : "—"}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{totalCubes ? totalCubes.toFixed(2) : "—"}</td>
                          </tr>
                        );
                      }
                      // Subtotal row: =SUM(T:T) and =U/2350 (40' HC container)
                      const containers = groupCubes / 2350;
                      out.push(
                        <tr key={`sub-${vendor}`} className="bg-muted/30 font-semibold">
                          <td colSpan={14} className="px-2 py-1.5 text-right border border-border">
                            {vendor} — Total Cubes / Containers (40&apos; HC = 2,350 cu ft):
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums border border-border" colSpan={2}>
                            {groupCubes.toFixed(2)} cu ft · {containers.toFixed(2)} cont.
                          </td>
                        </tr>
                      );
                    }
                    return out;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Open POs detail with stage */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <PackageOpen className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Open Purchase Orders</h3>
          </div>
          {hub.purchaseOrders.length === 0 ? <EmptyState message="No POs synced yet." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">PO #</th>
                    <th className="text-left px-3 py-2">Factory</th>
                    <th className="text-left px-3 py-2">Stage</th>
                    <th className="text-left px-3 py-2">ETA</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-right px-3 py-2">Prepaid</th>
                  </tr>
                </thead>
                <tbody>
                  {hub.purchaseOrders.map((po) => (
                    <tr key={po.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{po.po_number ?? "—"}</td>
                      <td className="px-3 py-2">{po.factory ?? "—"}</td>
                      <td className="px-3 py-2"><StagePill stage={po.production_stage} /></td>
                      <td className="px-3 py-2">{po.eta ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(po.total_value))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{po.is_prepaid ? fmtMoney(Number(po.prepaid_amount)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* ============ SECTION 4: CLOSEOUT ============ */}
      <TabsContent value="closeout" className="space-y-6 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPI label="Closeout SKUs" value={closeoutRows.length} icon={Tag} />
          <KPI label="Total Closeout Value" value={fmtMoney(closeoutTotal)} icon={DollarSign} />
          <KPI
            label="Avg Burn-Down"
            value={`${(closeoutRows.reduce((s, r) => s + (r.burnDownMonths ?? 0), 0) / Math.max(1, closeoutRows.filter(r => r.burnDownMonths != null).length) || 0).toFixed(1)} mo`}
            icon={TrendingDown}
          />
        </div>
        {closeoutByCollection.length > 0 && (
          <Card className="p-5">
            <h3 className="text-base font-semibold mb-3">Closeout Value by Brand</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={closeoutByCollection} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(var(--accent))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Closeout Inventory</h3>
          {closeoutRows.length === 0 ? <EmptyState message="No closeout SKUs flagged. Set is_closeout = true on inventory rows." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-left px-3 py-2">Collection</th>
                    <th className="text-right px-3 py-2">Units</th>
                    <th className="text-right px-3 py-2">% Sold</th>
                    <th className="text-right px-3 py-2">Burn-Down (mo)</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-center px-3 py-2">Clr</th>
                  </tr>
                </thead>
                <tbody>
                  {closeoutRows.map((it) => (
                    <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                      <td className="px-3 py-2 font-mono">{it.sku}</td>
                      <td className="px-3 py-2">{it.product}</td>
                      <td className="px-3 py-2">{it.collection}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.pctSold == null ? "—" : `${it.pctSold.toFixed(0)}%`}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.burnDownMonths == null ? "—" : it.burnDownMonths.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.onHandValue ?? (it.unitCost ?? 0) * it.onHand)}</td>
                      <td className="px-3 py-2 text-center">{it.isClearance ? <Badge variant="secondary" className="text-[10px]">Yes</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* SKU detail drawer */}
      <Sheet open={drawerSku !== null} onOpenChange={(o) => !o && setDrawerSku(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {drawerItem && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{drawerItem.sku}</SheetTitle>
                <SheetDescription>{drawerItem.product}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-foreground">Collection</div><div>{drawerItem.collection}</div></div>
                  <div><div className="text-xs text-muted-foreground">Brand</div><div>{drawerItem.brand ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Vendor / Factory</div><div>{drawerItem.factory ?? drawerItem.supplier}</div></div>
                  <div><div className="text-xs text-muted-foreground">Status</div><div>{drawerItem.status}</div></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">On Hand</div><div className="text-lg font-semibold tabular-nums">{drawerItem.onHand}</div><div className="text-[10px] text-muted-foreground">NC {drawerItem.onHandNc ?? 0} · VN {drawerItem.onHandVn ?? 0}</div></div>
                  <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">On PO</div><div className="text-lg font-semibold tabular-nums">{drawerItem.onPo ?? 0}</div></div>
                  <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">In Transit</div><div className="text-lg font-semibold tabular-nums">{drawerItem.inTransit ?? 0}</div></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="text-xs text-muted-foreground">L12M /wk</div><div className="tabular-nums">{drawerItem.unitsL12m != null ? (drawerItem.unitsL12m / 52).toFixed(1) : "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">L6M /wk</div><div className="tabular-nums">{drawerItem.unitsL6m != null ? (drawerItem.unitsL6m / 26).toFixed(1) : "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">L3M /wk</div><div className="tabular-nums">{drawerItem.unitsL3m != null ? (drawerItem.unitsL3m / 13).toFixed(1) : "—"}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-foreground">Active basis</div><div>{drawerItem.reorderBasis ?? "L12M"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Override /wk</div><div className="tabular-nums">{drawerItem.reorderOverridePerWeek ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Lead time (mo)</div><div className="tabular-nums">{drawerItem.leadTimeMonths ?? 4.5}</div></div>
                  <div><div className="text-xs text-muted-foreground">MOQ</div><div className="tabular-nums">{drawerItem.moq ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Weeks supply</div><div className={cn("tabular-nums", weeksTone(weeksOfSupply(drawerItem)))}>{(() => { const w = weeksOfSupply(drawerItem); return w == null ? "—" : `${w.toFixed(1)} wk`; })()}</div></div>
                  <div><div className="text-xs text-muted-foreground">Forecast/mo</div><div className="tabular-nums">{drawerItem.forecastMonthly ?? "—"}</div></div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {drawerItem.isClearance && <Badge variant="secondary">Clearance</Badge>}
                  {drawerItem.isCloseout && <Badge variant="secondary">Closeout</Badge>}
                  {drawerItem.isDiscontinued && <Badge variant="secondary">Discontinued</Badge>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Tabs>
    </div>
  );
}
