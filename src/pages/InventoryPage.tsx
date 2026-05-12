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
            <span>
              {usingMock
                ? "Showing sample data — Acctivate sync hasn't run yet."
                : lastSyncedAt
                  ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
                  : "Synced from Acctivate."}
            </span>
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

      <InventoryDashboards
        items={items}
        statusFilter={filter}
        onStatusFilterChange={(s) => {
          setFilter(s);
          requestAnimationFrame(() => {
            document.getElementById("inventory-sku-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
      />

    </div>
  );
}
