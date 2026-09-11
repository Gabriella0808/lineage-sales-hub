import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  startOfWeek, endOfWeek, subWeeks, format, isWithinInterval, startOfDay, endOfDay,
} from "date-fns";
import {
  Building2, UserPlus, UserCheck, CheckCircle2, Trash2, Ban, Clock3, Users2, UserX,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  useProspectReportingOverview, useProspectEvents,
  type ProspectReportingRow, type ContactHealth,
} from "@/hooks/useProspectReporting";
import { useCrmManagers, useCrmReps } from "@/hooks/useCrm";
import { Loader2, Download } from "lucide-react";

// crm_account_events only exists from this date onward — see the note
// rendered in the page. Weekly assigned/converted/deleted/unworkable
// counts for any period before this date will correctly read 0; there is
// no history to recover. "Added this week" is unaffected — it reads
// directly from crm_accounts.created_at, which always existed.
const EVENT_LOG_LIVE_SINCE = new Date("2026-09-11T00:00:00");

type TabKey = "overview" | "manager" | "activity" | "health";

const CONTACT_HEALTH_CONFIG: Record<ContactHealth, { label: string; badge: string }> = {
  healthy:    { label: "Healthy",         badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  watch:      { label: "Watch",           badge: "bg-amber-50 text-amber-700 border-amber-200" },
  at_risk:    { label: "At Risk",         badge: "bg-orange-50 text-orange-700 border-orange-200" },
  neglected:  { label: "Neglected",       badge: "bg-rose-50 text-rose-700 border-rose-200" },
  no_contact: { label: "No Contact Found", badge: "bg-muted text-muted-foreground border-border" },
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  follow_up: "Needs Follow-up",
  closed: "Closed",
  unworkable: "Unworkable",
};

function statusLabel(s: string | null | undefined) {
  if (!s) return "-";
  return STATUS_LABELS[s] ?? s;
}

function outcomeFor(row: ProspectReportingRow): string {
  if (row.account_type === "dealer") return "Converted to Dealer";
  if (row.status === "unworkable") return "Unworkable";
  if (row.status === "follow_up") return "Follow-up Required";
  if (row.status === "closed") return "Closed";
  return "Active";
}

function fmtDate(s?: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "MMM d, yyyy");
}

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProspectReportingPage() {
  const nav = useNavigate();
  const { data: rows = [], isLoading: loadingRows } = useProspectReportingOverview();
  const { data: events = [], isLoading: loadingEvents } = useProspectEvents();
  const { data: managers = [] } = useCrmManagers();
  const { data: reps = [] } = useCrmReps();

  const loading = loadingRows || loadingEvents;

  // ── Filters ──────────────────────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, 1 = last week, ...
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  // Drill-down: clicking a KPI/manager row/chart segment jumps to the
  // Prospect Activity tab pre-filtered to that slice.
  const [drillFilter, setDrillFilter] = useState<{ label: string; test: (r: ProspectReportingRow) => boolean } | null>(null);

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfDay(startOfWeek(subWeeks(now, weekOffset), { weekStartsOn: 1 })), [now, weekOffset]);
  const weekEnd = useMemo(() => endOfDay(endOfWeek(subWeeks(now, weekOffset), { weekStartsOn: 1 })), [now, weekOffset]);
  const inWeek = (s: string | null) => !!s && isWithinInterval(new Date(s), { start: weekStart, end: weekEnd });

  const repMap = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps]);
  const managerMap = useMemo(() => new Map(managers.map((m) => [m.id, m.name])), [managers]);

  // Manager/rep/status/search apply everywhere; the week selector applies
  // only to the "this week" activity metrics (KPIs + Manager Breakdown) —
  // Prospect Activity and Contact Health are always a live, current-state
  // view, since staleness/health is inherently about "right now."
  const scopedRows = useMemo(() => {
    return rows.filter((r) => {
      if (managerFilter !== "all" && r.assigned_manager_id !== managerFilter) return false;
      if (repFilter !== "all" && r.assigned_rep_id !== repFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search.trim() && !r.company_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, managerFilter, repFilter, statusFilter, search]);

  const scopedEvents = useMemo(() => {
    return events.filter((e) => {
      if (managerFilter !== "all" && e.manager_id !== managerFilter) return false;
      if (repFilter !== "all" && e.rep_id !== repFilter) return false;
      return true;
    });
  }, [events, managerFilter, repFilter]);

  // ── Weekly cohorts ──────────────────────────────────────────────────────
  const addedThisWeek   = useMemo(() => scopedRows.filter((r) => inWeek(r.created_at)), [scopedRows, weekStart, weekEnd]);
  const assignedEvents  = useMemo(() => scopedEvents.filter((e) => e.event_type === "assigned" && inWeek(e.occurred_at)), [scopedEvents, weekStart, weekEnd]);
  const convertedEvents = useMemo(() => scopedEvents.filter((e) => e.event_type === "converted" && inWeek(e.occurred_at)), [scopedEvents, weekStart, weekEnd]);
  const deletedEvents   = useMemo(() => scopedEvents.filter((e) => e.event_type === "deleted" && inWeek(e.occurred_at)), [scopedEvents, weekStart, weekEnd]);
  const unworkableEvents = useMemo(
    () => scopedEvents.filter((e) => e.event_type === "status_changed" && e.to_value === "unworkable" && inWeek(e.occurred_at)),
    [scopedEvents, weekStart, weekEnd],
  );

  const isActiveProspect = (r: ProspectReportingRow) => r.account_type === "prospect" && r.status !== "closed" && r.status !== "unworkable";
  const noContact30 = (r: ProspectReportingRow) => r.contact_health !== "healthy";
  const noContact60 = (r: ProspectReportingRow) => r.contact_health === "at_risk" || r.contact_health === "neglected" || r.contact_health === "no_contact";

  // ── Dashboard KPIs ──────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    totalActive: scopedRows.filter(isActiveProspect).length,
    addedThisWeek: addedThisWeek.filter((r) => r.account_type === "prospect").length,
    assignedThisWeek: assignedEvents.length,
    convertedThisWeek: convertedEvents.length,
    deletedThisWeek: deletedEvents.length,
    unworkableThisWeek: unworkableEvents.length,
    noContact30: scopedRows.filter((r) => r.account_type === "prospect" && noContact30(r)).length,
    noContact60Combined: scopedRows.filter(noContact60).length,
    unassigned: scopedRows.filter((r) => r.account_type === "prospect" && r.is_unassigned).length,
  }), [scopedRows, addedThisWeek, assignedEvents, convertedEvents, deletedEvents, unworkableEvents]);

  // ── Manager breakdown ───────────────────────────────────────────────────
  const managerBreakdown = useMemo(() => {
    const ids = managerFilter === "all" ? managers.map((m) => m.id) : [managerFilter];
    return ids.map((id) => {
      const name = managerMap.get(id) ?? "Unknown";
      const mine = scopedRows.filter((r) => r.assigned_manager_id === id);
      const mineProspects = mine.filter((r) => r.account_type === "prospect");
      const lastActivity = scopedEvents
        .filter((e) => e.manager_id === id)
        .reduce<string | null>((max, e) => (!max || e.occurred_at > max ? e.occurred_at : max), null);
      return {
        id, name,
        assignedProspects: mineProspects.length,
        assignedThisWeek: assignedEvents.filter((e) => e.manager_id === id).length,
        addedThisWeek: addedThisWeek.filter((r) => r.assigned_manager_id === id && r.account_type === "prospect").length,
        convertedThisWeek: convertedEvents.filter((e) => e.manager_id === id).length,
        deletedThisWeek: deletedEvents.filter((e) => e.manager_id === id).length,
        unworkableThisWeek: unworkableEvents.filter((e) => e.manager_id === id).length,
        activeOpen: mineProspects.filter(isActiveProspect).length,
        needsFollowUp: mineProspects.filter((r) => r.status === "follow_up").length,
        noRecentContact: mineProspects.filter(noContact30).length,
        lastActivity,
      };
    }).sort((a, b) => b.assignedProspects - a.assignedProspects);
  }, [managers, managerMap, managerFilter, scopedRows, scopedEvents, assignedEvents, addedThisWeek, convertedEvents, deletedEvents, unworkableEvents]);

  // ── Prospect Activity (current snapshot, not week-scoped) ──────────────
  const activityRows = useMemo(() => {
    let base = scopedRows;
    if (drillFilter) base = base.filter(drillFilter.test);
    return base
      .map((r) => ({
        ...r,
        managerName: r.assigned_manager_id ? managerMap.get(r.assigned_manager_id) ?? "Unknown" : "Unassigned",
        repName: r.assigned_rep_id ? repMap.get(r.assigned_rep_id) ?? "Unknown" : "Unassigned",
        outcome: outcomeFor(r),
      }))
      .sort((a, b) => (b.days_since_contact ?? 99999) - (a.days_since_contact ?? 99999));
  }, [scopedRows, drillFilter, managerMap, repMap]);

  // ── Contact Health (converted dealers only) ─────────────────────────────
  const contactHealthRows = useMemo(() => {
    let base = scopedRows.filter((r) => r.account_type === "dealer");
    if (drillFilter) base = base.filter(drillFilter.test);
    return base
      .map((r) => ({
        ...r,
        managerName: r.assigned_manager_id ? managerMap.get(r.assigned_manager_id) ?? "Unknown" : "Unassigned",
        repName: r.assigned_rep_id ? repMap.get(r.assigned_rep_id) ?? "Unknown" : "Unassigned",
      }))
      .sort((a, b) => (b.days_since_contact ?? 99999) - (a.days_since_contact ?? 99999));
  }, [scopedRows, drillFilter, managerMap, repMap]);

  // ── Charts ───────────────────────────────────────────────────────────────
  const byManagerChart = useMemo(() => managerBreakdown.map((m) => ({ name: m.name, prospects: m.assignedProspects })), [managerBreakdown]);
  const byStatusChart = useMemo(() => {
    const statuses = ["active", "follow_up", "closed", "unworkable"];
    return statuses.map((s) => ({ name: statusLabel(s), count: scopedRows.filter((r) => r.account_type === "prospect" && r.status === s).length }));
  }, [scopedRows]);
  const weeklyMovementChart = useMemo(() => ([
    { name: "Added", count: kpis.addedThisWeek },
    { name: "Converted", count: kpis.convertedThisWeek },
    { name: "Deleted", count: kpis.deletedThisWeek },
  ]), [kpis]);
  const staleByManagerChart = useMemo(
    () => managerBreakdown.map((m) => ({ name: m.name, stale: m.noRecentContact })),
    [managerBreakdown],
  );
  const agingBucketsChart = useMemo(() => {
    const buckets: Record<string, number> = { "0-30 days": 0, "31-60 days": 0, "61-90 days": 0, "90+ days": 0, "No Contact Found": 0 };
    for (const r of scopedRows) {
      if (r.contact_health === "healthy") buckets["0-30 days"]++;
      else if (r.contact_health === "watch") buckets["31-60 days"]++;
      else if (r.contact_health === "at_risk") buckets["61-90 days"]++;
      else if (r.contact_health === "neglected") buckets["90+ days"]++;
      else buckets["No Contact Found"]++;
    }
    return Object.entries(buckets).map(([name, count]) => ({ name, count }));
  }, [scopedRows]);

  const chartConfig = { count: { label: "Count", color: "hsl(var(--chart-1))" }, prospects: { label: "Prospects", color: "hsl(var(--chart-2))" }, stale: { label: "Stale", color: "hsl(var(--chart-4))" } };

  const goToActivity = (label: string, test: (r: ProspectReportingRow) => boolean) => {
    setDrillFilter({ label, test });
    setActiveTab("activity");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="space-y-2">
        <Badge variant="outline" className="font-medium uppercase tracking-wide text-[10px]">Prospect Reporting</Badge>
        <h1 className="font-display text-4xl tracking-tight text-foreground">Prospect Reporting</h1>
        <p className="text-muted-foreground text-base">
          Weekly manager activity, prospect activity, and dealer contact health — sourced entirely from the
          Prospects module (crm_accounts). No Acctivate, sales, booking, invoice, or Open SO data.
        </p>
      </header>

      {/* Filters */}
      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Week</span>
            <Select value={String(weekOffset)} onValueChange={(v) => setWeekOffset(Number(v))}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">This week</SelectItem>
                <SelectItem value="1">Last week</SelectItem>
                <SelectItem value="2">2 weeks ago</SelectItem>
                <SelectItem value="3">3 weeks ago</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[10px] text-muted-foreground">{format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Manager</span>
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Managers</SelectItem>
                {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rep / Owner</span>
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reps</SelectItem>
                {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="follow_up">Needs Follow-up</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="unworkable">Unworkable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Search</span>
            <Input placeholder="Prospect or company name…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
          </div>
          {(managerFilter !== "all" || repFilter !== "all" || statusFilter !== "all" || search || drillFilter) && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground"
              onClick={() => { setManagerFilter("all"); setRepFilter("all"); setStatusFilter("all"); setSearch(""); setDrillFilter(null); }}>
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Building2 className="h-4 w-4" />} label="Total Active Prospects" value={kpis.totalActive} accent="primary"
          onClick={() => goToActivity("Total Active Prospects", isActiveProspect)} />
        <KpiCard icon={<UserPlus className="h-4 w-4" />} label="Added This Week" value={kpis.addedThisWeek} accent="accent"
          onClick={() => goToActivity("Added This Week", (r) => inWeek(r.created_at) && r.account_type === "prospect")} />
        <KpiCard icon={<Users2 className="h-4 w-4" />} label="Assigned This Week" value={kpis.assignedThisWeek} accent="muted" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Converted This Week" value={kpis.convertedThisWeek} accent="success" />
        <KpiCard icon={<Trash2 className="h-4 w-4" />} label="Deleted This Week" value={kpis.deletedThisWeek} accent="muted" />
        <KpiCard icon={<Ban className="h-4 w-4" />} label="Marked Unworkable" value={kpis.unworkableThisWeek} accent="muted" />
        <KpiCard icon={<Clock3 className="h-4 w-4" />} label="No Contact 30+ Days" value={kpis.noContact30} accent="accent"
          onClick={() => goToActivity("No Contact 30+ Days", (r) => r.account_type === "prospect" && noContact30(r))} />
        <KpiCard icon={<UserCheck className="h-4 w-4" />} label="No Contact 60+ Days (Prospects + Dealers)" value={kpis.noContact60Combined} accent="accent"
          onClick={() => goToActivity("No Contact 60+ Days", noContact60)} />
        <KpiCard icon={<UserX className="h-4 w-4" />} label="Unassigned Prospects" value={kpis.unassigned} accent="muted"
          onClick={() => goToActivity("Unassigned Prospects", (r) => r.account_type === "prospect" && r.is_unassigned)} />
      </section>

      {weekStart < EVENT_LOG_LIVE_SINCE && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Assigned / Converted / Deleted / Marked Unworkable counts only became trackable starting{" "}
          {format(EVENT_LOG_LIVE_SINCE, "MMM d, yyyy")} — the selected week is partly or fully before that date, so
          those figures may read 0 even if activity occurred. "Added This Week" is unaffected (it always reads
          directly from the prospect's created date).
        </p>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="manager">Manager Breakdown</TabsTrigger>
          <TabsTrigger value="activity">Prospect Activity</TabsTrigger>
          <TabsTrigger value="health">Contact Health</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="Prospects by Manager" description="Currently assigned open prospects per manager." data={byManagerChart} dataKey="prospects" config={chartConfig}
              onBarClick={(name) => { const m = managerBreakdown.find((x) => x.name === name); if (m) goToActivity(`Manager: ${name}`, (r) => r.assigned_manager_id === m.id); }} />
            <ChartCard title="Prospects by Status" description="Open prospects grouped by current status." data={byStatusChart} dataKey="count" config={chartConfig} />
            <ChartCard title="Added vs Converted vs Deleted (This Week)" description="Weekly movement for the selected week." data={weeklyMovementChart} dataKey="count" config={chartConfig} />
            <ChartCard title="Stale Prospects by Manager" description="Prospects with no contact in 30+ days, per manager." data={staleByManagerChart} dataKey="stale" config={chartConfig} />
          </div>
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="font-display text-xl">No Contact Aging Buckets</CardTitle>
              <CardDescription>All prospects and converted dealers, bucketed by days since last contact.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={agingBucketsChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manager Breakdown */}
        <TabsContent value="manager" className="mt-4">
          <Card className="border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium">Manager</th>
                    <th className="text-right px-3 py-2.5 font-medium">Assigned Prospects</th>
                    <th className="text-right px-3 py-2.5 font-medium">Assigned (wk)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Added (wk)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Converted (wk)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Deleted (wk)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Unworkable (wk)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Active/Open</th>
                    <th className="text-right px-3 py-2.5 font-medium">Needs Follow-up</th>
                    <th className="text-right px-3 py-2.5 font-medium">No Recent Contact</th>
                    <th className="text-left px-3 py-2.5 font-medium">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {managerBreakdown.length === 0 && (
                    <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No managers to show.</td></tr>
                  )}
                  {managerBreakdown.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => goToActivity(`Manager: ${m.name}`, (r) => r.assigned_manager_id === m.id)}>
                      <td className="px-3 py-3 font-medium text-foreground">{m.name}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{m.assignedProspects}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{m.assignedThisWeek}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{m.addedThisWeek}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-600 font-medium">{m.convertedThisWeek}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{m.deletedThisWeek}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{m.unworkableThisWeek}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{m.activeOpen}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {m.needsFollowUp > 0 ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">{m.needsFollowUp}</Badge> : 0}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {m.noRecentContact > 0 ? <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">{m.noRecentContact}</Badge> : 0}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{fmtDate(m.lastActivity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Prospect Activity */}
        <TabsContent value="activity" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            {drillFilter ? (
              <Badge variant="outline" className="text-xs">
                Filtered: {drillFilter.label}
                <button className="ml-1.5" onClick={() => setDrillFilter(null)}>×</button>
              </Badge>
            ) : <span />}
            <Button variant="outline" size="sm" onClick={() => downloadCsv("prospect-activity.csv", activityRows.map((r) => ({
              company: r.company_name, manager: r.managerName, rep: r.repName, status: statusLabel(r.status),
              date_added: fmtDate(r.created_at), last_contact: fmtDate(r.last_contact_at),
              days_since_contact: r.days_since_contact ?? "", outcome: r.outcome,
            })))}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
          <Card className="border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium">Prospect / Company</th>
                    <th className="text-left px-3 py-2.5 font-medium">Manager</th>
                    <th className="text-left px-3 py-2.5 font-medium">Rep</th>
                    <th className="text-left px-3 py-2.5 font-medium">Status</th>
                    <th className="text-left px-3 py-2.5 font-medium">Added</th>
                    <th className="text-left px-3 py-2.5 font-medium">Last Contact</th>
                    <th className="text-right px-3 py-2.5 font-medium">Days Since</th>
                    <th className="text-left px-3 py-2.5 font-medium">Last Note</th>
                    <th className="text-left px-3 py-2.5 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {activityRows.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No prospects match these filters.</td></tr>
                  )}
                  {activityRows.map((r) => {
                    const stale60 = (r.days_since_contact ?? 0) >= 60;
                    const stale30 = (r.days_since_contact ?? 0) >= 30;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <button className="font-medium text-foreground hover:underline text-left" onClick={() => nav(`/crm/accounts/${r.id}`)}>
                            {r.company_name}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {r.is_unassigned ? <Badge variant="outline" className="text-[10px] bg-muted">Unassigned</Badge> : r.managerName}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.repName}</td>
                        <td className="px-3 py-2.5">{statusLabel(r.status)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{fmtDate(r.last_contact_at)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {r.days_since_contact == null ? (
                            <Badge variant="outline" className="text-[10px] bg-muted">No activity</Badge>
                          ) : stale60 ? (
                            <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">{r.days_since_contact}d</Badge>
                          ) : stale30 ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{r.days_since_contact}d</Badge>
                          ) : r.days_since_contact}
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px] truncate text-muted-foreground text-xs">{r.last_note_preview ?? "-"}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className="text-[10px]">{r.outcome}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Contact Health */}
        <TabsContent value="health" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Converted dealers only, sourced from the same Prospects module records.</p>
            <Button variant="outline" size="sm" onClick={() => downloadCsv("dealer-contact-health.csv", contactHealthRows.map((r) => ({
              dealer: r.company_name, manager: r.managerName, rep: r.repName,
              converted_at: fmtDate(r.converted_at) + (r.converted_at && !r.converted_at_is_exact ? " (approx.)" : ""),
              last_contact: fmtDate(r.last_contact_at), days_since_contact: r.days_since_contact ?? "",
              contacts_last_60d: r.contacts_last_60d, contacts_last_6mo: r.contacts_last_6mo,
              health: CONTACT_HEALTH_CONFIG[r.contact_health].label,
            })))}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
          <Card className="border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium">Dealer</th>
                    <th className="text-left px-3 py-2.5 font-medium">Manager</th>
                    <th className="text-left px-3 py-2.5 font-medium">Rep</th>
                    <th className="text-left px-3 py-2.5 font-medium">Converted</th>
                    <th className="text-left px-3 py-2.5 font-medium">Last Contact</th>
                    <th className="text-right px-3 py-2.5 font-medium">Days Since</th>
                    <th className="text-right px-3 py-2.5 font-medium">Contacts (60d)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Contacts (6mo)</th>
                    <th className="text-left px-3 py-2.5 font-medium">Last Note</th>
                    <th className="text-left px-3 py-2.5 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {contactHealthRows.length === 0 && (
                    <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No converted dealers match these filters.</td></tr>
                  )}
                  {contactHealthRows.map((r) => {
                    const cfg = CONTACT_HEALTH_CONFIG[r.contact_health];
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <button className="font-medium text-foreground hover:underline text-left" onClick={() => nav(`/crm/accounts/${r.id}`)}>
                            {r.company_name}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.managerName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.repName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                          {fmtDate(r.converted_at)}{r.converted_at && !r.converted_at_is_exact && <span className="text-[10px] ml-1 text-muted-foreground/70">(approx.)</span>}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{fmtDate(r.last_contact_at)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.days_since_contact ?? "-"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.contacts_last_60d}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.contacts_last_6mo}</td>
                        <td className="px-3 py-2.5 max-w-[200px] truncate text-muted-foreground text-xs">{r.last_note_preview ?? "-"}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={`text-[10px] ${cfg.badge}`}>{cfg.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  icon, label, value, accent, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: "primary" | "success" | "accent" | "muted";
  onClick?: () => void;
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    accent: "bg-accent/15 text-accent-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card
      className={`border-border/60 transition-shadow ${onClick ? "cursor-pointer hover:shadow-md" : ""}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>{icon}</div>
        </div>
        <p className="font-display text-3xl text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title, description, data, dataKey, config, onBarClick,
}: {
  title: string;
  description: string;
  data: { name: string; [key: string]: string | number }[];
  dataKey: string;
  config: Record<string, { label: string; color: string }>;
  onBarClick?: (name: string) => void;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="font-display text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-xs" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey={dataKey}
              fill={`var(--color-${dataKey})`}
              radius={[6, 6, 0, 0]}
              className={onBarClick ? "cursor-pointer" : undefined}
              onClick={onBarClick ? (d: any) => onBarClick(d.name) : undefined}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
