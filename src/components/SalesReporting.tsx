import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format, startOfYear, endOfMonth, subYears, subMonths, startOfMonth, startOfDay,
  startOfQuarter, subDays, differenceInCalendarDays,
} from "date-fns";
import { RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useDealers, useSalesReps, useTerritories, useRepTerritories,
  useProducts, useDealerSalesLines, useDealerSales, formatCurrency,
} from "@/hooks/usePortalData";
import { InvoiceDetailSheet } from "@/components/InvoiceDetailSheet";


/** Day-precise fetch of dealer_invoices in a combined date window. */
function useDealerInvoicesInRange(from: Date, to: Date) {
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");
  return useQuery({
    queryKey: ["dealer_invoices_range_rpc_v2", fromStr, toStr],
    queryFn: async () => {
      const out: Array<{ dealer_id: string | null; invoice_date: string | null; total: number }> = [];
      const pageSize = 1000;
      let start = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await (supabase as any)
          .rpc("dealer_daily_invoice_net", { p_from: fromStr, p_to: toStr })
          .range(start, start + pageSize - 1);
        if (error) throw error;
        const batch = ((data ?? []) as Array<{ dealer_id: string | null; invoice_date: string | null; net_total: number | null }>)
          .map((r) => ({ dealer_id: r.dealer_id, invoice_date: r.invoice_date, total: Number(r.net_total ?? 0) }));
        out.push(...batch);
        if (batch.length < pageSize) break;
        start += pageSize;
      }
      return out;
    },
  });
}

/** Day-precise fetch of dealer_invoice_lines in a date window, used when a
 *  brand / collection / category / SKU filter is active with metric = invoices. */
function useDealerInvoiceLinesInRange(from: Date, to: Date, productIds: string[], enabled: boolean) {
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");
  return useQuery({
    queryKey: ["dealer_invoice_lines_range", fromStr, toStr, productIds.join(",")],
    enabled,
    queryFn: async () => {
      const out: {
        dealer_id: string | null;
        product_id: string | null;
        invoice_date: string | null;
        extended_price: number | null;
      }[] = [];
      if (productIds.length === 0) return out;
      const pageSize = 1000;
      const chunkSize = 75;
      for (let i = 0; i < productIds.length; i += chunkSize) {
        const chunk = productIds.slice(i, i + chunkSize);
        let start = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from("dealer_invoice_lines")
            .select("dealer_id, product_id, invoice_date, extended_price")
            .not("dealer_id", "is", null)
            .in("product_id", chunk)
            .gte("invoice_date", fromStr)
            .lte("invoice_date", toStr)
            .range(start, start + pageSize - 1);
          if (error) throw error;
          const batch = (data ?? []) as typeof out;
          out.push(...batch);
          if (batch.length < pageSize) break;
          start += pageSize;
        }
      }
      return out;
    },
  });
}

/** Day-precise fetch of ALL sales order bookings (every status) in a date
 *  window, sourced from dbo_Orders via the bookings_all_in_range RPC. */
function useOpenSalesOrdersInRange(from: Date, to: Date) {
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");
  return useQuery({
    queryKey: ["bookings_all_in_range_v1", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bookings_all_in_range", {
        p_from: fromStr,
        p_to: toStr,
      });
      if (error) throw error;
      return ((data ?? []) as { dealer_id: string | null; dealer_acctivate_id: string | null; order_date: string | null; extended_value: number | null }[])
        .map((r) => ({
          dealer_id: r.dealer_id,
          dealer_acctivate_id: r.dealer_acctivate_id,
          order_date: r.order_date,
          extended_value: Number(r.extended_value ?? 0),
        }));
    },
  });
}

type GroupBy = "dealer" | "rep" | "territory";
type Metric = "bookings" | "invoices";
type Display = "total" | "monthly";

interface DateRange { from: Date; to: Date }

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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
    <div className="flex flex-col gap-1 min-w-[160px]">
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
  // Track an in-progress range so users can pick fresh from/to without being
  // anchored to the previously committed range.
  const [draft, setDraft] = useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const display = draft ?? { from: value.from, to: value.to };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); setDraft(o ? { from: undefined, to: undefined } : undefined); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 justify-start font-normal min-w-[230px]">
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {format(value.from, "MMM d, yyyy")} - {format(value.to, "MMM d, yyyy")}
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

interface Props {
  groupBy: GroupBy;
  managerScopeRepIds?: string[] | null; // null = all reps; array = limit to these
  /** When provided, user can toggle the leftmost column among these. */
  groupByOptions?: GroupBy[];
}

export function SalesReporting({ groupBy: initialGroupBy, managerScopeRepIds, groupByOptions }: Props) {
  const today = new Date();
  const yearStart = startOfYear(today);
  // Default primary window covers the full lifetime of synced sales orders
  // (2024 -  today) so Dealer/Rep reporting shows all-time bookings by default.
  // Only the Live KPI view is scoped to the current year.
  const lifetimeStart = new Date(2024, 0, 1);

  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy);
  const [primary, setPrimary] = useState<DateRange>({ from: lifetimeStart, to: endOfMonth(today) });
  const [comparative, setComparative] = useState<DateRange>({
    from: subYears(lifetimeStart, 1),
    to: subYears(endOfMonth(today), 1),
  });
  type CompareMode = "prev-year" | "prev-period" | "custom" | "none";
  const [compareMode, setCompareMode] = useState<CompareMode>("prev-year");
  const [metric, setMetric] = useState<Metric>("bookings");
  const [display, setDisplay] = useState<Display>("total");
  const [drillRow, setDrillRow] = useState<{ key: string; label: string } | null>(null);

  // Apply a preset to primary range AND auto-sync comparative based on compareMode.
  const applyPrimary = (from: Date, to: Date, mode: CompareMode = compareMode) => {
    setPrimary({ from, to });
    if (mode === "prev-year") {
      setComparative({ from: subYears(from, 1), to: subYears(to, 1) });
    } else if (mode === "prev-period") {
      const days = differenceInCalendarDays(to, from) + 1;
      const prevTo = subDays(from, 1);
      const prevFrom = subDays(prevTo, days - 1);
      setComparative({ from: prevFrom, to: prevTo });
    }
    // "custom" / "none": leave comparative alone
  };


  const [territoryIds, setTerritoryIds] = useState<string[]>([]);
  const [repIds, setRepIds] = useState<string[]>([]);
  const [dealerIds, setDealerIds] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [skus, setSkus] = useState<string[]>([]);

  const { data: dealers = [] } = useDealers();
  const { data: reps = [] } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: repTerritories = [] } = useRepTerritories();
  const { data: products = [] } = useProducts();
  const { data: lines = [] } = useDealerSalesLines();
  const { data: aggregates = [] } = useDealerSales();

  // Day-precise invoices for the full window covered by primary + comparative.
  const invoiceWindow = useMemo(() => {
    const lo = compareMode === "none"
      ? primary.from
      : (primary.from < comparative.from ? primary.from : comparative.from);
    const hi = compareMode === "none"
      ? primary.to
      : (primary.to > comparative.to ? primary.to : comparative.to);
    return { from: lo, to: hi };
  }, [primary, comparative, compareMode]);
  const { data: rangeInvoices = [] } = useDealerInvoicesInRange(invoiceWindow.from, invoiceWindow.to);
  // Day-precise open sales orders for Bookings (replaces the monthly dealer_sales rollup
  // when no product filter is active so we surface ALL open orders from Acctivate).
  const { data: rangeOpenOrders = [] } = useOpenSalesOrdersInRange(invoiceWindow.from, invoiceWindow.to);

  // Use aggregate dealer_sales when no product-level filter is active.
  // dealer_sales_lines is sparsely populated; aggregates have full totals.
  const useAggregates = brands.length === 0 && categories.length === 0 && collections.length === 0 && skus.length === 0;

  // Filtered product set for product-level invoice line queries and value lookups.
  const filteredProductIds = useMemo(() => {
    let list = products;
    if (brands.length > 0) list = list.filter((p) => p.brand && brands.includes(p.brand));
    if (categories.length > 0) list = list.filter((p) => p.category && categories.includes(p.category));
    if (collections.length > 0) list = list.filter((p) => p.collection && collections.includes(p.collection));
    if (skus.length > 0) list = list.filter((p) => skus.includes(p.id));
    return new Set(list.map((p) => p.id));
  }, [products, brands, categories, collections, skus]);

  // When product filters are active we always pull from dealer_invoice_lines:
  // it's the only product-linked source with real data (dealer_sales_lines is
  // sparsely populated). For metric=bookings under a product filter, we surface
  // invoice line revenue as a proxy (a banner explains this below).
  const useInvoiceLines = !useAggregates;
  const { data: rangeInvoiceLines = [] } = useDealerInvoiceLinesInRange(
    invoiceWindow.from, invoiceWindow.to, Array.from(filteredProductIds), useInvoiceLines,
  );

  // Hierarchical filter dependencies
  const visibleReps = useMemo(() => {
    let list = reps;
    if (managerScopeRepIds) list = list.filter((r) => managerScopeRepIds.includes(r.id));
    if (territoryIds.length > 0) {
      const allowedRepIds = new Set(repTerritories.filter((rt) => territoryIds.includes(rt.territory_id)).map((rt) => rt.rep_id));
      list = list.filter((r) => allowedRepIds.has(r.id));
    }
    return list;
  }, [reps, managerScopeRepIds, territoryIds, repTerritories]);

  const visibleDealers = useMemo(() => {
    let list = dealers;
    if (managerScopeRepIds) list = list.filter((d) => d.rep_id && managerScopeRepIds.includes(d.rep_id));
    if (territoryIds.length > 0) list = list.filter((d) => d.territory_id && territoryIds.includes(d.territory_id));
    if (repIds.length > 0) list = list.filter((d) => d.rep_id && repIds.includes(d.rep_id));
    return list;
  }, [dealers, managerScopeRepIds, territoryIds, repIds]);

  const allBrands = useMemo(() => Array.from(new Set(products.map((p) => p.brand).filter(Boolean) as string[])).sort(), [products]);
  const visibleCategories = useMemo(() => {
    let list = products;
    if (brands.length > 0) list = list.filter((p) => p.brand && brands.includes(p.brand));
    return Array.from(new Set(list.map((p) => p.category).filter(Boolean) as string[])).sort();
  }, [products, brands]);
  const visibleCollections = useMemo(() => {
    let list = products;
    if (brands.length > 0) list = list.filter((p) => p.brand && brands.includes(p.brand));
    if (categories.length > 0) list = list.filter((p) => p.category && categories.includes(p.category));
    return Array.from(new Set(list.map((p) => p.collection).filter(Boolean) as string[])).sort();
  }, [products, brands, categories]);
  const visibleSkus = useMemo(() => {
    let list = products;
    if (brands.length > 0) list = list.filter((p) => p.brand && brands.includes(p.brand));
    if (categories.length > 0) list = list.filter((p) => p.category && categories.includes(p.category));
    if (collections.length > 0) list = list.filter((p) => p.collection && collections.includes(p.collection));
    return list;
  }, [products, brands, categories, collections]);

  const dealerIdSet = useMemo(() => {
    if (dealerIds.length > 0) return new Set(dealerIds);
    return new Set(visibleDealers.map((d) => d.id));
  }, [dealerIds, visibleDealers]);

  const { data: acctivateUuidMappings } = useQuery({
    queryKey: ["dealer_acctivate_uuids_v1"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dealer_acctivate_uuids")
        .select("acctivate_uuid, dealer_id");
      if (error) throw error;
      return (data ?? []) as { acctivate_uuid: string; dealer_id: string }[];
    },
  });

  const dealerIdByAcctivateId = useMemo(() => {
    const map = new Map<string, string>();
    for (const dealer of dealers) {
      if (dealer.acctivate_id) map.set(dealer.acctivate_id.trim().toLowerCase(), dealer.id);
    }
    for (const m of acctivateUuidMappings ?? []) {
      if (m.acctivate_uuid) map.set(m.acctivate_uuid.trim().toLowerCase(), m.dealer_id);
    }
    return map;
  }, [dealers, acctivateUuidMappings]);

  const unscopedOpenOrderView = !managerScopeRepIds && territoryIds.length === 0 && repIds.length === 0 && dealerIds.length === 0;

  // Build aggregation
  const aggregation = useMemo(() => {
    const primMonths = monthsInRange(primary);
    const compMonths = monthsInRange(comparative);
    const primKeys = new Set(primMonths.map((m) => m.key));
    const compKeys = new Set(compMonths.map((m) => m.key));

    type Key = string;
    const rowKey = (line: { dealer_id: string }) => {
      const dealer = dealers.find((d) => d.id === line.dealer_id);
      if (!dealer) return null;
      if (groupBy === "dealer") return dealer.id;
      if (groupBy === "rep") return dealer.rep_id ?? "__unassigned";
      return dealer.territory_id ?? "__unassigned";
    };

    const rowLabel = (key: Key): string => {
      if (key === "__unassigned") return "Unassigned";
      if (key.startsWith("acctivate:")) return `Dealer ID ${key.replace("acctivate:", "")}`;
      if (groupBy === "dealer") return dealers.find((d) => d.id === key)?.name ?? "-";
      if (groupBy === "rep") return reps.find((r) => r.id === key)?.name ?? "-";
      return territories.find((t) => t.id === key)?.name ?? "-";
    };

    const rows = new Map<Key, { primary: number; comparative: number; byMonth: Map<string, number> }>();

    // For invoices with no product filter, use day-precise dealer_invoices.
    const useDayPreciseInvoices = metric === "invoices" && useAggregates;
    const useDayPreciseBookings = metric === "bookings" && useAggregates;

    if (useDayPreciseBookings) {
      const primFromMs = startOfDay(primary.from).getTime();
      const primToMs = startOfDay(primary.to).getTime();
      const compFromMs = startOfDay(comparative.from).getTime();
      const compToMs = startOfDay(comparative.to).getTime();
      for (const oo of rangeOpenOrders) {
        if (!oo.order_date) continue;
        const acctivateDealerId = oo.dealer_acctivate_id?.trim() || "Unmatched";
        const resolvedDealerId = oo.dealer_id ?? (oo.dealer_acctivate_id ? dealerIdByAcctivateId.get(oo.dealer_acctivate_id.trim().toLowerCase()) : undefined);
        let k: Key | null = null;
        if (resolvedDealerId) {
          if (!dealerIdSet.has(resolvedDealerId)) continue;
          k = rowKey({ dealer_id: resolvedDealerId });
        } else {
          if (!unscopedOpenOrderView) continue;
          k = groupBy === "dealer" ? `acctivate:${acctivateDealerId}` : "__unassigned";
        }
        const d = new Date(oo.order_date + "T00:00:00");
        const ms = d.getTime();
        if (Number.isNaN(ms)) continue;
        const inPrim = ms >= primFromMs && ms <= primToMs;
        const inComp = compareMode !== "none" && ms >= compFromMs && ms <= compToMs;
        if (!inPrim && !inComp) continue;
        if (!k) continue;
        const val = Number(oo.extended_value ?? 0);
        if (val === 0) continue;
        const monthKey = `${d.getFullYear()}-${MONTH_NAMES[d.getMonth()]}`;
        let row = rows.get(k);
        if (!row) { row = { primary: 0, comparative: 0, byMonth: new Map() }; rows.set(k, row); }
        if (inPrim) row.primary += val;
        if (inComp) row.comparative += val;
        row.byMonth.set(monthKey, (row.byMonth.get(monthKey) ?? 0) + val);
      }
    } else

    if (useDayPreciseInvoices) {
      const primFromMs = startOfDay(primary.from).getTime();
      const primToMs = startOfDay(primary.to).getTime();
      const compFromMs = startOfDay(comparative.from).getTime();
      const compToMs = startOfDay(comparative.to).getTime();
      for (const inv of rangeInvoices) {
        if (!inv.dealer_id || !inv.invoice_date) continue;
        if (!dealerIdSet.has(inv.dealer_id)) continue;
        const d = new Date(inv.invoice_date + "T00:00:00");
        const ms = d.getTime();
        if (Number.isNaN(ms)) continue;
        const inPrim = ms >= primFromMs && ms <= primToMs;
        const inComp = compareMode !== "none" && ms >= compFromMs && ms <= compToMs;
        if (!inPrim && !inComp) continue;
        const k = rowKey({ dealer_id: inv.dealer_id });
        if (!k) continue;
        const val = Number(inv.total ?? 0);
        if (val === 0) continue;
        const monthKey = `${d.getFullYear()}-${MONTH_NAMES[d.getMonth()]}`;
        let row = rows.get(k);
        if (!row) { row = { primary: 0, comparative: 0, byMonth: new Map() }; rows.set(k, row); }
        if (inPrim) row.primary += val;
        if (inComp) row.comparative += val;
        row.byMonth.set(monthKey, (row.byMonth.get(monthKey) ?? 0) + val);
      }
    } else if (useInvoiceLines) {
      // Day-precise + product-filtered invoice line items
      const primFromMs = startOfDay(primary.from).getTime();
      const primToMs = startOfDay(primary.to).getTime();
      const compFromMs = startOfDay(comparative.from).getTime();
      const compToMs = startOfDay(comparative.to).getTime();
      for (const il of rangeInvoiceLines) {
        if (!il.dealer_id || !il.invoice_date) continue;
        if (!dealerIdSet.has(il.dealer_id)) continue;
        if (!il.product_id || !filteredProductIds.has(il.product_id)) continue;
        const d = new Date(il.invoice_date + "T00:00:00");
        const ms = d.getTime();
        if (Number.isNaN(ms)) continue;
        const inPrim = ms >= primFromMs && ms <= primToMs;
        const inComp = compareMode !== "none" && ms >= compFromMs && ms <= compToMs;
        if (!inPrim && !inComp) continue;
        const k = rowKey({ dealer_id: il.dealer_id });
        if (!k) continue;
        const val = Number(il.extended_price ?? 0);
        if (val === 0) continue;
        const monthKey = `${d.getFullYear()}-${MONTH_NAMES[d.getMonth()]}`;
        let row = rows.get(k);
        if (!row) { row = { primary: 0, comparative: 0, byMonth: new Map() }; rows.set(k, row); }
        if (inPrim) row.primary += val;
        if (inComp) row.comparative += val;
        row.byMonth.set(monthKey, (row.byMonth.get(monthKey) ?? 0) + val);
      }
    } else {
      const source = useAggregates ? aggregates : lines;
      for (const line of source) {
        if (!dealerIdSet.has(line.dealer_id)) continue;
        if (!useAggregates && !filteredProductIds.has((line as { product_id: string }).product_id)) continue;
        const mNum = parseInt(String(line.month), 10);
        const monthName = !isNaN(mNum) && mNum >= 1 && mNum <= 12 ? MONTH_NAMES[mNum - 1] : String(line.month);
        const monthKey = `${line.year}-${monthName}`;
        const inPrim = primKeys.has(monthKey);
        const inComp = compKeys.has(monthKey);
        if (!inPrim && !inComp) continue;

        const k = rowKey(line);
        if (!k) continue;
        const val = (metric === "bookings" ? line.bookings : line.invoices) ?? 0;
        if (val === 0) continue;

        let row = rows.get(k);
        if (!row) { row = { primary: 0, comparative: 0, byMonth: new Map() }; rows.set(k, row); }
        if (inPrim) row.primary += val;
        if (inComp) row.comparative += val;
        row.byMonth.set(monthKey, (row.byMonth.get(monthKey) ?? 0) + val);
      }
    }

    const sorted = Array.from(rows.entries())
      .map(([k, v]) => ({ key: k, label: rowLabel(k), ...v }))
      .sort((a, b) => b.primary - a.primary);

    return { rows: sorted, primMonths, compMonths };
  }, [lines, aggregates, useAggregates, useInvoiceLines, rangeInvoices, rangeInvoiceLines, rangeOpenOrders, dealers, reps, territories, dealerIdSet, dealerIdByAcctivateId, unscopedOpenOrderView, filteredProductIds, primary, comparative, compareMode, metric, groupBy]);

  const leftHeader = groupBy === "dealer" ? "Dealer" : groupBy === "rep" ? "Rep" : "Territory";
  const noData = useAggregates ? aggregates.length === 0 : (useInvoiceLines ? rangeInvoiceLines.length === 0 : lines.length === 0);

  // Totals for BOTH metrics over the primary date range, so users always see
  // total Bookings and total Invoices regardless of the active metric.
  const summaryTotals = useMemo(() => {
    let bookings = 0; let invoices = 0;
    const primFromMs = startOfDay(primary.from).getTime();
    const primToMs = startOfDay(primary.to).getTime();

    // Bookings: when no product filter is active, source from open_sales_orders
    // (live Acctivate open backlog). Otherwise fall back to dealer_sales_lines.
    if (useAggregates) {
      for (const oo of rangeOpenOrders) {
        if (!oo.order_date) continue;
        const resolvedDealerId = oo.dealer_id ?? (oo.dealer_acctivate_id ? dealerIdByAcctivateId.get(oo.dealer_acctivate_id.trim().toLowerCase()) : undefined);
        if (resolvedDealerId) {
          if (!dealerIdSet.has(resolvedDealerId)) continue;
        } else if (!unscopedOpenOrderView) {
          continue;
        }
        const ms = new Date(oo.order_date + "T00:00:00").getTime();
        if (Number.isNaN(ms) || ms < primFromMs || ms > primToMs) continue;
        bookings += Number(oo.extended_value ?? 0);
      }
    } else {
      const primKeys = new Set(monthsInRange(primary).map((m) => m.key));
      for (const line of lines) {
        if (!dealerIdSet.has(line.dealer_id)) continue;
        if (!filteredProductIds.has((line as { product_id: string }).product_id)) continue;
        const mNum = parseInt(String(line.month), 10);
        const monthName = !isNaN(mNum) && mNum >= 1 && mNum <= 12 ? MONTH_NAMES[mNum - 1] : String(line.month);
        if (!primKeys.has(`${line.year}-${monthName}`)) continue;
        bookings += line.bookings ?? 0;
        if (!useInvoiceLines) invoices += line.invoices ?? 0;
      }
    }

    if (useAggregates) {
      for (const inv of rangeInvoices) {
        if (!inv.dealer_id || !inv.invoice_date) continue;
        if (!dealerIdSet.has(inv.dealer_id)) continue;
        const ms = new Date(inv.invoice_date + "T00:00:00").getTime();
        if (Number.isNaN(ms) || ms < primFromMs || ms > primToMs) continue;
        invoices += Number(inv.total ?? 0);
      }
    } else if (useInvoiceLines) {
      for (const il of rangeInvoiceLines) {
        if (!il.dealer_id || !il.invoice_date) continue;
        if (!dealerIdSet.has(il.dealer_id)) continue;
        if (!il.product_id || !filteredProductIds.has(il.product_id)) continue;
        const ms = new Date(il.invoice_date + "T00:00:00").getTime();
        if (Number.isNaN(ms) || ms < primFromMs || ms > primToMs) continue;
        invoices += Number(il.extended_price ?? 0);
      }
    }
    return { bookings, invoices };
  }, [primary, useAggregates, useInvoiceLines, lines, rangeInvoices, rangeInvoiceLines, rangeOpenOrders, dealerIdSet, dealerIdByAcctivateId, unscopedOpenOrderView, filteredProductIds]);

  // Warn when a product-level filter is active but dealer_sales_lines has no rows
  // overlapping the primary date range - common right now since line sync is sparse.
  const productFilterActive = !useAggregates;
  const lineCoverageMissing = useMemo(() => {
    if (!productFilterActive) return false;
    if (useInvoiceLines) return rangeInvoiceLines.length === 0;
    const primKeys = new Set(monthsInRange(primary).map((m) => m.key));
    return !lines.some((l) => {
      const mNum = parseInt(String(l.month), 10);
      const monthName = !isNaN(mNum) && mNum >= 1 && mNum <= 12 ? MONTH_NAMES[mNum - 1] : String(l.month);
      return primKeys.has(`${l.year}-${monthName}`);
    });
  }, [productFilterActive, useInvoiceLines, rangeInvoiceLines, lines, primary]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Quick range</span>
              <Select
                
                onValueChange={(v) => {
                  const todayEnd = startOfDay(today);
                  const monthEnd = endOfMonth(today);
                  let from: Date; let to: Date;
                  switch (v) {
                    case "today":   from = todayEnd; to = todayEnd; break;
                    case "mtd":     from = startOfMonth(today); to = todayEnd; break;
                    case "qtd":     from = startOfQuarter(today); to = todayEnd; break;
                    case "ytd":     from = startOfYear(today); to = todayEnd; break;
                    case "last30":  from = subDays(todayEnd, 29); to = todayEnd; break;
                    case "last90":  from = subDays(todayEnd, 89); to = todayEnd; break;
                    case "3m":      from = startOfMonth(subMonths(monthEnd, 2)); to = monthEnd; break;
                    case "6m":      from = startOfMonth(subMonths(monthEnd, 5)); to = monthEnd; break;
                    case "12m":     from = startOfMonth(subMonths(monthEnd, 11)); to = monthEnd; break;
                    case "lastYear": from = startOfYear(subYears(today, 1)); to = endOfMonth(subMonths(startOfYear(today), 1)); break;
                    default: return;
                  }
                  applyPrimary(from, to);
                }}
              >
                <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Select preset..." /></SelectTrigger>
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
              onReset={() => applyPrimary(yearStart, endOfMonth(today))}
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
                    const days = differenceInCalendarDays(primary.to, primary.from) + 1;
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
              className="h-9 text-muted-foreground"
              onClick={() => {
                setCompareMode("prev-year");
                setPrimary({ from: yearStart, to: endOfMonth(today) });
                setComparative({ from: subYears(yearStart, 1), to: subYears(endOfMonth(today), 1) });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>

            {groupByOptions && groupByOptions.length > 1 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Group by</span>
                <Select value={groupBy} onValueChange={(v: GroupBy) => setGroupBy(v)}>
                  <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {groupByOptions.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g === "dealer" ? "Dealer" : g === "rep" ? "Rep" : "Territory"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Metric</span>
              <Select value={metric} onValueChange={(v: Metric) => setMetric(v)}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bookings">Bookings</SelectItem>
                  <SelectItem value="invoices">Invoices</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Display</span>
              <Select value={display} onValueChange={(v: Display) => setDisplay(v)}>
                <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-3 border-t">
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
              searchable searchPlaceholder="Search dealers..."
            />
            <MultiSelect
              label="Brand" selected={brands} onChange={setBrands}
              options={allBrands.map((b) => ({ value: b, label: b }))}
            />
            <MultiSelect
              label="Category" selected={categories} onChange={setCategories}
              options={visibleCategories.map((c) => ({ value: c, label: c }))}
            />
            <MultiSelect
              label="Collection" selected={collections} onChange={setCollections}
              options={visibleCollections.map((c) => ({ value: c, label: c }))}
            />
            <MultiSelect
              label="SKU" selected={skus} onChange={setSkus}
              options={visibleSkus.map((p) => ({ value: p.id, label: p.name ? `${p.sku} - ${p.name}` : p.sku }))}
              searchable
              searchPlaceholder="Search SKU or name..."
            />
          </div>
        </CardContent>
      </Card>


      {!noData && lineCoverageMissing && (
        <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No invoice line items in this date range</p>
              <p className="text-xs text-muted-foreground">
                Brand, category, collection, and SKU filters use the per-SKU invoice line table. There are no matching rows in the selected window - try a wider date range or clear the product filters to see aggregate totals.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {!noData && !lineCoverageMissing && useInvoiceLines && metric === "bookings" && (
        <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Showing invoiced revenue as a proxy for bookings</p>
              <p className="text-xs text-muted-foreground">
                Per-SKU booking data isn't synced yet. With product filters active, the values below come from invoice line items. Switch the metric to Invoices for the equivalent label, or clear product filters to see true booking totals.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Totals summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Bookings</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{formatCurrency(summaryTotals.bookings)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(primary.from, "MMM d, yyyy")} - {format(primary.to, "MMM d, yyyy")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Invoices</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{formatCurrency(summaryTotals.invoices)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(primary.from, "MMM d, yyyy")} - {format(primary.to, "MMM d, yyyy")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Result table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {metric === "bookings" ? "Bookings" : "Invoices"} by {leftHeader}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{aggregation.rows.length} rows</Badge>
            <Badge variant="outline">{format(primary.from, "MMM d, yyyy")} - {format(primary.to, "MMM d, yyyy")}</Badge>
            {compareMode !== "none" && (
              <Badge variant="outline">vs {format(comparative.from, "MMM d, yyyy")} - {format(comparative.to, "MMM d, yyyy")}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[55vh]">
            {display === "monthly" ? (
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
        dealers={dealers}
        reps={reps}
        territories={territories}
        products={products}
      />
    </div>
  );
}

function TotalTable({
  rows, leftHeader, showComparison, onRowClick,
}: {
  rows: { key: string; label: string; primary: number; comparative: number }[];
  leftHeader: string;
  showComparison?: boolean;
  onRowClick?: (key: string, label: string) => void;
}) {
  const totalP = rows.reduce((s, r) => s + r.primary, 0);
  const totalC = rows.reduce((s, r) => s + r.comparative, 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-card sticky top-0 z-20">
          <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card z-20">{leftHeader}</th>
          <th className="text-right p-3 font-medium text-muted-foreground">Primary</th>
          {showComparison && <th className="text-right p-3 font-medium text-muted-foreground">Comparative</th>}
          {showComparison && <th className="text-right p-3 font-medium text-muted-foreground">-</th>}
          {showComparison && <th className="text-right p-3 font-medium text-muted-foreground">% -</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const delta = r.primary - r.comparative;
          const pct = r.comparative === 0 ? 0 : (delta / r.comparative) * 100;
          return (
            <tr
              key={r.key}
              className={cn("border-b last:border-0 hover:bg-muted/20", onRowClick && "cursor-pointer")}
              onClick={onRowClick ? () => onRowClick(r.key, r.label) : undefined}
            >
              <td className="p-3 font-medium sticky left-0 bg-card z-10">
                {onRowClick ? (
                  <button type="button" className="text-left text-primary hover:underline">{r.label}</button>
                ) : r.label}
              </td>
              <td className="p-3 text-right tabular-nums">{formatCurrency(r.primary)}</td>
              {showComparison && <td className="p-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.comparative)}</td>}
              {showComparison && (
                <td className={cn("p-3 text-right tabular-nums", delta >= 0 ? "text-green-600" : "text-destructive")}>
                  {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
                </td>
              )}
              {showComparison && (
                <td className={cn("p-3 text-right tabular-nums", pct >= 0 ? "text-green-600" : "text-destructive")}>
                  {r.comparative === 0 ? "-" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                </td>
              )}
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr><td colSpan={showComparison ? 5 : 2} className="p-8 text-center text-muted-foreground text-sm">No data for the selected filters.</td></tr>
        )}
        {rows.length > 0 && (
          <tr className="border-t-2 font-semibold bg-card sticky bottom-0 z-10">
            <td className="p-3 sticky left-0 bg-card z-20">Total</td>
            <td className="p-3 text-right tabular-nums">{formatCurrency(totalP)}</td>
            {showComparison && <td className="p-3 text-right tabular-nums">{formatCurrency(totalC)}</td>}
            {showComparison && <td className="p-3 text-right tabular-nums">{formatCurrency(totalP - totalC)}</td>}
            {showComparison && (
              <td className="p-3 text-right tabular-nums">
                {totalC === 0 ? "-" : `${((totalP - totalC) / totalC * 100).toFixed(1)}%`}
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
  // Interleave primary then comparative pairs by month index
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
          <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card z-20">{leftHeader}</th>
          {interleaved.map((m) => (
            <th key={m.key} className="text-right p-3 font-medium text-muted-foreground whitespace-nowrap">{m.label}</th>
          ))}
          <th className="text-right p-3 font-medium text-muted-foreground border-l">Primary Total</th>
          {showComparison && <th className="text-right p-3 font-medium text-muted-foreground">Comparative Total</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className={cn("border-b last:border-0 hover:bg-muted/20", onRowClick && "cursor-pointer")}
            onClick={onRowClick ? () => onRowClick(r.key, r.label) : undefined}
          >
            <td className="p-3 font-medium sticky left-0 bg-card z-10">
              {onRowClick ? (
                <button type="button" className="text-left text-primary hover:underline">{r.label}</button>
              ) : r.label}
            </td>
            {interleaved.map((m) => (
              <td key={m.key} className="p-3 text-right tabular-nums whitespace-nowrap">
                {formatCurrency(r.byMonth.get(m.key) ?? 0)}
              </td>
            ))}
            <td className="p-3 text-right tabular-nums border-l font-medium">{formatCurrency(r.primary)}</td>
            {showComparison && <td className="p-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.comparative)}</td>}
          </tr>
        ))}
        {rows.length > 0 && (
          <tr className="border-t-2 font-semibold bg-card sticky bottom-0 z-10">
            <td className="p-3 sticky left-0 bg-card z-20">Total</td>
            {interleaved.map((m) => {
              const monthTotal = rows.reduce((s, r) => s + (r.byMonth.get(m.key) ?? 0), 0);
              return (
                <td key={m.key} className="p-3 text-right tabular-nums whitespace-nowrap">
                  {formatCurrency(monthTotal)}
                </td>
              );
            })}
            <td className="p-3 text-right tabular-nums border-l">
              {formatCurrency(rows.reduce((s, r) => s + r.primary, 0))}
            </td>
            {showComparison && (
              <td className="p-3 text-right tabular-nums">
                {formatCurrency(rows.reduce((s, r) => s + r.comparative, 0))}
              </td>
            )}
          </tr>
        )}
        {rows.length === 0 && (
          <tr><td colSpan={totalCols} className="p-8 text-center text-muted-foreground text-sm">No data for the selected filters.</td></tr>
        )}
      </tbody>
    </table>
  );
}
