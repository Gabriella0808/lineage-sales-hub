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
import { Loader2, Plus, MapPin, Calendar, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { CollectionsMultiSelect } from "@/components/CollectionsMultiSelect";

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

type SalesRep = {
  id: string;
  name: string;
  email: string | null;
};

const fmt = (n: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

const emptyLead = {
  contact_name: "", dealer: "", email: "", additional_email: "", phone: "",
  sales_rep: "", sales_rep_id: "", rep_email: "", product_interest: "", order_amount: "", status: "New", notes: "",
  followup_enabled: false, followup_title: "", followup_description: "", followup_due_date: "",
};

const emptyMarket = { name: "", location: "", season: "Spring", year: new Date().getFullYear() };

export default function CaptureLeadsPage() {
  const { user } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);

  const [marketDialog, setMarketDialog] = useState(false);
  const [marketForm, setMarketForm] = useState(emptyMarket);

  const [leadDialog, setLeadDialog] = useState<string | null>(null); // market id (when creating)
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingOriginalRepEmail, setEditingOriginalRepEmail] = useState<string>("");
  const [editRepCleared, setEditRepCleared] = useState<boolean>(false);

  const load = async () => {
    setLoading(true);
    const [m, l, r] = await Promise.all([
      supabase.from("trade_show_markets").select("*"),
      supabase.from("trade_show_leads").select("*").order("created_at", { ascending: false }),
      supabase.from("sales_reps").select("id,name,email").order("name"),
    ]);
    if (m.error) toast.error(m.error.message);
    else {
      // Sort: newest first. Prefer created_at (so freshly added markets always land on top),
      // then start_date, then inferred season+year from name.
      const seasonOrder: Record<string, number> = { winter: 1, spring: 2, summer: 3, fall: 4, autumn: 4 };
      const inferRecency = (mk: Market & { created_at?: string }): number => {
        const name = (mk.name || "").toLowerCase();
        const yearMatch = name.match(/(20\d{2})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : (mk.year ?? 0);
        let seasonRank = 0;
        for (const s of Object.keys(seasonOrder)) {
          if (name.includes(s)) { seasonRank = seasonOrder[s]; break; }
        }
        return year * 10 + seasonRank;
      };
      const sorted = [...(m.data ?? [])].sort((a: any, b: any) => {
        const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
        const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (cb !== ca) return cb - ca;
        const sa = a.start_date ? new Date(a.start_date).getTime() : 0;
        const sb = b.start_date ? new Date(b.start_date).getTime() : 0;
        if (sb !== sa) return sb - sa;
        return inferRecency(b) - inferRecency(a) || a.name.localeCompare(b.name);
      });
      setMarkets(sorted);
    }
    if (l.error) toast.error(l.error.message); else setLeads((l.data ?? []) as Lead[]);
    if (r.error) toast.error(r.error.message); else setSalesReps((r.data ?? []) as SalesRep[]);
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

  const openEditLead = (l: Lead) => {
    const matchedRep = salesReps.find(
      (r) => (l.sales_rep && r.name === l.sales_rep) || (l.rep_email && r.email && r.email.toLowerCase() === l.rep_email.toLowerCase())
    );
    setLeadForm({
      ...emptyLead,
      contact_name: l.contact_name ?? "",
      dealer: l.dealer ?? "",
      email: l.email ?? "",
      phone: l.phone ?? "",
      sales_rep: l.sales_rep ?? "",
      sales_rep_id: matchedRep?.id ?? "",
      rep_email: l.rep_email ?? "",
      product_interest: l.product_interest ?? "",
      order_amount: l.order_amount != null ? String(l.order_amount) : "",
      status: l.status ?? "New",
    });
    setEditingLeadId(l.id);
    setEditingOriginalRepEmail((l.rep_email ?? "").trim().toLowerCase());
    setEditRepCleared(false);
    setLeadDialog(l.market_id ?? markets.find((m) => m.name === l.trade_show)?.id ?? null);
  };

  const submitLead = async () => {
    if (!leadDialog) return;
    if (!leadForm.contact_name.trim()) return toast.error("Contact name is required");
    const market = markets.find((m) => m.id === leadDialog);

    if (editingLeadId) {
      const editingLeadIdSnapshot = editingLeadId;
      const { error } = await supabase.from("trade_show_leads").update({
        contact_name: leadForm.contact_name.trim(),
        dealer: leadForm.dealer.trim() || null,
        email: leadForm.email.trim() || null,
        phone: leadForm.phone.trim() || null,
        sales_rep: leadForm.sales_rep.trim() || null,
        rep_email: leadForm.rep_email.trim() || null,
        product_interest: leadForm.product_interest.trim() || null,
        order_amount: parseFloat(leadForm.order_amount) || 0,
        status: leadForm.status,
        notes: leadForm.notes.trim() || null,
        market_id: leadDialog,
        trade_show: market?.name ?? null,
      }).eq("id", editingLeadIdSnapshot);
      if (error) return toast.error(error.message);
      toast.success("Lead updated");

      // Trigger rep notification if the rep was (re)assigned during this edit:
      // - rep was cleared and re-selected (even if same rep), OR
      // - rep email changed to a different non-empty value
      const newRepEmail = leadForm.rep_email.trim();
      const newRepEmailLc = newRepEmail.toLowerCase();
      const shouldNotify =
        !!newRepEmail &&
        (editRepCleared || newRepEmailLc !== editingOriginalRepEmail);
      if (shouldNotify) {
        const orderNum = parseFloat(leadForm.order_amount) || 0;
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "new-lead-assigned",
            recipientEmail: newRepEmail,
            idempotencyKey: `lead-reassigned-${editingLeadIdSnapshot}-${Date.now()}`,
            templateData: {
              repName: leadForm.sales_rep.trim() || undefined,
              contactName: leadForm.contact_name.trim() || undefined,
              dealer: leadForm.dealer.trim() || undefined,
              collections: leadForm.product_interest.trim() || undefined,
              orderAmount: orderNum > 0 ? fmt(orderNum) : undefined,
              market: market?.name || undefined,
              leadRef: editingLeadIdSnapshot.slice(0, 8).toUpperCase(),
            },
          },
        }).then(({ error: emailErr }) => {
          if (emailErr) console.error("Lead reassignment email failed:", emailErr);
        });
      }

      setLeadDialog(null);
      setEditingLeadId(null);
      setEditingOriginalRepEmail("");
      setEditRepCleared(false);
      setLeadForm(emptyLead);
      load();
      return;
    }

    const newLeadId = crypto.randomUUID();
    const { error } = await supabase.from("trade_show_leads").insert({
      id: newLeadId,
      contact_name: leadForm.contact_name.trim(),
      dealer: leadForm.dealer.trim() || null,
      email: leadForm.email.trim() || null,
      phone: leadForm.phone.trim() || null,
      sales_rep: leadForm.sales_rep.trim() || null,
      rep_email: leadForm.rep_email.trim() || null,
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

    // Notify the assigned rep by email with the lead summary
    const repEmailToNotify = leadForm.rep_email.trim();
    if (repEmailToNotify) {
      const orderNum = parseFloat(leadForm.order_amount) || 0;
      supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "new-lead-assigned",
          recipientEmail: repEmailToNotify,
          idempotencyKey: `new-lead-${newLeadId}`,
          templateData: {
            repName: leadForm.sales_rep.trim() || undefined,
            contactName: leadForm.contact_name.trim() || undefined,
            dealer: leadForm.dealer.trim() || undefined,
            collections: leadForm.product_interest.trim() || undefined,
            orderAmount: orderNum > 0 ? fmt(orderNum) : undefined,
            market: market?.name || undefined,
            leadRef: newLeadId.slice(0, 8).toUpperCase(),
          },
        },
      }).then(({ error: emailErr }) => {
        if (emailErr) console.error("Lead email notification failed:", emailErr);
      });
    }

    // Create follow-up task if requested
    if (leadForm.followup_enabled && user?.id) {
      const title = leadForm.followup_title.trim() || `Follow up: ${leadForm.contact_name.trim()}${leadForm.dealer.trim() ? ` (${leadForm.dealer.trim()})` : ""}`;
      const descParts = [
        leadForm.followup_description.trim(),
        `— Lead from ${market?.name ?? "Trade Show"}`,
        leadForm.dealer.trim() ? `Dealer: ${leadForm.dealer.trim()}` : "",
        leadForm.email.trim() ? `Dealer Email: ${leadForm.email.trim()}` : "",
        leadForm.product_interest.trim() ? `Collections: ${leadForm.product_interest.trim()}` : "",
        Number(leadForm.order_amount) > 0 ? `Order Amount: ${fmt(Number(leadForm.order_amount))}` : "",
      ].filter(Boolean);

      // Look up rep's auth user_id (so it shows up in their portal's My Tasks)
      let assignedUserId: string | null = null;
      if (leadForm.sales_rep_id) {
        const { data: uid, error: rpcErr } = await supabase.rpc(
          "user_id_for_rep_with_email_fallback",
          { _rep_id: leadForm.sales_rep_id }
        );
        if (rpcErr) console.error("rep user lookup failed", rpcErr);
        assignedUserId = (uid as string | null) ?? null;
      }

      const { error: taskErr } = await supabase.from("manager_tasks").insert({
        user_id: user.id,
        assigned_user_id: assignedUserId,
        title,
        description: descParts.join("\n"),
        status: "todo",
        due_date: leadForm.followup_due_date || null,
      });
      if (taskErr) toast.error(`Follow-up task: ${taskErr.message}`);
      else if (!assignedUserId && leadForm.sales_rep_id) {
        toast.success("Follow-up task added to My Tasks (rep has no portal account yet)");
      } else {
        toast.success("Follow-up task created");
      }
    }

    // Sync to Mailchimp ONLY if: (1) dealer email present and (2) market is a High Point market
    const dealerEmail = leadForm.email.trim();
    const isHighPoint = market?.name && /high point/i.test(market.name);
    if (dealerEmail && isHighPoint) {
      supabase.functions.invoke("sync-mailchimp-lead", {
        body: {
          email: dealerEmail,
          market_name: market!.name,
          dealer: leadForm.dealer.trim() || null,
          contact_name: leadForm.contact_name.trim() || null,
        },
      }).then(({ data, error: mcErr }) => {
        if (mcErr) return toast.error(`Mailchimp: ${mcErr.message}`);
        if (data?.success) toast.success(`Added to Mailchimp (tag: ${data.tag})`);
        else if (data?.skipped) return;
        else if (data?.error) toast.error(`Mailchimp: ${data.error}`);
      });
    }

    setLeadDialog(null);
    setEditingLeadId(null);
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
              <Field label="Year">
                <Input type="number" value={marketForm.year} onChange={(e) => setMarketForm({ ...marketForm, year: Number(e.target.value) })} />
              </Field>
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
                    <Button size="sm" onClick={() => { setEditingLeadId(null); setLeadForm(emptyLead); setLeadDialog(m.id); }}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Capture Lead
                    </Button>
                  </div>
                  {ml.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No leads captured for this market yet.</p>
                  ) : (
                    <>
                      {/* Mobile card list */}
                      <div className="sm:hidden space-y-2">
                        {ml.map((l) => (
                          <div key={l.id} className="border rounded-lg p-3 bg-background/40">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="min-w-0">
                                <p className="font-medium text-sm">{l.contact_name || "—"}</p>
                                <p className="text-xs text-muted-foreground truncate">{l.dealer || "—"}</p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditLead(l)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLead(l.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                              {l.sales_rep && <div><span className="text-muted-foreground">Rep:</span> {l.sales_rep}</div>}
                              {l.phone && <div><span className="text-muted-foreground">Phone:</span> {l.phone}</div>}
                              {l.email && <div className="col-span-2 truncate"><span className="text-muted-foreground">Email:</span> <a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a></div>}
                            </div>
                            {l.product_interest && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {l.product_interest.split(",").map((c, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] font-normal">{c.trim()}</Badge>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t">
                              {l.status ? <Badge variant="secondary">{l.status}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                              <span className="font-medium text-sm">{l.order_amount ? fmt(l.order_amount) : ""}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Tablet/desktop table */}
                      <div className="overflow-x-auto hidden sm:block">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Contact</th>
                              <th className="text-left px-3 py-2 font-medium">Dealer</th>
                              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Dealer Email</th>
                              <th className="text-left px-3 py-2 font-medium">Rep</th>
                              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Rep Email</th>
                              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Collections</th>
                              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Phone</th>
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
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px] hidden lg:table-cell">
                                  {l.email ? <a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a> : "—"}
                                </td>
                                <td className="px-3 py-2">{l.sales_rep || "—"}</td>
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px] hidden lg:table-cell">
                                  {l.rep_email ? <a href={`mailto:${l.rep_email}`} className="hover:underline">{l.rep_email}</a> : "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground max-w-[220px] hidden md:table-cell">
                                  {l.product_interest ? (
                                    <div className="flex flex-wrap gap-1">
                                      {l.product_interest.split(",").map((c, i) => (
                                        <Badge key={i} variant="outline" className="text-xs font-normal">{c.trim()}</Badge>
                                      ))}
                                    </div>
                                  ) : "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{l.phone || "—"}</td>
                                <td className="px-3 py-2">{l.status ? <Badge variant="secondary">{l.status}</Badge> : "—"}</td>
                                <td className="px-3 py-2 text-right font-medium">{l.order_amount ? fmt(l.order_amount) : "—"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditLead(l)} aria-label="Edit lead">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLead(l.id)} aria-label="Delete lead">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog open={!!leadDialog} onOpenChange={(o) => { if (!o) { setLeadDialog(null); setEditingLeadId(null); setLeadForm(emptyLead); setEditingOriginalRepEmail(""); setEditRepCleared(false); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLeadId ? "Edit Lead" : "Capture Lead"} — {markets.find((m) => m.id === leadDialog)?.name}
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
              <div className="flex gap-2">
                <Select
                  value={leadForm.sales_rep_id}
                  onValueChange={(id) => {
                    const rep = salesReps.find((r) => r.id === id);
                    setLeadForm({
                      ...leadForm,
                      sales_rep_id: id,
                      sales_rep: rep?.name ?? "",
                      rep_email: rep?.email ?? "",
                    });
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a sales rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesReps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.name}{rep.email ? ` — ${rep.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leadForm.sales_rep_id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (editingLeadId) setEditRepCleared(true);
                      setLeadForm({
                        ...leadForm,
                        sales_rep_id: "",
                        sales_rep: "",
                        rep_email: "",
                      });
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {editingLeadId && editRepCleared && !leadForm.sales_rep_id && (
                <p className="text-xs text-muted-foreground mt-1">
                  Re-selecting a rep will send them a new lead notification email.
                </p>
              )}
            </Field>

            {/* Follow-up task for the assigned rep */}
            <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={leadForm.followup_enabled}
                  onChange={(e) => setLeadForm({ ...leadForm, followup_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm font-medium">Create follow-up task{leadForm.sales_rep ? ` for ${leadForm.sales_rep}` : ""}</span>
              </label>
              {leadForm.followup_enabled && (
                <div className="space-y-3 pl-6">
                  <Field label="Task Title">
                    <Input
                      value={leadForm.followup_title}
                      onChange={(e) => setLeadForm({ ...leadForm, followup_title: e.target.value })}
                      placeholder={`Follow up: ${leadForm.contact_name || "contact"}${leadForm.dealer ? ` (${leadForm.dealer})` : ""}`}
                    />
                  </Field>
                  <Field label="Due Date">
                    <Input
                      type="date"
                      value={leadForm.followup_due_date}
                      onChange={(e) => setLeadForm({ ...leadForm, followup_due_date: e.target.value })}
                    />
                  </Field>
                  <Field label="Task Notes">
                    <Textarea
                      value={leadForm.followup_description}
                      onChange={(e) => setLeadForm({ ...leadForm, followup_description: e.target.value })}
                      rows={2}
                      placeholder="Anything specific the rep should do…"
                    />
                  </Field>
                </div>
              )}
            </div>

            <Field label="Product of Interest">
              <CollectionsMultiSelect
                value={leadForm.product_interest ? leadForm.product_interest.split(",").map((s) => s.trim()).filter(Boolean) : []}
                onChange={(arr) => setLeadForm({ ...leadForm, product_interest: arr.join(", ") })}
              />
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
            <Button variant="outline" onClick={() => { setLeadDialog(null); setEditingLeadId(null); setLeadForm(emptyLead); setEditingOriginalRepEmail(""); setEditRepCleared(false); }}>Cancel</Button>
            <Button onClick={submitLead}>{editingLeadId ? "Save Changes" : "Create Lead"}</Button>
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
