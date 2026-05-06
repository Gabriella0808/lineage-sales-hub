import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package, XCircle, RefreshCw, Zap, Search, ExternalLink, TrendingDown, ArrowUpDown, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type InventoryStatus } from "@/data/inventoryMock";
import { useInventory } from "@/hooks/useInventory";
import InventoryDashboards from "@/components/InventoryDashboards";
import { cn } from "@/lib/utils";
import { weeksOfSupply, reorderPoint, weeksTone, LEAD_TIME_WEEKS } from "@/lib/inventoryMath";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  "Fast Moving": "hsl(var(--success))",
  "Liquidate": "hsl(var(--foreground))",
  "Out of Stock": "hsl(var(--destructive))",
  "Critical": "hsl(var(--destructive))",
  "Overstock": "hsl(var(--accent))",
  "Reorder Soon": "hsl(var(--warning))",
  "Stockout Risk": "hsl(var(--warning))",
  "Healthy": "hsl(var(--success))",
};

const STATUS_FILTERS: { key: "all" | InventoryStatus; label: string; tone?: string }[] = [
  { key: "all", label: "All SKUs" },
  { key: "critical", label: "Critical", tone: "destructive" },
  { key: "out-of-stock", label: "Out of Stock" },
  { key: "stockout-risk", label: "Stockout Risk" },
  { key: "reorder-soon", label: "Reorder Soon" },
  { key: "fast-moving", label: "Fast Moving" },
  { key: "overstock", label: "Overstock" },
  { key: "liquidate", label: "Liquidate" },
];

const STATUS_BADGE: Record<InventoryStatus, { label: string; cls: string; icon?: React.ComponentType<{ className?: string }> }> = {
  "out-of-stock":   { label: "Out of Stock",   cls: "bg-destructive/10 text-destructive border border-destructive/20", icon: XCircle },
  "critical":       { label: "Critical",       cls: "bg-destructive/10 text-destructive border border-destructive/20", icon: AlertTriangle },
  "reorder-soon":   { label: "Reorder Soon",   cls: "bg-warning/15 text-warning-foreground border border-warning/30", icon: RefreshCw },
  "stockout-risk":  { label: "Stockout Risk",  cls: "bg-warning/15 text-warning-foreground border border-warning/30", icon: TrendingDown },
  "fast-moving":    { label: "Fast Moving",    cls: "bg-success/15 text-success border border-success/25", icon: Zap },
  "overstock":      { label: "Overstock",      cls: "bg-accent/15 text-accent-foreground border border-accent/30" },
  "liquidate":      { label: "Liquidate",      cls: "bg-muted text-muted-foreground border border-border" },
  "healthy":        { label: "Healthy",        cls: "bg-success/10 text-success border border-success/20" },
};

function StatusPill({ status }: { status: InventoryStatus }) {
  const cfg = STATUS_BADGE[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", cfg.cls)}>
      {Icon && <Icon className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

function StatTile({ label, value, icon: Icon, accent, hint }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; accent?: string; hint?: string }) {
  return (
    <Card className="p-5 flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold mt-2 tabular-nums">{value}</div>
        {hint && <div className={cn("text-xs mt-1", accent ?? "text-muted-foreground")}>{hint}</div>}
      </div>
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </Card>
  );
}

export default function InventoryPage() {
  const [filter, setFilter] = useState<"all" | InventoryStatus>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [collectionFilter, setCollectionFilter] = useState<Set<string> | null>(null); // null = all
  const [supplierFilter, setSupplierFilter] = useState<string>("all"); // "all" or specific supplier name
  const { items, loading, refreshing, lastSyncedAt, lastFetchedAt, usingMock, refresh } = useInventory();

  const counts = useMemo(() => {
    const c = { total: items.length, critical: 0, outOfStock: 0, reorder: 0, fast: 0 };
    for (const it of items) {
      if (it.status === "critical") c.critical++;
      if (it.status === "out-of-stock") c.outOfStock++;
      if (it.status === "reorder-soon") c.reorder++;
      if (it.status === "fast-moving") c.fast++;
    }
    return c;
  }, [items]);

  const allSuppliers = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.supplier) s.add(it.supplier);
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter !== "all" && it.status !== filter) return false;
      if (supplierFilter !== "all" && it.supplier !== supplierFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!it.sku.toLowerCase().includes(q) && !it.product.toLowerCase().includes(q) && !it.collection.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [filter, query, items, supplierFilter]);

  useEffect(() => { setPage(1); }, [filter, query, supplierFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const collectionsAttention = useMemo(() => {
    const map = new Map<string, { needs: number; total: number }>();
    for (const it of items) {
      const entry = map.get(it.collection) ?? { needs: 0, total: 0 };
      entry.total++;
      if (["critical", "out-of-stock", "reorder-soon", "stockout-risk"].includes(it.status)) entry.needs++;
      map.set(it.collection, entry);
    }
    return Array.from(map.entries())
      .filter(([, v]) => v.needs > 0)
      .sort((a, b) => b[1].needs - a[1].needs);
  }, [items]);

  const statusDistribution = useMemo(() => {
    const labelMap: Record<InventoryStatus, string> = {
      "fast-moving": "Fast Moving",
      "liquidate": "Liquidate",
      "out-of-stock": "Out of Stock",
      "critical": "Critical",
      "overstock": "Overstock",
      "reorder-soon": "Reorder Soon",
      "stockout-risk": "Stockout Risk",
      "healthy": "Healthy",
    };
    const counts = new Map<string, number>();
    for (const it of items) {
      const k = labelMap[it.status];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  }, [items]);

  const allCollections = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) s.add(it.collection);
    return Array.from(s).sort();
  }, [items]);

  const collectionsHealth = useMemo(() => {
    const map = new Map<string, { critical: number; healthy: number }>();
    for (const it of items) {
      if (collectionFilter && !collectionFilter.has(it.collection)) continue;
      const entry = map.get(it.collection) ?? { critical: 0, healthy: 0 };
      if (["critical", "out-of-stock", "reorder-soon", "stockout-risk"].includes(it.status)) entry.critical++;
      else entry.healthy++;
      map.set(it.collection, entry);
    }
    return Array.from(map.entries()).map(([collection, v]) => ({ collection, ...v }));
  }, [items, collectionFilter]);

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">
            SKU master — snapshot.{" "}
            {usingMock
              ? "Showing sample data — Acctivate sync hasn't run yet."
              : lastSyncedAt
                ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
                : "Synced from Acctivate."}
            {lastFetchedAt && !usingMock && (
              <span className="text-xs text-muted-foreground ml-2">
                · refreshed {new Date(lastFetchedAt).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh()}
          disabled={loading || refreshing}
          className="h-9"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh inventory"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatTile label="Total SKUs" value={counts.total} icon={Package} />
        <StatTile label="Critical Items" value={counts.critical} icon={AlertTriangle} accent="text-destructive" hint="Needs attention" />
        <StatTile label="Out of Stock" value={counts.outOfStock} icon={XCircle} accent="text-destructive" />
        <StatTile label="Reorder Soon" value={counts.reorder} icon={RefreshCw} accent="text-warning-foreground" />
        <StatTile label="Fast Moving" value={counts.fast} icon={Zap} accent="text-success" />
      </div>

      <InventoryDashboards items={items} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-3">Status Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusDistribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {statusDistribution.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "hsl(var(--muted-foreground))"} />
                  ))}
                </Pie>
                <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-2">
            {statusDistribution.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: STATUS_COLORS[s.name] ?? "hsl(var(--muted-foreground))" }} />
                <span className="text-muted-foreground">{s.name}</span>
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-semibold">Collections: Critical vs Healthy</h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  {collectionFilter === null
                    ? "All collections"
                    : `${collectionFilter.size} selected`}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setCollectionFilter(null)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={() => setCollectionFilter(new Set())}
                  >
                    Clear
                  </button>
                </div>
                <ScrollArea className="h-64">
                  <div className="space-y-1 pr-2">
                    {allCollections.map((c) => {
                      const checked = collectionFilter === null ? true : collectionFilter.has(c);
                      return (
                        <label
                          key={c}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setCollectionFilter((prev) => {
                                const base = prev === null ? new Set(allCollections) : new Set(prev);
                                if (v) base.add(c);
                                else base.delete(c);
                                return base;
                              });
                            }}
                          />
                          <span className="truncate">{c}</span>
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collectionsHealth} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="collection" width={80} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="critical" stackId="a" fill="hsl(var(--destructive))" name="Critical" />
                <Bar dataKey="healthy" stackId="a" fill="hsl(var(--success))" name="Healthy" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

      </div>

      {collectionsAttention.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-warning-foreground" />
            <h2 className="text-base font-semibold">Collections Requiring Attention</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {collectionsAttention.map(([name, v]) => (
              <div key={name} className="rounded-lg border border-border p-4">
                <div className="font-medium">{name}</div>
                <div className="mt-2 text-sm">
                  <span className="text-destructive font-semibold text-lg">{v.needs}</span>
                  <span className="text-muted-foreground"> / {v.total} SKUs need action</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            const supplierScoped = supplierFilter === "all" ? items : items.filter((i) => i.supplier === supplierFilter);
            const count = f.key === "all" ? supplierScoped.length : supplierScoped.filter((i) => i.status === f.key).length;
            return (
              <Button
                key={f.key}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
                className="h-8 rounded-full"
              >
                {f.key === "critical" && <span className="h-1.5 w-1.5 rounded-full bg-destructive mr-1.5" />}
                {f.label}
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{count}</Badge>
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Filter by supplier"
          >
            <option value="all">All suppliers</option>
            {allSuppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SKU, product, collection…"
              className="pl-8 h-9"
            />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">SKU / Product</th>
                <th className="text-left px-4 py-3 font-medium">Collection</th>
                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                <th className="text-right px-4 py-3 font-medium"><span className="inline-flex items-center gap-1">On Hand <ArrowUpDown className="h-3 w-3" /></span></th>
                <th className="text-right px-4 py-3 font-medium"><span className="inline-flex items-center gap-1">Available <ArrowUpDown className="h-3 w-3" /></span></th>
                <th className="text-right px-4 py-3 font-medium"><span className="inline-flex items-center gap-1">Sales/Wk <ArrowUpDown className="h-3 w-3" /></span></th>
                <th className="text-right px-4 py-3 font-medium" title="Reorder point: Sales/Week × 20.25"><span className="inline-flex items-center gap-1">Reorder Pt <ArrowUpDown className="h-3 w-3" /></span></th>
                <th className="text-right px-4 py-3 font-medium" title={`Weeks of supply = (Available + On PO) ÷ Sales/Week. Lead time ≈ ${LEAD_TIME_WEEKS} weeks.`}><span className="inline-flex items-center gap-1">Weeks Supply <ArrowUpDown className="h-3 w-3" /></span></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((it) => {
                const lowQty = it.onHand <= 4;
                return (
                  <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3"><StatusPill status={it.status} /></td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{it.product}</div>
                      <div className="text-xs text-muted-foreground font-mono">{it.sku}</div>
                    </td>
                    <td className="px-4 py-3">{it.collection}</td>
                    <td className="px-4 py-3 text-muted-foreground">{it.supplier}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", lowQty && "text-destructive")}>{it.onHand}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", lowQty && "text-destructive")}>{it.available}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{it.avgMonthlySales > 0 ? (it.avgMonthlySales / 4.333).toFixed(1) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{it.avgMonthlySales > 0 ? reorderPoint(it) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(() => {
                        const w = weeksOfSupply(it);
                        if (w == null) return <span className="text-muted-foreground">No sales</span>;
                        if (it.onHand <= 0 && (it.onPo ?? 0) <= 0) return <span className="text-destructive font-semibold">0 wk</span>;
                        return <span className={weeksTone(w)} title={`(Avail ${it.available} + On PO ${it.onPo ?? 0}) ÷ ${(it.avgMonthlySales/4.333).toFixed(2)}/wk`}>{w.toFixed(1)} wk</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No SKUs match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}</span>–
              <span className="font-medium text-foreground">{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span> of{" "}
              <span className="font-medium text-foreground">{filtered.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <Button size="sm" variant="outline" className="h-8" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
