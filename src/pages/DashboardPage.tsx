import { Users, Map, Store, AlertTriangle, CheckCircle, Clock, TrendingUp, Mail, Phone, ExternalLink } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { KpiGauge } from "@/components/KpiGauge";
import { useSalesReps, useTerritories, useDealers, useActivities, useRepTerritories, useDealerSales, formatCurrency, getInitials } from "@/hooks/usePortalData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardPage() {
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: territories = [], isLoading: terLoading } = useTerritories();
  const { data: dealers = [], isLoading: dlrLoading } = useDealers();
  const { data: activities = [] } = useActivities();
  const { data: repTerritories = [] } = useRepTerritories();
  const { data: dealerSales = [], isLoading: salesLoading } = useDealerSales();

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

  // Monthly revenue chart
  const monthlyData = MONTH_ORDER.map(month => {
    const thisYear = currentYearSales.filter(s => s.month === month).reduce((sum, s) => sum + (s.revenue ?? 0), 0);
    const prevYear = lastYearSales.filter(s => s.month === month).reduce((sum, s) => sum + (s.revenue ?? 0), 0);
    return { month, [String(currentYear)]: Math.round(thisYear / 1000), [String(currentYear - 1)]: Math.round(prevYear / 1000) };
  });

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

  const attentionItems = [
    ...reps.filter(r => (r.tasks_overdue ?? 0) > 3).map(r => ({ label: `${r.name} — ${r.tasks_overdue} overdue tasks`, type: 'rep' as const })),
    ...territories.filter(t => t.status === 'underperforming' || t.status === 'at-risk').map(t => ({ label: `${t.name} — ${t.status}`, type: 'territory' as const })),
    ...dealers.filter(d => d.status === 'at-risk').map(d => ({ label: `${d.name} — at risk`, type: 'dealer' as const })),
  ];

  const activityIcons: Record<string, typeof Phone> = { call: Phone, email: Mail, meeting: Users, task: CheckCircle, alert: AlertTriangle };

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
        <h1 className="page-title">Sales Overview</h1>
        <p className="page-subtitle">{reps.length} reps • {territories.length} territories • {dealers.length} dealers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard title="Sales Reps" value={reps.length} icon={Users} trend="neutral" subtitle="assigned" />
        <StatCard title="Territories" value={territories.length} icon={Map} trend="neutral" subtitle="active" />
        <StatCard title="Dealers" value={dealers.length} icon={Store} trend="neutral" subtitle="total" />
        <StatCard title={`${currentYear} Revenue`} value={formatCurrency(totalRevenue)} trend="neutral" variant="accent" />
        <StatCard title="Orders" value={totalOrders.toLocaleString()} trend="neutral" subtitle={String(currentYear)} variant="success" />
        <StatCard title="Overdue" value={totalOverdue} trend="neutral" trendValue={`${totalPending} pending`} variant={totalOverdue > 10 ? 'destructive' : 'warning'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Monthly Revenue ($K) — {currentYear} vs {currentYear - 1}</h3>
          <div className="h-[240px]">
            {monthlyData.some(d => (d[String(currentYear)] as number) > 0 || (d[String(currentYear - 1)] as number) > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 90%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `$${v}K`} />
                  <Bar dataKey={String(currentYear)} fill="hsl(220 35% 22%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={String(currentYear - 1)} fill="hsl(38 75% 50%)" radius={[4, 4, 0, 0]} opacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center pt-20">No revenue data synced yet.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Attention Needed
          </h3>
          <div className="space-y-3">
            {attentionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
            {attentionItems.length === 0 && <p className="text-sm text-muted-foreground">All clear — no items need attention.</p>}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Top Dealers by Revenue ($K) — {currentYear}</h3>
          <div className="h-[260px]">
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

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {activities.length > 0 ? activities.slice(0, 5).map(a => {
              const Icon = activityIcons[a.type ?? 'task'] ?? CheckCircle;
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(a.timestamp).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-muted-foreground">No activity logged yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
