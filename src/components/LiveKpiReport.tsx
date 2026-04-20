import { useState, useMemo, useEffect, useRef } from "react";
import { formatCurrency } from "@/hooks/usePortalData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Pencil } from "lucide-react";
import { REP_MONTHLY } from "@/data/repMonthly";

const PROJ_STORAGE_KEY = "kpi_projections_2026_v1";

type ProjOverrides = {
  monthly?: Record<string, { b26p?: number; i26p?: number }>;
  line?: Record<string, { luxP?: number; swP?: number; flP?: number }>;
};

function loadOverrides(): ProjOverrides {
  try {
    const raw = localStorage.getItem(PROJ_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Inline editable currency cell. Calls onSave with the new numeric value. */
function EditableCurrency({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(value)));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(String(Math.round(value))); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    const n = Number(draft.replace(/[^0-9.\-]/g, ""));
    if (!Number.isNaN(n)) onSave(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(String(Math.round(value))); setEditing(false); }
        }}
        className="w-28 h-7 px-1 text-right text-xs border border-primary rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1 px-1 py-0.5 -mx-1 rounded hover:bg-primary/10 transition-colors"
      title="Click to edit projection"
    >
      <span>{formatCurrency(value)}</span>
      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 text-primary" />
    </button>
  );
}

// Static seed data mirroring KPI_2026.01.15_Live.xlsx → Summary tab
// Wire to live aggregates once monthly_projections + bookings_by_line tables exist.

const MONTHLY = [
  { m: "January",   b25: 937370.66,  b26p: 1182075, ytdB: 825934.17, i25: 865116.15,  i26p: 1182075, ytdI: 410767.97 },
  { m: "February",  b25: 1021413.44, b26p: 1177125, ytdB: 0,         i25: 724412.29,  i26p: 1177125, ytdI: 0 },
  { m: "March",     b25: 974619.36,  b26p: 1218325, ytdB: 0,         i25: 800670.10,  i26p: 1218325, ytdI: 0 },
  { m: "April",     b25: 642532.17,  b26p: 1333850, ytdB: 0,         i25: 825867.71,  i26p: 1333850, ytdI: 0 },
  { m: "May",       b25: 828008.29,  b26p: 1339125, ytdB: 0,         i25: 1412530.60, i26p: 1339125, ytdI: 0 },
  { m: "June",      b25: 907150.17,  b26p: 1239975, ytdB: 0,         i25: 1020681.81, i26p: 1239975, ytdI: 0 },
  { m: "July",      b25: 760857.46,  b26p: 1242600, ytdB: 0,         i25: 984456.97,  i26p: 1242600, ytdI: 0 },
  { m: "August",    b25: 771533.37,  b26p: 1273625, ytdB: 0,         i25: 705008.63,  i26p: 1273625, ytdI: 0 },
  { m: "September", b25: 843062.04,  b26p: 1346875, ytdB: 0,         i25: 1003081.62, i26p: 1346875, ytdI: 0 },
  { m: "October",   b25: 951639.16,  b26p: 1439450, ytdB: 0,         i25: 697164.14,  i26p: 1439450, ytdI: 0 },
  { m: "November",  b25: 967881.84,  b26p: 1414900, ytdB: 0,         i25: 941247.03,  i26p: 1414900, ytdI: 0 },
  { m: "December",  b25: 1064722.83, b26p: 1007075, ytdB: 0,         i25: 718460.78,  i26p: 1007075, ytdI: 0 },
];

const REP_BOOK = [
  { name: "Internet",    book: 58406.18,  pct: 0.5186 },
  { name: "Sergio",      book: 154754.19, pct: 5.9521 },
  { name: "House",       book: 66352.00,  pct: 1.4362 },
  { name: "Skip",        book: 3578.00,   pct: 0.0409 },
  { name: "Barbara J",   book: 108997.12, pct: 0.4137 },
  { name: "Durham",      book: 138486.80, pct: 0.9051 },
  { name: "Quillen",     book: 39227.50,  pct: 0.4264 },
  { name: "Shindell 1",  book: 57996.52,  pct: 0.9206 },
  { name: "Shindell 2",  book: 13205.60,  pct: 0.8804 },
  { name: "Stewart H",   book: 57005.00,  pct: 2.7145 },
  { name: "Fryer",       book: 0,         pct: 0 },
  { name: "TN/KY",       book: 0,         pct: 0 },
  { name: "Ervin",       book: 114013.26, pct: 0.5832 },
  { name: "Kerry",       book: 4075.00,   pct: 0.1663 },
  { name: "Avella",      book: 2144.00,   pct: 0.0613 },
  { name: "Robertson",   book: 5080.00,   pct: 0.2073 },
  { name: "Jastal",      book: 2373.00,   pct: 0.2373 },
  { name: "WI/IL",       book: 0,         pct: 0 },
];

const LINE_BOOK = [
  { m: "January",   luxP: 95650,  luxA: 209875, swP: 814550, swA: 389727, flP: 271875, flA: 196815 },
  { m: "February",  luxP: 94125,  luxA: 0, swP: 806800, swA: 0, flP: 276200, flA: 0 },
  { m: "March",     luxP: 96850,  luxA: 0, swP: 830925, swA: 0, flP: 290550, flA: 0 },
  { m: "April",     luxP: 106950, luxA: 0, swP: 904450, swA: 0, flP: 322450, flA: 0 },
  { m: "May",       luxP: 107525, luxA: 0, swP: 903850, swA: 0, flP: 327750, flA: 0 },
  { m: "June",      luxP: 101775, luxA: 0, swP: 824375, swA: 0, flP: 313825, flA: 0 },
  { m: "July",      luxP: 102450, luxA: 0, swP: 823425, swA: 0, flP: 316725, flA: 0 },
  { m: "August",    luxP: 105000, luxA: 0, swP: 842950, swA: 0, flP: 325675, flA: 0 },
  { m: "September", luxP: 109675, luxA: 0, swP: 900075, swA: 0, flP: 337125, flA: 0 },
  { m: "October",   luxP: 116350, luxA: 0, swP: 965050, swA: 0, flP: 358050, flA: 0 },
  { m: "November",  luxP: 113250, luxA: 0, swP: 944050, swA: 0, flP: 357600, flA: 0 },
  { m: "December",  luxP: 80400,  luxA: 0, swP: 669500, swA: 0, flP: 257175, flA: 0 },
];

const TODAY = new Date(2026, 0, 15);
const END = new Date(2026, 11, 31);
const DAYS_REMAINING = Math.round((END.getTime() - TODAY.getTime()) / 86400000);

const fmtPct = (n: number) => n === 0 ? "—" : `${(n * 100).toFixed(1)}%`;
const growth = (p: number, a: number) => a === 0 ? 0 : (p - a) / a;

const MONTHS = ["All","January","February","March","April","May","June","July","August","September","October","November","December"] as const;
type MonthFilter = typeof MONTHS[number];

type MetricFilter = "both" | "bookings" | "invoiced";
type LineFilter = "all" | "lux" | "sw" | "fl";

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function LiveKpiReport() {
  const [repFilter, setRepFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<MonthFilter>("All");
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("both");
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const [lineMonthFilter, setLineMonthFilter] = useState<MonthFilter>("All");
  const [overrides, setOverrides] = useState<ProjOverrides>(() => loadOverrides());

  useEffect(() => {
    try { localStorage.setItem(PROJ_STORAGE_KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
  }, [overrides]);

  const updateMonthly = (month: string, key: "b26p" | "i26p", val: number) => {
    setOverrides((prev) => ({
      ...prev,
      monthly: { ...(prev.monthly ?? {}), [month]: { ...(prev.monthly?.[month] ?? {}), [key]: val } },
    }));
  };
  const updateLine = (month: string, key: "luxP" | "swP" | "flP", val: number) => {
    setOverrides((prev) => ({
      ...prev,
      line: { ...(prev.line ?? {}), [month]: { ...(prev.line?.[month] ?? {}), [key]: val } },
    }));
  };

  // Apply user-entered projection overrides to base data
  const baseMonthly = useMemo(() => MONTHLY.map((r) => ({
    ...r,
    b26p: overrides.monthly?.[r.m]?.b26p ?? r.b26p,
    i26p: overrides.monthly?.[r.m]?.i26p ?? r.i26p,
  })), [overrides]);

  const baseLine = useMemo(() => LINE_BOOK.map((r) => ({
    ...r,
    luxP: overrides.line?.[r.m]?.luxP ?? r.luxP,
    swP: overrides.line?.[r.m]?.swP ?? r.swP,
    flP: overrides.line?.[r.m]?.flP ?? r.flP,
  })), [overrides]);

  // Per-rep slicing: when a rep is selected, use that rep's actual monthly figures
  // from the spreadsheet (REP_MONTHLY). Otherwise use the team Summary totals.
  const totalRepBook = REP_BOOK.reduce((s, r) => s + r.book, 0);
  const selectedRep = repFilter === "all" ? null : REP_BOOK.find((r) => r.name === repFilter) ?? null;
  const repShare = selectedRep ? (totalRepBook > 0 ? selectedRep.book / totalRepBook : 0) : 1;

  // Edits to per-rep projections aren't persisted back to the team total (real per-rep
  // numbers come from the spreadsheet). For "All" view we still write through to MONTHLY.
  const saveMonthly = (month: string, key: "b26p" | "i26p", displayedVal: number) => {
    if (selectedRep) return; // editing disabled when viewing a single rep
    updateMonthly(month, key, displayedVal);
  };
  const saveLine = (month: string, key: "luxP" | "swP" | "flP", displayedVal: number) => {
    const base = repShare > 0 ? displayedVal / repShare : displayedVal;
    updateLine(month, key, base);
  };

  const scaledMonthly = useMemo(() => {
    if (selectedRep && REP_MONTHLY[selectedRep.name]) {
      // Real per-rep monthly bookings & invoiced from the spreadsheet
      return REP_MONTHLY[selectedRep.name];
    }
    return baseMonthly;
  }, [selectedRep, baseMonthly]);

  const scaledLine = useMemo(() => baseLine.map((r) => ({
    ...r,
    luxP: r.luxP * repShare, luxA: r.luxA * repShare,
    swP: r.swP * repShare,   swA: r.swA * repShare,
    flP: r.flP * repShare,   flA: r.flA * repShare,
  })), [repShare, baseLine]);

  const monthly = useMemo(
    () => monthFilter === "All" ? scaledMonthly : scaledMonthly.filter((r) => r.m === monthFilter),
    [monthFilter, scaledMonthly]
  );

  const sum = (arr: typeof MONTHLY, k: keyof typeof MONTHLY[number]) =>
    arr.reduce((s, r) => s + (r[k] as number), 0);

  const sumB25 = sum(monthly, "b25");
  const sumB26P = sum(monthly, "b26p");
  const sumYtdB = sum(monthly, "ytdB");
  const sumI25 = sum(monthly, "i25");
  const sumI26P = sum(monthly, "i26p");
  const sumYtdI = sum(monthly, "ytdI");
  const dayOfYear = Math.floor((TODAY.getTime() - new Date(2026, 0, 1).getTime()) / 86400000) + 1;
  const annualB = sumYtdB / dayOfYear * 365;
  const annualI = sumYtdI / dayOfYear * 365;

  const showB = metricFilter !== "invoiced";
  const showI = metricFilter !== "bookings";


  const lineRows = useMemo(
    () => lineMonthFilter === "All" ? scaledLine : scaledLine.filter((r) => r.m === lineMonthFilter),
    [lineMonthFilter, scaledLine]
  );

  const luxP = lineRows.reduce((s, r) => s + r.luxP, 0);
  const luxA = lineRows.reduce((s, r) => s + r.luxA, 0);
  const swP = lineRows.reduce((s, r) => s + r.swP, 0);
  const swA = lineRows.reduce((s, r) => s + r.swA, 0);
  const flP = lineRows.reduce((s, r) => s + r.flP, 0);
  const flA = lineRows.reduce((s, r) => s + r.flA, 0);

  const showLux = lineFilter === "all" || lineFilter === "lux";
  const showSW = lineFilter === "all" || lineFilter === "sw";
  const showFL = lineFilter === "all" || lineFilter === "fl";

  return (
    <div className="space-y-6">
      {/* Global filter + header strip */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Filter Report By Rep</span>
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="h-9 px-3 rounded-md border bg-background text-sm font-medium min-w-[200px]"
          >
            <option value="all">All Reps (Combined)</option>
            {[...REP_BOOK].sort((a, b) => a.name.localeCompare(b.name)).map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
          {selectedRep && (
            <>
              <span className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{selectedRep.name}</span> · live numbers from rep tab
              </span>
              <button
                onClick={() => setRepFilter("all")}
                className="ml-auto text-xs text-primary hover:underline"
              >
                Clear filter
              </button>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Today's Date</p>
            <p className="font-semibold">{TODAY.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">End Date</p>
            <p className="font-semibold">{END.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Days Remaining</p>
            <p className="font-semibold">{DAYS_REMAINING}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Reporting Year</p>
            <p className="font-semibold">2026</p>
          </div>
        </div>
      </div>

      {/* Bookings — Actual vs Goal chart */}
      <div className="glass-card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold">Bookings — Actual vs Goal</h3>
            <p className="text-xs text-muted-foreground">
              Monthly 2026 projection (goal) vs YTD actual
              {selectedRep ? <> · <span className="font-medium text-foreground">{selectedRep.name}</span></> : <> · all reps</>}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-primary/70" />2026 Goal</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-accent" />YTD 2026</span>
          </div>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scaledMonthly} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="m"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: string) => v.slice(0, 3)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [formatCurrency(v), name]}
              />
              <Bar dataKey="b26p" name="2026 Goal" fill="hsl(var(--primary) / 0.7)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="ytdB" name="YTD 2026" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Results */}
      <div className="glass-card p-5">
        <h3 className="text-base font-semibold mb-1">Monthly Results</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Bookings & Invoiced — 2025 actual vs 2026 projection vs YTD
          {selectedRep
            ? <span className="ml-1">· live data from <span className="font-medium text-foreground">{selectedRep.name}</span> tab</span>
            : <> · <span className="text-primary">Click any 2026 P value to edit</span></>}
        </p>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Metric:</span>
            <div className="flex gap-1">
              <FilterChip active={metricFilter === "both"} onClick={() => setMetricFilter("both")}>Both</FilterChip>
              <FilterChip active={metricFilter === "bookings"} onClick={() => setMetricFilter("bookings")}>Bookings</FilterChip>
              <FilterChip active={metricFilter === "invoiced"} onClick={() => setMetricFilter("invoiced")}>Invoiced</FilterChip>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Month:</span>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value as MonthFilter)}
              className="h-8 px-2 rounded-md border bg-background text-xs"
            >
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th rowSpan={2} className="text-left p-2 font-medium text-muted-foreground align-bottom">Month</th>
                {showB && <th colSpan={4} className="text-center p-2 font-semibold border-l bg-muted/30">Bookings</th>}
                {showI && <th colSpan={4} className="text-center p-2 font-semibold border-l bg-muted/30">Invoiced</th>}
              </tr>
              <tr className="border-b text-muted-foreground">
                {showB && <>
                  <th className="text-right p-2 font-medium border-l">2025</th>
                  <th className="text-right p-2 font-medium">2026 P</th>
                  <th className="text-right p-2 font-medium">Proj Growth %</th>
                  <th className="text-right p-2 font-medium">YTD 2026 / % Goal</th>
                </>}
                {showI && <>
                  <th className="text-right p-2 font-medium border-l">2025</th>
                  <th className="text-right p-2 font-medium">2026 P</th>
                  <th className="text-right p-2 font-medium">YTD 2026</th>
                  <th className="text-right p-2 font-medium">% Goal</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {monthly.map((r) => {
                const idx = MONTHLY.findIndex((m) => m.m === r.m);
                return (
                  <tr key={r.m} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-2 font-medium">{idx + 1}. {r.m}</td>
                    {showB && <>
                      <td className="p-2 text-right border-l">{formatCurrency(r.b25)}</td>
                      <td className="p-2 text-right">
                        {selectedRep
                          ? formatCurrency(r.b26p)
                          : <EditableCurrency value={r.b26p} onSave={(v) => saveMonthly(r.m, "b26p", v)} />}
                      </td>
                      <td className="p-2 text-right">{fmtPct(growth(r.b26p, r.b25))}</td>
                      <td className="p-2 text-right">
                        <span className="font-medium">{formatCurrency(r.ytdB)}</span>
                        <span className="text-muted-foreground ml-1">/ {fmtPct(r.ytdB / r.b26p)}</span>
                      </td>
                    </>}
                    {showI && <>
                      <td className="p-2 text-right border-l">{formatCurrency(r.i25)}</td>
                      <td className="p-2 text-right">
                        {selectedRep
                          ? formatCurrency(r.i26p)
                          : <EditableCurrency value={r.i26p} onSave={(v) => saveMonthly(r.m, "i26p", v)} />}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(r.ytdI)}</td>
                      <td className="p-2 text-right">{fmtPct(r.ytdI / r.i26p)}</td>
                    </>}
                  </tr>
                );
              })}
              <tr className="border-t-2 font-semibold bg-muted/20">
                <td className="p-2">TOTAL</td>
                {showB && <>
                  <td className="p-2 text-right border-l">{formatCurrency(sumB25)}</td>
                  <td className="p-2 text-right">{formatCurrency(sumB26P)}</td>
                  <td className="p-2 text-right">{fmtPct(growth(sumB26P, sumB25))}</td>
                  <td className="p-2 text-right">{formatCurrency(sumYtdB)} / {fmtPct(sumYtdB / sumB26P)}</td>
                </>}
                {showI && <>
                  <td className="p-2 text-right border-l">{formatCurrency(sumI25)}</td>
                  <td className="p-2 text-right">{formatCurrency(sumI26P)}</td>
                  <td className="p-2 text-right">{formatCurrency(sumYtdI)}</td>
                  <td className="p-2 text-right">{fmtPct(sumYtdI / sumI26P)}</td>
                </>}
              </tr>
              {monthFilter === "All" && (
                <tr className="bg-accent/5 text-accent-foreground/80">
                  <td className="p-2 font-medium">ANNUALIZED</td>
                  {showB && <td colSpan={4} className="p-2 text-right border-l font-medium">{formatCurrency(annualB)}</td>}
                  {showI && <td colSpan={4} className="p-2 text-right border-l font-medium">{formatCurrency(annualI)}</td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bookings by Line */}
      <div className="glass-card p-5">
        <h3 className="text-base font-semibold mb-1">Monthly Gross Bookings by Line</h3>
        <p className="text-xs text-muted-foreground mb-4">Lux · SW · FL — projection vs actual vs % goal</p>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Line:</span>
            <div className="flex gap-1">
              <FilterChip active={lineFilter === "all"} onClick={() => setLineFilter("all")}>All</FilterChip>
              <FilterChip active={lineFilter === "lux"} onClick={() => setLineFilter("lux")}>Lux</FilterChip>
              <FilterChip active={lineFilter === "sw"} onClick={() => setLineFilter("sw")}>SW</FilterChip>
              <FilterChip active={lineFilter === "fl"} onClick={() => setLineFilter("fl")}>FL</FilterChip>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Month:</span>
            <select
              value={lineMonthFilter}
              onChange={(e) => setLineMonthFilter(e.target.value as MonthFilter)}
              className="h-8 px-2 rounded-md border bg-background text-xs"
            >
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th rowSpan={2} className="text-left p-2 font-medium text-muted-foreground align-bottom">Month</th>
                {showLux && <th colSpan={3} className="text-center p-2 font-semibold border-l bg-muted/30">Lux</th>}
                {showSW && <th colSpan={3} className="text-center p-2 font-semibold border-l bg-muted/30">SW</th>}
                {showFL && <th colSpan={3} className="text-center p-2 font-semibold border-l bg-muted/30">FL</th>}
              </tr>
              <tr className="border-b text-muted-foreground">
                {showLux && <>
                  <th className="text-right p-2 font-medium border-l">26 Proj</th>
                  <th className="text-right p-2 font-medium">26 Act</th>
                  <th className="text-right p-2 font-medium">% Goal</th>
                </>}
                {showSW && <>
                  <th className="text-right p-2 font-medium border-l">26 Proj</th>
                  <th className="text-right p-2 font-medium">26 Act</th>
                  <th className="text-right p-2 font-medium">% Goal</th>
                </>}
                {showFL && <>
                  <th className="text-right p-2 font-medium border-l">26 Proj</th>
                  <th className="text-right p-2 font-medium">26 Act</th>
                  <th className="text-right p-2 font-medium">% Goal</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {lineRows.map((r) => {
                const idx = LINE_BOOK.findIndex((l) => l.m === r.m);
                return (
                  <tr key={r.m} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-2 font-medium">{idx + 1}. {r.m}</td>
                    {showLux && <>
                      <td className="p-2 text-right border-l">
                        <EditableCurrency value={r.luxP} onSave={(v) => saveLine(r.m, "luxP", v)} />
                      </td>
                      <td className="p-2 text-right">{formatCurrency(r.luxA)}</td>
                      <td className="p-2 text-right">{fmtPct(r.luxA / r.luxP)}</td>
                    </>}
                    {showSW && <>
                      <td className="p-2 text-right border-l">
                        <EditableCurrency value={r.swP} onSave={(v) => saveLine(r.m, "swP", v)} />
                      </td>
                      <td className="p-2 text-right">{formatCurrency(r.swA)}</td>
                      <td className="p-2 text-right">{fmtPct(r.swA / r.swP)}</td>
                    </>}
                    {showFL && <>
                      <td className="p-2 text-right border-l">
                        <EditableCurrency value={r.flP} onSave={(v) => saveLine(r.m, "flP", v)} />
                      </td>
                      <td className="p-2 text-right">{formatCurrency(r.flA)}</td>
                      <td className="p-2 text-right">{fmtPct(r.flA / r.flP)}</td>
                    </>}
                  </tr>
                );
              })}
              <tr className="border-t-2 font-semibold bg-muted/20">
                <td className="p-2">TOTAL</td>
                {showLux && <>
                  <td className="p-2 text-right border-l">{formatCurrency(luxP)}</td>
                  <td className="p-2 text-right">{formatCurrency(luxA)}</td>
                  <td className="p-2 text-right">{fmtPct(luxA / luxP)}</td>
                </>}
                {showSW && <>
                  <td className="p-2 text-right border-l">{formatCurrency(swP)}</td>
                  <td className="p-2 text-right">{formatCurrency(swA)}</td>
                  <td className="p-2 text-right">{fmtPct(swA / swP)}</td>
                </>}
                {showFL && <>
                  <td className="p-2 text-right border-l">{formatCurrency(flP)}</td>
                  <td className="p-2 text-right">{formatCurrency(flA)}</td>
                  <td className="p-2 text-right">{fmtPct(flA / flP)}</td>
                </>}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          Static layout from KPI_2026.01.15_Live.xlsx · wire to live data once monthly projection tables exist.
        </p>
      </div>
    </div>
  );
}

