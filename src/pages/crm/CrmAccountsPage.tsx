import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCrmAccounts, useCrmReps, useUpdateAccount, ACCOUNT_TYPES, BRANDS, BRAND_COLORS, type AccountType, type Brand } from "@/hooks/useCrm";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, ArrowLeft } from "lucide-react";

export default function CrmAccountsPage() {
  const nav = useNavigate();
  const { data: accounts = [], isLoading } = useCrmAccounts();
  const { data: reps = [] } = useCrmReps();
  const update = useUpdateAccount();

  const [searchParams, setSearchParams] = useSearchParams();
  const repParam = searchParams.get("rep") ?? "all";
  const stageParam = searchParams.get("stage") ?? "all";
  const brandParam = searchParams.get("brand") ?? "all";
  const [q, setQ] = useState("");
  const repFilter = repParam;
  const setRepFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("rep"); else next.set("rep", v);
    setSearchParams(next, { replace: true });
  };
  const stageFilter = stageParam;
  const setStageFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("stage"); else next.set("stage", v);
    setSearchParams(next, { replace: true });
  };
  const brandFilter = brandParam;
  const setBrandFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("brand"); else next.set("brand", v);
    setSearchParams(next, { replace: true });
  };
  const [stateFilter, setStateFilter] = useState<string>("all");

  const states = useMemo(() => Array.from(new Set(accounts.map((a) => a.state).filter(Boolean))).sort() as string[], [accounts]);
  const repName = (id: string | null) => (id ? reps.find((r) => r.id === id)?.name ?? "—" : "Unassigned");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      // Accounts section shows prospects only — dealers live in Field Check-ins
      if ((a.account_type ?? "prospect") !== "prospect") return false;
      if (repFilter !== "all" && a.assigned_rep_id !== repFilter) return false;
      if (brandFilter !== "all" && a.brand !== brandFilter) return false;
      if (stateFilter !== "all" && a.state !== stateFilter) return false;
      if (!needle) return true;
      const hay = `${a.company_name} ${a.contact_first_name ?? ""} ${a.contact_last_name ?? ""} ${a.city ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [accounts, q, repFilter, brandFilter, stateFilter]);

  const [convertTarget, setConvertTarget] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const confirmConvert = () => {
    if (!convertTarget) return;
    update.mutate(
      { id: convertTarget.id, patch: { account_type: "dealer" as AccountType } },
      {
        onSuccess: () => toast({ title: "Converted to dealer", description: `${convertTarget.name} now appears on the Field Check-ins map.` }),
        onError: (e: any) => toast({ title: "Conversion failed", description: e.message, variant: "destructive" }),
      },
    );
    setConvertTarget(null);
  };

  const cameFromDashboard = stageParam !== "all" || brandParam !== "all";

  return (
    <div className="space-y-6">
      {cameFromDashboard && (
        <Button variant="ghost" size="sm" asChild className="-mb-2">
          <Link to="/crm"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Overview</Link>
        </Button>
      )}
      <PageHeader
        eyebrow="CRM · Accounts"
        title="All Accounts"
        subtitle={`${filtered.length} of ${accounts.length} accounts`}
        actions={
          <Button asChild>
            <Link to="/crm/accounts/new"><Plus className="h-4 w-4 mr-1.5" />New Account</Link>
          </Button>
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
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {LIFECYCLE_STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
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
        <div className="overflow-auto max-h-[calc(100vh-240px)]">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium bg-muted">Company</th>
                <th className="text-left px-3 py-2.5 font-medium bg-muted">Brand</th>
                <th className="text-left px-3 py-2.5 font-medium bg-muted">Contact</th>
                <th className="text-left px-3 py-2.5 font-medium bg-muted">Rep</th>
                <th className="text-left px-3 py-2.5 font-medium bg-muted">City / State</th>
                <th className="text-left px-3 py-2.5 font-medium bg-muted">Phone</th>
                <th className="text-left px-3 py-2.5 font-medium bg-muted w-44">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No accounts match your filters.</td></tr>}
              {filtered.map((a) => {
                const stage = LIFECYCLE_STAGES.find((s) => s.id === a.lifecycle_stage)!;
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => nav(`/crm/accounts/${a.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <Link to={`/crm/accounts/${a.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground hover:text-accent">{a.company_name}</Link>
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select value={a.brand} onValueChange={(v) => update.mutate({ id: a.id, patch: { brand: v as Brand } })}>
                        <SelectTrigger className="h-7 text-xs border-0 bg-muted/60 hover:bg-muted px-2 py-0 w-fit min-w-[120px]">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${BRAND_COLORS[a.brand] ?? ""}`} />
                            {a.brand}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{[a.contact_first_name, a.contact_last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{repName(a.assigned_rep_id)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{[a.city, a.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{a.main_phone || "—"}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select value={a.lifecycle_stage} onValueChange={(v) => update.mutate({ id: a.id, patch: { lifecycle_stage: v as LifecycleStage } })}>
                        <SelectTrigger className="h-7 text-xs border-0 bg-muted/60 hover:bg-muted px-2 py-0 w-fit min-w-[120px]">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                            {stage.label}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {LIFECYCLE_STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
