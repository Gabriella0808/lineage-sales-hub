import { Fragment, useEffect, useMemo, useState } from "react";
import {
  startOfWeek, endOfWeek, subWeeks, addWeeks, format,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Package, Users,
  TrendingDown, DollarSign, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// --------- Types ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

interface SalesRow {
  guid_invoice_detail: string;
  invoice_number:      string | null;
  sale_date:           string;
  week_start:          string | null;
  week_end:            string | null;
  rep_name:            string | null;
  rep_id:              string | null;
  sku:                 string;
  product:             string | null;
  product_class:       string | null;
  quantity_sold:       number;
  sales_amount:        number;
}

interface RepSkuRow {
  sku:           string;
  product:       string | null;
  product_class: string | null;
  qty:           number;
  revenue:       number;
}

interface RepRow {
  rep:          string;
  totalQty:     number;
  totalRevenue: number;
  skus:         RepSkuRow[];
}

// --------- Helpers ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function fmtWeekLabel(start: Date, end: Date) {
  return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// --------- Page -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export default function ClearanceAnalyticsPage() {
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const weekStart = startOfWeek(anchor, { weekStartsOn: 0 });
  const weekEnd   = endOfWeek(anchor,   { weekStartsOn: 0 });
  const weekLabel = useMemo(() => fmtWeekLabel(weekStart, weekEnd), [weekStart, weekEnd]);

  const [salesRows, setSalesRows]       = useState<SalesRow[]>([]);
  const [loadingData, setLoadingData]   = useState(true);
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  useEffect(() => {
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr   = format(weekEnd,   "yyyy-MM-dd");

    console.log("[clearance-analytics]", { weekStart: weekStartStr, weekEnd: weekEndStr });

    async function load() {
      setLoadingData(true);
      setExpandedReps(new Set());

      const { data, error } = await (supabase as any)
        .from("v_portal_clearance_sales_analytics")
        .select("guid_invoice_detail, invoice_number, sale_date, week_start, week_end, rep_name, rep_id, sku, product, product_class, quantity_sold, sales_amount")
        .gte("sale_date", weekStartStr)
        .lte("sale_date", weekEndStr);

      if (error) {
        console.error("[clearance-analytics] v_portal_clearance_sales_analytics fetch failed:", error.message, error);
        setSalesRows([]);
        setLoadingData(false);
        return;
      }

      const rows = ((data ?? []) as any[]).map((r: any) => ({
        ...r,
        quantity_sold: Number(r.quantity_sold) || 0,
        sales_amount:  Number(r.sales_amount)  || 0,
      })) as SalesRow[];

      const totalUnits   = rows.reduce((s, r) => s + r.quantity_sold, 0);
      const totalRevenue = rows.reduce((s, r) => s + r.sales_amount,  0);

      console.log("[clearance-analytics] rows fetched:", rows.length, "· units:", totalUnits, "· revenue:", totalRevenue);

      if (rows.length > 0) {
        const dates = rows.map((r) => r.sale_date).sort();
        console.log("[clearance-analytics] sale_date range:", { min: dates[0], max: dates[dates.length - 1] });
      }

      setSalesRows(rows);
      setLoadingData(false);
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")]);

  const repRows = useMemo<RepRow[]>(() => {
    const MANAGER_NAMES = new Set(["will", "mateo", "chris"]);
    const agg: Record<string, { totalQty: number; totalRevenue: number; skus: Record<string, RepSkuRow> }> = {};
    for (const row of salesRows) {
      const rawRep = row.rep_name?.trim() || "Unattributed";
      if (MANAGER_NAMES.has(rawRep.toLowerCase())) continue;
      const rep = rawRep;
      const sku = row.sku;
      if (!agg[rep]) agg[rep] = { totalQty: 0, totalRevenue: 0, skus: {} };
      agg[rep].totalQty     += Number(row.quantity_sold) || 0;
      agg[rep].totalRevenue += Number(row.sales_amount)  || 0;
      if (!agg[rep].skus[sku]) {
        agg[rep].skus[sku] = {
          sku,
          product:       row.product       ?? null,
          product_class: row.product_class ?? null,
          qty:     0,
          revenue: 0,
        };
      }
      agg[rep].skus[sku].qty     += Number(row.quantity_sold) || 0;
      agg[rep].skus[sku].revenue += Number(row.sales_amount)  || 0;
    }
    return Object.entries(agg)
      .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
      .map(([rep, d]) => ({
        rep,
        totalQty:     d.totalQty,
        totalRevenue: d.totalRevenue,
        skus: Object.values(d.skus).sort((a, b) => b.revenue - a.revenue),
      }));
  }, [salesRows]);

  const summary = useMemo(() => ({
    totalUnits:    repRows.reduce((s, r) => s + r.totalQty,     0),
    totalRevenue:  repRows.reduce((s, r) => s + r.totalRevenue, 0),
    skusMoved:     new Set(salesRows.map((r) => r.sku)).size,
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
          Discontinued product sales broken down by rep and SKU.
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
            <DollarSign className="h-3 w-3" /> Gross Revenue
          </div>
          <p className="text-2xl font-semibold tabular-nums">{fmtCurrency(summary.totalRevenue)}</p>
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
      ) : salesRows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">
            No discontinued product sales found for this week.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Rep</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">SKUs</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Total Units</th>
                    <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Gross Revenue</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {repRows.map((row) => (
                    <Fragment key={row.rep}>
                      <tr
                        className="border-b border-border/40 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => toggleRep(row.rep)}
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{row.rep}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.skus.length}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{row.totalQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtCurrency(row.totalRevenue)}</td>
                        <td className="px-2 py-3 text-muted-foreground">
                          {expandedReps.has(row.rep) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </td>
                      </tr>
                      {expandedReps.has(row.rep) &&
                        row.skus.map((sku) => (
                          <tr key={`${row.rep}-${sku.sku}`} className={cn("bg-muted/10 border-b border-border/20")}>
                            <td className="pl-10 pr-4 py-2" colSpan={2}>
                              <div className="font-mono text-xs text-muted-foreground">{sku.sku}</div>
                              {sku.product && (
                                <div className="text-xs text-foreground mt-0.5 truncate max-w-[240px]">{sku.product}</div>
                              )}
                              {sku.product_class && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">{sku.product_class}</div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-sm">{sku.qty.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-sm text-muted-foreground">{fmtCurrency(sku.revenue)}</td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-muted/20">
                    <td className="px-4 py-3 font-semibold text-foreground" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-foreground">{fmtCurrency(summary.totalRevenue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
