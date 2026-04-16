import { useState, useMemo } from "react";
import { Map, Store, ArrowLeft, Filter, X, DollarSign, Target, TrendingUp, TrendingDown, CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
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
  const mgrTerritoryIds = [...new Set(managerReps.flatMap(r => repTerritories.filter(rt => rt.rep_id === r.id).map(rt => rt.territory_id)))];
  const mgrDealers = dealers.filter(d => managerReps.some(r => r.id === d.rep_id));
  const mgrTravelLog = selectedManager ? travelLog.filter(tl => tl.manager_id === selectedManager.id) : [];

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
          {/* Territories Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Territories</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">State</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mgrTerritoryIds.map(tId => {
                      const ter = territories.find(t => t.id === tId);
                      if (!ter) return null;
                      return (
                        <tr key={tId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-medium">{ter.name}</td>
                          <td className="p-3">{ter.region || "—"}</td>
                          <td className="p-3">{ter.state || "—"}</td>
                          <td className="p-3 text-right">{formatCurrency(ter.revenue)}</td>
                        </tr>
                      );
                    })}
                    {mgrTerritoryIds.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No territories linked yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Reps Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sales Reps</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerReps.map(rep => (
                      <tr key={rep.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-medium">{rep.name}</td>
                        <td className="p-3">{rep.email || "—"}</td>
                        <td className="p-3">
                          <Badge variant={rep.status === "active" ? "default" : "secondary"}>{rep.status}</Badge>
                        </td>
                        <td className="p-3 text-right">{formatCurrency(rep.revenue)}</td>
                      </tr>
                    ))}
                    {managerReps.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No reps assigned.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Last Traveled Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Last Traveled</CardTitle>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", !travelDateFrom && "text-muted-foreground")}>
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {travelDateFrom ? format(travelDateFrom, "MMM d, yyyy") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" selected={travelDateFrom} onSelect={(d) => { setTravelDateFrom(d); setTravelPage(0); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", !travelDateTo && "text-muted-foreground")}>
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {travelDateTo ? format(travelDateTo, "MMM d, yyyy") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" selected={travelDateTo} onSelect={(d) => { setTravelDateTo(d); setTravelPage(0); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  {(travelDateFrom || travelDateTo) && (
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setTravelDateFrom(undefined); setTravelDateTo(undefined); setTravelPage(0); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                const filtered = mgrTravelLog.filter(t => {
                  if (travelDateFrom && new Date(t.travel_date) < travelDateFrom) return false;
                  if (travelDateTo && new Date(t.travel_date) > travelDateTo) return false;
                  return true;
                });
                const pageSize = 7;
                const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                const paginated = filtered.slice(travelPage * pageSize, (travelPage + 1) * pageSize);

                return (
                  <>
                    <div className="table-container">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left p-3 font-medium text-muted-foreground">Trip</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Salesperson</th>
                            <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map(trip => {
                            const tripName = trip.notes?.split(" — ")[0] || trip.notes || "Trip";
                            return (
                              <tr key={trip.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="p-3 font-medium">{tripName}</td>
                                <td className="p-3">
                                  <button
                                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                                    onClick={() => setSelectedTrip(trip)}
                                  >
                                    {new Date(trip.travel_date).toLocaleDateString()}
                                    {trip.travel_end_date ? ` – ${new Date(trip.travel_end_date).toLocaleDateString()}` : ""}
                                  </button>
                                </td>
                                <td className="p-3 text-sm">{trip.salesperson_name || "—"}</td>
                                <td className="p-3">
                                  {trip.approval_status ? (
                                    <Badge variant={trip.approval_status === "Approved" ? "default" : "secondary"}>{trip.approval_status}</Badge>
                                  ) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                          {filtered.length === 0 && (
                            <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No travel data for this date range.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={travelPage === 0} onClick={() => setTravelPage(p => p - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          {Array.from({ length: totalPages }, (_, i) => (
                            <Button
                              key={i}
                              variant={travelPage === i ? "default" : "ghost"}
                              size="sm"
                              className="h-7 w-7 p-0 text-xs"
                              onClick={() => setTravelPage(i)}
                            >
                              {i + 1}
                            </Button>
                          ))}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={travelPage >= totalPages - 1} onClick={() => setTravelPage(p => p + 1)}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
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
                  <Map className="h-5 w-5 text-primary" />
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
        <p className="page-subtitle">{managers.length} managers</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {managers.map(mgr => {
          const mgrReps = reps.filter(r => r.manager_id === mgr.id);
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
        {managers.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-12 text-center">No managers found.</p>}
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

      const bookings2025 = sales.filter(s => s.year === 2025).reduce((s, r) => s + (r.bookings ?? r.revenue ?? 0), 0);
      const bookings2026 = sales.filter(s => s.year === 2026).reduce((s, r) => s + (r.bookings ?? r.revenue ?? 0), 0);
      const invoices2025 = sales.filter(s => s.year === 2025).reduce((s, r) => s + (r.invoices ?? 0), 0);
      const invoices2026 = sales.filter(s => s.year === 2026).reduce((s, r) => s + (r.invoices ?? 0), 0);

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

  const toggleRep = (id: string) => {
    setSelectedRepIds(
      selectedRepIds.includes(id) ? selectedRepIds.filter(x => x !== id) : [...selectedRepIds, id]
    );
  };
  const toggleDealer = (id: string) => {
    setSelectedDealerIds(
      selectedDealerIds.includes(id) ? selectedDealerIds.filter(x => x !== id) : [...selectedDealerIds, id]
    );
  };

  const hasFilters = selectedRepIds.length > 0 || selectedDealerIds.length > 0;

  return (
    <div className="animate-fade-in">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">{manager.name} — Dealer Report</h1>
          <p className="text-sm text-muted-foreground">{rows.length} dealers{hasFilters ? " (filtered)" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Rep filter */}
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

          {/* Dealer filter */}
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
            <Button variant="ghost" size="sm" onClick={() => { setSelectedRepIds([]); setSelectedDealerIds([]); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

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
            {rows.map(row => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3 text-muted-foreground">{row.repCode}</td>
                <td className="p-3 text-right">{formatCurrency(row.bookings2025)}</td>
                <td className="p-3 text-right">{formatCurrency(row.bookings2026)}</td>
                <td className="p-3 text-right">{formatCurrency(row.invoices2025)}</td>
                <td className="p-3 text-right">{formatCurrency(row.invoices2026)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No dealers match the current filters.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-muted/20 font-semibold">
                <td className="p-3">Totals</td>
                <td className="p-3"></td>
                <td className="p-3 text-right">{formatCurrency(totals.bookings2025)}</td>
                <td className="p-3 text-right">{formatCurrency(totals.bookings2026)}</td>
                <td className="p-3 text-right">{formatCurrency(totals.invoices2025)}</td>
                <td className="p-3 text-right">{formatCurrency(totals.invoices2026)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
