import { useEffect, useMemo, useState } from "react";
import {
  startOfWeek, endOfWeek, subWeeks, addWeeks, format,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Package, Users,
  TrendingDown, DollarSign, ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// --------- Types ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

interface SalesRow {
  sku: string;
  product_name: string | null;
  qty_sold: number;
  revenue: number;
  rep_name: string | null;
  import_filename: string | null;
  import_id: string;
}

interface RepSkuRow {
  sku: string;
  product: string;
  qty: number;
  revenue: number;
}

interface RepRow {
  rep: string;
  totalQty: number;
  totalRevenue: number;
  skus: RepSkuRow[];
}

interface ImportBatch {
  import_id: string;
  import_filename: string | null;
  rowCount: number;
  totalQty: number;
}

// --------- Helpers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function fmtWeekLabel(start: Date, end: Date) {
  return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
}

// --------- Page ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export default function ClearanceAnalyticsPage() {
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(anchor, { weekStartsOn: 1 });
  const weekLabel = fmtWeekLabel(weekStart, weekEnd);

  const [salesRows, setSalesRows]   = useState<SalesRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      setExpandedReps(new Set());
      const { data } = await (supabase as any)
        .from("clearance_weekly_sales")
        .select("sku, product_name, qty_sold, revenue, rep_name, import_filename, import_id")
        .gte("week_start", format(weekStart, "yyyy-MM-dd"))
        .lte("week_start", format(weekEnd, "yyyy-MM-dd"));
      setSalesRows((data as SalesRow[]) ?? []);
      setLoadingData(false);
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format(weekStart, "yyyy-MM-dd")]);

  const repRows = useMemo<RepRow[]>(() => {
    // Managers (by first name) are excluded from per-rep stats
    const MANAGER_NAMES = new Set(["will", "mateo", "chris"]);
    const agg: Record<string, { totalQty: number; totalRevenue: number; skus: Record<string, RepSkuRow> }> = {};
    for (const row of salesRows) {
      const rawRep = row.rep_name?.trim() || "Unattributed";
      if (MANAGER_NAMES.has(rawRep.toLowerCase())) continue;
      const rep = rawRep;
      const sku = row.sku;
      if (!agg[rep]) agg[rep] = { totalQty: 0, totalRevenue: 0, skus: {} };
      agg[rep].totalQty += row.qty_sold;
      agg[rep].totalRevenue += row.revenue;
      if (!agg[rep].skus[sku]) {
        agg[rep].skus[sku] = { sku, product: row.product_name ?? sku, qty: 0, revenue: 0 };
      }
      agg[rep].skus[sku].qty += row.qty_sold;
      agg[rep].skus[sku].revenue += row.revenue;
    }
    return Object.entries(agg)
      .sort(([, a], [, b]) => b.totalQty - a.totalQty)
      .map(([rep, d]) => ({
        rep,
        totalQty: d.totalQty,
        totalRevenue: d.totalRevenue,
        skus: Object.values(d.skus).sort((a, b) => b.qty - a.qty),
        expanded: expandedReps.has(rep),
      }));
  }, [salesRows, expandedReps]);

  const importBatches = useMemo<ImportBatch[]>(() => {
    const m: Record<string, ImportBatch> = {};
    for (const row of salesRows) {
      if (!m[row.import_id]) {
        m[row.import_id] = {
          import_id: row.import_id,
          import_filename: row.import_filename,
          rowCount: 0,
          totalQty: 0,
        };
      }
      m[row.import_id].rowCount++;
      m[row.import_id].totalQty += row.qty_sold;
    }
    return Object.values(m);
  }, [salesRows]);

  const summary = useMemo(() => ({
    totalUnits: repRows.reduce((s, r) => s + r.totalQty, 0),
    totalRevenue: repRows.reduce((s, r) => s + r.totalRevenue, 0),
    skusMoved: new Set(salesRows.map((r) => r.sku)).size,
    repsWithSales: repRows.length,
  }), [repRows, salesRows]);

  function toggleRep(rep: string) {
    setExpandedReps((prev) => {
      const next = new Set(prev);
      if (next.has(rep)) next.delete(rep); else next.add(rep);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Clearance Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Weekly clearance sales from imported CSV data, broken down by rep and SKU.
        </p>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setAnchor((d) => subWeeks(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums min-w-[230px] text-center">{weekLabel}</span>
        <Button
          variant="outline" size="sm" className="h-8 w-8 p-0"
          onClick={() => setAnchor((d) => addWeeks(d, 1))}
          disabled={weekEnd >= new Date()}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAnchor(new Date())}>
          This Week
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Package className="h-3 w-3" /> Units Sold
          </div>
          <p className="text-2xl font-semibold tabular-nums">{summary.totalUnits.toLocaleString()}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            <DollarSign className="h-3 w-3" /> Revenue
          </div>
          <p className="text-2xl font-semibold tabular-nums">
            ${summary.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            <TrendingDown className="h-3 w-3" /> SKUs Moved
          </div>
          <p className="text-2xl font-semibold tabular-nums">{summary.skusMoved}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Users className="h-3 w-3" /> Reps with Sales
          </div>
          <p className="text-2xl font-semibold tabular-nums">{summary.repsWithSales}</p>
        </Card>
      </div>

      {loadingData ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading sales data...</div>
      ) : repRows.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-muted-foreground text-sm">No clearance sales data for this week.</p>
          <p className="text-xs text-muted-foreground">
            Go to <strong>Clearance Products</strong> and import a CSV to see data here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Rep breakdown table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                      Rep
                    </th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                      SKUs
                    </th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                      Total Units
                    </th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                      Revenue
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {repRows.map((row) => (
                    <>
                      <tr
                        key={row.rep}
                        className="border-b border-border/40 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => toggleRep(row.rep)}
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{row.rep}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {row.skus.length}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {row.totalQty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ${row.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-2 py-3 text-muted-foreground">
                          {expandedReps.has(row.rep) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </td>
                      </tr>
                      {expandedReps.has(row.rep) &&
                        row.skus.map((sku) => (
                          <tr
                            key={`${row.rep}-${sku.sku}`}
                            className={cn("bg-muted/10 border-b border-border/20")}
                          >
                            <td className="pl-10 pr-4 py-2">
                              <div className="font-mono text-xs text-muted-foreground">{sku.sku}</div>
                              <div className="text-xs text-foreground mt-0.5 truncate max-w-[240px]">
                                {sku.product}
                              </div>
                            </td>
                            <td />
                            <td className="px-4 py-2 text-right tabular-nums text-sm">
                              {sku.qty.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-sm text-muted-foreground">
                              ${sku.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td />
                          </tr>
                        ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
