import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCrmAccounts, useCrmReps, LIFECYCLE_STAGES } from "@/hooks/useCrm";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function CrmRepsPage() {
  const { data: accounts = [] } = useCrmAccounts();
  const { data: reps = [] } = useCrmReps();

  const byRep = useMemo(() => {
    return reps.map((r) => {
      const owned = accounts.filter((a) => a.assigned_rep_id === r.id);
      const byStage = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s.id, 0]));
      const states = new Set<string>();
      owned.forEach((a) => {
        byStage[a.lifecycle_stage]++;
        if (a.state) states.add(a.state);
      });
      return { rep: r, total: owned.length, byStage, states: Array.from(states).sort() };
    }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  }, [accounts, reps]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="CRM · Reps" title="Accounts by Rep" subtitle="Who owns which accounts across the pipeline." />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {byRep.map(({ rep, total, byStage, states }) => (
          <Card key={rep.id} className="border-border/60">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-serif text-lg leading-tight">{rep.name}</div>
                  {rep.email && <div className="text-[11px] text-muted-foreground truncate">{rep.email}</div>}
                </div>
                <Badge variant="secondary" className="tabular-nums">{total}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LIFECYCLE_STAGES.map((s) => byStage[s.id] > 0 && (
                  <Badge key={s.id} variant="outline" className={`text-[10px] border ${s.color}`}>
                    {s.label}: {byStage[s.id]}
                  </Badge>
                ))}
              </div>
              {states.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  Territories: <span className="text-foreground">{states.join(", ")}</span>
                </div>
              )}
              <Button asChild variant="ghost" size="sm" className="w-full justify-between -mx-1 mt-1">
                <Link to={`/crm/accounts?rep=${rep.id}`}>View accounts <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {byRep.length === 0 && <div className="text-sm text-muted-foreground">No rep assignments yet.</div>}
      </div>
    </div>
  );
}
