import { useMemo, useState, useEffect } from "react";
import { getReportingToday } from "@/utils/reportingDate";
import { useQuery } from "@tanstack/react-query";
import {
  format, startOfYear, endOfMonth, subYears, subMonths, startOfMonth, startOfDay,
  startOfQuarter, subDays, addDays, differenceInCalendarDays,
} from "date-fns";
import {
  RotateCcw, X, FileText, ShoppingCart, Hash, Users2, Calculator,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useDealers, useSalesReps, useTerritories, useRepTerritories,
  formatCurrency,
} from "@/hooks/usePortalData";
import { useRepTargets, TARGET_MONTHS, type RepTarget } from "@/hooks/useRepTargets";
import { BOOKINGS_VISIBLE_FROM, isBookingVisibleDate } from "@/utils/bookingCutoff";

// Booking data is only trusted from this date onwards.
// Used to clamp query start dates before any fetch — not applied post-aggregation.
const BOOKING_CUTOFF_DATE = new Date(BOOKINGS_VISIBLE_FROM + "T00:00:00");
import { InvoiceDetailSheet, type ViewLine } from "@/components/InvoiceDetailSheet";

// ── Types ─────────────────────────────────────────────────────────────────────

type GroupBy = "dealer" | "rep" | "territory";
type Metric  = "bookings" | "invoices";
type Display = "total" | "monthly";

interface DateRange { from: Date; to: Date }

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── View row type ─────────────────────────────────────────────────────────────

type DealerRepLine = {
  metric_type:      string;
  transaction_date: string;
  year:             number;
  month_number:     number;
  dealer_name:      string | null;
  customer_id:      string | null;
  rep_name:         string | null;
  rep_id:           string | null;
  sku:              string | null;
  description:      string | null;
  brand_category:   string | null;
  product_class:    string | null;
  amount:           number;
  invoice_number:   string | null;
};

// ── Data hooks ────────────────────────────────────────────────────────────────

// PostgREST's default max-rows is 1000. PAGE_SIZE matches it so the loop
// terminates correctly. Invoiced and bookings are separate queries filtered by
// metric_type so neither crowds out the other within the 1000-row budget.
const PAGE_SIZE = 1000;

async function fetchPortalLinesByType(
  from: Date,
  to: Date,
  metricType: "invoiced" | "bookings",
): Promise<DealerRepLine[]> {
  const fromStr = format(from,           "yyyy-MM-dd");
  const toExcl  = format(addDays(to, 1), "yyyy-MM-dd");
  const rows: DealerRepLine[] = [];
  let start = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await (supabase as any)
      .from("v_portal_dealer_rep_reporting_lines")
      .select("metric_type, transaction_date, year, month_number, dealer_name, customer_id, rep_name, rep_id, sku, description, brand_category, product_class, amount, invoice_number")
      .eq("metric_type", metricType)
      .gte("transaction_date", fromStr)
      .lt("transaction_date", toExcl)
      .range(start, start + PAGE_SIZE - 1);
    if (error) {
      console.error(`[dealer-rep] ${metricType} fetch failed:`, error.message, error);
      break;
    }
    const batch = ((data ?? []) as any[]).map((r) => ({
      ...r,
      amount:       Number(r.amount) || 0,
      year:         Number(r.year),
      month_number: Number(r.month_number),
    })) as DealerRepLine[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  console.log(`[dealer-rep] ${metricType} fetched ${rows.length} rows (${fromStr}→${toExcl})`);
  return rows;
}

function usePortalInvoicedLines(from: Date, to: Date, enabled = true) {
  const fromStr = format(from,           "yyyy-MM-dd");
  const toExcl  = format(addDays(to, 1), "yyyy-MM-dd");
  return useQuery({
    queryKey: ["v_portal_invoiced_lines_v1", fromStr, toExcl],
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
    queryFn: () => fetchPortalLinesByType(from, to, "invoiced"),
  });
}

function usePortalBookingLines(from: Date, to: Date, enabled = true) {
  const fromStr = format(from,           "yyyy-MM-dd");
  const toExcl  = format(addDays(to, 1), "yyyy-MM-dd");
  return useQuery({
    queryKey: ["v_portal_booking_lines_v1", fromStr, toExcl],
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
    queryFn: () => fetchPortalLinesByType(from, to, "bookings"),
  });
}

// ── Server-aggregated data (Total display) ────────────────────────────────────

interface GroupedRow {
  entity_key:    string;
  primary_amt:   number;
  primary_lines: number;
  comp_amt:      number;
  comp_lines:    number;
}

interface GroupedRowsParams {
  metric:      "invoiced" | "bookings";
  groupBy:     "dealer" | "rep";
  from:        Date;
  to:          Date;
  compFrom:    Date | null;
  compTo:      Date | null;
  customerIds: string[] | null;
  brandCats:   string[] | null;
  skus:        string[] | null;
  repIds:      string[] | null;  // lowercase Acctivate rep_ids for canonical rep filter
  managerId:   string | null;    // managers.id UUID; null = company-wide
}

function useGroupedRows(params: GroupedRowsParams, enabled: boolean) {
  return useQuery({
    queryKey: [
      "sales_grouped_rows_v2",
      params.metric,
      params.groupBy,
      format(params.from, "yyyy-MM-dd"),
      format(params.to,   "yyyy-MM-dd"),
      params.compFrom ? format(params.compFrom, "yyyy-MM-dd") : null,
      params.compTo   ? format(params.compTo,   "yyyy-MM-dd") : null,
      JSON.stringify(params.customerIds),
      JSON.stringify(params.brandCats),
      JSON.stringify(params.skus),
      JSON.stringify(params.repIds),
      params.managerId,
    ],
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<GroupedRow[]> => {
      const { data, error } = await (supabase as any).rpc(
        "get_sales_reporting_grouped_rows",
        {
          p_metric:       params.metric,
          p_group_by:     params.groupBy,
          p_from:         format(params.from, "yyyy-MM-dd"),
          p_to:           format(params.to,   "yyyy-MM-dd"),
          p_comp_from:    params.compFrom ? format(params.compFrom, "yyyy-MM-dd") : null,
          p_comp_to:      params.compTo   ? format(params.compTo,   "yyyy-MM-dd") : null,
          p_customer_ids: params.customerIds ?? null,
          p_brand_cats:   params.brandCats   ?? null,
          p_skus:         params.skus        ?? null,
          p_rep_ids:      params.repIds      ?? null,
          p_manager_id:   params.managerId   ?? null,
        },
      );
      if (error) {
        console.error("[sales-reporting] grouped rows fetch failed:", error.message, error);
        return [];
      }
      return ((data ?? []) as any[]).map((r) => ({
        entity_key:    String(r.entity_key ?? ""),
        primary_amt:   Number(r.primary_amt)   || 0,
        primary_lines: Number(r.primary_lines) || 0,
        comp_amt:      Number(r.comp_amt)      || 0,
        comp_lines:    Number(r.comp_lines)    || 0,
      }));
    },
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function MultiSelect({
  label, options, selected, onChange, disabled, disabledReason, searchable, searchPlaceholder,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  disabledReason?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const summary = selected.length === 0 ? "All" : selected.length === 1
    ? options.find((o) => o.value === selected[0])?.label ?? "1 selected"
    : `${selected.length} selected`;

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query, searchable]);

  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-9 justify-between font-normal"
            title={disabled ? disabledReason : undefined}
          >
            <span className="truncate">{summary}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          {searchable && (
            <div className="p-2 border-b">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}...`}
                className="w-full h-8 text-xs px-2 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto p-2 space-y-1">
            <div className="flex gap-1">
              <button
                onClick={() => onChange([])}
                className="flex-1 text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-primary"
              >
                Clear (All)
              </button>
              <button
                onClick={() => onChange(filteredOptions.map((o) => o.value))}
                className="text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-primary whitespace-nowrap"
              >
                Select All
              </button>
            </div>
            {filteredOptions.map((o) => {
              const isOn = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => onChange(isOn ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                  className={cn(
                    "w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 hover:bg-muted",
                    isOn && "bg-primary/10 text-primary",
                  )}
                >
                  <span className={cn("w-3 h-3 shrink-0 rounded-sm border", isOn ? "bg-primary border-primary" : "border-muted-foreground/40")} />
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">{query ? "No matches" : "No options"}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DateRangePicker({ label, value, onChange, onReset }: { label: string; value: DateRange; onChange: (v: DateRange) => void; onReset?: () => void }) {
  const [draft, setDraft] = useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const display = draft ?? { from: value.from, to: value.to };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); setDraft(o ? { from: undefined, to: undefined } : undefined); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 justify-start font-normal min-w-[220px]">
            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
            {format(value.from, "MMM d, yyyy")} – {format(value.to, "MMM d, yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={display.from ? { from: display.from, to: display.to } : undefined}
            onSelect={(r) => {
              if (r?.from && r?.to) {
                onChange({ from: r.from, to: r.to });
                setDraft({ from: r.from, to: r.to });
              } else if (r?.from) {
                setDraft({ from: r.from });
              } else {
                setDraft(undefined);
              }
            }}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
          {onReset && (
            <div className="flex justify-end gap-2 border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { onReset(); setDraft(undefined); setOpen(false); }}
              >
                Reset
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function monthsInRange(range: DateRange): { year: number; monthIdx: number; key: string; label: string }[] {
  const out: { year: number; monthIdx: number; key: string; label: string }[] = [];
  const cur = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  const end = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const mi = cur.getMonth();
    out.push({
      year: y, monthIdx: mi,
      key: `${y}-${MONTH_NAMES[mi]}`,
      label: `${MONTH_NAMES[mi].slice(0, 3)} ${String(y).slice(-2)}`,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// ── FilterChip ────────────────────────────────────────────────────────────────

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground/70">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-0.5 hover:text-foreground transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── SegmentedControl ──────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  value, onChange, options, size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-[var(--radius)] border border-border overflow-hidden">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "font-medium transition-colors whitespace-nowrap",
            size === "md" ? "px-5 py-2 text-sm" : "px-3.5 py-1.5 text-[13px]",
            i > 0 && "border-l border-border",
            value === opt.value
              ? "bg-foreground text-background"
              : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, muted,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.FC<{ className?: string }>;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
          <Icon className="h-3.5 w-3.5 text-muted-foreground/35 shrink-0 mt-0.5" />
        </div>
        <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", muted && "text-muted-foreground")}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground/70 mt-1.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="p-6 space-y-3 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-4 bg-muted rounded flex-1" style={{ opacity: 1 - i * 0.1 }} />
          <div className="h-4 bg-muted rounded w-28" style={{ opacity: 1 - i * 0.1 }} />
          <div className="h-4 bg-muted rounded w-24" style={{ opacity: 1 - i * 0.1 }} />
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  groupBy: GroupBy;
  managerScopeRepIds?: string[] | null;
  groupByOptions?: GroupBy[];
  managerId?: string | null;
}

export function SalesReporting({ groupBy: initialGroupBy, managerScopeRepIds, groupByOptions, managerId }: Props) {
  const today = getReportingToday();

  const [groupBy, setGroupBy]         = useState<GroupBy>(initialGroupBy);
  // Default primary to YTD because Display defaults to "total"
  const [primary, setPrimary]         = useState<DateRange>({ from: startOfYear(today), to: today });
  const [comparative, setComparative] = useState<DateRange>({
    from: subYears(startOfYear(today), 1),
    to:   subYears(today, 1),
  });
  type CompareMode = "prev-year" | "prev-period" | "custom" | "none";
  const [compareMode, setCompareMode] = useState<CompareMode>("prev-year");
  const [metric,  setMetric]  = useState<Metric>("invoices");
  const [display, setDisplay] = useState<Display>("total");
  const [drillRow, setDrillRow] = useState<{ key: string; label: string } | null>(null);

  // When switching display modes, auto-sync the primary range so that
  // Total always opens on YTD and Monthly always opens on the current month.
  const handleDisplayChange = (newDisplay: Display) => {
    setDisplay(newDisplay);
    if (metric === "invoices") {
      const now = getReportingToday();
      applyPrimary(newDisplay === "total" ? startOfYear(now) : startOfMonth(now), now);
    }
  };

  const applyPrimary = (from: Date, to: Date, mode: CompareMode = compareMode) => {
    setPrimary({ from, to });
    if (mode === "prev-year") {
      setComparative({ from: subYears(from, 1), to: subYears(to, 1) });
    } else if (mode === "prev-period") {
      const days    = differenceInCalendarDays(to, from) + 1;
      const prevTo  = subDays(from, 1);
      setComparative({ from: subDays(prevTo, days - 1), to: prevTo });
    }
  };

  // ── Filter state ──────────────────────────────────────────────────────────

  const [territoryIds,    setTerritoryIds]    = useState<string[]>([]);
  const [repIds,          setRepIds]          = useState<string[]>([]);
  const [dealerIds,       setDealerIds]       = useState<string[]>([]);
  const [brandCategories, setBrandCategories] = useState<string[]>([]);
  const [skus,            setSkus]            = useState<string[]>([]);

  // ── Portal reference data ─────────────────────────────────────────────────

  const { data: dealers        = [] } = useDealers();
  const { data: reps           = [] } = useSalesReps();
  const { data: territories    = [] } = useTerritories();
  const { data: repTerritories = [] } = useRepTerritories();
  // Fetch targets for whichever year the primary range ends in (follows the user's date filter).
  const { data: repYearTargets = [] } = useRepTargets(primary.to.getFullYear());

  // acctivate_id (lowercase) → rep_targets row for goal % computation.
  // Join key: sales_reps.id (portal UUID) === rep_targets.rep_id
  const repAcIdToTarget = useMemo(() => {
    const map = new Map<string, RepTarget>();
    for (const rep of reps) {
      if (!rep.acctivate_id) continue;
      const target = repYearTargets.find((t) => t.rep_id === rep.id);
      if (target) map.set(rep.acctivate_id.trim().toLowerCase(), target);
    }
    console.log("[goals] SalesReporting repAcIdToTarget", {
      year: primary.to.getFullYear(),
      reps_with_acctivate_id: reps.filter(r => r.acctivate_id).length,
      rep_targets_loaded: repYearTargets.length,
      matched: map.size,
      unmatched_reps: reps
        .filter(r => r.acctivate_id && !map.has(r.acctivate_id.trim().toLowerCase()))
        .map(r => ({ name: r.name, portal_id: r.id, acctivate_id: r.acctivate_id })),
      unmatched_targets: repYearTargets
        .filter(t => !reps.find(r => r.id === t.rep_id))
        .map(t => ({ rep_id: t.rep_id, annual: t.annual_target })),
    });
    return map;
  }, [reps, repYearTargets, primary.to]);

  // ── Fetch view data ───────────────────────────────────────────────────────

  // Use server-side RPC for Total display (dealer/rep groupBy).
  // Territory groupBy always uses line mode (needs customer_id → territory mapping).
  // Rep filter is handled via p_rep_ids parameter, no longer falls back to line mode.
  const useRpcMode = display === "total" && groupBy !== "territory";

  // Clamp booking fetch dates at the query level so Jan-Jul 2026 rows are never
  // fetched, aggregated, or counted.  effectiveFrom = max(selectedFrom, cutoff).
  // primBkEnabled = false when the entire selected range predates the cutoff.
  const primBkFrom    = primary.from    < BOOKING_CUTOFF_DATE ? BOOKING_CUTOFF_DATE : primary.from;
  const primBkEnabled = primary.to      >= BOOKING_CUTOFF_DATE;
  const compBkFrom    = comparative.from < BOOKING_CUTOFF_DATE ? BOOKING_CUTOFF_DATE : comparative.from;
  const compBkEnabled = comparative.to   >= BOOKING_CUTOFF_DATE;

  const { data: primaryInvoiced = [], isFetching: invFetching } = usePortalInvoicedLines(primary.from, primary.to, !useRpcMode);
  const { data: primaryBookings = [], isFetching: bkgFetching } = usePortalBookingLines(primBkFrom, primary.to, !useRpcMode && primBkEnabled);
  const { data: compInvoiced    = [] } = usePortalInvoicedLines(comparative.from, comparative.to, !useRpcMode && compareMode !== "none");
  const { data: compBookings    = [] } = usePortalBookingLines(compBkFrom, comparative.to, !useRpcMode && compareMode !== "none" && compBkEnabled);

  const primaryLines = metric === "invoices" ? primaryInvoiced : primaryBookings;
  const compLines    = metric === "invoices" ? compInvoiced      : compBookings;

  const repLines = useMemo(
    () => compareMode === "none" ? primaryLines : [...primaryLines, ...compLines],
    [primaryLines, compLines, compareMode],
  );

  // ── Hierarchical filter helpers ───────────────────────────────────────────

  const visibleReps = useMemo(() => {
    // Only show real Acctivate reps — entries without acctivate_id are pseudo-reps
    // (e.g., territories that were accidentally added to the sales_reps table).
    let list = reps.filter((r) => r.acctivate_id !== null && r.acctivate_id !== "");
    if (managerScopeRepIds) list = list.filter((r) => managerScopeRepIds.includes(r.id));
    if (territoryIds.length > 0) {
      const allowedRepIds = new Set(
        repTerritories.filter((rt) => territoryIds.includes(rt.territory_id)).map((rt) => rt.rep_id),
      );
      list = list.filter((r) => allowedRepIds.has(r.id));
    }
    return list;
  }, [reps, managerScopeRepIds, territoryIds, repTerritories]);

  const visibleDealers = useMemo(() => {
    let list = dealers;
    if (managerScopeRepIds) list = list.filter((d) => d.rep_id && managerScopeRepIds.includes(d.rep_id));
    if (territoryIds.length > 0) list = list.filter((d) => d.territory_id && territoryIds.includes(d.territory_id));
    if (repIds.length > 0)       list = list.filter((d) => d.rep_id && repIds.includes(d.rep_id));
    return list;
  }, [dealers, managerScopeRepIds, territoryIds, repIds]);

  // Customer IDs for the RPC p_customer_ids param: territory + dealer sub-filters only.
  // Manager scope is handled via p_manager_id — NOT included here.
  // Rep filter is excluded here because it is handled via p_rep_ids (canonical acctivate_id).
  // Values are lowercase to match the lower() SQL comparison in the RPCs.
  const rpcCustomerIds = useMemo<string[] | null>(() => {
    const hasFilter = territoryIds.length > 0 || dealerIds.length > 0;
    if (!hasFilter) return null;

    let list = dealers;
    if (territoryIds.length > 0) list = list.filter((d) => d.territory_id && territoryIds.includes(d.territory_id));
    if (dealerIds.length > 0)    list = list.filter((d) => dealerIds.includes(d.id));

    return list
      .map((d) => d.acctivate_id?.trim().toLowerCase())
      .filter((id): id is string => !!id);
  }, [territoryIds, dealerIds, dealers]);

  // Territory names for the selected territoryIds (for line-mode canonical filter).
  const selectedTerritoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const id of territoryIds) {
      const t = territories.find((t) => t.id === id);
      if (t) names.add(t.name);
    }
    return names;
  }, [territoryIds, territories]);

  // Acctivate customer_ids (lowercase) for the selected dealerIds.
  const selectedDealerAcIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of dealerIds) {
      const d = dealers.find((d) => d.id === id);
      if (d?.acctivate_id) ids.add(d.acctivate_id.trim().toLowerCase());
    }
    return ids;
  }, [dealerIds, dealers]);

  // Dealer names (lowercase) for the selected dealerIds — fallback when customer_id is absent.
  const selectedDealerNames = useMemo(() => {
    const names = new Set<string>();
    for (const id of dealerIds) {
      const d = dealers.find((d) => d.id === id);
      if (d?.name) names.add(d.name.trim().toLowerCase());
    }
    return names;
  }, [dealerIds, dealers]);

  // Diagnostic: log dealer filter resolution whenever selection changes.
  useEffect(() => {
    if (dealerIds.length === 0) return;
    const selected = dealerIds.map((id) => {
      const d = dealers.find((d) => d.id === id);
      return { portal_id: id, name: d?.name, acctivate_id: d?.acctivate_id };
    });
    console.log("[dealer-filter] selected dealers:", selected);
    console.log("[dealer-filter] selectedDealerAcIds:", Array.from(selectedDealerAcIds));
    console.log("[dealer-filter] rpcCustomerIds:", rpcCustomerIds);
  }, [dealerIds, dealers, selectedDealerAcIds, rpcCustomerIds]);

  // Manager-scope-only customer_id set for line-mode filtering.
  const managerScopeCustomerIds = useMemo<Set<string> | null>(() => {
    if (!managerScopeRepIds) return null;
    const list = dealers.filter((d) => d.rep_id && managerScopeRepIds.includes(d.rep_id));
    const ids = new Set<string>();
    for (const d of list) {
      if (d.acctivate_id) ids.add(d.acctivate_id.trim().toLowerCase());
    }
    return ids;
  }, [managerScopeRepIds, dealers]);

  const customerIdToTerritoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dealers) {
      if (!d.acctivate_id || !d.territory_id) continue;
      const t = territories.find((t) => t.id === d.territory_id);
      if (t) map.set(d.acctivate_id.trim().toLowerCase(), t.name);
    }
    return map;
  }, [dealers, territories]);

  // ── Canonical rep mapping (acctivate_id → full portal name) ─────────────
  // Enables matching "Brent" and "Brent Holbrook" lines to the same rep entity.

  const repAcIdToCanonical = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reps) {
      if (r.acctivate_id) map.set(r.acctivate_id.trim().toLowerCase(), r.name);
    }
    return map;
  }, [reps]);

  // Acctivate rep_ids (lowercase) for the currently selected portal reps.
  const selectedRepAcIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of repIds) {
      const rep = reps.find((r) => r.id === id);
      if (rep?.acctivate_id) ids.add(rep.acctivate_id.trim().toLowerCase());
    }
    return ids;
  }, [repIds, reps]);

  // ── Server-side grouped rows (RPC mode) ──────────────────────────────────

  const isBkMetric = metric === "bookings";
  const { data: groupedRows = [], isFetching: groupedFetching } = useGroupedRows(
    {
      metric:      isBkMetric ? "bookings" : "invoiced",
      groupBy:     (groupBy === "territory" ? "dealer" : groupBy) as "dealer" | "rep",
      from:        isBkMetric ? primBkFrom : primary.from,
      to:          primary.to,
      compFrom:    compareMode !== "none" ? (isBkMetric ? compBkFrom : comparative.from) : null,
      compTo:      compareMode !== "none" ? comparative.to : null,
      customerIds: rpcCustomerIds,
      brandCats:   brandCategories.length > 0 ? brandCategories : null,
      skus:        skus.length > 0 ? skus : null,
      repIds:      selectedRepAcIds.size > 0 ? Array.from(selectedRepAcIds) : null,
      managerId:   managerId ?? null,
    },
    useRpcMode && (!isBkMetric || primBkEnabled),
  );

  // Always-on bookings + invoiced rows for summary cards and drill-sheet header.
  // React Query deduplicates: when the active metric already matches, the cached
  // groupedRows result is returned — no extra network call.
  const rpcBase = {
    groupBy:     (groupBy === "territory" ? "dealer" : groupBy) as "dealer" | "rep",
    from:        primary.from,
    to:          primary.to,
    compFrom:    compareMode !== "none" ? comparative.from : null,
    compTo:      compareMode !== "none" ? comparative.to   : null,
    customerIds: rpcCustomerIds,
    brandCats:   brandCategories.length > 0 ? brandCategories : null,
    skus:        skus.length > 0 ? skus : null,
    repIds:      selectedRepAcIds.size > 0 ? Array.from(selectedRepAcIds) : null,
    managerId:   managerId ?? null,
  };
  const { data: bookingRows  = [] } = useGroupedRows(
    { ...rpcBase, metric: "bookings", from: primBkFrom, compFrom: compareMode !== "none" ? compBkFrom : null },
    useRpcMode && primBkEnabled,
  );
  const { data: invoicedRows = [] } = useGroupedRows({ ...rpcBase, metric: "invoiced" }, useRpcMode);

  // Fixed MTD + YTD per-rep actuals for goal % (only fetched in rep + RPC mode).
  // Reference date = end of primary range so the columns follow the user's period, not today.
  // Brand/SKU filters are excluded — goals are total per-rep, not per-brand.
  const rpcMetric = (metric === "invoices" ? "invoiced" : "bookings") as "invoiced" | "bookings";
  const goalQueryBase = {
    groupBy:     "rep" as const,
    customerIds: rpcCustomerIds,
    brandCats:   null,
    skus:        null,
    repIds:      selectedRepAcIds.size > 0 ? Array.from(selectedRepAcIds) : null,
    managerId:   managerId ?? null,
    compFrom:    null as null,
    compTo:      null as null,
  };
  const repMtdNaturalFrom = startOfMonth(primary.to);
  const repYtdNaturalFrom = startOfYear(primary.to);
  // Clamp booking goal-actual queries the same way as the table queries.
  const repMtdFrom = rpcMetric === "bookings" && repMtdNaturalFrom < BOOKING_CUTOFF_DATE
    ? BOOKING_CUTOFF_DATE : repMtdNaturalFrom;
  const repYtdFrom = rpcMetric === "bookings" && repYtdNaturalFrom < BOOKING_CUTOFF_DATE
    ? BOOKING_CUTOFF_DATE : repYtdNaturalFrom;
  const { data: repMtdRows = [] } = useGroupedRows(
    { ...goalQueryBase, metric: rpcMetric, from: repMtdFrom, to: primary.to },
    useRpcMode && groupBy === "rep" && (rpcMetric !== "bookings" || primBkEnabled),
  );
  const { data: repYtdRows = [] } = useGroupedRows(
    { ...goalQueryBase, metric: rpcMetric, from: repYtdFrom, to: primary.to },
    useRpcMode && groupBy === "rep" && (rpcMetric !== "bookings" || primBkEnabled),
  );

  // MTD % of goal + YTD % of goal per rep.
  // Month reference = primary.to's month (so it follows the date filter, not always today).
  // entity_key from the RPC is raw Acctivate rep_id — lowercase before map lookup.
  const repGoalMap = useMemo(() => {
    if (groupBy !== "rep") return new Map<string, { mtdPct: number | null; ytdPct: number | null }>();
    const refMonthIdx = primary.to.getMonth(); // 0 = Jan
    const refMonthKey = TARGET_MONTHS[refMonthIdx];
    const ytdKeys     = TARGET_MONTHS.slice(0, refMonthIdx + 1);
    const allKeys = new Set([...repMtdRows.map((r) => r.entity_key), ...repYtdRows.map((r) => r.entity_key)]);
    const map = new Map<string, { mtdPct: number | null; ytdPct: number | null }>();
    const debugRows: Array<{ entity_key: string; mtd_act: number; ytd_act: number; mtd_goal: number; ytd_goal: number; mtd_pct: string; ytd_pct: string }> = [];
    for (const key of allKeys) {
      const target = repAcIdToTarget.get(key.trim().toLowerCase());
      if (!target) continue;
      const mtdAct  = repMtdRows.find((r) => r.entity_key === key)?.primary_amt ?? 0;
      const ytdAct  = repYtdRows.find((r) => r.entity_key === key)?.primary_amt ?? 0;
      const mtdGoal = Number(target[refMonthKey as keyof RepTarget]) || 0;
      const ytdGoal = ytdKeys.reduce((s, k) => s + (Number(target[k as keyof RepTarget]) || 0), 0);
      map.set(key, {
        mtdPct: mtdGoal > 0 ? (mtdAct  / mtdGoal) * 100 : null,
        ytdPct: ytdGoal > 0 ? (ytdAct  / ytdGoal) * 100 : null,
      });
      debugRows.push({
        entity_key: key,
        mtd_act: Math.round(mtdAct),
        ytd_act: Math.round(ytdAct),
        mtd_goal: mtdGoal,
        ytd_goal: ytdGoal,
        mtd_pct: mtdGoal > 0 ? `${((mtdAct / mtdGoal) * 100).toFixed(1)}%` : "—",
        ytd_pct: ytdGoal > 0 ? `${((ytdAct / ytdGoal) * 100).toFixed(1)}%` : "—",
      });
    }
    const keysWithNoTarget = Array.from(allKeys).filter(k => !repAcIdToTarget.has(k.trim().toLowerCase()));
    console.group(`[goals] SalesReporting repGoalMap — ${metric} / ${primary.to.toISOString().slice(0,7)}`);
    console.log("scope:", { groupBy, metric, repIds: Array.from(selectedRepAcIds), managerId });
    console.log("entity_keys from RPC:", Array.from(allKeys));
    console.log("keys with no target match:", keysWithNoTarget);
    console.table(debugRows);
    console.groupEnd();
    return map;
  }, [groupBy, metric, primary.to, repMtdRows, repYtdRows, repAcIdToTarget, selectedRepAcIds, managerId]);

  // ── Filter options from view data ─────────────────────────────────────────

  const allBrandCategories = useMemo(() =>
    Array.from(new Set(repLines.map((l) =>
      l.brand_category ?? (l.metric_type === "invoiced" ? "Historical Invoice" : null)
    ).filter(Boolean) as string[])).sort(),
  [repLines]);

  const skuLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of repLines) {
      if (l.sku && !map.has(l.sku)) {
        map.set(l.sku, l.description ? `${l.sku} – ${l.description}` : l.sku);
      }
    }
    return map;
  }, [repLines]);

  const brandCategorySet = useMemo(() => new Set(brandCategories), [brandCategories]);
  const skuSet           = useMemo(() => new Set(skus),            [skus]);

  // Best display label for each customer_id, derived from actual line data.
  // Prefers a dealer_name that is not identical to the customer_id (a real name vs a code).
  const customerIdBestLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of repLines) {
      const cid = (line.customer_id ?? "").trim().toLowerCase();
      if (!cid) continue;
      const dname = (line.dealer_name ?? "").trim();
      if (!dname) continue;
      const existing = map.get(cid);
      const isCode = dname.toLowerCase() === cid;
      if (!existing) {
        map.set(cid, dname);
      } else if (!isCode && existing.toLowerCase() === cid) {
        // Replace a code-only label with a proper display name.
        map.set(cid, dname);
      }
    }
    return map;
  }, [repLines]);

  // ── Aggregation ───────────────────────────────────────────────────────────

  const aggregation = useMemo(() => {
    const primMonths = monthsInRange(primary);
    const compMonths = monthsInRange(comparative);
    const primFromMs = startOfDay(primary.from).getTime();
    const primToMs   = startOfDay(primary.to).getTime();
    const compFromMs = startOfDay(comparative.from).getTime();
    const compToMs   = startOfDay(comparative.to).getTime();

    const targetMetric = metric === "bookings" ? "bookings" : "invoiced";

    type Key = string;
    const rows = new Map<Key, { primary: number; comparative: number; byMonth: Map<string, number> }>();

    for (const line of repLines) {
      if (line.metric_type !== targetMetric) continue;
      // Jan–Jul 2026 booking actuals are not trusted; hide them everywhere in the portal.
      if (line.metric_type === "bookings" && !isBookingVisibleDate(line.transaction_date)) continue;

      // Manager scope (system-controlled, always via customer_id).
      if (managerScopeCustomerIds !== null) {
        const cid = (line.customer_id ?? "").trim().toLowerCase();
        if (!cid || !managerScopeCustomerIds.has(cid)) continue;
      }
      // Territory filter — canonical: look up line's customer_id in the territory map.
      if (selectedTerritoryNames.size > 0) {
        const cid = (line.customer_id ?? "").trim().toLowerCase();
        const terrName = cid ? customerIdToTerritoryName.get(cid) : undefined;
        if (!terrName || !selectedTerritoryNames.has(terrName)) continue;
      }
      // Rep filter — canonical acctivate_id matching regardless of groupBy.
      if (selectedRepAcIds.size > 0) {
        const repAcId = (line.rep_id ?? "").trim().toLowerCase();
        if (!repAcId || !selectedRepAcIds.has(repAcId)) continue;
      }
      // Dealer filter — by customer_id (acctivate_id) or dealer_name as fallback.
      if (selectedDealerAcIds.size > 0 || selectedDealerNames.size > 0) {
        const cid   = (line.customer_id ?? "").trim().toLowerCase();
        const dName = (line.dealer_name  ?? "").trim().toLowerCase();
        if (!(cid && selectedDealerAcIds.has(cid)) && !(dName && selectedDealerNames.has(dName))) continue;
      }

      const effectiveBrand = line.brand_category ??
        (line.metric_type === "invoiced" ? "Historical Invoice" : "");
      if (brandCategorySet.size > 0 && !brandCategorySet.has(effectiveBrand)) continue;
      if (skuSet.size > 0 && !skuSet.has(line.sku ?? "")) continue;

      const d  = new Date(line.transaction_date + "T00:00:00");
      const ms = d.getTime();
      if (Number.isNaN(ms)) continue;

      const inPrim = ms >= primFromMs && ms <= primToMs;
      const inComp = compareMode !== "none" && ms >= compFromMs && ms <= compToMs;
      if (!inPrim && !inComp) continue;

      let k: Key;
      if (groupBy === "dealer") {
        // Use customer_id as the canonical key so the same dealer is not split
        // into multiple rows when dealer_name differs between bookings and invoices.
        const cid = (line.customer_id ?? "").trim().toLowerCase();
        k = cid || (line.dealer_name ?? "").trim().toLowerCase() || "unknown";
      } else if (groupBy === "rep") {
        // Canonical name so "Brent" and "Brent Holbrook" lines share one row.
        const repAcId = (line.rep_id ?? "").trim().toLowerCase();
        k = (repAcId ? repAcIdToCanonical.get(repAcId) : undefined) ?? line.rep_name ?? line.rep_id ?? "Unassigned";
      } else {
        const cid = (line.customer_id ?? "").trim().toLowerCase();
        k = (cid ? customerIdToTerritoryName.get(cid) : undefined) ?? "Unassigned";
      }

      const val = line.amount;
      if (targetMetric === "bookings" && val === 0) continue;

      const monthKey = `${d.getFullYear()}-${MONTH_NAMES[d.getMonth()]}`;
      let row = rows.get(k);
      if (!row) { row = { primary: 0, comparative: 0, byMonth: new Map() }; rows.set(k, row); }
      if (inPrim) row.primary += val;
      if (inComp) row.comparative += val;
      row.byMonth.set(monthKey, (row.byMonth.get(monthKey) ?? 0) + val);
    }

    const sorted = Array.from(rows.entries())
      .map(([k, v]) => ({
        key: k,
        label: groupBy === "dealer"
          ? (customerIdBestLabel.get(k) ?? k)
          : (k === "Unassigned" ? "Unassigned" : k),
        ...v,
      }))
      .sort((a, b) => b.primary - a.primary);

    return { rows: sorted, primMonths, compMonths };
  }, [
    repLines, metric, primary, comparative, compareMode, groupBy,
    managerScopeCustomerIds, selectedTerritoryNames, selectedRepAcIds,
    selectedDealerAcIds, selectedDealerNames,
    repAcIdToCanonical, brandCategorySet, skuSet, customerIdToTerritoryName,
    customerIdBestLabel,
  ]);

  // ── Summary totals + KPI stats ────────────────────────────────────────────

  const summaryTotals = useMemo(() => {
    const scopeFilter = (line: DealerRepLine) => {
      if (managerScopeCustomerIds !== null) {
        const cid = (line.customer_id ?? "").trim().toLowerCase();
        if (!cid || !managerScopeCustomerIds.has(cid)) return false;
      }
      if (selectedTerritoryNames.size > 0) {
        const cid = (line.customer_id ?? "").trim().toLowerCase();
        const terrName = cid ? customerIdToTerritoryName.get(cid) : undefined;
        if (!terrName || !selectedTerritoryNames.has(terrName)) return false;
      }
      if (selectedRepAcIds.size > 0) {
        const repAcId = (line.rep_id ?? "").trim().toLowerCase();
        if (!repAcId || !selectedRepAcIds.has(repAcId)) return false;
      }
      if (selectedDealerAcIds.size > 0 || selectedDealerNames.size > 0) {
        const cid   = (line.customer_id ?? "").trim().toLowerCase();
        const dName = (line.dealer_name  ?? "").trim().toLowerCase();
        if (!(cid && selectedDealerAcIds.has(cid)) && !(dName && selectedDealerNames.has(dName))) return false;
      }
      const effectiveBrand = line.brand_category ??
        (line.metric_type === "invoiced" ? "Historical Invoice" : "");
      if (brandCategorySet.size > 0 && !brandCategorySet.has(effectiveBrand)) return false;
      if (skuSet.size > 0 && !skuSet.has(line.sku ?? "")) return false;
      if (line.metric_type === "bookings" && !isBookingVisibleDate(line.transaction_date)) return false;
      return true;
    };

    const entityKey = (line: DealerRepLine) => {
      if (groupBy === "dealer") {
        const cid = (line.customer_id ?? "").trim().toLowerCase();
        return cid || (line.dealer_name ?? "").trim().toLowerCase();
      }
      if (groupBy === "rep") {
        const repAcId = (line.rep_id ?? "").trim().toLowerCase();
        return (repAcId ? repAcIdToCanonical.get(repAcId) : undefined) ?? line.rep_name ?? line.rep_id ?? "";
      }
      return "";
    };

    let bookings = 0, bookingLines = 0;
    const bookingEntities = new Set<string>();
    for (const line of primaryBookings) {
      if (!scopeFilter(line)) continue;
      bookings += line.amount;
      bookingLines++;
      const ek = entityKey(line);
      if (ek) bookingEntities.add(ek);
    }

    let invoices = 0, invoiceLines = 0;
    const invoiceEntities = new Set<string>();
    for (const line of primaryInvoiced) {
      if (!scopeFilter(line)) continue;
      invoices += line.amount;
      invoiceLines++;
      const ek = entityKey(line);
      if (ek) invoiceEntities.add(ek);
    }

    console.log(
      `[dealer-rep] ${format(primary.from, "MMM d, yyyy")} – ${format(primary.to, "MMM d, yyyy")}` +
      ` | bookings=${primaryBookings.length} rows $${bookings.toFixed(2)}` +
      ` | invoiced=${primaryInvoiced.length} rows $${invoices.toFixed(2)}`,
    );

    return {
      bookings, invoices,
      bookingLines, invoiceLines,
      bookingEntities: bookingEntities.size,
      invoiceEntities: invoiceEntities.size,
    };
  }, [
    primaryInvoiced, primaryBookings, groupBy, primary,
    managerScopeCustomerIds, selectedTerritoryNames, selectedRepAcIds,
    selectedDealerAcIds, selectedDealerNames,
    repAcIdToCanonical, brandCategorySet, skuSet, customerIdToTerritoryName,
  ]);


  // In RPC mode the KPI totals come from grouped rows (no line data available).
  const rpcKpis = useMemo(() => {
    if (!useRpcMode) return null;
    let total = 0, lines = 0, entities = 0;
    for (const r of groupedRows) {
      total += r.primary_amt;
      lines += r.primary_lines;
      if (r.primary_amt !== 0) entities++;
    }
    return { total, lines, entities };
  }, [groupedRows, useRpcMode]);

  // ── Summary card stats ────────────────────────────────────────────────────

  const aheadCount = compareMode !== "none"
    ? bookingRows.filter((r) => r.primary_amt > 0 && r.primary_amt > r.comp_amt).length
    : 0;
  const behindCount = compareMode !== "none"
    ? bookingRows.filter((r) => r.primary_amt > 0 && r.primary_amt < r.comp_amt && r.comp_amt > 0).length
    : 0;

  const openTerritories = useMemo(() => {
    if (groupBy !== "rep") return 0;
    const assignedTerrIds = new Set(repTerritories.map((rt) => rt.territory_id));
    return territories.filter((t) => !assignedTerrIds.has(t.id)).length;
  }, [groupBy, territories, repTerritories]);

  // Pre-fetched totals for the drill-sheet header
  const drillBookings = drillRow ? bookingRows.find((r) => r.entity_key === drillRow.key)?.primary_amt : undefined;
  const drillInvoiced = drillRow ? invoicedRows.find((r) => r.entity_key === drillRow.key)?.primary_amt : undefined;

  // ── Active filter chips ───────────────────────────────────────────────────

  const activeFilterChips = useMemo((): { label: string; clear: () => void }[] => {
    const chips: { label: string; clear: () => void }[] = [];
    if (territoryIds.length > 0) {
      const names = territoryIds.map((id) => territories.find((t) => t.id === id)?.name ?? id);
      chips.push({
        label: names.length === 1 ? `Territory: ${names[0]}` : `${names.length} territories`,
        clear: () => setTerritoryIds([]),
      });
    }
    if (repIds.length > 0) {
      const names = repIds.map((id) => visibleReps.find((r) => r.id === id)?.name ?? id);
      chips.push({
        label: names.length === 1 ? names[0] : `${names.length} reps`,
        clear: () => setRepIds([]),
      });
    }
    if (dealerIds.length > 0) {
      const names = dealerIds.map((id) => visibleDealers.find((d) => d.id === id)?.name ?? id);
      chips.push({
        label: names.length === 1 ? names[0] : `${names.length} dealers`,
        clear: () => setDealerIds([]),
      });
    }
    if (brandCategories.length > 0) {
      chips.push({
        label: brandCategories.length === 1 ? `Brand: ${brandCategories[0]}` : `${brandCategories.length} brands`,
        clear: () => setBrandCategories([]),
      });
    }
    if (skus.length > 0) {
      chips.push({
        label: skus.length === 1 ? `SKU: ${skus[0]}` : `${skus.length} SKUs`,
        clear: () => setSkus([]),
      });
    }
    return chips;
  }, [territoryIds, repIds, dealerIds, brandCategories, skus, territories, visibleReps, visibleDealers]);

  // Lazy detail-line fetcher closed over the current drill target.
  // Re-created only when the clicked entity, filters, or date range change.
  const drillDetailFetch = useMemo((): ((p: { limit: number; offset: number }) => Promise<ViewLine[]>) | undefined => {
    if (!useRpcMode || !drillRow) return undefined;
    const metricStr = metric === "invoices" ? "invoiced" : "bookings";
    if (metricStr === "bookings" && !primBkEnabled) return undefined; // range entirely before cutoff
    const entityKey = drillRow.key;
    const fromStr   = metricStr === "bookings" ? format(primBkFrom, "yyyy-MM-dd") : format(primary.from, "yyyy-MM-dd");
    const toStr     = format(primary.to, "yyyy-MM-dd");
    const cids      = rpcCustomerIds;
    const rids      = selectedRepAcIds.size > 0 ? Array.from(selectedRepAcIds) : null;
    const bcs       = brandCategories.length > 0 ? brandCategories : null;
    const sks       = skus.length > 0 ? skus : null;
    return async ({ limit, offset }) => {
      const { data, error } = await (supabase as any).rpc(
        "get_sales_reporting_detail_lines",
        {
          p_metric:       metricStr,
          p_group_by:     groupBy === "territory" ? "dealer" : groupBy,
          p_entity_key:   entityKey,
          p_from:         fromStr,
          p_to:           toStr,
          p_customer_ids: cids,
          p_brand_cats:   bcs,
          p_skus:         sks,
          p_rep_ids:      rids,
          p_limit:        limit,
          p_offset:       offset,
          p_manager_id:   managerId ?? null,
        },
      );
      if (error) {
        console.error("[sales-reporting] detail lines fetch failed:", error.message, error);
        return [];
      }
      return ((data ?? []) as any[]).map((r): ViewLine => ({
        metric_type:      metricStr,
        transaction_date: String(r.transaction_date),
        dealer_name:      r.dealer_name    ?? null,
        customer_id:      r.customer_id    ?? null,
        rep_name:         r.rep_name       ?? null,
        rep_id:           r.rep_id         ?? null,
        sku:              r.sku            ?? null,
        description:      r.description   ?? null,
        brand_category:   r.brand_category ?? null,
        product_class:    r.product_class   ?? null,
        amount:           Number(r.amount) || 0,
        invoice_number:   r.invoice_number ?? null,
      }));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRpcMode, drillRow?.key, metric, groupBy, primary.from, primary.to, primBkFrom, primBkEnabled, rpcCustomerIds, selectedRepAcIds, brandCategories, skus, managerId]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const leftHeader = groupBy === "dealer" ? "Dealer" : groupBy === "rep" ? "Rep" : "Territory";
  const isFetching = useRpcMode
    ? groupedFetching
    : (metric === "invoices" ? invFetching : bkgFetching);
  const isLoading  = isFetching && (useRpcMode ? groupedRows.length === 0 : primaryLines.length === 0);
  const noData     = !isFetching && (useRpcMode ? groupedRows.length === 0 : primaryLines.length === 0);
  const dateRangeLabel  = `${format(primary.from, "MMM d, yyyy")} – ${format(primary.to, "MMM d, yyyy")}`;
  const compRangeLabel  = `${format(comparative.from, "MMM d, yyyy")} – ${format(comparative.to, "MMM d, yyyy")}`;
  const tableRangeLabel = dateRangeLabel;

  // Effective invoice KPI values: RPC mode uses grouped-row sums; line mode uses summaryTotals.
  const invTotal    = rpcKpis?.total    ?? summaryTotals.invoices;
  const invLines    = rpcKpis?.lines    ?? summaryTotals.invoiceLines;
  const invEntities = rpcKpis?.entities ?? summaryTotals.invoiceEntities;
  const tableRows   = useRpcMode ? groupedRows.length : aggregation.rows.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── B1. Summary Cards (Ahead / Behind / Open Territories) ─── */}
      {useRpcMode && compareMode !== "none" && (
        <div className={cn("grid gap-3", groupBy === "rep" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                {groupBy === "rep" ? "Reps Ahead" : "Dealers Ahead"}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{aheadCount}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Bookings vs last year</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                {groupBy === "rep" ? "Reps Behind" : "Dealers Behind"}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{behindCount}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Bookings vs last year</p>
            </CardContent>
          </Card>
          {groupBy === "rep" && (
            <Card>
              <CardContent className="p-5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Open Territories
                </p>
                <p className="text-2xl font-semibold tabular-nums">{openTerritories}</p>
                <p className="text-[11px] text-muted-foreground mt-1">No rep assigned</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── A. Filter Card ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-4">

          {/* Row 1: Date ranges */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Quick range</span>
              <Select
                onValueChange={(v) => {
                  const now      = getReportingToday();
                  const todayEnd = startOfDay(now);
                  const monthEnd = endOfMonth(now);
                  let from: Date; let to: Date;
                  switch (v) {
                    case "today":    from = todayEnd; to = todayEnd; break;
                    case "mtd":      from = startOfMonth(now); to = todayEnd; break;
                    case "qtd":      from = startOfQuarter(now); to = todayEnd; break;
                    case "ytd":      from = startOfYear(now); to = todayEnd; break;
                    case "last30":   from = subDays(todayEnd, 29); to = todayEnd; break;
                    case "last90":   from = subDays(todayEnd, 89); to = todayEnd; break;
                    case "3m":       from = startOfMonth(subMonths(monthEnd, 2)); to = monthEnd; break;
                    case "6m":       from = startOfMonth(subMonths(monthEnd, 5)); to = monthEnd; break;
                    case "12m":      from = startOfMonth(subMonths(monthEnd, 11)); to = monthEnd; break;
                    case "lastYear": from = startOfYear(subYears(now, 1)); to = endOfMonth(subMonths(startOfYear(now), 1)); break;
                    default: return;
                  }
                  applyPrimary(from, to);
                }}
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Select preset…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="mtd">Month to date</SelectItem>
                  <SelectItem value="qtd">Quarter to date</SelectItem>
                  <SelectItem value="ytd">Year to date</SelectItem>
                  <SelectItem value="last30">Last 30 days</SelectItem>
                  <SelectItem value="last90">Last 90 days</SelectItem>
                  <SelectItem value="3m">Last 3 months</SelectItem>
                  <SelectItem value="6m">Last 6 months</SelectItem>
                  <SelectItem value="12m">Last 12 months</SelectItem>
                  <SelectItem value="lastYear">Last year (full)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DateRangePicker
              label="Primary date range"
              value={primary}
              onChange={(r) => applyPrimary(r.from, r.to)}
              onReset={() => { const now = getReportingToday(); applyPrimary(startOfYear(now), endOfMonth(now)); }}
            />

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Compare to</span>
              <Select
                value={compareMode}
                onValueChange={(v: CompareMode) => {
                  setCompareMode(v);
                  if (v === "prev-year") {
                    setComparative({ from: subYears(primary.from, 1), to: subYears(primary.to, 1) });
                  } else if (v === "prev-period") {
                    const days   = differenceInCalendarDays(primary.to, primary.from) + 1;
                    const prevTo = subDays(primary.from, 1);
                    setComparative({ from: subDays(prevTo, days - 1), to: prevTo });
                  }
                }}
              >
                <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prev-year">Previous year</SelectItem>
                  <SelectItem value="prev-period">Previous period</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="none">No comparison</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {compareMode !== "none" && (
              <DateRangePicker
                label="Comparative date range"
                value={comparative}
                onChange={(r) => { setCompareMode("custom"); setComparative(r); }}
                onReset={() => {
                  setCompareMode("prev-year");
                  setComparative({ from: subYears(primary.from, 1), to: subYears(primary.to, 1) });
                }}
              />
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-muted-foreground self-end"
              onClick={() => {
                const now = getReportingToday();
                const fromReset = display === "total" && metric === "invoices" ? startOfYear(now) : startOfMonth(now);
                setCompareMode("prev-year");
                setPrimary({ from: fromReset, to: now });
                setComparative({ from: subYears(fromReset, 1), to: subYears(now, 1) });
                setTerritoryIds([]);
                setRepIds([]);
                setDealerIds([]);
                setBrandCategories([]);
                setSkus([]);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
          </div>

          {/* Row 2: Metric + Display + Group By */}
          <div className="pt-3 border-t flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Metric</span>
              <SegmentedControl
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "invoices", label: "Invoices" },
                  { value: "bookings", label: "Bookings" },
                ]}
                size="md"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Display</span>
              <SegmentedControl
                value={display}
                onChange={handleDisplayChange}
                options={[
                  { value: "total", label: "Total" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
            </div>

            {groupByOptions && groupByOptions.length > 1 && (
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Group by</span>
                <SegmentedControl
                  value={groupBy}
                  onChange={setGroupBy}
                  options={(groupByOptions).map((g) => ({
                    value: g,
                    label: g === "dealer" ? "Dealer" : g === "rep" ? "Rep" : "Territory",
                  }))}
                />
              </div>
            )}
          </div>

          {/* Row 3: Dimension filters */}
          <div className="pt-3 border-t flex flex-wrap items-end gap-3">
            <MultiSelect
              label="Territory" selected={territoryIds} onChange={setTerritoryIds}
              options={territories.map((t) => ({ value: t.id, label: t.name }))}
            />
            <MultiSelect
              label="Rep" selected={repIds} onChange={setRepIds}
              options={visibleReps.map((r) => ({ value: r.id, label: r.name }))}
            />
            <MultiSelect
              label="Dealer" selected={dealerIds} onChange={setDealerIds}
              options={visibleDealers.map((d) => ({ value: d.id, label: d.name }))}
              searchable searchPlaceholder="Search dealers…"
            />
            <MultiSelect
              label="Brand / Category" selected={brandCategories} onChange={setBrandCategories}
              options={allBrandCategories.map((bc) => ({ value: bc, label: bc }))}
              searchable searchPlaceholder="Search brand / category…"
            />
            <MultiSelect
              label="SKU" selected={skus} onChange={setSkus}
              options={Array.from(skuLabelMap.entries()).map(([sku, label]) => ({ value: sku, label }))}
              searchable searchPlaceholder="Search SKU…"
            />
          </div>

          {/* Active filter chips */}
          {activeFilterChips.length > 0 && (
            <div className="pt-2.5 border-t flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-muted-foreground mr-0.5">Active:</span>
              {activeFilterChips.map((chip) => (
                <FilterChip key={chip.label} label={chip.label} onClear={chip.clear} />
              ))}
              <button
                type="button"
                onClick={() => { setTerritoryIds([]); setRepIds([]); setDealerIds([]); setBrandCategories([]); setSkus([]); }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── C. Results Table ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-0 pt-5 px-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">
                {metric === "invoices" ? "Invoices" : "Bookings"} by {leftHeader}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">{tableRangeLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <Badge variant="secondary" className="text-[11px] font-medium">
                {tableRows} rows
              </Badge>
              <Badge variant="outline" className="text-[11px]">{tableRangeLabel}</Badge>
              {compareMode !== "none" && (
                <Badge variant="outline" className="text-[11px]">
                  vs {compRangeLabel}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[60vh]">
            {isLoading ? (
              <TableSkeleton />
            ) : noData ? (
              <div className="py-16 text-center px-8">
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  {metric === "invoices"
                    ? <FileText className="h-4.5 w-4.5 text-muted-foreground" />
                    : <ShoppingCart className="h-4.5 w-4.5 text-muted-foreground" />}
                </div>
                <p className="text-sm font-medium text-foreground/80">
                  {metric === "invoices"
                    ? "No invoice data for the selected filters."
                    : "No booking data for the selected filters."}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Try adjusting the date range or active filters above.
                </p>
              </div>
            ) : useRpcMode ? (
              <TotalTable
                rows={groupedRows.map((r) => {
                  // For rep groupBy entity_key is the Acctivate rep_id; map to full name.
                  const label = groupBy === "rep"
                    ? (repAcIdToCanonical.get(r.entity_key.trim().toLowerCase()) ?? r.entity_key)
                    : r.entity_key;
                  return { key: r.entity_key, label, primary: r.primary_amt, comparative: r.comp_amt };
                })}
                leftHeader={leftHeader}
                showComparison={compareMode !== "none"}
                onRowClick={(key, label) => setDrillRow({ key, label })}
                goalData={groupBy === "rep" ? repGoalMap : undefined}
              />
            ) : display === "monthly" ? (
              <MonthlyTable
                rows={aggregation.rows}
                primMonths={aggregation.primMonths}
                compMonths={aggregation.compMonths}
                leftHeader={leftHeader}
                showComparison={compareMode !== "none"}
                onRowClick={(key, label) => setDrillRow({ key, label })}
              />
            ) : (
              <TotalTable
                rows={aggregation.rows}
                leftHeader={leftHeader}
                showComparison={compareMode !== "none"}
                onRowClick={(key, label) => setDrillRow({ key, label })}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <InvoiceDetailSheet
        open={!!drillRow}
        onOpenChange={(o) => { if (!o) setDrillRow(null); }}
        groupBy={groupBy}
        rowKey={drillRow?.key ?? ""}
        rowLabel={drillRow?.label ?? ""}
        from={primary.from}
        to={primary.to}
        compareFrom={compareMode !== "none" ? comparative.from : undefined}
        compareTo={compareMode !== "none" ? comparative.to : undefined}
        viewLines={useRpcMode ? [] : repLines}
        repAcIdToCanonical={repAcIdToCanonical}
        fetchLines={drillDetailFetch}
        metric={metric}
        primaryBookingsAmt={drillBookings}
        primaryInvoicedAmt={drillInvoiced}
      />
    </div>
  );
}

// ── Table sub-components ──────────────────────────────────────────────────────

function fmtGoalPct(v: number | null) {
  if (v == null) return null;
  return `${v.toFixed(0)}%`;
}

function TotalTable({
  rows, leftHeader, showComparison, onRowClick, goalData,
}: {
  rows: { key: string; label: string; primary: number; comparative: number }[];
  leftHeader: string;
  showComparison?: boolean;
  onRowClick?: (key: string, label: string) => void;
  goalData?: Map<string, { mtdPct: number | null; ytdPct: number | null }>;
}) {
  const totalP = rows.reduce((s, r) => s + r.primary, 0);
  const totalC = rows.reduce((s, r) => s + r.comparative, 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-card sticky top-0 z-20">
          <th className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sticky left-0 bg-card z-20">
            {leftHeader}
          </th>
          {goalData && (
            <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              MTD %
            </th>
          )}
          {goalData && (
            <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              YTD %
            </th>
          )}
          <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Primary
          </th>
          {showComparison && (
            <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Comparative
            </th>
          )}
          {showComparison && (
            <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Δ
            </th>
          )}
          {showComparison && (
            <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Δ %
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const delta = r.primary - r.comparative;
          const pct   = r.comparative === 0 ? 0 : (delta / r.comparative) * 100;
          const goal  = goalData?.get(r.key);
          return (
            <tr
              key={r.key}
              className={cn(
                "border-b last:border-0 transition-colors",
                onRowClick ? "hover:bg-muted/30 cursor-pointer" : "hover:bg-muted/20",
              )}
              onClick={onRowClick ? () => onRowClick(r.key, r.label) : undefined}
            >
              <td className="px-5 py-3 font-medium sticky left-0 bg-card z-10 max-w-[220px] truncate">
                {onRowClick ? (
                  <button type="button" className="text-left text-primary hover:underline truncate max-w-full">
                    {r.label}
                  </button>
                ) : r.label}
              </td>
              {goalData && (
                <td className={cn("px-4 py-3 text-right tabular-nums text-sm", goal?.mtdPct != null && goal.mtdPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                  {goal ? (fmtGoalPct(goal.mtdPct) ?? "—") : "—"}
                </td>
              )}
              {goalData && (
                <td className={cn("px-4 py-3 text-right tabular-nums text-sm", goal?.ytdPct != null && goal.ytdPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                  {goal ? (fmtGoalPct(goal.ytdPct) ?? "—") : "—"}
                </td>
              )}
              <td className="px-5 py-3 text-right tabular-nums font-medium">{formatCurrency(r.primary)}</td>
              {showComparison && (
                <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.comparative)}</td>
              )}
              {showComparison && (
                <td className={cn("px-5 py-3 text-right tabular-nums font-medium", delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
                </td>
              )}
              {showComparison && (
                <td className={cn("px-5 py-3 text-right tabular-nums", pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  {r.comparative === 0 ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                </td>
              )}
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={(showComparison ? 5 : 2) + (goalData ? 2 : 0)} className="px-5 py-10 text-center text-sm text-muted-foreground">
              No results for the selected filters.
            </td>
          </tr>
        )}
        {rows.length > 0 && (
          <tr className="border-t bg-card sticky bottom-0 z-10">
            <td className="px-5 py-3 font-semibold sticky left-0 bg-card z-20">Total</td>
            {goalData && <td className="px-4 py-3" />}
            {goalData && <td className="px-4 py-3" />}
            <td className="px-5 py-3 text-right tabular-nums font-semibold">{formatCurrency(totalP)}</td>
            {showComparison && (
              <td className="px-5 py-3 text-right tabular-nums font-semibold text-muted-foreground">{formatCurrency(totalC)}</td>
            )}
            {showComparison && (
              <td className={cn("px-5 py-3 text-right tabular-nums font-semibold", totalP - totalC >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {totalP - totalC >= 0 ? "+" : ""}{formatCurrency(totalP - totalC)}
              </td>
            )}
            {showComparison && (
              <td className={cn("px-5 py-3 text-right tabular-nums font-semibold", totalP - totalC >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {totalC === 0 ? "—" : `${((totalP - totalC) / totalC * 100) >= 0 ? "+" : ""}${((totalP - totalC) / totalC * 100).toFixed(1)}%`}
              </td>
            )}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function MonthlyTable({
  rows, primMonths, compMonths, leftHeader, showComparison, onRowClick,
}: {
  rows: { key: string; label: string; primary: number; comparative: number; byMonth: Map<string, number> }[];
  primMonths: { key: string; label: string }[];
  compMonths: { key: string; label: string }[];
  leftHeader: string;
  showComparison?: boolean;
  onRowClick?: (key: string, label: string) => void;
}) {
  const interleaved: { key: string; label: string }[] = [];
  const max = Math.max(primMonths.length, showComparison ? compMonths.length : 0);
  for (let i = 0; i < max; i++) {
    if (primMonths[i]) interleaved.push(primMonths[i]);
    if (showComparison && compMonths[i]) interleaved.push(compMonths[i]);
  }
  const totalCols = interleaved.length + 2;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-card sticky top-0 z-20">
          <th className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sticky left-0 bg-card z-20">
            {leftHeader}
          </th>
          {interleaved.map((m) => (
            <th key={m.key} className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              {m.label}
            </th>
          ))}
          <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground border-l whitespace-nowrap">
            Primary Total
          </th>
          {showComparison && (
            <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              Comp. Total
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className={cn(
              "border-b last:border-0 transition-colors",
              onRowClick ? "hover:bg-muted/30 cursor-pointer" : "hover:bg-muted/20",
            )}
            onClick={onRowClick ? () => onRowClick(r.key, r.label) : undefined}
          >
            <td className="px-5 py-3 font-medium sticky left-0 bg-card z-10 max-w-[180px] truncate">
              {onRowClick ? (
                <button type="button" className="text-left text-primary hover:underline truncate max-w-full">
                  {r.label}
                </button>
              ) : r.label}
            </td>
            {interleaved.map((m) => (
              <td key={m.key} className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                {formatCurrency(r.byMonth.get(m.key) ?? 0)}
              </td>
            ))}
            <td className="px-5 py-3 text-right tabular-nums border-l font-medium">{formatCurrency(r.primary)}</td>
            {showComparison && (
              <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.comparative)}</td>
            )}
          </tr>
        ))}
        {rows.length > 0 && (
          <tr className="border-t bg-card sticky bottom-0 z-10">
            <td className="px-5 py-3 font-semibold sticky left-0 bg-card z-20">Total</td>
            {interleaved.map((m) => {
              const monthTotal = rows.reduce((s, r) => s + (r.byMonth.get(m.key) ?? 0), 0);
              return (
                <td key={m.key} className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold">
                  {formatCurrency(monthTotal)}
                </td>
              );
            })}
            <td className="px-5 py-3 text-right tabular-nums border-l font-semibold">
              {formatCurrency(rows.reduce((s, r) => s + r.primary, 0))}
            </td>
            {showComparison && (
              <td className="px-5 py-3 text-right tabular-nums font-semibold text-muted-foreground">
                {formatCurrency(rows.reduce((s, r) => s + r.comparative, 0))}
              </td>
            )}
          </tr>
        )}
        {rows.length === 0 && (
          <tr>
            <td colSpan={totalCols} className="px-5 py-10 text-center text-sm text-muted-foreground">
              No results for the selected filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
