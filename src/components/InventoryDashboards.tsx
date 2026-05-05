import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, PackageOpen, TrendingUp, TrendingDown, Tag, Activity,
  Truck, Factory, AlertCircle, ShoppingCart, CalendarClock, Layers,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import type { InventoryItem } from "@/data/inventoryMock";
import { useInventoryHub, type PurchaseOrder } from "@/hooks/useInventoryHub";
import { cn } from "@/lib/utils";

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

function KPI({ label, value, hint, icon: Icon, accent }: {
  label: string; value: string | number; hint?: string;
  icon: React.ComponentType<{ className?: string }>; accent?: string;
}) {
  return (
    <Card className="p-5 flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
        {hint && <div className={cn("text-xs mt-1", accent ?? "text-muted-foreground")}>{hint}</div>}
      </div>
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
      {message}
    </div>
  );
}

function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = STAGE_COLOR[stage] ?? "bg-muted text-muted-foreground border-border";
  const label = STAGES.find((s) => s.key === stage)?.label ?? stage;
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs border", cls)}>{label}</span>;
}

interface Props { items: InventoryItem[] }

export default function InventoryDashboards({ items }: Props) {
  const hub = useInventoryHub();

  // ============ SECTION 1: HIGH LEVEL SUMMARY ============
  const summary = useMemo(() => {
    let value = 0, units = 0, monthlySales = 0, lostSales = 0;
    let outOfStockValue = 0;
    for (const it of items) {
      const cost = it.unitCost ?? 0;
      value += cost * it.onHand;
      units += it.onHand;
      monthlySales += it.avgMonthlySales * (it.listPrice ?? cost);
      if (it.status === "out-of-stock") {
        lostSales += it.avgMonthlySales * (it.listPrice ?? cost);
        outOfStockValue += it.avgMonthlySales * (it.listPrice ?? cost);
      }
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
    return { value, units, monthlySales, backlogValue, backlogUnits, openPoValue, prepaidValue, salesToInv, lostSales, outOfStockValue };
  }, [items, hub.openOrders, hub.purchaseOrders]);

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
      const value = (it.unitCost ?? 0) * it.onHand;
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

  const closeoutTotal = closeoutRows.reduce((s, it) => s + (it.unitCost ?? 0) * it.onHand, 0);

  // ============ SECTION 3: REORDER (Justin's InvCut model) ============
  // Sales/Week = LTM/52 ; New Min = Sales/Week*4.5*4.5 ; Net Avail = OnHand+OnPO
  // Over/Under = Net Avail - New Min ; Weeks = (NetAvail+Order)/SalesPerWeek
  // Total Cubes = Order * Cubes
  const reorderRows = useMemo(() => {
    return items.map((it) => {
      const salesPerWeek = it.ltmUnits != null
        ? it.ltmUnits / 52
        : (it.avgMonthlySales || 0) * 12 / 52;
      const newMin = salesPerWeek * 4.5 * 4.5;
      const onPo = it.onPo ?? 0;
      const netAvail = it.onHand + onPo;
      const overUnder = netAvail - newMin;
      const rawNeed = Math.max(0, Math.ceil(newMin - netAvail));
      const moq = it.moq ?? 0;
      const suggestedOrder = moq > 0
        ? (rawNeed > 0 ? Math.ceil(rawNeed / moq) * moq : 0)
        : rawNeed;
      const projectedWeeks = salesPerWeek > 0 ? (netAvail + suggestedOrder) / salesPerWeek : null;
      return { ...it, salesPerWeek, newMin, netAvail, overUnder, suggestedOrder, onPo, projectedWeeks, cubesPerUnit: it.cubes ?? 0 };
    });
  }, [items]);

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

  return (
    <Tabs defaultValue="summary" className="w-full">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="summary">1. Summary</TabsTrigger>
        <TabsTrigger value="analysis">2. Analysis</TabsTrigger>
        <TabsTrigger value="reorder">3. Reorder</TabsTrigger>
        <TabsTrigger value="closeout">4. Closeout</TabsTrigger>
      </TabsList>

      {/* ============ SECTION 1: SUMMARY ============ */}
      <TabsContent value="summary" className="space-y-6 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <KPI label="Total Inventory Value" value={fmtMoney(summary.value)} hint={`${fmtNum(summary.units)} units`} icon={DollarSign} />
          <KPI label="Total Open POs" value={fmtMoney(summary.openPoValue)} hint="not yet arrived" icon={Truck} />
          <KPI label="Prepaid Inventory" value={fmtMoney(summary.prepaidValue)} icon={DollarSign} />
          <KPI label="Backlog (Open Orders)" value={fmtMoney(summary.backlogValue)} hint={`${fmtNum(summary.backlogUnits)} units`} icon={ShoppingCart} />
          <KPI label="Sales / Inv Ratio" value={summary.salesToInv.toFixed(2)} hint={summary.salesToInv > 0.5 ? "healthy" : summary.salesToInv > 0.2 ? "OK" : "carrying too much"} icon={Activity} accent={summary.salesToInv < 0.2 ? "text-warning-foreground" : undefined} />
          <KPI label="Out of Stock — Lost Sales" value={fmtMoney(summary.lostSales)} hint="per month" icon={AlertCircle} accent="text-destructive" />
          <KPI label="Late POs" value={poBuckets.late.length} hint={fmtMoney(poBuckets.late.reduce((s, p) => s + Number(p.total_value), 0))} icon={AlertCircle} accent={poBuckets.late.length > 0 ? "text-destructive" : undefined} />
          <KPI label="Arriving ≤30 days" value={poBuckets.d30.length} hint={fmtMoney(poBuckets.d30.reduce((s, p) => s + Number(p.total_value), 0))} icon={CalendarClock} />
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
      <TabsContent value="analysis" className="space-y-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">SKU Analysis</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Product</th>
                  <th className="text-right px-3 py-2">On Hand</th>
                  <th className="text-right px-3 py-2">Value</th>
                  <th className="text-right px-3 py-2">% Total Inv</th>
                  <th className="text-right px-3 py-2">% Total Sales</th>
                  <th className="text-right px-3 py-2">Velocity / mo</th>
                </tr>
              </thead>
              <tbody>
                {analysisRows.slice(0, 30).map((it) => (
                  <tr key={it.sku} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{it.sku}</td>
                    <td className="px-3 py-2">{it.product}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.pctTotalInv.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.pctTotalSales.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Comparative sales by SKU */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-base font-semibold">Comparative Sales — Pick 2 Periods</h3>
            <div className="flex gap-2">
              <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={periodA} onChange={(e) => setPeriodA(e.target.value)}>
                <option value="">Period A</option>
                {periods.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={periodB} onChange={(e) => setPeriodB(e.target.value)}>
                <option value="">Period B</option>
                {periods.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {compareRows.length === 0 ? <EmptyState message={periods.length === 0 ? "No sales history synced yet." : "Pick two periods to compare."} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-right px-3 py-2">{periodA}</th>
                    <th className="text-right px-3 py-2">{periodB}</th>
                    <th className="text-right px-3 py-2">Δ</th>
                    <th className="text-right px-3 py-2">% change</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((r) => (
                    <tr key={r.sku} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{r.sku}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.periodA}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.periodB}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", r.diff > 0 ? "text-success" : r.diff < 0 ? "text-destructive" : "")}>{r.diff > 0 ? "+" : ""}{r.diff}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pct == null ? "—" : `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(0)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Performance by vendor */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Performance by Vendor</h3>
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
        </Card>

        {/* Slow movers */}
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
                    <th className="text-right px-3 py-2">On Hand</th>
                    <th className="text-right px-3 py-2">Mo. Supply</th>
                    <th className="text-right px-3 py-2">Tied-up Value</th>
                  </tr>
                </thead>
                <tbody>
                  {slowMovers.map((it) => (
                    <tr key={it.sku} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{it.sku}</td>
                      <td className="px-3 py-2">{it.product}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{(it.monthsSupply ?? 0).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney((it.unitCost ?? 0) * it.onHand)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Aging */}
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Inventory Aging</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </TabsContent>

      {/* ============ SECTION 3: REORDER ============ */}
      <TabsContent value="reorder" className="space-y-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Factory className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Reorder by Factory — Suggested vs MOQ</h3>
            <Badge variant="secondary" className="ml-auto">Justin's InvCut model</Badge>
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

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Suggested Order Lines</h3>
            <span className="text-xs text-muted-foreground">
              New Min = Sales/Wk × 4.5 × 4.5 (~20 wks cover) · Net Avail = On Hand + On PO
            </span>
          </div>
          {reorderSuggestions.length === 0 ? <EmptyState message="No items need reorder." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Item Description</th>
                    <th className="text-right px-3 py-2">Min</th>
                    <th className="text-right px-3 py-2">Max</th>
                    <th className="text-right px-3 py-2">On Hand</th>
                    <th className="text-right px-3 py-2">On SO</th>
                    <th className="text-right px-3 py-2">Avail</th>
                    <th className="text-right px-3 py-2">On PO</th>
                    <th className="text-right px-3 py-2">Sales/Wk</th>
                    <th className="text-right px-3 py-2">New Min</th>
                    <th className="text-right px-3 py-2">Net Avail</th>
                    <th className="text-right px-3 py-2">Over/Under</th>
                    <th className="text-right px-3 py-2">MOQ</th>
                    <th className="text-right px-3 py-2">Order</th>
                    <th className="text-right px-3 py-2">Wks</th>
                    <th className="text-right px-3 py-2">Cubes</th>
                    <th className="text-right px-3 py-2">Total Cubes</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderSuggestions.map((it) => (
                    <tr key={it.sku} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{it.sku}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate" title={it.product}>{it.product}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.reorderMin ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.reorderMax ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.onSalesOrder ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.available}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.onPo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.salesPerWeek.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Math.round(it.newMin)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.netAvail}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", it.overUnder < 0 ? "text-destructive" : "text-success")}>
                        {Math.round(it.overUnder)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.moq ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(it.suggestedOrder)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.projectedWeeks != null ? it.projectedWeeks.toFixed(1) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.cubesPerUnit ? it.cubesPerUnit.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{(it.suggestedOrder * it.cubesPerUnit).toFixed(1)}</td>
                    </tr>
                  ))}
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
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Closeout Inventory</h3>
          {closeoutRows.length === 0 ? <EmptyState message="No closeout SKUs flagged. Set is_closeout = true on inventory rows." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-right px-3 py-2">Units Remaining</th>
                    <th className="text-right px-3 py-2">% Sold</th>
                    <th className="text-right px-3 py-2">Burn-Down (mo)</th>
                    <th className="text-right px-3 py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {closeoutRows.map((it) => (
                    <tr key={it.sku} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{it.sku}</td>
                      <td className="px-3 py-2">{it.product}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.pctSold == null ? "—" : `${it.pctSold.toFixed(0)}%`}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.burnDownMonths == null ? "—" : it.burnDownMonths.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney((it.unitCost ?? 0) * it.onHand)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>
    </Tabs>
  );
}
