import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Store, UserSquare2, RefreshCw, LayoutDashboard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LiveKpiReport } from "@/components/LiveKpiReport";
import { SalesReporting } from "@/components/SalesReporting";
import { ExecutiveOverview, prefetchExecutiveData } from "@/components/ExecutiveOverview";
import {
  useManagers, useSalesReps,
} from "@/hooks/usePortalData";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { RepNotConfigured } from "@/components/RepNotConfigured";
import { managerGroupIds } from "@/utils/managerGroups";

type ReportKey = "executive" | "live-kpi" | "dealer-reporting" | "rep-reporting";

const REPORTS: { key: ReportKey; label: string; icon: typeof BarChart3; description: string }[] = [
  { key: "live-kpi",          label: "Live KPI",          icon: BarChart3,    description: "High-level rep & brand performance" },
  { key: "dealer-reporting",  label: "Dealer Reporting",  icon: Store,        description: "Granular dealer sales by date, brand, SKU" },
  { key: "rep-reporting",     label: "Rep Reporting",     icon: UserSquare2,  description: "Granular rep & territory performance" },
  { key: "executive",         label: "High-Level Reporting", icon: LayoutDashboard, description: "Revenue, targets, dealer health and rep performance at a glance" },
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
  const { user } = useAuth();
  // High-Level Reporting is limited to one account while it is being reviewed.
  const canSeeExecutive = user?.email?.toLowerCase() === "gabriella@lineage-collections.com";
  const isRep = !!roleInfo?.isRep;
  const currentRep = useMemo(
    () => (roleInfo?.repId ? reps.find((r) => r.id === roleInfo.repId) ?? null : null),
    [reps, roleInfo?.repId],
  );
  const repManagerId = currentRep?.manager_id ?? null;

  // Live KPI is fully off-limits to reps — not just hidden from the tile
  // grid, but excluded from the set of report keys a URL param can select.
  const visibleReports = REPORTS.filter((r) => (r.key !== "executive" || canSeeExecutive) && (!isRep || (r.key !== "live-kpi" && r.key !== "executive")));

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
  // The manager_id actually sent to the data-fetching RPCs. For a rep's own
  // view, managerScopeRepIds (their own, server-enforced rep code set) is
  // already the complete and authoritative scope - additionally filtering
  // by dealers.manager_id / actuals.manager_id only risks silently
  // under-counting when that field is stale or unset on some of the rep's
  // own dealers (a real, separate data-quality gap found while reconciling
  // Jordan Shindell's Dealer vs Rep Reporting totals - dealers.manager_id
  // is NULL/mismatched on many correctly rep-assigned dealers). effectiveManagerId
  // itself is left untouched since it still drives the locked manager <Select>
  // display elsewhere on this page.
  // The selected manager plus any bare duplicate records for the same person
  // (Acctivate's short "Will"/"Mateo" next to "Will Grisack"/"Mateo De Lisa").
  // Dealers, reps and orders are split across those records, so scoping to just
  // the real one silently drops most of that manager's numbers. This only widens
  // REPORTING scope - it does not change any dealer/rep/prospect assignment.
  const groupIds = useMemo<string[] | null>(() => {
    if (isRep || effectiveManagerId === "all") return null;
    return managerGroupIds(effectiveManagerId, managers);
  }, [isRep, effectiveManagerId, managers]);
  const hasDuplicates = !!groupIds && groupIds.length > 1;
  // With duplicates, the single-id server filter can't express "these records",
  // so those tabs are scoped by the team's reps instead (groupRepAcIds below).
  const dataManagerId = isRep ? null : (effectiveManagerId === "all" || hasDuplicates ? null : effectiveManagerId);

  // Warm the High-Level Reporting data in the background so that tab opens instantly.
  useEffect(() => {
    if (isRep || !canSeeExecutive) return;
    const t = window.setTimeout(() => prefetchExecutiveData(queryClient, groupIds, refreshKey), 1500);
    return () => window.clearTimeout(t);
  }, [isRep, canSeeExecutive, queryClient, groupIds, refreshKey]);

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

  // Manager scope → list of rep ids the user is allowed to see. A rep can
  // be linked to more than one sales_reps row (multiple territories under
  // separate Acctivate codes, e.g. Jordan Shindell covers both PA/OH and
  // Beach) — include all of them, not just the first.
  const managerScopeRepIds = useMemo<string[] | null>(() => {
    if (isRep && roleInfo?.repIds?.length) return roleInfo.repIds;
    if (effectiveManagerId === "all") return null;
    const ids = groupIds ?? [effectiveManagerId];
    return reps.filter((r) => r.manager_id && ids.includes(r.manager_id)).map((r) => r.id);
  }, [isRep, roleInfo?.repIds, effectiveManagerId, reps, groupIds]);

  // Acctivate rep codes of the team, used to scope the server-side reports when
  // the manager has duplicate records (null otherwise, so every other manager's
  // numbers are computed exactly as before).
  const groupRepAcIds = useMemo<string[] | null>(() => {
    if (!hasDuplicates || !managerScopeRepIds) return null;
    const codes = reps
      .filter((r) => managerScopeRepIds.includes(r.id) && r.acctivate_id?.trim())
      .map((r) => r.acctivate_id!.trim());
    return codes.length > 0 ? codes : ["__no_reps__"]; // never fall back to company-wide
  }, [hasDuplicates, managerScopeRepIds, reps]);

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

      {/* Report switcher */}
      <div data-tour="report-tabs" className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit max-w-full overflow-x-auto">
        {visibleReports.map(({ key, label }) => (
          <button
            key={key}
            data-tour={`tab-${key}`}
            onClick={() => setReport(key)}
            className={cn(
              "h-8 px-3 rounded-md text-[13px] whitespace-nowrap transition-colors",
              key === activeReport ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active report */}
      <section>
        {activeReport !== "executive" && (
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight">{activeReportMeta.label}</h2>
            <p className="text-xs text-muted-foreground">{activeReportMeta.description}</p>
          </div>
        )}

        {activeReport === "executive" && (
          <ExecutiveOverview
            managerIds={groupIds}
            managerName={managerName}
            refreshKey={refreshKey}
            onOpenReport={setReport}
          />
        )}
        {activeReport === "live-kpi" && (
          <LiveKpiReport
            managerName={managerName}
            lockedRepName={isRep ? currentRep?.name ?? null : null}
            managerScopeRepIds={managerScopeRepIds}
            managerId={dataManagerId}
            managerIds={groupIds}
            groupRepAcIds={groupRepAcIds}
            refreshKey={refreshKey}
          />
        )}
        {activeReport === "dealer-reporting" && (
          <SalesReporting
            groupBy="dealer"
            managerScopeRepIds={managerScopeRepIds}
            managerId={dataManagerId}
            groupRepAcIds={groupRepAcIds}
          />
        )}
        {activeReport === "rep-reporting" && (
          <SalesReporting
            groupBy="rep"
            groupByOptions={["rep", "territory"]}
            managerScopeRepIds={managerScopeRepIds}
            managerId={dataManagerId}
            groupRepAcIds={groupRepAcIds}
          />
        )}
      </section>
    </div>
  );
}
