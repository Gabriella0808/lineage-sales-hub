import { useMemo, useId } from "react";
import { Target } from "lucide-react";
import { useSalesReps, useDealerSales, useDealers, formatCurrency, getInitials } from "@/hooks/usePortalData";
import { useRepTargets, MONTH_LABEL_TO_KEY, type RepTarget } from "@/hooks/useRepTargets";
import { useUserRole } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ProgressRing({ pct, size = 64, label }: { pct: number; size?: number; label: string }) {
  const uid = useId();
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 100));
  const offset = c - (clamped / 100) * c;

  const status =
    pct >= 100
      ? { label: "On track", tone: "success" as const }
      : pct >= 75
      ? { label: "On track", tone: "gold" as const }
      : pct >= 50
      ? { label: "At risk", tone: "warning" as const }
      : { label: "Off track", tone: "danger" as const };

  const gradients: Record<string, { from: string; to: string }> = {
    success: { from: "#1e7e5e", to: "#0f3d2e" },
    gold:    { from: "#bfa04b", to: "#7a5c1a" },
    warning: { from: "#b45309", to: "#78350f" },
    danger:  { from: "#991b1b", to: "#450a0a" },
  };

  const grad = gradients[status.tone];
  const gradId = `ring-grad-${uid}`;
  const textColor =
    status.tone === "success"
      ? "text-emerald-800"
      : status.tone === "gold"
      ? "text-amber-800"
      : status.tone === "warning"
      ? "text-amber-900"
      : "text-red-900";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={grad.from} />
              <stop offset="100%" stopColor={grad.to} />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke="hsl(220 13% 90%)" strokeWidth={5} fill="transparent"
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={`url(#${gradId})`} strokeWidth={6}
            fill="transparent" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 800ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-['DM_Serif_Display'] text-sm font-bold leading-none tracking-tight ${textColor}`}>
            {clamped}<span className="text-[10px] align-top ml-0.5 opacity-60 font-sans">%</span>
          </span>
        </div>
        <div className="absolute inset-[6px] border border-white/40 rounded-full pointer-events-none" />
      </div>
      <span className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{label}</span>
      <span className={`text-[9px] font-semibold uppercase tracking-wider ${textColor}`}>{status.label}</span>
    </div>
  );
}

export function TargetsProgressCard() {
  const { data: roleInfo } = useUserRole();
  const role = roleInfo?.role ?? "rep";
  const year = new Date().getFullYear();
  const monthIdx = new Date().getMonth(); // 0-based
  const currentMonthKey = MONTH_LABEL_TO_KEY[MONTH_ORDER[monthIdx]];

  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: targets = [], isLoading: tgtLoading } = useRepTargets(year);
  const { data: dealerSales = [], isLoading: dsLoading } = useDealerSales();
  const { data: dealers = [] } = useDealers();

  const targetByRep = useMemo(() => {
    const m: Record<string, RepTarget> = {};
    targets.forEach(t => { m[t.rep_id] = t; });
    return m;
  }, [targets]);

  // Actual revenue per rep, split YTD and current MTD
  const actualByRep = useMemo(() => {
    const m: Record<string, { ytd: number; mtd: number }> = {};
    dealerSales.filter(s => s.year === year).forEach(s => {
      const dealer = dealers.find(d => d.id === s.dealer_id);
      if (!dealer?.rep_id) return;
      const rid = dealer.rep_id;
      if (!m[rid]) m[rid] = { ytd: 0, mtd: 0 };
      const rev = s.revenue ?? 0;
      m[rid].ytd += rev;
      if (s.month === MONTH_ORDER[monthIdx]) m[rid].mtd += rev;
    });
    return m;
  }, [dealerSales, dealers, year, monthIdx]);

  const rows = reps
    .map(rep => {
      const tgt = targetByRep[rep.id];
      if (!tgt || (Number(tgt.annual_target) || 0) === 0) return null;
      // YTD target = sum of months Jan..current month
      let ytdTarget = 0;
      for (let i = 0; i <= monthIdx; i++) {
        const k = MONTH_LABEL_TO_KEY[MONTH_ORDER[i]] as keyof RepTarget;
        ytdTarget += Number(tgt[k]) || 0;
      }
      const mtdTarget = Number(tgt[currentMonthKey as keyof RepTarget]) || 0;
      const actuals = actualByRep[rep.id] ?? { ytd: 0, mtd: 0 };
      const ytdPct = ytdTarget > 0 ? Math.round((actuals.ytd / ytdTarget) * 100) : 0;
      const mtdPct = mtdTarget > 0 ? Math.round((actuals.mtd / mtdTarget) * 100) : 0;
      const annualPct = (Number(tgt.annual_target) || 0) > 0
        ? Math.round((actuals.ytd / Number(tgt.annual_target)) * 100) : 0;
      return {
        id: rep.id, name: rep.name,
        annualTarget: Number(tgt.annual_target) || 0,
        ytdTarget, mtdTarget,
        ytdActual: actuals.ytd, mtdActual: actuals.mtd,
        ytdPct, mtdPct, annualPct,
      };
    })
    .filter(Boolean) as Array<NonNullable<ReturnType<typeof Object>>> as any[];

  rows.sort((a: any, b: any) => b.ytdPct - a.ytdPct);

  const isLoading = repsLoading || tgtLoading || dsLoading;

  return (
    <div className="glass-card p-4 sm:p-6 mb-6">
      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-accent" /> Sales Targets — {year}
        <span className="text-xs font-normal text-muted-foreground">YTD & MTD attainment</span>
      </h3>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No targets set for {year} yet.{role === "admin" ? " Go to Sales Targets to add them." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((r: any) => (
            <li key={r.id} className="py-3 flex items-center gap-3 sm:gap-4">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{getInitials(r.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  Annual goal {formatCurrency(r.annualTarget)} • {r.annualPct}% of full year
                </p>
                <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(r.annualPct, 100)}%`,
                      background: r.annualPct >= 100 ? "hsl(152 60% 40%)" : "hsl(38 75% 50%)",
                    }}
                  />
                </div>
              </div>
              <ProgressRing pct={r.ytdPct} label="YTD" />
              <ProgressRing pct={r.mtdPct} label="MTD" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
