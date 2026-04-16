import { useState, useMemo } from "react";
import { Map as MapIcon, Store, ArrowLeft, Filter, X, DollarSign, Target, TrendingUp, TrendingDown, CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useSalesReps, useTerritories, useDealers, useManagers,
  useRepTerritories, useDealerSales, useTravelLog,
  formatCurrency, getInitials, getTerritoryName,
  type DbSalesRep, type DbDealer, type DbDealerSale, type DbTravelLog,
} from "@/hooks/usePortalData";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

type DetailView = null | "territories" | "dealers" | "ytd-bookings" | "ytd-goal";

export default function ManagersPage() {
  const { data: managers = [], isLoading: mgrLoading } = useManagers();
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: dealers = [] } = useDealers();
  const { data: repTerritories = [] } = useRepTerritories();
  const { data: dealerSales = [] } = useDealerSales();
  const { data: travelLog = [] } = useTravelLog();

  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<DetailView>(null);
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<DbTravelLog | null>(null);
  const [travelPage, setTravelPage] = useState(0);
  const [travelDateFrom, setTravelDateFrom] = useState<Date | undefined>();
  const [travelDateTo, setTravelDateTo] = useState<Date | undefined>();
  const isLoading = mgrLoading || repsLoading;

  const visibleManagers = useMemo(
    () => managers.filter((manager) => {
      const normalizedName = manager.name.trim().toLowerCase();
      const normalizedEmail = manager.email?.trim().toLowerCase();
      return normalizedName !== "sales" && normalizedEmail !== "sales@lineage-collections.com";
    }),
    [managers],
  );

  const repsById = useMemo(
    () => new Map(reps.map((rep) => [rep.id, rep])),
    [reps],
  );

  const directRepIdsByManager = useMemo(() => {
    const repIdsByManager = new Map<string, string[]>();

    reps.forEach((rep) => {
      if (!rep.manager_id) return;
      const currentIds = repIdsByManager.get(rep.manager_id) ?? [];
      currentIds.push(rep.id);
      repIdsByManager.set(rep.manager_id, currentIds);
    });

    return repIdsByManager;
  }, [reps]);

  const fallbackRepIdsByManager = useMemo(() => {
    const repIdsByManager = new Map<string, string[]>();

    travelLog.forEach((entry) => {
      if (!entry.manager_id || !entry.rep_id || !repsById.has(entry.rep_id)) return;

      const currentIds = repIdsByManager.get(entry.manager_id) ?? [];
      if (!currentIds.includes(entry.rep_id)) {
        currentIds.push(entry.rep_id);
        repIdsByManager.set(entry.manager_id, currentIds);
      }
    });

    return repIdsByManager;
  }, [travelLog, repsById]);

  const managerRepsById = useMemo(() => {
    const repMap = new Map<string, DbSalesRep[]>();

    visibleManagers.forEach((manager) => {
      const directIds = directRepIdsByManager.get(manager.id) ?? [];
      const fallbackIds = fallbackRepIdsByManager.get(manager.id) ?? [];
      const resolvedIds = (directIds.length > 0 ? directIds : fallbackIds).filter(
        (repId, index, ids) => ids.indexOf(repId) === index,
      );

      const resolvedReps = resolvedIds
        .map((repId) => repsById.get(repId))
        .filter((rep): rep is DbSalesRep => Boolean(rep))
        .sort((a, b) => a.name.localeCompare(b.name));

      repMap.set(manager.id, resolvedReps);
    });

    return repMap;
  }, [visibleManagers, directRepIdsByManager, fallbackRepIdsByManager, repsById]);

  const selectedManager = visibleManagers.find(m => m.id === selectedManagerId);
  const managerReps = selectedManager ? (managerRepsById.get(selectedManager.id) ?? []) : [];
  const mgrTerritoryIds = [...new Set(managerReps.flatMap(r => repTerritories.filter(rt => rt.rep_id === r.id).map(rt => rt.territory_id)))];
  const mgrDealers = dealers.filter(d => managerReps.some(r => r.id === d.rep_id));
  const mgrTravelLog = selectedManager ? travelLog.filter(tl => tl.manager_id === selectedManager.id) : [];

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

  // Back handler
  const handleBack = () => {
    if (detailView) {
      setDetailView(null);
      setSelectedRepIds([]);
      setSelectedDealerIds([]);
    } else {
      setSelectedManagerId(null);
    }
  };

  // ── Territories detail view ──
  if (selectedManager && detailView === "territories") {
    return (
      <div className="animate-fade-in">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold mb-1">{selectedManager.name} — Territories</h1>
        <p className="text-sm text-muted-foreground mb-6">{mgrTerritoryIds.length} territories • {managerReps.length} reps • {mgrDealers.length} dealers • {mgrTravelLog.length} travel entries</p>

        <div className="grid gap-6">
          {/* Combined Reps × Territories × YTD × Travel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rep Performance & Territories</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground">Rep Code</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Territory</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">2025 YTD Bookings</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">2025 YTD Invoicing</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">2026 YTD Bookings</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">2026 YTD Invoicing</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Last Travel Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerReps.map((rep, idx) => {
                      // Stable dummy data per rep (deterministic from id)
                      const seed = rep.id.charCodeAt(0) + rep.id.charCodeAt(rep.id.length - 1) + idx;
                      const dummy = (base: number) => Math.round((base + (seed * 1373) % 250000) / 1000) * 1000;
                      const b25 = dummy(420000);
                      const i25 = dummy(380000);
                      const b26 = dummy(180000);
                      const i26 = dummy(140000);

                      const repCode = rep.acctivate_id || rep.name.split(" ").map(n => n[0]).join("").toUpperCase();
                      const repTerritoryNames = repTerritories
                        .filter(rt => rt.rep_id === rep.id)
                        .map(rt => getTerritoryName(territories, rt.territory_id))
                        .filter(n => n !== "Unassigned" && n !== "Unknown");
                      const repTrips = mgrTravelLog
                        .filter(tl => tl.rep_id === rep.id)
                        .sort((a, b) => new Date(b.travel_date).getTime() - new Date(a.travel_date).getTime())
                        .slice(0, 4);

                      return (
                        <tr key={rep.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors align-top">
                          <td className="p-3 font-mono text-xs font-semibold">{repCode}</td>
                          <td className="p-3">
                            <div className="font-medium">{rep.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {repTerritoryNames.length > 0 ? repTerritoryNames.join(", ") : "—"}
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums">{formatCurrency(b25)}</td>
                          <td className="p-3 text-right tabular-nums">{formatCurrency(i25)}</td>
                          <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(b26)}</td>
                          <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(i26)}</td>
                          <td className="p-3">
                            {repTrips.length === 0 ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {repTrips.map(trip => (
                                  <button
                                    key={trip.id}
                                    onClick={() => setSelectedTrip(trip)}
                                    className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                                  >
                                    {new Date(trip.travel_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {managerReps.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No reps assigned.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Trip detail sidebar */}
        <Sheet open={!!selectedTrip} onOpenChange={(open) => !open && setSelectedTrip(null)}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{selectedTrip?.notes?.split(" — ")[0] || "Trip Details"}</SheetTitle>
            </SheetHeader>
            {selectedTrip && (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Dates</p>
                  <p className="font-medium">
                    {new Date(selectedTrip.travel_date).toLocaleDateString()}
                    {selectedTrip.travel_end_date ? ` – ${new Date(selectedTrip.travel_end_date).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {selectedTrip.purpose && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Purpose</p>
                    <p className="font-medium">{selectedTrip.purpose}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Status</p>
                  {selectedTrip.approval_status ? (
                    <Badge variant={selectedTrip.approval_status === "Approved" ? "default" : "secondary"}>
                      {selectedTrip.approval_status}
                    </Badge>
                  ) : <p className="text-muted-foreground">No status</p>}
                </div>
                {selectedTrip.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedTrip.notes.includes(" — ") ? selectedTrip.notes.split(" — ").slice(1).join(" — ") : selectedTrip.notes}</p>
                  </div>
                )}
                {selectedTrip.salesperson_name && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Salesperson</p>
                    <p className="font-medium">{selectedTrip.salesperson_name}</p>
                  </div>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ── Dealers detail view (report) ──
  if (selectedManager && detailView === "dealers") {
    return (
      <DealerReport
        manager={selectedManager}
        managerReps={managerReps}
        dealers={mgrDealers}
        allDealers={dealers}
        dealerSales={dealerSales}
        reps={reps}
        selectedRepIds={selectedRepIds}
        setSelectedRepIds={setSelectedRepIds}
        selectedDealerIds={selectedDealerIds}
        setSelectedDealerIds={setSelectedDealerIds}
        onBack={handleBack}
      />
    );
  }

  // ── YTD Bookings detail view ──
  if (selectedManager && (detailView === "ytd-bookings" || detailView === "ytd-goal")) {
    return (
      <DealerReport
        manager={selectedManager}
        managerReps={managerReps}
        dealers={mgrDealers}
        allDealers={dealers}
        dealerSales={dealerSales}
        reps={reps}
        selectedRepIds={selectedRepIds}
        setSelectedRepIds={setSelectedRepIds}
        selectedDealerIds={selectedDealerIds}
        setSelectedDealerIds={setSelectedDealerIds}
        onBack={handleBack}
      />
    );
  }

  // ── Manager detail (tiles) ──
  if (selectedManager) {
    const totalDealers = mgrDealers.length;

    // Compute YTD bookings from dealer_sales for this manager's dealers
    const mgrDealerIds = mgrDealers.map(d => d.id);
    const mgrSales = dealerSales.filter(s => mgrDealerIds.includes(s.dealer_id));
    const ytdBookingsActual = mgrSales.filter(s => s.year === 2026).reduce((s, r) => s + (r.bookings ?? r.revenue ?? 0), 0);
    const ytdBookingsGoal = managerReps.reduce((s, r) => s + (r.quota ?? 0), 0);
    const variancePct = ytdBookingsGoal > 0 ? ((ytdBookingsActual - ytdBookingsGoal) / ytdBookingsGoal) * 100 : 0;
    const variancePositive = variancePct >= 0;

    return (
      <div className="animate-fade-in">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={handleBack}>
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

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {/* Tile 1: Territories */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setDetailView("territories")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MapIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{mgrTerritoryIds.length}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Territories</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tile 2: Dealers */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setDetailView("dealers")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totalDealers}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Dealers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tile 3: YTD Bookings Actual */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setDetailView("ytd-bookings")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{formatCurrency(ytdBookingsActual)}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">YTD Bookings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tile 4: YTD Bookings Goal */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setDetailView("ytd-goal")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{formatCurrency(ytdBookingsGoal)}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">YTD Goal</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tile 5: Variance % */}
          <Card className="flex items-center">
            <CardContent className="pt-6 w-full">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${variancePositive ? "bg-green-500/10" : "bg-destructive/10"}`}>
                  {variancePositive
                    ? <TrendingUp className="h-5 w-5 text-green-600" />
                    : <TrendingDown className="h-5 w-5 text-destructive" />
                  }
                </div>
                <div>
                  <p className={`text-2xl font-semibold ${variancePositive ? "text-green-600" : "text-destructive"}`}>
                    {variancePositive ? "+" : ""}{variancePct.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Variance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Manager cards grid ──
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Sales Managers</h1>
         <p className="page-subtitle">{visibleManagers.length} managers</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {visibleManagers.map(mgr => {
          const mgrReps = managerRepsById.get(mgr.id) ?? [];
          const mgrRevenue = mgrReps.reduce((s, r) => s + (r.revenue ?? 0), 0);
          const mgrDealerCount = dealers.filter(d => mgrReps.some(r => r.id === d.rep_id)).length;
          const mgrTerCount = [...new Set(mgrReps.flatMap(r => repTerritories.filter(rt => rt.rep_id === r.id).map(rt => rt.territory_id)))].length;

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
        {visibleManagers.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-12 text-center">No managers found.</p>}
      </div>
    </div>
  );
}

// ── Dealer Report Sub-component ──────────────────────────────────

interface DealerReportProps {
  manager: { name: string };
  managerReps: DbSalesRep[];
  dealers: DbDealer[];
  allDealers: DbDealer[];
  dealerSales: DbDealerSale[];
  reps: DbSalesRep[];
  selectedRepIds: string[];
  setSelectedRepIds: (ids: string[]) => void;
  selectedDealerIds: string[];
  setSelectedDealerIds: (ids: string[]) => void;
  onBack: () => void;
}

function DealerReport({
  manager, managerReps, dealers, allDealers, dealerSales, reps,
  selectedRepIds, setSelectedRepIds,
  selectedDealerIds, setSelectedDealerIds,
  onBack,
}: DealerReportProps) {
  const [page, setPage] = useState(0);
  const pageSize = 10;

  // Filter dealers based on selected reps and/or selected dealers
  const filteredDealers = useMemo(() => {
    let result = dealers;
    if (selectedRepIds.length > 0) {
      result = result.filter(d => selectedRepIds.includes(d.rep_id ?? ""));
    }
    if (selectedDealerIds.length > 0) {
      result = result.filter(d => selectedDealerIds.includes(d.id));
    }
    return result;
  }, [dealers, selectedRepIds, selectedDealerIds]);

  // Build row data
  const rows = useMemo(() => {
    return filteredDealers.map(dealer => {
      const sales = dealerSales.filter(s => s.dealer_id === dealer.id);
      const rep = reps.find(r => r.id === dealer.rep_id);

      const bookings2025 = sales.filter(s => s.year === 2025).reduce((s, r) => s + ((r.bookings ?? 0) > 0 ? (r.bookings ?? 0) : (r.revenue ?? 0)), 0);
      const bookings2026 = sales.filter(s => s.year === 2026).reduce((s, r) => s + ((r.bookings ?? 0) > 0 ? (r.bookings ?? 0) : (r.revenue ?? 0)), 0);
      const invoices2025 = sales.filter(s => s.year === 2025).reduce((s, r) => s + ((r.invoices ?? 0) > 0 ? (r.invoices ?? 0) : (r.revenue ?? 0)), 0);
      const invoices2026 = sales.filter(s => s.year === 2026).reduce((s, r) => s + ((r.invoices ?? 0) > 0 ? (r.invoices ?? 0) : (r.revenue ?? 0)), 0);

      return {
        id: dealer.id,
        name: dealer.name,
        repCode: rep?.acctivate_id || rep?.name || "Unassigned",
        bookings2025,
        bookings2026,
        invoices2025,
        invoices2026,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredDealers, dealerSales, reps]);

  const totals = useMemo(() => ({
    bookings2025: rows.reduce((s, r) => s + r.bookings2025, 0),
    bookings2026: rows.reduce((s, r) => s + r.bookings2026, 0),
    invoices2025: rows.reduce((s, r) => s + r.invoices2025, 0),
    invoices2026: rows.reduce((s, r) => s + r.invoices2026, 0),
  }), [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginatedRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  const toggleRep = (id: string) => {
    setSelectedRepIds(
      selectedRepIds.includes(id) ? selectedRepIds.filter(x => x !== id) : [...selectedRepIds, id]
    );
    setPage(0);
  };
  const toggleDealer = (id: string) => {
    setSelectedDealerIds(
      selectedDealerIds.includes(id) ? selectedDealerIds.filter(x => x !== id) : [...selectedDealerIds, id]
    );
    setPage(0);
  };

  const hasFilters = selectedRepIds.length > 0 || selectedDealerIds.length > 0;

  const bookingsChange = totals.bookings2025 > 0
    ? ((totals.bookings2026 - totals.bookings2025) / totals.bookings2025) * 100
    : 0;
  const invoicesChange = totals.invoices2025 > 0
    ? ((totals.invoices2026 - totals.invoices2025) / totals.invoices2025) * 100
    : 0;

  return (
    <div className="animate-fade-in">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <div className="mb-6">
        <h1 className="text-xl font-semibold">{manager.name} — Dealer Report</h1>
        <p className="text-sm text-muted-foreground">{rows.length} dealers{hasFilters ? " (filtered)" : ""}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">2025 Bookings</p>
            <p className="text-xl font-bold">{formatCurrency(totals.bookings2025)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">YTD 2026 Bookings</p>
            <p className="text-xl font-bold">{formatCurrency(totals.bookings2026)}</p>
            <p className={`text-xs mt-1 ${bookingsChange >= 0 ? "text-green-600" : "text-destructive"}`}>
              {bookingsChange >= 0 ? "+" : ""}{bookingsChange.toFixed(1)}% vs 2025
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">2025 Invoices</p>
            <p className="text-xl font-bold">{formatCurrency(totals.invoices2025)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">YTD 2026 Invoices</p>
            <p className="text-xl font-bold">{formatCurrency(totals.invoices2026)}</p>
            <p className={`text-xs mt-1 ${invoicesChange >= 0 ? "text-green-600" : "text-destructive"}`}>
              {invoicesChange >= 0 ? "+" : ""}{invoicesChange.toFixed(1)}% vs 2025
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {(() => {
        const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

        // Bar chart: top 8 dealers by 2026 bookings
        const topDealers = [...rows].sort((a, b) => b.bookings2026 - a.bookings2026).slice(0, 8).map(r => ({
          name: r.name.length > 18 ? r.name.slice(0, 16) + "…" : r.name,
          "2025": r.bookings2025,
          "2026": r.bookings2026,
        }));

        // Pie chart: bookings by rep
        const repMap: globalThis.Map<string, number> = new globalThis.Map();
        rows.forEach(r => {
          const cur = repMap.get(r.repCode) || 0;
          repMap.set(r.repCode, cur + r.bookings2026);
        });
        const pieData = Array.from(repMap.entries())
          .map(([name, value]) => ({ name, value }))
          .filter(d => d.value > 0)
          .sort((a, b) => b.value - a.value);

        return (
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Dealers — Bookings Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topDealers} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="2025" fill="hsl(var(--muted-foreground) / 0.3)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="2026" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">YTD 2026 Bookings by Rep</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="h-3.5 w-3.5" />
              Reps {selectedRepIds.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{selectedRepIds.length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <ScrollArea className="max-h-64">
              {managerReps.map(r => (
                <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                  <Checkbox checked={selectedRepIds.includes(r.id)} onCheckedChange={() => toggleRep(r.id)} />
                  {r.name}
                </label>
              ))}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="h-3.5 w-3.5" />
              Dealers {selectedDealerIds.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{selectedDealerIds.length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <ScrollArea className="max-h-64">
              {dealers.sort((a, b) => a.name.localeCompare(b.name)).map(d => (
                <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                  <Checkbox checked={selectedDealerIds.includes(d.id)} onCheckedChange={() => toggleDealer(d.id)} />
                  <span className="truncate">{d.name}</span>
                </label>
              ))}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSelectedRepIds([]); setSelectedDealerIds([]); setPage(0); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="table-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Dealer Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Rep Code</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">2025 Bookings</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">YTD 2026 Bookings</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">2025 Invoices</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">YTD 2026 Invoices</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{row.name}</td>
                    <td className="p-3 text-muted-foreground">{row.repCode}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.bookings2025)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.bookings2026)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.invoices2025)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.invoices2026)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No dealers match the current filters.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-primary/5 font-semibold">
                    <td className="p-3">Totals</td>
                    <td className="p-3"></td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(totals.bookings2025)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(totals.bookings2026)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(totals.invoices2025)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(totals.invoices2026)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">{rows.length} dealers</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <Button
                    key={i}
                    variant={page === i ? "default" : "ghost"}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
