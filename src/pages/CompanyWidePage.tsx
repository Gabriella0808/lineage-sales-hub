import { useMemo } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  BarChart3, Store, UserSquare2, ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LiveKpiReport } from "@/components/LiveKpiReport";
import { SalesReporting } from "@/components/SalesReporting";
import {
  useManagers, useSalesReps,
} from "@/hooks/usePortalData";
import { useUserRole } from "@/hooks/useUserRole";

type ReportKey = "live-kpi" | "dealer-reporting" | "rep-reporting";

const REPORTS: { key: ReportKey; label: string; icon: typeof BarChart3; description: string; managerOnly?: boolean }[] = [
  { key: "live-kpi",          label: "Live KPI",          icon: BarChart3,    description: "High-level rep & brand performance" },
  { key: "dealer-reporting",  label: "Dealer Reporting",  icon: Store,        description: "Granular dealer sales by date, brand, SKU" },
  { key: "rep-reporting",     label: "Rep Reporting",     icon: UserSquare2,  description: "Granular rep & territory performance", managerOnly: true },
];

export default function CompanyWidePage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
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

  const visibleReports = REPORTS.filter((r) => !r.managerOnly || !isRep);

  const pathDefault: ReportKey | null =
    location.pathname === "/kpi" ? "live-kpi" : null;

  const activeReport: ReportKey = reportParam && visibleReports.some((r) => r.key === reportParam)
    ? reportParam
    : (pathDefault ?? "live-kpi");

  const visibleManagers = useMemo(
    () => managers.filter((m) => {
      if (isRep) return repManagerId ? m.id === repManagerId : false;
      const n = m.name.trim().toLowerCase();
      const e = m.email?.trim().toLowerCase();
      if (n === "sales" || e === "sales@lineage-collections.com") return false;
      if (n === "scott grisack") return false;
      return true;
    }),
    [managers, isRep, repManagerId],
  );

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

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="page-title">Company-Wide</h1>
        <div className="flex items-center gap-2">
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
          <LiveKpiReport managerName={managerName} lockedRepName={isRep ? currentRep?.name ?? null : null} />
        )}
        {activeReport === "dealer-reporting" && (
          <SalesReporting groupBy="dealer" managerScopeRepIds={managerScopeRepIds} />
        )}
        {activeReport === "rep-reporting" && !isRep && (
          <SalesReporting groupBy="rep" managerScopeRepIds={managerScopeRepIds} />
        )}
      </section>
    </div>
  );
}
