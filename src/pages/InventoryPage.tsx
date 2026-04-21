import { useMemo, useState } from "react";
import { AlertTriangle, Package, XCircle, RefreshCw, Zap, Search, ExternalLink, TrendingDown, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inventoryItems, type InventoryStatus } from "@/data/inventoryMock";
import { cn } from "@/lib/utils";

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

  const counts = useMemo(() => {
    const c = { total: inventoryItems.length, critical: 0, outOfStock: 0, reorder: 0, fast: 0 };
    for (const it of inventoryItems) {
      if (it.status === "critical") c.critical++;
      if (it.status === "out-of-stock") c.outOfStock++;
      if (it.status === "reorder-soon") c.reorder++;
      if (it.status === "fast-moving") c.fast++;
    }
    return c;
  }, []);

  const filtered = useMemo(() => {
    return inventoryItems.filter((it) => {
      if (filter !== "all" && it.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!it.sku.toLowerCase().includes(q) && !it.product.toLowerCase().includes(q) && !it.collection.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [filter, query]);

  const collectionsAttention = useMemo(() => {
    const map = new Map<string, { needs: number; total: number }>();
    for (const it of inventoryItems) {
      const entry = map.get(it.collection) ?? { needs: 0, total: 0 };
      entry.total++;
      if (["critical", "out-of-stock", "reorder-soon", "stockout-risk"].includes(it.status)) entry.needs++;
      map.set(it.collection, entry);
    }
    return Array.from(map.entries())
      .filter(([, v]) => v.needs > 0)
      .sort((a, b) => b[1].needs - a[1].needs);
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        <p className="page-subtitle">SKU master — health snapshot. Currently using sample data; Acctivate feed will replace once cleaned.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatTile label="Total SKUs" value={counts.total} icon={Package} />
        <StatTile label="Critical Items" value={counts.critical} icon={AlertTriangle} accent="text-destructive" hint="Needs attention" />
        <StatTile label="Out of Stock" value={counts.outOfStock} icon={XCircle} accent="text-destructive" />
        <StatTile label="Reorder Soon" value={counts.reorder} icon={RefreshCw} accent="text-warning-foreground" />
        <StatTile label="Fast Moving" value={counts.fast} icon={Zap} accent="text-success" />
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
            const count = f.key === "all" ? inventoryItems.length : inventoryItems.filter((i) => i.status === f.key).length;
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
                <th className="text-right px-4 py-3 font-medium"><span className="inline-flex items-center gap-1">Avg Mo. Sales <ArrowUpDown className="h-3 w-3" /></span></th>
                <th className="text-right px-4 py-3 font-medium"><span className="inline-flex items-center gap-1">Mo. Supply <ArrowUpDown className="h-3 w-3" /></span></th>
                <th className="text-right px-4 py-3 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
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
                    <td className="px-4 py-3 text-right tabular-nums">{it.avgMonthlySales}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{it.monthsSupply == null ? "—" : it.monthsSupply.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No SKUs match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
