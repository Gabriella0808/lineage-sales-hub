import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Users, CheckCircle2, Activity } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  format,
} from "date-fns";

type TeamId = "will" | "mateo" | "chris";
const TEAM: { id: TeamId; name: string; emails: string[] }[] = [
  { id: "will", name: "Will Grisack", emails: ["will@lineage-collections.com"] },
  { id: "mateo", name: "Mateo De Lisa", emails: ["mateo@lineage-collections.com"] },
  { id: "chris", name: "Chris De Lisa", emails: ["chris@lineage-collections.com"] },
];

interface CheckInRow {
  id: string;
  user_id: string;
  visit_date: string;
  new_placement: string | null;
}

interface UserManagerRow {
  user_id: string;
  manager_id: string;
}

interface ManagerRow {
  id: string;
  email: string | null;
  name: string;
}

type Period = {
  key: string;
  label: string;
  sublabel: string;
  start: Date;
  end: Date;
  isYTD?: boolean;
};

function buildPeriods(now: Date): Period[] {
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastMonth = subMonths(now, 1);
  const lastMonthStart = startOfMonth(lastMonth);
  const lastMonthEnd = endOfMonth(lastMonth);
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);

  return [
    {
      key: "lastWeek",
      label: "Last Week",
      sublabel: `${format(lastWeekStart, "MMM d")} – ${format(lastWeekEnd, "MMM d, yyyy")}`,
      start: lastWeekStart,
      end: lastWeekEnd,
    },
    {
      key: "thisWeek",
      label: "This Week",
      sublabel: `${format(thisWeekStart, "MMM d")} – ${format(thisWeekEnd, "MMM d, yyyy")}`,
      start: thisWeekStart,
      end: thisWeekEnd,
    },
    {
      key: "lastMonth",
      label: "Last Month",
      sublabel: `${format(lastMonthStart, "MMM d")} – ${format(lastMonthEnd, "MMM d, yyyy")}`,
      start: lastMonthStart,
      end: lastMonthEnd,
    },
    {
      key: "ytd",
      label: `${now.getFullYear()} Year-to-Date`,
      sublabel: `${format(yearStart, "MMM d")} – ${format(now, "MMM d, yyyy")}`,
      start: yearStart,
      end: yearEnd,
      isYTD: true,
    },
  ];
}

function inRange(dateStr: string, start: Date, end: Date) {
  const d = dateStr.slice(0, 10);
  const s = format(start, "yyyy-MM-dd");
  const e = format(end, "yyyy-MM-dd");
  return d >= s && d <= e;
}

export default function CheckInAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);
  const [userToTeam, setUserToTeam] = useState<Record<string, TeamId>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [{ data: managers }, { data: ums }, { data: cis }] = await Promise.all([
        supabase.from("managers").select("id,email,name") as unknown as Promise<{ data: ManagerRow[] | null }>,
        supabase.from("user_managers").select("user_id,manager_id") as unknown as Promise<{ data: UserManagerRow[] | null }>,
        supabase
          .from("dealer_check_ins")
          .select("id,user_id,visit_date,new_placement")
          .order("visit_date", { ascending: false }) as unknown as Promise<{ data: CheckInRow[] | null }>,
      ]);

      if (cancelled) return;

      // map manager_id -> teamId via email
      const managerToTeam: Record<string, TeamId> = {};
      (managers ?? []).forEach((m) => {
        const email = (m.email ?? "").toLowerCase();
        const member = TEAM.find((t) => t.emails.includes(email));
        if (member) managerToTeam[m.id] = member.id;
      });

      const uMap: Record<string, TeamId> = {};
      (ums ?? []).forEach((u) => {
        const teamId = managerToTeam[u.manager_id];
        if (teamId) uMap[u.user_id] = teamId;
      });

      setUserToTeam(uMap);
      setCheckIns(cis ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const periods = useMemo(() => buildPeriods(new Date()), []);

  const stats = useMemo(() => {
    const result: Record<TeamId, Record<string, { checkIns: number; placements: number }>> = {
      will: {},
      mateo: {},
      chris: {},
    };
    TEAM.forEach((t) => {
      periods.forEach((p) => {
        result[t.id][p.key] = { checkIns: 0, placements: 0 };
      });
    });

    checkIns.forEach((c) => {
      const team = userToTeam[c.user_id];
      if (!team) return;
      periods.forEach((p) => {
        if (inRange(c.visit_date, p.start, p.end)) {
          result[team][p.key].checkIns += 1;
          if ((c.new_placement ?? "").toLowerCase() === "yes") {
            result[team][p.key].placements += 1;
          }
        }
      });
    });

    // Manual override for Chris De Lisa per provided stats
    result.chris = {
      lastWeek: { checkIns: 0, placements: 0 },
      thisWeek: { checkIns: 0, placements: 0 },
      lastMonth: { checkIns: 0, placements: 0 },
      ytd: { checkIns: 1, placements: 0 },
    };

    return result;
  }, [checkIns, userToTeam, periods]);

  const ytdKey = "ytd";
  const thisWeekKey = "thisWeek";

  const ytdChartData = TEAM.map((t) => ({
    name: t.name.split(" ")[0],
    checkIns: stats[t.id][ytdKey].checkIns,
    placements: stats[t.id][ytdKey].placements,
  }));

  const weekChartData = TEAM.map((t) => ({
    name: t.name.split(" ")[0],
    checkIns: stats[t.id][thisWeekKey].checkIns,
    placements: stats[t.id][thisWeekKey].placements,
  }));

  const totals = useMemo(() => {
    const totalCheckIns = TEAM.reduce((sum, t) => sum + stats[t.id][ytdKey].checkIns, 0);
    const totalPlacements = TEAM.reduce((sum, t) => sum + stats[t.id][ytdKey].placements, 0);
    const activeReps = TEAM.filter((t) => stats[t.id][ytdKey].checkIns > 0).length;
    const conversion = totalCheckIns > 0 ? Math.round((totalPlacements / totalCheckIns) * 100) : 0;
    return { totalCheckIns, totalPlacements, activeReps, conversion };
  }, [stats]);

  const chartConfig = {
    checkIns: { label: "Check-Ins", color: "hsl(var(--chart-1))" },
    placements: { label: "Placements", color: "hsl(var(--chart-3))" },
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
          Check-In Analytics
        </h1>
        <p className="text-muted-foreground text-base">
          Individual manager performance breakdown across check-ins and new placements.
        </p>
      </header>

      {/* Top-level KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Activity className="h-4 w-4" />}
          label="Total Check-Ins (YTD)"
          value={totals.totalCheckIns}
          accent="primary"
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="New Placements (YTD)"
          value={totals.totalPlacements}
          accent="success"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Conversion Rate"
          value={`${totals.conversion}%`}
          accent="accent"
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Active Managers"
          value={`${totals.activeReps} / ${TEAM.length}`}
          accent="muted"
        />
      </section>

      {/* Per-rep breakdown */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-accent" />
          <div>
            <h2 className="font-display text-2xl text-foreground leading-tight">Manager Performance</h2>
            <p className="text-sm text-muted-foreground">
              Check-ins and new placements segmented by time period.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {TEAM.map((member, idx) => (
            <RepCard
              key={member.id}
              name={member.name}
              periods={periods}
              data={stats[member.id]}
              accentClass={["bg-primary", "bg-accent", "bg-success"][idx % 3]}
            />
          ))}
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="font-display text-xl">This Week</CardTitle>
            <CardDescription>Check-ins and placements by rep this week.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={weekChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="checkIns" fill="var(--color-checkIns)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="placements" fill="var(--color-placements)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="font-display text-xl">{new Date().getFullYear()} Year-to-Date</CardTitle>
            <CardDescription>Total check-ins and placements by rep.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={ytdChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="checkIns" fill="var(--color-checkIns)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="placements" fill="var(--color-placements)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
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
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
            {icon}
          </div>
        </div>
        <p className="font-display text-3xl text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function RepCard({
  name,
  periods,
  data,
  accentClass,
}: {
  name: string;
  periods: Period[];
  data: Record<string, { checkIns: number; placements: number }>;
  accentClass: string;
}) {
  return (
    <Card className="border-border/60 overflow-hidden">
      <div className={`h-1 w-full ${accentClass}`} />
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center font-display text-sm text-foreground">
            {name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
          <CardTitle className="font-display text-lg">{name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {periods.map((p, idx) => {
          const d = data[p.key];
          const isYTD = !!p.isYTD;
          return (
            <div key={p.key}>
              {idx > 0 && <div className="border-t border-border/60 mb-4" />}
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">{p.label}</p>
                <p className="text-[11px] text-muted-foreground">{p.sublabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={isYTD ? "Total Check-Ins" : "Check-Ins"} value={d.checkIns} tone="primary" />
                <Stat
                  label={isYTD ? "Total Placements" : "New Placements"}
                  value={d.placements}
                  tone="success"
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "success";
}) {
  const toneMap = {
    primary: "text-primary",
    success: "text-success",
  };
  return (
    <div className="rounded-lg bg-secondary/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <p className={`font-display text-2xl tabular-nums mt-1 ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}
