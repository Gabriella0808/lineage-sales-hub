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
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Plus, MapPin, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Market = {
  id: string;
  name: string;
  location: string | null;
  season: string | null;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

type Lead = {
  id: string;
  contact_name: string | null;
  dealer: string | null;
  email: string | null;
  rep_email: string | null;
  phone: string | null;
  trade_show: string | null;
  sales_rep: string | null;
  product_interest: string | null;
  order_amount: number | null;
  status: string | null;
  market_id: string | null;
  created_at: string;
};

const fmt = (n: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

const emptyLead = {
  contact_name: "", dealer: "", email: "", additional_email: "", phone: "",
  sales_rep: "", product_interest: "", order_amount: "", status: "New", notes: "",
};

const emptyMarket = { name: "", location: "", season: "Spring", year: new Date().getFullYear() };

export default function CaptureLeadsPage() {
  const { user } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [marketDialog, setMarketDialog] = useState(false);
  const [marketForm, setMarketForm] = useState(emptyMarket);

  const [leadDialog, setLeadDialog] = useState<string | null>(null); // market id
  const [leadForm, setLeadForm] = useState(emptyLead);

  const load = async () => {
    setLoading(true);
    const [m, l] = await Promise.all([
      supabase.from("trade_show_markets").select("*"),
      supabase.from("trade_show_leads").select("*").order("created_at", { ascending: false }),
    ]);
    if (m.error) toast.error(m.error.message);
    else {
      // Sort: most recent first. Use start_date, then infer from name (season + year), then year, then name.
      const seasonOrder: Record<string, number> = { winter: 1, spring: 2, summer: 3, fall: 4, autumn: 4 };
      const inferRecency = (mk: Market): number => {
        if (mk.start_date) return new Date(mk.start_date).getTime();
        const name = (mk.name || "").toLowerCase();
        const yearMatch = name.match(/(20\d{2})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : (mk.year ?? 0);
        let seasonRank = 0;
        for (const s of Object.keys(seasonOrder)) {
          if (name.includes(s)) { seasonRank = seasonOrder[s]; break; }
        }
        return year * 10 + seasonRank;
      };
      const sorted = [...(m.data ?? [])].sort((a, b) => inferRecency(b) - inferRecency(a) || a.name.localeCompare(b.name));
      setMarkets(sorted);
    }
    if (l.error) toast.error(l.error.message); else setLeads((l.data ?? []) as Lead[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const leadsByMarket = useMemo(() => {
    const map = new Map<string, Lead[]>();
    markets.forEach((m) => map.set(m.id, []));
    leads.forEach((l) => {
      let key = l.market_id;
      if (!key) {
        const matched = markets.find((m) => m.name === l.trade_show);
        if (matched) key = matched.id;
      }
      if (key && map.has(key)) map.get(key)!.push(l);
    });
    return map;
  }, [leads, markets]);

  const submitMarket = async () => {
    if (!marketForm.name.trim()) return toast.error("Market name is required");
    const { error } = await supabase.from("trade_show_markets").insert({
      name: marketForm.name.trim(),
      location: marketForm.location.trim() || null,
      season: marketForm.season || null,
      year: Number(marketForm.year) || null,
      created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Market added");
    setMarketDialog(false);
    setMarketForm(emptyMarket);
    load();
  };

  const deleteMarket = async (id: string) => {
    if (!confirm("Delete this market? Leads stay but become unassigned.")) return;
    const { error } = await supabase.from("trade_show_markets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Market deleted");
    load();
  };

  const submitLead = async () => {
    if (!leadDialog) return;
    if (!leadForm.contact_name.trim()) return toast.error("Contact name is required");
    const market = markets.find((m) => m.id === leadDialog);
    const { error } = await supabase.from("trade_show_leads").insert({
      contact_name: leadForm.contact_name.trim(),
      dealer: leadForm.dealer.trim() || null,
      email: leadForm.email.trim() || null,
      phone: leadForm.phone.trim() || null,
      sales_rep: leadForm.sales_rep.trim() || null,
      product_interest: leadForm.product_interest.trim() || null,
      order_amount: parseFloat(leadForm.order_amount) || 0,
      status: leadForm.status,
      notes: leadForm.notes.trim() || null,
      market_id: leadDialog,
      trade_show: market?.name ?? null,
      lead_date: new Date().toISOString().slice(0, 10),
      created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Lead captured");
    setLeadDialog(null);
    setLeadForm(emptyLead);
    load();
  };

  const deleteLead = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    const { error } = await supabase.from("trade_show_leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Capture Leads</h1>
          <p className="page-subtitle">Add leads grouped by market</p>
        </div>
        <Dialog open={marketDialog} onOpenChange={setMarketDialog}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Market</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Market</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Market Name" required>
                <Input value={marketForm.name} onChange={(e) => setMarketForm({ ...marketForm, name: e.target.value })} placeholder="e.g. High Point Spring 2026" />
              </Field>
              <Field label="Location">
                <Input value={marketForm.location} onChange={(e) => setMarketForm({ ...marketForm, location: e.target.value })} placeholder="e.g. High Point, NC" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Season">
                  <Select value={marketForm.season} onValueChange={(v) => setMarketForm({ ...marketForm, season: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Spring">Spring</SelectItem>
                      <SelectItem value="Summer">Summer</SelectItem>
                      <SelectItem value="Fall">Fall</SelectItem>
                      <SelectItem value="Winter">Winter</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Year">
                  <Input type="number" value={marketForm.year} onChange={(e) => setMarketForm({ ...marketForm, year: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMarketDialog(false)}>Cancel</Button>
              <Button onClick={submitMarket}>Create Market</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : markets.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No markets yet. Click "Add Market" to create your first one.
        </Card>
      ) : (
        <Accordion type="multiple" defaultValue={markets.slice(0, 1).map((m) => m.id)} className="space-y-3">
          {markets.map((m) => {
            const ml = leadsByMarket.get(m.id) ?? [];
            const total = ml.reduce((s, l) => s + (Number(l.order_amount) || 0), 0);
            return (
              <AccordionItem key={m.id} value={m.id} className="border rounded-lg bg-card px-4">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex flex-1 items-center justify-between gap-3 pr-3">
                    <div className="text-left">
                      <h3 className="font-serif text-lg">{m.name}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {m.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {m.location}</span>}
                        {m.season && m.year && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {m.season} {m.year}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{ml.length} leads</Badge>
                      {total > 0 && <Badge>{fmt(total)}</Badge>}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="flex justify-end gap-2 mb-3">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteMarket(m.id); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Market
                    </Button>
                    <Button size="sm" onClick={() => { setLeadForm(emptyLead); setLeadDialog(m.id); }}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Capture Lead
                    </Button>
                  </div>
                  {ml.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No leads captured for this market yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Contact</th>
                            <th className="text-left px-3 py-2 font-medium">Dealer</th>
                            <th className="text-left px-3 py-2 font-medium">Dealer Email</th>
                            <th className="text-left px-3 py-2 font-medium">Rep</th>
                            <th className="text-left px-3 py-2 font-medium">Rep Email</th>
                            <th className="text-left px-3 py-2 font-medium">Collections</th>
                            <th className="text-left px-3 py-2 font-medium">Phone</th>
                            <th className="text-left px-3 py-2 font-medium">Status</th>
                            <th className="text-right px-3 py-2 font-medium">Order</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ml.map((l) => (
                            <tr key={l.id} className="border-t hover:bg-muted/30">
                              <td className="px-3 py-2 font-medium">{l.contact_name || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{l.dealer || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                                {l.email ? <a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a> : "—"}
                              </td>
                              <td className="px-3 py-2">{l.sales_rep || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                                {l.rep_email ? <a href={`mailto:${l.rep_email}`} className="hover:underline">{l.rep_email}</a> : "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[220px]">
                                {l.product_interest ? (
                                  <div className="flex flex-wrap gap-1">
                                    {l.product_interest.split(",").map((c, i) => (
                                      <Badge key={i} variant="outline" className="text-xs font-normal">{c.trim()}</Badge>
                                    ))}
                                  </div>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{l.phone || "—"}</td>
                              <td className="px-3 py-2">{l.status ? <Badge variant="secondary">{l.status}</Badge> : "—"}</td>
                              <td className="px-3 py-2 text-right font-medium">{l.order_amount ? fmt(l.order_amount) : "—"}</td>
                              <td className="px-3 py-2">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLead(l.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog open={!!leadDialog} onOpenChange={(o) => !o && setLeadDialog(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Capture Lead — {markets.find((m) => m.id === leadDialog)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Contact First and Last Name" required>
              <Input value={leadForm.contact_name} onChange={(e) => setLeadForm({ ...leadForm, contact_name: e.target.value })} placeholder="Enter contact name" />
            </Field>
            <Field label="Dealer">
              <Input value={leadForm.dealer} onChange={(e) => setLeadForm({ ...leadForm, dealer: e.target.value })} placeholder="Enter dealer name" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <Input type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} placeholder="contact@company.com" />
              </Field>
              <Field label="Phone">
                <Input value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} placeholder="+1 (555) 123-4567" />
              </Field>
            </div>
            <Field label="Sales Rep">
              <Input value={leadForm.sales_rep} onChange={(e) => setLeadForm({ ...leadForm, sales_rep: e.target.value })} placeholder="Assigned rep" />
            </Field>
            <Field label="Product of Interest">
              <Input value={leadForm.product_interest} onChange={(e) => setLeadForm({ ...leadForm, product_interest: e.target.value })} placeholder="Products" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order Amount">
                <Input type="number" value={leadForm.order_amount} onChange={(e) => setLeadForm({ ...leadForm, order_amount: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Status">
                <Select value={leadForm.status} onValueChange={(v) => setLeadForm({ ...leadForm, status: v })}>
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
            </div>
            <Field label="Notes">
              <Textarea value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} rows={3} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadDialog(null)}>Cancel</Button>
            <Button onClick={submitLead}>Create Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
