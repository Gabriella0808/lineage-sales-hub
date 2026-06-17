import { Fragment, useMemo, useState, useCallback } from "react";
import { ArrowLeft, AlertTriangle, MessageSquare, X, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import backlogData from "@/data/backlogSummary.json";
import { useOpenSalesOrders } from "@/hooks/useOpenSalesOrders";

type DetailRow = {
  customer: string;
  type: string;
  date: string | null;
  shipDate: string | null;
  num: string | number | null;
  name: string | null;
  rep: string | null;
  item: string | null;
  description: string | null;
  memo: string | null;
  amount: number;
  openBalance: number;
  stockClass: string | null;
};

const data = backlogData as {
  asOf: string;
  stockClasses: { code: string; description: string; total: number }[];
  problemOrders: { customer: string; amount: number; notes: string }[];
  discussionPoints: { customer: string; notes: string }[];
  detail: DetailRow[];
};

// Human-friendly descriptions for Acctivate ProductClass codes.
const STOCK_CLASS_DESCRIPTIONS: Record<string, string> = {
  "New": "New Product (Unavail)",
  "Discs-Sur": "Discounts and Surcharges",
  "OOS": "Out of Stock",
  "Avail": "Available",
  "DC": "Direct Container",
  "MC": "Mixed Container",
  "Contract": "Contract",
  "N/A": "Other / Non-Inventory",
};


const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const STOCK_CLASS_TONE: Record<string, string> = {
  OOS: "bg-destructive/10 text-destructive border border-destructive/20",
  New: "bg-warning/15 text-warning-foreground border border-warning/30",
  Avail: "bg-success/10 text-success border border-success/25",
  "Discs-Sur": "bg-muted text-muted-foreground border border-border",
  MC: "bg-accent/15 text-accent-foreground border border-accent/30",
  DC: "bg-primary/10 text-primary border border-primary/20",
  Contract: "bg-muted text-foreground border border-border",
};

// Rep -†’ territory mapping (from DB). Falls back to rep name if unknown.
const REP_TO_TERRITORY: Record<string, string> = {
  "Skip Camillo": "Skip Camillo / New England",
  "Skip": "Skip Camillo / New England",
  "Brent Holbrook": "South Florida",
  "Brent": "South Florida",
  "Bruce Quillen": "Panhandle/GA/AL",
  "Quill": "Panhandle/GA/AL",
  "Jordan Shindell": "OH/WPA / Mid Atlantic",
  "Shindell": "OH/WPA / Mid Atlantic",
  "Internet": "Internet",
  "Inter": "Internet",
  "Andrew Smith": "MI",
  "Brad Robertson": "VA/WV",
  "Dave Ervin": "NC/SC",
  "House": "House",
  "Mike Durham": "North Florida",
  "Mike Root": "Root",
  "Peter Avella": "NY/NJ",
  "Sergio - Hospitality": "Hospitality",
  "Stewart Hunt": "TX/OK",
  "Arkansas (open)": "Arkansas",
  "IL/WI (open)": "IL/WI",
  "Indiana (open)": "Indiana",
  "MS-LA (open)": "MS-LA",
  "TN/KY (open)": "TN/KY",
};

function getTerritory(rep: string | null): string {
  if (!rep) return "Unknown";
  return REP_TO_TERRITORY[rep] ?? rep;
}

type Drill =
  | { kind: "stockClass"; code: string; label: string }
  | { kind: "customer"; customer: string }
  | null;

export function BacklogSummary() {
  const [drill, setDrill] = useState<Drill>(null);
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [stockClassFilter, setStockClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [skuQuery, setSkuQuery] = useState<string>("");
  const [repFilter, setRepFilter] = useState<string>("all");

  const { rows: liveOrders, loading: liveLoading } = useOpenSalesOrders();

  // Prefer live Acctivate open sales orders when available; otherwise fall back
  // to the static snapshot. Live rows are mapped into the same DetailRow shape
  // the existing UI expects so all filters/drill-downs keep working.
  const detailWithTerritory = useMemo(() => {
    // While the live fetch is in flight, render nothing rather than the
    // pre-sync static snapshot --- we don't want stale figures flashing in.
    let source: (DetailRow & { __live?: boolean })[];
    if (liveLoading) {
      source = [];
    } else if (liveOrders.length > 0) {
      source = liveOrders.map((r) => ({
        customer: r.dealer_name ?? "---",
        type: "Sales Order",
        date: r.order_date,
        shipDate: r.promised_date,
        num: r.order_number,
        name: r.dealer_name,
        rep: r.rep,
        item: r.sku,
        description: null,
        memo: null,
        amount: Number(r.extended_value || 0),
        openBalance: Number(r.extended_value || 0),
        stockClass: r.stock_class,
        __live: true,
      }));
    } else {
      source = data.detail;
    }

    return source.map((r) => ({
      ...r,
      territory: getTerritory(r.rep),
      status: (r.openBalance || 0) !== 0 ? "Open" : "Cleared",
    }));
  }, [liveOrders, liveLoading]);



  const allTerritories = useMemo(
    () => Array.from(new Set(detailWithTerritory.map((r) => r.territory).filter(Boolean))).sort(),
    [detailWithTerritory],
  );

  const allCustomers = useMemo(
    () => Array.from(new Set(detailWithTerritory.map((r) => r.customer).filter(Boolean))).sort(),
    [detailWithTerritory],
  );

  const allReps = useMemo(
    () => Array.from(new Set(detailWithTerritory.map((r) => r.rep).filter(Boolean))).sort(),
    [detailWithTerritory],
  );

  const filteredDetail = useMemo(() => {
    return detailWithTerritory.filter((r) => {
      if (territoryFilter !== "all" && r.territory !== territoryFilter) return false;
      if (stockClassFilter !== "all") {
        const code = r.stockClass && r.stockClass !== "N/A" ? r.stockClass : "Unclassified";
        if (code !== stockClassFilter) return false;
      }
      if (statusFilter === "Open" && (r.openBalance || 0) === 0) return false;
      if (statusFilter === "Cleared" && (r.openBalance || 0) !== 0) return false;
      if (customerFilter !== "all" && r.customer !== customerFilter) return false;
      if (repFilter !== "all" && r.rep !== repFilter) return false;
      if (skuQuery) {
        const q = skuQuery.toLowerCase();
        const match = (r.item ?? "").toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          (r.customer ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [detailWithTerritory, territoryFilter, stockClassFilter, statusFilter, customerFilter, repFilter, skuQuery]);

  const allStockClasses = useMemo(() => {
    const set = new Set<string>();
    for (const r of detailWithTerritory) {
      set.add(r.stockClass && r.stockClass !== "N/A" ? r.stockClass : "Unclassified");
    }
    return Array.from(set).sort();
  }, [detailWithTerritory]);

  // Recompute summary tables from filtered detail
  const filteredStockClasses = useMemo(() => {
    const totals = new Map<string, { code: string; description: string; total: number }>();
    for (const r of filteredDetail) {
      const code = r.stockClass && r.stockClass !== "N/A" ? r.stockClass : "Unclassified";
      const desc = STOCK_CLASS_DESCRIPTIONS[code]
        ?? data.stockClasses.find((s) => s.code === code)?.description
        ?? (code === "Unclassified" ? "No stock class assigned" : code);
      const entry = totals.get(code) ?? { code, description: desc, total: 0 };
      entry.total += Math.abs(r.openBalance || 0);
      totals.set(code, entry);
    }
    return Array.from(totals.values()).sort((a, b) => b.total - a.total);
  }, [filteredDetail]);


  const filteredTotalBacklog = useMemo(
    () => filteredStockClasses.reduce((s, c) => s + c.total, 0),
    [filteredStockClasses],
  );

  const activeFilterCount = useMemo(
    () => [territoryFilter, stockClassFilter, statusFilter, customerFilter, repFilter].filter((f) => f !== "all").length + (skuQuery ? 1 : 0),
    [territoryFilter, stockClassFilter, statusFilter, customerFilter, repFilter, skuQuery],
  );

  const clearFilters = useCallback(() => {
    setTerritoryFilter("all");
    setStockClassFilter("all");
    setStatusFilter("all");
    setCustomerFilter("all");
    setSkuQuery("");
    setRepFilter("all");
  }, []);

  const drillRows = useMemo<typeof filteredDetail>(() => {
    if (!drill) return [];
    if (drill.kind === "stockClass") {
      if (drill.code === "__ALL__") return filteredDetail;
      return filteredDetail.filter((r) => {
        const code = r.stockClass && r.stockClass !== "N/A" ? r.stockClass : "Unclassified";
        return code === drill.code;
      });
    }
    return filteredDetail.filter(
      (r) => (r.customer ?? "").toLowerCase() === drill.customer.toLowerCase(),
    );
  }, [drill, filteredDetail]);

  const drillTotal = useMemo(
    () => drillRows.reduce((s, r) => s + (r.openBalance || 0), 0),
    [drillRows],
  );

  if (drill) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setDrill(null)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to summary
            </Button>
            <div>
              <h4 className="text-sm font-semibold">
                {drill.kind === "stockClass"
                  ? `${drill.label} (${drill.code})`
                  : drill.customer}
              </h4>
              <p className="text-xs text-muted-foreground">
                {drillRows.length} line{drillRows.length === 1 ? "" : "s"} Â·{" "}
                <span className="font-medium text-foreground">{fmtMoney(drillTotal)}</span> open balance
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Customer</label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {allCustomers.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">SKU / Search</label>
              <Input
                className="h-8 w-[180px] text-xs"
                placeholder="SKU, item, customer..."
                value={skuQuery}
                onChange={(e) => setSkuQuery(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Rep</label>
              <Select value={repFilter} onValueChange={setRepFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue placeholder="All reps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reps</SelectItem>
                  {allReps.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Territory</label>
              <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="All territories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All territories</SelectItem>
                  {allTerritories.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeFilterCount > 0 && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
        <BacklogOrderTable rows={drillRows} showCustomer={drill.kind === "stockClass"} showStockClass={drill.kind === "customer"} />

      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Territory</label>
          <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="All territories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All territories</SelectItem>
              {allTerritories.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Stock Class</label>
          <Select value={stockClassFilter} onValueChange={setStockClassFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {allStockClasses.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="Cleared">Cleared</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {activeFilterCount > 0 && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearFilters}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {liveOrders.length > 0 ? (
            <>Live Acctivate Â· <span className="font-medium text-foreground">{new Set(liveOrders.map((o) => o.order_number).filter(Boolean)).size.toLocaleString()} open orders</span></>
          ) : liveLoading ? (
            <>Loading open orders--¦</>
          ) : (
            <>Snapshot as of{" "}
              <span className="font-medium text-foreground">
                {new Date(data.asOf).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </span>
            </>
          )}
        </div>

      </div>

      {/* Stock Class breakdown */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Backlog by Stock Class</h4>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setDrill({ kind: "stockClass", code: "__ALL__", label: "All open sales orders" })}
          >
            View all open sales orders ({new Set(filteredDetail.map((r) => r.num).filter(Boolean)).size.toLocaleString()})
          </Button>
        </div>
        <div className="overflow-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-right px-3 py-2">Open $</th>
                <th className="text-right px-3 py-2">% of total</th>
              </tr>
            </thead>
            <tbody>
              {filteredStockClasses.map((c) => (
                <tr
                  key={c.code}
                  className="border-t border-border hover:bg-muted/40 cursor-pointer"
                  onClick={() => setDrill({ kind: "stockClass", code: c.code, label: c.description })}
                >
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded text-[11px] font-medium",
                        STOCK_CLASS_TONE[c.code] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {c.code}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(c.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {filteredTotalBacklog > 0 ? ((c.total / filteredTotalBacklog) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              ))}
              {filteredStockClasses.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No rows match the current filters.
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Total Open Backlog
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(filteredTotalBacklog)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

export const BACKLOG_SUMMARY_TOTAL = data.stockClasses.reduce((s, c) => s + c.total, 0);

type OrderRow = DetailRow & { territory: string; status: string };

function BacklogOrderTable({
  rows,
  showCustomer,
  showStockClass,
}: {
  rows: OrderRow[];
  showCustomer: boolean;
  showStockClass: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; orderNum: string; lines: OrderRow[] }>();
    for (const r of rows) {
      const key = String(r.num ?? `__no-num-${r.customer}-${r.item}`);
      const entry = map.get(key) ?? { key, orderNum: r.num != null ? String(r.num) : "---", lines: [] };
      entry.lines.push(r);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [rows]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const colCount = 3 + (showCustomer ? 1 : 0) + 2 + (showStockClass ? 1 : 0) + 2;

  return (
    <div className="overflow-auto max-h-[60vh] border border-border rounded-md">
      <table className="w-full text-sm">
        <thead className="bg-background text-xs uppercase tracking-wide text-muted-foreground sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
          <tr>
            <th className="w-8" />
            <th className="text-left px-3 py-2">Order #</th>
            {showCustomer && <th className="text-left px-3 py-2">Customer</th>}
            <th className="text-left px-3 py-2">Rep</th>
            <th className="text-left px-3 py-2">Territory</th>
            <th className="text-left px-3 py-2">Ship Date</th>
            {showStockClass && <th className="text-left px-3 py-2">Class</th>}
            <th className="text-right px-3 py-2">Lines</th>
            <th className="text-right px-3 py-2">Open Bal</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => {
            const first = g.lines[0];
            const total = g.lines.reduce((s, l) => s + (l.openBalance || 0), 0);
            const earliestShip = g.lines
              .map((l) => l.shipDate)
              .filter(Boolean)
              .sort()[0] ?? null;
            const isOpen = expanded.has(g.key);
            return (
              <Fragment key={g.key}>
                <tr
                  className="border-t border-border hover:bg-muted/40 cursor-pointer"
                  onClick={() => toggle(g.key)}
                >
                  <td className="px-2 py-2 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{g.orderNum}</td>
                  {showCustomer && (
                    <td className="px-3 py-2 max-w-[180px] truncate">{first.customer}</td>
                  )}
                  <td className="px-3 py-2 text-xs">{first.rep ?? "---"}</td>
                  <td className="px-3 py-2 text-xs">{first.territory}</td>
                  <td className="px-3 py-2 text-xs">
                    {earliestShip ? new Date(earliestShip).toLocaleDateString() : "---"}
                  </td>
                  {showStockClass && (
                    <td className="px-3 py-2">
                      {first.stockClass ? (
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 rounded text-[10px] font-medium",
                            STOCK_CLASS_TONE[first.stockClass] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {first.stockClass}
                        </span>
                      ) : (
                        "---"
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                    {g.lines.length}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(total)}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-muted/20">
                    <td />
                    <td colSpan={colCount - 1} className="px-3 py-2">
                      <table className="w-full text-xs">
                        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="text-left py-1 pr-3">Item</th>
                            <th className="text-left py-1 pr-3 max-w-[280px]">Description</th>
                            <th className="text-left py-1 pr-3">Class</th>
                            <th className="text-left py-1 pr-3">Ship Date</th>
                            <th className="text-right py-1 pr-3">Amount</th>
                            <th className="text-right py-1">Open Bal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.lines.map((l, i) => (
                            <tr key={i} className="border-t border-border/50">
                              <td className="py-1 pr-3 font-mono">{l.item ?? "---"}</td>
                              <td className="py-1 pr-3 max-w-[280px] truncate text-muted-foreground">
                                {l.description ?? "---"}
                              </td>
                              <td className="py-1 pr-3">
                                {l.stockClass ? (
                                  <span
                                    className={cn(
                                      "inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium",
                                      STOCK_CLASS_TONE[l.stockClass] ?? "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {l.stockClass}
                                  </span>
                                ) : (
                                  "---"
                                )}
                              </td>
                              <td className="py-1 pr-3">
                                {l.shipDate ? new Date(l.shipDate).toLocaleDateString() : "---"}
                              </td>
                              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(l.amount)}</td>
                              <td className="py-1 text-right tabular-nums font-medium">
                                {fmtMoney(l.openBalance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {grouped.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-3 py-8 text-center text-sm text-muted-foreground">
                No orders match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

