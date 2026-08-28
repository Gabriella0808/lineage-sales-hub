import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { formatCurrency, useSalesReps } from "@/hooks/usePortalData";
import { useAcctivateRepCatalog } from "@/hooks/useAcctivateRepCatalog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronsUpDown, Check, X, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDealerSalesAggregates } from "@/hooks/useDealerSalesAggregates";
import { supabase } from "@/integrations/supabase/client";
import { useRepTargets, MONTH_LABEL_TO_KEY, type RepTarget } from "@/hooks/useRepTargets";
import { isBookingVisible } from "@/utils/bookingCutoff";
import { getReportingToday, getReportingTodayStr } from "@/utils/reportingDate";

const PROJ_STORAGE_KEY = "kpi_projections_2026_v1";

// Gate 2025 actuals behind this flag. Set to true once 2025 data has been pulled.
const SHOW_PRIOR_YEAR_ACTUALS = false;

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


// Static seed data mirroring KPI_2026.01.15_Live.xlsx -  Summary tab
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

// Sourced from Summary tab of KPI_2026.01.15_Live-3.xlsx (one entry per rep tab in the workbook)
const REP_BOOK = [
  { name: "Internet",         book: 58406.18,  pct: 0.5186 },
  { name: "Hospitality",      book: 154754.19, pct: 5.9521 },
  { name: "House",            book: 66352.00,  pct: 1.4362 },
  { name: "Skip Camillo",     book: 3578.00,   pct: 0.0409 },
  { name: "Barbara J",        book: 108997.12, pct: 0.4137 },
  { name: "Mike Durham",      book: 138486.80, pct: 0.9051 },
  { name: "Bruce Quillen",    book: 39227.50,  pct: 0.4264 },
  { name: "Jordan Shindell",  book: 71202.12,  pct: 0.9005 },
  { name: "Stewart Hunt",     book: 57005.00,  pct: 2.7145 },
  { name: "Gary Fryer",       book: 0,         pct: 0 },
  { name: "TN/KY",            book: 0,         pct: 0 },
  { name: "Dave Ervin",       book: 114013.26, pct: 0.5832 },
  { name: "Kerry",            book: 4075.00,   pct: 0.1663 },
  { name: "Peter Avella",     book: 2144.00,   pct: 0.0613 },
  { name: "Brad Robertson",   book: 5080.00,   pct: 0.2073 },
  { name: "Jastal",           book: 2373.00,   pct: 0.2373 },
  { name: "WI/IL",            book: 0,         pct: 0 },
];


// Maps Live KPI display rep names -  matching name(s) in the sales_reps table
// (used to pull `rep_targets` for the 26 Proj column). Names not listed fall
// back to an exact match against the display name.
const REP_NAME_TO_DB_NAMES: Record<string, string[]> = {
  "Hospitality":     ["Sergio - Hospitality"],
  "Jordan Shindell": ["Jordan Shindell", "Shindell - PA/OH"],
};

// Reverse of REP_NAME_TO_DB_NAMES: DB rep name (lowercased) → spreadsheet display name.
// Used when we receive portal rep UUIDs from the manager scope to map back to display names.
// Any DB name not listed here falls back to itself (identity mapping).
const DB_NAME_TO_DISPLAY: Record<string, string> = Object.fromEntries(
  Object.entries(REP_NAME_TO_DB_NAMES).flatMap(([display, dbNames]) =>
    dbNames.map((n) => [n.toLowerCase(), display]),
  ),
);


// Maps REP_BOOK display names -  list of territory names they cover.
// Used by the Territory filter on the Live KPI report.
const REP_TO_TERRITORIES: Record<string, string[]> = {
  "Internet":         ["Internet"],
  "Hospitality":      ["Hospitality"],
  "House":            ["House"],
  "Skip Camillo":     ["New England", "Skip Camillo"],
  "Mike Durham":      ["North Florida"],
  "Bruce Quillen":    ["Panhandle/GA/AL"],
  "Jordan Shindell":  ["Mid Atlantic", "OH/WPA"],
  "Stewart Hunt":     ["TX/OK"],
  "Gary Fryer":       ["Arkansas"],
  "TN/KY":            ["TN/KY"],
  "Dave Ervin":       ["NC/SC"],
  "Peter Avella":     ["NY/NJ"],
  "Brad Robertson":   ["VA/WV"],
  "WI/IL":            ["IL/WI"],
};
// Maps each manager (lowercased) to the REP_BOOK rep names they oversee.
// Only includes reps that exist as tabs in the KPI workbook.
const MANAGER_TO_REPS: Record<string, string[]> = {
  "sergio":            ["Hospitality"],
  "chris de lisa":     ["Skip Camillo", "House"],
  "will grisack":      ["Jordan Shindell", "Barbara J", "Stewart Hunt", "Bruce Quillen", "Mike Durham", "Gary Fryer", "TN/KY"],
  "mateo de lisa":     ["Dave Ervin", "Kerry", "Brad Robertson", "Peter Avella", "Jastal", "WI/IL"],
  "justin jeangerard": ["House"],
};

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


const fmtPct = (n: number) => (!isFinite(n) || n === 0) ? "-" : `${(n * 100).toFixed(1)}%`;
// Like fmtPct but never returns "-" for 0 — used when we know classified data exists
// and a zero share is meaningful (e.g. container=0 while warehouse>0).
const fmtPctRaw = (n: number) => `${(n * 100).toFixed(1)}%`;

type CollKey = "SW" | "FIN" | "LUX" | "HOSP" | "MISC" | "ALLOW" | "Other";
const COLL_LABEL: Record<CollKey, string> = {
  SW: "SW", FIN: "FIN", LUX: "LUX", HOSP: "HOSP", MISC: "MISC", ALLOW: "ALLOW", Other: "Other",
};

function classifyCollection(bc: string | null): CollKey {
  if (!bc) return "Other";
  const s = bc.toLowerCase();
  if (s.startsWith("sw") || s.includes("sea wind")) return "SW";
  if (s.startsWith("fin") || s.includes("finn")) return "FIN";
  if (s.startsWith("lux")) return "LUX";
  if (s.startsWith("hosp") || s.includes("hospit")) return "HOSP";
  // Bookings: ALLOW maps to brand_category='MISC' (unchanged in bookings view)
  // Invoiced: ALLOW maps to brand_category='ALLOW' (display_category in invoice view)
  if (s === "misc") return "MISC";
  if (s === "allow") return "ALLOW";
  return "Other";
}

// TODO: DAILY EMAIL DIGEST — wire this payload to a Supabase Edge Function
// (e.g. Resend API) when email automation is approved. Do NOT call automatically.
export function prepareDailyEmailPayload(params: {
  date: string; scope: string;
  totalInv: number; totalBkg: number;
  invByCollection: Record<CollKey, number>;
  bkgByCollection: Record<CollKey, number>;
}) { return params; }

const MONTHS = ["All","January","February","March","April","May","June","July","August","September","October","November","December"] as const;
type MonthFilter = typeof MONTHS[number];

type MetricFilter = "both" | "bookings" | "invoiced";
type LineFilter = "all" | "lux" | "sw" | "fl";

export function LiveKpiReport({
  managerName,
  managerId,
  lockedRepName,
  managerScopeRepIds,
  refreshKey,
}: {
  managerName?: string;
  /** managers.id UUID from the URL — passed directly to the reporting RPC. null = all. */
  managerId?: string | null;
  lockedRepName?: string | null;
  /** Portal rep UUID[] from CompanyWidePage — used for UI scoping (dropdowns, spreadsheet). */
  managerScopeRepIds?: string[] | null;
  /** Increment to force re-fetch of useDealerSalesAggregates (non-React Query). */
  refreshKey?: number;
} = {}) {
  // Eastern Time reporting date — single source of truth for all date logic in this component.
  const reportingToday    = getReportingToday();
  const reportingTodayStr = getReportingTodayStr();
  const reportingYear     = reportingToday.getFullYear();
  const reportingEndOfYear = new Date(reportingYear, 11, 31);
  const reportingDaysRemaining = Math.max(
    0,
    Math.ceil((reportingEndOfYear.getTime() - reportingToday.getTime()) / 86400000),
  );

  // Must be declared before allowedRepNames so the useMemo can read it.
  const { data: dbReps = [] } = useSalesReps();

  // Acctivate rep catalog — used for territory and manager labelling/filtering.
  // Falls back to the hardcoded REP_TO_TERRITORIES map when territory data is
  // not yet populated in acctivate_sales_reps (e.g., before first enriched sync).
  const { reps: acctivateReps } = useAcctivateRepCatalog();

  // Map: acctivate_id (lowercase) → territory_name from Acctivate rep catalog.
  const acctivateIdToTerritory = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of acctivateReps) {
      if (r.territory_name) m.set(r.acctivate_id.toLowerCase(), r.territory_name);
    }
    return m;
  }, [acctivateReps]);

  // Map: rep display name → [territory names] built from Acctivate data via dbReps.acctivate_id.
  // Prefers Acctivate-sourced territory; falls back to hardcoded REP_TO_TERRITORIES.
  const dbRepNameToTerritory = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const rep of dbReps) {
      if (!rep.acctivate_id) continue;
      const territory = acctivateIdToTerritory.get(rep.acctivate_id.toLowerCase());
      if (!territory) continue;
      const displayName = DB_NAME_TO_DISPLAY[rep.name.toLowerCase()] ?? rep.name;
      const existing = m.get(displayName) ?? [];
      if (!existing.includes(territory)) m.set(displayName, [...existing, territory]);
    }
    return m;
  }, [dbReps, acctivateIdToTerritory]);

  const allowedRepNames = useMemo(() => {
    if (lockedRepName) return [lockedRepName];

    // Prefer DB-driven scope (managerScopeRepIds) over the hardcoded MANAGER_TO_REPS map.
    // managerScopeRepIds is always provided by CompanyWidePage; undefined only in rare
    // direct renders without the parent context.
    if (managerScopeRepIds !== undefined) {
      if (managerScopeRepIds === null) return null; // "All managers" → show everything
      if (managerScopeRepIds.length === 0) return []; // manager exists but has no reps
      // Map portal UUIDs → DB rep names → spreadsheet display names.
      // Unknown DB names (not in DB_NAME_TO_DISPLAY) map to themselves so live data
      // still flows through useDealerSalesAggregates correctly.
      return Array.from(new Set(
        managerScopeRepIds
          .map((id) => dbReps.find((r) => r.id === id)?.name)
          .filter((n): n is string => Boolean(n))
          .map((n) => DB_NAME_TO_DISPLAY[n.toLowerCase()] ?? n),
      ));
    }

    // Fallback: hardcoded map (only reached when managerScopeRepIds is not provided).
    if (!managerName) return null;
    const list = MANAGER_TO_REPS[managerName.trim().toLowerCase()];
    return list ?? [];
  }, [managerName, lockedRepName, managerScopeRepIds, dbReps]);

  const [territoryFilter, setTerritoryFilter] = useState<string[]>([]);
  const [territoryPickerOpen, setTerritoryPickerOpen] = useState(false);
  const [dailyDate, setDailyDate] = useState<Date>(() => getReportingToday());
  const [dailyDatePickerOpen, setDailyDatePickerOpen] = useState(false);

  // Merge REP_BOOK (which has the spreadsheet figures) with all reps from the DB,
  // so the dropdown lists every rep even if they don't have KPI workbook data yet.
  const allReps = useMemo(() => {
    const byName = new Map<string, { name: string; book: number; pct: number }>();
    for (const r of REP_BOOK) byName.set(r.name, r);
    for (const r of dbReps) {
      if (!byName.has(r.name)) byName.set(r.name, { name: r.name, book: 0, pct: 0 });
    }
    return Array.from(byName.values());
  }, [dbReps]);

  // Returns territories for a rep display name.
  // Prefers DB-sourced data from acctivate_sales_reps; falls back to hardcoded map.
  const getRepTerritories = useMemo(() => {
    return (repName: string): string[] => {
      const fromDb = dbRepNameToTerritory.get(repName);
      if (fromDb && fromDb.length > 0) return fromDb;
      return REP_TO_TERRITORIES[repName] ?? [];
    };
  }, [dbRepNameToTerritory]);

  const visibleReps = useMemo(() => {
    let reps = allowedRepNames === null
      ? allReps
      : allReps.filter((r) => allowedRepNames.includes(r.name));
    if (territoryFilter.length > 0) {
      reps = reps.filter((r) => getRepTerritories(r.name).some((t) => territoryFilter.includes(t)));
    }
    return reps;
  }, [allReps, allowedRepNames, territoryFilter, getRepTerritories]);

  // Territories available for the current manager scope (pre-territory-filter).
  // Shows only territories that have at least one rep in scope — avoids presenting
  // options that would silently return zero data.
  // Prefers DB-sourced territory names from acctivate_sales_reps; falls back to hardcoded.
  const availableTerritories = useMemo(() => {
    const scopedReps = allowedRepNames === null
      ? allReps
      : allReps.filter((r) => allowedRepNames.includes(r.name));
    return Array.from(
      new Set(scopedReps.flatMap((r) => getRepTerritories(r.name))),
    ).sort();
  }, [allReps, allowedRepNames, getRepTerritories]);

  const [repFilter, setRepFilter] = useState<string[]>(lockedRepName ? [lockedRepName] : []);
  const [repPickerOpen, setRepPickerOpen] = useState(false);

  // Reset rep filter when manager scope changes and current selections aren't in scope.
  useEffect(() => {
    if (lockedRepName) {
      if (repFilter.length !== 1 || repFilter[0] !== lockedRepName) setRepFilter([lockedRepName]);
      return;
    }
    const allowed = new Set(visibleReps.map((r) => r.name));
    const next = repFilter.filter((n) => allowed.has(n));
    if (next.length !== repFilter.length) setRepFilter(next);
  }, [visibleReps, repFilter, lockedRepName]);

  const [monthFilter] = useState<MonthFilter>("All");
  const [metricFilter] = useState<MetricFilter>("both");
  const [monthlyLineFilter, setMonthlyLineFilter] = useState<Exclude<LineFilter, "all">[]>([]);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [overrides] = useState<ProjOverrides>(() => loadOverrides());

  // Resolve individual rep/territory selections → Acctivate rep codes (acctivate_id).
  // When no individual rep is selected, managerId drives aggregation scope via
  // get_manager_reporting_monthly's canonical manager join — no name resolution needed.
  //
  // Display names (from REP_BOOK / allowedRepNames) may differ from DB names —
  // e.g. "Hospitality" in the spreadsheet vs "Sergio - Hospitality" in sales_reps.
  // REP_NAME_TO_DB_NAMES maps display → DB name(s); fall back to the display name
  // itself for reps whose DB name already matches.
  const selectedRepAcIds = useMemo<string[] | null>(() => {
    let displayNames: string[] | null = null;
    if (lockedRepName) displayNames = [lockedRepName];
    else if (repFilter.length > 0) displayNames = repFilter;
    else if (territoryFilter.length > 0) displayNames = visibleReps.map((r) => r.name);
    if (displayNames === null) return null;
    // Translate display names → DB names, then → acctivate_id.
    const dbNames = displayNames.flatMap((n) => REP_NAME_TO_DB_NAMES[n] ?? [n]);
    return dbNames
      .map((dbName) => dbReps.find((r) => r.name === dbName)?.acctivate_id)
      .filter((id): id is string => !!id && id.trim() !== "");
  }, [lockedRepName, repFilter, territoryFilter, visibleReps, dbReps]);


  // Daily actuals — canonical source v_companywide_reporting_actuals.
  // Manager scope: server-side manager_id filter (reliable, no name resolution).
  // Individual rep selection: client-side rep_id filter (case-insensitive).
  const todayStr     = reportingTodayStr;
  const dailyDateStr = format(dailyDate, "yyyy-MM-dd");
  const isToday      = dailyDateStr === todayStr;

  // Invoices are posted in Acctivate on the prior business day; querying today
  // always returns $0. Bookings = selected date (default today), Invoices = day before.
  const invoiceDate    = subDays(dailyDate, 1);
  const invoiceDateStr = format(invoiceDate, "yyyy-MM-dd");

  const repQueryKey = JSON.stringify(selectedRepAcIds?.slice().sort() ?? null);

  // Daily actuals: bookings use dailyDateStr (default today), invoiced use
  // invoiceDateStr (day before) because Acctivate invoice sync runs overnight.
  // Both dates are fetched in one query and split client-side by metric_type.
  const { data: rawDailyRows = [] } = useQuery({
    queryKey: ["daily_actuals_v2", dailyDateStr, invoiceDateStr, managerId ?? null, repQueryKey],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("v_companywide_reporting_actuals")
        .select("metric_type, brand_category, amount, rep_id, transaction_date")
        .in("transaction_date", [dailyDateStr, invoiceDateStr]);
      if (managerId && !(selectedRepAcIds && selectedRepAcIds.length > 0)) {
        q = q.eq("manager_id", managerId);
      }
      const { data, error } = await q;
      if (error) { console.error("[daily] actuals error:", error.message); return []; }
      let rows = (data ?? []) as Array<{ metric_type: string; brand_category: string | null; amount: string | number; rep_id: string | null; transaction_date: string | null }>;
      if (selectedRepAcIds && selectedRepAcIds.length > 0) {
        const idSet = new Set(selectedRepAcIds.map((id) => id.trim().toLowerCase()));
        rows = rows.filter((r) => r.rep_id && idSet.has(r.rep_id.trim().toLowerCase()));
      }
      return rows;
    },
  });

  // Live actuals — single canonical source for all three reporting surfaces.
  // Manager scope: managerId UUID → sales_reps.acctivate_id → rep_id join in DB.
  // Rep/territory scope: selectedRepAcIds overrides managerId in the RPC.
  const { data: liveAgg } = useDealerSalesAggregates({
    managerId: managerId ?? null,
    repAcIds: selectedRepAcIds,
    refreshKey,
  });

  // Scope validation: fires whenever the resolved filter changes. All five sections
  // (MTD cards, daily cards, chart, monthly table, TOTAL row) derive from the same
  // selectedRepAcIds → useDealerSalesAggregates → liveAgg chain, so a single log here
  // confirms uniform scope across the component.
  useEffect(() => {
    const scope =
      selectedRepAcIds === null
        ? managerId ? `manager (${managerId})` : "company-wide"
        : `rep-filter [${selectedRepAcIds.join(", ")}]`;
    console.group(`[live-kpi] scope resolved → ${scope}`);
    console.log("managerId:", managerId ?? "null (company-wide)");
    console.log("repFilter:", repFilter.length ? repFilter : "(none)");
    console.log("territoryFilter:", territoryFilter.length ? territoryFilter : "(none)");
    console.log("visibleReps:", visibleReps.map((r) => r.name));
    console.log("selectedRepAcIds:", selectedRepAcIds ?? "null → all manager/company reps");
    console.groupEnd();
  }, [managerId, repFilter, territoryFilter, visibleReps, selectedRepAcIds]);

  useEffect(() => {
    const nonZeroMonths = liveAgg.filter((r) => r.ytdB > 0 || r.ytdI > 0);
    console.log("[live-kpi] actuals loaded:", {
      managerId,
      selectedRepAcIds,
      months: nonZeroMonths.map((r) => `${r.m}: bookings=$${r.ytdB.toFixed(0)} invoiced=$${r.ytdI.toFixed(0)}`),
    });
  }, [managerId, selectedRepAcIds, liveAgg]);


  const baseMonthly = useMemo(() => MONTHLY.map((seed) => {
    const live = liveAgg.find((r) => r.m === seed.m);
    return {
      ...seed,
      // Override actuals with live DB values.
      // i25: the view only covers the current year (QBO-synced), so fall back to
      // the KPI spreadsheet seed when the live value is absent or zero.
      b25:  live && live.b25  > 0 ? live.b25  : seed.b25,
      i25:  live && live.i25  > 0 ? live.i25  : seed.i25,
      ytdB: live && live.ytdB > 0 ? live.ytdB : 0,
      ytdI: live && live.ytdI > 0 ? live.ytdI : 0,
      // Branch-split invoice totals (live only - no seed fallback).
      i25Container:     live?.i25Container     ?? 0,
      i25Warehouse:     live?.i25Warehouse     ?? 0,
      ytdIContainer:    live?.ytdIContainer    ?? 0,
      ytdIWarehouse:    live?.ytdIWarehouse    ?? 0,
      ytdIContainerPct: live?.ytdIContainerPct ?? null,
      ytdIWarehousePct: live?.ytdIWarehousePct ?? null,
      // Branch-split booking totals (MIXED=container, WHSALES=warehouse).
      b25Container:  live?.b25Container  ?? 0,
      b25Warehouse:  live?.b25Warehouse  ?? 0,
      ytdBContainer: live?.ytdBContainer ?? 0,
      ytdBWarehouse: live?.ytdBWarehouse ?? 0,
      // Apply overrides on top of seed (line-level only; monthly projections are no longer editable).
      b26p: overrides.monthly?.[seed.m]?.b26p ?? seed.b26p,
      i26p: overrides.monthly?.[seed.m]?.i26p ?? seed.i26p,
    };
  }), [overrides, liveAgg]);

  const baseLine = useMemo(() => LINE_BOOK.map((r) => ({
    ...r,
    luxP: overrides.line?.[r.m]?.luxP ?? r.luxP,
    swP: overrides.line?.[r.m]?.swP ?? r.swP,
    flP: overrides.line?.[r.m]?.flP ?? r.flP,
  })), [overrides]);

  // Per-rep slicing: when a rep is selected, use that rep's actual monthly figures
  // from the spreadsheet (REP_MONTHLY). Otherwise use the team Summary totals
  // (or the sum of the manager's reps when scoped to a manager).
  const totalRepBook = REP_BOOK.reduce((s, r) => s + r.book, 0);
  const selectedRepObjs = useMemo(
    () => repFilter.map((n) => REP_BOOK.find((r) => r.name === n)).filter(Boolean) as typeof REP_BOOK,
    [repFilter],
  );
  const hasRepSelection = repFilter.length > 0;
  const managerRepBook = useMemo(
    () => visibleReps.reduce((s, r) => s + r.book, 0),
    [visibleReps],
  );
  const selectedRepBook = selectedRepObjs.reduce((s, r) => s + r.book, 0);
  const repShare = hasRepSelection
    ? (totalRepBook > 0 ? selectedRepBook / totalRepBook : 0)
    : (allowedRepNames === null ? 1 : (totalRepBook > 0 ? managerRepBook / totalRepBook : 0));

  // Actuals (ytdB, ytdI, b25, i25, all branch-splits) are already scoped to the
  // selected manager / rep by useDealerSalesAggregates → get_manager_reporting_monthly.
  // The canonical DB is the single source of truth — no spreadsheet overlay or
  // repShare scaling is applied to actuals.
  const scaledMonthly = baseMonthly;

  // 26 Proj is sourced from the Sales Targets section (rep_targets table).
  // Sum targets for the reps currently in scope; fall back to seed projections only when no targets exist.
  const { data: targets2026 = [] } = useRepTargets(2026);
  const MONTH_FULL_TO_SHORT: Record<string, string> = {
    January:"Jan", February:"Feb", March:"Mar", April:"Apr", May:"May", June:"Jun",
    July:"Jul", August:"Aug", September:"Sep", October:"Oct", November:"Nov", December:"Dec",
  };
  const targetByMonth = useMemo(() => {
    // ── Determine which portal rep UUIDs to include in the goal sum ──────────
    // Priority: individual rep selection > territory filter > manager scope > company-wide.
    let repIdFilter: Set<string> | null = null; // null = company-wide

    if (hasRepSelection) {
      // Display name → DB name(s) → portal UUID
      const dbNames = new Set(repFilter.flatMap(n => REP_NAME_TO_DB_NAMES[n] ?? [n]));
      repIdFilter = new Set(dbReps.filter(r => dbNames.has(r.name)).map(r => r.id));
    } else if (territoryFilter.length > 0) {
      // visibleReps is already scoped to the selected territory
      const dbNames = new Set(visibleReps.flatMap(r => REP_NAME_TO_DB_NAMES[r.name] ?? [r.name]));
      repIdFilter = new Set(dbReps.filter(r => dbNames.has(r.name)).map(r => r.id));
    } else if (managerScopeRepIds !== undefined && managerScopeRepIds !== null) {
      // Manager scope: CompanyWidePage passes portal UUIDs directly — use them without
      // any name round-trip so no rep is silently dropped by a name-mapping gap.
      repIdFilter = new Set(managerScopeRepIds);
    } else if (managerScopeRepIds === undefined && allowedRepNames !== null) {
      // Fallback for direct KpiPage renders (no managerScopeRepIds prop): use the
      // hardcoded MANAGER_TO_REPS map to resolve display names → DB names → UUIDs.
      const dbNames = new Set(allowedRepNames.flatMap(n => REP_NAME_TO_DB_NAMES[n] ?? [n]));
      repIdFilter = new Set(dbReps.filter(r => dbNames.has(r.name)).map(r => r.id));
    }

    // Company-wide (repIdFilter === null): restrict to reps currently in sales_reps so
    // orphaned rep_targets rows (stale UUIDs from a prior rebuild) are excluded.
    const activeRepIds = new Set(dbReps.map(r => r.id));
    const scoped = targets2026.filter(t =>
      repIdFilter !== null ? repIdFilter.has(t.rep_id) : activeRepIds.has(t.rep_id),
    );

    const sums: Record<string, number> = {};
    for (const row of MONTHLY) {
      const key = MONTH_LABEL_TO_KEY[MONTH_FULL_TO_SHORT[row.m]] as keyof RepTarget;
      let total = 0;
      for (const t of scoped) total += Number(t[key]) || 0;
      sums[row.m] = total;
    }
    return { sums, scoped };
  }, [targets2026, dbReps, hasRepSelection, repFilter, territoryFilter, visibleReps, allowedRepNames, managerScopeRepIds]);

  const { sums: targetSums, scoped: targetScoped } = targetByMonth;

  const scaledMonthlyWithTargets = useMemo(() => scaledMonthly.map(r => {
    const tgt = targetSums[r.m] ?? 0;
    // Only override 26 Proj when real targets exist; keep seed values when none are set.
    return tgt > 0 ? { ...r, b26p: tgt, i26p: tgt } : r;
  }), [scaledMonthly, targetSums]);

  const MONTH_NAMES_ALL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonthName = MONTH_NAMES_ALL[reportingToday.getMonth()];
  const currentMonthEntry = useMemo(
    () => scaledMonthlyWithTargets.find((r) => r.m === currentMonthName) ?? null,
    [scaledMonthlyWithTargets, currentMonthName],
  );
  const mtdB = currentMonthEntry?.ytdB ?? 0;
  const mtdI = currentMonthEntry?.ytdI ?? 0;
  const mtdBookingVisible = isBookingVisible(reportingToday.getFullYear(), reportingToday.getMonth() + 1);

  // Full monthly target from rep_targets (not prorated — shows total month goal).
  const daysElapsed = reportingToday.getDate();
  const daysInMonth = new Date(reportingToday.getFullYear(), reportingToday.getMonth() + 1, 0).getDate();
  const mtdBGoal = currentMonthEntry?.b26p ?? 0;
  const mtdIGoal = currentMonthEntry?.i26p ?? 0;

  // ── Goal debug logging ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!targets2026.length && !targetScoped.length) return;
    const MONTH_FULL_TO_SHORT_LOCAL: Record<string, string> = {
      January:"Jan", February:"Feb", March:"Mar", April:"Apr", May:"May", June:"Jun",
      July:"Jul", August:"Aug", September:"Sep", October:"Oct", November:"Nov", December:"Dec",
    };
    const currentKey = MONTH_LABEL_TO_KEY[MONTH_FULL_TO_SHORT_LOCAL[currentMonthName]] as keyof RepTarget;
    const scope = hasRepSelection
      ? `rep: ${repFilter.join(", ")}`
      : managerScopeRepIds !== null && managerScopeRepIds !== undefined
        ? `manager (${managerScopeRepIds.length} reps)`
        : territoryFilter.length > 0
          ? `territory: ${territoryFilter.join(", ")}`
          : "company-wide";

    const repBreakdown = targetScoped.map(t => {
      const rep = dbReps.find(r => r.id === t.rep_id);
      return {
        rep_name:    rep?.name ?? `UNMATCHED (${t.rep_id})`,
        rep_id:      t.rep_id,
        month_goal:  Number(t[currentKey]) || 0,
        annual_goal: Number(t.annual_target) || 0,
      };
    });

    console.group(`[goals] LiveKPI — ${reportingYear} ${currentMonthName} — ${scope}`);
    console.log("year:", reportingYear, "| month:", currentMonthName, "| scope:", scope);
    console.log("rep filter:", repFilter.length ? repFilter : "(none)");
    console.log("territory filter:", territoryFilter.length ? territoryFilter : "(none)");
    console.log("manager scope rep IDs:", managerScopeRepIds ?? "null (company-wide)");
    console.log("targets2026 total rows:", targets2026.length, "| in-scope rows:", targetScoped.length);
    console.table(repBreakdown);
    console.log("summed booking goal:", `$${(targetSums[currentMonthName] ?? 0).toLocaleString()}`);
    console.log("summed invoice goal:", `$${(targetSums[currentMonthName] ?? 0).toLocaleString()} (same source)`);
    console.groupEnd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets2026, targetScoped, targetSums, currentMonthName, reportingYear, hasRepSelection, repFilter, managerScopeRepIds, territoryFilter, dbReps]);

  const dailyStats = useMemo(() => {
    const inv: Record<CollKey, number> = { SW: 0, FIN: 0, LUX: 0, HOSP: 0, MISC: 0, ALLOW: 0, Other: 0 };
    const bkg: Record<CollKey, number> = { SW: 0, FIN: 0, LUX: 0, HOSP: 0, MISC: 0, ALLOW: 0, Other: 0 };
    let totalInv = 0, totalBkg = 0;
    for (const row of rawDailyRows) {
      const coll = classifyCollection(row.brand_category);
      const amt = Number(row.amount) || 0;
      // Invoices: use the prior-day date. Bookings: use the selected date (today).
      if (row.metric_type === "invoiced" && row.transaction_date === invoiceDateStr) {
        inv[coll] += amt; totalInv += amt;
      } else if (row.metric_type === "bookings" && row.transaction_date === dailyDateStr) {
        bkg[coll] += amt; totalBkg += amt;
      }
    }
    return { inv, bkg, totalInv, totalBkg };
  }, [rawDailyRows, dailyDateStr, invoiceDateStr]);

  const scaledLine = useMemo(() => baseLine.map((r) => ({
    ...r,
    luxP: r.luxP * repShare, luxA: r.luxA * repShare,
    swP: r.swP * repShare,   swA: r.swA * repShare,
    flP: r.flP * repShare,   flA: r.flA * repShare,
  })), [repShare, baseLine]);

  const applyBrandFilter = (rows: typeof scaledMonthly) => {
    if (monthlyLineFilter.length === 0) return rows;
    return rows.map((r) => {
      const lineRow = scaledLine.find((l) => l.m === r.m);
      if (!lineRow) return r;
      const totalP = lineRow.luxP + lineRow.swP + lineRow.flP;
      const lineP =
        (monthlyLineFilter.includes("lux") ? lineRow.luxP : 0) +
        (monthlyLineFilter.includes("sw") ? lineRow.swP : 0) +
        (monthlyLineFilter.includes("fl") ? lineRow.flP : 0);
      const share = totalP > 0 ? lineP / totalP : 0;
      return {
        ...r,
        b25: r.b25 * share,
        b26p: lineP,
        // Scale the live 26 Act bookings by the brand share so the filter narrows the
        // live open_sales_orders total instead of falling back to the static seed.
        ytdB: r.ytdB * share,
        i25: r.i25 * share,
        i26p: r.i26p * share,
        ytdI: r.ytdI * share,
      };
    });
  };

  const chartMonthly = useMemo(() => applyBrandFilter(scaledMonthlyWithTargets), [scaledMonthlyWithTargets, monthlyLineFilter, scaledLine]);
  const monthly = useMemo(() => {
    return monthFilter === "All" ? chartMonthly : chartMonthly.filter((r) => r.m === monthFilter);
  }, [monthFilter, chartMonthly]);

  const sum = (arr: typeof MONTHLY, k: keyof typeof MONTHLY[number]) =>
    arr.reduce((s, r) => s + (r[k] as number), 0);

  const sumB25 = sum(monthly, "b25");
  const sumYtdB = sum(monthly, "ytdB");
  const sumI25 = sum(monthly, "i25");
  const sumI26P = sum(monthly, "i26p");
  const sumYtdI = sum(monthly, "ytdI");
  const sumYtdICont = monthly.reduce((s, r: any) => s + (r.ytdIContainer ?? 0), 0);
  const sumYtdIWh = monthly.reduce((s, r: any) => s + (r.ytdIWarehouse ?? 0), 0);
  const sumYtdBCont = monthly.reduce((s, r: any) => s + (r.ytdBContainer ?? 0), 0);
  const sumYtdBWh = monthly.reduce((s, r: any) => s + (r.ytdBWarehouse ?? 0), 0);

  // For bookings, only count goals for months where bookings are actually visible
  // (Aug 2026+). The TOTAL row would otherwise show $15.8M goal vs $856K actuals
  // because Jan–Jul goal values exist in rep_targets even though their rows show "—".
  const sumB26P = monthly
    .filter((r) => {
      const idx = MONTH_NAMES_ALL.indexOf(r.m);
      return idx >= 0 && isBookingVisible(reportingYear, idx + 1);
    })
    .reduce((s, r) => s + r.b26p, 0);


  const showB = metricFilter !== "invoiced";
  const showI = metricFilter !== "bookings";


  return (
    <div className="space-y-6">
      {/* ── MTD Summary KPI Row ──────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="glass-card p-5 grid grid-cols-3 divide-x divide-border">
          <div className="flex flex-col gap-1 pr-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">MTD Bookings</p>
            <p className="text-xl font-serif tabular-nums">{mtdBookingVisible ? formatCurrency(mtdB) : "—"}</p>
            <p className="text-[10px] text-muted-foreground">{currentMonthName} {reportingYear}</p>
          </div>
          <div className="flex flex-col gap-1 px-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Booking Goal</p>
            <p className="text-xl font-serif tabular-nums">{mtdBGoal > 0 ? formatCurrency(mtdBGoal) : "—"}</p>
            <p className="text-[10px] text-muted-foreground">Day {daysElapsed} of {daysInMonth} · 2026</p>
          </div>
          <div className="flex flex-col gap-1 pl-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">% Booking Goal</p>
            <p className="text-xl font-serif tabular-nums">{mtdBookingVisible ? fmtPct(mtdB / mtdBGoal) : "—"}</p>
            <p className="text-[10px] text-muted-foreground">MTD vs Goal</p>
          </div>
        </div>
        <div className="glass-card p-5 grid grid-cols-3 divide-x divide-border">
          <div className="flex flex-col gap-1 pr-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">MTD Invoicing</p>
            <p className="text-xl font-serif tabular-nums">{formatCurrency(mtdI)}</p>
            <p className="text-[10px] text-muted-foreground">{currentMonthName} {reportingYear}</p>
          </div>
          <div className="flex flex-col gap-1 px-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Invoice Goal</p>
            <p className="text-xl font-serif tabular-nums">{mtdIGoal > 0 ? formatCurrency(mtdIGoal) : "—"}</p>
            <p className="text-[10px] text-muted-foreground">Day {daysElapsed} of {daysInMonth} · 2026</p>
          </div>
          <div className="flex flex-col gap-1 pl-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">% Invoice Goal</p>
            <p className="text-xl font-serif tabular-nums">{fmtPct(mtdI / mtdIGoal)}</p>
            <p className="text-[10px] text-muted-foreground">MTD vs Goal</p>
          </div>
        </div>
      </div>

      {/* ── Daily Performance ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Daily Performance</span>
          <Popover open={dailyDatePickerOpen} onOpenChange={setDailyDatePickerOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {isToday ? "Today" : format(dailyDate, "MMM d, yyyy")}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={dailyDate}
                onSelect={(d) => { if (d) { setDailyDate(d); setDailyDatePickerOpen(false); } }}
                disabled={(d) => d > reportingToday}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Bookings card */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Daily Bookings</h3>
            <p className="text-2xl font-serif mb-3">{formatCurrency(dailyStats.totalBkg)}</p>
            <div className="space-y-1.5 text-xs">
              {(["SW", "FIN", "LUX", "HOSP"] as CollKey[]).map((coll) => (
                <div key={coll} className="flex justify-between">
                  <span className="text-muted-foreground">{COLL_LABEL[coll]}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(dailyStats.bkg[coll])}</span>
                </div>
              ))}
              {dailyStats.bkg.MISC > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MISC</span>
                  <span className="font-medium tabular-nums">{formatCurrency(dailyStats.bkg.MISC)}</span>
                </div>
              )}
              {dailyStats.bkg.Other > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Other</span>
                  <span className="font-medium tabular-nums">{formatCurrency(dailyStats.bkg.Other)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t text-muted-foreground">
                <span>% Warehouse</span><span>—</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>% Container</span><span>—</span>
              </div>
            </div>
          </div>
          {/* Invoice card — always shows prior day; Acctivate sync runs overnight */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-1">Daily Invoices</h3>
            <p className="text-xs text-muted-foreground mb-3">
              {isToday ? `Yesterday · ${format(invoiceDate, "MMM d")}` : format(invoiceDate, "MMM d, yyyy")}
            </p>
            <p className="text-2xl font-serif mb-3">{formatCurrency(dailyStats.totalInv)}</p>
            <div className="space-y-1.5 text-xs">
              {(["SW", "FIN", "LUX", "ALLOW"] as CollKey[]).map((coll) => (
                <div key={coll} className="flex justify-between">
                  <span className="text-muted-foreground">{COLL_LABEL[coll]}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(dailyStats.inv[coll])}</span>
                </div>
              ))}
              {dailyStats.inv.HOSP > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HOSP</span>
                  <span className="font-medium tabular-nums">{formatCurrency(dailyStats.inv.HOSP)}</span>
                </div>
              )}
              {dailyStats.inv.Other > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Other</span>
                  <span className="font-medium tabular-nums">{formatCurrency(dailyStats.inv.Other)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t text-muted-foreground">
                <span>% Warehouse</span><span>—</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>% Container</span><span>—</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Global filter + header strip */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Filter Report By Rep</span>
          <Popover open={repPickerOpen} onOpenChange={(o) => !lockedRepName && setRepPickerOpen(o)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!!lockedRepName}
                className="h-9 px-3 rounded-md border bg-background text-sm font-medium min-w-[220px] disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-between gap-2"
              >
                <span className={cn(repFilter.length === 0 && "text-muted-foreground")}>
                  {repFilter.length === 0
                    ? (allowedRepNames === null ? "All Reps (Combined)" : `All ${managerName}'s Reps (Combined)`)
                    : repFilter.length === 1
                      ? repFilter[0]
                      : `${repFilter.length} reps selected`}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[260px] p-0 overflow-hidden">
              <div className="max-h-72 overflow-y-auto py-1">
                {[...visibleReps].sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
                  const checked = repFilter.includes(r.name);
                  return (
                    <button
                      type="button"
                      key={r.name}
                      onClick={() =>
                        setRepFilter((prev) =>
                          prev.includes(r.name) ? prev.filter((n) => n !== r.name) : [...prev, r.name],
                        )
                      }
                      className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent text-left"
                    >
                      <span>{r.name}</span>
                      <Check className={cn("h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                    </button>
                  );
                })}
              </div>
              {repFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRepFilter([])}
                  className="w-full px-3 py-2 text-xs text-primary hover:bg-accent text-left border-t"
                >
                  Clear selection
                </button>
              )}
            </PopoverContent>
          </Popover>
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-2">Territory</span>
          <Popover open={territoryPickerOpen} onOpenChange={setTerritoryPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-9 px-3 rounded-md border bg-background text-sm font-medium min-w-[180px] inline-flex items-center justify-between gap-2"
              >
                <span className={cn(territoryFilter.length === 0 && "text-muted-foreground")}>
                  {territoryFilter.length === 0
                    ? "All Territories"
                    : territoryFilter.length === 1
                      ? territoryFilter[0]
                      : `${territoryFilter.length} territories`}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[240px] p-0 overflow-hidden">
              <div className="max-h-72 overflow-y-auto py-1">
                {availableTerritories.map((t) => {
                  const checked = territoryFilter.includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() =>
                        setTerritoryFilter((prev) =>
                          prev.includes(t) ? prev.filter((n) => n !== t) : [...prev, t],
                        )
                      }
                      className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent text-left"
                    >
                      <span>{t}</span>
                      <Check className={cn("h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                    </button>
                  );
                })}
              </div>
              {territoryFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTerritoryFilter([])}
                  className="w-full px-3 py-2 text-xs text-primary hover:bg-accent text-left border-t"
                >
                  Clear selection
                </button>
              )}
            </PopoverContent>
          </Popover>
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-2">Brand</span>
          <Popover open={brandPickerOpen} onOpenChange={setBrandPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-9 px-3 rounded-md border bg-background text-sm font-medium min-w-[180px] inline-flex items-center justify-between gap-2"
              >
                <span className={cn(monthlyLineFilter.length === 0 && "text-muted-foreground")}>
                  {monthlyLineFilter.length === 0
                    ? "All Brands"
                    : monthlyLineFilter.length === 1
                      ? ({ sw: "Sea Winds", fl: "Finn & Louise", lux: "Lux Lighting" } as const)[monthlyLineFilter[0]]
                      : `${monthlyLineFilter.length} brands`}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[200px] p-0 overflow-hidden">
              <div className="py-1">
                {([
                  { v: "sw", label: "Sea Winds" },
                  { v: "fl", label: "Finn & Louise" },
                  { v: "lux", label: "Lux Lighting" },
                ] as const).map(({ v, label }) => {
                  const checked = monthlyLineFilter.includes(v);
                  return (
                    <button
                      type="button"
                      key={v}
                      onClick={() =>
                        setMonthlyLineFilter((prev) =>
                          prev.includes(v) ? prev.filter((n) => n !== v) : [...prev, v],
                        )
                      }
                      className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent text-left"
                    >
                      <span>{label}</span>
                      <Check className={cn("h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                    </button>
                  );
                })}
              </div>
              {monthlyLineFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMonthlyLineFilter([])}
                  className="w-full px-3 py-2 text-xs text-primary hover:bg-accent text-left border-t"
                >
                  Clear selection
                </button>
              )}
            </PopoverContent>
          </Popover>
          {!lockedRepName && allowedRepNames !== null && visibleReps.length === 0 && (
            <span className="text-xs text-muted-foreground">No reps mapped for this manager yet.</span>
          )}
          {hasRepSelection && (
            <div className="flex flex-wrap items-center gap-1.5">
              {repFilter.map((name) => (
                <Badge key={name} variant="secondary" className="gap-1 pr-1">
                  {name}
                  {!lockedRepName && (
                    <button
                      type="button"
                      onClick={() => setRepFilter((prev) => prev.filter((n) => n !== name))}
                      className="hover:bg-muted-foreground/20 rounded-sm"
                      aria-label={`Remove ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {!lockedRepName && (
                <button
                  onClick={() => setRepFilter([])}
                  className="ml-1 text-xs text-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Today's Date</p>
            <p className="font-semibold">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(new Date())}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">End Date</p>
            <p className="font-semibold">{reportingEndOfYear.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Days Remaining</p>
            <p className="font-semibold">{reportingDaysRemaining}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Reporting Year</p>
            <p className="font-semibold">2026</p>
          </div>
        </div>
      </div>

      {/* Actual vs Goal chart - mirrors the Monthly Results table below */}
      <div className="glass-card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold">
              {showB && showI ? "Bookings & Invoiced - Actual vs Goal"
                : showI ? "Invoiced - Actual vs Goal"
                : "Bookings - Actual vs Goal"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Monthly 2026 projection (goal) vs MTD actual
              {hasRepSelection
                ? <> · <span className="font-medium text-foreground">{repFilter.length === 1 ? repFilter[0] : `${repFilter.length} reps`}</span></>
                : <> · all reps</>}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap justify-end">
            {showB && <>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-primary/70" />Bookings Goal</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-accent" />Bookings MTD</span>
            </>}
            {showI && <>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-primary/40" />Invoiced Goal</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-accent/60" />Invoiced MTD</span>
            </>}
          </div>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} barCategoryGap="20%">
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
              {showB && <Bar dataKey="b26p" name="Bookings Goal" fill="hsl(var(--primary) / 0.7)" radius={[3, 3, 0, 0]} />}
              {showB && <Bar dataKey="ytdB" name="Bookings MTD" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />}
              {showI && <Bar dataKey="i26p" name="Invoiced Goal" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />}
              {showI && <Bar dataKey="ytdI" name="Invoiced MTD" fill="hsl(var(--accent) / 0.6)" radius={[3, 3, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>


      {/* Monthly Results */}
      <div className="glass-card p-5">
        <h3 className="text-base font-semibold mb-1">Monthly Results</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Bookings & Invoiced - 2025 actual vs 2026 projection vs YTD
          {hasRepSelection
            ? <span className="ml-1">· live data from <span className="font-medium text-foreground">{repFilter.length === 1 ? `${repFilter[0]} tab` : `${repFilter.length} reps`}</span></span>
            : <> · all reps</>}
        </p>



        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th rowSpan={2} className="text-left p-2 font-medium text-muted-foreground align-bottom">Month</th>
                {showB && <th colSpan={SHOW_PRIOR_YEAR_ACTUALS ? 6 : 5} className="text-center p-2 font-semibold border-l bg-muted/30">Bookings</th>}
                {showI && <th colSpan={SHOW_PRIOR_YEAR_ACTUALS ? 6 : 5} className="text-center p-2 font-semibold border-l bg-muted/30">Invoiced</th>}
              </tr>
              <tr className="border-b text-muted-foreground">
                {showB && <>
                  <th className="text-right p-2 font-medium border-l">26 Act</th>
                  <th className="text-right p-2 font-medium">26 Proj</th>
                  <th className="text-right p-2 font-medium">% Goal</th>
                  {SHOW_PRIOR_YEAR_ACTUALS && <th className="text-right p-2 font-medium">25 Act</th>}
                  <th className="text-right p-2 font-medium">% Container</th>
                  <th className="text-right p-2 font-medium">% Warehouse</th>
                </>}
                {showI && <>
                  <th className="text-right p-2 font-medium border-l">26 Act</th>
                  <th className="text-right p-2 font-medium">26 Proj</th>
                  <th className="text-right p-2 font-medium">% Goal</th>
                  {SHOW_PRIOR_YEAR_ACTUALS && <th className="text-right p-2 font-medium">25 Act</th>}
                  <th className="text-right p-2 font-medium">% Container</th>
                  <th className="text-right p-2 font-medium">% Warehouse</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {monthly.map((r) => {
                const idx = MONTHLY.findIndex((m) => m.m === r.m);
                const rAny = r as typeof r & {
                  ytdIContainer?: number; ytdIWarehouse?: number;
                  ytdIContainerPct?: number | null; ytdIWarehousePct?: number | null;
                  i25Container?: number; i25Warehouse?: number;
                  ytdBContainer?: number; ytdBWarehouse?: number;
                  b25Container?: number; b25Warehouse?: number;
                };
                const ytdBCont = rAny.ytdBContainer ?? 0;
                const ytdBWh  = rAny.ytdBWarehouse  ?? 0;
                const ytdICont = rAny.ytdIContainer ?? 0;
                const ytdIWh   = rAny.ytdIWarehouse  ?? 0;
                // Booking actuals are only visible from Aug 2026 onwards.
                const bkVisible = isBookingVisible(2026, idx + 1);
                return (
                  <tr key={r.m} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-2 font-medium">{idx + 1}. {r.m}</td>
                    {showB && <>
                      <td className="p-2 text-right border-l font-medium">
                        {bkVisible ? formatCurrency(r.ytdB) : "—"}
                      </td>
                      <td className="p-2 text-right">{bkVisible ? formatCurrency(r.b26p) : "—"}</td>
                      <td className="p-2 text-right">
                        {bkVisible ? fmtPct(r.ytdB / r.b26p) : "—"}
                      </td>
                      {SHOW_PRIOR_YEAR_ACTUALS && <td className="p-2 text-right">{formatCurrency(r.b25)}</td>}
                      <td className="p-2 text-right">
                        {bkVisible ? (ytdBCont + ytdBWh === 0 ? "-" : fmtPctRaw(ytdBCont / Math.max(r.ytdB, 1))) : "—"}
                      </td>
                      <td className="p-2 text-right">
                        {bkVisible ? (ytdBCont + ytdBWh === 0 ? "-" : fmtPctRaw(ytdBWh  / Math.max(r.ytdB, 1))) : "—"}
                      </td>
                    </>}
                    {showI && <>
                      <td className="p-2 text-right border-l font-medium">{formatCurrency(r.ytdI)}</td>
                      <td className="p-2 text-right">{formatCurrency(r.i26p)}</td>
                      <td className="p-2 text-right">{fmtPct(r.ytdI / r.i26p)}</td>
                      {SHOW_PRIOR_YEAR_ACTUALS && <td className="p-2 text-right">{formatCurrency(r.i25)}</td>}
                      <td className="p-2 text-right">{ytdICont + ytdIWh === 0 ? "-" : fmtPctRaw(ytdICont / Math.max(r.ytdI, 1))}</td>
                      <td className="p-2 text-right">{ytdICont + ytdIWh === 0 ? "-" : fmtPctRaw(ytdIWh   / Math.max(r.ytdI, 1))}</td>
                    </>}
                  </tr>
                );
              })}
              <tr className="border-t-2 font-semibold bg-muted/20">
                <td className="p-2">TOTAL</td>
                {showB && <>
                  <td className="p-2 text-right border-l">{formatCurrency(sumYtdB)}</td>
                  <td className="p-2 text-right">{formatCurrency(sumB26P)}</td>
                  <td className="p-2 text-right">{fmtPct(sumYtdB / sumB26P)}</td>
                  {SHOW_PRIOR_YEAR_ACTUALS && <td className="p-2 text-right">{formatCurrency(sumB25)}</td>}
                  <td className="p-2 text-right">{sumYtdBCont + sumYtdBWh === 0 ? "-" : fmtPctRaw(sumYtdBCont / Math.max(sumYtdB, 1))}</td>
                  <td className="p-2 text-right">{sumYtdBCont + sumYtdBWh === 0 ? "-" : fmtPctRaw(sumYtdBWh  / Math.max(sumYtdB, 1))}</td>
                </>}
                {showI && <>
                  <td className="p-2 text-right border-l">{formatCurrency(sumYtdI)}</td>
                  <td className="p-2 text-right">{formatCurrency(sumI26P)}</td>
                  <td className="p-2 text-right">{fmtPct(sumYtdI / sumI26P)}</td>
                  {SHOW_PRIOR_YEAR_ACTUALS && <td className="p-2 text-right">{formatCurrency(sumI25)}</td>}
                  <td className="p-2 text-right">{sumYtdICont + sumYtdIWh === 0 ? "-" : fmtPctRaw(sumYtdICont / Math.max(sumYtdI, 1))}</td>
                  <td className="p-2 text-right">{sumYtdICont + sumYtdIWh === 0 ? "-" : fmtPctRaw(sumYtdIWh  / Math.max(sumYtdI, 1))}</td>
                </>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

