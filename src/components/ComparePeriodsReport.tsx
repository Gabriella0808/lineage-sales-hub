import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useComparePeriodsNotes } from "@/hooks/useComparePeriodsNotes";
import { Pencil, Check, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Search, Download, ChevronRight, ChevronDown, TrendingUp, TrendingDown,
  Sparkles, Filter, RotateCcw, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import type { InventoryItem } from "@/data/inventoryMock";
import type { SkuSalesHistory } from "@/hooks/useInventoryHub";
import seed from "@/data/comparePeriodsSeed.json";
import { cn } from "@/lib/utils";

const fmtMoney = (n: number) => {
  if (!isFinite(n) || n === 0) return "—";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}K`;
  return `${sign}$${v.toFixed(0)}`;
};
const fmtMoneyFull = (n: number) =>
  n === 0 ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number | null) => {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
};

// ---------------- Types from seed ----------------
interface SeedRow {
  name: string;
  vals: number[]; // aligned to seed.months
  notes: string | null;
  growth: number | null; // 3-month growth as decimal
}
interface SeedAccount {
  account: string;
  rows: SeedRow[];
  total: { vals: number[]; notes: string | null; growth: number | null } | null;
}
interface SeedShape {
  months: string[];
  monthKeys: string[];
  accounts: SeedAccount[];
}

const SEED = seed as SeedShape;

// ---------------- Rolling month window ----------------
// Show the most recent 6 completed months, ending at last month.
// Each month a new column appears and the oldest drops automatically.
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildRollingWindow(windowSize = 6) {
  const now = new Date();
  // End at last completed month
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const labels: string[] = [];
  const seedIdxForCol: (number | null)[] = [];
  for (let i = windowSize - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const label = `${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
    labels.push(label);
    const idx = SEED.months.indexOf(label);
    seedIdxForCol.push(idx >= 0 ? idx : null);
  }
  return { labels, seedIdxForCol };
}

const ROLLING = buildRollingWindow(6);

// Remap seed account rows into the rolling window — values for months
// outside the seed coverage default to 0 so the column appears empty
// until live data arrives for that month.
const REMAPPED_ACCOUNTS: SeedAccount[] = SEED.accounts.map((acc) => ({
  ...acc,
  rows: acc.rows.map((r) => ({
    ...r,
    vals: ROLLING.seedIdxForCol.map((idx) => (idx === null ? 0 : (r.vals[idx] ?? 0))),
  })),
  total: acc.total
    ? {
        ...acc.total,
        vals: ROLLING.seedIdxForCol.map((idx) => (idx === null ? 0 : (acc.total!.vals[idx] ?? 0))),
      }
    : null,
}));

// Account → warehouse/source + brand mapping
function classifyAccount(account: string): { source: string; brand: string; type: "sales" | "discount" | "qc" | "samples" | "other" } {
  const a = account.toLowerCase();
  let type: "sales" | "discount" | "qc" | "samples" | "other" = "other";
  if (a.includes("discount") || a.includes("e-commerce")) type = "discount";
  else if (a.includes("quality control")) type = "qc";
  else if (a.includes("sample")) type = "samples";
  else if (a.includes("sales")) type = "sales";

  let brand = "Lineage";
  if (a.includes("sw") || a.includes("sw-finn") || a.includes("finn")) brand = "Sea Winds / Finn & Louise";
  if (a.includes("lux")) brand = "Lux Lighting";
  if (a.includes("f&l")) brand = "Finn & Louise";
  if (a.includes(" sw warehouse") || a.includes("sw warehouse")) brand = "Sea Winds";

  let source = account.replace(/^\d+\s*[·\-]?\s*/, "").trim();
  return { source, brand, type };
}

interface Props {
  items: InventoryItem[];
  salesHistory: SkuSalesHistory[];
}

type Preset = "L3M_VS_PRIOR" | "LM_VS_PRIOR" | "FIRST3_VS_LAST3" | "CUSTOM";

function EditableNote({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (!editing) {
    return (
      <div className="group flex items-start gap-1.5 mb-1 min-h-[20px]">
        <div className={cn("flex-1 whitespace-pre-wrap", value ? "text-foreground/80" : "text-muted-foreground/60 italic")}>
          {value || "Add note…"}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
          aria-label="Edit note"
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 mb-1">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        rows={2}
        className="text-xs min-h-[48px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { onSave(draft); setEditing(false); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
      <div className="flex items-center gap-1">
        <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => { onSave(draft); setEditing(false); }}>
          <Check className="h-3 w-3 mr-1" />Save
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => { setDraft(value); setEditing(false); }}>
          <X className="h-3 w-3 mr-1" />Cancel
        </Button>
        <span className="text-[10px] text-muted-foreground ml-1">⌘↵ to save</span>
      </div>
    </div>
  );
}

export default function ComparePeriodsReport(_props: Props) {
  const { getNote, saveNote } = useComparePeriodsNotes();
  // -------------------- State --------------------
  const months = ROLLING.labels;
  const monthCount = months.length;

  const [preset, setPreset] = useState<Preset>("L3M_VS_PRIOR");
  const [p1Idx, setP1Idx] = useState<[number, number]>([0, 2]); // Nov-Jan
  const [p2Idx, setP2Idx] = useState<[number, number]>([3, 5]); // Feb-Apr

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [perfFilter, setPerfFilter] = useState<"all" | "up" | "down" | "zero" | "new" | "flagged">("all");
  const [includeDiscounts, setIncludeDiscounts] = useState(true);
  const [includeQc, setIncludeQc] = useState(true);
  const [includeSamples, setIncludeSamples] = useState(true);
  const [includeNonStock, setIncludeNonStock] = useState(true);
  const [showOnlyWithNotes, setShowOnlyWithNotes] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(REMAPPED_ACCOUNTS.map((a) => a.account)));
  const [drillRow, setDrillRow] = useState<{ account: string; row: SeedRow } | null>(null);

  // -------------------- Preset → indices --------------------
  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "L3M_VS_PRIOR") {
      const last = monthCount - 1;
      setP2Idx([last - 2, last]);
      setP1Idx([last - 5, last - 3]);
    } else if (p === "LM_VS_PRIOR") {
      const last = monthCount - 1;
      setP2Idx([last, last]);
      setP1Idx([last - 1, last - 1]);
    } else if (p === "FIRST3_VS_LAST3") {
      setP1Idx([0, 2]);
      setP2Idx([monthCount - 3, monthCount - 1]);
    }
  }

  // -------------------- Filter accounts --------------------
  const allSources = useMemo(() => {
    const set = new Set<string>();
    for (const a of REMAPPED_ACCOUNTS) set.add(a.account);
    return Array.from(set);
  }, []);
  const allBrands = useMemo(() => {
    const set = new Set<string>();
    for (const a of REMAPPED_ACCOUNTS) set.add(classifyAccount(a.account).brand);
    return Array.from(set).sort();
  }, []);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REMAPPED_ACCOUNTS.map((acc) => {
      const meta = classifyAccount(acc.account);
      if (!includeDiscounts && meta.type === "discount") return null;
      if (!includeQc && meta.type === "qc") return null;
      if (!includeSamples && meta.type === "samples") return null;
      if (sourceFilter !== "all" && acc.account !== sourceFilter) return null;
      if (brandFilter !== "all" && meta.brand !== brandFilter) return null;

      const rows = acc.rows.filter((r) => {
        if (!includeNonStock && /non[- ]?stock|custom/i.test(r.name)) return false;
        if (q && !r.name.toLowerCase().includes(q) && !acc.account.toLowerCase().includes(q)) return false;

        const sumP1 = sumRange(r.vals, p1Idx[0], p1Idx[1]);
        const sumP2 = sumRange(r.vals, p2Idx[0], p2Idx[1]);
        const diff = sumP2 - sumP1;

        if (perfFilter === "up" && diff <= 0) return false;
        if (perfFilter === "down" && diff >= 0) return false;
        if (perfFilter === "zero" && (sumP1 + sumP2) > 0) return false;
        if (perfFilter === "new" && sumP1 !== 0) return false;
        if (perfFilter === "flagged" && !r.notes) return false;

        if (showOnlyWithNotes && !r.notes) return false;
        return true;
      });

      if (rows.length === 0) return null;
      return { ...acc, rows, meta };
    }).filter(Boolean) as Array<SeedAccount & { meta: ReturnType<typeof classifyAccount> }>;
  }, [search, sourceFilter, brandFilter, perfFilter, includeDiscounts, includeQc, includeSamples, includeNonStock, showOnlyWithNotes, p1Idx, p2Idx]);

  // -------------------- KPIs --------------------
  const summary = useMemo(() => {
    let p1Total = 0, p2Total = 0, accUp = 0, accDown = 0, rowsUp = 0, rowsDown = 0, newItems = 0, flagged = 0;
    for (const acc of filteredAccounts) {
      let aP1 = 0, aP2 = 0;
      for (const r of acc.rows) {
        const s1 = sumRange(r.vals, p1Idx[0], p1Idx[1]);
        const s2 = sumRange(r.vals, p2Idx[0], p2Idx[1]);
        aP1 += s1; aP2 += s2;
        if (s2 > s1) rowsUp++;
        else if (s2 < s1) rowsDown++;
        if (s1 === 0 && s2 > 0) newItems++;
        if (r.notes) flagged++;
      }
      p1Total += aP1; p2Total += aP2;
      if (aP2 > aP1) accUp++;
      else if (aP2 < aP1) accDown++;
    }
    const change = p2Total - p1Total;
    const pct = p1Total !== 0 ? change / Math.abs(p1Total) : null;
    return { p1Total, p2Total, change, pct, accUp, accDown, rowsUp, rowsDown, newItems, flagged };
  }, [filteredAccounts, p1Idx, p2Idx]);

  // -------------------- Visuals data --------------------
  const monthlyTotals = useMemo(() => {
    return months.map((m, i) => {
      let total = 0;
      for (const acc of filteredAccounts) {
        for (const r of acc.rows) total += r.vals[i] ?? 0;
      }
      return { month: m, revenue: total };
    });
  }, [filteredAccounts, months]);

  const topMovers = useMemo(() => {
    const collected: Array<{ name: string; account: string; diff: number }> = [];
    for (const acc of filteredAccounts) {
      for (const r of acc.rows) {
        const s1 = sumRange(r.vals, p1Idx[0], p1Idx[1]);
        const s2 = sumRange(r.vals, p2Idx[0], p2Idx[1]);
        const d = s2 - s1;
        if (d !== 0) collected.push({ name: r.name, account: acc.account, diff: d });
      }
    }
    const up = [...collected].filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 8);
    const down = [...collected].filter((x) => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 8)
      .map((x) => ({ ...x, diff: Math.abs(x.diff) }));
    return { up, down };
  }, [filteredAccounts, p1Idx, p2Idx]);

  // -------------------- Helpers --------------------
  const periodLabel = ([a, b]: [number, number]) => a === b ? months[a] : `${months[a]} - ${months[b]}`;

  const reset = () => {
    setSearch(""); setSourceFilter("all"); setBrandFilter("all"); setPerfFilter("all");
    setIncludeDiscounts(true); setIncludeQc(true); setIncludeSamples(true); setIncludeNonStock(true);
    setShowOnlyWithNotes(false);
    applyPreset("L3M_VS_PRIOR");
  };

  const exportCsv = () => {
    const header = ["Account", "Collection / Line", ...months, "P1 Total", "P2 Total", "$ Change", "% Change", "3M Growth", "Notes"];
    const lines = [header.join(",")];
    for (const acc of filteredAccounts) {
      for (const r of acc.rows) {
        const s1 = sumRange(r.vals, p1Idx[0], p1Idx[1]);
        const s2 = sumRange(r.vals, p2Idx[0], p2Idx[1]);
        const diff = s2 - s1;
        const pct = s1 !== 0 ? diff / Math.abs(s1) : "";
        lines.push([
          q(acc.account), q(r.name), ...r.vals.map((v) => v ?? 0),
          s1, s2, diff, pct, r.growth ?? "", q(r.notes ?? ""),
        ].join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "compare-periods.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = (k: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const FlagBadge = ({ s1, s2, growth, notes }: { s1: number; s2: number; growth: number | null; notes: string | null }) => {
    const tags: Array<{ label: string; cls: string }> = [];
    if (s1 === 0 && s2 > 0) tags.push({ label: "New", cls: "bg-primary/10 text-primary border-primary/20" });
    if (s1 > 0 && s2 === 0) tags.push({ label: "No Sales", cls: "bg-destructive/10 text-destructive border-destructive/20" });
    if (growth !== null && growth >= 0.5) tags.push({ label: "Outperforming", cls: "bg-success/15 text-success border-success/25" });
    else if (growth !== null && growth <= -0.3) tags.push({ label: "Declining", cls: "bg-destructive/10 text-destructive border-destructive/20" });
    if (notes && /out of stock/i.test(notes)) tags.push({ label: "OOS", cls: "bg-warning/15 text-warning-foreground border-warning/30" });
    if (tags.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {tags.map((t, i) => (
          <span key={i} className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", t.cls)}>{t.label}</span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ============== FILTER BAR ============== */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Sales Report - Filters</h3>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={reset} className="h-8 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} className="h-8 text-xs">
              <Download className="h-3 w-3 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Preset</Label>
            <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="L3M_VS_PRIOR">Last 3 Months vs Prior 3 Months</SelectItem>
                <SelectItem value="LM_VS_PRIOR">Last Month vs Prior Month</SelectItem>
                <SelectItem value="FIRST3_VS_LAST3">First 3M vs Last 3M (full window)</SelectItem>
                <SelectItem value="CUSTOM">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 1 (Baseline)</Label>
            <div className="flex gap-1 mt-1">
              <Select value={String(p1Idx[0])} onValueChange={(v) => { setP1Idx([Number(v), Math.max(p1Idx[1], Number(v))]); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(p1Idx[1])} onValueChange={(v) => { setP1Idx([Math.min(p1Idx[0], Number(v)), Number(v)]); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 2 (Compare)</Label>
            <div className="flex gap-1 mt-1">
              <Select value={String(p2Idx[0])} onValueChange={(v) => { setP2Idx([Number(v), Math.max(p2Idx[1], Number(v))]); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(p2Idx[1])} onValueChange={(v) => { setP2Idx([Math.min(p2Idx[0], Number(v)), Number(v)]); setPreset("CUSTOM"); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Search</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Collection, account…" className="pl-8 h-9 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Warehouse / Sales Source</Label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {allSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Brand</Label>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {allBrands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Performance</Label>
            <Select value={perfFilter} onValueChange={(v) => setPerfFilter(v as any)}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                <SelectItem value="up">Positive growth only</SelectItem>
                <SelectItem value="down">Negative growth only</SelectItem>
                <SelectItem value="zero">No / zero sales</SelectItem>
                <SelectItem value="new">New items (P1 = 0)</SelectItem>
                <SelectItem value="flagged">Has notes / commentary</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Include</Label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={includeDiscounts} onCheckedChange={(v) => setIncludeDiscounts(!!v)} /> Discounts</label>
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={includeQc} onCheckedChange={(v) => setIncludeQc(!!v)} /> QC / Allowances</label>
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={includeSamples} onCheckedChange={(v) => setIncludeSamples(!!v)} /> Samples</label>
              <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={includeNonStock} onCheckedChange={(v) => setIncludeNonStock(!!v)} /> Non-stock</label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={showOnlyWithNotes} onCheckedChange={(v) => setShowOnlyWithNotes(!!v)} />
            Only rows with commentary / notes
          </label>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">P1:</span> {periodLabel(p1Idx)}{" "}
            <span className="ml-3 font-medium text-foreground">P2:</span> {periodLabel(p2Idx)}
          </div>
        </div>
      </Card>

      {/* ============== KPI CARDS ============== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 1 Sales</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtMoney(summary.p1Total)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{periodLabel(p1Idx)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Period 2 Sales</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtMoney(summary.p2Total)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{periodLabel(p2Idx)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">$ Change · % Change</div>
          <div className={cn("text-2xl font-semibold mt-1 tabular-nums", summary.change > 0 ? "text-success" : summary.change < 0 ? "text-destructive" : "")}>
            {summary.change > 0 ? "+" : ""}{fmtMoney(summary.change)}
          </div>
          <div className="text-[11px] mt-1">
            <span className={cn(summary.pct && summary.pct > 0 ? "text-success" : summary.pct && summary.pct < 0 ? "text-destructive" : "text-muted-foreground")}>
              {fmtPct(summary.pct)}
            </span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Movement</div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <div className="text-base font-semibold tabular-nums"><span className="text-success">{summary.accUp}</span> <span className="text-muted-foreground">/</span> <span className="text-destructive">{summary.accDown}</span></div>
              <div className="text-[10px] text-muted-foreground">accounts up / down</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums"><span className="text-success">{summary.rowsUp}</span> <span className="text-muted-foreground">/</span> <span className="text-destructive">{summary.rowsDown}</span></div>
              <div className="text-[10px] text-muted-foreground">lines up / down</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums text-primary">{summary.newItems}</div>
              <div className="text-[10px] text-muted-foreground">new items</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums">{summary.flagged}</div>
              <div className="text-[10px] text-muted-foreground">flagged</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ============== VISUAL SUMMARY ============== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <h4 className="text-sm font-semibold">Top Growth (lines)</h4>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topMovers.up} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v: number) => fmtMoneyFull(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="diff" fill="hsl(var(--success))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <h4 className="text-sm font-semibold">Top Decline (lines)</h4>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topMovers.down} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v: number) => fmtMoneyFull(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="diff" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Monthly Trend</h4>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTotals} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v: number) => fmtMoneyFull(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ============== MAIN COMPARATIVE TABLE (mirrors Excel) ============== */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Comparative Sales by Account & Collection</h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => setExpanded(new Set(filteredAccounts.map((a) => a.account)))}>Expand all</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => setExpanded(new Set())}>Collapse all</Button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[720px]">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground sticky top-0 z-20 shadow-[0_2px_4px_-2px_hsl(var(--border))]">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 top-0 bg-muted z-30 min-w-[260px] shadow-[2px_0_4px_-2px_hsl(var(--border))] border-r border-border">Account / Collection</th>
                {months.map((m, i) => (
                  <th key={m} className={cn("text-right px-3 py-2 min-w-[88px]",
                    inRange(i, p1Idx) && "bg-muted/40",
                    inRange(i, p2Idx) && "bg-primary/5",
                  )}>{m}</th>
                ))}
                <th className="text-right px-3 py-2 border-l border-border bg-muted/40">P1 Total</th>
                <th className="text-right px-3 py-2 bg-primary/5">P2 Total</th>
                <th className="text-right px-3 py-2">$ Δ</th>
                <th className="text-right px-3 py-2">% Δ</th>
                <th className="text-right px-3 py-2">3M Growth</th>
                <th className="text-left px-3 py-2 min-w-[180px]">Notes / Flags</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 && (
                <tr><td colSpan={months.length + 7} className="px-3 py-12 text-center text-sm text-muted-foreground">No data for the selected filters.</td></tr>
              )}
              {filteredAccounts.map((acc) => {
                const isOpen = expanded.has(acc.account);
                const accVals = months.map((_, i) => acc.rows.reduce((s, r) => s + (r.vals[i] ?? 0), 0));
                const aP1 = sumRange(accVals, p1Idx[0], p1Idx[1]);
                const aP2 = sumRange(accVals, p2Idx[0], p2Idx[1]);
                const aDiff = aP2 - aP1;
                const aPct = aP1 !== 0 ? aDiff / Math.abs(aP1) : null;
                return (
                  <>
                    <tr key={acc.account} className="bg-muted/30 hover:bg-muted/50 cursor-pointer font-semibold border-t border-border" onClick={() => toggle(acc.account)}>
                      <td className="px-3 py-2 sticky left-0 bg-secondary z-20 shadow-[2px_0_4px_-2px_hsl(var(--border))] border-r border-border">
                        <div className="flex items-center gap-1.5">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <span>{acc.account}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">({acc.rows.length})</span>
                        </div>
                      </td>
                      {accVals.map((v, i) => (
                        <td key={i} className={cn("px-3 py-2 text-right tabular-nums",
                          inRange(i, p1Idx) && "bg-muted/30",
                          inRange(i, p2Idx) && "bg-primary/10",
                        )}>{fmtMoney(v)}</td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums border-l border-border bg-muted/30">{fmtMoney(aP1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums bg-primary/10">{fmtMoney(aP2)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", aDiff > 0 ? "text-success" : aDiff < 0 ? "text-destructive" : "")}>{aDiff > 0 ? "+" : ""}{fmtMoney(aDiff)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", aPct && aPct > 0 ? "text-success" : aPct && aPct < 0 ? "text-destructive" : "text-muted-foreground")}>{fmtPct(aPct)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{acc.meta.brand}</td>
                    </tr>
                    {isOpen && acc.rows.map((r) => {
                      const s1 = sumRange(r.vals, p1Idx[0], p1Idx[1]);
                      const s2 = sumRange(r.vals, p2Idx[0], p2Idx[1]);
                      const diff = s2 - s1;
                      const pct = s1 !== 0 ? diff / Math.abs(s1) : null;
                      return (
                        <tr key={`${acc.account}-${r.name}`} className="border-t border-border hover:bg-muted/20 cursor-pointer" onClick={() => setDrillRow({ account: acc.account, row: r })}>
                          <td className="px-3 py-2 pl-9 sticky left-0 bg-card z-20 shadow-[2px_0_4px_-2px_hsl(var(--border))] border-r border-border">
                            <div className="flex items-center gap-1">
                              <span>{r.name}</span>
                              <TrendIcon diff={diff} />
                            </div>
                          </td>
                          {r.vals.map((v, i) => (
                            <td key={i} className={cn("px-3 py-2 text-right tabular-nums",
                              inRange(i, p1Idx) && "bg-muted/20",
                              inRange(i, p2Idx) && "bg-primary/5",
                              v === 0 && "text-muted-foreground/60",
                            )}>{fmtMoney(v)}</td>
                          ))}
                          <td className="px-3 py-2 text-right tabular-nums border-l border-border bg-muted/20">{fmtMoney(s1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums bg-primary/5">{fmtMoney(s2)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "")}>{diff > 0 ? "+" : ""}{fmtMoney(diff)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", pct && pct > 0 ? "text-success" : pct && pct < 0 ? "text-destructive" : "text-muted-foreground")}>{fmtPct(pct)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", r.growth && r.growth > 0 ? "text-success" : r.growth && r.growth < 0 ? "text-destructive" : "text-muted-foreground")}>{fmtPct(r.growth)}</td>
                          <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                            <EditableNote
                              value={getNote(acc.account, r.name, r.notes)}
                              onSave={(v) => saveNote(acc.account, r.name, v)}
                            />
                            <FlagBadge s1={s1} s2={s2} growth={r.growth} notes={getNote(acc.account, r.name, r.notes)} />
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ============== DRILLDOWN DRAWER ============== */}
      <Sheet open={drillRow !== null} onOpenChange={(o) => !o && setDrillRow(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {drillRow && (() => {
            const r = drillRow.row;
            const s1 = sumRange(r.vals, p1Idx[0], p1Idx[1]);
            const s2 = sumRange(r.vals, p2Idx[0], p2Idx[1]);
            const diff = s2 - s1;
            const pct = s1 !== 0 ? diff / Math.abs(s1) : null;
            const monthly = months.map((m, i) => ({ month: m, revenue: r.vals[i] ?? 0 }));
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-base">{r.name}</SheetTitle>
                  <SheetDescription>{drillRow.account}</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-md border border-border">
                      <div className="text-[10px] uppercase text-muted-foreground">Period 1</div>
                      <div className="text-lg font-semibold tabular-nums mt-1">{fmtMoneyFull(s1)}</div>
                      <div className="text-[10px] text-muted-foreground">{periodLabel(p1Idx)}</div>
                    </div>
                    <div className="p-3 rounded-md border border-border">
                      <div className="text-[10px] uppercase text-muted-foreground">Period 2</div>
                      <div className="text-lg font-semibold tabular-nums mt-1">{fmtMoneyFull(s2)}</div>
                      <div className="text-[10px] text-muted-foreground">{periodLabel(p2Idx)}</div>
                    </div>
                    <div className="p-3 rounded-md border border-border">
                      <div className="text-[10px] uppercase text-muted-foreground">Change</div>
                      <div className={cn("text-lg font-semibold tabular-nums mt-1", diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "")}>
                        {diff > 0 ? "+" : ""}{fmtMoneyFull(diff)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{fmtPct(pct)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold mb-2">Monthly Sales</div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthly}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 10 }} />
                          <RTooltip formatter={(v: number) => fmtMoneyFull(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold mb-2">Monthly Detail</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {monthly.map((m) => (
                          <tr key={m.month} className="border-t border-border">
                            <td className="px-2 py-1.5 text-muted-foreground">{m.month}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoneyFull(m.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {r.notes && (
                    <div className="p-3 rounded-md border border-border bg-muted/30">
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">Commentary</div>
                      <div className="text-sm">{r.notes}</div>
                    </div>
                  )}

                  <FlagBadge s1={s1} s2={s2} growth={r.growth} notes={r.notes} />
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------- helpers ----------------
function sumRange(vals: number[], a: number, b: number): number {
  let s = 0;
  for (let i = a; i <= b; i++) s += vals[i] ?? 0;
  return s;
}
function inRange(i: number, [a, b]: [number, number]) { return i >= a && i <= b; }
function q(s: string) { return `"${(s ?? "").replace(/"/g, "'")}"`; }

function TrendIcon({ diff }: { diff: number }) {
  if (diff > 0) return <ArrowUpRight className="h-3 w-3 text-success" />;
  if (diff < 0) return <ArrowDownRight className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}
