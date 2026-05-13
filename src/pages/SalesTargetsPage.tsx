import { useMemo, useState } from "react";
import { Target, Save, Copy, Loader2 } from "lucide-react";
import { useSalesReps, useDealerSales, useDealers, formatCurrency } from "@/hooks/usePortalData";
import { useRepTargets, useUpsertRepTarget, TARGET_MONTHS, MONTH_LABEL_TO_KEY, type RepTarget } from "@/hooks/useRepTargets";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Draft = Record<string, Partial<RepTarget>>;

export default function SalesTargetsPage() {
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();
  const role = roleInfo?.role;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: targets = [], isLoading: targetsLoading } = useRepTargets(year);
  const { data: dealerSales = [] } = useDealerSales();
  const { data: dealers = [] } = useDealers();
  const upsert = useUpsertRepTarget();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const targetByRep = useMemo(() => {
    const m: Record<string, RepTarget> = {};
    targets.forEach(t => { m[t.rep_id] = t; });
    return m;
  }, [targets]);

  // Actuals per rep per month for selected year
  const actualByRep = useMemo(() => {
    const m: Record<string, { months: Record<string, number>; total: number }> = {};
    dealerSales.filter(s => s.year === year).forEach(s => {
      const dealer = dealers.find(d => d.id === s.dealer_id);
      if (!dealer?.rep_id) return;
      const rid = dealer.rep_id;
      if (!m[rid]) m[rid] = { months: {}, total: 0 };
      m[rid].months[s.month] = (m[rid].months[s.month] ?? 0) + (s.revenue ?? 0);
      m[rid].total += (s.revenue ?? 0);
    });
    return m;
  }, [dealerSales, dealers, year]);

  if (roleLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }
  if (role !== "admin") {
    return (
      <div className="animate-fade-in">
        <div className="page-header"><h1 className="page-title">Sales Targets</h1></div>
        <div className="glass-card p-6 text-sm text-muted-foreground">Only admins can edit sales targets.</div>
      </div>
    );
  }

  const getValue = (repId: string, key: keyof RepTarget): number => {
    const d = draft[repId]?.[key];
    if (d !== undefined) return Number(d) || 0;
    const t = targetByRep[repId];
    return t ? (Number(t[key]) || 0) : 0;
  };

  const setValue = (repId: string, key: keyof RepTarget, value: string) => {
    const num = value === "" ? 0 : Number(value);
    setDraft(prev => ({ ...prev, [repId]: { ...(prev[repId] ?? {}), [key]: num } }));
  };

  const annualSum = (repId: string) =>
    TARGET_MONTHS.reduce((sum, m) => sum + getValue(repId, m as keyof RepTarget), 0);

  const saveRow = async (repId: string) => {
    setSaving(repId);
    try {
      const monthly: Record<string, number> = {};
      TARGET_MONTHS.forEach(m => { monthly[m] = getValue(repId, m as keyof RepTarget); });
      await upsert.mutateAsync({
        rep_id: repId,
        year,
        ...monthly,
        annual_target: annualSum(repId),
      } as any);
      setDraft(prev => { const next = { ...prev }; delete next[repId]; return next; });
      toast({ title: "Target saved", description: `${reps.find(r=>r.id===repId)?.name ?? "Rep"} • ${year}` });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const copyFromPreviousYear = async () => {
    setCopying(true);
    try {
      const { data: prev, error } = await supabase
        .from("rep_targets" as any)
        .select("*")
        .eq("year", year - 1);
      if (error) throw error;
      const rows = (prev ?? []) as unknown as RepTarget[];
      if (rows.length === 0) {
        toast({ title: "Nothing to copy", description: `No targets exist for ${year - 1}.` });
        return;
      }
      const existingReps = new Set(targets.map(t => t.rep_id));
      const toInsert = rows
        .filter(r => !existingReps.has(r.rep_id))
        .map(r => ({
          rep_id: r.rep_id, year,
          jan: r.jan, feb: r.feb, mar: r.mar, apr: r.apr, may: r.may, jun: r.jun,
          jul: r.jul, aug: r.aug, sep: r.sep, oct: r.oct, nov: r.nov, dec: r.dec,
          annual_target: r.annual_target, notes: r.notes,
        }));
      if (toInsert.length === 0) {
        toast({ title: "Already populated", description: `All reps already have ${year} targets.` });
        return;
      }
      const { error: insErr } = await supabase.from("rep_targets" as any).insert(toInsert as any);
      if (insErr) throw insErr;
      qc.invalidateQueries({ queryKey: ["rep_targets", year] });
      toast({ title: "Copied", description: `${toInsert.length} rep targets copied from ${year - 1}.` });
    } catch (e: any) {
      toast({ title: "Copy failed", description: e.message, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  const isLoading = repsLoading || targetsLoading;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Target className="h-6 w-6 text-accent" /> Sales Targets</h1>
          <p className="page-subtitle">Set monthly sales goals per rep. Annual target = sum of all months.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Year</label>
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setDraft({}); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={copyFromPreviousYear} disabled={copying}>
            {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            <span className="ml-2">Copy from {year - 1}</span>
          </Button>
        </div>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left sticky left-0 bg-muted/50 z-10 min-w-[160px]">Rep</th>
                  {MONTH_LABELS.map(m => (
                    <th key={m} className="px-2 py-2 text-right min-w-[88px]">{m}</th>
                  ))}
                  <th className="px-3 py-2 text-right min-w-[110px]">Annual</th>
                  <th className="px-3 py-2 text-right min-w-[110px]">YTD Actual</th>
                  <th className="px-3 py-2 text-right min-w-[80px]">Attain</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {reps.map(rep => {
                  const annual = annualSum(rep.id);
                  const actual = actualByRep[rep.id]?.total ?? 0;
                  const pct = annual > 0 ? Math.round((actual / annual) * 100) : 0;
                  const dirty = !!draft[rep.id];
                  return (
                    <tr key={rep.id} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">
                        {rep.name}
                        {dirty && <span className="ml-2 text-[10px] text-amber-600">unsaved</span>}
                      </td>
                      {TARGET_MONTHS.map(m => (
                        <td key={m} className="px-1 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            value={getValue(rep.id, m as keyof RepTarget) || ""}
                            onChange={(e) => setValue(rep.id, m as keyof RepTarget, e.target.value)}
                            className="h-8 text-xs text-right tabular-nums px-1.5"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(annual)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(actual)}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${pct >= 100 ? "text-success" : pct >= 75 ? "text-accent" : pct >= 50 ? "text-amber-600" : "text-destructive"}`}>
                        {annual > 0 ? `${pct}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          disabled={!dirty || saving === rep.id}
                          onClick={() => saveRow(rep.id)}
                        >
                          {saving === rep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {reps.length === 0 && (
                  <tr><td colSpan={16} className="p-6 text-center text-sm text-muted-foreground">No reps found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Tip: enter monthly amounts in dollars. Annual target updates automatically. Use "Copy from {year - 1}" to start a new year quickly, then adjust.
      </p>
    </div>
  );
}
