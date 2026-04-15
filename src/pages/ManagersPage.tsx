import { useState } from "react";
import { Users, Map, Store, Mail, Phone, TrendingUp, ArrowLeft } from "lucide-react";
import { useSalesReps, useTerritories, useDealers, useManagers, useRepTerritories, formatCurrency, getInitials, getTerritoryName, getDealersByRep } from "@/hooks/usePortalData";
import { StatusBadge } from "@/components/StatusBadge";
import { KpiGauge } from "@/components/KpiGauge";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManagersPage() {
  const { data: managers = [], isLoading: mgrLoading } = useManagers();
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: dealers = [] } = useDealers();
  const { data: repTerritories = [] } = useRepTerritories();

  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);

  const isLoading = mgrLoading || repsLoading;

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const selectedManager = managers.find(m => m.id === selectedManagerId);
  const managerReps = selectedManager ? reps.filter(r => r.manager_id === selectedManager.id) : [];

  // Detail view for a selected manager
  if (selectedManager) {
    const totalRevenue = managerReps.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const totalQuota = managerReps.reduce((s, r) => s + (r.quota ?? 0), 0);
    const totalDealers = managerReps.reduce((s, r) => s + dealers.filter(d => d.rep_id === r.id).length, 0);
    const avgKpi = managerReps.length > 0 ? Math.round(managerReps.reduce((s, r) => s + (r.kpi_score ?? 0), 0) / managerReps.length) : 0;

    // Collect unique territory IDs for this manager's reps
    const mgrTerritoryIds = [...new Set(managerReps.flatMap(r => repTerritories.filter(rt => rt.rep_id === r.id).map(rt => rt.territory_id)))];

    return (
      <div className="animate-fade-in">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => setSelectedManagerId(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Managers
        </Button>

        <div className="page-header">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-lg font-semibold text-primary-foreground">
              {getInitials(selectedManager.name)}
            </div>
            <div>
              <h1 className="page-title">{selectedManager.name}</h1>
              <p className="page-subtitle">
                {selectedManager.region && `${selectedManager.region} • `}
                {selectedManager.email || "No email"} {selectedManager.phone ? `• ${selectedManager.phone}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard title="Sales Reps" value={managerReps.length} icon={Users} trend="neutral" />
          <StatCard title="Territories" value={mgrTerritoryIds.length} icon={Map} trend="neutral" />
          <StatCard title="Dealers" value={totalDealers} icon={Store} trend="neutral" />
          <StatCard title="Avg KPI" value={avgKpi} icon={TrendingUp} trend="neutral" variant={avgKpi >= 70 ? "success" : avgKpi >= 40 ? "warning" : "destructive"} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="stat-card">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Revenue</p>
            <p className="text-xl font-semibold mt-1">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="stat-card">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Quota Attainment</p>
            <p className="text-xl font-semibold mt-1">{totalQuota > 0 ? `${Math.round(totalRevenue / totalQuota * 100)}%` : "—"}</p>
          </div>
        </div>

        {/* Reps table */}
        <h3 className="text-sm font-semibold mb-3">Sales Reps ({managerReps.length})</h3>
        <div className="table-container mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Territories</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Dealers</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">KPI</th>
                <th className="text-right p-3 font-medium text-muted-foreground hidden lg:table-cell">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {managerReps.map(r => {
                const rTerIds = repTerritories.filter(rt => rt.rep_id === r.id).map(rt => rt.territory_id);
                const dealerCount = dealers.filter(d => d.rep_id === r.id).length;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground shrink-0">
                          {getInitials(r.name)}
                        </div>
                        <div>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.email || "No email"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {rTerIds.length > 0 ? rTerIds.map(tId => (
                          <span key={tId} className="text-[11px] bg-muted px-2 py-0.5 rounded-full">{getTerritoryName(territories, tId)}</span>
                        )) : <span className="text-[11px] text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="p-3 text-center">{dealerCount}</td>
                    <td className="p-3"><StatusBadge status={r.status} /></td>
                    <td className="p-3"><KpiGauge score={r.kpi_score ?? 0} size="sm" /></td>
                    <td className="p-3 text-right hidden lg:table-cell font-medium">{formatCurrency(r.revenue)}</td>
                  </tr>
                );
              })}
              {managerReps.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No reps assigned to this manager yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Territories */}
        <h3 className="text-sm font-semibold mb-3">Territories ({mgrTerritoryIds.length})</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mgrTerritoryIds.map(tId => {
            const ter = territories.find(t => t.id === tId);
            if (!ter) return null;
            const terDealers = dealers.filter(d => d.territory_id === tId);
            const terReps = managerReps.filter(r => repTerritories.some(rt => rt.rep_id === r.id && rt.territory_id === tId));
            return (
              <div key={tId} className="glass-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">{ter.name}</h4>
                  <StatusBadge status={ter.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold">{terReps.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Reps</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{terDealers.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Dealers</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{ter.kpi_score ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">KPI</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{formatCurrency(ter.revenue)} / {formatCurrency(ter.quota)}</p>
              </div>
            );
          })}
          {mgrTerritoryIds.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No territories linked yet.</p>}
        </div>
      </div>
    );
  }

  // Manager cards grid
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Sales Managers</h1>
        <p className="page-subtitle">{managers.length} managers</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {managers.map(mgr => {
          const mgrReps = reps.filter(r => r.manager_id === mgr.id);
          const mgrRevenue = mgrReps.reduce((s, r) => s + (r.revenue ?? 0), 0);
          const mgrDealers = mgrReps.reduce((s, r) => s + dealers.filter(d => d.rep_id === r.id).length, 0);
          const mgrAvgKpi = mgrReps.length > 0 ? Math.round(mgrReps.reduce((s, r) => s + (r.kpi_score ?? 0), 0) / mgrReps.length) : 0;

          return (
            <Card
              key={mgr.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedManagerId(mgr.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground">
                    {getInitials(mgr.name)}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{mgr.name}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{mgr.region || "No region"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-semibold">{mgrReps.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reps</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{mgrDealers}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Dealers</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{mgrAvgKpi}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg KPI</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">Revenue: <span className="font-medium text-foreground">{formatCurrency(mgrRevenue)}</span></p>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {managers.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-12 text-center">No managers found. Sync from monday.com to populate.</p>}
      </div>
    </div>
  );
}
