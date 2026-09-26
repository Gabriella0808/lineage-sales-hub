import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, subDays } from "date-fns";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, CheckCircle2, ChevronRight, Download, Search, Store, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useSalesReps } from "@/hooks/usePortalData";
import { TARGET_MONTHS, useRepTargets } from "@/hooks/useRepTargets";
import { TargetProgressChart } from "@/components/TargetProgressChart";

interface Props {
  /** The selected manager's records (real + any bare duplicates); null = company-wide. */
  managerIds: string[] | null;
  managerName?: string;
  refreshKey: number;
  onOpenReport: (key: "live-kpi" | "dealer-reporting" | "rep-reporting") => void;
}

interface Row {
  metric_type: string | null;
  amount: number | string | null;
  transaction_date: string | null;
  customer_id: string | null;
  dealer_name: string | null;
  brand_category: string | null;
  product_class: string | null;
  portal_rep_id: string | null;
  rep_name: string | null;
}

type PeriodKey = "mtd" | "qtd" | "d30" | "d90" | "ytd";
type DealerTab = "top" | "slowing" | "growing" | "quiet" | "new";

const PAGE = 1000;
const QUIET_DAYS = 60;
const START_MONTH = 6; // overview counts July 1 onward; Jan to Jun are excluded by request
const SINCE = "since Jul 1";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (d: Date) => format(d, "yyyy-MM-dd");

const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M` : a >= 1_000 ? `$${Math.round(a / 1_000)}K` : `$${Math.round(a)}`;
  return n < 0 ? `-${s}` : s;
};
const moneyFull = (n: number) => `$${Math.round(n).toLocaleString()}`;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

// Fetches every row using parallel pages: one request learns the total count,
// then the remaining pages load at the same time instead of one after another.
async function fetchAll<T>(build: (from: number, to: number, withCount: boolean) => PageResult<T>): Promise<T[]> {
  const first = await build(0, PAGE - 1, true);
  if (first.error) throw new Error(first.error.message);
  const firstRows = first.data ?? [];
  const total = first.count ?? firstRows.length;
  if (firstRows.length < PAGE || total <= PAGE) return firstRows;

  const starts: number[] = [];
  for (let start = PAGE; start < total; start += PAGE) starts.push(start);
  const pages = await Promise.all(starts.map(async (start) => {
    const res = await build(start, start + PAGE - 1, false);
    if (res.error) throw new Error(res.error.message);
    return res.data ?? [];
  }));
  return firstRows.concat(...pages);
}

const EXEC_ROW_COLUMNS = "metric_type, amount, transaction_date, customer_id, dealer_name, brand_category, product_class, portal_rep_id, rep_name";

function execRowsQuery(year: number, managerIds: string[] | null, refreshKey: number) {
  return {
    queryKey: ["exec_overview_rows_v2", year, managerIds, refreshKey],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: () => fetchAll<Row>((from, to, withCount) => {
      // Ordered by every selected column so parallel pages never skip or repeat a row.
      let q = (supabase as any)
        .from("v_companywide_reporting_actuals")
        .select(EXEC_ROW_COLUMNS, withCount ? { count: "exact" } : undefined)
        .gte("transaction_date", `${year}-07-01`)
        .in("metric_type", ["bookings", "invoiced"])
        .order("transaction_date", { ascending: true })
        .order("customer_id", { ascending: true })
        .order("metric_type", { ascending: true })
        .order("product_class", { ascending: true })
        .order("brand_category", { ascending: true })
        .order("portal_rep_id", { ascending: true })
        .order("amount", { ascending: true })
        .range(from, to);
      if (managerIds) q = q.in("manager_id", managerIds);
      return q;
    }),
  };
}

function execBacklogQuery(managerIds: string[] | null, refreshKey: number) {
  return {
    queryKey: ["exec_overview_backlog", managerIds, refreshKey],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const rows = await fetchAll<{ open_so_amount: number | string | null; order_number: string | null }>((from, to, withCount) => {
        let q = (supabase as any)
          .from("v_portal_open_sales_order_line_facts")
          .select("open_so_amount, order_number", withCount ? { count: "exact" } : undefined)
          .order("order_number", { ascending: true })
          .order("sku", { ascending: true })
          .order("open_so_amount", { ascending: true })
          .range(from, to);
        if (managerIds) q = q.in("manager_id", managerIds);
        return q;
      });
      const orders = new Set<string>();
      let total = 0;
      for (const r of rows) {
        total += Number(r.open_so_amount) || 0;
        if (r.order_number) orders.add(r.order_number);
      }
      return { total, orders: orders.size };
    },
  };
}

// Called from the Company-wide page shortly after it opens so the High-Level
// Reporting tab is already loaded by the time someone clicks it.
export function prefetchExecutiveData(qc: QueryClient, managerIds: string[] | null, refreshKey: number) {
  const year = new Date().getFullYear();
  qc.prefetchQuery(execRowsQuery(year, managerIds, refreshKey));
  qc.prefetchQuery(execBacklogQuery(managerIds, refreshKey));
}

function useExecutiveRows(year: number, managerIds: string[] | null, refreshKey: number) {
  return useQuery({ ...execRowsQuery(year, managerIds, refreshKey), placeholderData: keepPreviousData });
}

function useOpenBacklog(managerIds: string[] | null, refreshKey: number) {
  return useQuery({ ...execBacklogQuery(managerIds, refreshKey), placeholderData: keepPreviousData });
}

interface Win { start: string; end: string; pStart: string | null; pEnd: string | null; label: string; prevLabel: string }

function buildWindows(today: Date): Record<PeriodKey, Win & { available: boolean }> {
  const year = today.getFullYear();
  const jan1 = `${year}-07-01`;
  const T = iso(today);
  const m = today.getMonth();
  const day = today.getDate();

  const mStart = iso(new Date(year, m, 1));
  const pmStart = m > 0 ? iso(new Date(year, m - 1, 1)) : null;
  const pmEnd = m > 0 ? iso(new Date(year, m - 1, Math.min(day, endOfMonth(new Date(year, m - 1, 1)).getDate()))) : null;

  const qm = Math.floor(m / 3) * 3;
  const qStart = iso(new Date(year, qm, 1));
  const qDays = differenceInCalendarDays(today, new Date(year, qm, 1));
  const pqStart = qm > 0 ? iso(new Date(year, qm - 3, 1)) : null;
  const pqEnd = pqStart ? iso(addDays(parseISO(pqStart), qDays)) : null;

  const win = (n: number): Win & { available: boolean } => {
    const start = iso(subDays(today, n - 1));
    const pStart = iso(subDays(today, 2 * n - 1));
    const pEnd = iso(subDays(today, n));
    return { start, end: T, pStart, pEnd, label: `Last ${n} days`, prevLabel: `previous ${n} days`, available: pStart >= jan1 };
  };

  const ok = (s: string | null) => (s && s >= jan1 ? s : null);
  return {
    mtd: { start: mStart, end: T, pStart: ok(pmStart), pEnd: ok(pmStart) ? pmEnd : null, label: "Month to date", prevLabel: "same days last month", available: true },
    qtd: { start: qStart, end: T, pStart: ok(pqStart), pEnd: ok(pqStart) ? pqEnd : null, label: "Quarter to date", prevLabel: "same days last quarter", available: true },
    d30: win(30),
    d90: win(90),
    ytd: { start: jan1, end: T, pStart: null, pEnd: null, label: "Since Jul 1", prevLabel: "", available: true },
  };
}

interface DealerAgg { key: string; name: string; ytd: number; cur: number; prev: number; last: string; first: string }
interface RepAgg { key: string; name: string; ytdB: number; ytdI: number; cur: number; prev: number; curI: number; dealers: Set<string> }

export function ExecutiveOverview({ managerIds, managerName, refreshKey, onOpenReport }: Props) {
  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: rows = [], isLoading, error, dataUpdatedAt } = useExecutiveRows(year, managerIds, refreshKey);
  const { data: backlog } = useOpenBacklog(managerIds, refreshKey);
  const { data: targets = [] } = useRepTargets(year);
  const { data: reps = [] } = useSalesReps();

  const windows = useMemo(() => buildWindows(today), [today]);
  const [period, setPeriod] = useState<PeriodKey>("mtd");
  const [tab, setTab] = useState<DealerTab>("top");
  const [dealerSearch, setDealerSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drill, setDrill] = useState<{ type: "dealer" | "rep"; key: string; name: string } | null>(null);
  const W = windows[period];

  const model = useMemo(() => {
    const T = iso(today);
    const curMonth = today.getMonth() + 1;
    const dayOfMonth = today.getDate();
    const inCur = (d: string) => d >= W.start && d <= W.end;
    const inPrev = (d: string) => !!W.pStart && !!W.pEnd && d >= W.pStart && d <= W.pEnd;
    const quietCut = iso(subDays(today, QUIET_DAYS));

    const monthB = Array(12).fill(0) as number[];
    const monthI = Array(12).fill(0) as number[];
    const weekB = Array(12).fill(0) as number[];
    const weekI = Array(12).fill(0) as number[];
    const weekDealers: Set<string>[] = Array.from({ length: 12 }, () => new Set<string>());
    const dealers = new Map<string, DealerAgg>();
    const repAgg = new Map<string, RepAgg>();
    const brands = new Map<string, number>();
    const collections = new Map<string, number>();
    let ytdB = 0, ytdI = 0, curB = 0, prevB = 0, curI = 0, prevI = 0, unassigned = 0, bookingRows = 0;
    const curDealers = new Set<string>();
    const prevDealers = new Set<string>();

    for (const r of rows) {
      const d = (r.transaction_date ?? "").slice(0, 10);
      if (!d) continue;
      const a = Number(r.amount) || 0;
      const mi = parseInt(d.slice(5, 7), 10) - 1;
      const isB = r.metric_type === "bookings";
      const repKey = r.portal_rep_id ?? "unassigned";
      let rep = repAgg.get(repKey);
      if (!rep) {
        rep = { key: repKey, name: r.portal_rep_id ? (r.rep_name ?? "Unnamed rep") : "Unassigned", ytdB: 0, ytdI: 0, cur: 0, prev: 0, curI: 0, dealers: new Set() };
        repAgg.set(repKey, rep);
      }
      const wk = Math.floor(differenceInCalendarDays(today, parseISO(d)) / 7);
      if (isB) {
        bookingRows++;
        if (!r.portal_rep_id) unassigned++;
        ytdB += a; monthB[mi] += a; rep.ytdB += a;
        const dKey = r.customer_id ?? r.dealer_name ?? "unknown";
        let dl = dealers.get(dKey);
        if (!dl) {
          dl = { key: dKey, name: r.dealer_name ?? "Unknown dealer", ytd: 0, cur: 0, prev: 0, last: d, first: d };
          dealers.set(dKey, dl);
        }
        dl.ytd += a;
        if (d > dl.last) dl.last = d;
        if (d < dl.first) dl.first = d;
        if (wk >= 0 && wk < 12) { weekB[wk] += a; weekDealers[wk].add(dKey); }
        if (inCur(d)) {
          curB += a; dl.cur += a; rep.cur += a; rep.dealers.add(dKey); curDealers.add(dKey);
          const brand = (r.brand_category ?? "").trim() || "Unclassified";
          brands.set(brand, (brands.get(brand) ?? 0) + a);
          const coll = (r.product_class ?? "").trim() || "__none__";
          collections.set(coll, (collections.get(coll) ?? 0) + a);
        } else if (inPrev(d)) {
          prevB += a; dl.prev += a; rep.prev += a; prevDealers.add(dKey);
        }
      } else {
        ytdI += a; monthI[mi] += a; rep.ytdI += a;
        if (wk >= 0 && wk < 12) weekI[wk] += a;
        if (inCur(d)) { curI += a; rep.curI += a; }
        else if (inPrev(d)) prevI += a;
      }
    }

    // Rep targets are set against invoicing (see Sales Targets page).
    const inScope = new Set(reps.filter((r) => !managerIds || (!!r.manager_id && managerIds.includes(r.manager_id))).map((r) => r.id));
    const scoped = targets.filter((t) => inScope.has(t.rep_id));
    const daysInCur = new Date(year, curMonth, 0).getDate();
    const frac = (i: number) => (i < START_MONTH ? 0 : i + 1 < curMonth ? 1 : i + 1 === curMonth ? dayOfMonth / daysInCur : 0);
    const toDate = (t: typeof targets[number]) => TARGET_MONTHS.reduce((s, k, i) => s + (Number(t[k]) || 0) * frac(i), 0);
    const monthTarget = TARGET_MONTHS.map((k, i) => (i < START_MONTH ? 0 : scoped.reduce((s, t) => s + (Number(t[k]) || 0), 0)));
    const annualTarget = monthTarget.reduce((s, v) => s + v, 0);
    const targetYtd = scoped.reduce((s, t) => s + toDate(t), 0);
    const targetByRep = new Map(scoped.map((t) => [t.rep_id, toDate(t)]));
    const yearFrac = (differenceInCalendarDays(today, new Date(year, START_MONTH, 1)) + 1) / 184;
    const projectedInvoiced = yearFrac > 0 ? ytdI / yearFrac : 0;

    const list = [...dealers.values()];
    const tabs: Record<DealerTab, DealerAgg[]> = {
      top: [...list].sort((a, b) => b.cur - a.cur).filter((d) => d.cur > 0),
      slowing: W.pStart ? list.filter((d) => d.prev > d.cur).sort((a, b) => (b.prev - b.cur) - (a.prev - a.cur)) : [],
      growing: W.pStart ? list.filter((d) => d.cur > d.prev).sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev)) : [],
      quiet: list.filter((d) => d.last < quietCut).sort((a, b) => b.ytd - a.ytd),
      new: list.filter((d) => d.cur > 0 && d.first >= W.start).sort((a, b) => b.cur - a.cur),
    };

    const repList = [...repAgg.values()].filter((r) => r.ytdB > 0 || r.ytdI > 0).sort((a, b) => b.cur - a.cur || b.ytdB - a.ytdB);
    const brandList = [...brands.entries()].sort((a, b) => b[1] - a[1]);
    const namedColl = [...collections.entries()].filter(([k]) => k !== "__none__").sort((a, b) => b[1] - a[1]);
    const collectionList: [string, number][] = [
      ...namedColl,
      ...(collections.get("__none__") ? [["No collection assigned", collections.get("__none__")!] as [string, number]] : []),
    ];
    const top10Share = ytdB > 0 ? ([...list].sort((a, b) => b.ytd - a.ytd).slice(0, 10).reduce((s, d) => s + d.ytd, 0) / ytdB) * 100 : 0;

    const spark = (arr: number[]) => arr.map((v, i) => ({ i, v })).reverse();
    const chart = MONTH_LABELS.slice(START_MONTH, curMonth).map((label, k) => { const i = k + START_MONTH; return {
      label, Bookings: Math.round(monthB[i]), Invoiced: Math.round(monthI[i]),
      Target: monthTarget[i] > 0 ? Math.round(monthTarget[i]) : undefined,
    }; });

    return {
      T, ytdB, ytdI, curB, prevB, curI, prevI, chart, tabs, repList, brandList, collectionList, top10Share,
      activeDealers: curDealers.size, prevActiveDealers: prevDealers.size, totalDealers: list.length,
      annualTarget, targetYtd, targetByRep, hasTargets: annualTarget > 0, projectedInvoiced,
      sparkB: spark(weekB), sparkI: spark(weekI), sparkD: spark(weekDealers.map((s) => s.size)),
      unassignedShare: bookingRows > 0 ? (unassigned / bookingRows) * 100 : 0,
      quietValue: tabs.quiet.reduce((s, d) => s + d.ytd, 0),
    };
  }, [rows, targets, reps, managerIds, today, year, W]);

  const drillModel = useMemo(() => {
    if (!drill) return null;
    const mB = Array(12).fill(0) as number[];
    const mI = Array(12).fill(0) as number[];
    const dl = new Map<string, { name: string; v: number }>();
    const br = new Map<string, number>();
    let last = "";
    for (const r of rows) {
      const d = (r.transaction_date ?? "").slice(0, 10);
      if (!d) continue;
      const match = drill.type === "dealer" ? (r.customer_id ?? r.dealer_name ?? "unknown") === drill.key : (r.portal_rep_id ?? "unassigned") === drill.key;
      if (!match) continue;
      const a = Number(r.amount) || 0;
      const mi = parseInt(d.slice(5, 7), 10) - 1;
      if (r.metric_type === "bookings") {
        mB[mi] += a;
        if (d > last) last = d;
        const bk = (r.brand_category ?? "").trim() || "Unclassified";
        br.set(bk, (br.get(bk) ?? 0) + a);
        const dk = r.customer_id ?? r.dealer_name ?? "unknown";
        const cur = dl.get(dk) ?? { name: r.dealer_name ?? "Unknown dealer", v: 0 };
        cur.v += a; dl.set(dk, cur);
      } else mI[mi] += a;
    }
    const curMonth = today.getMonth() + 1;
    return {
      chart: MONTH_LABELS.slice(START_MONTH, curMonth).map((label, k) => ({ label, Bookings: Math.round(mB[k + START_MONTH]), Invoiced: Math.round(mI[k + START_MONTH]) })),
      mB, mI,
      totalB: mB.reduce((s, v) => s + v, 0), totalI: mI.reduce((s, v) => s + v, 0),
      dealers: [...dl.values()].sort((a, b) => b.v - a.v).slice(0, 8),
      brands: [...br.entries()].sort((a, b) => b[1] - a[1]),
      last,
    };
  }, [drill, rows, today]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
        <div className="grid gap-4 xl:grid-cols-3"><Skeleton className="h-80 xl:col-span-2" /><Skeleton className="h-80" /></div>
      </div>
    );
  }
  if (error) return <Card><CardContent className="p-6 text-sm text-destructive">Could not load the overview: {(error as Error).message}</CardContent></Card>;
  if (rows.length === 0) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No bookings or invoices found since Jul 1 for this selection.</CardContent></Card>;

  const m = model;
  const hasPrev = !!W.pStart;
  const change = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
  const attainment = m.hasTargets && m.targetYtd > 0 ? (m.ytdI / m.targetYtd) * 100 : null;
  const first = (user?.email ?? "").split("@")[0].split(/[._-]/)[0];
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const insights: { tone: "good" | "warn" | "bad"; title: string; text: string }[] = [];
  if (attainment !== null) insights.push({
    tone: attainment >= 95 ? "good" : attainment >= 75 ? "warn" : "bad",
    title: `${Math.round(attainment)}% of invoicing pace`,
    text: `${money(m.ytdI)} invoiced against a target-to-date of ${money(m.targetYtd)}.`,
  });
  const bc = change(m.curB, m.prevB);
  if (hasPrev && bc !== null) insights.push({
    tone: bc >= 0 ? "good" : bc > -15 ? "warn" : "bad",
    title: `Bookings ${bc >= 0 ? "up" : "down"} ${Math.abs(Math.round(bc))}%`,
    text: `${money(m.curB)} ${W.label.toLowerCase()} vs ${money(m.prevB)} ${W.prevLabel}.`,
  });
  if (m.tabs.quiet.length > 0) insights.push({
    tone: "warn", title: `${m.tabs.quiet.length} dealers gone quiet`,
    text: `No order in ${QUIET_DAYS}+ days, ${money(m.quietValue)} booked ${SINCE}. Worth a call.`,
  });
  insights.push({
    tone: m.top10Share > 50 ? "warn" : "good", title: `Top 10 dealers = ${Math.round(m.top10Share)}%`,
    text: `Share of bookings ${SINCE} from your ten biggest dealers.`,
  });

  const rowsForTab = m.tabs[tab].filter((d) => !dealerSearch || d.name.toLowerCase().includes(dealerSearch.toLowerCase()));
  const shown = showAll ? rowsForTab.slice(0, 50) : rowsForTab.slice(0, 10);

  const exportCsv = () => {
    const head = ["Dealer", `${W.label} bookings`, "Previous period", "Since Jul 1", "Last order"];
    const body = rowsForTab.map((d) => [`"${d.name.replace(/"/g, '""')}"`, Math.round(d.cur), Math.round(d.prev), Math.round(d.ytd), d.last]);
    const blob = new Blob([[head.join(","), ...body.map((r) => r.join(","))].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dealers-${tab}-${m.T}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pieColors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <div className="space-y-5">
      {/* Header + period control */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{managerName ?? "All managers"} · {format(today, "EEEE, MMMM d")}</p>
          <h2 className="text-2xl sm:font-serif text-4xl font-medium tracking-tight mt-1">{greeting}{first ? `, ${first[0].toUpperCase()}${first.slice(1)}` : ""}</h2>
          <p className="text-sm text-muted-foreground mt-1">Here is how the business is performing. Data updated {format(new Date(dataUpdatedAt || Date.now()), "h:mm a")}.</p>
        </div>
        <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as PeriodKey)} className="bg-muted p-1 rounded-lg self-start">
          {([["mtd", "Month"], ["qtd", "Quarter"], ["d30", "30 days"], ["d90", "90 days"], ["ytd", "Since Jul 1"]] as [PeriodKey, string][]).map(([k, label]) => (
            <ToggleGroupItem key={k} value={k} disabled={!windows[k].available} className="h-8 px-3 text-[13px] data-[state=on]:bg-card data-[state=on]:shadow-sm">{label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Insight strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.slice(0, 4).map((x, i) => (
          <div key={i} className={cn("rounded-xl border p-3.5 flex gap-3 bg-card", x.tone === "bad" && "border-destructive/40", x.tone === "warn" && "border-warning/50")}>
            {x.tone === "good" ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" /> : <AlertTriangle className={cn("h-5 w-5 shrink-0 mt-0.5", x.tone === "bad" ? "text-destructive" : "text-warning")} />}
            <div className="min-w-0"><p className="text-sm font-semibold leading-tight">{x.title}</p><p className="text-xs text-muted-foreground mt-1 leading-snug">{x.text}</p></div>
          </div>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Bookings · ${W.label}`} value={money(m.curB)} delta={hasPrev ? change(m.curB, m.prevB) : null} deltaLabel={W.prevLabel} spark={m.sparkB} color="--chart-1" onOpen={() => onOpenReport("live-kpi")} hint="Open Live KPI" foot={`${money(m.ytdB)} ${SINCE}`} />
        <Kpi label={`Invoiced · ${W.label}`} value={money(m.curI)} delta={hasPrev ? change(m.curI, m.prevI) : null} deltaLabel={W.prevLabel} spark={m.sparkI} color="--chart-2" onOpen={() => onOpenReport("live-kpi")} hint="Open Live KPI" foot={`${money(m.ytdI)} ${SINCE}`} />
        <Kpi label={`Active dealers · ${W.label}`} value={m.activeDealers.toLocaleString()} delta={hasPrev ? change(m.activeDealers, m.prevActiveDealers) : null} deltaLabel={W.prevLabel} spark={m.sparkD} color="--chart-3" onOpen={() => onOpenReport("dealer-reporting")} hint="Open Dealer Reporting" foot={`of ${m.totalDealers.toLocaleString()} that ordered ${SINCE}`} />
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open order backlog</p><Boxes className="h-4 w-4 text-muted-foreground" /></div>
            <p className="font-serif text-4xl font-medium tracking-tight mt-3">{backlog ? money(backlog.total) : "..."}</p>
            <p className="text-xs text-muted-foreground mt-2">{backlog ? `${backlog.orders.toLocaleString()} open orders waiting to ship` : "Loading"}</p>
            {backlog && m.ytdI > 0 && <p className="text-xs text-muted-foreground mt-1">= {(backlog.total / (m.ytdI / Math.max(1, differenceInCalendarDays(today, new Date(year, START_MONTH, 1)) + 1) * 30)).toFixed(1)} months of current invoicing</p>}
          </CardContent>
        </Card>
      </div>

      {/* Trend + target */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Monthly performance, Jul to {MONTH_LABELS[Math.max(START_MONTH, today.getMonth())]} {year}</CardTitle><p className="text-xs text-muted-foreground">Invoices post the next business day, so the latest days are still catching up.</p></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={m.chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => money(v)} tickLine={false} axisLine={false} fontSize={12} width={56} />
                  <Tooltip formatter={(v: number) => moneyFull(v)} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Legend iconType="circle" />
                  <Bar dataKey="Bookings" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Invoiced" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  {m.hasTargets && <Line type="monotone" dataKey="Target" name="Invoicing target" stroke="hsl(var(--chart-3))" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between">Invoicing vs target<Button variant="ghost" size="sm" onClick={() => navigate("/sales-targets")}>Sales targets</Button></CardTitle></CardHeader>
          <CardContent>
            {m.hasTargets ? (
              <div className="space-y-4">
                <Gauge value={attainment ?? 0} />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label={`Invoiced ${SINCE}`} value={money(m.ytdI)} />
                  <Stat label="Target to date" value={money(m.targetYtd)} />
                  <Stat label="Jul to Dec target" value={money(m.annualTarget)} />
                  <Stat label="Gap to pace" value={money(m.ytdI - m.targetYtd)} tone={m.ytdI >= m.targetYtd ? "good" : "bad"} />
                </div>
                <p className="text-xs text-muted-foreground rounded-lg bg-muted p-3 leading-snug">
                  At the current run-rate, invoicing lands near <span className="font-semibold text-foreground">{money(m.projectedInvoiced)}</span> for Jul to Dec ({Math.round((m.projectedInvoiced / m.annualTarget) * 100)}% of the Jul to Dec target). This assumes an even monthly pace, so seasonal peaks will move it.
                </p>
              </div>
            ) : <p className="text-sm text-muted-foreground">No rep targets for Jul to Dec are set for this selection. Add them on the Sales Targets page.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Dealers + brand */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4 text-muted-foreground" />Dealers</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
                <Button variant="ghost" size="sm" onClick={() => onOpenReport("dealer-reporting")}>Full report</Button>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={tab} onValueChange={(v) => { setTab(v as DealerTab); setShowAll(false); }}>
                <TabsList className="h-auto flex-wrap">
                  <TabsTrigger value="top">Top ({m.tabs.top.length})</TabsTrigger>
                  {hasPrev && <TabsTrigger value="slowing">Slowing ({m.tabs.slowing.length})</TabsTrigger>}
                  {hasPrev && <TabsTrigger value="growing">Growing ({m.tabs.growing.length})</TabsTrigger>}
                  <TabsTrigger value="quiet">Gone quiet ({m.tabs.quiet.length})</TabsTrigger>
                  <TabsTrigger value="new">New ({m.tabs.new.length})</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-full sm:w-52"><Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={dealerSearch} onChange={(e) => setDealerSearch(e.target.value)} placeholder="Find a dealer" className="pl-8" /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              {tab === "top" && `Ranked by bookings ${W.label.toLowerCase()}.`}
              {tab === "slowing" && `Bookings ${W.label.toLowerCase()} vs ${W.prevLabel}, biggest dollar drops first.`}
              {tab === "growing" && `Bookings ${W.label.toLowerCase()} vs ${W.prevLabel}, biggest dollar gains first.`}
              {tab === "quiet" && `Ordered earlier but nothing in ${QUIET_DAYS}+ days. Ranked by what they booked.`}
              {tab === "new" && "First booking since Jul 1 fell inside the selected period."}
            </p>
          </CardHeader>
          <CardContent>
            {shown.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nothing to show here.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Dealer</th>
                    <th className="py-2 px-3 font-medium text-right">{W.label}</th>
                    {hasPrev && <th className="py-2 px-3 font-medium text-right">Change</th>}
                    <th className="py-2 px-3 font-medium text-right">Since Jul 1</th>
                    <th className="py-2 pl-3 font-medium text-right">Last order</th>
                  </tr></thead>
                  <tbody>
                    {shown.map((d) => {
                      const ch = change(d.cur, d.prev);
                      const ago = differenceInCalendarDays(today, parseISO(d.last));
                      return (
                        <tr key={d.key} onClick={() => setDrill({ type: "dealer", key: d.key, name: d.name })} className="border-b last:border-0 cursor-pointer hover:bg-muted/60">
                          <td className="py-2.5 pr-3 font-medium max-w-[240px] truncate">{d.name}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{money(d.cur)}</td>
                          {hasPrev && <td className="py-2.5 px-3 text-right"><Chip value={ch} isNew={d.prev === 0 && d.cur > 0} /></td>}
                          <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{money(d.ytd)}</td>
                          <td className={cn("py-2.5 pl-3 text-right tabular-nums", ago >= QUIET_DAYS && "text-destructive font-medium")}>{ago === 0 ? "today" : `${ago}d ago`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rowsForTab.length > 10 && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : `Show more (${Math.min(rowsForTab.length, 50)})`}</Button>}
          </CardContent>
        </Card>

        <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Brand mix</CardTitle><p className="text-xs text-muted-foreground">Bookings {W.label.toLowerCase()}.</p></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={m.brandList.map(([name, value]) => ({ name, value: Math.round(value) }))} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
                    {m.brandList.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => moneyFull(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-2">
              {m.brandList.map(([name, v], i) => (
                <li key={name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: pieColors[i % pieColors.length] }} />{name}</span>
                  <span className="tabular-nums text-muted-foreground">{money(v)} · {m.curB > 0 ? Math.round((v / m.curB) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Collection mix</CardTitle><p className="text-xs text-muted-foreground">Bookings {W.label.toLowerCase()} by product collection.</p></CardHeader>
          <CardContent>
            <div className="max-h-[236px] overflow-y-auto pr-2 space-y-3">
            {m.collectionList.map(([name, v]) => {
              const share = m.curB > 0 ? (v / m.curB) * 100 : 0;
              return (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1"><span className={cn("truncate pr-2", name === "No collection assigned" && "text-muted-foreground italic")}>{name}</span><span className="tabular-nums text-muted-foreground shrink-0">{money(v)} · {Math.round(share)}%</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></div>
                </div>
              );
            })}
            {m.collectionList.length === 0 && <p className="text-sm text-muted-foreground">No bookings in this period.</p>}
            </div>
            {m.collectionList.length > 5 && <p className="text-[11px] text-muted-foreground mt-2">Scroll to see all {m.collectionList.length} collections.</p>}
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Reps */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />Rep performance</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onOpenReport("rep-reporting")}>Full report</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
              <th className="py-2 pr-3 font-medium">Rep</th>
              <th className="py-2 px-3 font-medium text-right">Bookings, {W.label.toLowerCase()}</th>
              {hasPrev && <th className="py-2 px-3 font-medium text-right">Change</th>}
              <th className="py-2 px-3 font-medium text-right">Active dealers</th>
              <th className="py-2 px-3 font-medium text-right">Since Jul 1</th>
              {m.hasTargets && <th className="py-2 pl-3 font-medium w-[190px]">Invoicing vs target</th>}
            </tr></thead>
            <tbody>
              {m.repList.map((r) => {
                const t = m.targetByRep.get(r.key);
                const att = t && t > 0 ? (r.ytdI / t) * 100 : null;
                return (
                  <tr key={r.key} onClick={() => r.key !== "unassigned" && setDrill({ type: "rep", key: r.key, name: r.name })} className={cn("border-b last:border-0", r.key !== "unassigned" && "cursor-pointer hover:bg-muted/60")}>
                    <td className={cn("py-2.5 pr-3 font-medium", r.key === "unassigned" && "text-muted-foreground italic")}>{r.name}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{money(r.cur)}</td>
                    {hasPrev && <td className="py-2.5 px-3 text-right"><Chip value={change(r.cur, r.prev)} isNew={r.prev === 0 && r.cur > 0} /></td>}
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.dealers.size}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{money(r.ytdB)}</td>
                    {m.hasTargets && (
                      <td className="py-2.5 pl-3">
                        {att === null ? <span className="text-xs text-muted-foreground">no target</span> : (
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", att >= 95 ? "bg-success" : att >= 75 ? "bg-warning" : "bg-destructive")} style={{ width: `${Math.min(100, att)}%` }} /></div>
                            <span className="text-xs tabular-nums w-9 text-right">{Math.round(att)}%</span>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {m.unassignedShare >= 5 && <p className="text-xs text-muted-foreground mt-3">{Math.round(m.unassignedShare)}% of booking lines are not linked to a rep in the portal, so individual rep totals understate their true numbers.</p>}
        </CardContent>
      </Card>

      {/* Drill-down */}
      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {drill && drillModel && (
            <>
              <SheetHeader>
                <SheetTitle>{drill.name}</SheetTitle>
                <SheetDescription>{drill.type === "dealer" ? "Dealer" : "Rep"} · {year} {SINCE}{drillModel.last ? ` · last order ${format(parseISO(drillModel.last), "MMM d")}` : ""}</SheetDescription>
              </SheetHeader>
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label={`Bookings ${SINCE}`} value={money(drillModel.totalB)} />
                  <Stat label={`Invoiced ${SINCE}`} value={money(drillModel.totalI)} />
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={drillModel.chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickFormatter={(v) => money(v)} tickLine={false} axisLine={false} fontSize={11} width={48} />
                      <Tooltip formatter={(v: number) => moneyFull(v)} />
                      <Bar dataKey="Bookings" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Invoiced" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {drill.type === "rep" && (
                  <TargetProgressChart target={targets.find((t) => t.rep_id === drill.key)} monthlyBookings={drillModel.mB} monthlyInvoiced={drillModel.mI} />
                )}
                {drill.type === "rep" && (
                  <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Biggest dealers</p>
                    <ul className="divide-y">{drillModel.dealers.map((d) => <li key={d.name} className="flex justify-between py-2 text-sm"><span className="truncate pr-3">{d.name}</span><span className="tabular-nums">{money(d.v)}</span></li>)}</ul></div>
                )}
                <Button variant="outline" className="w-full" onClick={() => { setDrill(null); onOpenReport(drill.type === "dealer" ? "dealer-reporting" : "rep-reporting"); }}>Open in {drill.type === "dealer" ? "Dealer" : "Rep"} Reporting<ChevronRight className="h-4 w-4 ml-1" /></Button>
                <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Brand split</p>
                  <ul className="space-y-1.5">{drillModel.brands.map(([b, v]) => <li key={b} className="flex justify-between text-sm"><span>{b}</span><span className="tabular-nums text-muted-foreground">{money(v)}</span></li>)}</ul></div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Chip({ value, isNew }: { value: number | null; isNew?: boolean }) {
  if (isNew) return <span className="text-xs font-medium text-success">new</span>;
  if (value === null) return <span className="text-xs text-muted-foreground">n/a</span>;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(Math.round(value))}%
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-serif text-2xl font-medium tracking-tight", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  );
}

function Kpi({ label, value, delta, deltaLabel, spark, color, foot, onOpen, hint }: {
  label: string; value: string; delta: number | null; deltaLabel: string; spark: { i: number; v: number }[]; color: string; foot: string; onOpen: () => void; hint: string;
}) {
  const id = `g${color.replace(/\W/g, "")}`;
  return (
    <Card className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md hover:border-foreground/25 group" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} title={hint}>
      <CardContent className="p-5 pb-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <div className="flex items-end justify-between gap-2 mt-3">
          <p className="font-serif text-4xl font-medium tracking-tight">{value}</p>
          {delta !== null && <Chip value={delta} />}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{delta !== null ? `vs ${deltaLabel} · ` : ""}{foot}</p>
        <p className="text-xs font-medium text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center">{hint}<ChevronRight className="h-3 w-3" /></p>
      </CardContent>
      <div className="h-14 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={`hsl(var(${color}))`} stopOpacity={0.35} /><stop offset="100%" stopColor={`hsl(var(${color}))`} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={`hsl(var(${color}))`} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 70;
  const c = Math.PI * r;
  const tone = value >= 95 ? "hsl(var(--success))" : value >= 75 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  return (
    <div className="relative mx-auto w-[200px]">
      <svg viewBox="0 0 180 100" className="w-full">
        <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke={tone} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <p className="font-serif text-4xl font-medium tracking-tight">{Math.round(value)}%</p>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">of pace</p>
      </div>
    </div>
  );
}
