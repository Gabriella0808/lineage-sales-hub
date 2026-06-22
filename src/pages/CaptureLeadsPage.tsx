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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Plus, MapPin, Calendar, Trash2, Pencil, Mail, Phone, User, Building2, Tag, DollarSign, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { CollectionsMultiSelect } from "@/components/CollectionsMultiSelect";
import { ProspectTypeSelect } from "@/components/ProspectTypeSelect";

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
  notes: string | null;
  address: string | null;
  created_at: string;
  prospect_types?: string[] | null;
  crm_account_id?: string | null;
};

type SalesRep = {
  id: string;
  name: string;
  email: string | null;
};

const fmt = (n: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

const emptyLead = {
  contact_name: "", dealer: "", email: "", additional_email: "", phone: "", address: "",
  sales_rep: "", sales_rep_id: "", rep_email: "", product_interest: "", order_amount: "", status: "New", notes: "",
  prospect_types: [] as string[],
  followup_enabled: false, followup_title: "", followup_description: "", followup_due_date: "",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const seasonFromMonth = (m: number): string => {
  if (m >= 3 && m <= 5) return "Spring";
  if (m >= 6 && m <= 8) return "Summer";
  if (m >= 9 && m <= 11) return "Fall";
  return "Winter";
};
const emptyMarket = { name: "", location: "", month: new Date().getMonth() + 1, year: new Date().getFullYear() };

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
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);

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
        // Prioritize start_date (actual market date) so the most recent/upcoming market is first
        const sa = a.start_date ? new Date(a.start_date).getTime() : 0;
        const sb = b.start_date ? new Date(b.start_date).getTime() : 0;
        if (sb !== sa) return sb - sa;
        const ir = inferRecency(b) - inferRecency(a);
        if (ir !== 0) return ir;
        // When market dates tie, sort by name (alphabetical) so order is stable and predictable
        return (a.name || "").localeCompare(b.name || "");
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
    const baseName = marketForm.name.trim();
    if (!baseName) return toast.error("Market name is required");
    const month = Number(marketForm.month);
    const year = Number(marketForm.year);
    if (!month || month < 1 || month > 12) return toast.error("Month is required");
    if (!year) return toast.error("Year is required");
    const monthName = MONTHS[month - 1];
    const suffix = `${monthName} ${year}`;
    const finalName = new RegExp(`${monthName}\\s*${year}`, "i").test(baseName)
      ? baseName
      : `${baseName} - ${suffix}`;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const { error } = await supabase.from("trade_show_markets").insert({
      name: finalName,
      location: marketForm.location.trim() || null,
      season: seasonFromMonth(month),
      year,
      start_date: startDate,
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
      address: l.address ?? "",
      sales_rep: l.sales_rep ?? "",
      sales_rep_id: matchedRep?.id ?? "",
      rep_email: l.rep_email ?? "",
      product_interest: l.product_interest ?? "",
      order_amount: l.order_amount != null ? String(l.order_amount) : "",
      status: l.status ?? "New",
      notes: l.notes ?? "",
      prospect_types: Array.isArray(l.prospect_types) ? l.prospect_types : [],
    });
    setEditingLeadId(l.id);
    setEditingOriginalRepEmail((l.rep_email ?? "").trim().toLowerCase());
    setEditRepCleared(false);
    setLeadDialog(l.market_id ?? markets.find((m) => m.name === l.trade_show)?.id ?? null);
  };

  // Create / update / unlink the linked CRM Prospect account based on selected prospect_types.
  const syncProspectAccount = async (leadId: string, existingCrmAccountId: string | null) => {
    const types = (leadForm.prospect_types || []).filter(Boolean);
    const companyName = (leadForm.dealer.trim() || leadForm.contact_name.trim());
    const [firstName, ...rest] = leadForm.contact_name.trim().split(/\s+/);
    const lastName = rest.join(" ") || null;

    if (types.length === 0) {
      // User cleared all prospect types - unlink (and remove the auto-created prospect if it's still a prospect).
      if (existingCrmAccountId) {
        await supabase.from("trade_show_leads").update({ crm_account_id: null }).eq("id", leadId);
        const { data: acct } = await supabase
          .from("crm_accounts")
          .select("id, account_type")
          .eq("id", existingCrmAccountId)
          .maybeSingle();
        if (acct && acct.account_type === "prospect") {
          await supabase.from("crm_accounts").delete().eq("id", existingCrmAccountId);
        }
      }
      return;
    }

    if (!companyName) return;

    if (existingCrmAccountId) {
      await supabase.from("crm_accounts").update({
        company_name: companyName,
        prospect_types: types,
        prospect_type: types[0] ?? null,
        contact_first_name: firstName || null,
        contact_last_name: lastName,
        main_phone: leadForm.phone.trim() || null,
        email: leadForm.email.trim() || null,
        street_1: leadForm.address.trim() || null,
        notes: leadForm.notes.trim() || null,
      }).eq("id", existingCrmAccountId);
    } else {
      const { data: created, error: cErr } = await supabase.from("crm_accounts").insert({
        company_name: companyName,
        account_type: "prospect",
        lifecycle_stage: "lead",
        status: "active",
        prospect_types: types,
        prospect_type: types[0] ?? null,
        contact_first_name: firstName || null,
        contact_last_name: lastName,
        main_phone: leadForm.phone.trim() || null,
        email: leadForm.email.trim() || null,
        street_1: leadForm.address.trim() || null,
        notes: leadForm.notes.trim() || null,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (cErr) {
        toast.error(`Prospect sync: ${cErr.message}`);
        return;
      }
      await supabase.from("trade_show_leads").update({ crm_account_id: created!.id }).eq("id", leadId);
    }
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
        address: leadForm.address.trim() || null,
        sales_rep: leadForm.sales_rep.trim() || null,
        rep_email: leadForm.rep_email.trim() || null,
        product_interest: leadForm.product_interest.trim() || null,
        order_amount: parseFloat(leadForm.order_amount) || 0,
        status: leadForm.status,
        notes: leadForm.notes.trim() || null,
        market_id: leadDialog,
        trade_show: market?.name ?? null,
        prospect_types: leadForm.prospect_types ?? [],
      } as any).eq("id", editingLeadIdSnapshot);
      if (error) return toast.error(error.message);
      toast.success("Lead updated");

      // Sync prospect link
      const existingLead = leads.find((l) => l.id === editingLeadIdSnapshot);
      await syncProspectAccount(editingLeadIdSnapshot, existingLead?.crm_account_id ?? null);

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
              dealerEmail: leadForm.email.trim() || undefined,
              collections: leadForm.product_interest.trim() || undefined,
              orderAmount: orderNum > 0 ? fmt(orderNum) : undefined,
              market: market?.name || undefined,
              notes: leadForm.notes.trim() || undefined,
              leadRef: editingLeadIdSnapshot.slice(0, 8).toUpperCase(),
            },
          },
        }).then(({ error: emailErr }) => {
          if (emailErr) console.error("Lead reassignment email failed:", emailErr);
        });
      }

      // Sync to Mailchimp on edit too - lets you trigger the automation by re-saving with a dealer email
      const editedDealerEmail = leadForm.email.trim();
      const editIsMailchimpMarket = market?.name && /high point|furniture first|atlanta/i.test(market.name);
      if (editedDealerEmail && editIsMailchimpMarket) {
        supabase.functions.invoke("sync-mailchimp-lead", {
          body: {
            email: editedDealerEmail,
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
      prospect_types: leadForm.prospect_types ?? [],
    });
    if (error) return toast.error(error.message);
    toast.success("Lead captured");

    // Create linked Prospect account if prospect types were selected
    await syncProspectAccount(newLeadId, null);

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
            dealerEmail: leadForm.email.trim() || undefined,
            collections: leadForm.product_interest.trim() || undefined,
            orderAmount: orderNum > 0 ? fmt(orderNum) : undefined,
            market: market?.name || undefined,
            notes: leadForm.notes.trim() || undefined,
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
        `--- Lead from ${market?.name ?? "Trade Show"}`,
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

    // Sync to Mailchimp ONLY if: (1) dealer email present and (2) market maps to a Mailchimp audience
    const dealerEmail = leadForm.email.trim();
    const isMailchimpMarket = market?.name && /high point|furniture first|atlanta/i.test(market.name);
    if (dealerEmail && isMailchimpMarket) {
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
                <Input value={marketForm.name} onChange={(e) => setMarketForm({ ...marketForm, name: e.target.value })} placeholder="e.g. High Point Market" />
                <p className="text-[11px] text-muted-foreground mt-1">Month and year will be appended automatically.</p>
              </Field>
              <Field label="Location">
                <Input value={marketForm.location} onChange={(e) => setMarketForm({ ...marketForm, location: e.target.value })} placeholder="e.g. High Point, NC" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Month" required>
                  <Select value={String(marketForm.month)} onValueChange={(v) => setMarketForm({ ...marketForm, month: Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((name, i) => (
                        <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Year" required>
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
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
                          <div key={l.id} role="button" tabIndex={0} onClick={() => setViewingLead(l)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewingLead(l); } }} className="border rounded-lg p-3 bg-background/40 cursor-pointer hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="min-w-0">
                                <p className="font-medium text-sm">{l.contact_name || "-"}</p>
                                <p className="text-xs text-muted-foreground truncate">{l.dealer || "-"}</p>
                              </div>
                              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditLead(l)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLead(l.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                              {l.sales_rep && <div><span className="text-muted-foreground">Rep:</span> {l.sales_rep}</div>}
                              {l.phone && <div><span className="text-muted-foreground">Phone:</span> {l.phone}</div>}
                              {l.email && <div className="col-span-2 truncate"><span className="text-muted-foreground">Email:</span> <a href={`mailto:${l.email}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{l.email}</a></div>}
                            </div>
                            {l.product_interest && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {l.product_interest.split(",").map((c, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] font-normal">{c.trim()}</Badge>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t">
                              {l.status ? <Badge variant="secondary">{l.status}</Badge> : <span className="text-xs text-muted-foreground">-</span>}
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
                              <tr key={l.id} onClick={() => setViewingLead(l)} className="border-t hover:bg-muted/30 cursor-pointer">
                                <td className="px-3 py-2 font-medium">{l.contact_name || "-"}</td>
                                <td className="px-3 py-2 text-muted-foreground">{l.dealer || "-"}</td>
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px] hidden lg:table-cell">
                                  {l.email ? <a href={`mailto:${l.email}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{l.email}</a> : "-"}
                                </td>
                                <td className="px-3 py-2">{l.sales_rep || "-"}</td>
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px] hidden lg:table-cell">
                                  {l.rep_email ? <a href={`mailto:${l.rep_email}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{l.rep_email}</a> : "-"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground max-w-[220px] hidden md:table-cell">
                                  {l.product_interest ? (
                                    <div className="flex flex-wrap gap-1">
                                      {l.product_interest.split(",").map((c, i) => (
                                        <Badge key={i} variant="outline" className="text-xs font-normal">{c.trim()}</Badge>
                                      ))}
                                    </div>
                                  ) : "-"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{l.phone || "-"}</td>
                                <td className="px-3 py-2">{l.status ? <Badge variant="secondary">{l.status}</Badge> : "-"}</td>
                                <td className="px-3 py-2 text-right font-medium">{l.order_amount ? fmt(l.order_amount) : "-"}</td>
                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
              {editingLeadId ? "Edit Lead" : "Capture Lead"} - {markets.find((m) => m.id === leadDialog)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-background border-l-4 border-accent rounded-r-lg p-4">
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Add as Prospect
                </span>
                <ProspectTypeSelect
                  multi
                  values={leadForm.prospect_types}
                  onChangeMulti={(vs) => setLeadForm({ ...leadForm, prospect_types: vs })}
                  placeholder="Select one or more prospect types..."
                  triggerClassName="bg-transparent border border-input shadow-none"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Picking any type will also add this lead to the Prospects list. Leave empty to keep it as a lead only.
                </p>
              </div>
            </div>
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
                        {rep.name}{rep.email ? ` - ${rep.email}` : ""}
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
                      placeholder="Anything specific the rep should do..."
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

      <Sheet open={!!viewingLead} onOpenChange={(o) => { if (!o) setViewingLead(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {viewingLead && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="font-serif text-2xl">{viewingLead.contact_name || "Unnamed Contact"}</SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  {viewingLead.dealer && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {viewingLead.dealer}</span>}
                </SheetDescription>
                <div className="flex items-center gap-2 pt-1">
                  {viewingLead.status && <Badge variant="secondary">{viewingLead.status}</Badge>}
                  {viewingLead.trade_show && <Badge variant="outline">{viewingLead.trade_show}</Badge>}
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <DetailSection title="Contact">
                  <DetailRow icon={User} label="Name" value={viewingLead.contact_name} />
                  <DetailRow icon={Building2} label="Dealer" value={viewingLead.dealer} />
                  <DetailRow icon={Mail} label="Email" value={viewingLead.email} href={viewingLead.email ? `mailto:${viewingLead.email}` : undefined} />
                  <DetailRow icon={Phone} label="Phone" value={viewingLead.phone} href={viewingLead.phone ? `tel:${viewingLead.phone}` : undefined} />
                </DetailSection>

                <DetailSection title="Sales Rep">
                  <DetailRow icon={User} label="Rep" value={viewingLead.sales_rep} />
                  <DetailRow icon={Mail} label="Rep Email" value={viewingLead.rep_email} href={viewingLead.rep_email ? `mailto:${viewingLead.rep_email}` : undefined} />
                </DetailSection>

                <DetailSection title="Opportunity">
                  <div className="flex items-start gap-2 text-sm">
                    <Tag className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">Collections</p>
                      {viewingLead.product_interest ? (
                        <div className="flex flex-wrap gap-1">
                          {viewingLead.product_interest.split(",").map((c, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-normal">{c.trim()}</Badge>
                          ))}
                        </div>
                      ) : <p className="text-sm">-</p>}
                    </div>
                  </div>
                  <DetailRow icon={DollarSign} label="Order Amount" value={viewingLead.order_amount ? fmt(viewingLead.order_amount) : "-"} />
                </DetailSection>

                <DetailSection title="Notes">
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    {viewingLead.notes ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{viewingLead.notes}</p>
                    ) : (
                      <p className="text-muted-foreground italic">No notes added yet. Click Edit to add notes.</p>
                    )}
                  </div>
                </DetailSection>

                <DetailSection title="Date Captured">
                  <DetailRow
                    icon={Clock}
                    label="Captured"
                    value={new Date(viewingLead.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  />
                </DetailSection>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => { const l = viewingLead; setViewingLead(null); openEditLead(l); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  <Button variant="ghost" className="flex-1 text-destructive hover:text-destructive" onClick={() => { deleteLead(viewingLead.id); setViewingLead(null); }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
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

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">{title}</h4>
      <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">{children}</div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, href }: { icon: any; label: string; value: string | null | undefined; href?: string }) {
  if (!value) value = "-";
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href && value !== "-" ? (
          <a href={href} className="hover:underline break-all">{value}</a>
        ) : (
          <p className="break-words">{value}</p>
        )}
      </div>
    </div>
  );
}
