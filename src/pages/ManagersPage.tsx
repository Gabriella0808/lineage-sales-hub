import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3, Mail, Phone, MapPin } from "lucide-react";
import {
  useSalesReps, useDealers, useManagers, useRepTerritories,
  formatCurrency, getInitials,
  type DbSalesRep,
} from "@/hooks/usePortalData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function ManagersPage() {
  const { data: managers = [], isLoading: mgrLoading } = useManagers();
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: dealers = [] } = useDealers();
  const { data: repTerritories = [] } = useRepTerritories();

  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const isLoading = mgrLoading || repsLoading;

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

  const repsById = useMemo(() => new Map(reps.map((r) => [r.id, r])), [reps]);

  const managerRepsById = useMemo(() => {
    const map = new Map<string, DbSalesRep[]>();
    visibleManagers.forEach((mgr) => {
      const direct = reps.filter((r) => r.manager_id === mgr.id).sort((a, b) => a.name.localeCompare(b.name));
      map.set(mgr.id, direct);
    });
    return map;
  }, [visibleManagers, reps]);

  const selectedManager = visibleManagers.find((m) => m.id === selectedManagerId);

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ── Manager profile (people-only) ──
  if (selectedManager) {
    const managerReps = managerRepsById.get(selectedManager.id) ?? [];
    const mgrTerritoryIds = [...new Set(
      managerReps.flatMap((r) => repTerritories.filter((rt) => rt.rep_id === r.id).map((rt) => rt.territory_id)),
    )];
    const mgrDealers = dealers.filter((d) => managerReps.some((r) => r.id === d.rep_id));

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
                {selectedManager.region || "No region"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-5 mb-6">
          {/* Contact */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Contact</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {selectedManager.email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${selectedManager.email}`} className="truncate hover:text-primary transition-colors">{selectedManager.email}</a>
                </div>
              )}
              {selectedManager.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${selectedManager.phone}`} className="hover:text-primary transition-colors">{selectedManager.phone}</a>
                </div>
              )}
              {selectedManager.region && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{selectedManager.region}</span>
                </div>
              )}
              {!selectedManager.email && !selectedManager.phone && !selectedManager.region && (
                <p className="text-muted-foreground text-xs">No contact info on file.</p>
              )}
            </CardContent>
          </Card>

          {/* Quick stats */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Coverage</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold">{managerReps.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Reps</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{mgrTerritoryIds.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Territories</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{mgrDealers.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Dealers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reports CTA */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Reports</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">All performance reports for {selectedManager.name.split(" ")[0]} live in Company-Wide.</p>
              <Button asChild size="sm" className="w-full">
                <Link to={`/company-wide?manager=${selectedManager.id}`}>
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                  View Reports
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Reps under this manager */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Sales Reps</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="table-container">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Quota</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {managerReps.map((rep) => (
                    <tr key={rep.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-medium">{rep.name}</td>
                      <td className="p-3 text-muted-foreground text-xs">{rep.email || "—"}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(rep.revenue ?? 0)}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(rep.quota ?? 0)}</td>
                      <td className="p-3"><Badge variant="secondary" className="capitalize">{rep.status}</Badge></td>
                    </tr>
                  ))}
                  {managerReps.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No reps assigned.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Manager grid ──
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Sales Managers</h1>
        <p className="page-subtitle">{visibleManagers.length} managers · reports live in Company-Wide</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {visibleManagers.map((mgr) => {
          const mgrReps = managerRepsById.get(mgr.id) ?? [];
          const mgrRevenue = mgrReps.reduce((s, r) => s + (r.revenue ?? 0), 0);
          const mgrDealerCount = dealers.filter((d) => mgrReps.some((r) => r.id === d.rep_id)).length;
          const mgrTerCount = [...new Set(
            mgrReps.flatMap((r) => repTerritories.filter((rt) => rt.rep_id === r.id).map((rt) => rt.territory_id)),
          )].length;

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
                    <p className="text-lg font-semibold">{mgrTerCount}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Territories</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{mgrReps.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reps</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{mgrDealerCount}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Dealers</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">Revenue: <span className="font-medium text-foreground">{formatCurrency(mgrRevenue)}</span></p>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {visibleManagers.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full py-12 text-center">No managers found.</p>
        )}
      </div>
    </div>
  );
}
