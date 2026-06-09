import { useMemo } from "react";
import { useCrmAccounts, useCrmReps, LIFECYCLE_STAGES, BRANDS, type LifecycleStage } from "@/hooks/useCrm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, TrendingUp, CheckCircle2, CalendarPlus } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { startOfMonth, endOfMonth, format } from "date-fns";

export default function CrmAccountsAnalyticsPage() {
  const { data: accounts = [], isLoading: loadingAccounts } = useCrmAccounts();
  const { data: reps = [], isLoading: loadingReps } = useCrmReps();

  const loading = loadingAccounts || loadingReps;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const repMap = useMemo(() => {
    const m: Record<string, string> = {};
    reps.forEach((r) => { m[r.id] = r.name; });
    return m;
  }, [reps]);

  const kpis = useMemo(() => {
    const total = accounts.length;
    const closedWon = accounts.filter((a) => a.lifecycle_stage === "closed_won").length;
    const conversionRate = total > 0 ? Math.round((closedWon / total) * 100) : 0;
    const newThisMonth = accounts.filter((a) => {
      const d = a.created_at.slice(0, 10);
      return d >= format(monthStart, "yyyy-MM-dd") && d <= format(monthEnd, "yyyy-MM-dd");
    }).length;
    return { total, closedWon, conversionRate, newThisMonth };
  }, [accounts, monthStart, monthEnd]);

  const stageChartData = useMemo(() =>
    LIFECYCLE_STAGES.map((s) => ({
      name: s.label,
      accounts: accounts.filter((a) => a.lifecycle_stage === s.id).length,
    })),
    [accounts],
  );

  const brandChartData = useMemo(() =>
    BRANDS.map((b) => ({
      name: b,
      accounts: accounts.filter((a) => a.brand === b).length,
    })),
    [accounts],
  );

  const repBreakdown = useMemo(() => {
    const byRep: Record<string, { name: string; total: number; closedWon: number; prospects: number }> = {};
    accounts.forEach((a) => {
      const key = a.assigned_rep_id ?? "__unassigned__";
      const name = a.assigned_rep_id ? (repMap[a.assigned_rep_id] ?? "Unknown") : "Unassigned";
      if (!byRep[key]) byRep[key] = { name, total: 0, closedWon: 0, prospects: 0 };
      byRep[key].total += 1;
      if (a.lifecycle_stage === "closed_won") byRep[key].closedWon += 1;
      if (a.lifecycle_stage === "prospect") byRep[key].prospects += 1;
    });
    return Object.values(byRep).sort((a, b) => b.total - a.total);
  }, [accounts, repMap]);

  const stageChartConfig = {
    accounts: { label: "Accounts", color: "hsl(var(--chart-1))" },
  };
  const brandChartConfig = {
    accounts: { label: "Accounts", color: "hsl(var(--chart-3))" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-medium uppercase tracking-wide text-[10px]">
            Analytics
          </Badge>
        </div>
        <h1 className="font-display text-4xl tracking-tight text-foreground">
          Accounts Analytics
        </h1>
        <p className="text-muted-foreground text-base">
          Account pipeline breakdown by stage, brand, and rep.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Building2 className="h-4 w-4" />} label="Total Accounts" value={kpis.total} accent="primary" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Closed Won" value={kpis.closedWon} accent="success" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Conversion Rate" value={`${kpis.conversionRate}%`} accent="accent" />
        <KpiCard icon={<CalendarPlus className="h-4 w-4" />} label={`New in ${format(now, "MMMM")}`} value={kpis.newThisMonth} accent="muted" />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="font-display text-xl">By Lifecycle Stage</CardTitle>
            <CardDescription>Number of accounts in each stage.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={stageChartConfig} className="h-[280px] w-full">
              <BarChart data={stageChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="accounts" fill="var(--color-accounts)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="font-display text-xl">By Brand</CardTitle>
            <CardDescription>Number of accounts per brand.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={brandChartConfig} className="h-[280px] w-full">
              <BarChart data={brandChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="accounts" fill="var(--color-accounts)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* Per-rep breakdown */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-accent" />
          <div>
            <h2 className="font-display text-2xl text-foreground leading-tight">By Rep</h2>
            <p className="text-sm text-muted-foreground">Account totals, closed won, and open prospects per rep.</p>
          </div>
        </div>

        <Card className="border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Rep</th>
                  <th className="text-right px-4 py-2.5 font-medium">Total Accounts</th>
                  <th className="text-right px-4 py-2.5 font-medium">Closed Won</th>
                  <th className="text-right px-4 py-2.5 font-medium">Open Prospects</th>
                  <th className="text-right px-4 py-2.5 font-medium">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {repBreakdown.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No accounts yet.</td></tr>
                )}
                {repBreakdown.map((r) => {
                  const winRate = r.total > 0 ? Math.round((r.closedWon / r.total) * 100) : 0;
                  return (
                    <tr key={r.name} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="text-emerald-600 font-medium">{r.closedWon}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.prospects}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <Badge variant="outline" className={`text-[10px] ${winRate >= 30 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground"}`}>
                          {winRate}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}

function KpiCard({
  icon, label, value, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: "primary" | "success" | "accent" | "muted";
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    accent: "bg-accent/15 text-accent-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="border-border/60 hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>{icon}</div>
        </div>
        <p className="font-display text-3xl text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
