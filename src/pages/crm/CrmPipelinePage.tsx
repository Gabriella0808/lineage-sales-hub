import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCrmAccounts, useCrmReps, useUpdateAccount, LIFECYCLE_STAGES, type LifecycleStage, type CrmAccount } from "@/hooks/useCrm";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function CrmPipelinePage() {
  const { data: accounts = [] } = useCrmAccounts();
  const { data: reps = [] } = useCrmReps();
  const update = useUpdateAccount();
  const { toast } = useToast();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, CrmAccount[]> = {};
    LIFECYCLE_STAGES.forEach((s) => (map[s.id] = []));
    accounts.forEach((a) => map[a.lifecycle_stage]?.push(a));
    return map;
  }, [accounts]);

  const repName = (id: string | null) => (id ? reps.find((r) => r.id === id)?.name ?? "—" : "Unassigned");

  const onDrop = (stage: LifecycleStage) => {
    if (!draggingId) return;
    const acct = accounts.find((a) => a.id === draggingId);
    if (acct && acct.lifecycle_stage !== stage) {
      update.mutate(
        { id: acct.id, patch: { lifecycle_stage: stage } },
        { onSuccess: () => toast({ title: "Stage updated", description: `${acct.company_name} → ${LIFECYCLE_STAGES.find((s) => s.id === stage)?.label}` }) }
      );
    }
    setDraggingId(null);
    setOverStage(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="CRM · Pipeline" title="Lifecycle Pipeline" subtitle="Drag any account between stages to move it through the relationship lifecycle." />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 min-h-[60vh]">
        {LIFECYCLE_STAGES.map((stage) => (
          <div
            key={stage.id}
            onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
            onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
            onDrop={() => onDrop(stage.id)}
            className={cn(
              "rounded-lg border border-border/60 bg-card/60 flex flex-col min-h-[300px] transition-colors",
              overStage === stage.id && "border-accent bg-accent/5"
            )}
          >
            <div className="px-3 py-2.5 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                  {stage.label}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">{byStage[stage.id]?.length ?? 0}</span>
            </div>
            <div className="p-2 space-y-2 flex-1 overflow-y-auto">
              {byStage[stage.id]?.map((a) => (
                <Card
                  key={a.id}
                  draggable
                  onDragStart={() => setDraggingId(a.id)}
                  onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                  className={cn(
                    "p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border-border/70",
                    draggingId === a.id && "opacity-50"
                  )}
                >
                  <Link to={`/crm/accounts/${a.id}`} className="block">
                    <div className="text-[13px] font-medium text-foreground truncate">{a.company_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{repName(a.assigned_rep_id)}</div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate">{[a.city, a.state].filter(Boolean).join(", ") || "—"}</span>
                      {a.contact_first_name && <span className="truncate ml-2">{a.contact_first_name}</span>}
                    </div>
                  </Link>
                </Card>
              ))}
              {(byStage[stage.id]?.length ?? 0) === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-6 italic">Drop here</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
