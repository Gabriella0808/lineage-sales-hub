import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCrmAccounts, useCrmReps, useCrmManagers, useUpdateAccount, useProspectTypes, ACCOUNT_TYPES, BRANDS, BRAND_COLORS, type AccountType, type Brand } from "@/hooks/useCrm";
import { ProspectTypeSelect } from "@/components/ProspectTypeSelect";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, ArrowLeft, ChevronDown } from "lucide-react";
import { ImportAccountsDialog } from "@/components/ImportAccountsDialog";

export default function CrmAccountsPage() {
  const nav = useNavigate();
  const { data: accounts = [], isLoading } = useCrmAccounts();
  const { data: reps = [] } = useCrmReps();
  const { data: managers = [] } = useCrmManagers();
  const { data: prospectTypes = [] } = useProspectTypes();
  const update = useUpdateAccount();

  const [searchParams, setSearchParams] = useSearchParams();
  const repParam = searchParams.get("rep") ?? "all";
  const managerParam = searchParams.get("manager") ?? "all";
  const stageParam = searchParams.get("stage") ?? "all";
  const brandParam = searchParams.get("brand") ?? "all";
  const prospectTypeParam = searchParams.get("ptype") ?? "all";
  const [q, setQ] = useState("");
  const repFilter = repParam;
  const setRepFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("rep"); else next.set("rep", v);
    setSearchParams(next, { replace: true });
  };
  const managerFilter = managerParam;
  const setManagerFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("manager"); else next.set("manager", v);
    setSearchParams(next, { replace: true });
  };
  const stageFilter = stageParam;
  const setStageFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("stage"); else next.set("stage", v);
    setSearchParams(next, { replace: true });
  };
  const brandFilters = brandParam === "all" || brandParam === "" ? [] : brandParam.split(",").filter(Boolean);
  const toggleBrand = (b: string) => {
    const set = new Set(brandFilters);
    if (set.has(b)) set.delete(b); else set.add(b);
    const next = new URLSearchParams(searchParams);
    if (set.size === 0) next.delete("brand"); else next.set("brand", Array.from(set).join(","));
    setSearchParams(next, { replace: true });
  };
  const clearBrands = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("brand");
    setSearchParams(next, { replace: true });
  };
  const prospectTypeFilters = prospectTypeParam === "all" || prospectTypeParam === "" ? [] : prospectTypeParam.split(",").filter(Boolean);
  const setProspectTypeFilters = (vs: string[]) => {
    const next = new URLSearchParams(searchParams);
    if (vs.length === 0) next.delete("ptype"); else next.set("ptype", vs.join(","));
    setSearchParams(next, { replace: true });
  };
  const [stateFilter, setStateFilter] = useState<string>("all");

  const states = useMemo(() => Array.from(new Set(accounts.map((a) => a.state).filter(Boolean))).sort() as string[], [accounts]);
  const repName = (id: string | null) => (id ? reps.find((r) => r.id === id)?.name ?? "—" : "Unassigned");
  const managerName = (id: string | null) => (id ? managers.find((m) => m.id === id)?.name ?? "—" : "Unassigned");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      // Prospects section shows all prospects, including those converted to dealers
      // (converted dealers also appear on the Field Check-ins map)
      if (repFilter !== "all" && a.assigned_rep_id !== repFilter) return false;
      if (managerFilter !== "all" && a.assigned_manager_id !== managerFilter) return false;
      if (brandFilters.length > 0) {
        const accBrands = (a.brands && a.brands.length > 0) ? a.brands : (a.brand ? [a.brand] : []);
        if (!accBrands.some((b) => brandFilters.includes(b as string))) return false;
      }
      if (prospectTypeFilters.length > 0) {
        const accTypes = (a.prospect_types && a.prospect_types.length > 0) ? a.prospect_types : (a.prospect_type ? [a.prospect_type] : []);
        if (!accTypes.some((t) => prospectTypeFilters.includes(t))) return false;
      }
      if (stateFilter !== "all" && a.state !== stateFilter) return false;
      if (!needle) return true;
      const hay = `${a.company_name} ${a.contact_first_name ?? ""} ${a.contact_last_name ?? ""} ${a.city ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [accounts, q, repFilter, managerFilter, brandFilters, prospectTypeFilters, stateFilter]);

  const [convertTarget, setConvertTarget] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const confirmConvert = () => {
    if (!convertTarget) return;
    const target = convertTarget;
    update.mutate(
      { id: target.id, patch: { account_type: "dealer" as AccountType } },
      {
        onSuccess: async () => {
          toast({ title: "Converted to dealer", description: `${target.name} now appears on the Field Check-ins map and remains in Prospects.` });
          // Geocode the newly created dealer so it shows up as a pin on the map
          try {
            const { data: dealerRow } = await supabase
              .from("dealers")
              .select("id, lat")
              .eq("crm_account_id", target.id)
              .maybeSingle();
            if (dealerRow?.id && dealerRow.lat == null) {
              await supabase.functions.invoke("geocode-dealer", { body: { dealer_id: dealerRow.id } });
            }
          } catch (err) {
            console.warn("geocode-dealer failed", err);
          }
        },
        onError: (e: any) => toast({ title: "Conversion failed", description: e.message, variant: "destructive" }),
      },
    );
    setConvertTarget(null);
  };

  const cameFromDashboard = stageParam !== "all" || brandParam !== "all" || managerParam !== "all";

  return (
    <div className="space-y-6">
      {cameFromDashboard && (
        <Button variant="ghost" size="sm" asChild className="-mb-2">
          <Link to="/crm"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Overview</Link>
        </Button>
      )}
      <PageHeader
        eyebrow="CRM · Prospects"
        title="All Prospects"
        subtitle={`${filtered.length} of ${accounts.length} prospects`}
        actions={
          <div className="flex items-center gap-2">
            <ImportAccountsDialog />
            <Button asChild>
              <Link to="/crm/accounts/new"><Plus className="h-4 w-4 mr-1.5" />New Prospect</Link>
            </Button>
          </div>
        }
      />

      <Card className="p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, contact, city…" className="pl-9" />
        </div>
        <Select value={repFilter} onValueChange={setRepFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reps</SelectItem>
            {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={managerFilter} onValueChange={setManagerFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All managers</SelectItem>
            {managers
              .filter((m) => ["Will", "Mateo", "Kate"].includes(m.name))
              .map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-44 justify-between font-normal">
              <span className="truncate">
                {brandFilters.length === 0
                  ? "All brands"
                  : brandFilters.length === 1
                    ? brandFilters[0]
                    : `${brandFilters.length} brands`}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuCheckboxItem
              checked={brandFilters.length === 0}
              onCheckedChange={() => clearBrands()}
              onSelect={(e) => e.preventDefault()}
            >
              All brands
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {BRANDS.map((b) => (
              <DropdownMenuCheckboxItem
                key={b}
                checked={brandFilters.includes(b)}
                onCheckedChange={() => toggleBrand(b)}
                onSelect={(e) => e.preventDefault()}
              >
                {b}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <ProspectTypeSelect
          multi
          values={prospectTypeFilters}
          onChangeMulti={setProspectTypeFilters}
          showAllOption
          allLabel="All prospect types"
          triggerClassName="w-full sm:w-52"
        />
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-hidden overflow-y-auto max-h-[calc(100vh-240px)]">
          <table className="w-full text-xs table-fixed">
            <thead className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium bg-muted w-[16%]">Company</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[11%]">Brand</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[11%]">Contact</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[9%]">Rep</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[9%]">Manager</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[12%]">City / State</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[9%]">Phone</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[10%]">Account Type</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[13%]">Prospect Type</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No prospects match your filters.</td></tr>}
              {filtered.map((a) => {
                const type = ACCOUNT_TYPES.find((s) => s.id === (a.account_type ?? "prospect"))!;
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => nav(`/crm/accounts/${a.id}`)}
                  >
                    <td className="px-3 py-2.5">
                      <Link to={`/crm/accounts/${a.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground hover:text-accent truncate block">{a.company_name}</Link>
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const rowBrands: Brand[] = (a.brands && a.brands.length > 0)
                          ? (a.brands as Brand[])
                          : (a.brand ? [a.brand as Brand] : []);
                        const label = rowBrands.length === 0
                          ? "—"
                          : rowBrands.length === BRANDS.length
                            ? "All brands"
                            : rowBrands.length === 1
                              ? rowBrands[0]
                              : `${rowBrands.length} brands`;
                        const dotClass = rowBrands.length === 1 ? (BRAND_COLORS[rowBrands[0]] ?? "") : "bg-muted-foreground/40";
                        const toggle = (b: Brand) => {
                          const set = new Set(rowBrands);
                          if (set.has(b)) set.delete(b); else set.add(b);
                          const next = Array.from(set);
                          update.mutate({ id: a.id, patch: { brands: next, brand: next[0] ?? a.brand } as any });
                        };
                        const selectAll = () => {
                          update.mutate({ id: a.id, patch: { brands: [...BRANDS], brand: BRANDS[0] } as any });
                        };
                        return (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-7 text-[11px] bg-muted/60 hover:bg-muted px-1.5 py-0 rounded-md w-full min-w-0 inline-flex items-center gap-1.5 text-muted-foreground font-medium">
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                                <span className="truncate flex-1 text-left">{label}</span>
                                <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                              <DropdownMenuCheckboxItem
                                checked={rowBrands.length === BRANDS.length}
                                onCheckedChange={selectAll}
                                onSelect={(e) => e.preventDefault()}
                              >
                                All brands
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuSeparator />
                              {BRANDS.map((b) => (
                                <DropdownMenuCheckboxItem
                                  key={b}
                                  checked={rowBrands.includes(b)}
                                  onCheckedChange={() => toggle(b)}
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  {b}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground truncate">{[a.contact_first_name, a.contact_last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={a.assigned_rep_id ?? "unassigned"}
                        onValueChange={(v) => {
                          const repId = v === "unassigned" ? null : v;
                          const rep = repId ? reps.find((r) => r.id === repId) : null;
                          const managerId = rep?.manager_id ?? null;
                          update.mutate({ id: a.id, patch: { assigned_rep_id: repId, assigned_manager_id: managerId } });
                        }}
                      >
                        <SelectTrigger className="h-7 text-[11px] border-0 bg-muted/60 hover:bg-muted px-1.5 py-0 w-full min-w-0 focus:ring-0 focus-visible:ring-0 focus:ring-offset-0">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground truncate">
                            <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                            <span className="truncate">{repName(a.assigned_rep_id)}</span>
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {reps.map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={a.assigned_manager_id ?? "unassigned"}
                        onValueChange={(v) => {
                          update.mutate({ id: a.id, patch: { assigned_manager_id: v === "unassigned" ? null : v } });
                        }}
                      >
                        <SelectTrigger className="h-7 text-[11px] border-0 bg-muted/60 hover:bg-muted px-1.5 py-0 w-full min-w-0 focus:ring-0 focus-visible:ring-0 focus:ring-offset-0">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground truncate">
                            <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                            <span className="truncate">{managerName(a.assigned_manager_id)}</span>
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {managers
                            .filter((m) => ["Will", "Mateo", "Kate"].includes(m.name))
                            .map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground truncate">{[a.city, a.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-2 py-2.5 text-muted-foreground tabular-nums truncate">{a.main_phone || "—"}</td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={a.account_type ?? "prospect"}
                        onValueChange={(v) => {
                          if (v === "dealer") setConvertTarget({ id: a.id, name: a.company_name });
                        }}
                      >
                        <SelectTrigger className="h-7 text-[11px] border-0 bg-muted/60 hover:bg-muted px-1.5 py-0 w-full min-w-0 focus:ring-0 focus-visible:ring-0 focus:ring-offset-0">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground truncate">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${type.dot}`} />
                            <span className="truncate">{type.label}</span>
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {ACCOUNT_TYPES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const rowTypes: string[] = (a.prospect_types && a.prospect_types.length > 0)
                          ? a.prospect_types
                          : (a.prospect_type ? [a.prospect_type] : []);
                        return (
                          <ProspectTypeSelect
                            multi
                            compact
                            values={rowTypes}
                            onChangeMulti={(vs) => update.mutate({ id: a.id, patch: { prospect_types: vs, prospect_type: vs[0] ?? null } as any })}
                          />
                        );
                      })()}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert {convertTarget?.name} to a dealer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the account as a dealer and add them to the Field Check-ins map with a "Converted from CRM" check-in. They will remain in the prospects list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConvert}>Convert to dealer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
