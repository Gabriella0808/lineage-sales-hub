import { useMemo, useState, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Store, UserSquare2, ChevronRight, RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LiveKpiReport } from "@/components/LiveKpiReport";
import { SalesReporting } from "@/components/SalesReporting";
import {
  useManagers, useSalesReps,
} from "@/hooks/usePortalData";
import { useUserRole } from "@/hooks/useUserRole";
import { RepNotConfigured } from "@/components/RepNotConfigured";

type ReportKey = "live-kpi" | "dealer-reporting" | "rep-reporting";

const REPORTS: { key: ReportKey; label: string; icon: typeof BarChart3; description: string }[] = [
  { key: "live-kpi",          label: "Live KPI",          icon: BarChart3,    description: "High-level rep & brand performance" },
  { key: "dealer-reporting",  label: "Dealer Reporting",  icon: Store,        description: "Granular dealer sales by date, brand, SKU" },
  { key: "rep-reporting",     label: "Rep Reporting",     icon: UserSquare2,  description: "Granular rep & territory performance" },
];

export default function CompanyWidePage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["daily_actuals_v2"] });
    queryClient.invalidateQueries({ queryKey: ["sales_grouped_rows_v2"] });
    queryClient.invalidateQueries({ queryKey: ["v_portal_invoiced_lines_v1"] });
    queryClient.invalidateQueries({ queryKey: ["v_portal_booking_lines_v1"] });
    queryClient.invalidateQueries({ queryKey: ["mtd_invoicing_cw"] });
    queryClient.invalidateQueries({ queryKey: ["mtd_invoicing_mgr"] });
    setRefreshKey((k) => k + 1);
    setLastRefreshed(new Date());
  }, [queryClient]);
  const reportParam = params.get("report") as ReportKey | null;
  const managerParam = params.get("manager") ?? "all";

  const { data: managers = [] } = useManagers();
  const { data: reps = [] } = useSalesReps();
  const { data: roleInfo } = useUserRole();
  const isRep = !!roleInfo?.isRep;
  const currentRep = useMemo(
    () => (roleInfo?.repId ? reps.find((r) => r.id === roleInfo.repId) ?? null : null),
    [reps, roleInfo?.repId],
  );
  const repManagerId = currentRep?.manager_id ?? null;

  // Live KPI is fully off-limits to reps — not just hidden from the tile
  // grid, but excluded from the set of report keys a URL param can select.
  const visibleReports = REPORTS.filter((r) => !isRep || r.key !== "live-kpi");

  const defaultReport: ReportKey = isRep ? "dealer-reporting" : "live-kpi";
  const pathDefault: ReportKey | null =
    location.pathname === "/kpi" && !isRep ? "live-kpi" : null;

  const activeReport: ReportKey = reportParam && visibleReports.some((r) => r.key === reportParam)
    ? reportParam
    : (pathDefault ?? defaultReport);

  const visibleManagers = useMemo(() => {
    // Step 1: apply base exclusions
    const base = managers.filter((m) => {
      if (isRep) return repManagerId ? m.id === repManagerId : false;
      const n = m.name.trim().toLowerCase();
      const e = m.email?.trim().toLowerCase();
      if (n === "sales" || e === "sales@lineage-collections.com") return false;
      if (n === "scott grisack") return false;
      return true;
    });
    // Step 2: deduplicate — if a single-word entry ("Will", "Mateo") has a corresponding
    // multi-word canonical entry ("Will Grisack", "Mateo De Lisa"), drop the short one.
    const baseNamesLower = base.map((m) => m.name.trim().toLowerCase());
    return base.filter((m) => {
      const name = m.name.trim();
      if (!name.includes(" ")) {
        const first = name.toLowerCase();
        if (baseNamesLower.some((n) => n.startsWith(first + " "))) return false;
      }
      return true;
    });
  }, [managers, isRep, repManagerId]);

  const effectiveManagerId = isRep && repManagerId ? repManagerId : managerParam;

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

  const activeReportMeta = visibleReports.find((r) => r.key === activeReport)!;

  // Manager scope → list of rep ids the user is allowed to see
  const managerScopeRepIds = useMemo<string[] | null>(() => {
    if (isRep && roleInfo?.repId) return [roleInfo.repId];
    if (effectiveManagerId === "all") return null;
    return reps.filter((r) => r.manager_id === effectiveManagerId).map((r) => r.id);
  }, [isRep, roleInfo?.repId, effectiveManagerId, reps]);

  const managerName = effectiveManagerId === "all"
    ? undefined
    : visibleManagers.find((m) => m.id === effectiveManagerId)?.name;

  if (isRep && !roleInfo?.repId) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="page-header">
          <h1 className="page-title">Company-Wide</h1>
        </div>
        <RepNotConfigured />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="page-title">Company-Wide</h1>
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Refreshed {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-9 px-2 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground hidden sm:inline">Manager</span>
          <Select value={effectiveManagerId} onValueChange={setManager} disabled={isRep}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="All managers" />
            </SelectTrigger>
            <SelectContent>
              {!isRep && <SelectItem value="all">All managers</SelectItem>}
              {visibleManagers.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Report tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleReports.map(({ key, label, icon: Icon, description }) => {
          const isActive = key === activeReport;
          return (
            <button key={key} onClick={() => setReport(key)} className="text-left">
              <Card className={cn(
                "transition-all hover:shadow-md",
                isActive && "ring-2 ring-primary shadow-md",
              )}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-md flex items-center justify-center shrink-0",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{description}</p>
                  </div>
                  {isActive && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Active report */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight">{activeReportMeta.label}</h2>
          <p className="text-xs text-muted-foreground">{activeReportMeta.description}</p>
        </div>

        {activeReport === "live-kpi" && (
          <LiveKpiReport
            managerName={managerName}
            lockedRepName={isRep ? currentRep?.name ?? null : null}
            managerScopeRepIds={managerScopeRepIds}
            managerId={effectiveManagerId === "all" ? null : effectiveManagerId}
            refreshKey={refreshKey}
          />
        )}
        {activeReport === "dealer-reporting" && (
          <SalesReporting
            groupBy="dealer"
            managerScopeRepIds={managerScopeRepIds}
            managerId={effectiveManagerId === "all" ? null : effectiveManagerId}
          />
        )}
        {activeReport === "rep-reporting" && (
          <SalesReporting
            groupBy="rep"
            groupByOptions={["rep", "territory"]}
            managerScopeRepIds={managerScopeRepIds}
            managerId={effectiveManagerId === "all" ? null : effectiveManagerId}
          />
        )}
      </section>
    </div>
  );
}
