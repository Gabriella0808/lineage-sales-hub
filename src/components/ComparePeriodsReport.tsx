import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ArrowUpRight, ArrowDownRight, Minus, Search, Download, ChevronRight, ChevronDown,
  TrendingUp, TrendingDown, Sparkles, Package, AlertTriangle, Filter, RotateCcw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts";
import type { InventoryItem } from "@/data/inventoryMock";
import type { SkuSalesHistory } from "@/hooks/useInventoryHub";
import { cn } from "@/lib/utils";

const fmtMoney = (n: number) => {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}K`;
  return `${sign}$${v.toFixed(0)}`;
};
const fmtPct = (n: number | null) => {
  if (n === null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
};

// ---------------- Types ----------------
type MonthKey = string; // "YYYY-MM"
interface SkuMonthRow {
  sku: string;
  warehouse: string;
  brand: string;
  collection: string;
  product: string;
  category?: string;
  month: MonthKey;
  revenue: number;
  units: number;
  outOfStock?: boolean;
  isNew?: boolean;
  commentary?: string;
}

interface AggRow {
  key: string;
  warehouse: string;
  brand: string;
  collection: string;
  sku?: string;
  product?: string;
  p1: number;
  p2: number;
  diff: number;
  pct: number | null;
  flag: string;
  commentary?: string;
  outOfStock: boolean;
  isNew: boolean;
}

// ---------------- Helpers ----------------
function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}
function monthLabel(k: MonthKey): string {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
}
function addMonths(k: MonthKey, delta: number): MonthKey {
  const [y, m] = k.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}
function rangeBetween(start: MonthKey, end: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

// Warehouse heuristic from item
function warehouseFor(it: InventoryItem): string {
  const vn = (it as any).onHandVn ?? 0;
  const nc = (it as any).onHandNc ?? 0;
  if (vn > nc) return "Vietnam DC";
  if (nc > 0) return "NC Warehouse";
  if (it.supplier?.toLowerCase().includes("vietnam")) return "Vietnam DC";
  return "NC Warehouse";
}
function brandFor(it: InventoryItem): string {
  if (it.brand) return it.brand;
  const c = (it.collection || "").toLowerCase();
  if (c.startsWith("sw")) return "Sea Winds";
  if (c.startsWith("fl")) return "Finn & Louise";
  if (c.startsWith("lux")) return "Lux Lighting";
  return "Lineage";
}

// Build a unified row dataset. If salesHistory is empty, synthesize 12 months
// of seed data driven by each SKU's avgMonthlySales with realistic noise.
function buildRows(items: InventoryItem[], history: SkuSalesHistory[]): SkuMonthRow[] {
  const itemBySku = new Map(items.map((it) => [it.sku, it]));
  const out: SkuMonthRow[] = [];

  if (history && history.length > 0) {
    for (const h of history) {
      const it = itemBySku.get(h.sku);
      if (!it) continue;
      out.push({
        sku: h.sku,
        warehouse: warehouseFor(it),
        brand: brandFor(it),
        collection: it.collection,
        product: it.product,
        month: monthKey(h.year, h.month),
        revenue: Number(h.revenue ?? 0),
        units: Number(h.units_sold ?? 0),
        outOfStock: it.status === "out-of-stock",
      });
    }
    return out;
  }

  // ---- Seed synthetic 12 months of data ----
  const now = new Date();
  const months: MonthKey[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d.getFullYear(), d.getMonth() + 1));
  }
  // Deterministic pseudo-random based on sku
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };
  for (const it of items) {
    const trendBias = ((hash(it.sku) % 100) - 50) / 1000; // -5%..+5% per month
    const seasonal = (m: number) => 1 + 0.18 * Math.sin((m / 12) * Math.PI * 2 + (hash(it.sku) % 7));
    const price = it.listPrice ?? it.unitCost ?? 250;
    months.forEach((mk, idx) => {
      const [, mm] = mk.split("-").map(Number);
      const base = Math.max(0, it.avgMonthlySales || 0);
      const growth = 1 + trendBias * (idx - 6);
      const noise = 0.85 + ((hash(it.sku + mk) % 30) / 100); // 0.85..1.15
      const units = Math.max(0, Math.round(base * growth * seasonal(mm) * noise));
      // Some SKUs have zero sales in recent months
      const oos = it.status === "out-of-stock" && idx >= 9;
      const finalUnits = oos ? 0 : units;
      out.push({
        sku: it.sku,
        warehouse: warehouseFor(it),
        brand: brandFor(it),
        collection: it.collection,
        product: it.product,
        month: mk,
        revenue: finalUnits * price,
        units: finalUnits,
        outOfStock: oos,
        isNew: idx >= 8 && (hash(it.sku) % 11 === 0),
      });
    });
  }
  return out;
}

// Period preset → [p1Start, p1End, p2Start, p2End]
type Preset = "L3M_VS_PRIOR" | "LM_VS_PRIOR" | "YTD_VS_PRIOR_YTD" | "CUSTOM";
function computePresetRanges(preset: Preset, allMonths: MonthKey[]): {
  p1Start: MonthKey; p1End: MonthKey; p2Start: MonthKey; p2End: MonthKey;
} | null {
  if (allMonths.length === 0) return null;
  const last = allMonths[allMonths.length - 1];
  if (preset === "L3M_VS_PRIOR") {
    const p2End = last;
    const p2Start = addMonths(last, -2);
    const p1End = addMonths(p2Start, -1);
    const p1Start = addMonths(p1End, -2);
    return { p1Start, p1End, p2Start, p2End };
  }
  if (preset === "LM_VS_PRIOR") {
    const p2Start = last, p2End = last;
    const p1Start = addMonths(last, -1), p1End = p1Start;
    return { p1Start, p1End, p2Start, p2End };
  }
  if (preset === "YTD_VS_PRIOR_YTD") {
    const [y, m] = last.split("-").map(Number);
    const p2Start = monthKey(y, 1), p2End = last;
    const p1Start = monthKey(y - 1, 1), p1End = monthKey(y - 1, m);
    return { p1Start, p1End, p2Start, p2End };
  }
  return null;
}

// ---------------- Component ----------------
interface Props {
  items: InventoryItem[];
  salesHistory: SkuSalesHistory[];
}

export default function ComparePeriodsReport({ items, salesHistory }: Props) {
  const rows = useMemo(() => buildRows(items, salesHistory), [items, salesHistory]);

  const allMonths = useMemo(() => {
    const set = new Set<MonthKey>();
    for (const r of rows) set.add(r.month);
    return Array.from(set).sort();
  }, [rows]);

  // Filter state
  const [preset, setPreset] = useState<Preset>("L3M_VS_PRIOR");
  const [p1Start, setP1Start] = useState<MonthKey>("");
  const [p1End, setP1End] = useState<MonthKey>("");
  const [p2Start, setP2Start] = useState<MonthKey>("");
  const [p2End, setP2End] = useState<MonthKey>("");
  const [warehouse, setWarehouse] = useState<string>("all");
  const [brand, setBrand] = useState<string>("all");
  const [collection, setCollection] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [perfFilter, setPerfFilter] = useState<"all" | "up" | "down" | "zero" | "new" | "oos">("all");
  const [includeNonStock, setIncludeNonStock] = useState(true);
  const [groupBy, setGroupBy] = useState<"collection" | "brand" | "warehouse">("collection");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drawerSku, setDrawerSku] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"diff" | "pct" | "p2" | "p1">("diff");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // Initialize preset ranges
  useEffect(() => {
    if (allMonths.length === 0 || preset === "CUSTOM") return;
    const r = computePresetRanges(preset, allMonths);
    if (r) {
      setP1Start(r.p1Start); setP1End(r.p1End);
      setP2Start(r.p2Start); setP2End(r.p2End);
    }
  }, [preset, allMonths]);

  // Filter rows by warehouse/brand/collection/search/include flags
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (warehouse !== "all" && r.warehouse !== warehouse) return false;
      if (brand !== "all" && r.brand !== brand) return false;
      if (collection !== "all" && r.collection !== collection) return false;
      if (!includeNonStock && r.collection?.toLowerCase().includes("discontinued")) return false;
      if (q) {
        const hay = `${r.sku} ${r.product} ${r.collection} ${r.brand}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, warehouse, brand, collection, search, includeNonStock]);

  const p1Months = useMemo(() => p1Start && p1End ? rangeBetween(p1Start, p1End) : [], [p1Start, p1End]);
  const p2Months = useMemo(() => p2Start && p2End ? rangeBetween(p2Start, p2End) : [], [p2Start, p2End]);
  const p1Set = useMemo(() => new Set(p1Months), [p1Months]);
  const p2Set = useMemo(() => new Set(p2Months), [p2Months]);

  // SKU-level aggregates for the comparison
  const skuAgg = useMemo(() => {
    const map = new Map<string, AggRow>();
    for (const r of filteredRows) {
      const inP1 = p1Set.has(r.month);
      const inP2 = p2Set.has(r.month);
      if (!inP1 && !inP2) continue;
      let entry = map.get(r.sku);
      if (!entry) {
        entry = {
          key: r.sku, warehouse: r.warehouse, brand: r.brand, collection: r.collection,
          sku: r.sku, product: r.product, p1: 0, p2: 0, diff: 0, pct: null, flag: "stable",
          outOfStock: false, isNew: false,
        };
        map.set(r.sku, entry);
      }
      if (inP1) entry.p1 += r.revenue;
      if (inP2) entry.p2 += r.revenue;
      if (r.outOfStock) entry.outOfStock = true;
      if (r.isNew) entry.isNew = true;
    }
    for (const e of map.values()) {
      e.diff = e.p2 - e.p1;
      e.pct = e.p1 > 0 ? (e.diff / e.p1) * 100 : (e.p2 > 0 ? null : 0);
      // flag
      if (e.p1 === 0 && e.p2 === 0) e.flag = "no-sales";
      else if (e.p1 === 0 && e.p2 > 0) e.flag = "new";
      else if (e.outOfStock) e.flag = "out-of-stock";
      else if (e.pct !== null && e.pct >= 25) e.flag = "outperforming";
      else if (e.pct !== null && e.pct <= -25) e.flag = "underperforming";
      else if (e.pct !== null && Math.abs(e.pct) < 5) e.flag = "stable";
      else e.flag = "needs-review";
    }
    return Array.from(map.values());
  }, [filteredRows, p1Set, p2Set]);

  // Apply performance filter
  const filteredSkus = useMemo(() => {
    return skuAgg.filter((e) => {
      if (perfFilter === "up" && e.diff <= 0) return false;
      if (perfFilter === "down" && e.diff >= 0) return false;
      if (perfFilter === "zero" && (e.p1 + e.p2) > 0) return false;
      if (perfFilter === "new" && e.flag !== "new") return false;
      if (perfFilter === "oos" && !e.outOfStock) return false;
      return true;
    });
  }, [skuAgg, perfFilter]);

  // Group level aggregates
  const groupRows = useMemo(() => {
    const map = new Map<string, AggRow & { children: AggRow[] }>();
    for (const e of filteredSkus) {
      const gkey = e[groupBy] as string;
      let g = map.get(gkey);
      if (!g) {
        g = {
          key: gkey, warehouse: e.warehouse, brand: e.brand, collection: e.collection,
          p1: 0, p2: 0, diff: 0, pct: null, flag: "stable", outOfStock: false, isNew: false,
          children: [],
        };
        map.set(gkey, g);
      }
      g.p1 += e.p1; g.p2 += e.p2;
      g.children.push(e);
    }
    const arr = Array.from(map.values()).map((g) => {
      g.diff = g.p2 - g.p1;
      g.pct = g.p1 > 0 ? (g.diff / g.p1) * 100 : (g.p2 > 0 ? null : 0);
      g.flag = g.pct === null ? "new" : g.pct >= 10 ? "outperforming" : g.pct <= -10 ? "underperforming" : "stable";
      // sort children
      g.children.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      return g;
    });
    arr.sort((a, b) => {
      const av = sortKey === "diff" ? a.diff : sortKey === "pct" ? (a.pct ?? -1e9) : sortKey === "p2" ? a.p2 : a.p1;
      const bv = sortKey === "diff" ? b.diff : sortKey === "pct" ? (b.pct ?? -1e9) : sortKey === "p2" ? b.p2 : b.p1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [filteredSkus, groupBy, sortKey, sortDir]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalP1 = filteredSkus.reduce((s, e) => s + e.p1, 0);
    const totalP2 = filteredSkus.reduce((s, e) => s + e.p2, 0);
    const collectionsUp = groupRows.filter((g) => g.diff > 0).length;
    const collectionsDown = groupRows.filter((g) => g.diff < 0).length;
    const skusUp = filteredSkus.filter((e) => e.diff > 0).length;
    const skusDown = filteredSkus.filter((e) => e.diff < 0).length;
    const change = totalP2 - totalP1;
    const pct = totalP1 > 0 ? (change / totalP1) * 100 : null;
    return { totalP1, totalP2, change, pct, collectionsUp, collectionsDown, skusUp, skusDown };
  }, [filteredSkus, groupRows]);

  // Monthly matrix (last 6 months including p2End)
  const matrixMonths = useMemo(() => {
    if (allMonths.length === 0) return [];
    const end = p2End || allMonths[allMonths.length - 1];
    const out: MonthKey[] = [];
    for (let i = 5; i >= 0; i--) out.push(addMonths(end, -i));
    return out;
  }, [allMonths, p2End]);

  const monthlyByCollection = useMemo(() => {
    const map = new Map<string, Map<MonthKey, number>>();
    for (const r of filteredRows) {
      if (!matrixMonths.includes(r.month)) continue;
      let m = map.get(r.collection);
      if (!m) { m = new Map(); map.set(r.collection, m); }
      m.set(r.month, (m.get(r.month) ?? 0) + r.revenue);
    }
    return Array.from(map.entries()).map(([collection, m]) => {
      const vals = matrixMonths.map((mk) => m.get(mk) ?? 0);
      const recent3 = vals.slice(-3).reduce((s, v) => s + v, 0);
      const prior3 = vals.slice(0, 3).reduce((s, v) => s + v, 0);
      const growth = prior3 > 0 ? ((recent3 - prior3) / prior3) * 100 : null;
      return { collection, vals, recent3, prior3, growth };
    }).sort((a, b) => b.recent3 - a.recent3);
  }, [filteredRows, matrixMonths]);

  // Trend line data
  const trendData = useMemo(() => {
    const totals = new Map<MonthKey, number>();
    for (const r of filteredRows) {
      if (!matrixMonths.includes(r.month)) continue;
      totals.set(r.month, (totals.get(r.month) ?? 0) + r.revenue);
    }
    return matrixMonths.map((mk) => ({ month: monthLabel(mk), revenue: totals.get(mk) ?? 0 }));
  }, [filteredRows, matrixMonths]);

  // Top movers for charts
  const topGrowth = useMemo(() => groupRows.filter((g) => g.diff > 0).slice(0, 8)
    .map((g) => ({ name: g.key, diff: g.diff })), [groupRows]);
  const topDecline = useMemo(() => [...groupRows].filter((g) => g.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 8)
    .map((g) => ({ name: g.key, diff: Math.abs(g.diff) })), [groupRows]);

  // Drilldown drawer rows (monthly)
  const drawerRow = useMemo(() => skuAgg.find((e) => e.sku === drawerSku) ?? null, [skuAgg, drawerSku]);
  const drawerHistory = useMemo(() => {
    if (!drawerSku) return [];
    const map = new Map<MonthKey, number>();
    for (const r of rows) {
      if (r.sku !== drawerSku) continue;
      map.set(r.month, (map.get(r.month) ?? 0) + r.revenue);
    }
    return Array.from(map.entries()).sort().map(([mk, v]) => ({ month: monthLabel(mk), revenue: v }));
  }, [rows, drawerSku]);

  // Filter option lists
  const allWarehouses = useMemo(() => Array.from(new Set(rows.map((r) => r.warehouse))).sort(), [rows]);
  const allBrands = useMemo(() => Array.from(new Set(rows.map((r) => r.brand))).sort(), [rows]);
  const allCollections = useMemo(() => Array.from(new Set(rows.map((r) => r.collection))).sort(), [rows]);

  const resetFilters = () => {
    setPreset("L3M_VS_PRIOR");
    setWarehouse("all"); setBrand("all"); setCollection("all");
    setSearch(""); setPerfFilter("all"); setIncludeNonStock(true);
  };

  const exportCsv = () => {
    const header = ["Group", "Warehouse", "Brand", "Collection", "SKU", "Product", "Period 1", "Period 2", "Diff", "% Change", "Flag"];
    const lines = [header.join(",")];
    for (const g of groupRows) {
      lines.push([g.key, g.warehouse, g.brand, g.collection, "", "", g.p1.toFixed(2), g.p2.toFixed(2), g.diff.toFixed(2), g.pct?.toFixed(2) ?? "", g.flag].join(","));
      for (const c of g.children) {
        lines.push([g.key, c.warehouse, c.brand, c.collection, c.sku ?? "", `"${(c.product ?? "").replace(/"/g, "'")}"`, c.p1.toFixed(2), c.p2.toFixed(2), c.diff.toFixed(2), c.pct?.toFixed(2) ?? "", c.flag].join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "compare-periods.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const periodLabel = (s: MonthKey, e: MonthKey) =>
    s && e ? (s === e ? monthLabel(s) : `${monthLabel(s)} – ${monthLabel(e)}`) : "—";

  const toggle = (k: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const FlagBadge = ({ flag }: { flag: string }) => {
    const map: Record<string, { label: string; cls: string }> = {
      "outperforming":   { label: "Outperforming",  cls: "bg-success/15 text-success border-success/25" },
      "underperforming": { label: "Underperforming",cls: "bg-destructive/10 text-destructive border-destructive/20" },
      "stable":          { label: "Stable",         cls: "bg-muted text-muted-foreground border-border" },
      "new":             { label: "New",            cls: "bg-primary/10 text-primary border-primary/20" },
      "out-of-stock":    { label: "Out of Stock",   cls: "bg-warning/15 text-warning-foreground border-warning/30" },
      "no-sales":        { label: "No Sales",       cls: "bg-muted text-muted-foreground border-border" },
      "needs-review":    { label: "Needs Review",   cls: "bg-accent/15 text-accent-foreground border-accent/30" },
    };
    const cfg = map[flag] ?? map.stable;
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border", cfg.cls)}>{cfg.label}</span>;
  };

  const TrendIcon = ({ diff }: { diff: number }) => diff > 0
    ? <ArrowUpRight className="h-3.5 w-3.5 text-success inline" />
    : diff < 0
      ? <ArrowDownRight className="h-3.5 w-3.5 text-destructive inline" />
      : <Minus className="h-3.5 w-3.5 text-muted-foreground inline" />;

  return (
    <div className="space-y-4">
      {/* ============ FILTERS BAR ============ */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Compare Periods — Filters</h3>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={resetFilters} className="h-8 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} className="h-8 text-xs">
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Preset</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="L3M_VS_PRIOR">Last 3 Months vs Prior 3 Months</SelectItem>
                <SelectItem value="LM_VS_PRIOR">Last Month vs Prior Month</SelectItem>
                <SelectItem value="YTD_VS_PRIOR_YTD">YTD vs Prior YTD</SelectItem>
                <SelectItem value="CUSTOM">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 1 (Baseline)</Label>
            <div className="flex gap-1 mt-1">
              <Select value={p1Start} onValueChange={(v) => { setP1Start(v); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Start" /></SelectTrigger>
                <SelectContent>{allMonths.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={p1End} onValueChange={(v) => { setP1End(v); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="End" /></SelectTrigger>
                <SelectContent>{allMonths.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 2 (Compare)</Label>
            <div className="flex gap-1 mt-1">
              <Select value={p2Start} onValueChange={(v) => { setP2Start(v); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Start" /></SelectTrigger>
                <SelectContent>{allMonths.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={p2End} onValueChange={(v) => { setP2End(v); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="End" /></SelectTrigger>
                <SelectContent>{allMonths.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Search</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SKU, product, collection…" className="pl-8 h-9 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Warehouse / Source</Label>
            <Select value={warehouse} onValueChange={setWarehouse}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses</SelectItem>
                {allWarehouses.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Brand</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {allBrands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Collection</Label>
            <Select value={collection} onValueChange={setCollection}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All collections</SelectItem>
                {allCollections.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Performance</Label>
            <Select value={perfFilter} onValueChange={(v) => setPerfFilter(v as any)}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                <SelectItem value="up">Positive growth only</SelectItem>
                <SelectItem value="down">Negative growth only</SelectItem>
                <SelectItem value="zero">No / zero sales</SelectItem>
                <SelectItem value="new">New items only</SelectItem>
                <SelectItem value="oos">Out of stock only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={includeNonStock} onCheckedChange={(v) => setIncludeNonStock(!!v)} />
              Include discontinued / non-stock
            </label>
            <div className="text-xs text-muted-foreground">
              Group by:
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                <SelectTrigger className="h-7 ml-2 inline-flex w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collection">Collection</SelectItem>
                  <SelectItem value="brand">Brand</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">P1:</span> {periodLabel(p1Start, p1End)}{" "}
            <span className="ml-3 font-medium text-foreground">P2:</span> {periodLabel(p2Start, p2End)}
          </div>
        </div>
      </Card>

      {/* ============ KPI CARDS ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 1 Sales</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtMoney(summary.totalP1)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{periodLabel(p1Start, p1End)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 2 Sales</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtMoney(summary.totalP2)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{periodLabel(p2Start, p2End)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dollar Change</div>
          <div className={cn("text-2xl font-semibold mt-1 tabular-nums", summary.change > 0 ? "text-success" : summary.change < 0 ? "text-destructive" : "")}>
            {summary.change > 0 ? "+" : ""}{fmtMoney(summary.change)}
          </div>
          <div className="text-[11px] mt-1">
            <span className={cn(summary.pct && summary.pct > 0 ? "text-success" : summary.pct && summary.pct < 0 ? "text-destructive" : "text-muted-foreground")}>
              {fmtPct(summary.pct)}
            </span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Movement</div>
          <div className="flex items-center gap-3 mt-1">
            <div>
              <div className="text-base font-semibold tabular-nums">
                <TrendingUp className="h-3.5 w-3.5 inline text-success mr-1" />{summary.collectionsUp}
                <span className="text-muted-foreground mx-1">/</span>
                <TrendingDown className="h-3.5 w-3.5 inline text-destructive mr-1" />{summary.collectionsDown}
              </div>
              <div className="text-[10px] text-muted-foreground">collections up / down</div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div>
              <div className="text-base font-semibold tabular-nums">
                <span className="text-success">{summary.skusUp}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-destructive">{summary.skusDown}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">SKUs up / down</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ============ VISUALS ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <h4 className="text-sm font-semibold">Top Growth ({groupBy})</h4>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topGrowth} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="diff" fill="hsl(var(--success))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <h4 className="text-sm font-semibold">Top Decline ({groupBy})</h4>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDecline} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="diff" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Monthly Sales Trend</h4>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ left: 8, right: 12, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 11 }} />
              <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ============ COMPARATIVE TABLE ============ */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold">Comparative Trend Table</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Grouped by {groupBy}. Click a row to drill into SKUs.</p>
          </div>
          <div className="text-xs text-muted-foreground">
            {groupRows.length} {groupBy}s · {filteredSkus.length} SKUs
          </div>
        </div>
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 w-8"></th>
                <th className="text-left px-3 py-2">{groupBy === "collection" ? "Collection" : groupBy === "brand" ? "Brand" : "Warehouse"} / SKU</th>
                <th className="text-left px-3 py-2">Brand</th>
                <th className="text-left px-3 py-2">Warehouse</th>
                <th className="text-right px-3 py-2 cursor-pointer" onClick={() => { setSortKey("p1"); setSortDir(sortKey === "p1" && sortDir === "desc" ? "asc" : "desc"); }}>Period 1</th>
                <th className="text-right px-3 py-2 cursor-pointer" onClick={() => { setSortKey("p2"); setSortDir(sortKey === "p2" && sortDir === "desc" ? "asc" : "desc"); }}>Period 2</th>
                <th className="text-right px-3 py-2 cursor-pointer" onClick={() => { setSortKey("diff"); setSortDir(sortKey === "diff" && sortDir === "desc" ? "asc" : "desc"); }}>$ Δ</th>
                <th className="text-right px-3 py-2 cursor-pointer" onClick={() => { setSortKey("pct"); setSortDir(sortKey === "pct" && sortDir === "desc" ? "asc" : "desc"); }}>% Δ</th>
                <th className="text-center px-3 py-2">Trend</th>
                <th className="text-left px-3 py-2">Flag</th>
              </tr>
            </thead>
            <tbody>
              {groupRows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">No data for the selected periods and filters.</td></tr>
              )}
              {groupRows.map((g) => {
                const isOpen = expanded.has(g.key);
                return (
                  <>
                    <tr key={g.key} className="border-t border-border bg-muted/20 hover:bg-muted/40 cursor-pointer font-medium" onClick={() => toggle(g.key)}>
                      <td className="px-3 py-2">{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                      <td className="px-3 py-2">{g.key} <span className="text-[10px] text-muted-foreground ml-1">({g.children.length})</span></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{groupBy === "brand" ? "—" : g.brand}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{groupBy === "warehouse" ? "—" : g.warehouse}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(g.p1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(g.p2)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", g.diff > 0 ? "text-success" : g.diff < 0 ? "text-destructive" : "")}>
                        {g.diff > 0 ? "+" : ""}{fmtMoney(g.diff)}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", g.pct && g.pct > 0 ? "text-success" : g.pct && g.pct < 0 ? "text-destructive" : "text-muted-foreground")}>
                        {fmtPct(g.pct)}
                      </td>
                      <td className="px-3 py-2 text-center"><TrendIcon diff={g.diff} /></td>
                      <td className="px-3 py-2"><FlagBadge flag={g.flag} /></td>
                    </tr>
                    {isOpen && g.children.map((c) => (
                      <tr key={`${g.key}-${c.sku}`} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(c.sku!)}>
                        <td></td>
                        <td className="px-3 py-2 pl-8">
                          <div className="font-mono text-xs">{c.sku}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[280px]">{c.product}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">{c.brand}</td>
                        <td className="px-3 py-2 text-xs">{c.warehouse}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.p1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.p2)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", c.diff > 0 ? "text-success" : c.diff < 0 ? "text-destructive" : "")}>
                          {c.diff > 0 ? "+" : ""}{fmtMoney(c.diff)}
                        </td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", c.pct && c.pct > 0 ? "text-success" : c.pct && c.pct < 0 ? "text-destructive" : "text-muted-foreground")}>
                          {fmtPct(c.pct)}
                        </td>
                        <td className="px-3 py-2 text-center"><TrendIcon diff={c.diff} /></td>
                        <td className="px-3 py-2"><FlagBadge flag={c.flag} /></td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ============ MONTHLY MATRIX ============ */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-base font-semibold">Monthly Comparison Matrix</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last 6 months by collection · 3-month growth = (recent 3 − prior 3) / prior 3</p>
        </div>
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Collection</th>
                {matrixMonths.map((m) => <th key={m} className="text-right px-3 py-2">{monthLabel(m)}</th>)}
                <th className="text-right px-3 py-2 border-l border-border">3M Growth</th>
              </tr>
            </thead>
            <tbody>
              {monthlyByCollection.length === 0 && (
                <tr><td colSpan={matrixMonths.length + 2} className="px-3 py-8 text-center text-muted-foreground">No data.</td></tr>
              )}
              {monthlyByCollection.map((row) => (
                <tr key={row.collection} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{row.collection}</td>
                  {row.vals.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">{v > 0 ? fmtMoney(v) : <span className="text-muted-foreground">—</span>}</td>
                  ))}
                  <td className={cn("px-3 py-2 text-right tabular-nums font-semibold border-l border-border",
                    row.growth && row.growth > 0 ? "text-success" : row.growth && row.growth < 0 ? "text-destructive" : "text-muted-foreground")}>
                    {fmtPct(row.growth)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ============ DRILLDOWN DRAWER ============ */}
      <Sheet open={drawerSku !== null} onOpenChange={(o) => !o && setDrawerSku(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          {drawerRow && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{drawerRow.sku}</SheetTitle>
                <SheetDescription>{drawerRow.product}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-muted-foreground">Brand</div><div className="font-medium mt-0.5">{drawerRow.brand}</div>
                  </div>
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-muted-foreground">Collection</div><div className="font-medium mt-0.5">{drawerRow.collection}</div>
                  </div>
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-muted-foreground">Warehouse</div><div className="font-medium mt-0.5">{drawerRow.warehouse}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-[10px] uppercase text-muted-foreground">Period 1</div>
                    <div className="text-lg font-semibold tabular-nums mt-1">{fmtMoney(drawerRow.p1)}</div>
                  </div>
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-[10px] uppercase text-muted-foreground">Period 2</div>
                    <div className="text-lg font-semibold tabular-nums mt-1">{fmtMoney(drawerRow.p2)}</div>
                  </div>
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-[10px] uppercase text-muted-foreground">Change</div>
                    <div className={cn("text-lg font-semibold tabular-nums mt-1", drawerRow.diff > 0 ? "text-success" : drawerRow.diff < 0 ? "text-destructive" : "")}>
                      {drawerRow.diff > 0 ? "+" : ""}{fmtMoney(drawerRow.diff)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{fmtPct(drawerRow.pct)}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold mb-2">Sales History</div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={drawerHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 10 }} />
                        <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                        <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <FlagBadge flag={drawerRow.flag} />
                  {drawerRow.outOfStock && <FlagBadge flag="out-of-stock" />}
                  {drawerRow.isNew && <FlagBadge flag="new" />}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
