import { useMemo, useState, useDeferredValue, useEffect, useRef } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

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
  const accountTypeParam = searchParams.get("atype") ?? "all";

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
  const accountTypeFilter = accountTypeParam;
  const setAccountTypeFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("atype"); else next.set("atype", v);
    setSearchParams(next, { replace: true });
  };
  const [stateFilter, setStateFilter] = useState<string>("all");

  // Last contacted = most recent note per account
  const { data: lastContactedMap = new Map<string, string>() } = useQuery({
    queryKey: ["crm_last_contacted_map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_account_notes")
        .select("account_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (!map.has(row.account_id)) map.set(row.account_id, row.created_at);
      }
      return map;
    },
    staleTime: 60_000,
  });

  const fmtDate = (s?: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };


  const states = useMemo(() => Array.from(new Set(accounts.map((a) => a.state).filter(Boolean))).sort() as string[], [accounts]);
  const repMap = useMemo(() => new Map(reps.map((r) => [r.id, r])), [reps]);
  const managerMap = useMemo(() => new Map(managers.map((m) => [m.id, m])), [managers]);
  const repName = (id: string | null) => (id ? repMap.get(id)?.name ?? "—" : "Unassigned");
  const managerName = (id: string | null) => (id ? managerMap.get(id)?.name ?? "—" : "Unassigned");

  // Normalize text for forgiving search: lowercase, fold curly quotes to straight,
  // and strip punctuation/whitespace so "Wright's Furniture", "wrights furniture",
  // and "Wright’s  Furniture." all match.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
      .replace(/[^a-z0-9]+/g, "");

  // Pre-compute per-account search haystack and resolved brand/type arrays
  // once per accounts change so the filter loop is just cheap comparisons.
  const indexed = useMemo(() => {
    return accounts.map((a) => {
      const accBrands = (a.brands && a.brands.length > 0) ? a.brands : (a.brand ? [a.brand] : []);
      const accTypes = (a.prospect_types && a.prospect_types.length > 0) ? a.prospect_types : (a.prospect_type ? [a.prospect_type] : []);
      const hay = norm(`${a.company_name} ${a.contact_first_name ?? ""} ${a.contact_last_name ?? ""} ${a.city ?? ""} ${a.state ?? ""}`);
      return { a, accBrands: accBrands as string[], accTypes: accTypes as string[], hay };
    });
  }, [accounts]);

  // Debounce search input so each keystroke doesn't re-render 3k rows synchronously.
  const deferredQ = useDeferredValue(q);
  const needle = useMemo(() => norm(deferredQ), [deferredQ]);
  const brandSet = useMemo(() => new Set(brandFilters), [brandFilters.join(",")]);
  const ptypeRegularSet = useMemo(() => new Set(prospectTypeFilters.filter((t) => t !== "__none__")), [prospectTypeFilters.join(",")]);
  const ptypeHasNone = prospectTypeFilters.includes("__none__");

  const filtered = useMemo(() => {
    const out: typeof accounts = [];
    for (let i = 0; i < indexed.length; i++) {
      const { a, accBrands, accTypes, hay } = indexed[i];
      if (repFilter !== "all" && a.assigned_rep_id !== repFilter) continue;
      if (managerFilter !== "all" && a.assigned_manager_id !== managerFilter) continue;
      if (brandSet.size > 0) {
        let ok = false;
        for (const b of accBrands) { if (brandSet.has(b)) { ok = true; break; } }
        if (!ok) continue;
      }
      if (ptypeRegularSet.size > 0 || ptypeHasNone) {
        let hasRegular = false;
        if (ptypeRegularSet.size > 0) {
          for (const t of accTypes) { if (ptypeRegularSet.has(t)) { hasRegular = true; break; } }
        }
        const hasEmpty = ptypeHasNone && accTypes.length === 0;
        if (!hasRegular && !hasEmpty) continue;
      }
      if (stateFilter !== "all" && a.state !== stateFilter) continue;
      if (accountTypeFilter !== "all" && (a.account_type ?? "prospect") !== accountTypeFilter) continue;
      if (needle && !hay.includes(needle)) continue;
      out.push(a);
    }
    return out;
  }, [indexed, needle, repFilter, managerFilter, brandSet, ptypeRegularSet, ptypeHasNone, stateFilter, accountTypeFilter]);

  // Incremental render: only mount a slice of rows, grow on scroll near bottom.
  const PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [needle, repFilter, managerFilter, brandFilters.join(","), prospectTypeFilters.join(","), stateFilter, accountTypeFilter]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400 && visibleCount < filtered.length) {
      setVisibleCount((c) => Math.min(c + PAGE, filtered.length));
    }
  };


  const [convertTarget, setConvertTarget] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const confirmConvert = () => {
    if (!convertTarget) return;
    const target = convertTarget;
    update.mutate(
      { id: target.id, patch: { account_type: "dealer" as AccountType } },
      {
        onSuccess: async () => {
          toast({ title: "Converted to dealer", description: `${target.name} was added to the Field Check-ins map and will show as never visited until a check-in is logged.` });
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
              .filter((m) => ["Will", "Mateo", "Kate", "Chris De Lisa", "Justin Jeangerard"].includes(m.name))
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
        <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All account types</SelectItem>
            {ACCOUNT_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div ref={scrollRef} onScroll={onScroll} className="overflow-x-hidden overflow-y-auto max-h-[calc(100vh-240px)]">
          <table className="w-full text-xs table-fixed">
            <thead className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium bg-muted w-[16%]">Company</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[11%]">Brand</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[11%]">Contact</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[9%]">Rep</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[9%]">Manager</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[10%]">Date Added</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[11%]">Last Contacted</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[10%]">Account Type</th>
                <th className="text-left px-2 py-2.5 font-medium bg-muted w-[13%]">Prospect Type</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No prospects match your filters.</td></tr>}
              {visibleRows.map((a) => {
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
                    <td className="px-2 py-2.5 text-muted-foreground tabular-nums truncate">{fmtDate(a.created_at)}</td>
                    <td className="px-2 py-2.5 text-muted-foreground tabular-nums truncate">{fmtDate(lastContactedMap.get(a.id))}</td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={a.account_type ?? "prospect"}
                        onValueChange={(v) => {
                          if (v === "dealer") setConvertTarget({ id: a.id, name: a.company_name });
                          else update.mutate({ id: a.id, patch: { account_type: v as AccountType } });
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
              This will mark the account as a dealer and add them to the Field Check-ins map. They will remain in the prospects list and show as never visited until someone logs a check-in.
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
