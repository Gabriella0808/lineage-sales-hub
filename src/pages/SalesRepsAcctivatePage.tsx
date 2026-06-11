import { useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { useSalesReps, useTerritories, useManagers, useRepTerritories, getInitials } from "@/hooks/usePortalData";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function SalesRepsAcctivatePage() {
  const { data: allReps = [], isLoading: repsLoading } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: allManagers = [] } = useManagers();
  const { data: repTerritories = [] } = useRepTerritories();

  const [search, setSearch] = useState("");

  // Only Acctivate-sourced reps and managers
  const reps = allReps.filter(r => r.acctivate_id);
  const managers = allManagers.filter(m => m.acctivate_id);

  const repTerritoryIds = (repId: string) =>
    repTerritories.filter(rt => rt.rep_id === repId).map(rt => rt.territory_id);

  const filtered = reps.filter(r => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (repsLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Sales Rep Database (Acctivate)</h1>
          <p className="page-subtitle">
            {reps.length} reps • {managers.length} managers • read-only, synced from Acctivate
          </p>
        </div>
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800 font-medium">
          Acctivate
        </Badge>
      </div>

      <FilterBar
        searchPlaceholder="Search reps..."
        searchValue={search}
        onSearchChange={setSearch}
      />

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {filtered.map(r => {
          const tids = repTerritoryIds(r.id);
          const mgr = managers.find(m => m.id === r.manager_id);
          return (
            <div key={r.id} className="glass-card p-3 bg-blue-50/40">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground shrink-0">
                  {getInitials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-tight">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Code</p>
                  <p>{r.acctivate_id || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Manager</p>
                  <p className="truncate">{mgr?.name ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">Territories</p>
                  <div className="flex flex-wrap gap-1">
                    {tids.length === 0 ? <span className="text-muted-foreground">—</span> :
                      tids.map(id => (
                        <Badge key={id} variant="secondary" className="font-normal text-[10px]">
                          {territories.find(t => t.id === id)?.acctivate_id ?? "—"} · {territories.find(t => t.id === id)?.name ?? ""}
                        </Badge>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No reps match your filters.</p>}
      </div>

      <div className="table-container hidden lg:block overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Rep Code</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Territory Code</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Rep Email</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Manager</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Manager Email</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const tids = repTerritoryIds(r.id);
              const mgr = managers.find(m => m.id === r.manager_id);
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors bg-blue-50/40">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground shrink-0">
                        {getInitials(r.name)}
                      </div>
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </td>
                  <td className="p-3">{r.acctivate_id || "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {tids.length === 0 ? <span className="text-muted-foreground">—</span> :
                        tids.map(id => (
                          <Badge key={id} variant="secondary" className="font-normal text-[10px]">
                            {territories.find(t => t.id === id)?.acctivate_id ?? "—"}
                          </Badge>
                        ))}
                    </div>
                  </td>
                  <td className="p-3">{r.email || "—"}</td>
                  <td className="p-3">{mgr?.name ?? "—"}</td>
                  <td className="p-3">{mgr?.email ?? "—"}</td>
                  <td className="p-3">{mgr?.region ?? "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-12">No reps match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
