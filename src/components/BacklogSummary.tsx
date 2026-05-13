import { useMemo, useState, useCallback } from "react";
import { ArrowLeft, AlertTriangle, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import backlogData from "@/data/backlogSummary.json";

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

// Rep → territory mapping (from DB). Falls back to rep name if unknown.
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

  // Derive territory for every detail row
  const detailWithTerritory = useMemo(() => {
    return data.detail.map((r) => ({
      ...r,
      territory: getTerritory(r.rep),
      status: (r.openBalance || 0) !== 0 ? "Open" : "Cleared",
    }));
  }, []);

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
      if (stockClassFilter !== "all" && r.stockClass !== stockClassFilter) return false;
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

  // Recompute summary tables from filtered detail
  const filteredStockClasses = useMemo(() => {
    const totals = new Map<string, { code: string; description: string; total: number }>();
    for (const r of filteredDetail) {
      if (!r.stockClass || r.stockClass === "N/A") continue;
      const desc = data.stockClasses.find((s) => s.code === r.stockClass)?.description ?? r.stockClass;
      const entry = totals.get(r.stockClass) ?? { code: r.stockClass, description: desc, total: 0 };
      entry.total += Math.abs(r.openBalance || 0);
      totals.set(r.stockClass, entry);
    }
    return Array.from(totals.values());
  }, [filteredDetail]);

  const filteredTotalBacklog = useMemo(
    () => filteredStockClasses.reduce((s, c) => s + c.total, 0),
    [filteredStockClasses],
  );

  const activeFilterCount = useMemo(
    () => [territoryFilter, stockClassFilter, statusFilter].filter((f) => f !== "all").length,
    [territoryFilter, stockClassFilter, statusFilter],
  );

  const clearFilters = useCallback(() => {
    setTerritoryFilter("all");
    setStockClassFilter("all");
    setStatusFilter("all");
  }, []);

  const drillRows = useMemo<typeof filteredDetail>(() => {
    if (!drill) return [];
    if (drill.kind === "stockClass") {
      return filteredDetail.filter((r) => r.stockClass === drill.code);
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
                {drillRows.length} line{drillRows.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium text-foreground">{fmtMoney(drillTotal)}</span> open balance
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
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
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Stock Class</label>
              <Select value={stockClassFilter} onValueChange={setStockClassFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {data.stockClasses.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
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
          </div>
        </div>
        <div className="overflow-auto max-h-[60vh] border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Order #</th>
                {drill.kind === "stockClass" && <th className="text-left px-3 py-2">Customer</th>}
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-left px-3 py-2 max-w-[300px]">Description</th>
                <th className="text-left px-3 py-2">Rep</th>
                <th className="text-left px-3 py-2">Territory</th>
                <th className="text-left px-3 py-2">Ship Date</th>
                {drill.kind === "customer" && <th className="text-left px-3 py-2">Class</th>}
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-right px-3 py-2">Open Bal</th>
              </tr>
            </thead>
            <tbody>
              {drillRows.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{r.num ?? "—"}</td>
                  {drill.kind === "stockClass" && (
                    <td className="px-3 py-2 max-w-[180px] truncate">{r.customer}</td>
                  )}
                  <td className="px-3 py-2 font-mono text-xs">{r.item ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[300px] truncate text-xs text-muted-foreground">
                    {r.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.rep ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.territory}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.shipDate ? new Date(r.shipDate).toLocaleDateString() : "—"}
                  </td>
                  {drill.kind === "customer" && (
                    <td className="px-3 py-2">
                      {r.stockClass ? (
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 rounded text-[10px] font-medium",
                            STOCK_CLASS_TONE[r.stockClass] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {r.stockClass}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {fmtMoney(r.openBalance)}
                  </td>
                </tr>
              ))}
              {drillRows.length === 0 && (
                <tr>
                  <td colSpan={drill.kind === "stockClass" ? 10 : 9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No detail rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
              {data.stockClasses.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
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
          Backlog as of{" "}
          <span className="font-medium text-foreground">
            {new Date(data.asOf).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Stock Class breakdown */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Backlog by Stock Class</h4>
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

      {/* Problem Orders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Problem Orders
          </h4>
        </div>
        <div className="overflow-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Customer</th>
                <th className="text-right px-3 py-2">Open $</th>
                <th className="text-left px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.problemOrders.map((p) => (
                <tr
                  key={p.customer}
                  className="border-t border-border hover:bg-muted/40 cursor-pointer"
                  onClick={() => setDrill({ kind: "customer", customer: p.customer })}
                >
                  <td className="px-3 py-2 font-medium">{p.customer}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(p.amount)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[480px]">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discussion Points */}
      {data.discussionPoints.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent" />
            Discussion Points
          </h4>
          <div className="grid gap-2 md:grid-cols-2">
            {data.discussionPoints.map((d) => (
              <div
                key={d.customer}
                className="border border-border rounded-md p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setDrill({ kind: "customer", customer: d.customer })}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium">{d.customer}</span>
                  <Badge variant="secondary" className="text-[10px]">discuss</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{d.notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const BACKLOG_SUMMARY_TOTAL = data.stockClasses.reduce((s, c) => s + c.total, 0);
