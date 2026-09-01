import { Fragment, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Download, Package, Truck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useOpenSOCalendar, type CalendarEvent, type MonthSummary } from "@/hooks/useOpenSOCalendar";

// ── Formatters ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtQty(n: number): string {
  return n.toLocaleString() + "u";
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── CSV Export ─────────────────────────────────────────────────────────────────

function exportCsv(events: CalendarEvent[], filename: string) {
  const headers = [
    "event_type","event_date","source_doc_number","dealer_name","vendor_name",
    "container_number","sku","description","qty","amount","warehouse","status","rep_name",
  ];
  const rows = [headers.join(",")];
  for (const e of events) {
    const vals = [
      e.event_type, e.event_date ?? "", e.source_doc_number ?? "",
      e.dealer_name ?? "", e.vendor_name ?? "", e.container_number ?? "",
      e.sku ?? "", (e.description ?? "").replace(/,/g, ";"),
      e.qty, e.amount.toFixed(2),
      e.warehouse ?? "", e.status ?? "", e.rep_name ?? "",
    ];
    rows.push(vals.map(v => `"${v}"`).join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Month detail drawer ────────────────────────────────────────────────────────

function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.event_date ?? "Unscheduled";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a < b ? -1 : 1;
    })
  );
}

function SODetailTable({ events }: { events: CalendarEvent[] }) {
  const grouped = useMemo(() => groupByDate(events), [events]);
  if (events.length === 0) return (
    <p className="text-xs text-muted-foreground py-6 text-center">No open SO ship dates this month.</p>
  );
  return (
    <div className="overflow-auto max-h-[55vh]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background shadow-[0_1px_0_hsl(var(--border))]">
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-3 py-2">Ship Date</th>
            <th className="text-left px-3 py-2">Order #</th>
            <th className="text-left px-3 py-2">Dealer</th>
            <th className="text-left px-3 py-2">Rep</th>
            <th className="text-left px-3 py-2">SKU</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Amount</th>
            <th className="text-left px-3 py-2">Class</th>
            <th className="text-left px-3 py-2">WH</th>
          </tr>
        </thead>
        <tbody>
          {[...grouped.entries()].map(([date, rows]) => (
            <Fragment key={date}>
              <tr className="bg-muted/30">
                <td colSpan={9} className="px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                  {date === "Unscheduled" ? "Unscheduled" : fmtDate(date)}
                  <span className="ml-2 font-normal">
                    {rows.length} line{rows.length !== 1 ? "s" : ""} · {fmtMoney(rows.reduce((s,r) => s+r.amount, 0))}
                  </span>
                </td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-1.5 tabular-nums">{fmtDate(r.event_date)}</td>
                  <td className="px-3 py-1.5 font-mono">{r.source_doc_number ?? "—"}</td>
                  <td className="px-3 py-1.5 max-w-[160px] truncate">{r.dealer_name ?? r.customer_id ?? "—"}</td>
                  <td className="px-3 py-1.5 max-w-[120px] truncate text-muted-foreground">{r.rep_name ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.sku ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{(r as any).detail_json?.stock_class ?? r.warehouse?.substring(0,4) ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.warehouse ?? "—"}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold">
            <td colSpan={5} className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{events.reduce((s,r) => s+r.qty, 0).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(events.reduce((s,r) => s+r.amount, 0))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function POArrivalTable({ events }: { events: CalendarEvent[] }) {
  const grouped = useMemo(() => groupByDate(events), [events]);
  if (events.length === 0) return (
    <p className="text-xs text-muted-foreground py-6 text-center">No open PO arrivals / container ETAs this month.</p>
  );
  return (
    <div className="overflow-auto max-h-[55vh]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background shadow-[0_1px_0_hsl(var(--border))]">
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-3 py-2">ETA / Receipt</th>
            <th className="text-left px-3 py-2">PO #</th>
            <th className="text-left px-3 py-2">Vendor</th>
            <th className="text-left px-3 py-2">Container</th>
            <th className="text-left px-3 py-2">SKU</th>
            <th className="text-right px-3 py-2">Qty Open</th>
            <th className="text-right px-3 py-2">Open Amt</th>
            <th className="text-left px-3 py-2">WH</th>
            <th className="text-left px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {[...grouped.entries()].map(([date, rows]) => (
            <Fragment key={date}>
              <tr className="bg-muted/30">
                <td colSpan={9} className="px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                  {date === "Unscheduled" ? "Unscheduled" : fmtDate(date)}
                  <span className="ml-2 font-normal">
                    {rows.length} line{rows.length !== 1 ? "s" : ""} · {fmtMoney(rows.reduce((s,r) => s+r.amount, 0))}
                  </span>
                </td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-1.5 tabular-nums">{fmtDate(r.event_date)}</td>
                  <td className="px-3 py-1.5 font-mono">{r.source_doc_number ?? "—"}</td>
                  <td className="px-3 py-1.5 max-w-[160px] truncate">{r.vendor_name ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.container_number ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.sku ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.warehouse ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.status ?? "—"}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold">
            <td colSpan={5} className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{events.reduce((s,r) => s+r.qty, 0).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(events.reduce((s,r) => s+r.amount, 0))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function POInvoiceTable({ events }: { events: CalendarEvent[] }) {
  const grouped = useMemo(() => groupByDate(events), [events]);
  if (events.length === 0) return (
    <p className="text-xs text-muted-foreground py-6 text-center">No PO invoice dates this month.</p>
  );
  return (
    <div className="overflow-auto max-h-[55vh]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background shadow-[0_1px_0_hsl(var(--border))]">
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-3 py-2">Invoice Due</th>
            <th className="text-left px-3 py-2">PO #</th>
            <th className="text-left px-3 py-2">Vendor</th>
            <th className="text-left px-3 py-2">Container</th>
            <th className="text-left px-3 py-2">SKU</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Amount</th>
            <th className="text-left px-3 py-2">WH</th>
            <th className="text-left px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {[...grouped.entries()].map(([date, rows]) => (
            <Fragment key={date}>
              <tr className="bg-muted/30">
                <td colSpan={9} className="px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                  {date === "Unscheduled" ? "Unscheduled" : fmtDate(date)}
                  <span className="ml-2 font-normal">
                    {rows.length} line{rows.length !== 1 ? "s" : ""} · {fmtMoney(rows.reduce((s,r) => s+r.amount, 0))}
                  </span>
                </td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-1.5 tabular-nums">{fmtDate(r.event_date)}</td>
                  <td className="px-3 py-1.5 font-mono">{r.source_doc_number ?? "—"}</td>
                  <td className="px-3 py-1.5 max-w-[160px] truncate">{r.vendor_name ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.container_number ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.sku ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.warehouse ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.status ?? "—"}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold">
            <td colSpan={5} className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{events.reduce((s,r) => s+r.qty, 0).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(events.reduce((s,r) => s+r.amount, 0))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Month card ─────────────────────────────────────────────────────────────────

function MonthCard({
  summary, onClick, isSelected,
}: {
  summary: MonthSummary | undefined;
  monthIndex: number; // 1-based
  monthName: string;
  onClick: () => void;
  isSelected: boolean;
}) {
  const empty = !summary || (
    summary.so_count === 0 && summary.po_arrival_count === 0 && summary.po_invoice_count === 0
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left w-full rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/30",
        isSelected ? "border-primary bg-accent/40 ring-1 ring-primary/40" : "border-border bg-card",
        empty && "opacity-50",
      )}
    >
      {empty ? (
        <p className="text-xs text-muted-foreground py-2 text-center">No activity</p>
      ) : (
        <div className="space-y-2">
          {/* Open SOs */}
          {(summary?.so_count ?? 0) > 0 && (
            <div className="flex items-start gap-1.5">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground font-medium">Ship</div>
                <div className="text-xs font-semibold tabular-nums">{fmtMoney(summary!.so_amount)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{fmtQty(summary!.so_qty)} · {summary!.so_doc_count} SO{summary!.so_doc_count !== 1 ? "s" : ""}</div>
              </div>
            </div>
          )}
          {/* PO arrivals */}
          {(summary?.po_arrival_count ?? 0) > 0 && (
            <div className="flex items-start gap-1.5">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground font-medium">PO In</div>
                <div className="text-xs font-semibold tabular-nums">{fmtMoney(summary!.po_arrival_amount)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{fmtQty(summary!.po_arrival_qty)} · {summary!.po_arrival_doc_count} PO{summary!.po_arrival_doc_count !== 1 ? "s" : ""}</div>
              </div>
            </div>
          )}
          {/* PO invoices */}
          {(summary?.po_invoice_count ?? 0) > 0 && (
            <div className="flex items-start gap-1.5">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground font-medium">~Invoice</div>
                <div className="text-xs font-semibold tabular-nums">{fmtMoney(summary!.po_invoice_amount)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{fmtQty(summary!.po_invoice_qty)} · {summary!.po_invoice_doc_count} PO{summary!.po_invoice_doc_count !== 1 ? "s" : ""}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </button>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

type Filters = {
  warehouse: string;
  rep: string;
  dealer: string;
  vendor: string;
  status: string;
  eventType: string;
};

function applyFilters(events: CalendarEvent[], f: Filters): CalendarEvent[] {
  return events.filter((e) => {
    if (f.eventType !== "all"  && e.event_type !== f.eventType)       return false;
    if (f.warehouse !== "all"  && e.warehouse  !== f.warehouse)        return false;
    if (f.rep       !== "all"  && e.rep_name   !== f.rep)              return false;
    if (f.dealer    !== "all"  && e.dealer_name !== f.dealer)          return false;
    if (f.vendor    !== "all"  && e.vendor_name !== f.vendor)          return false;
    if (f.status    !== "all"  && e.status      !== f.status)          return false;
    return true;
  });
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OpenOrdersCalendar() {
  const currentYear = new Date().getFullYear();
  const [year, setYear]               = useState(currentYear);
  const [selectedMonth, setSelected]  = useState<number | null>(null); // 1-based
  const [filters, setFilters]         = useState<Filters>({
    warehouse: "all", rep: "all", dealer: "all", vendor: "all",
    status: "all", eventType: "all",
  });

  const { events, loading, error, syncedAt, monthSummaries, yearTotals } = useOpenSOCalendar(year);

  // Derive filter options from loaded events
  const filterOpts = useMemo(() => ({
    warehouses: [...new Set(events.map(e => e.warehouse).filter(Boolean) as string[])].sort(),
    reps:       [...new Set(events.map(e => e.rep_name).filter(Boolean) as string[])].sort(),
    dealers:    [...new Set(events.map(e => e.dealer_name).filter(Boolean) as string[])].sort(),
    vendors:    [...new Set(events.map(e => e.vendor_name).filter(Boolean) as string[])].sort(),
    statuses:   [...new Set(events.map(e => e.status).filter(Boolean) as string[])].sort(),
  }), [events]);

  const filteredEvents = useMemo(() => applyFilters(events, filters), [events, filters]);

  // Recompute monthly summaries after filtering (shared logic with hook but for filtered data)
  const filteredMonthSummaries = useMemo<Map<number, MonthSummary>>(() => {
    const map = new Map<number, MonthSummary>();
    const getOrCreate = (m: number): MonthSummary => {
      if (!map.has(m)) map.set(m, {
        year, month: m,
        so_count: 0, so_qty: 0, so_amount: 0, so_doc_count: 0,
        po_arrival_count: 0, po_arrival_qty: 0, po_arrival_amount: 0, po_arrival_doc_count: 0,
        po_invoice_count: 0, po_invoice_qty: 0, po_invoice_amount: 0, po_invoice_doc_count: 0,
      });
      return map.get(m)!;
    };
    const soDocs = new Map<number, Set<string>>();
    const parrDocs = new Map<number, Set<string>>();
    const pinvDocs = new Map<number, Set<string>>();

    for (const e of filteredEvents) {
      const m = e.month ?? 0;
      const s = getOrCreate(m);
      const doc = e.source_doc_number ?? "?";
      if (e.event_type === "open_so_ship") {
        s.so_count++; s.so_qty += e.qty; s.so_amount += e.amount;
        if (!soDocs.has(m)) soDocs.set(m, new Set());
        soDocs.get(m)!.add(doc); s.so_doc_count = soDocs.get(m)!.size;
      } else if (e.event_type === "open_po_arrival") {
        s.po_arrival_count++; s.po_arrival_qty += e.qty; s.po_arrival_amount += e.amount;
        if (!parrDocs.has(m)) parrDocs.set(m, new Set());
        parrDocs.get(m)!.add(doc); s.po_arrival_doc_count = parrDocs.get(m)!.size;
      } else if (e.event_type === "po_invoice_due") {
        s.po_invoice_count++; s.po_invoice_qty += e.qty; s.po_invoice_amount += e.amount;
        if (!pinvDocs.has(m)) pinvDocs.set(m, new Set());
        pinvDocs.get(m)!.add(doc); s.po_invoice_doc_count = pinvDocs.get(m)!.size;
      }
    }
    return map;
  }, [filteredEvents, year]);

  // Events for selected month
  const monthEvents = useMemo(() => {
    if (selectedMonth === null) return [];
    return filteredEvents.filter(e => e.month === selectedMonth);
  }, [filteredEvents, selectedMonth]);

  const hasFilters = Object.values(filters).some(v => v !== "all");
  const clearFilters = () => setFilters({ warehouse: "all", rep: "all", dealer: "all", vendor: "all", status: "all", eventType: "all" });

  const isEmpty = !loading && !error && events.length === 0;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year nav */}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setYear(y => y - 1); setSelected(null); }}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-sm font-semibold tabular-nums w-12 text-center">{year}</span>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setYear(y => y + 1); setSelected(null); }}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Filters */}
        {filterOpts.warehouses.length > 0 && (
          <Select value={filters.warehouse} onValueChange={v => setFilters(f => ({...f, warehouse: v}))}>
            <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="All warehouses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {filterOpts.warehouses.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filterOpts.reps.length > 0 && (
          <Select value={filters.rep} onValueChange={v => setFilters(f => ({...f, rep: v}))}>
            <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="All reps" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {filterOpts.reps.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filters.eventType} onValueChange={v => setFilters(f => ({...f, eventType: v}))}>
          <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="All event types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            <SelectItem value="open_so_ship">Open SOs (ship)</SelectItem>
            <SelectItem value="open_po_arrival">PO arrivals</SelectItem>
            <SelectItem value="po_invoice_due">PO invoice due</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearFilters}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}

        {/* Export + sync status */}
        <div className="ml-auto flex items-center gap-2">
          {syncedAt && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Synced {new Date(syncedAt).toLocaleDateString()}
            </span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => exportCsv(filteredEvents, `so_po_calendar_${year}.csv`)}>
            <Download className="h-3 w-3" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Year totals bar */}
      {!loading && !isEmpty && (
        <div className="flex flex-wrap gap-4 py-2 border-b border-border/50 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Open SOs to ship:</span>
            <span className="font-semibold tabular-nums">{fmtMoney(yearTotals.so_amount)}</span>
            <span className="text-muted-foreground">· {fmtQty(yearTotals.so_qty)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">PO arrivals:</span>
            <span className="font-semibold tabular-nums">{fmtMoney(yearTotals.po_arrival_amount)}</span>
            <span className="text-muted-foreground">· {fmtQty(yearTotals.po_arrival_qty)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">~PO invoices:</span>
            <span className="font-semibold tabular-nums">{fmtMoney(yearTotals.po_invoice_amount)}</span>
            <span className="text-muted-foreground">· {fmtQty(yearTotals.po_invoice_qty)}</span>
          </div>
        </div>
      )}

      {/* State: loading / error / empty */}
      {loading && (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading calendar data...</div>
      )}
      {error && (
        <div className="py-8 text-center text-sm text-destructive">Failed to load calendar: {error}</div>
      )}
      {isEmpty && !loading && (
        <div className="py-10 text-center">
          <p className="text-sm text-muted-foreground">No open orders for {year}</p>
        </div>
      )}

      {/* Month grid */}
      {!loading && !isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {MONTH_NAMES.map((name, i) => {
            const m = i + 1;
            return (
              <div key={m}>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5 px-0.5">{name}</div>
                <MonthCard
                  summary={filteredMonthSummaries.get(m)}
                  monthIndex={m}
                  monthName={name}
                  onClick={() => setSelected(selectedMonth === m ? null : m)}
                  isSelected={selectedMonth === m}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Unscheduled bucket */}
      {!loading && filteredMonthSummaries.has(0) && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1.5">Unscheduled</div>
          <MonthCard
            summary={filteredMonthSummaries.get(0)}
            monthIndex={0}
            monthName="Unscheduled"
            onClick={() => setSelected(selectedMonth === 0 ? null : 0)}
            isSelected={selectedMonth === 0}
          />
        </div>
      )}

      {/* Month detail */}
      {selectedMonth !== null && monthEvents.length > 0 && (
        <Card className="mt-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div>
              <h4 className="text-sm font-semibold">
                {selectedMonth === 0 ? "Unscheduled" : `${MONTH_NAMES[selectedMonth - 1]} ${year}`}
              </h4>
              <p className="text-xs text-muted-foreground">
                {monthEvents.length} line{monthEvents.length !== 1 ? "s" : ""} across all event types
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => exportCsv(monthEvents, `${selectedMonth === 0 ? "unscheduled" : MONTH_NAMES[selectedMonth-1].toLowerCase()}_${year}.csv`)}>
                <Download className="h-3 w-3" /> Export month
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelected(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Tabs defaultValue="so" className="px-4 pt-3 pb-4">
            <TabsList className="mb-3">
              <TabsTrigger value="so" className="gap-1.5 text-xs">
                <Package className="h-3 w-3 text-blue-500" />
                Open SOs
                {(filteredMonthSummaries.get(selectedMonth)?.so_count ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                    {fmtMoney(filteredMonthSummaries.get(selectedMonth)!.so_amount)}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="po_arrival" className="gap-1.5 text-xs">
                <Truck className="h-3 w-3 text-emerald-500" />
                PO Arrivals
                {(filteredMonthSummaries.get(selectedMonth)?.po_arrival_count ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                    {fmtMoney(filteredMonthSummaries.get(selectedMonth)!.po_arrival_amount)}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="po_invoice" className="gap-1.5 text-xs">
                <FileText className="h-3 w-3 text-amber-500" />
                ~PO Invoices
                {(filteredMonthSummaries.get(selectedMonth)?.po_invoice_count ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                    {fmtMoney(filteredMonthSummaries.get(selectedMonth)!.po_invoice_amount)}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="so">
              <SODetailTable events={monthEvents.filter(e => e.event_type === "open_so_ship")} />
            </TabsContent>
            <TabsContent value="po_arrival">
              <POArrivalTable events={monthEvents.filter(e => e.event_type === "open_po_arrival")} />
            </TabsContent>
            <TabsContent value="po_invoice">
              <POInvoiceTable events={monthEvents.filter(e => e.event_type === "po_invoice_due")} />
            </TabsContent>
          </Tabs>
        </Card>
      )}
    </div>
  );
}
