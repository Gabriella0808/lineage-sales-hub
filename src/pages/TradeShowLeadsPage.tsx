import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Users, DollarSign, Building2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart as RPieChart, Pie, Cell, Legend,
} from "recharts";

type Lead = {
  id: string;
  contact_name: string | null;
  dealer: string | null;
  trade_show: string | null;
  sales_rep: string | null;
  product_interest: string | null;
  order_amount: number | null;
  status: string | null;
  market_id: string | null;
  created_at: string;
};

type Market = { id: string; name: string };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#8b7355", "#c9a96e", "#5d7a8a", "#a86c5f", "#7a8a5d"];

export default function TradeShowLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [marketFilter, setMarketFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const [leadsRes, marketsRes] = await Promise.all([
      supabase.from("trade_show_leads").select("*").order("created_at", { ascending: false }),
      supabase.from("trade_show_markets").select("id,name").order("name"),
    ]);
    if (leadsRes.error) toast.error(leadsRes.error.message);
    else setLeads((leadsRes.data ?? []) as Lead[]);
    if (!marketsRes.error) setMarkets(marketsRes.data ?? []);
    setLoading(false);
  };

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-trade-show-leads");
    setSyncing(false);
    if (error) return toast.error(error.message);
    if (!data?.success) return toast.error(data?.error || "Sync failed");
    toast.success(`Synced ${data.upserted} leads from monday.com`);
    load();
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (marketFilter === "all") return leads;
    const m = markets.find((x) => x.id === marketFilter);
    return leads.filter((l) => l.market_id === marketFilter || (m && l.trade_show === m.name));
  }, [leads, markets, marketFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const orders = filtered.reduce((s, l) => s + (Number(l.order_amount) || 0), 0);
    const ordersWithValue = filtered.filter((l) => (Number(l.order_amount) || 0) > 0).length;
    const avgOrder = ordersWithValue ? orders / ordersWithValue : 0;
    const qualified = filtered.filter((l) => /qualified|passed|contacted/i.test(l.status || "")).length;
    const conv = total ? Math.round((qualified / total) * 100) : 0;
    return { total, orders, avgOrder, conv };
  }, [filtered]);

  const byMarket = useMemo(() => {
    const map = new Map<string, { name: string; leads: number; value: number }>();
    filtered.forEach((l) => {
      const key = l.trade_show || "Unassigned";
      const cur = map.get(key) ?? { name: key, leads: 0, value: 0 };
      cur.leads += 1;
      cur.value += Number(l.order_amount) || 0;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads).slice(0, 12);
  }, [filtered]);

  const byRep = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((l) => {
      const k = l.sales_rep || "Unassigned";
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, leads]) => ({ name, leads }))
      .sort((a, b) => b.leads - a.leads).slice(0, 15);
  }, [filtered]);

  const byCollection = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((l) => {
      const raw = (l.product_interest || "").trim();
      if (!raw) {
        map.set("Unspecified", (map.get("Unspecified") ?? 0) + 1);
        return;
      }
      // product_interest may be a comma-separated list of collections
      raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean).forEach((c) => {
        map.set(c, (map.get(c) ?? 0) + 1);
      });
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Trade Show Leads</h1>
          <p className="page-subtitle">Performance dashboard across every market</p>
        </div>
        <div className="flex gap-2">
          <Select value={marketFilter} onValueChange={setMarketFilter}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="All markets" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All markets</SelectItem>
              {markets.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Total Leads" value={stats.total.toString()} />
        <StatCard icon={DollarSign} label="Avg Order Value" value={fmt(stats.avgOrder)} />
        <StatCard icon={DollarSign} label="Total Order Value" value={fmt(stats.orders)} />
        <StatCard icon={TrendingUp} label="Engaged %" value={`${stats.conv}%`} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="font-serif text-lg mb-4">Leads by Market</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byMarket} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h3 className="font-serif text-lg mb-4">Leads by Sales Rep</h3>
            <ResponsiveContainer width="100%" height={Math.max(300, byRep.length * 24)}>
              <BarChart data={byRep} layout="vertical" margin={{ left: 20, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h3 className="font-serif text-lg mb-4">Leads by Collection</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RPieChart>
                <Pie data={byCollection} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {byCollection.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </RPieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h3 className="font-serif text-lg mb-4">Order Value by Market</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byMarket} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="p-5 flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-serif mt-1">{value}</p>
      </div>
      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
    </Card>
  );
}
