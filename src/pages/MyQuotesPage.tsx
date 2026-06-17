import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";

type QuoteItem = {
  id: string;
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  product_id: string | null;
};

type Quote = {
  id: string;
  status: string;
  total: number;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
  quote_items: QuoteItem[];
};

function formatPrice(n: number | null | undefined) {
  if (n == null) return "---";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(n));
}

function formatDate(s: string | null) {
  if (!s) return "---";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusStyle: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  declined: "bg-rose-100 text-rose-800 border-rose-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function MyQuotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addItem } = useCart();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, status, total, notes, submitted_at, created_at, quote_items(id, sku, name, qty, unit_price, line_total, product_id)")
        .eq("user_id", user.id)
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) {
        toast({ title: "Couldn't load quotes", description: error.message, variant: "destructive" });
        setQuotes([]);
        return;
      }
      setQuotes((data ?? []) as Quote[]);
    })();
  }, [user, toast]);

  const reorder = async (quote: Quote) => {
    const skus = quote.quote_items.map((i) => i.sku);
    if (skus.length === 0) return;
    const { data: products } = await supabase
      .from("products")
      .select("sku, name, brand, image_url, base_price")
      .in("sku", skus);
    const bySku = new Map((products ?? []).map((p) => [p.sku, p]));
    quote.quote_items.forEach((it) => {
      const p = bySku.get(it.sku);
      addItem({
        sku: it.sku,
        name: p?.name ?? it.name,
        brand: p?.brand ?? null,
        image_url: p?.image_url ?? null,
        base_price: p?.base_price ?? Number(it.unit_price),
      }, Number(it.qty));
    });
    toast({ title: "Items added to cart", description: `${quote.quote_items.length} item${quote.quote_items.length === 1 ? "" : "s"} from quote added.` });
    navigate("/cart");
  };

  if (quotes === null) {
    return (
      <div className="space-y-6">
        <div className="page-header"><h1 className="page-title">My Quotes</h1><p className="page-subtitle">Quote requests you've submitted</p></div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="space-y-6">
        <div className="page-header"><h1 className="page-title">My Quotes</h1><p className="page-subtitle">Quote requests you've submitted</p></div>
        <Card className="p-16 text-center space-y-4">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="font-medium">No quotes yet</p>
          <p className="text-sm text-muted-foreground">Submit a quote from the cart to see it here.</p>
          <Button asChild variant="outline">
            <Link to="/catalog"><ArrowLeft className="h-4 w-4 mr-2" />Browse Catalog</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">My Quotes</h1>
        <p className="page-subtitle">{quotes.length} quote{quotes.length === 1 ? "" : "s"} submitted</p>
      </div>
      <div className="space-y-3">
        {quotes.map((q) => {
          const isOpen = !!expanded[q.id];
          const itemCount = q.quote_items.reduce((n, i) => n + Number(i.qty), 0);
          return (
            <Card key={q.id} className="overflow-hidden">
              <div className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Quote #{q.id.slice(0, 8)}
                  </div>
                  <div className="font-serif text-lg leading-snug">
                    {formatDate(q.submitted_at ?? q.created_at)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {q.quote_items.length} product{q.quote_items.length === 1 ? "" : "s"} · {itemCount} unit{itemCount === 1 ? "" : "s"}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${statusStyle[q.status] ?? statusStyle.draft}`}>
                  {q.status}
                </Badge>
                <div className="font-semibold text-lg">{formatPrice(q.total)}</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => reorder(q)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Reorder
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded((p) => ({ ...p, [q.id]: !isOpen }))}>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {isOpen && (
                <div className="border-t bg-muted/30 p-4 space-y-2">
                  {q.quote_items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <Link to={`/catalog/${encodeURIComponent(it.sku)}`} className="hover:text-primary">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.sku}</div>
                          <div className="font-medium truncate">{it.name}</div>
                        </Link>
                      </div>
                      <div className="text-muted-foreground w-16 text-right">× {it.qty}</div>
                      <div className="w-24 text-right font-medium">{formatPrice(it.line_total)}</div>
                    </div>
                  ))}
                  {q.notes && (
                    <div className="pt-3 border-t mt-3 text-xs text-muted-foreground">
                      <span className="font-medium">Notes:</span> {q.notes}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
