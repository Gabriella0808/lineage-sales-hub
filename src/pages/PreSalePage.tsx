import { Fragment, useMemo, useState } from "react";
import { differenceInCalendarWeeks, format, parseISO } from "date-fns";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Boxes, ChevronRight, DollarSign, Package, Search, Store, Target, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  usePreSaleBookings, usePreSalePoHeaders, usePreSalePoLines, usePreSaleProducts, usePreSaleRepTargets,
} from "@/hooks/usePreSale";

const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(2)}M` : a >= 1_000 ? `$${Math.round(a / 1_000)}K` : `$${Math.round(a)}`;
  return n < 0 ? `-${s}` : s;
};
const moneyFull = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pieColors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

type Tab = "overview" | "breakdown" | "pos";

interface CollectionRow {
  key: string;
  collection: string;
  productType: string;
  booked: number;
  poAmount: number;
  skus: Set<string>;
  firstPODate: string | null;
  byDealer: Map<string, { name: string; booked: number }>;
  byRep: Map<string, { name: string; booked: number }>;
  bySku: Map<string, { name: string | null; booked: number; poAmount: number }>;
}
const emptyCollectionExtras = () => ({ byDealer: new Map(), byRep: new Map(), bySku: new Map() });

export default function PreSalePage() {
  const { data: products = [], isLoading: loadingProducts } = usePreSaleProducts();
  const skus = useMemo(() => products.map((p) => p.sku), [products]);
  const { data: bookings = [], isLoading: loadingBookings } = usePreSaleBookings(skus);
  const { data: poLines = [], isLoading: loadingPo } = usePreSalePoLines(skus);
  const { data: poHeaders = [], isLoading: loadingHeaders } = usePreSalePoHeaders();
  const { data: repTargets = [] } = usePreSaleRepTargets(new Date().getFullYear());

  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");

  const isLoading = loadingProducts || loadingBookings || loadingPo || loadingHeaders;

  const model = useMemo(() => {
    const productBySku = new Map(products.map((p) => [p.sku, p]));
    const poHeaderByGuid = new Map(poHeaders.map((h) => [h.guid_po, h]));
    // Andrew's grouping is always ProductClass + ProductType together.
    const classKey = (collection: string | null, type: string | null) => `${collection ?? "Uncategorized"}${type ?? "-"}`;

    let totalBooked = 0;
    let earliestBooking: string | null = null;
    const bySku = new Map<string, { booked: number; poAmount: number; poOutstanding: number }>();
    const byCollection = new Map<string, CollectionRow>();
    const byDealer = new Map<string, { name: string; booked: number; reps: Set<string> }>();
    const byRep = new Map<string, { name: string; booked: number; dealers: Set<string>; byCollection: Map<string, number> }>();

    for (const b of bookings) {
      if (!b.sku) continue;
      const amt = Number(b.amount) || 0;
      totalBooked += amt;
      if (!earliestBooking || b.transaction_date < earliestBooking) earliestBooking = b.transaction_date;

      const s = bySku.get(b.sku) ?? { booked: 0, poAmount: 0, poOutstanding: 0 };
      s.booked += amt;
      bySku.set(b.sku, s);

      const prod = productBySku.get(b.sku);
      const key = classKey(prod?.collection ?? null, prod?.product_type ?? null);
      const c = byCollection.get(key) ?? { key, collection: prod?.collection ?? "Uncategorized", productType: prod?.product_type ?? "-", booked: 0, poAmount: 0, skus: new Set(), firstPODate: null, ...emptyCollectionExtras() };
      c.booked += amt;
      c.skus.add(b.sku);

      const repKey = b.rep_id ?? "unassigned";
      const repDisplayName = b.rep_id ? (b.rep_name ?? "Unnamed rep") : "Unassigned";

      if (b.customer_id) {
        const cd = c.byDealer.get(b.customer_id) ?? { name: b.dealer_name ?? "Unknown dealer", booked: 0 };
        cd.booked += amt;
        c.byDealer.set(b.customer_id, cd);
      }
      const cr = c.byRep.get(repKey) ?? { name: repDisplayName, booked: 0 };
      cr.booked += amt;
      c.byRep.set(repKey, cr);
      const cs = c.bySku.get(b.sku) ?? { name: prod?.name ?? null, booked: 0, poAmount: 0 };
      cs.booked += amt;
      c.bySku.set(b.sku, cs);

      byCollection.set(key, c);

      if (b.customer_id) {
        const d = byDealer.get(b.customer_id) ?? { name: b.dealer_name ?? "Unknown dealer", booked: 0, reps: new Set() };
        d.booked += amt;
        if (b.rep_name) d.reps.add(b.rep_name);
        byDealer.set(b.customer_id, d);
      }

      const r = byRep.get(repKey) ?? { name: repDisplayName, booked: 0, dealers: new Set(), byCollection: new Map() };
      r.booked += amt;
      if (b.customer_id) r.dealers.add(b.customer_id);
      r.byCollection.set(key, (r.byCollection.get(key) ?? 0) + amt);
      byRep.set(repKey, r);
    }

    let totalPoAmount = 0;
    for (const l of poLines) {
      if (!l.product_id) continue;
      const amt = Number(l.line_amount) || 0;
      totalPoAmount += amt;
      const s = bySku.get(l.product_id) ?? { booked: 0, poAmount: 0, poOutstanding: 0 };
      s.poAmount += amt;
      s.poOutstanding += Number(l.quantity_outstanding) || 0;
      bySku.set(l.product_id, s);

      const prod = productBySku.get(l.product_id);
      const key = classKey(prod?.collection ?? null, prod?.product_type ?? null);
      const c = byCollection.get(key) ?? { key, collection: prod?.collection ?? "Uncategorized", productType: prod?.product_type ?? "-", booked: 0, poAmount: 0, skus: new Set(), firstPODate: null, ...emptyCollectionExtras() };
      c.poAmount += amt;
      c.skus.add(l.product_id);
      const cs = c.bySku.get(l.product_id) ?? { name: prod?.name ?? null, booked: 0, poAmount: 0 };
      cs.poAmount += amt;
      c.bySku.set(l.product_id, cs);
      // Andrew's FirstPODate: earliest requested delivery date across PO
      // lines that still have quantity outstanding (i.e. not yet fully in).
      if ((Number(l.quantity_outstanding) || 0) > 0) {
        const reqDate = poHeaderByGuid.get(l.guid_po)?.requested_delivery_date ?? null;
        if (reqDate && (!c.firstPODate || reqDate < c.firstPODate)) c.firstPODate = reqDate;
      }
      byCollection.set(key, c);
    }

    // Ensure every flagged product appears even with zero bookings/PO so far.
    for (const p of products) {
      if (!bySku.has(p.sku)) bySku.set(p.sku, { booked: 0, poAmount: 0, poOutstanding: 0 });
      const key = classKey(p.collection, p.product_type);
      if (!byCollection.has(key)) byCollection.set(key, { key, collection: p.collection ?? "Uncategorized", productType: p.product_type ?? "-", booked: 0, poAmount: 0, skus: new Set(), firstPODate: null, ...emptyCollectionExtras() });
      if (!byCollection.get(key)!.bySku.has(p.sku)) byCollection.get(key)!.bySku.set(p.sku, { name: p.name, booked: 0, poAmount: 0 });
      byCollection.get(key)!.skus.add(p.sku);
    }

    const collectionList = [...byCollection.values()].sort((a, b) => b.poAmount - a.poAmount);
    const repList = [...byRep.entries()].filter(([, r]) => r.booked > 0).sort((a, b) => b[1].booked - a[1].booked);
    const dealerList = [...byDealer.entries()].sort((a, b) => b[1].booked - a[1].booked);
    const skuList = products.map((p) => ({ product: p, ...(bySku.get(p.sku) ?? { booked: 0, poAmount: 0, poOutstanding: 0 }) }));

    const targetSum = repTargets.reduce((s, t) => s + t.annual_target, 0);
    const repShare = new Map<string, number>();
    const repGoal = new Map<string, number>();
    if (targetSum > 0) {
      for (const t of repTargets) {
        const share = t.annual_target / targetSum;
        repShare.set(t.rep_id, share);
        if (totalPoAmount > 0) repGoal.set(t.rep_id, share * totalPoAmount);
      }
    }

    const weeksSinceStart = earliestBooking ? differenceInCalendarWeeks(new Date(), parseISO(earliestBooking)) : null;

    return {
      totalBooked, totalPoAmount, remaining: Math.max(0, totalPoAmount - totalBooked),
      pctSold: totalPoAmount > 0 ? (totalBooked / totalPoAmount) * 100 : 0,
      collectionList, repList, dealerList, skuList, repGoal, repShare, targetSum, weeksSinceStart,
      dealerCount: byDealer.size, repCount: repList.length, skuCount: products.length,
    };
  }, [products, bookings, poLines, poHeaders, repTargets]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm font-medium">No products are currently flagged as a New Product Intro in Acctivate.</p>
          <p className="text-xs text-muted-foreground mt-1">This page updates automatically once staff check that box on a product and it syncs.</p>
        </CardContent>
      </Card>
    );
  }

  const attention: string[] = [];
  if (model.pctSold < 40) attention.push(`Only ${Math.round(model.pctSold)}% of the Pre-Sale PO value is booked so far, out of ${moneyFull(model.totalPoAmount)} committed.`);
  const worstCollections = model.collectionList.filter((c) => c.poAmount > 0 && c.booked / c.poAmount < 0.4).slice(0, 3);
  if (worstCollections.length > 0) attention.push(`${worstCollections.map((c) => c.collection).join(", ")} ${worstCollections.length === 1 ? "is" : "are"} under 40% booked against what's on order.`);
  if (model.weeksSinceStart !== null && model.weeksSinceStart < 8) attention.push(`These products only started booking ${model.weeksSinceStart} week${model.weeksSinceStart === 1 ? "" : "s"} ago — attainment numbers below will look low simply because there hasn't been much time to sell yet.`);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Pre-Sale</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {model.skuCount} SKUs currently flagged as a New Product Intro in Acctivate. This list updates automatically — a SKU leaves the moment it's unchecked.
        </p>
      </div>

      {attention.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" />What needs attention</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {attention.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-warning" />
                <span>{a}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={DollarSign} label="Total booked" value={money(model.totalBooked)} foot={`${bookings.length.toLocaleString()} booking lines`} />
        <Kpi icon={Boxes} label="Total on PO" value={money(model.totalPoAmount)} foot={`${poLines.length.toLocaleString()} PO lines`} />
        <Kpi icon={Target} label="Pre-Sale progress" value={`${Math.round(model.pctSold)}%`} foot="of PO'd value booked" tone={model.pctSold >= 70 ? "good" : model.pctSold >= 40 ? "warn" : "bad"} />
        <Kpi icon={Package} label="Remaining to sell" value={money(model.remaining)} foot={`${model.skuCount} SKUs, ${model.dealerCount} dealers so far`} />
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setSearch(""); }}>
        <TabsList className="tabs-underline flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakdown">By Dealer, Rep, Collection &amp; SKU</TabsTrigger>
          <TabsTrigger value="pos">Purchase Orders</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" && <OverviewTab model={model} />}
      {tab === "breakdown" && <BreakdownTab model={model} search={search} setSearch={setSearch} />}
      {tab === "pos" && <PosTab poLines={poLines} poHeaders={poHeaders} products={products} search={search} setSearch={setSearch} />}
    </div>
  );
}

interface Model {
  totalBooked: number; totalPoAmount: number; remaining: number; pctSold: number;
  collectionList: CollectionRow[];
  repList: [string, { name: string; booked: number; dealers: Set<string>; byCollection: Map<string, number> }][];
  dealerList: [string, { name: string; booked: number; reps: Set<string> }][];
  skuList: { product: { sku: string; name: string | null; collection: string | null; category: string | null; base_price: number | null }; booked: number; poAmount: number; poOutstanding: number }[];
  repGoal: Map<string, number>; repShare: Map<string, number>; targetSum: number; weeksSinceStart: number | null;
  dealerCount: number; repCount: number; skuCount: number;
}

function Kpi({ icon: Icon, label, value, foot, tone }: { icon: typeof DollarSign; label: string; value: string; foot: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        <p className={cn("font-serif text-3xl font-medium tracking-tight mt-2", tone === "good" && "text-success", tone === "warn" && "text-warning", tone === "bad" && "text-destructive")}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1.5">{foot}</p>
      </CardContent>
    </Card>
  );
}

function attainmentTone(pct: number) {
  return pct >= 70 ? "text-success" : pct >= 40 ? "text-warning" : "text-destructive";
}
function attainmentBar(pct: number) {
  return pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive";
}

function OverviewTab({ model }: { model: Model }) {
  const label = (c: CollectionRow) => c.productType && c.productType !== "-" ? `${c.collection} · ${c.productType}` : c.collection;
  const chartData = model.collectionList.slice(0, 12).map((c) => ({ name: label(c), Booked: Math.round(c.booked), "On PO": Math.round(c.poAmount) }));
  const pieData = model.collectionList.slice(0, 6).map((c) => ({ name: label(c), value: Math.round(c.booked) })).filter((d) => d.value > 0);

  const heatmapCollections = model.collectionList.slice(0, 8);
  const heatmapReps = model.repList.slice(0, 10);
  const collectionPo = new Map(heatmapCollections.map((c) => [c.key, c.poAmount]));
  // Each cell's goal follows Andrew's formula applied per collection: the rep's
  // share of everyone's annual sales target x that collection's PO'd value.
  const cellPct = (repKey: string, collection: string) => {
    const share = model.repShare.get(repKey);
    const poAmount = collectionPo.get(collection) ?? 0;
    if (!share || poAmount <= 0) return null;
    const goal = share * poAmount;
    const booked = heatmapReps.find(([k]) => k === repKey)?.[1].byCollection.get(collection) ?? 0;
    return goal > 0 ? (booked / goal) * 100 : null;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Booked vs. on PO, by collection</CardTitle><p className="text-xs text-muted-foreground">Top 12 collections by PO value.</p></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} angle={-20} textAnchor="end" height={50} />
                  <YAxis tickFormatter={(v) => money(v)} tickLine={false} axisLine={false} fontSize={12} width={56} />
                  <Tooltip formatter={(v: number) => moneyFull(v)} />
                  <Bar dataKey="On PO" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Booked" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Bookings by collection</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="none">
                    {pieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => moneyFull(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {pieData.map((d, i) => (
                <li key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 truncate"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: pieColors[i % pieColors.length] }} />{d.name}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{money(d.value)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Rep &times; collection heatmap</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each cell is that rep's actual bookings in that collection divided by their goal for it (their share of the
            team's 2026 target &times; that collection's PO'd value). Red under 40%, amber 40&ndash;70%, green 70%+.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {model.targetSum === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No 2026 rep targets are set, so per-rep goals can't be computed. Add them on the Sales Targets page.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left px-2 py-2 font-medium sticky left-0 bg-card">Rep</th>
                  {heatmapCollections.map((c) => <th key={c.key} className="px-2 py-2 font-medium text-center whitespace-nowrap">{label(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmapReps.map(([key, r]) => (
                  <tr key={key} className="border-t">
                    <td className="px-2 py-2 font-medium sticky left-0 bg-card whitespace-nowrap">{r.name}</td>
                    {heatmapCollections.map((c) => {
                      const pct = cellPct(key, c.key);
                      const booked = r.byCollection.get(c.key) ?? 0;
                      if (pct === null) {
                        return <td key={c.key} className="px-2 py-2 text-center text-muted-foreground bg-muted/30">{booked > 0 ? money(booked) : "-"}</td>;
                      }
                      const tone = pct >= 70 ? "bg-success/20 text-success" : pct >= 40 ? "bg-warning/20 text-warning" : "bg-destructive/20 text-destructive";
                      return (
                        <td key={c.key} className={cn("px-2 py-2 text-center", tone)}>
                          <div className="font-semibold tabular-nums">{Math.round(pct)}%</div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">{money(booked)}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-destructive/20" />Under 40%</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning/20" />40&ndash;70%</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success/20" />70%+</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted/30" />No goal to compare (no target or no PO'd value yet)</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

function BreakdownTab({ model, search, setSearch }: { model: Model; search: string; setSearch: (v: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const q = search.toLowerCase();
  const rows = model.collectionList.filter((c) => !q || c.collection.toLowerCase().includes(q) || c.productType.toLowerCase().includes(q));

  return (
    <Card>
      <CardHeader className="pb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search collections" />
        <p className="text-xs text-muted-foreground mt-2">
          Click a row to see the dealers, reps and SKUs behind it. Each rep's goal is their share of the team's 2026 target applied to this collection's PO'd value &mdash; the same formula as the heatmap above.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
            <th className="py-2 pr-3 font-medium">Collection</th>
            <th className="py-2 px-3 font-medium">Product Type</th>
            <th className="py-2 px-3 font-medium text-right">SKUs</th>
            <th className="py-2 px-3 font-medium text-right">Total Booked</th>
            <th className="py-2 px-3 font-medium text-right">PO Amount</th>
            <th className="py-2 px-3 font-medium">First PO Date</th>
            <th className="py-2 pl-3 font-medium w-[160px]">% Booked</th>
          </tr></thead>
          <tbody>
            {rows.map((c) => {
              const pct = c.poAmount > 0 ? (c.booked / c.poAmount) * 100 : 0;
              const isOpen = open.has(c.key);
              return (
                <Fragment key={c.key}>
                  <tr
                    onClick={() => toggle(c.key)}
                    className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                  >
                    <td className="py-2.5 pr-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-90")} />
                        {c.collection}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.productType}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{c.skus.size}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{money(c.booked)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{c.poAmount > 0 ? money(c.poAmount) : "-"}</td>
                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{c.firstPODate ? format(parseISO(c.firstPODate), "MMM d, yyyy") : "-"}</td>
                    <td className="py-2.5 pl-3">
                      {c.poAmount > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", attainmentBar(pct))} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                          <span className={cn("text-xs tabular-nums w-10 text-right font-medium", attainmentTone(pct))}>{Math.round(pct)}%</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">no PO yet</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${c.key}-detail`} className="border-b last:border-0 bg-muted/20">
                      <td colSpan={7} className="p-4">
                        <CollectionDetail collection={c} model={model} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No collections match.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CollectionDetail({ collection, model }: { collection: CollectionRow; model: Model }) {
  const reps = [...collection.byRep.entries()].sort((a, b) => b[1].booked - a[1].booked);
  const dealers = [...collection.byDealer.entries()].sort((a, b) => b[1].booked - a[1].booked).slice(0, 8);
  const skus = [...collection.bySku.entries()].sort((a, b) => b[1].booked - a[1].booked).slice(0, 8);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />By rep</p>
        {reps.length === 0 ? <p className="text-xs text-muted-foreground">No bookings yet.</p> : (
          <table className="w-full text-xs">
            <tbody>
              {reps.map(([key, r]) => {
                const share = model.repShare.get(key);
                const goal = share ? share * collection.poAmount : null;
                const pct = goal && goal > 0 ? (r.booked / goal) * 100 : null;
                return (
                  <tr key={key} className="border-b last:border-0">
                    <td className={cn("py-1.5 pr-2 font-medium", key === "unassigned" && "text-muted-foreground italic")}>{r.name}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{money(r.booked)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{goal ? money(goal) : "no target"}</td>
                    <td className="py-1.5 pl-2 text-right">
                      {pct !== null ? <span className={cn("font-medium tabular-nums", attainmentTone(pct))}>{Math.round(pct)}%</span> : <span className="text-muted-foreground">n/a</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />By dealer</p>
        {dealers.length === 0 ? <p className="text-xs text-muted-foreground">No bookings yet.</p> : (
          <table className="w-full text-xs">
            <tbody>
              {dealers.map(([id, d]) => (
                <tr key={id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium truncate max-w-[160px]">{d.name}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{money(d.booked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />By SKU</p>
        {skus.length === 0 ? <p className="text-xs text-muted-foreground">No SKUs.</p> : (
          <table className="w-full text-xs">
            <tbody>
              {skus.map(([sku, s]) => (
                <tr key={sku} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-mono truncate max-w-[140px]" title={s.name ?? undefined}>{sku}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{money(s.booked)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">{s.poAmount > 0 ? money(s.poAmount) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


function PosTab({ poLines, poHeaders, products, search, setSearch }: {
  poLines: { product_id: string | null; po_number: string | null; guid_po: string; line_amount: number; quantity_outstanding: number }[];
  poHeaders: { guid_po: string; po_status: string | null; requested_delivery_date: string | null }[];
  products: { sku: string; name: string | null; collection: string | null }[];
  search: string; setSearch: (v: string) => void;
}) {
  const productBySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const headerByGuid = useMemo(() => new Map(poHeaders.map((h) => [h.guid_po, h])), [poHeaders]);
  const q = search.toLowerCase();
  const rows = poLines
    .filter((l) => !q || (l.po_number ?? "").toLowerCase().includes(q) || (l.product_id ?? "").toLowerCase().includes(q))
    .sort((a, b) => (b.line_amount || 0) - (a.line_amount || 0))
    .slice(0, 300);
  return (
    <Card>
      <CardHeader className="pb-3"><SearchBox value={search} onChange={setSearch} placeholder="Search PO number or SKU" /></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
            <th className="py-2 pr-3 font-medium">PO #</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">SKU</th>
            <th className="py-2 px-3 font-medium">Collection</th>
            <th className="py-2 px-3 font-medium text-right">Qty outstanding</th>
            <th className="py-2 pl-3 font-medium text-right">Amount</th>
          </tr></thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={`${l.po_number}-${l.product_id}-${i}`} className="border-b last:border-0">
                <td className="py-2.5 pr-3 font-mono text-xs">{l.po_number ?? "-"}</td>
                <td className="py-2.5 px-3 text-xs text-muted-foreground">{headerByGuid.get(l.guid_po)?.po_status ?? "-"}</td>
                <td className="py-2.5 px-3 font-mono text-xs">{l.product_id ?? "-"}</td>
                <td className="py-2.5 px-3 text-muted-foreground">{(l.product_id && productBySku.get(l.product_id)?.collection) ?? "-"}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{Math.round(Number(l.quantity_outstanding) || 0).toLocaleString()}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums">{money(Number(l.line_amount) || 0)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No purchase order lines match.</td></tr>}
          </tbody>
        </table>
        {poLines.length > 300 && <p className="text-xs text-muted-foreground mt-3 text-center">Showing the top 300 of {poLines.length.toLocaleString()} PO lines by amount. Search to narrow further.</p>}
      </CardContent>
    </Card>
  );
}
