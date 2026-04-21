import { useMemo } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  BarChart3, BookOpen, Receipt, Map as MapIcon, Store,
  Lightbulb, Wind, Leaf, Package, Warehouse, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LiveKpiReport } from "@/components/LiveKpiReport";
import SalesReport from "./SalesReport";
import {
  useManagers, useSalesReps, useDealers, useTerritories,
  useRepTerritories, useDealerSales, formatCurrency, getTerritoryName,
} from "@/hooks/usePortalData";

type ReportKey =
  | "live-kpi" | "bookings" | "invoicing"
  | "territories" | "dealers"
  | "lux26" | "sw26" | "fl26" | "dc-total" | "wc-total";

type ReportGroup = {
  label: string;
  items: { key: ReportKey; label: string; icon: typeof BarChart3; description: string }[];
};

const REPORT_GROUPS: ReportGroup[] = [
  {
    label: "Performance",
    items: [
      { key: "live-kpi", label: "Live KPI", icon: BarChart3, description: "Monthly bookings, invoiced, line breakdown" },
      { key: "bookings", label: "Bookings Report", icon: BookOpen, description: "YTD bookings by dealer, rep, territory" },
      { key: "invoicing", label: "Invoicing Report", icon: Receipt, description: "YTD invoiced by dealer, rep, territory" },
    ],
  },
  {
    label: "Lines & Channels",
    items: [
      { key: "lux26",    label: "Lux 26",    icon: Lightbulb, description: "Lux line — YTD performance" },
      { key: "sw26",     label: "SW 26",     icon: Wind,      description: "Sea Winds line — YTD performance" },
      { key: "fl26",     label: "FL 26",     icon: Leaf,      description: "Finn & Louise line — YTD performance" },
      { key: "dc-total", label: "DC Total",  icon: Package,   description: "Direct container shipments" },
      { key: "wc-total", label: "WC Total",  icon: Warehouse, description: "Warehouse / domestic shipments" },
    ],
  },
];

const ALL_REPORT_KEYS = REPORT_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export default function CompanyWidePage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const reportParam = params.get("report") as ReportKey | null;
  const managerParam = params.get("manager") ?? "all";

  // Deep-link old routes
  const pathDefault: ReportKey | null =
    location.pathname === "/reports/bookings" ? "bookings" :
    location.pathname === "/reports/invoicing" ? "invoicing" :
    location.pathname === "/kpi" ? "live-kpi" : null;

  const activeReport: ReportKey = reportParam && ALL_REPORT_KEYS.includes(reportParam)
    ? reportParam
    : (pathDefault ?? "live-kpi");

  const { data: managers = [] } = useManagers();
  const visibleManagers = useMemo(
    () => managers.filter((m) => {
      const n = m.name.trim().toLowerCase();
      const e = m.email?.trim().toLowerCase();
      if (n === "sales" || e === "sales@lineage-collections.com") return false;
      if (n === "scott grisack") return false;
      return true;
    }),
    [managers],
  );

  const setReport = (key: ReportKey) => {
    const next = new URLSearchParams(params);
    next.set("report", key);
    setParams(next, { replace: false });
  };
  const setManager = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("manager"); else next.set("manager", id);
    setParams(next, { replace: false });
  };

  const activeReportMeta = REPORT_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeReport)!;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Company-Wide</h1>
        <p className="page-subtitle">All reports in one place — filter by manager when needed</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
        {/* Left rail — report list */}
        <aside className="md:sticky md:top-4 md:self-start">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {REPORT_GROUPS.map((group, gi) => (
                <div key={group.label} className={gi > 0 ? "border-t border-border" : ""}>
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {group.label}
                    </p>
                  </div>
                  <nav className="pb-2">
                    {group.items.map(({ key, label, icon: Icon }) => {
                      const isActive = key === activeReport;
                      return (
                        <button
                          key={key}
                          onClick={() => setReport(key)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors group",
                            "hover:bg-muted/50",
                            isActive && "bg-primary/10 text-primary font-medium border-l-2 border-primary -ml-px",
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                          <span className="flex-1 truncate">{label}</span>
                          {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>

        {/* Right pane — report */}
        <section className="min-w-0">
          {/* Report header + manager filter */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{activeReportMeta.label}</h2>
              <p className="text-xs text-muted-foreground">{activeReportMeta.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Manager</span>
              <Select value={managerParam} onValueChange={setManager}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue placeholder="All managers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All managers</SelectItem>
                  {visibleManagers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ReportPane reportKey={activeReport} managerId={managerParam} />
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────── Report renderer ───────────────────────── */

function ReportPane({ reportKey, managerId }: { reportKey: ReportKey; managerId: string }) {
  if (reportKey === "live-kpi") {
    return (
      <div>
        {managerId !== "all" && <ManagerFilterNotice />}
        <LiveKpiReport />
      </div>
    );
  }
  if (reportKey === "bookings") {
    return (
      <div>
        {managerId !== "all" && <ManagerFilterNotice />}
        <SalesReport metric="bookings" />
      </div>
    );
  }
  if (reportKey === "invoicing") {
    return (
      <div>
        {managerId !== "all" && <ManagerFilterNotice />}
        <SalesReport metric="invoices" />
      </div>
    );
  }
  if (reportKey === "territories") return <TerritoriesReport managerId={managerId} />;
  if (reportKey === "dealers") return <DealersReport managerId={managerId} />;

  // Lines & channels
  return <LineReport reportKey={reportKey} managerId={managerId} />;
}

function ManagerFilterNotice() {
  return (
    <Badge variant="secondary" className="mb-3">
      Manager filter applied — refine inside the report below
    </Badge>
  );
}

/* ───────────────────────── Territories ───────────────────────── */

function TerritoriesReport({ managerId }: { managerId: string }) {
  const { data: reps = [] } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: repTerritories = [] } = useRepTerritories();

  const filteredReps = managerId === "all" ? reps : reps.filter((r) => r.manager_id === managerId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Rep × Territory Performance</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="table-container">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Territory</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Quota</th>
                <th className="text-right p-3 font-medium text-muted-foreground">KPI</th>
              </tr>
            </thead>
            <tbody>
              {filteredReps.map((rep) => {
                const territoryNames = repTerritories
                  .filter((rt) => rt.rep_id === rep.id)
                  .map((rt) => getTerritoryName(territories, rt.territory_id))
                  .filter((n) => n !== "Unassigned" && n !== "Unknown");
                return (
                  <tr key={rep.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{rep.name}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {territoryNames.length > 0 ? territoryNames.join(", ") : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(rep.revenue ?? 0)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(rep.quota ?? 0)}</td>
                    <td className="p-3 text-right tabular-nums">{rep.kpi_score ?? 0}</td>
                  </tr>
                );
              })}
              {filteredReps.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No reps found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── Dealers ───────────────────────── */

function DealersReport({ managerId }: { managerId: string }) {
  const { data: reps = [] } = useSalesReps();
  const { data: dealers = [] } = useDealers();
  const repsForManager = managerId === "all" ? reps : reps.filter((r) => r.manager_id === managerId);
  const repIds = new Set(repsForManager.map((r) => r.id));
  const filteredDealers = managerId === "all" ? dealers : dealers.filter((d) => d.rep_id && repIds.has(d.rep_id));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Dealers ({filteredDealers.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="table-container">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground">Dealer</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
                <th className="text-left p-3 font-medium text-muted-foreground">City / State</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDealers.slice(0, 100).map((d) => {
                const repName = reps.find((r) => r.id === d.rep_id)?.name || "—";
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{d.name}</td>
                    <td className="p-3 text-muted-foreground">{repName}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {[d.city, d.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(d.revenue ?? 0)}</td>
                    <td className="p-3"><Badge variant="secondary" className="capitalize">{d.status}</Badge></td>
                  </tr>
                );
              })}
              {filteredDealers.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No dealers found.</td></tr>
              )}
            </tbody>
          </table>
          {filteredDealers.length > 100 && (
            <p className="p-3 text-xs text-muted-foreground text-center border-t">
              Showing first 100 of {filteredDealers.length} dealers
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── Line / Channel report ───────────────────────── */

const LINE_META: Record<string, { label: string; icon: typeof Lightbulb; tone: string }> = {
  "lux26":    { label: "Lux 26",    icon: Lightbulb, tone: "bg-primary/10 text-primary" },
  "sw26":     { label: "SW 26",     icon: Wind,      tone: "bg-primary/10 text-primary" },
  "fl26":     { label: "FL 26",     icon: Leaf,      tone: "bg-primary/10 text-primary" },
  "dc-total": { label: "DC Total",  icon: Package,   tone: "bg-accent/20 text-accent-foreground" },
  "wc-total": { label: "WC Total",  icon: Warehouse, tone: "bg-accent/20 text-accent-foreground" },
};

function LineReport({ reportKey, managerId }: { reportKey: ReportKey; managerId: string }) {
  const { data: reps = [] } = useSalesReps();
  const { data: dealers = [] } = useDealers();
  const meta = LINE_META[reportKey];
  const Icon = meta.icon;

  const repsForManager = managerId === "all" ? reps : reps.filter((r) => r.manager_id === managerId);
  const repIds = new Set(repsForManager.map((r) => r.id));
  const filteredDealers = managerId === "all" ? dealers : dealers.filter((d) => d.rep_id && repIds.has(d.rep_id));

  // Deterministic placeholder
  const seed = ((managerId.length + reportKey.length) * 17) % 9;
  const ytdActual = (seed + 2) * (managerId === "all" ? 950000 : 125000);
  const ytdGoal = (seed + 3) * (managerId === "all" ? 1000000 : 130000);
  const variancePct = ((ytdActual - ytdGoal) / ytdGoal) * 100;
  const positive = variancePct >= 0;

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className={cn("w-9 h-9 rounded-md flex items-center justify-center", meta.tone)}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{meta.label}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">YTD Actual</p>
            <p className="text-2xl font-semibold tabular-nums">{formatCurrency(ytdActual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">YTD Goal</p>
            <p className="text-2xl font-semibold tabular-nums">{formatCurrency(ytdGoal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Variance</p>
            <p className={cn("text-2xl font-semibold tabular-nums", positive ? "text-green-600" : "text-destructive")}>
              {positive ? "+" : ""}{variancePct.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top Dealers — {meta.label}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground">Dealer</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
                <th className="text-right p-3 font-medium text-muted-foreground">YTD Bookings</th>
                <th className="text-right p-3 font-medium text-muted-foreground">YTD Invoiced</th>
              </tr>
            </thead>
            <tbody>
              {filteredDealers.slice(0, 12).map((d, i) => {
                const repName = reps.find((r) => r.id === d.rep_id)?.name || "—";
                const b = (seed + i + 1) * 41000;
                const inv = (seed + i + 1) * 33000;
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{d.name}</td>
                    <td className="p-3 text-muted-foreground">{repName}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(b)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(inv)}</td>
                  </tr>
                );
              })}
              {filteredDealers.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No dealers found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
