import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, RefreshCw, Users, DollarSign, Building2, Search } from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string;
  contact_name: string | null;
  dealer: string | null;
  email: string | null;
  additional_email: string | null;
  phone: string | null;
  trade_show: string | null;
  sales_rep: string | null;
  product_interest: string | null;
  order_amount: number | null;
  status: string | null;
  notes: string | null;
  lead_date: string | null;
  created_at: string;
};

const formatCurrency = (n: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

export default function TradeShowLeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    contact_name: "", dealer: "", email: "", additional_email: "", phone: "",
    trade_show: "", sales_rep: "", product_interest: "", order_amount: "",
    status: "New", notes: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trade_show_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setLeads((data ?? []) as Lead[]);
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

  const markets = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => l.trade_show && set.add(l.trade_show));
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (marketFilter !== "all" && l.trade_show !== marketFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const blob = [l.contact_name, l.dealer, l.email, l.sales_rep, l.product_interest]
          .filter(Boolean).join(" ").toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [leads, marketFilter, search]);

  const stats = useMemo(() => {
    const totalOrders = filtered.reduce((s, l) => s + (Number(l.order_amount) || 0), 0);
    const dealers = new Set(filtered.map((l) => l.dealer).filter(Boolean)).size;
    return { count: filtered.length, totalOrders, dealers };
  }, [filtered]);

  const submit = async () => {
    if (!form.contact_name.trim()) return toast.error("Contact name is required");
    if (!form.trade_show.trim()) return toast.error("Trade show is required");
    const payload = {
      contact_name: form.contact_name.trim(),
      dealer: form.dealer.trim() || null,
      email: form.email.trim() || null,
      additional_email: form.additional_email.trim() || null,
      phone: form.phone.trim() || null,
      trade_show: form.trade_show.trim(),
      sales_rep: form.sales_rep.trim() || null,
      product_interest: form.product_interest.trim() || null,
      order_amount: parseFloat(form.order_amount) || 0,
      status: form.status || "New",
      notes: form.notes.trim() || null,
      lead_date: new Date().toISOString().slice(0, 10),
      created_by: user?.id ?? null,
    };
    const { error } = await supabase.from("trade_show_leads").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Lead added");
    setOpen(false);
    setForm({
      contact_name: "", dealer: "", email: "", additional_email: "", phone: "",
      trade_show: form.trade_show, sales_rep: "", product_interest: "", order_amount: "",
      status: "New", notes: "",
    });
    load();
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Trade Show Leads</h1>
          <p className="page-subtitle">Capture and manage leads from every market</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from monday.com"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> New Lead</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Capture New Lead</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Contact First and Last Name" required>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Enter contact name" />
                </Field>
                <Field label="Dealer">
                  <Input value={form.dealer} onChange={(e) => setForm({ ...form, dealer: e.target.value })} placeholder="Enter dealer name" />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@company.com" />
                </Field>
                <Field label="Additional Email">
                  <Input type="email" value={form.additional_email} onChange={(e) => setForm({ ...form, additional_email: e.target.value })} placeholder="alternate@company.com" />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 123-4567" />
                </Field>
                <Field label="Trade Show / Event" required>
                  <Input value={form.trade_show} onChange={(e) => setForm({ ...form, trade_show: e.target.value })} placeholder="e.g. High Point Spring 2026" list="market-list" />
                  <datalist id="market-list">{markets.map((m) => <option key={m} value={m} />)}</datalist>
                </Field>
                <Field label="Sales Rep">
                  <Input value={form.sales_rep} onChange={(e) => setForm({ ...form, sales_rep: e.target.value })} placeholder="Assigned rep" />
                </Field>
                <Field label="Product of Interest">
                  <Input value={form.product_interest} onChange={(e) => setForm({ ...form, product_interest: e.target.value })} placeholder="Products" />
                </Field>
                <Field label="Order Amount">
                  <Input type="number" value={form.order_amount} onChange={(e) => setForm({ ...form, order_amount: e.target.value })} placeholder="0" />
                </Field>
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Contacted">Contacted</SelectItem>
                      <SelectItem value="Qualified">Qualified</SelectItem>
                      <SelectItem value="Passed to Rep">Passed to Rep</SelectItem>
                      <SelectItem value="Disqualified">Disqualified</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Notes">
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit}>Create Lead</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={Users} label="Total Leads" value={stats.count.toString()} />
        <StatCard icon={Building2} label="Unique Dealers" value={stats.dealers.toString()} />
        <StatCard icon={DollarSign} label="Total Order Value" value={formatCurrency(stats.totalOrders)} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search leads…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={marketFilter} onValueChange={setMarketFilter}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Filter by market" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All markets</SelectItem>
            {markets.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading leads…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No leads yet. Click "Sync from monday.com" to import from your Trade Show Leads board, or add one manually.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((l) => (
            <Card key={l.id} className="p-5 flex flex-col gap-2 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-serif text-lg leading-tight">{l.contact_name || "—"}</h3>
                {l.status && <Badge variant="secondary">{l.status}</Badge>}
              </div>
              {l.dealer && <p className="text-sm text-muted-foreground">{l.dealer}</p>}
              <div className="text-sm space-y-1 mt-1">
                {l.email && <div className="truncate">✉ {l.email}</div>}
                {l.phone && <div>☎ {l.phone}</div>}
                {l.product_interest && <div className="text-muted-foreground">Product: {l.product_interest}</div>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {l.trade_show && <Badge variant="outline">{l.trade_show}</Badge>}
                {l.sales_rep && <Badge variant="outline">Rep: {l.sales_rep}</Badge>}
                {!!l.order_amount && <Badge>{formatCurrency(l.order_amount)}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
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
