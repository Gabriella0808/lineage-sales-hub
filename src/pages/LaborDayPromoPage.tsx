import { Fragment, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ChevronDown, ChevronRight, AlertTriangle, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { RepNotConfigured } from "@/components/RepNotConfigured";

// ── Config ─────────────────────────────────────────────────────────────────────
//
// promo_slug ('ld26') is the portal's internal identifier for the participant
// roster/config below. It is intentionally distinct from discount_code
// ('LD26'), which is the Acctivate OrderDetail._DiscType value used to pull
// actual bookings from v_portal_dealer_rep_reporting_lines.

const PROMO_SLUG    = "ld26";
const DISCOUNT_CODE = "LD26";
const DEALER_GOAL   = 5000;
const UNCLASSIFIED  = "Unclassified Collection";

// Display dates (Sep 4–14) come from the `promotions` table and drive the
// date pickers below. Reporting is widened on each side per Justin's request.
// REPORTING_START is set to the earliest LD26-coded order in the data
// (2026-08-25) rather than an arbitrary date, so nothing pre-promo is missed.
const REPORTING_START = "2026-08-25";
const REPORTING_END   = "2026-09-15";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Participant {
  cust_id: string;
  company_name: string | null;
  dealer_name: string | null;
  territory: string | null;
  sales_manager: string | null;
  salesperson_id: string;
  salesperson_name: string | null;
}

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
  cust_id: string;
  dealer_name: string;
  total_sales: number;
  goal: number;
  pct_to_goal: number;
  collections: CollectionNode[];
}

interface RepNode {
  salesperson_id: string;
  rep_name: string;
  dealer_count: number;
  total_sales: number;
  goal: number;
  pct_to_goal: number;
  dealers: DealerNode[];
}

interface UnmatchedRow {
  rep_name: string;
  rep_id: string;
  customer_id: string;
  dealer_name: string;
  total_sales: number;
  line_count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();

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
  const { toast } = useToast();
  const { data: roleInfo } = useUserRole();
  const isAdmin   = !!roleInfo?.isAdmin;
  const isManager = !!roleInfo?.isManager;
  const isRep     = !!roleInfo?.isRep;
  const [promoConfig, setPromoConfig]   = useState<PromoConfig | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [rawLines, setRawLines]         = useState<RawLine[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState(false);

  // Manual "add participant" form
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [newCustId, setNewCustId]         = useState("");
  const [newDealerName, setNewDealerName] = useState("");
  const [newTerritory, setNewTerritory]   = useState("");
  const [newSalesManager, setNewSalesManager] = useState("");
  const [newRepMode, setNewRepMode]       = useState<"existing" | "new">("existing");
  const [newRepId, setNewRepId]           = useState("");
  const [newRepName, setNewRepName]       = useState("");

  // Filters
  const [repFilter, setRepFilter]       = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [search, setSearch]             = useState("");
  const [usingPromoRange, setUsingPromoRange] = useState(true);
  const [showUnmatched, setShowUnmatched]     = useState(false);

  // Table expansion
  const [expandedReps, setExpandedReps]               = useState<Set<string>>(new Set());
  const [expandedDealers, setExpandedDealers]         = useState<Set<string>>(new Set());
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
          .eq("slug", "labor-day-promo")
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
        const [participantsRes, salesRes] = await Promise.all([
          (supabase as any)
            .from("labor_day_2026_participants")
            .select("cust_id,company_name,dealer_name,territory,sales_manager,salesperson_id,salesperson_name")
            .eq("promo_slug", PROMO_SLUG)
            .eq("active", true),
          (supabase as any)
            .rpc("get_portal_dealer_rep_reporting_lines", {
              p_metric: "bookings",
              p_discount_code: DISCOUNT_CODE,
              p_limit: 5000,
              p_offset: 0,
            }),
        ]);

        if (cancelled) return;

        if (participantsRes.error || salesRes.error) {
          setLoadError(true);
          return;
        }

        const parts: Participant[] = ((participantsRes.data ?? []) as any[]).map((r: any) => ({
          cust_id:          String(r.cust_id ?? ""),
          company_name:     r.company_name ?? null,
          dealer_name:      r.dealer_name ?? null,
          territory:        r.territory ?? null,
          sales_manager:    r.sales_manager ?? null,
          salesperson_id:   String(r.salesperson_id ?? ""),
          salesperson_name: r.salesperson_name ?? null,
        }));

        const rows: RawLine[] = ((salesRes.data ?? []) as any[]).map((r: any) => ({
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

        setParticipants(parts);
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

  function resetAddForm() {
    setNewCustId("");
    setNewDealerName("");
    setNewTerritory("");
    setNewSalesManager("");
    setNewRepMode("existing");
    setNewRepId("");
    setNewRepName("");
  }

  async function handleAddParticipant() {
    const custId = newCustId.trim();
    const dealerName = newDealerName.trim();
    const repId = newRepId.trim();
    const repName = newRepName.trim();

    if (!custId || !dealerName || !repId) {
      toast({ title: "Missing info", description: "Dealer ID, dealer name, and rep are required.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("labor_day_2026_participants")
        .insert({
          promo_slug: PROMO_SLUG,
          cust_id: custId,
          company_name: dealerName,
          dealer_name: dealerName,
          territory: newTerritory.trim() || null,
          sales_manager: newSalesManager.trim() || null,
          salesperson_id: repId,
          salesperson_name: repName || repId,
          active: true,
        });

      if (error) {
        const duplicate = (error as any).code === "23505";
        toast({
          title: duplicate ? "Already in the roster" : "Couldn't add participant",
          description: duplicate
            ? "This dealer is already assigned to that rep in the LD26 roster."
            : error.message,
          variant: "destructive",
        });
        return;
      }

      setParticipants(prev => [...prev, {
        cust_id: custId,
        company_name: dealerName,
        dealer_name: dealerName,
        territory: newTerritory.trim() || null,
        sales_manager: newSalesManager.trim() || null,
        salesperson_id: repId,
        salesperson_name: repName || repId,
      }]);
      toast({ title: "Participant added", description: `${dealerName} added to the LD26 roster.` });
      resetAddForm();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Match sales lines to the participant roster (normalized customer_id) ─────

  const { matchedByCustId, unmatchedLines } = useMemo(() => {
    // usingPromoRange = true is the default promo view: the date pickers
    // still show/reset to the official Sep 4–14 window, but counting uses
    // the wider Sep 1–15 reporting window (a few pre-promo LD26 orders and
    // a large Sep 15 order need to count). A manual date-picker edit flips
    // usingPromoRange to false and filters on exactly what was typed, same
    // as before.
    const effectiveFrom = usingPromoRange ? REPORTING_START : dateFrom;
    const effectiveTo   = usingPromoRange ? REPORTING_END   : dateTo;

    const dateFiltered = rawLines.filter(line => {
      if (effectiveFrom && line.transaction_date < effectiveFrom) return false;
      if (effectiveTo && line.transaction_date > effectiveTo) return false;
      return true;
    });

    const participantKeys = new Set(participants.map(p => norm(p.cust_id)));
    const matched = new Map<string, RawLine[]>();
    const unmatched: RawLine[] = [];

    for (const line of dateFiltered) {
      const key = norm(line.customer_id);
      if (participantKeys.has(key)) {
        if (!matched.has(key)) matched.set(key, []);
        matched.get(key)!.push(line);
      } else {
        unmatched.push(line);
      }
    }

    // Roll unmatched lines up by dealer/rep for the audit panel.
    const unmatchedMap = new Map<string, UnmatchedRow>();
    for (const line of unmatched) {
      const k = `${line.rep_id}::${line.customer_id}`;
      if (!unmatchedMap.has(k)) {
        unmatchedMap.set(k, {
          rep_name: line.rep_name, rep_id: line.rep_id,
          customer_id: line.customer_id, dealer_name: line.dealer_name,
          total_sales: 0, line_count: 0,
        });
      }
      const u = unmatchedMap.get(k)!;
      u.total_sales += line.amount;
      u.line_count  += 1;
    }

    return {
      matchedByCustId: matched,
      unmatchedLines: [...unmatchedMap.values()].sort((a, b) => b.total_sales - a.total_sales),
    };
  }, [rawLines, participants, dateFrom, dateTo, usingPromoRange]);

  // ── Filter roster (rep / dealer / search) ────────────────────────────────────

  const filteredParticipants = useMemo(() => {
    const q = search.toLowerCase().trim();
    return participants.filter(p => {
      if (repFilter !== "all" && p.salesperson_id !== repFilter) return false;
      if (dealerFilter !== "all" && p.cust_id !== dealerFilter) return false;
      if (!q) return true;

      const nameHay = `${p.company_name ?? ""} ${p.dealer_name ?? ""} ${p.cust_id}`.toLowerCase();
      if (nameHay.includes(q)) return true;

      const lines = matchedByCustId.get(norm(p.cust_id)) ?? [];
      return lines.some(l => `${l.sku} ${l.description ?? ""}`.toLowerCase().includes(q));
    });
  }, [participants, repFilter, dealerFilter, search, matchedByCustId]);

  // ── Build Rep → Dealer → Collection → SKU from the roster ───────────────────

  const repRows = useMemo<RepNode[]>(() => {
    const repMap = new Map<string, { rep_name: string; dealers: Participant[] }>();
    for (const p of filteredParticipants) {
      if (!repMap.has(p.salesperson_id)) {
        repMap.set(p.salesperson_id, { rep_name: p.salesperson_name || p.salesperson_id, dealers: [] });
      }
      repMap.get(p.salesperson_id)!.dealers.push(p);
    }

    const reps: RepNode[] = [];
    for (const [salespersonId, re] of repMap.entries()) {
      const dealers: DealerNode[] = re.dealers.map(p => {
        const lines = matchedByCustId.get(norm(p.cust_id)) ?? [];

        const collMap = new Map<string, Map<string, { description: string | null; amount: number; count: number }>>();
        for (const line of lines) {
          const collName = line.product_class && line.product_class.trim() ? line.product_class.trim() : UNCLASSIFIED;
          if (!collMap.has(collName)) collMap.set(collName, new Map());
          const skuMap = collMap.get(collName)!;
          if (!skuMap.has(line.sku)) skuMap.set(line.sku, { description: line.description, amount: 0, count: 0 });
          const sk = skuMap.get(line.sku)!;
          sk.amount += line.amount;
          sk.count  += 1;
        }

        const collections: CollectionNode[] = [...collMap.entries()].map(([name, skuMap]) => {
          const skus: SkuNode[] = [...skuMap.entries()]
            .map(([sku, s]) => ({ sku, description: s.description, total_sales: s.amount, line_count: s.count }))
            .sort((a, b) => b.total_sales - a.total_sales);
          const total = skus.reduce((sum, s) => sum + s.total_sales, 0);
          return { name, total_sales: total, sku_count: skus.length, skus };
        }).sort((a, b) => b.total_sales - a.total_sales);

        const dealerTotal = collections.reduce((sum, c) => sum + c.total_sales, 0);
        return {
          cust_id: p.cust_id,
          dealer_name: p.company_name || p.dealer_name || p.cust_id,
          total_sales: dealerTotal,
          goal: DEALER_GOAL,
          pct_to_goal: (dealerTotal / DEALER_GOAL) * 100,
          collections,
        };
      }).sort((a, b) => b.total_sales - a.total_sales);

      const repTotal = dealers.reduce((sum, d) => sum + d.total_sales, 0);
      const repGoal  = dealers.length * DEALER_GOAL;
      reps.push({
        salesperson_id: salespersonId,
        rep_name: re.rep_name,
        dealer_count: dealers.length,
        total_sales: repTotal,
        goal: repGoal,
        pct_to_goal: repGoal > 0 ? (repTotal / repGoal) * 100 : 0,
        dealers,
      });
    }
    return reps.sort((a, b) => b.total_sales - a.total_sales || a.rep_name.localeCompare(b.rep_name));
  }, [filteredParticipants, matchedByCustId]);

  const pageTotal = useMemo(() => repRows.reduce((sum, r) => sum + r.total_sales, 0), [repRows]);
  const unmatchedTotal = useMemo(() => unmatchedLines.reduce((sum, u) => sum + u.total_sales, 0), [unmatchedLines]);

  // ── Filter option lists (from the full roster, not just filtered rows) ──────

  const repOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.salesperson_id, p.salesperson_name || p.salesperson_id);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [participants]);

  const dealerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.cust_id, p.company_name || p.dealer_name || p.cust_id);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [participants]);

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

  if (isRep && !roleInfo?.repId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Labor Day Promo</h1>
        </div>
        <RepNotConfigured />
      </div>
    );
  }

  const noParticipants = !loadError && participants.length === 0;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Labor Day Promo</h1>
      </div>

      {/* ── Empty / error state ─────────────────────────────────────────────── */}
      {(loadError || noParticipants) && (
        <Card className="py-14">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-muted-foreground">No LD26 bookings found yet.</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Confirm the booking sync has pulled OrderDetail._DiscType into discount_code, and that the
              labor_day_2026_participants roster is loaded.
            </p>
          </div>
        </Card>
      )}

      {!loadError && !noParticipants && (
        <>
          {/* ── Unmatched sales audit ────────────────────────────────────────── */}
          {unmatchedLines.length > 0 && (
            <Card className="p-3 border-warning/40 bg-warning/5">
              <button
                type="button"
                className="w-full flex items-center gap-2 text-xs text-left"
                onClick={() => setShowUnmatched(v => !v)}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                <span className="font-medium">
                  {unmatchedLines.length} dealer{unmatchedLines.length !== 1 ? "s" : ""} with LD26 bookings not in the participant roster
                </span>
                <span className="text-muted-foreground">
                  ({fmtMoneyFull(unmatchedTotal)} excluded from official totals)
                </span>
                {showUnmatched ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
              </button>
              {showUnmatched && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="font-medium py-1 pr-4">Dealer</th>
                        <th className="font-medium py-1 pr-4">Rep</th>
                        <th className="font-medium py-1 pr-4 text-right">Sales</th>
                        <th className="font-medium py-1 text-right">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedLines.map(u => (
                        <tr key={`${u.rep_id}::${u.customer_id}`} className="border-t border-border/30">
                          <td className="py-1 pr-4">{u.dealer_name} <span className="text-muted-foreground">({u.customer_id})</span></td>
                          <td className="py-1 pr-4">{u.rep_name}</td>
                          <td className="py-1 pr-4 text-right tabular-nums">{fmtMoneyFull(u.total_sales)}</td>
                          <td className="py-1 text-right tabular-nums">{u.line_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* ── Manually add a participant (admin/manager only — reps get
               read-only access to their own LD26 roster) ────────────────────── */}
          {(isAdmin || isManager) && (
          <Card className="p-3">
            <button
              type="button"
              className="w-full flex items-center gap-2 text-xs text-left"
              onClick={() => setShowAddForm(v => !v)}
            >
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">Add a participant</span>
              <span className="text-muted-foreground">Manually add a dealer/rep to the LD26 roster</span>
              {showAddForm ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
            </button>

            {showAddForm && (
              <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ld26-cust-id" className="text-[11px] text-muted-foreground">Dealer / Customer ID *</Label>
                  <Input id="ld26-cust-id" value={newCustId} onChange={e => setNewCustId(e.target.value)} className="h-8 text-xs" placeholder="e.g. ROYALFURNKEY" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ld26-dealer-name" className="text-[11px] text-muted-foreground">Dealer Name *</Label>
                  <Input id="ld26-dealer-name" value={newDealerName} onChange={e => setNewDealerName(e.target.value)} className="h-8 text-xs" placeholder="e.g. Royal Furniture" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ld26-territory" className="text-[11px] text-muted-foreground">Territory</Label>
                  <Input id="ld26-territory" value={newTerritory} onChange={e => setNewTerritory(e.target.value)} className="h-8 text-xs" placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ld26-sales-manager" className="text-[11px] text-muted-foreground">Sales Manager</Label>
                  <Input id="ld26-sales-manager" value={newSalesManager} onChange={e => setNewSalesManager(e.target.value)} className="h-8 text-xs" placeholder="Optional" />
                </div>

                <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Rep *</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={newRepMode === "existing" ? (newRepId || "__pick") : "__new"}
                      onValueChange={v => {
                        if (v === "__new") { setNewRepMode("new"); setNewRepId(""); setNewRepName(""); return; }
                        const found = repOptions.find(([id]) => id === v);
                        setNewRepMode("existing");
                        setNewRepId(v);
                        setNewRepName(found ? found[1] : "");
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Choose a rep" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__pick" disabled>Choose an existing rep…</SelectItem>
                        {repOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                        <SelectItem value="__new">+ New rep…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newRepMode === "new" && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Input value={newRepId} onChange={e => setNewRepId(e.target.value)} className="h-8 text-xs" placeholder="Rep ID (salesperson_id)" />
                      <Input value={newRepName} onChange={e => setNewRepName(e.target.value)} className="h-8 text-xs" placeholder="Rep name" />
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetAddForm} disabled={submitting}>
                    Clear
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={handleAddParticipant} disabled={submitting}>
                    {submitting ? "Adding…" : "Add participant"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
          )}

          {/* ── Filters ──────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search dealer or SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs w-52"
            />
            {!isRep && (
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="All reps" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {repOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            )}
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
              <Card className="p-4 flex flex-col">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Sales by Rep
                </h4>
                <div className="flex-1" style={{ minHeight: Math.max(140, repChartData.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={repChartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                      <XAxis type="number" tickFormatter={v => fmtMoney(v)} tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} tickLine={false} reversed />
                      <RTooltip formatter={(v: number, _, item: any) => [fmtMoneyFull(v), item.payload.fullName]} contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="sales" fill="hsl(var(--chart-2))" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-4 flex flex-col">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  % Goal by Rep
                </h4>
                <div className="flex-1" style={{ minHeight: Math.max(140, repChartData.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={repChartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, Math.max(110, ...repChartData.map(d => d.pct + 10))]}
                        tickFormatter={v => `${Math.round(v)}%`}
                        tick={{ fontSize: 10 }} tickLine={false}
                      />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} tickLine={false} reversed />
                      <ReferenceLine x={100} stroke="hsl(var(--destructive))" strokeDasharray="4 3" strokeWidth={1.5} />
                      <RTooltip formatter={(v: number, _, item: any) => [`${v.toFixed(1)}%`, item.payload.fullName]} contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="pct" fill="hsl(var(--chart-3))" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-4 flex flex-col">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Sales by Dealer
                </h4>
                <div className="flex-1" style={{ minHeight: Math.max(140, dealerChartData.length * 30) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dealerChartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                      <XAxis type="number" tickFormatter={v => fmtMoney(v)} tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} tickLine={false} reversed />
                      <ReferenceLine x={DEALER_GOAL} stroke="hsl(var(--destructive))" strokeDasharray="4 3" strokeWidth={1.5} />
                      <RTooltip formatter={(v: number, _, item: any) => [fmtMoneyFull(v), item.payload.fullName]} contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="sales" fill="hsl(var(--chart-4))" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="py-10">
              <p className="text-center text-sm text-muted-foreground">No participants match the current filters.</p>
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
                      <Fragment key={rep.salesperson_id}>
                        {/* Rep row */}
                        <tr
                          className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                          onClick={() => toggleRep(rep.salesperson_id)}
                        >
                          <td className="px-4 py-3 font-semibold text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              {expandedReps.has(rep.salesperson_id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              {rep.rep_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{rep.dealer_count} dealer{rep.dealer_count !== 1 ? "s" : ""}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoneyFull(rep.total_sales)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtMoneyFull(rep.goal)}</td>
                          <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", rep.pct_to_goal >= 100 ? "text-success" : "")}>{fmtPct(rep.pct_to_goal)}</td>
                          <td />
                        </tr>

                        {/* Dealer rows */}
                        {expandedReps.has(rep.salesperson_id) && rep.dealers.map(dealer => {
                          const dk = `${rep.salesperson_id}::${dealer.cust_id}`;
                          const hasSales = dealer.collections.length > 0;
                          return (
                            <Fragment key={dk}>
                              <tr
                                className="border-b border-border/30 bg-muted/10 hover:bg-muted/20 cursor-pointer transition-colors"
                                onClick={() => toggleDealer(dk)}
                              >
                                <td className="pl-10 pr-4 py-2.5 text-sm">
                                  <span className={cn("inline-flex items-center gap-1.5 font-medium", !hasSales && "text-muted-foreground")}>
                                    {expandedDealers.has(dk) ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                    {dealer.dealer_name}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground">
                                  {hasSales ? `${dealer.collections.length} collection${dealer.collections.length !== 1 ? "s" : ""}` : "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtMoneyFull(dealer.total_sales)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmtMoneyFull(dealer.goal)}</td>
                                <td className={cn("px-4 py-2.5 text-right tabular-nums font-medium", dealer.pct_to_goal >= 100 ? "text-success" : "")}>{fmtPct(dealer.pct_to_goal)}</td>
                                <td />
                              </tr>

                              {/* No-sales placeholder */}
                              {expandedDealers.has(dk) && !hasSales && (
                                <tr className="border-b border-border/20 bg-muted/5">
                                  <td className="pl-16 pr-4 py-2 text-xs text-muted-foreground italic" colSpan={6}>
                                    No LD26 bookings yet
                                  </td>
                                </tr>
                              )}

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
