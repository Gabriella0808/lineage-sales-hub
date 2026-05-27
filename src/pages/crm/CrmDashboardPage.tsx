import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useCrmAccounts, useCrmReps, LIFECYCLE_STAGES } from "@/hooks/useCrm";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Building2, MapPin, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function CrmDashboardPage() {
  const { data: accounts = [], isLoading } = useCrmAccounts();
  const { data: reps = [] } = useCrmReps();

  const stats = useMemo(() => {
    const byStage = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s.id, 0]));
    const byRep: Record<string, number> = {};
    const byState: Record<string, number> = {};
    for (const a of accounts) {
      byStage[a.lifecycle_stage] = (byStage[a.lifecycle_stage] ?? 0) + 1;
      if (a.assigned_rep_id) byRep[a.assigned_rep_id] = (byRep[a.assigned_rep_id] ?? 0) + 1;
      if (a.state) byState[a.state] = (byState[a.state] ?? 0) + 1;
    }
    return { byStage, byRep, byState, total: accounts.length };
  }, [accounts]);

  const repName = (id: string) => reps.find((r) => r.id === id)?.name ?? "Unassigned";
  const recent = accounts.slice(0, 8);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="CRM"
        title="Account Pipeline"
        subtitle="Track every account from lead to dealer across the Lineage team."
        actions={
          <Button asChild>
            <Link to="/crm/accounts/new"><Plus className="h-4 w-4 mr-1.5" />New Account</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {LIFECYCLE_STAGES.map((s) => (
          <Card key={s.id} className="border-border/60">
            <CardContent className="pt-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{s.label}</div>
              <div className="text-3xl font-serif mt-1.5 text-foreground tabular-nums">{stats.byStage[s.id] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-accent" />Accounts by Rep</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats.byRep).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className="truncate">{repName(id)}</span>
                <Badge variant="secondary" className="tabular-nums">{n}</Badge>
              </div>
            ))}
            {Object.keys(stats.byRep).length === 0 && <div className="text-xs text-muted-foreground">No assignments yet.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" />Accounts by State</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats.byState).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([state, n]) => (
              <div key={state} className="flex items-center justify-between text-sm">
                <span>{state}</span>
                <Badge variant="secondary" className="tabular-nums">{n}</Badge>
              </div>
            ))}
            {Object.keys(stats.byState).length === 0 && <div className="text-xs text-muted-foreground">No accounts.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" />Recently Updated</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to="/crm/accounts">View all <ArrowUpRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
            {recent.map((a) => {
              const stage = LIFECYCLE_STAGES.find((s) => s.id === a.lifecycle_stage)!;
              return (
                <Link key={a.id} to={`/crm/accounts/${a.id}`} className="flex items-center justify-between gap-2 py-1.5 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.company_name}</div>
                    <div className="text-[11px] text-muted-foreground">{[a.city, a.state].filter(Boolean).join(", ")}</div>
                  </div>
                  <Badge className={`text-[10px] ${stage.color} border`} variant="outline">{stage.label}</Badge>
                </Link>
              );
            })}
            {!isLoading && recent.length === 0 && <div className="text-xs text-muted-foreground">No accounts yet.</div>}
          </CardContent>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            Total accounts: <span className="font-medium text-foreground tabular-nums">{stats.total}</span>
            {recent[0] && <> · Last updated {formatDistanceToNow(new Date(recent[0].updated_at), { addSuffix: true })}</>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
