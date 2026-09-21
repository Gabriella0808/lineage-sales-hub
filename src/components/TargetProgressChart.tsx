import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { TARGET_MONTHS, type RepTarget } from "@/hooks/useRepTargets";
import { cn } from "@/lib/utils";

// Reports count bookings and invoices from July onward only.
const FIRST_MONTH = 6;
const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(2)}M` : a >= 1_000 ? `$${Math.round(a / 1_000)}K` : `$${Math.round(a)}`;
  return n < 0 ? `-${s}` : s;
};

interface ChartProps {
  target: RepTarget | undefined;
  monthlyBookings: number[];
  monthlyInvoiced: number[];
  asOf?: Date;
}

export function TargetProgressChart({ target, monthlyBookings, monthlyInvoiced, asOf = new Date() }: ChartProps) {
  const [open, setOpen] = useState(false);
  const curMonth = asOf.getMonth() + 1;
  const daysInCur = new Date(asOf.getFullYear(), curMonth, 0).getDate();
  const frac = (i: number) => (i < FIRST_MONTH ? 0 : i + 1 < curMonth ? 1 : i + 1 === curMonth ? asOf.getDate() / daysInCur : 0);

  const m = useMemo(() => {
    const monthTarget = TARGET_MONTHS.map((k, i) => (target && i >= FIRST_MONTH ? Number(target[k]) || 0 : 0));
    const targetToDate = monthTarget.reduce((s, v, i) => s + v * frac(i), 0);
    const bookings = monthlyBookings.reduce((s, v, i) => s + (i >= FIRST_MONTH ? v : 0), 0);
    const invoiced = monthlyInvoiced.reduce((s, v, i) => s + (i >= FIRST_MONTH ? v : 0), 0);
    const chart = LABELS.slice(FIRST_MONTH, curMonth).map((label, k) => {
      const i = k + FIRST_MONTH;
      return { label, Bookings: Math.round(monthlyBookings[i] ?? 0), Invoiced: Math.round(monthlyInvoiced[i] ?? 0), Target: monthTarget[i] > 0 ? Math.round(monthTarget[i]) : undefined };
    });
    return { monthTarget, targetToDate, bookings, invoiced, chart, total: monthTarget.reduce((s, v) => s + v, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, monthlyBookings, monthlyInvoiced, curMonth]);

  if (!target || m.total <= 0) {
    return <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">No July to December sales target set for this rep. Add one on the Sales Targets page.</p>;
  }

  const inv = m.targetToDate > 0 ? (m.invoiced / m.targetToDate) * 100 : 0;
  const bkg = m.targetToDate > 0 ? (m.bookings / m.targetToDate) * 100 : 0;
  const tone = (v: number) => (v >= 95 ? "text-success" : v >= 75 ? "text-warning" : "text-destructive");
  const bar = (v: number) => (v >= 95 ? "bg-success" : v >= 75 ? "bg-warning" : "bg-destructive");

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border">
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/40 rounded-xl">
        <span className="text-sm font-semibold">Sales target progress</span>
        <span className="flex items-center gap-3 text-xs">
          <span>Invoiced <span className={cn("font-semibold tabular-nums", tone(inv))}>{Math.round(inv)}%</span></span>
          <span>Bookings <span className={cn("font-semibold tabular-nums", tone(bkg))}>{Math.round(bkg)}%</span></span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">Target to date {money(m.targetToDate)} of {money(m.total)} for Jul to Dec. Invoiced {money(m.invoiced)}, booked {money(m.bookings)}.</p>
        <div className="grid grid-cols-2 gap-3">
          {([["Invoiced", inv], ["Bookings", bkg]] as [string, number][]).map(([label, v]) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1"><span>{label}</span><span className="tabular-nums text-muted-foreground">{Math.round(v)}%</span></div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", bar(v))} style={{ width: `${Math.min(100, v)}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={m.chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickFormatter={(v) => money(v)} tickLine={false} axisLine={false} fontSize={11} width={44} />
              <Tooltip formatter={(v: number) => `$${Math.round(v).toLocaleString()}`} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Bookings" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Invoiced" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="Target" name="Monthly target" stroke="hsl(var(--chart-3))" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Fetches one rep's monthly bookings/invoicing (by Acctivate rep code) and shows progress against their target.
export function RepTargetPanel({ repCode, target, year }: { repCode: string; target: RepTarget | undefined; year: number }) {
  const { data } = useQuery({
    queryKey: ["rep_target_panel_rows", repCode, year],
    staleTime: 5 * 60_000,
    enabled: !!repCode,
    queryFn: async () => {
      const rows: { metric_type: string | null; amount: number | string | null; transaction_date: string | null }[] = [];
      for (let start = 0; ; start += 1000) {
        const { data: batch, error } = await (supabase as any)
          .from("v_companywide_reporting_actuals")
          .select("metric_type, amount, transaction_date")
          .eq("rep_id", repCode)
          .gte("transaction_date", `${year}-07-01`)
          .in("metric_type", ["bookings", "invoiced"])
          .order("transaction_date", { ascending: true })
          .range(start, start + 999);
        if (error) throw error;
        rows.push(...(batch ?? []));
        if (!batch || batch.length < 1000) break;
      }
      const b = Array(12).fill(0) as number[];
      const i = Array(12).fill(0) as number[];
      for (const r of rows) {
        const mi = parseInt((r.transaction_date ?? "").slice(5, 7), 10) - 1;
        if (mi < 0) continue;
        (r.metric_type === "bookings" ? b : i)[mi] += Number(r.amount) || 0;
      }
      return { b, i };
    },
  });
  if (!data) return <p className="text-xs text-muted-foreground">Loading target progress...</p>;
  return <TargetProgressChart target={target} monthlyBookings={data.b} monthlyInvoiced={data.i} />;
}
