import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClearanceItem {
  id:                         string | null;
  sku:                        string;
  product:                    string | null;
  warehouse:                  string | null;
  collection:                 string | null;
  available:                  number;
  on_hand:                    number;
  list_price:                 number | null;
  retail_value:               number | null;
  inventory_value:            number | null;
  status:                     string | null;
  retail_value_price_source:  string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const PILL_BASE = "inline-flex items-center gap-1.5 text-[11px] font-medium";

function Dot({ cls }: { cls: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cls}`} />;
}

function StatusPill({ available }: { available: number }) {
  if (available <= 0) {
    return <span className={cn(PILL_BASE, "text-destructive")}><Dot cls="bg-destructive" />Out of Stock</span>;
  }
  return <span className={cn(PILL_BASE, "text-muted-foreground")}><Dot cls="bg-success" />In Stock</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClearanceProductsPage() {
  const [items,            setItems]            = useState<ClearanceItem[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [search,           setSearch]           = useState("");
  const [collectionFilter, setCollectionFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("v_portal_clearance_products")
      .select("id, sku, product, warehouse, collection, available, on_hand, list_price, retail_value, inventory_value, status, retail_value_price_source")
      .order("collection", { nullsFirst: false })
      .order("sku");

    if (error) {
      console.error("[clearance] v_portal_clearance_products fetch failed:", error.message, error);
      setLoading(false);
      return;
    }

    const rows = ((data ?? []) as any[]).map((r) => ({
      id:              r.id ?? null,
      sku:             String(r.sku ?? ""),
      product:         r.product ?? null,
      warehouse:       r.warehouse ?? null,
      collection:      r.collection ?? null,
      available:       Number(r.available)      || 0,
      on_hand:         Number(r.on_hand)        || 0,
      list_price:                r.list_price      != null ? Number(r.list_price)      : null,
      retail_value:              r.retail_value    != null ? Number(r.retail_value)    : null,
      inventory_value:           r.inventory_value != null ? Number(r.inventory_value) : null,
      status:                    r.status ?? null,
      retail_value_price_source: r.retail_value_price_source ?? null,
    })) as ClearanceItem[];

    setItems(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const collections = useMemo(
    () => Array.from(new Set(items.map((i) => i.collection ?? "Uncategorized"))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      if (collectionFilter !== "all" && (i.collection ?? "Uncategorized") !== collectionFilter) return false;
      if (q) return i.sku.toLowerCase().includes(q) || (i.product ?? "").toLowerCase().includes(q);
      return true;
    });
  }, [items, search, collectionFilter]);

  const totalSkus        = useMemo(() => new Set(filtered.map((i) => i.sku)).size, [filtered]);
  const totalLines       = filtered.length;
  const totalAvailable   = useMemo(() => filtered.reduce((s, i) => s + i.available,              0), [filtered]);
  const totalCollections = useMemo(() => new Set(filtered.map((i) => i.collection ?? "Uncategorized")).size, [filtered]);
  const totalRetailValue = useMemo(() => filtered.reduce((s, i) => s + (i.retail_value    ?? 0), 0), [filtered]);
  const totalInvValue    = useMemo(() => filtered.reduce((s, i) => s + (i.inventory_value ?? 0), 0), [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Clearance Products</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Discontinued Acctivate lines with current inventory levels.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total SKUs</p>
          <p className="text-2xl font-semibold tabular-nums">{totalSkus.toLocaleString()}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total Lines</p>
          <p className="text-2xl font-semibold tabular-nums">{totalLines.toLocaleString()}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total Available</p>
          <p className="text-2xl font-semibold tabular-nums">{totalAvailable.toLocaleString()}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Collections</p>
          <p className="text-2xl font-semibold tabular-nums">{totalCollections.toLocaleString()}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Retail Value</p>
          <p className="text-2xl font-semibold tabular-nums">{formatUSD(totalRetailValue)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Inventory Value</p>
          <p className="text-2xl font-semibold tabular-nums">{formatUSD(totalInvValue)}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search SKU or product..."
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant={collectionFilter === "all" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setCollectionFilter("all")}
          >
            All Collections
          </Button>
          {collections.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={collectionFilter === c ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setCollectionFilter(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-primary" />
          Loading clearance products...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No clearance products found.
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  {(["SKU", "Product", "Warehouse", "Collection", "On Hand", "Available", "SD Price", "Retail Value", "Inv. Value", "Status"] as const).map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap",
                        ["On Hand", "Available", "SD Price", "Retail Value", "Inv. Value"].includes(h) ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr
                    key={`${item.sku}-${item.warehouse ?? idx}`}
                    className={cn(
                      "border-b border-border/40 hover:bg-muted/20 transition-colors",
                      idx % 2 !== 0 && "bg-muted/10",
                    )}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-medium whitespace-nowrap">{item.sku}</td>
                    <td className="px-4 py-2.5 text-foreground max-w-[200px] truncate">{item.product ?? "-"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{item.warehouse ?? "-"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{item.collection ?? "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.on_hand.toLocaleString()}</td>
                    <td className={cn("px-4 py-2.5 text-right tabular-nums font-medium", item.available === 0 && "text-muted-foreground")}>
                      {item.available.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {item.retail_value_price_source === "Missing SD"
                        ? <span className="text-muted-foreground text-[11px]">Missing SD</span>
                        : item.list_price != null ? `$${item.list_price.toFixed(2)}` : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {item.retail_value_price_source === "Missing SD"
                        ? <span className="text-muted-foreground">$0</span>
                        : item.retail_value != null ? formatUSD(item.retail_value) : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {item.inventory_value != null ? formatUSD(item.inventory_value) : "-"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <StatusPill available={item.available} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t text-xs text-muted-foreground">
            {filtered.length.toLocaleString()} line{filtered.length !== 1 ? "s" : ""} · {totalSkus.toLocaleString()} distinct SKU{totalSkus !== 1 ? "s" : ""}
          </div>
        </Card>
      )}
    </div>
  );
}
