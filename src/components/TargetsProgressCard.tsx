import { useMemo, useId, useState } from "react";
import { Target, ChevronLeft, ChevronRight } from "lucide-react";
import { useSalesReps, useDealers, formatCurrency, getInitials } from "@/hooks/usePortalData";
import { useRepTargets, MONTH_LABEL_TO_KEY, type RepTarget } from "@/hooks/useRepTargets";
import { useUserRole } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    success: { from: "#34d399", to: "#059669" },
    gold:    { from: "#d4af37", to: "#b8860b" },
    warning: { from: "#fb923c", to: "#ea580c" },
    danger:  { from: "#f87171", to: "#dc2626" },
  };

  const grad = gradients[status.tone];
  const gradId = `ring-grad-${uid}`;
  const textColor =
    status.tone === "success"
      ? "text-emerald-600"
      : status.tone === "gold"
      ? "text-amber-600"
      : status.tone === "warning"
      ? "text-orange-600"
      : "text-red-600";

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
  const { data: dealers = [] } = useDealers();

  // Pull all dealer invoices for the year (paged) - same source as Sales Targets page.
  const { data: invoices = [], isLoading: invLoading } = useQuery({
    queryKey: ["targets_card_invoices", year],
    queryFn: async () => {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      const pageSize = 1000;
      const rows: { dealer_id: string | null; invoice_date: string | null; subtotal: number | null; total: number | null }[] = [];
      let start = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("dealer_invoices")
          .select("dealer_id, invoice_date, subtotal, total")
          .gte("invoice_date", from)
          .lte("invoice_date", to)
          .not("dealer_id", "is", null)
          .range(start, start + pageSize - 1);
        if (error) throw error;
        const batch = data ?? [];
        rows.push(...(batch as any));
        if (batch.length < pageSize) break;
        start += pageSize;
      }
      return rows;
    },
    staleTime: 60_000,
  });

  const targetByRep = useMemo(() => {
    const m: Record<string, RepTarget> = {};
    targets.forEach(t => { m[t.rep_id] = t; });
    return m;
  }, [targets]);

  // Actual revenue per rep, split YTD and current MTD, attributed via dealer rep_id
  // (fallback to dealer.salesperson loose-matching rep name).
  const actualByRep = useMemo(() => {
    const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const repByName = new Map<string, string>();
    reps.forEach(r => { if (r.name) repByName.set(norm(r.name), r.id); });
    const repForDealer = (d: any): string | null => {
      if (d?.rep_id) return d.rep_id;
      const sp = norm(d?.salesperson);
      if (!sp) return null;
      if (repByName.has(sp)) return repByName.get(sp)!;
      for (const [name, id] of repByName) {
        if (name && (name.includes(sp) || sp.includes(name))) return id;
      }
      return null;
    };
    const dealerRep = new Map<string, string | null>();
    dealers.forEach((d: any) => dealerRep.set(d.id, repForDealer(d)));

    const m: Record<string, { ytd: number; mtd: number }> = {};
    invoices.forEach(inv => {
      if (!inv.dealer_id || !inv.invoice_date) return;
      const rid = dealerRep.get(inv.dealer_id);
      if (!rid) return;
      const amount = Number(inv.subtotal ?? inv.total ?? 0);
      if (!amount) return;
      const d = new Date(inv.invoice_date);
      const m0 = d.getUTCMonth();
      if (!m[rid]) m[rid] = { ytd: 0, mtd: 0 };
      m[rid].ytd += amount;
      if (m0 === monthIdx) m[rid].mtd += amount;
    });
    return m;
  }, [invoices, dealers, reps, monthIdx]);


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

  const isLoading = repsLoading || tgtLoading || invLoading;

  const PAGE_SIZE = 4;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="glass-card p-4 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-accent" /> Sales Targets - {year}
          <span className="text-xs font-normal text-muted-foreground">YTD & MTD attainment</span>
        </h3>
        {!isLoading && rows.length > PAGE_SIZE && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {safePage * PAGE_SIZE + 1}---{Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <button
              type="button"
              aria-label="Previous reps"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next reps"
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No targets set for {year} yet.{role === "admin" ? " Go to Sales Targets to add them." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {pagedRows.map((r: any) => (
            <li key={r.id} className="py-3 flex items-center gap-3 sm:gap-4">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{getInitials(r.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  Annual goal {formatCurrency(r.annualTarget)} ... {r.annualPct}% of full year
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
