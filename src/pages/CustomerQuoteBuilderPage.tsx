import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Send, Loader2, Search, Save, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Item = {
  id?: string;
  product_id?: string | null;
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
};

type Product = { id: string; sku: string; name: string | null; base_price: number | null; brand: string | null };

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export default function CustomerQuoteBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [intro, setIntro] = useState("");
  const [footer, setFooter] = useState("");
  const [status, setStatus] = useState("draft");
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  // product search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (isNew) {
      // prefill from branding
      if (user) supabase.from("dealer_branding").select("intro_message,footer_message").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setIntro(data.intro_message || "");
            setFooter(data.footer_message || "");
          }
        });
      return;
    }
    (async () => {
      const { data: q, error } = await supabase.from("customer_quotes").select("*").eq("id", id).maybeSingle();
      if (error || !q) { toast({ title: "Not found", variant: "destructive" }); navigate("/customer-quotes"); return; }
      setCustomerName(q.customer_name);
      setCustomerEmail(q.customer_email || "");
      setCustomerCompany(q.customer_company || "");
      setIntro(q.intro_message || "");
      setFooter(q.footer_message || "");
      setStatus(q.status);
      setShareToken(q.share_token);
      const { data: lines } = await supabase.from("customer_quote_items").select("*").eq("quote_id", id).order("created_at");
      setItems((lines || []).map((l: any) => ({
        id: l.id, product_id: l.product_id, sku: l.sku, name: l.name, qty: Number(l.qty), unit_price: Number(l.unit_price),
      })));
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const term = `%${search.trim()}%`;
      const { data } = await supabase.from("products").select("id,sku,name,base_price,brand")
        .or(`sku.ilike.${term},name.ilike.${term}`).limit(10);
      setResults((data as Product[]) || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const total = useMemo(() => items.reduce((s, i) => s + i.qty * i.unit_price, 0), [items]);
  const readonly = status !== "draft";

  const addProduct = (p: Product) => {
    if (items.some((i) => i.sku === p.sku)) return;
    setItems((s) => [...s, {
      product_id: p.id, sku: p.sku, name: p.name || p.sku,
      qty: 1, unit_price: Number(p.base_price || 0),
    }]);
    setSearch("");
    setResults([]);
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((s) => s.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const removeItem = (idx: number) => setItems((s) => s.filter((_, i) => i !== idx));

  const persist = async (newStatus?: string): Promise<string | null> => {
    if (!user) return null;
    if (!customerName.trim()) { toast({ title: "Customer name required", variant: "destructive" }); return null; }
    const payload: any = {
      dealer_user_id: user.id,
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim() || null,
      customer_company: customerCompany.trim() || null,
      intro_message: intro || null,
      footer_message: footer || null,
      total,
      status: newStatus || status,
    };
    if (newStatus === "sent" && !shareToken) {
      // share_token has DB default; only set sent_at
      payload.sent_at = new Date().toISOString();
    } else if (newStatus === "sent") {
      payload.sent_at = new Date().toISOString();
    }

    let quoteId = id && !isNew ? id : null;
    if (!quoteId) {
      const { data, error } = await supabase.from("customer_quotes").insert(payload).select("id,share_token").single();
      if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return null; }
      quoteId = data.id;
      setShareToken(data.share_token);
    } else {
      const { error } = await supabase.from("customer_quotes").update(payload).eq("id", quoteId);
      if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return null; }
    }

    // replace items
    await supabase.from("customer_quote_items").delete().eq("quote_id", quoteId);
    if (items.length) {
      const lines = items.map((it) => ({
        quote_id: quoteId, product_id: it.product_id || null, sku: it.sku, name: it.name,
        qty: it.qty, unit_price: it.unit_price, line_total: it.qty * it.unit_price,
      }));
      const { error: liErr } = await supabase.from("customer_quote_items").insert(lines);
      if (liErr) { toast({ title: "Items save failed", description: liErr.message, variant: "destructive" }); return null; }
    }
    return quoteId;
  };

  const handleSave = async () => {
    setSaving(true);
    const qid = await persist();
    setSaving(false);
    if (qid) {
      toast({ title: "Draft saved" });
      if (isNew) navigate(`/customer-quotes/${qid}`, { replace: true });
    }
  };

  const handleSend = async () => {
    if (!customerEmail.trim()) {
      toast({ title: "Customer email required to send", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }
    setSending(true);
    const qid = await persist("sent");
    if (!qid) { setSending(false); return; }

    // Re-fetch share_token & branding
    const { data: q } = await supabase.from("customer_quotes").select("share_token").eq("id", qid).single();
    const { data: branding } = await supabase.from("dealer_branding").select("*").eq("user_id", user!.id).maybeSingle();
    const token = q?.share_token;
    const viewUrl = `${window.location.origin}/q/${token}`;

    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "customer-quote-sent",
        recipientEmail: customerEmail.trim(),
        idempotencyKey: `customer-quote-sent-${qid}`,
        templateData: {
          customerName,
          companyName: branding?.company_name || "Your Quote",
          logoUrl: branding?.logo_url || undefined,
          introMessage: intro || undefined,
          footerMessage: footer || undefined,
          contactEmail: branding?.contact_email || undefined,
          contactPhone: branding?.contact_phone || undefined,
          total: fmt(total),
          itemCount: items.length,
          viewUrl,
        },
      },
    });
    setSending(false);
    if (error) {
      toast({ title: "Email failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Quote sent", description: `Emailed to ${customerEmail}` });
      setStatus("sent");
      if (isNew) navigate(`/customer-quotes/${qid}`, { replace: true });
    }
  };

  const copyLink = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/q/${shareToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/customer-quotes"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={status === "draft" ? "secondary" : "default"} className="capitalize">{status}</Badge>
          {shareToken && status !== "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={copyLink}><Copy className="h-4 w-4 mr-1" /> Copy link</Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/q/${shareToken}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> View</a>
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="font-medium">Customer</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Customer name *</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={readonly} />
          </div>
          <div>
            <Label>Customer email</Label>
            <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} disabled={readonly} />
          </div>
          <div className="sm:col-span-2">
            <Label>Company (optional)</Label>
            <Input value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} disabled={readonly} />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Line items</h2>
          <span className="text-sm text-muted-foreground">{items.length} item(s)</span>
        </div>

        {!readonly && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search products by SKU or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {(searching || results.length > 0) && (
              <Card className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-y-auto">
                {searching && <div className="p-3 text-sm text-muted-foreground">Searching…</div>}
                {results.map((p) => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} className="w-full text-left p-3 hover:bg-muted flex items-center gap-3 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.name || p.sku}</div>
                      <div className="text-xs text-muted-foreground">{p.sku} {p.brand ? `· ${p.brand}` : ""}</div>
                    </div>
                    <div className="text-sm">{fmt(Number(p.base_price || 0))}</div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </Card>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No items yet.</div>
        ) : (
          <div className="divide-y">
            {items.map((it, idx) => (
              <div key={idx} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{it.name}</div>
                  <div className="text-xs text-muted-foreground">{it.sku}</div>
                </div>
                <Input type="number" min={1} value={it.qty} onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value) || 1) })} className="w-20" disabled={readonly} />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">$</span>
                  <Input type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Math.max(0, Number(e.target.value) || 0) })} className="w-28" disabled={readonly} />
                </div>
                <div className="w-24 text-right font-medium">{fmt(it.qty * it.unit_price)}</div>
                {!readonly && (
                  <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
            <Separator />
            <div className="pt-3 flex items-center justify-end gap-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-semibold">{fmt(total)}</span>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-medium">Message</h2>
        <div>
          <Label>Intro</Label>
          <Textarea rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} disabled={readonly} placeholder="Thanks for stopping by — here is the quote we discussed." />
        </div>
        <div>
          <Label>Footer / terms</Label>
          <Textarea rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} disabled={readonly} placeholder="Quote valid for 30 days." />
        </div>
      </Card>

      {!readonly && (
        <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background py-3">
          <Button variant="outline" onClick={handleSave} disabled={saving || sending}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save draft
          </Button>
          <Button onClick={handleSend} disabled={saving || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Send to customer
          </Button>
        </div>
      )}
    </div>
  );
}
