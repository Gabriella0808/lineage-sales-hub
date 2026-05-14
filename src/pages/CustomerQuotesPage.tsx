import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Send, Settings as SettingsIcon, ExternalLink, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import DealerBrandingDialog from "@/components/DealerBrandingDialog";

type Row = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_company: string | null;
  status: string;
  total: number;
  share_token: string;
  sent_at: string | null;
  created_at: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

function statusVariant(s: string) {
  if (s === "sent") return "default" as const;
  if (s === "accepted") return "default" as const;
  if (s === "draft") return "secondary" as const;
  return "outline" as const;
}

export default function CustomerQuotesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandingOpen, setBrandingOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_quotes")
      .select("id,customer_name,customer_email,customer_company,status,total,share_token,sent_at,created_at")
      .eq("dealer_user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load quotes", description: error.message, variant: "destructive" });
    setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const remove = async (id: string) => {
    if (!confirm("Delete this quote?")) return;
    const { error } = await supabase.from("customer_quotes").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/q/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="page-header">
          <h1 className="page-title">Customer Quotes</h1>
          <p className="page-subtitle">Build branded quotes for your customers and send them by email.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBrandingOpen(true)}>
            <SettingsIcon className="h-4 w-4 mr-2" /> Branding
          </Button>
          <Button asChild>
            <Link to="/customer-quotes/new"><Plus className="h-4 w-4 mr-2" /> New quote</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-12 text-center text-muted-foreground">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground space-y-3">
          <p>No customer quotes yet.</p>
          <Button asChild><Link to="/customer-quotes/new">Create your first quote</Link></Button>
        </Card>
      ) : (
        <Card className="divide-y">
          {rows.map((q) => (
            <div key={q.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link to={`/customer-quotes/${q.id}`} className="font-medium truncate hover:underline">
                    {q.customer_name}
                  </Link>
                  <Badge variant={statusVariant(q.status)} className="capitalize">{q.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {q.customer_company || q.customer_email || "—"} · {new Date(q.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right font-medium">{fmt(Number(q.total))}</div>
              <div className="flex items-center gap-1">
                {q.status !== "draft" && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => copyLink(q.share_token)} title="Copy share link">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="Open customer view">
                      <a href={`/q/${q.share_token}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" asChild title="Edit / send">
                  <Link to={`/customer-quotes/${q.id}`}><Send className="h-4 w-4" /></Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(q.id)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <DealerBrandingDialog open={brandingOpen} onOpenChange={setBrandingOpen} />
    </div>
  );
}
