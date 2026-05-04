import { useMemo, useState } from "react";
import { format, startOfYear, endOfMonth, subYears } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDealers, useSalesReps, useTerritories, useRepTerritories,
  useProducts, useDealerSalesLines, useDealerSales, formatCurrency,
} from "@/hooks/usePortalData";

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

function DateRangePicker({ label, value, onChange }: { label: string; value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 justify-start font-normal min-w-[230px]">
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {format(value.from, "MMM d, yyyy")} – {format(value.to, "MMM d, yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{ from: value.from, to: value.to }}
            onSelect={(r) => {
              if (r?.from && r?.to) onChange({ from: r.from, to: r.to });
              else if (r?.from) onChange({ from: r.from, to: r.from });
            }}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
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

  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy);
  const [primary, setPrimary] = useState<DateRange>({ from: yearStart, to: endOfMonth(today) });
  const [comparative, setComparative] = useState<DateRange>({
    from: subYears(yearStart, 1),
    to: subYears(endOfMonth(today), 1),
  });
  const [metric, setMetric] = useState<Metric>("bookings");
  const [display, setDisplay] = useState<Display>("total");

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

  // Use aggregate dealer_sales when no product-level filter is active.
  // dealer_sales_lines is sparsely populated; aggregates have full totals.
  const useAggregates = brands.length === 0 && categories.length === 0 && collections.length === 0 && skus.length === 0;

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

  // Filtered product set for value lookups
  const filteredProductIds = useMemo(() => {
    let list = products;
    if (brands.length > 0) list = list.filter((p) => p.brand && brands.includes(p.brand));
    if (categories.length > 0) list = list.filter((p) => p.category && categories.includes(p.category));
    if (collections.length > 0) list = list.filter((p) => p.collection && collections.includes(p.collection));
    if (skus.length > 0) list = list.filter((p) => skus.includes(p.id));
    return new Set(list.map((p) => p.id));
  }, [products, brands, categories, collections, skus]);

  const dealerIdSet = useMemo(() => {
    if (dealerIds.length > 0) return new Set(dealerIds);
    return new Set(visibleDealers.map((d) => d.id));
  }, [dealerIds, visibleDealers]);

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
      if (groupBy === "dealer") return dealers.find((d) => d.id === key)?.name ?? "—";
      if (groupBy === "rep") return reps.find((r) => r.id === key)?.name ?? "—";
      return territories.find((t) => t.id === key)?.name ?? "—";
    };

    const rows = new Map<Key, { primary: number; comparative: number; byMonth: Map<string, number> }>();

    const source = useAggregates ? aggregates : lines;
    for (const line of source) {
      if (!dealerIdSet.has(line.dealer_id)) continue;
      if (!useAggregates && !filteredProductIds.has((line as { product_id: string }).product_id)) continue;
      // Normalize month: dealer_sales uses "01"-"12", lines/keys use month names
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
      if (!row) {
        row = { primary: 0, comparative: 0, byMonth: new Map() };
        rows.set(k, row);
      }
      if (inPrim) row.primary += val;
      if (inComp) row.comparative += val;
      row.byMonth.set(monthKey, (row.byMonth.get(monthKey) ?? 0) + val);
    }

    const sorted = Array.from(rows.entries())
      .map(([k, v]) => ({ key: k, label: rowLabel(k), ...v }))
      .sort((a, b) => b.primary - a.primary);

    return { rows: sorted, primMonths, compMonths };
  }, [lines, aggregates, useAggregates, dealers, reps, territories, dealerIdSet, filteredProductIds, primary, comparative, metric, groupBy]);

  const leftHeader = groupBy === "dealer" ? "Dealer" : groupBy === "rep" ? "Rep" : "Territory";
  const noData = useAggregates ? aggregates.length === 0 : lines.length === 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <DateRangePicker label="Primary date range" value={primary} onChange={setPrimary} />
            <DateRangePicker label="Comparative date range" value={comparative} onChange={setComparative} />

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
              options={visibleSkus.map((p) => ({ value: p.id, label: p.name ? `${p.sku} — ${p.name}` : p.sku }))}
              searchable
              searchPlaceholder="Search SKU or name..."
            />
          </div>
        </CardContent>
      </Card>

      {noData && (
        <Card className="border-dashed">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No SKU-level sales data yet</p>
              <p className="text-xs text-muted-foreground">
                The SKU-level sync from Acctivate hasn't populated <span className="font-mono">products</span> or{" "}
                <span className="font-mono">dealer_sales_lines</span> yet. Once the sync brings in dealer × SKU × month rows, this report will fill in automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {metric === "bookings" ? "Bookings" : "Invoices"} by {leftHeader}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{aggregation.rows.length} rows</Badge>
            <Badge variant="outline">{format(primary.from, "MMM d, yyyy")} – {format(primary.to, "MMM d, yyyy")}</Badge>
            <Badge variant="outline">vs {format(comparative.from, "MMM d, yyyy")} – {format(comparative.to, "MMM d, yyyy")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {display === "monthly" ? (
              <MonthlyTable
                rows={aggregation.rows}
                primMonths={aggregation.primMonths}
                compMonths={aggregation.compMonths}
                leftHeader={leftHeader}
              />
            ) : (
              <TotalTable rows={aggregation.rows} leftHeader={leftHeader} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TotalTable({
  rows, leftHeader,
}: {
  rows: { key: string; label: string; primary: number; comparative: number }[];
  leftHeader: string;
}) {
  const totalP = rows.reduce((s, r) => s + r.primary, 0);
  const totalC = rows.reduce((s, r) => s + r.comparative, 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/30">
          <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-muted/30">{leftHeader}</th>
          <th className="text-right p-3 font-medium text-muted-foreground">Primary</th>
          <th className="text-right p-3 font-medium text-muted-foreground">Comparative</th>
          <th className="text-right p-3 font-medium text-muted-foreground">Δ</th>
          <th className="text-right p-3 font-medium text-muted-foreground">% Δ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const delta = r.primary - r.comparative;
          const pct = r.comparative === 0 ? 0 : (delta / r.comparative) * 100;
          return (
            <tr key={r.key} className="border-b last:border-0 hover:bg-muted/20">
              <td className="p-3 font-medium sticky left-0 bg-background">{r.label}</td>
              <td className="p-3 text-right tabular-nums">{formatCurrency(r.primary)}</td>
              <td className="p-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.comparative)}</td>
              <td className={cn("p-3 text-right tabular-nums", delta >= 0 ? "text-green-600" : "text-destructive")}>
                {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
              </td>
              <td className={cn("p-3 text-right tabular-nums", pct >= 0 ? "text-green-600" : "text-destructive")}>
                {r.comparative === 0 ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">No data for the selected filters.</td></tr>
        )}
        {rows.length > 0 && (
          <tr className="border-t-2 font-semibold bg-muted/20">
            <td className="p-3 sticky left-0 bg-muted/20">Total</td>
            <td className="p-3 text-right tabular-nums">{formatCurrency(totalP)}</td>
            <td className="p-3 text-right tabular-nums">{formatCurrency(totalC)}</td>
            <td className="p-3 text-right tabular-nums">{formatCurrency(totalP - totalC)}</td>
            <td className="p-3 text-right tabular-nums">
              {totalC === 0 ? "—" : `${((totalP - totalC) / totalC * 100).toFixed(1)}%`}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function MonthlyTable({
  rows, primMonths, compMonths, leftHeader,
}: {
  rows: { key: string; label: string; primary: number; comparative: number; byMonth: Map<string, number> }[];
  primMonths: { key: string; label: string }[];
  compMonths: { key: string; label: string }[];
  leftHeader: string;
}) {
  // Interleave primary then comparative pairs by month index
  const interleaved: { key: string; label: string }[] = [];
  const max = Math.max(primMonths.length, compMonths.length);
  for (let i = 0; i < max; i++) {
    if (primMonths[i]) interleaved.push(primMonths[i]);
    if (compMonths[i]) interleaved.push(compMonths[i]);
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/30">
          <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-muted/30 z-10">{leftHeader}</th>
          {interleaved.map((m) => (
            <th key={m.key} className="text-right p-3 font-medium text-muted-foreground whitespace-nowrap">{m.label}</th>
          ))}
          <th className="text-right p-3 font-medium text-muted-foreground border-l">Primary Total</th>
          <th className="text-right p-3 font-medium text-muted-foreground">Comparative Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b last:border-0 hover:bg-muted/20">
            <td className="p-3 font-medium sticky left-0 bg-background z-10">{r.label}</td>
            {interleaved.map((m) => (
              <td key={m.key} className="p-3 text-right tabular-nums whitespace-nowrap">
                {formatCurrency(r.byMonth.get(m.key) ?? 0)}
              </td>
            ))}
            <td className="p-3 text-right tabular-nums border-l font-medium">{formatCurrency(r.primary)}</td>
            <td className="p-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.comparative)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={interleaved.length + 3} className="p-8 text-center text-muted-foreground text-sm">No data for the selected filters.</td></tr>
        )}
      </tbody>
    </table>
  );
}
