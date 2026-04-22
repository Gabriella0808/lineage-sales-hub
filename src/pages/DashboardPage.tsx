import { Users, Map, Store, LogIn, Trophy, TrendingUp, ArrowUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useSalesReps, useTerritories, useDealers, useDealerSales, useRepTerritories, useManagers, formatCurrency, getInitials } from "@/hooks/usePortalData";
import { useSignInFeed } from "@/hooks/useSignInFeed";
import { useUserRole } from "@/hooks/useUserRole";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

const MONTH_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardPage() {
  const { data: roleInfo } = useUserRole();
  const role = roleInfo?.role ?? "rep";
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: territories = [], isLoading: terLoading } = useTerritories();
  const { data: dealers = [], isLoading: dlrLoading } = useDealers();
  const { data: signIns = [] } = useSignInFeed(8);
  const { data: dealerSales = [], isLoading: salesLoading } = useDealerSales();
  const { data: repTerritories = [] } = useRepTerritories();
  const { data: managers = [] } = useManagers();

  const isLoading = repsLoading || terLoading || dlrLoading || salesLoading;

  const totalOverdue = reps.reduce((s, r) => s + (r.tasks_overdue ?? 0), 0);
  const totalPending = reps.reduce((s, r) => s + (r.tasks_pending ?? 0), 0);

  // Revenue from dealer_sales
  const currentYear = new Date().getFullYear();
  const currentYearSales = dealerSales.filter(s => s.year === currentYear);
  const lastYearSales = dealerSales.filter(s => s.year === currentYear - 1);
  const totalRevenue = currentYearSales.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const lastYearRevenue = lastYearSales.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalOrders = currentYearSales.reduce((s, r) => s + (r.order_count ?? 0), 0);

  // Monthly rep performance — sales per rep, per month (top 5 reps shown)
  const REP_COLORS = ['hsl(220 35% 22%)', 'hsl(38 75% 50%)', 'hsl(152 60% 40%)', 'hsl(0 65% 55%)', 'hsl(265 50% 55%)'];
  const repMonthlyMap: Record<string, Record<string, number>> = {};
  currentYearSales.forEach(s => {
    const dealer = dealers.find(d => d.id === s.dealer_id);
    if (!dealer?.rep_id) return;
    if (!repMonthlyMap[dealer.rep_id]) repMonthlyMap[dealer.rep_id] = {};
    repMonthlyMap[dealer.rep_id][s.month] = (repMonthlyMap[dealer.rep_id][s.month] ?? 0) + (s.revenue ?? 0);
  });
  const repTotals = Object.entries(repMonthlyMap)
    .map(([repId, months]) => ({ repId, total: Object.values(months).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const topRepIds = repTotals.map(r => r.repId);
  const repPerformanceData = MONTH_ORDER.map(month => {
    const row: Record<string, string | number> = { month };
    topRepIds.forEach(repId => {
      const rep = reps.find(r => r.id === repId);
      const name = rep?.name ?? 'Unknown';
      row[name] = Math.round((repMonthlyMap[repId]?.[month] ?? 0) / 1000);
    });
    return row;
  });
  const topRepNames = topRepIds.map(id => reps.find(r => r.id === id)?.name ?? 'Unknown');

  // Top dealers by revenue
  const dealerRevenueMap: Record<string, number> = {};
  currentYearSales.forEach(s => {
    dealerRevenueMap[s.dealer_id] = (dealerRevenueMap[s.dealer_id] ?? 0) + (s.revenue ?? 0);
  });
  const topDealers = Object.entries(dealerRevenueMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([dealerId, revenue]) => {
      const dealer = dealers.find(d => d.id === dealerId);
      const name = dealer?.name ?? 'Unknown';
      return { name: name.length > 18 ? name.slice(0, 18) + '…' : name, revenue: Math.round(revenue / 1000) };
    });

  // Sales Leaderboard — rep revenue from dealer_sales via dealer.rep_id
  const repRevenueMap: Record<string, number> = {};
  currentYearSales.forEach(s => {
    const dealer = dealers.find(d => d.id === s.dealer_id);
    if (dealer?.rep_id) {
      repRevenueMap[dealer.rep_id] = (repRevenueMap[dealer.rep_id] ?? 0) + (s.revenue ?? 0);
    }
  });
  const leaderboard = reps
    .map(r => {
      const territoryIds = repTerritories.filter(rt => rt.rep_id === r.id).map(rt => rt.territory_id);
      const territoryNames = territoryIds.map(tid => territories.find(t => t.id === tid)?.name).filter(Boolean) as string[];
      return {
        id: r.id,
        name: r.name,
        territory: territoryNames.join(", ") || "—",
        revenue: repRevenueMap[r.id] ?? 0,
      };
    })
    .filter(r => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Top reps by total sales (horizontal bar)
  const topRepsBar = Object.entries(repRevenueMap)
    .map(([repId, revenue]) => ({ repId, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map(({ repId, revenue }) => {
      const rep = reps.find(r => r.id === repId);
      const first = (rep?.name ?? 'Unknown').split(' ')[0];
      return { name: first, revenue: Math.round(revenue) };
    });

  // Accounts by Sales Manager (donut)
  const MANAGER_COLORS = ['hsl(38 75% 50%)', 'hsl(152 60% 40%)', 'hsl(220 35% 22%)', 'hsl(265 50% 55%)', 'hsl(0 65% 55%)'];
  const managerAccountsMap: Record<string, number> = {};
  dealers.forEach(d => {
    const rep = reps.find(r => r.id === d.rep_id);
    const managerId = rep?.manager_id ?? 'unassigned';
    managerAccountsMap[managerId] = (managerAccountsMap[managerId] ?? 0) + 1;
  });
  const managerDonut = Object.entries(managerAccountsMap)
    .map(([managerId, count]) => {
      const mgr = managers.find(m => m.id === managerId);
      const initials = mgr ? mgr.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 3) : 'N/A';
      return { name: initials, value: count, fullName: mgr?.name ?? 'Unassigned' };
    })
    .filter(m => m.value > 0)
    .sort((a, b) => b.value - a.value);

  // Reps per Territory (vertical bar)
  const repsPerTerritory = territories
    .map(t => {
      const count = repTerritories.filter(rt => rt.territory_id === t.id).length;
      return { name: t.name, count };
    })
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);

  

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="page-header"><h1 className="page-title">Loading...</h1></div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-5">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">
          {role === "admin" && "Sales Overview"}
          {role === "manager" && "Team Overview"}
          {role === "rep" && "My Overview"}
        </h1>
        <p className="page-subtitle">
          {role === "rep"
            ? `${dealers.length} dealers • ${territories.length} territories assigned to you`
            : `${reps.length} reps • ${territories.length} territories • ${dealers.length} dealers`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {role !== "rep" && (
          <StatCard title={role === "manager" ? "My Reps" : "Sales Reps"} value={reps.length} icon={Users} trend="neutral" subtitle="assigned" />
        )}
        <StatCard title="Territories" value={territories.length} icon={Map} trend="neutral" subtitle="active" />
        <StatCard title={role === "rep" ? "My Dealers" : "Dealers"} value={dealers.length} icon={Store} trend="neutral" subtitle="total" />
        <StatCard title={`${currentYear} Revenue`} value={formatCurrency(totalRevenue)} trend="neutral" variant="accent" />
        <StatCard title="Orders" value={totalOrders.toLocaleString()} trend="neutral" subtitle={String(currentYear)} variant="success" />
      </div>

      {/* Sales Leaderboard — full width */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-base font-semibold mb-5 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-accent" /> Sales Leaderboard
        </h3>
        {leaderboard.length > 0 ? (
          <ol className="space-y-1">
            {leaderboard.map((rep, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              return (
                <li key={rep.id} className="flex items-center gap-4 py-3 border-b border-border/40 last:border-0">
                  <span className={`w-10 text-center shrink-0 ${idx <= 2 ? 'text-2xl' : 'text-sm font-semibold text-muted-foreground'}`}>{medal}</span>
                  <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{getInitials(rep.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold truncate">{rep.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{rep.territory}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold tabular-nums">{formatCurrency(rep.revenue)}</p>
                    <p className="text-[11px] font-medium text-success flex items-center justify-end gap-0.5">
                      <ArrowUp className="h-3 w-3" /> Tracking
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No rep revenue data yet.</p>
        )}
      </div>

      {/* Row: Top Reps by Total Sales + Accounts by Sales Manager */}
      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" /> Top Reps by Total Sales
          </h3>
          <div className="h-[280px]">
            {topRepsBar.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRepsBar} layout="vertical" barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 90%)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="hsl(38 75% 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center pt-20">No rep sales data yet.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-5 flex flex-col">
          <h3 className="text-sm font-semibold mb-4">Accounts by Sales Manager</h3>
          <div className="flex-1 min-h-[240px]">
            {managerDonut.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={managerDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {managerDonut.map((_, i) => (
                      <Cell key={i} fill={MANAGER_COLORS[i % MANAGER_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, _n, p: any) => [`${v} accounts`, p?.payload?.fullName]} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="square"
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center pt-20">No manager data yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row: Top Dealers by Revenue */}
      <div className="mb-6">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Top Dealers by Revenue ($K) — {currentYear}</h3>
          <div className="h-[280px]">
            {topDealers.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDealers} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 90%)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `$${v}K`} />
                  <Bar dataKey="revenue" fill="hsl(152 60% 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center pt-20">No dealer sales data yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row: Monthly Rep Performance + Recent Sign-Ins */}
      <div className={role === "admin" ? "grid lg:grid-cols-3 gap-5" : "grid lg:grid-cols-1 gap-5"}>
        <div className={role === "admin" ? "glass-card p-5 lg:col-span-2" : "glass-card p-5"}>
          <h3 className="text-sm font-semibold mb-1">Monthly Rep Performance ($K) — {currentYear}</h3>
          <p className="text-[11px] text-muted-foreground mb-3">Top 5 reps by sales per month</p>
          <div className="h-[240px]">
            {topRepNames.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={repPerformanceData} barGap={1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 90%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `$${v}K`} />
                  {topRepNames.map((name, i) => (
                    <Bar key={name} dataKey={name} fill={REP_COLORS[i]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center pt-20">No rep sales data synced yet.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {topRepNames.map((name, i) => (
              <div key={name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: REP_COLORS[i] }} />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {role === "admin" && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <LogIn className="h-4 w-4 text-muted-foreground" /> Recent Sign-Ins
            </h3>
            <p className="text-[11px] text-muted-foreground mb-4">Who has logged into the portal</p>
            <div className="space-y-3">
              {signIns.length > 0 ? signIns.map(s => (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-primary">
                      {(s.full_name ?? "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{s.full_name ?? "Unknown user"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(s.signed_in_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No sign-ins recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
