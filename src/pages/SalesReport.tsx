import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Filter, X, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import {
  useSalesReps, useTerritories, useDealers, useManagers,
  useDealerSales, formatCurrency,
} from "@/hooks/usePortalData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Metric = "bookings" | "invoices";

interface SalesReportProps {
  metric: Metric;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_INDEX: Record<string, number> = MONTHS.reduce((acc, m, i) => ({ ...acc, [m]: i }), {});

type SortKey = "dealer" | "rep" | "manager" | "territory" | "value";
type SortDir = "asc" | "desc";

export default function SalesReport({ metric }: SalesReportProps) {
  const { data: reps = [], isLoading: l1 } = useSalesReps();
  const { data: territories = [], isLoading: l2 } = useTerritories();
  const { data: dealers = [], isLoading: l3 } = useDealers();
  const { data: managers = [], isLoading: l4 } = useManagers();
  const { data: sales = [], isLoading: l5 } = useDealerSales();

  const isLoading = l1 || l2 || l3 || l4 || l5;

  // Filter state
  const [year, setYear] = useState<number>(2026);
  const [monthFrom, setMonthFrom] = useState<number>(0); // Jan
  const [monthTo, setMonthTo] = useState<number>(11);    // Dec
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState<string[]>([]);
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const useDateRange = !!(dateFrom && dateTo);

  const title = metric === "bookings" ? "YTD Bookings Report" : "YTD Invoicing Report";
  const valueLabel = metric === "bookings" ? "Bookings" : "Invoices";

  const visibleManagers = useMemo(
    () => managers.filter(m => {
      const n = m.name.trim().toLowerCase();
      const e = m.email?.trim().toLowerCase();
      return n !== "sales" && e !== "sales@lineage-collections.com";
    }),
    [managers],
  );

  const repsById = useMemo(() => new Map(reps.map(r => [r.id, r])), [reps]);
  const territoriesById = useMemo(() => new Map(territories.map(t => [t.id, t])), [territories]);
  const managersById = useMemo(() => new Map(managers.map(m => [m.id, m])), [managers]);

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    sales.forEach(s => ys.add(s.year));
    if (ys.size === 0) { ys.add(2025); ys.add(2026); }
    return Array.from(ys).sort((a, b) => b - a);
  }, [sales]);

  // Date-range to (year, month) bounds when active
  const dateBounds = useMemo(() => {
    if (!useDateRange || !dateFrom || !dateTo) return null;
    return {
      fromY: dateFrom.getFullYear(),
      fromM: dateFrom.getMonth(),
      toY: dateTo.getFullYear(),
      toM: dateTo.getMonth(),
    };
  }, [useDateRange, dateFrom, dateTo]);

  // Filter dealers
  const filteredDealers = useMemo(() => {
    return dealers.filter(d => {
      if (selectedDealerIds.length > 0 && !selectedDealerIds.includes(d.id)) return false;
      if (selectedTerritoryIds.length > 0 && !selectedTerritoryIds.includes(d.territory_id ?? "")) return false;
      if (selectedRepIds.length > 0 && !selectedRepIds.includes(d.rep_id ?? "")) return false;
      if (selectedManagerIds.length > 0) {
        const rep = d.rep_id ? repsById.get(d.rep_id) : undefined;
        if (!rep?.manager_id || !selectedManagerIds.includes(rep.manager_id)) return false;
      }
      return true;
    });
  }, [dealers, selectedDealerIds, selectedTerritoryIds, selectedRepIds, selectedManagerIds, repsById]);

  const filteredDealerIds = useMemo(() => new Set(filteredDealers.map(d => d.id)), [filteredDealers]);

  // Filter sales by date-range OR (year + month range), and by visible dealers
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const mIdx = MONTH_INDEX[s.month];
      if (mIdx === undefined) return false;
      if (dateBounds) {
        const key = s.year * 12 + mIdx;
        const lo = dateBounds.fromY * 12 + dateBounds.fromM;
        const hi = dateBounds.toY * 12 + dateBounds.toM;
        if (key < lo || key > hi) return false;
      } else {
        if (s.year !== year) return false;
        if (mIdx < monthFrom || mIdx > monthTo) return false;
      }
      if (!filteredDealerIds.has(s.dealer_id)) return false;
      return true;
    });
  }, [sales, year, monthFrom, monthTo, dateBounds, filteredDealerIds]);

  const getValue = (s: typeof sales[number]) => {
    if (metric === "bookings") return (s.bookings ?? 0) > 0 ? (s.bookings ?? 0) : (s.revenue ?? 0);
    return (s.invoices ?? 0) > 0 ? (s.invoices ?? 0) : (s.revenue ?? 0);
  };

  // Aggregate per dealer
  const rows = useMemo(() => {
    const map = new Map<string, number>();
    filteredSales.forEach(s => {
      map.set(s.dealer_id, (map.get(s.dealer_id) ?? 0) + getValue(s));
    });
    const list = filteredDealers.map(d => {
      const rep = d.rep_id ? repsById.get(d.rep_id) : undefined;
      const territory = d.territory_id ? territoriesById.get(d.territory_id) : undefined;
      const mgr = rep?.manager_id ? managersById.get(rep.manager_id) : undefined;
      return {
        id: d.id,
        dealer: d.name,
        rep: rep?.name ?? "Unassigned",
        repCode: rep?.acctivate_id ?? "",
        manager: mgr?.name ?? "—",
        territory: territory?.name ?? "—",
        state: d.state ?? "",
        value: map.get(d.id) ?? 0,
      };
    });
    return list;
  }, [filteredDealers, filteredSales, repsById, territoriesById, managersById, metric]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "dealer": cmp = a.dealer.localeCompare(b.dealer); break;
        case "rep": cmp = a.rep.localeCompare(b.rep); break;
        case "manager": cmp = a.manager.localeCompare(b.manager); break;
        case "territory": cmp = a.territory.localeCompare(b.territory); break;
        case "value": cmp = a.value - b.value; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  // KPIs
  const total = useMemo(() => rows.reduce((s, r) => s + r.value, 0), [rows]);
  const dealerCount = rows.filter(r => r.value > 0).length;
  const avgPerDealer = dealerCount > 0 ? total / dealerCount : 0;
  const topDealer = sortedRows[0];

  // Trend data: by month
  const trendData = useMemo(() => {
    const buckets: Record<string, { month: string; value: number }> = {};
    for (let i = monthFrom; i <= monthTo; i++) {
      buckets[MONTHS[i]] = { month: MONTHS[i], value: 0 };
    }
    filteredSales.forEach(s => {
      if (buckets[s.month]) buckets[s.month].value += getValue(s);
    });
    return Object.values(buckets);
  }, [filteredSales, monthFrom, monthTo, metric]);

  // Top 10 dealers chart
  const topDealersChart = useMemo(() => {
    return [...sortedRows].sort((a, b) => b.value - a.value).slice(0, 10).map(r => ({
      name: r.dealer.length > 20 ? r.dealer.slice(0, 18) + "…" : r.dealer,
      value: r.value,
    }));
  }, [sortedRows]);

  // By rep chart
  const byRepChart = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => map.set(r.rep, (map.get(r.rep) ?? 0) + r.value));
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rows]);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const clearAll = () => {
    setSelectedManagerIds([]);
    setSelectedRepIds([]);
    setSelectedTerritoryIds([]);
    setSelectedDealerIds([]);
  };

  const hasFilters = selectedManagerIds.length + selectedRepIds.length +
    selectedTerritoryIds.length + selectedDealerIds.length > 0;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "value" ? "desc" : "asc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 inline ml-1" />
      : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  const exportCsv = () => {
    const periodLabel = useDateRange && dateFrom && dateTo
      ? `${format(dateFrom, "yyyy-MM-dd")}_to_${format(dateTo, "yyyy-MM-dd")}`
      : `${year}-${MONTHS[monthFrom]}-${MONTHS[monthTo]}`;
    const headers = ["Dealer", "Rep Code", "Rep", "Manager", "Territory", `${valueLabel} (${periodLabel})`];
    const lines = [headers.join(",")];
    sortedRows.forEach(r => {
      const cells = [r.dealer, r.repCode, r.rep, r.manager, r.territory, r.value.toString()]
        .map(c => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${metric}-report-${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground">
        <Link to="/managers"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {dealerCount} active dealers • {useDateRange && dateFrom && dateTo
              ? `${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`
              : `${year}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {(hasFilters || useDateRange || year !== 2026) && (
                  <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                    {selectedManagerIds.length + selectedRepIds.length + selectedTerritoryIds.length + selectedDealerIds.length + 1}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Report Filters</SheetTitle>
                <SheetDescription>Customize the data shown in this report.</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Date range</label>
                    {useDateRange && (
                      <button
                        type="button"
                        onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("h-9 flex-1 justify-start font-normal", !dateFrom && "text-muted-foreground")}>
                          <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                          {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <span className="text-xs text-muted-foreground">to</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("h-9 flex-1 justify-start font-normal", !dateTo && "text-muted-foreground")}>
                          <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                          {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {useDateRange && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">Date range overrides Year and Month selections.</p>
                  )}
                </div>

                <FilterSection
                  label="Managers"
                  count={selectedManagerIds.length}
                  items={visibleManagers.map(m => ({ id: m.id, label: m.name }))}
                  selected={selectedManagerIds}
                  onToggle={(id) => toggle(selectedManagerIds, setSelectedManagerIds, id)}
                  onClear={() => setSelectedManagerIds([])}
                />
                <FilterSection
                  label="Reps"
                  count={selectedRepIds.length}
                  items={reps.map(r => ({ id: r.id, label: r.name }))}
                  selected={selectedRepIds}
                  onToggle={(id) => toggle(selectedRepIds, setSelectedRepIds, id)}
                  onClear={() => setSelectedRepIds([])}
                />
                <FilterSection
                  label="Territories"
                  count={selectedTerritoryIds.length}
                  items={territories.map(t => ({ id: t.id, label: t.name }))}
                  selected={selectedTerritoryIds}
                  onToggle={(id) => toggle(selectedTerritoryIds, setSelectedTerritoryIds, id)}
                  onClear={() => setSelectedTerritoryIds([])}
                />
                <FilterSection
                  label={`Dealers (${dealers.length} synced)`}
                  count={selectedDealerIds.length}
                  items={dealers.map(d => ({ id: d.id, label: d.name }))}
                  selected={selectedDealerIds}
                  onToggle={(id) => toggle(selectedDealerIds, setSelectedDealerIds, id)}
                  onClear={() => setSelectedDealerIds([])}
                />
              </div>

              <SheetFooter className="mt-6">
                <Button variant="outline" size="sm" onClick={() => { clearAll(); setYear(2026); setMonthFrom(0); setMonthTo(11); setDateFrom(undefined); setDateTo(undefined); }} className="gap-2">
                  <X className="h-4 w-4" /> Reset all
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Button onClick={exportCsv} size="sm" variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Total {valueLabel}</p>
          <p className="text-xl font-bold">{formatCurrency(total)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Active Dealers</p>
          <p className="text-xl font-bold">{dealerCount}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Avg / Dealer</p>
          <p className="text-xl font-bold">{formatCurrency(avgPerDealer)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Top Dealer</p>
          <p className="text-sm font-semibold truncate">{topDealer?.dealer ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(topDealer?.value ?? 0)}</p>
        </CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top 10 Dealers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDealersChart} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {byRepChart.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">By Rep</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byRepChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Detail ({sortedRows.length} rows)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="table-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("dealer")}>Dealer{sortIcon("dealer")}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("rep")}>Rep{sortIcon("rep")}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("manager")}>Manager{sortIcon("manager")}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("territory")}>Territory{sortIcon("territory")}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("value")}>{valueLabel}{sortIcon("value")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{row.dealer}</td>
                    <td className="p-3">{row.rep}</td>
                    <td className="p-3 text-muted-foreground">{row.manager}</td>
                    <td className="p-3 text-muted-foreground">{row.territory}</td>
                    
                    <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(row.value)}</td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No data for current filters.</td></tr>
                )}
              </tbody>
              {sortedRows.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="p-3" colSpan={4}>Total</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface FilterSectionProps {
  label: string;
  count: number;
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

function FilterSection({ label, count, items, selected, onToggle, onClear }: FilterSectionProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.label.localeCompare(b.label)),
    [items],
  );
  const filtered = useMemo(
    () => sorted.filter(i => i.label.toLowerCase().includes(query.toLowerCase())),
    [sorted, query],
  );

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          {count > 0 && <Badge variant="secondary" className="px-1.5 text-[10px]">{count}</Badge>}
        </span>
        <span className="flex items-center gap-2">
          {count > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </span>
          )}
          <span className="text-muted-foreground text-xs">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="border-t p-2 space-y-2">
          {items.length > 6 && (
            <input
              type="text"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 px-2 text-xs border rounded bg-background"
            />
          )}
          <div className="h-56 overflow-y-auto overscroll-contain pr-1 border rounded bg-background/50">
            {filtered.length === 0 && <p className="p-2 text-xs text-muted-foreground">No matches</p>}
            {filtered.map(it => (
              <label key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                <Checkbox checked={selected.includes(it.id)} onCheckedChange={() => onToggle(it.id)} />
                <span className="truncate">{it.label}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground px-1">{filtered.length} of {items.length}</p>
        </div>
      )}
    </div>
  );
}
