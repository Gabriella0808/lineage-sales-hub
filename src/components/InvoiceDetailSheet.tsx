import { useState, useEffect, useMemo, type ReactNode } from "react";
import { format, startOfDay } from "date-fns";
import { isBookingVisibleDate, BOOKINGS_VISIBLE_FROM } from "@/utils/bookingCutoff";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/hooks/usePortalData";

// ── Shared line type (matches v_portal_dealer_rep_reporting_lines columns) ────

export interface ViewLine {
  metric_type:      string;
  transaction_date: string;
  dealer_name:      string | null;
  rep_name:         string | null;
  sku:              string | null;
  description:      string | null;
  brand_category:   string | null;
  amount:           number;
  invoice_number:   string | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupBy: "dealer" | "rep" | "territory";
  rowKey: string;      // dealer_name | rep_name | territory_name
  rowLabel: string;
  from: Date;
  to: Date;
  compareFrom?: Date;
  compareTo?: Date;
  viewLines: ViewLine[];
  metric: "bookings" | "invoices";
  /** When provided, detail lines are fetched lazily on sheet open instead of
   *  filtering the in-memory viewLines.  Used in RPC / Total-display mode. */
  fetchLines?: (params: { limit: number; offset: number }) => Promise<ViewLine[]>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesRow(l: ViewLine, groupBy: Props["groupBy"], rowKey: string): boolean {
  if (rowKey === "" || rowKey === "Unassigned") return false; // can't reliably filter unassigned
  if (groupBy === "dealer") return (l.dealer_name ?? "") === rowKey;
  if (groupBy === "rep")    return (l.rep_name    ?? "") === rowKey;
  return false; // territory: name not available in view without lookup
}

function filterLines(
  viewLines: ViewLine[],
  groupBy: Props["groupBy"],
  rowKey: string,
  fromMs: number,
  toMs: number,
  metricType: string,
): ViewLine[] {
  return viewLines.filter((l) => {
    if (l.metric_type !== metricType) return false;
    if (metricType === "bookings" && !isBookingVisibleDate(l.transaction_date)) return false;
    const ms = new Date(l.transaction_date + "T00:00:00").getTime();
    if (Number.isNaN(ms) || ms < fromMs || ms > toMs) return false;
    return matchesRow(l, groupBy, rowKey);
  });
}

function sumAmount(lines: ViewLine[]): number {
  return lines.reduce((s, l) => s + Number(l.amount), 0);
}

function groupBySku(lines: ViewLine[]) {
  const map = new Map<string, { sku: string; desc: string; total: number }>();
  for (const l of lines) {
    const k = l.sku ?? "-";
    const cur = map.get(k) ?? { sku: k, desc: l.description ?? k, total: 0 };
    cur.total += Number(l.amount);
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function groupByBrandCat(lines: ViewLine[]) {
  const map = new Map<string, number>();
  for (const l of lines) {
    const k = l.brand_category ?? "Unknown";
    map.set(k, (map.get(k) ?? 0) + Number(l.amount));
  }
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DETAIL_PAGE = 200;

export function InvoiceDetailSheet({
  open, onOpenChange, groupBy, rowKey, rowLabel,
  from, to, compareFrom, compareTo, viewLines, fetchLines, metric,
}: Props) {
  // ── Lazy-load state (RPC / Total mode) ──────────────────────────────────────
  const [lazyLines,   setLazyLines]   = useState<ViewLine[]>([]);
  const [lazyLoading, setLazyLoading] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);

  useEffect(() => {
    if (!open || !fetchLines) {
      if (!open) { setLazyLines([]); setHasMore(false); }
      return;
    }
    let cancelled = false;
    setLazyLoading(true);
    setLazyLines([]);
    setHasMore(false);
    fetchLines({ limit: DETAIL_PAGE, offset: 0 }).then((rows) => {
      if (cancelled) return;
      setLazyLines(rows);
      setHasMore(rows.length === DETAIL_PAGE);
      setLazyLoading(false);
    }).catch(() => { if (!cancelled) setLazyLoading(false); });
    return () => { cancelled = true; };
  }, [open, fetchLines]);

  const handleLoadMore = async () => {
    if (!fetchLines || lazyLoading) return;
    setLazyLoading(true);
    const rows = await fetchLines({ limit: DETAIL_PAGE, offset: lazyLines.length }).catch(() => []);
    setLazyLines((prev) => [...prev, ...rows]);
    setHasMore(rows.length === DETAIL_PAGE);
    setLazyLoading(false);
  };

  // ── Line mode (Monthly / territory) ─────────────────────────────────────────
  const primFromMs = useMemo(() => startOfDay(from).getTime(), [from]);
  const primToMs   = useMemo(() => startOfDay(to).getTime(),   [to]);
  const compFromMs = useMemo(() => compareFrom ? startOfDay(compareFrom).getTime() : 0, [compareFrom]);
  const compToMs   = useMemo(() => compareTo   ? startOfDay(compareTo).getTime()   : 0, [compareTo]);
  const hasCompare = !!(compareFrom && compareTo) && !fetchLines;

  const compLabel: ReactNode = hasCompare ? (
    <>vs {format(compareFrom!, "MMM d, yyyy")} – {format(compareTo!, "MMM d, yyyy")}</>
  ) : null;

  const primInvoiced = useMemo(() =>
    fetchLines ? [] : filterLines(viewLines, groupBy, rowKey, primFromMs, primToMs, "invoiced"),
  [fetchLines, viewLines, groupBy, rowKey, primFromMs, primToMs]);

  const primBookings = useMemo(() =>
    fetchLines ? [] : filterLines(viewLines, groupBy, rowKey, primFromMs, primToMs, "bookings"),
  [fetchLines, viewLines, groupBy, rowKey, primFromMs, primToMs]);

  const compInvoiced = useMemo(() =>
    hasCompare ? filterLines(viewLines, groupBy, rowKey, compFromMs, compToMs, "invoiced") : [],
  [viewLines, groupBy, rowKey, compFromMs, compToMs, hasCompare]);

  const compBookings = useMemo(() =>
    hasCompare ? filterLines(viewLines, groupBy, rowKey, compFromMs, compToMs, "bookings") : [],
  [viewLines, groupBy, rowKey, compFromMs, compToMs, hasCompare]);

  const primInvoicedTotal = useMemo(() => sumAmount(primInvoiced), [primInvoiced]);
  const primBookingsTotal = useMemo(() => sumAmount(primBookings),  [primBookings]);
  const compInvoicedTotal = useMemo(() => sumAmount(compInvoiced), [compInvoiced]);
  const compBookingsTotal = useMemo(() => sumAmount(compBookings),  [compBookings]);

  // The "active" lines for breakdowns: lazy lines (RPC mode) or filtered lines (line mode).
  const activeMetricType = metric === "bookings" ? "bookings" : "invoiced";
  const primActive = fetchLines
    ? lazyLines
    : (activeMetricType === "bookings" ? primBookings : primInvoiced);
  const compActive = activeMetricType === "bookings" ? compBookings : compInvoiced;

  const bySku         = useMemo(() => groupBySku(primActive),      [primActive]);
  const byBrandCat    = useMemo(() => groupByBrandCat(primActive), [primActive]);
  const compBySkuMap  = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of groupBySku(compActive)) m.set(r.sku, r.total);
    return m;
  }, [compActive]);
  const compByBrandCatMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of groupByBrandCat(compActive)) m.set(r.label, r.total);
    return m;
  }, [compActive]);

  const noData = fetchLines
    ? (!lazyLoading && lazyLines.length === 0)
    : (primInvoiced.length === 0 && primBookings.length === 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{rowLabel}</SheetTitle>
          <SheetDescription>
            Detail · {format(from, "MMM d, yyyy")} – {format(to, "MMM d, yyyy")}
            {hasCompare && (
              <span className="block text-[11px] mt-0.5">
                vs {format(compareFrom!, "MMM d, yyyy")} – {format(compareTo!, "MMM d, yyyy")}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* ── Stat cards ── */}
        {fetchLines ? (
          // RPC / lazy mode: show only the active metric (no comparative available)
          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatCard
              label={metric === "invoices" ? "Invoiced" : "Bookings"}
              value={lazyLoading && lazyLines.length === 0 ? "…" : formatCurrency(sumAmount(lazyLines))}
            />
            <StatCard
              label="Lines"
              value={lazyLoading && lazyLines.length === 0 ? "…" : lazyLines.length.toLocaleString() + (hasMore ? "+" : "")}
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatCard
              label="Invoiced"
              value={formatCurrency(primInvoicedTotal)}
              compValue={hasCompare ? formatCurrency(compInvoicedTotal) : undefined}
              compLabel={compLabel ?? undefined}
              delta={hasCompare ? pctDelta(primInvoicedTotal, compInvoicedTotal) : undefined}
            />
            <StatCard
              label="Bookings"
              value={to < new Date(BOOKINGS_VISIBLE_FROM) ? "—" : formatCurrency(primBookingsTotal)}
              compValue={hasCompare ? (compareTo! < new Date(BOOKINGS_VISIBLE_FROM) ? "—" : formatCurrency(compBookingsTotal)) : undefined}
              compLabel={compLabel ?? undefined}
              delta={hasCompare && to >= new Date(BOOKINGS_VISIBLE_FROM) && compareTo! >= new Date(BOOKINGS_VISIBLE_FROM) ? pctDelta(primBookingsTotal, compBookingsTotal) : undefined}
            />
            <StatCard
              label="Lines"
              value={primActive.length.toLocaleString()}
              compValue={hasCompare ? compActive.length.toLocaleString() : undefined}
              compLabel={compLabel ?? undefined}
              delta={hasCompare ? pctDelta(primActive.length, compActive.length) : undefined}
            />
          </div>
        )}

        {lazyLoading && lazyLines.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">Loading detail…</p>
        )}

        {noData && !lazyLoading && (
          <p className="mt-6 text-sm text-muted-foreground">
            No invoice detail found for this selection and date range.
          </p>
        )}

        {!noData && !lazyLoading && (
          <div className="mt-6 space-y-6">
            {byBrandCat.length > 0 && (
              <Section title="By Brand / Category" count={byBrandCat.length}>
                <BreakdownTable
                  rows={byBrandCat.map((r) => ({ label: r.label, total: r.total, comp: compByBrandCatMap.get(r.label) }))}
                  showComp={hasCompare}
                  compLabel={compLabel ?? undefined}
                />
              </Section>
            )}

            {bySku.length > 0 && (
              <Section title="By SKU" count={bySku.length}>
                <BreakdownTable
                  rows={bySku.map((r) => ({ label: r.sku, sublabel: r.desc !== r.sku ? r.desc : undefined, total: r.total, comp: compBySkuMap.get(r.sku) }))}
                  showComp={hasCompare}
                  compLabel={compLabel ?? undefined}
                />
              </Section>
            )}

            {fetchLines && hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={lazyLoading}
                className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md transition-colors disabled:opacity-50"
              >
                {lazyLoading ? "Loading…" : `Load more (showing ${lazyLines.length})`}
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, compValue, compLabel, delta }: {
  label: string;
  value: string;
  compValue?: string;
  compLabel?: ReactNode;
  delta?: number | null;
}) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {compValue !== undefined && (
        <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
          {compLabel ?? "vs"} {compValue}
          {delta !== null && delta !== undefined && (
            <span className={`ml-1 ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
            </span>
          )}
        </p>
      )}
    </CardContent></Card>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary" className="text-[10px] h-5">{count}</Badge>
      </div>
      {children}
    </div>
  );
}

function BreakdownTable({ rows, showComp, compLabel }: {
  rows: { label: string; sublabel?: string; total: number; comp?: number }[];
  showComp?: boolean;
  compLabel?: ReactNode;
}) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">-</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b text-muted-foreground">
          <th className="py-1 text-left font-normal">Name</th>
          <th className="py-1 text-right font-normal">Amount</th>
          {showComp && (
            <>
              <th className="py-1 text-right font-normal">{compLabel ?? "vs"}</th>
              <th className="py-1 text-right font-normal">Δ</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 50).map((r, i) => {
          const delta = showComp && r.comp ? ((r.total - r.comp) / r.comp) * 100 : null;
          return (
            <tr key={`${r.label}-${i}`} className="border-b last:border-0">
              <td className="py-1.5">
                <span>{r.label}</span>
                {r.sublabel && <span className="block text-[10px] text-muted-foreground truncate max-w-[200px]">{r.sublabel}</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.total)}</td>
              {showComp && (
                <>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.comp !== undefined ? formatCurrency(r.comp) : "-"}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums text-[10px] ${delta === null ? "text-muted-foreground" : delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {delta === null ? "-" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                  </td>
                </>
              )}
            </tr>
          );
        })}
        <tr className="border-t font-semibold">
          <td className="py-1.5">Total</td>
          <td className="py-1.5 text-right tabular-nums">{formatCurrency(rows.reduce((s, r) => s + r.total, 0))}</td>
          {showComp && (
            <>
              <td className="py-1.5 text-right tabular-nums">
                {formatCurrency(rows.reduce((s, r) => s + (r.comp ?? 0), 0))}
              </td>
              <td />
            </>
          )}
        </tr>
      </tbody>
    </table>
  );
}
