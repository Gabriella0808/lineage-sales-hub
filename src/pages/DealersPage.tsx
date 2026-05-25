import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, ExternalLink } from "lucide-react";
import { FilterBar } from "@/components/FilterBar";
import { StatusBadge } from "@/components/StatusBadge";
import { useSalesReps, useTerritories, useDealers, useManagers, formatCurrency, getRepName, getTerritoryName } from "@/hooks/usePortalData";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteToTask } from "@/components/NoteToTask";

async function fetchDealerIdsWithCheckIns(): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("dealer_check_ins")
      .select("dealer_id")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data ?? [];
    rows.forEach((row) => row.dealer_id && ids.add(row.dealer_id));
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

export default function DealersPage() {
  const { data: roleInfo } = useUserRole();
  const isRep = roleInfo?.isRep ?? false;
  const myRepId = roleInfo?.repId ?? null;

  const { data: reps = [] } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: managers = [] } = useManagers();
  const { data: dealers = [], isLoading } = useDealers();
  const { data: dealerIdsWithCheckIns = new Set<string>() } = useQuery({
    queryKey: ["dealer_check_in_dealer_ids"],
    queryFn: fetchDealerIdsWithCheckIns,
  });

  const currentYear = new Date().getFullYear();
  const { data: ytdRevenueByDealer = new Map<string, number>() } = useQuery({
    queryKey: ["dealer_ytd_revenue", currentYear],
    queryFn: async () => {
      const map = new Map<string, number>();
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("dealer_sales")
          .select("dealer_id,revenue")
          .eq("year", currentYear)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data ?? [];
        rows.forEach((r: any) => {
          if (!r.dealer_id) return;
          map.set(r.dealer_id, (map.get(r.dealer_id) ?? 0) + Number(r.revenue ?? 0));
        });
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return map;
    },
  });
  const getYtd = (id: string) => ytdRevenueByDealer.get(id) ?? 0;

  const [search, setSearch] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const visibleDealers = useMemo(() => dealers.filter(d => {
    // Hide field-only imports — they exist solely for Field Check-ins
    if ((d as any).source === 'field_only') return false;
    // Only show commercially-active Acctivate dealers (real salesperson or territory assignment).
    // Lead-style records without these stay in the DB for Field Check-ins but are hidden here.
    const salesperson = ((d as any).salesperson ?? '').trim();
    const territory = ((d as any).territory ?? '').trim();
    return Boolean(salesperson || territory);
  }), [dealers]);

  const filtered = useMemo(() => visibleDealers.filter(d => {
    if (isRep && myRepId && d.rep_id !== myRepId) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (territoryFilter !== "all" && d.territory_id !== territoryFilter) return false;
    if (!isRep && repFilter !== "all" && d.rep_id !== repFilter) return false;
    if (managerFilter !== "all" && (d as any).manager_id !== managerFilter) return false;
    return true;
  }), [visibleDealers, isRep, myRepId, search, territoryFilter, repFilter, managerFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [search, territoryFilter, repFilter, managerFilter]);
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const dealer = visibleDealers.find(d => d.id === selected);

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Dealers</h1>
        <p className="page-subtitle">
          {isRep
            ? `${filtered.length} assigned dealer${filtered.length === 1 ? "" : "s"}`
            : `${visibleDealers.length} dealers synced from Acctivate`}
        </p>
      </div>

      <FilterBar
        searchPlaceholder="Search dealers..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          { label: "Territory", value: territoryFilter, onChange: setTerritoryFilter, options: territories.map(t => ({ label: t.name, value: t.id })) },
          ...(isRep ? [] : [{ label: "Rep", value: repFilter, onChange: setRepFilter, options: reps.map(r => ({ label: r.name, value: r.id })) }]),
          { label: "Manager", value: managerFilter, onChange: setManagerFilter, options: managers.map(m => ({ label: m.name, value: m.id })) },
        ]}
      />

      {/* Mobile card list */}
      <div className="lg:hidden space-y-2">
        {paged.map(d => (
          <button
            key={d.id}
            onClick={() => setSelected(d.id)}
            className="w-full text-left glass-card p-3 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="font-medium text-sm leading-tight">{d.name}</p>
              <StatusBadge status={d.status} />
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {d.city || ''}{d.city && d.state ? ', ' : ''}{d.state || ''}
              {!d.city && !d.state && '—'}
            </p>
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="bg-muted px-2 py-0.5 rounded-full truncate">{getTerritoryName(territories, d.territory_id) || (d as any).territory || '—'}</span>
                <span className="text-muted-foreground truncate">{getRepName(reps, d.rep_id) || (d as any).salesperson || '—'}</span>
              </div>
              <span className="font-medium tabular-nums shrink-0">{formatCurrency(d.revenue)}</span>
            </div>
            <div className="flex items-center gap-1 mt-2 pt-2 border-t" onClick={e => e.stopPropagation()}>
              {d.email && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { window.location.href = `mailto:${d.email}`; }}><Mail className="h-3.5 w-3.5" /></Button>}
              {d.phone && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { window.location.href = `tel:${d.phone}`; }}><Phone className="h-3.5 w-3.5" /></Button>}
              <span className="ml-auto text-[11px] text-muted-foreground">Tap for details</span>
            </div>
          </button>
        ))}
        <PaginationBar page={currentPage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No dealers match your filters.</p>}
      </div>

      {/* Desktop / tablet table */}
      <div className="table-container hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium text-muted-foreground">Dealer</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Location</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Territory</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Rep</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Engagement</th>
              <th className="text-right p-3 font-medium text-muted-foreground hidden lg:table-cell">Revenue</th>
              <th className="text-center p-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(d => (
              <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelected(d.id)}>
                <td className="p-3 font-medium">{d.name}</td>
                <td className="p-3 text-muted-foreground">{d.city || ''}{d.city && d.state ? ', ' : ''}{d.state || ''}</td>
                <td className="p-3 hidden lg:table-cell">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {getTerritoryName(territories, d.territory_id) || (d as any).territory || '—'}
                  </span>
                </td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground">
                  {getRepName(reps, d.rep_id) || (d as any).salesperson || '—'}
                </td>
                <td className="p-3"><StatusBadge status={d.status} /></td>
                <td className="p-3"><StatusBadge status={d.engagement ?? 'medium'} /></td>
                <td className="p-3 text-right hidden lg:table-cell font-medium">{formatCurrency(d.revenue)}</td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    {d.email && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); window.location.href = `mailto:${d.email}`; }}><Mail className="h-3.5 w-3.5" /></Button>}
                    {d.phone && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); window.location.href = `tel:${d.phone}`; }}><Phone className="h-3.5 w-3.5" /></Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar page={currentPage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No dealers match your filters.</p>}
      </div>

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {dealer && (
            <>
              <SheetHeader>
                <SheetTitle>{dealer.name}</SheetTitle>
                <p className="text-xs text-muted-foreground">{dealer.city || ''}{dealer.city && dealer.state ? ', ' : ''}{dealer.state || ''}</p>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-3">
                  <StatusBadge status={dealer.status} />
                  <StatusBadge status={dealer.engagement ?? 'medium'} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="stat-card"><p className="text-[11px] text-muted-foreground uppercase">Revenue</p><p className="text-lg font-semibold">{formatCurrency(dealer.revenue)}</p></div>
                  <div className="stat-card"><p className="text-[11px] text-muted-foreground uppercase">Last Contact</p><p className="text-lg font-semibold">{dealer.last_contact ? new Date(dealer.last_contact).toLocaleDateString() : '—'}</p></div>
                </div>

                <div className="space-y-3">
                  <div><p className="text-[11px] text-muted-foreground uppercase mb-1">Territory</p><p className="text-sm">{getTerritoryName(territories, dealer.territory_id) || (dealer as any).territory || '—'}</p></div>
                  <div><p className="text-[11px] text-muted-foreground uppercase mb-1">Salesperson</p><p className="text-sm">{getRepName(reps, dealer.rep_id) || (dealer as any).salesperson || '—'}</p></div>
                  <div><p className="text-[11px] text-muted-foreground uppercase mb-1">Sales Manager</p><p className="text-sm">{(dealer as any).sales_manager || '—'}</p></div>
                  {dealer.phone && <div><p className="text-[11px] text-muted-foreground uppercase mb-1">Phone</p><p className="text-sm">{dealer.phone}</p></div>}
                  {dealer.email && <div><p className="text-[11px] text-muted-foreground uppercase mb-1">Email</p><p className="text-sm">{dealer.email}</p></div>}
                  {dealer.website && <div><p className="text-[11px] text-muted-foreground uppercase mb-1">Website</p>
                    <a href={dealer.website.startsWith('http') ? dealer.website : `https://${dealer.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline flex items-center gap-1">{dealer.website} <ExternalLink className="h-3 w-3" /></a>
                  </div>}
                </div>

                <div className="flex gap-2">
                  {dealer.email && <Button size="sm" variant="outline" onClick={() => window.location.href = `mailto:${dealer.email}`}><Mail className="h-3.5 w-3.5 mr-2" /> Email</Button>}
                  {dealer.phone && <Button size="sm" variant="outline" onClick={() => window.location.href = `tel:${dealer.phone}`}><Phone className="h-3.5 w-3.5 mr-2" /> Call</Button>}
                  {dealer.website && <Button size="sm" variant="outline" onClick={() => window.open(dealer.website!.startsWith('http') ? dealer.website! : `https://${dealer.website}`, '_blank')}><ExternalLink className="h-3.5 w-3.5 mr-2" /> Website</Button>}
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Notes</h4>
                  <NoteToTask refType="dealer" refName={dealer.name} refId={dealer.id} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PaginationBar({ page, totalPages, total, pageSize, onPageChange }: {
  page: number; totalPages: number; total: number; pageSize: number; onPageChange: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: (number | "…")[] = [];
  const add = (n: number | "…") => pages.push(n);
  const window = 1;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) add(i);
    else if (pages[pages.length - 1] !== "…") add("…");
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 px-1">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium">{from}–{to}</span> of <span className="font-medium">{total}</span> dealers
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1 flex-wrap justify-center">
          <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
          {pages.map((p, i) => p === "…" ? (
            <span key={`e${i}`} className="px-2 text-muted-foreground text-sm">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className="h-8 min-w-8 px-2"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
