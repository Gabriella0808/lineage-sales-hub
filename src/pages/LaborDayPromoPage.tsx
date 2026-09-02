import { Fragment, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Config ─────────────────────────────────────────────────────────────────────

const DISCOUNT_CODE = "LD26";
const PROMO_SLUG = "labor-day-promo";
const DEALER_GOAL = 5000;
const UNCLASSIFIED = "Unclassified Collection";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PromoConfig {
  start_date: string | null;
  end_date: string | null;
}

interface RawLine {
  transaction_date: string;
  dealer_name: string;
  customer_id: string;
  rep_name: string;
  rep_id: string;
  sku: string;
  description: string | null;
  product_class: string | null;
  amount: number;
}

interface SkuNode {
  sku: string;
  description: string | null;
  total_sales: number;
  line_count: number;
}

interface CollectionNode {
  name: string;
  total_sales: number;
  sku_count: number;
  skus: SkuNode[];
}

interface DealerNode {
  customer_id: string;
  dealer_name: string;
  total_sales: number;
  goal: number;
  pct_to_goal: number;
  collections: CollectionNode[];
}

interface RepNode {
  rep_id: string;
  rep_name: string;
  dealer_count: number;
  total_sales: number;
  goal: number;
  pct_to_goal: number;
  dealers: DealerNode[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function fmtMoneyFull(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isNaN(n) ? 0 : n;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LaborDayPromoPage() {
  const [promoConfig, setPromoConfig] = useState<PromoConfig | null>(null);
  const [rawLines, setRawLines]       = useState<RawLine[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState(false);

  // Filters
  const [repFilter, setRepFilter]       = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [search, setSearch]             = useState("");
  const [usingPromoRange, setUsingPromoRange] = useState(true);

  // Table expansion
  const [expandedReps, setExpandedReps]             = useState<Set<string>>(new Set());
  const [expandedDealers, setExpandedDealers]       = useState<Set<string>>(new Set());
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(false);

      // Promo config is optional — only used to seed a default date range.
      let config: PromoConfig | null = null;
      try {
        const { data } = await (supabase as any)
          .from("promotions")
          .select("start_date,end_date")
          .eq("slug", PROMO_SLUG)
          .single();
        if (data && (data.start_date || data.end_date)) {
          config = { start_date: data.start_date ?? null, end_date: data.end_date ?? null };
        }
      } catch { /* promotions table may not exist — fine, default to all dates */ }

      if (cancelled) return;
      setPromoConfig(config);
      if (config?.start_date) setDateFrom(config.start_date);
      if (config?.end_date)   setDateTo(config.end_date);

      try {
        const { data, error } = await (supabase as any)
          .from("v_portal_dealer_rep_reporting_lines")
          .select("transaction_date,dealer_name,customer_id,rep_name,rep_id,sku,description,product_class,amount")
          .eq("metric_type", "bookings")
          .eq("discount_code", DISCOUNT_CODE);

        if (cancelled) return;

        if (error) {
          setLoadError(true);
          return;
        }

        const rows: RawLine[] = ((data ?? []) as any[]).map((r: any) => ({
          transaction_date: String(r.transaction_date ?? ""),
          dealer_name:      r.dealer_name ?? r.customer_id ?? "Unknown",
          customer_id:      r.customer_id ?? "unknown",
          rep_name:         r.rep_name ?? "Unassigned",
          rep_id:           r.rep_id ?? "unassigned",
          sku:              r.sku ?? "—",
          description:      r.description ?? null,
          product_class:    r.product_class ?? null,
          amount:           toNum(r.amount),
        }));

        setRawLines(rows);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const hasPromoRange = !!(promoConfig?.start_date || promoConfig?.end_date);

  function showPromoRange() {
    setUsingPromoRange(true);
    setDateFrom(promoConfig?.start_date ?? "");
    setDateTo(promoConfig?.end_date ?? "");
  }

  // ── Filter raw lines ─────────────────────────────────────────────────────────

  const filteredLines = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rawLines.filter(line => {
      if (repFilter !== "all" && line.rep_id !== repFilter) return false;
      if (dealerFilter !== "all" && line.customer_id !== dealerFilter) return false;
      if (dateFrom && line.transaction_date < dateFrom) return false;
      if (dateTo && line.transaction_date > dateTo) return false;
      if (q) {
        const hay = `${line.dealer_name} ${line.sku} ${line.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rawLines, repFilter, dealerFilter, dateFrom, dateTo, search]);

  // ── Aggregate Rep → Dealer → Collection → SKU ───────────────────────────────

  const repRows = useMemo<RepNode[]>(() => {
    const repMap = new Map<string, {
      rep_name: string;
      dealers: Map<string, {
        dealer_name: string;
        collections: Map<string, Map<string, { description: string | null; amount: number; count: number }>>;
      }>;
    }>();

    for (const line of filteredLines) {
      const collectionName = line.product_class && line.product_class.trim() ? line.product_class.trim() : UNCLASSIFIED;

      if (!repMap.has(line.rep_id)) repMap.set(line.rep_id, { rep_name: line.rep_name, dealers: new Map() });
      const re = repMap.get(line.rep_id)!;

      if (!re.dealers.has(line.customer_id)) {
        re.dealers.set(line.customer_id, { dealer_name: line.dealer_name, collections: new Map() });
      }
      const de = re.dealers.get(line.customer_id)!;

      if (!de.collections.has(collectionName)) de.collections.set(collectionName, new Map());
      const co = de.collections.get(collectionName)!;

      if (!co.has(line.sku)) co.set(line.sku, { description: line.description, amount: 0, count: 0 });
      const sk = co.get(line.sku)!;
      sk.amount += line.amount;
      sk.count  += 1;
    }

    const reps: RepNode[] = [];
    for (const [repId, re] of repMap.entries()) {
      const dealers: DealerNode[] = [];
      for (const [customerId, de] of re.dealers.entries()) {
        const collections: CollectionNode[] = [];
        for (const [collName, skuMap] of de.collections.entries()) {
          const skus: SkuNode[] = [...skuMap.entries()]
            .map(([sku, s]) => ({ sku, description: s.description, total_sales: s.amount, line_count: s.count }))
            .sort((a, b) => b.total_sales - a.total_sales);
          const collTotal = skus.reduce((sum, s) => sum + s.total_sales, 0);
          collections.push({ name: collName, total_sales: collTotal, sku_count: skus.length, skus });
        }
        collections.sort((a, b) => b.total_sales - a.total_sales);

        const dealerTotal = collections.reduce((sum, c) => sum + c.total_sales, 0);
        dealers.push({
          customer_id: customerId,
          dealer_name: de.dealer_name,
          total_sales: dealerTotal,
          goal: DEALER_GOAL,
          pct_to_goal: DEALER_GOAL > 0 ? (dealerTotal / DEALER_GOAL) * 100 : 0,
          collections,
        });
      }
      dealers.sort((a, b) => b.total_sales - a.total_sales);

      const repTotal = dealers.reduce((sum, d) => sum + d.total_sales, 0);
      const repGoal  = dealers.length * DEALER_GOAL;
      reps.push({
        rep_id: repId,
        rep_name: re.rep_name,
        dealer_count: dealers.length,
        total_sales: repTotal,
        goal: repGoal,
        pct_to_goal: repGoal > 0 ? (repTotal / repGoal) * 100 : 0,
        dealers,
      });
    }
    return reps.sort((a, b) => b.total_sales - a.total_sales);
  }, [filteredLines]);

  const pageTotal = useMemo(() => repRows.reduce((sum, r) => sum + r.total_sales, 0), [repRows]);

  // ── Filter option lists (from full unfiltered dataset) ──────────────────────

  const repOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of rawLines) m.set(l.rep_id, l.rep_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rawLines]);

  const dealerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of rawLines) m.set(l.customer_id, l.dealer_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rawLines]);

  // ── Chart data ────────────────────────────────────────────────────────────────

  const repChartData = useMemo(() =>
    repRows.map(r => ({
      name: r.rep_name.length > 14 ? r.rep_name.slice(0, 12) + "…" : r.rep_name,
      fullName: r.rep_name,
      sales: r.total_sales,
      pct: r.pct_to_goal,
    })),
    [repRows]
  );

  const dealerChartData = useMemo(() =>
    repRows.flatMap(r => r.dealers)
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 10)
      .map(d => ({
        name: d.dealer_name.length > 22 ? d.dealer_name.slice(0, 20) + "…" : d.dealer_name,
        fullName: d.dealer_name,
        sales: d.total_sales,
      })),
    [repRows]
  );

  // ── Toggle helpers ────────────────────────────────────────────────────────────

  function toggleRep(id: string) {
    setExpandedReps(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleDealer(key: string) {
    setExpandedDealers(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleCollection(key: string) {
    setExpandedCollections(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ── States ────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground text-sm">Loading LD26 booking data…</div>;
  }

  const noDataAtAll = !loadError && rawLines.length === 0;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Labor Day Promo</h1>
      </div>

      {/* ── Empty / error state ─────────────────────────────────────────────── */}
      {(loadError || noDataAtAll) && (
        <Card className="py-14">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-muted-foreground">No LD26 bookings found yet.</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Confirm the booking sync has pulled OrderDetail._DiscType into discount_code.
            </p>
          </div>
        </Card>
      )}

      {!loadError && !noDataAtAll && (
        <>
          {/* ── Filters ──────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search dealer or SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs w-52"
            />
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="All reps" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {repOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={dealerFilter} onValueChange={setDealerFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="All dealers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dealers</SelectItem>
                {dealerOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>From</span>
              <Input type="date" value={dateFrom} onChange={e => { setUsingPromoRange(false); setDateFrom(e.target.value); }} className="h-8 text-xs w-[160px] pr-2" />
              <span>To</span>
              <Input type="date" value={dateTo} onChange={e => { setUsingPromoRange(false); setDateTo(e.target.value); }} className="h-8 text-xs w-[160px] pr-2" />
            </div>
            {hasPromoRange && (
              <Button size="sm" variant={usingPromoRange ? "secondary" : "outline"} className="h-8 text-xs" onClick={showPromoRange}>
                Promo dates
              </Button>
            )}
            {(repFilter !== "all" || dealerFilter !== "all" || search) && (
              <Button
                size="sm" variant="ghost" className="h-8 text-xs"
                onClick={() => { setRepFilter("all"); setDealerFilter("all"); setSearch(""); }}
              >
                Clear
              </Button>
            )}
          </div>

          {/* ── 3 charts ─────────────────────────────────────────────────────── */}
          {repRows.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Sales by Rep
                </h4>
                <ResponsiveContainer width="100%" height={Math.max(140, repChartData.length * 34)}>
                  <BarChart data={repChartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                    <XAxis type="number" tickFormatter={v => fmtMoney(v)} tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} tickLine={false} />
                    <RTooltip formatter={(v: number, _, item: any) => [fmtMoneyFull(v), item.payload.fullName]} contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sales" fill="#6366f1" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  % Goal by Rep
                </h4>
                <ResponsiveContainer width="100%" height={Math.max(140, repChartData.length * 34)}>
                  <BarChart data={repChartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, Math.max(110, ...repChartData.map(d => d.pct + 10))]}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 10 }} tickLine={false}
                    />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} tickLine={false} />
                    <ReferenceLine x={100} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} />
                    <RTooltip formatter={(v: number, _, item: any) => [`${v.toFixed(1)}%`, item.payload.fullName]} contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="pct" fill="#22c55e" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Sales by Dealer
                </h4>
                <ResponsiveContainer width="100%" height={Math.max(140, dealerChartData.length * 30)}>
                  <BarChart data={dealerChartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                    <XAxis type="number" tickFormatter={v => fmtMoney(v)} tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} tickLine={false} />
                    <ReferenceLine x={DEALER_GOAL} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} />
                    <RTooltip formatter={(v: number, _, item: any) => [fmtMoneyFull(v), item.payload.fullName]} contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sales" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          ) : (
            <Card className="py-10">
              <p className="text-center text-sm text-muted-foreground">No LD26 bookings match the current filters.</p>
            </Card>
          )}

          {/* ── Main table: Rep > Dealer > Collection > SKU ─────────────────────── */}
          {repRows.length > 0 && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Rep / Dealer / Collection / SKU</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Detail</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Total Sales</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Goal</th>
                      <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">% Goal</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {repRows.map(rep => (
                      <Fragment key={rep.rep_id}>
                        {/* Rep row */}
                        <tr
                          className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                          onClick={() => toggleRep(rep.rep_id)}
                        >
                          <td className="px-4 py-3 font-semibold text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              {expandedReps.has(rep.rep_id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              {rep.rep_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{rep.dealer_count} dealer{rep.dealer_count !== 1 ? "s" : ""}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoneyFull(rep.total_sales)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtMoneyFull(rep.goal)}</td>
                          <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", rep.pct_to_goal >= 100 ? "text-green-600" : "")}>{fmtPct(rep.pct_to_goal)}</td>
                          <td />
                        </tr>

                        {/* Dealer rows */}
                        {expandedReps.has(rep.rep_id) && rep.dealers.map(dealer => {
                          const dk = `${rep.rep_id}::${dealer.customer_id}`;
                          return (
                            <Fragment key={dk}>
                              <tr
                                className="border-b border-border/30 bg-muted/10 hover:bg-muted/20 cursor-pointer transition-colors"
                                onClick={() => toggleDealer(dk)}
                              >
                                <td className="pl-10 pr-4 py-2.5 text-sm">
                                  <span className="inline-flex items-center gap-1.5 font-medium">
                                    {expandedDealers.has(dk) ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                    {dealer.dealer_name}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground">{dealer.collections.length} collection{dealer.collections.length !== 1 ? "s" : ""}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtMoneyFull(dealer.total_sales)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmtMoneyFull(dealer.goal)}</td>
                                <td className={cn("px-4 py-2.5 text-right tabular-nums font-medium", dealer.pct_to_goal >= 100 ? "text-green-600" : "")}>{fmtPct(dealer.pct_to_goal)}</td>
                                <td />
                              </tr>

                              {/* Collection rows */}
                              {expandedDealers.has(dk) && dealer.collections.map(coll => {
                                const ck = `${dk}::${coll.name}`;
                                return (
                                  <Fragment key={ck}>
                                    <tr
                                      className="border-b border-border/20 bg-muted/5 hover:bg-muted/15 cursor-pointer transition-colors"
                                      onClick={() => toggleCollection(ck)}
                                    >
                                      <td className="pl-16 pr-4 py-2 text-sm">
                                        <span className={cn("inline-flex items-center gap-1.5", coll.name === UNCLASSIFIED && "italic text-muted-foreground")}>
                                          {expandedCollections.has(ck) ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                          {coll.name}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 text-right text-[11px] text-muted-foreground">{coll.sku_count} SKU{coll.sku_count !== 1 ? "s" : ""}</td>
                                      <td className="px-4 py-2 text-right tabular-nums text-sm">{fmtMoneyFull(coll.total_sales)}</td>
                                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">—</td>
                                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">—</td>
                                      <td />
                                    </tr>

                                    {/* SKU rows */}
                                    {expandedCollections.has(ck) && coll.skus.map(sku => (
                                      <tr key={`${ck}::${sku.sku}`} className="border-b border-border/10 bg-muted/[0.02]">
                                        <td className="pl-24 pr-4 py-2">
                                          <div className="font-mono text-xs">{sku.sku}</div>
                                          {sku.description && <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]">{sku.description}</div>}
                                        </td>
                                        <td className="px-4 py-2 text-right text-[11px] text-muted-foreground">{sku.line_count} line{sku.line_count !== 1 ? "s" : ""}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-sm">{fmtMoneyFull(sku.total_sales)}</td>
                                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">—</td>
                                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">—</td>
                                        <td />
                                      </tr>
                                    ))}
                                  </Fragment>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border/60 bg-muted/20">
                      <td className="px-4 py-3 font-semibold">
                        Total ({repRows.length} rep{repRows.length !== 1 ? "s" : ""})
                      </td>
                      <td />
                      <td className="px-4 py-3 text-right tabular-nums font-bold">{fmtMoneyFull(pageTotal)}</td>
                      <td colSpan={2} />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
