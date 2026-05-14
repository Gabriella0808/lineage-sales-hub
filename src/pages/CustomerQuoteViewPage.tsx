import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

type QuoteData = {
  id: string;
  customer_name: string;
  customer_company: string | null;
  status: string;
  total: number;
  intro_message: string | null;
  footer_message: string | null;
  sent_at: string | null;
  created_at: string;
  company_name: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  items: Array<{ id: string; sku: string; name: string; qty: number; unit_price: number; line_total: number }>;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export default function CustomerQuoteViewPage() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_customer_quote_by_token", { _token: token });
      if (error) setError(error.message);
      else if (!data || (data as any[]).length === 0) setError("Quote not found or no longer available.");
      else setQuote((data as any[])[0] as QuoteData);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !quote) return <div className="min-h-screen grid place-items-center text-muted-foreground p-8 text-center">{error || "Not found"}</div>;

  const brand = quote.company_name || "Your Quote";

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card className="p-8 space-y-6 bg-background">
          <div className="flex items-start justify-between gap-4">
            <div>
              {quote.logo_url ? (
                <img src={quote.logo_url} alt={brand} className="h-14 max-w-[220px] object-contain" />
              ) : (
                <h1 className="text-2xl font-serif">{brand}</h1>
              )}
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                {quote.company_name && quote.logo_url && <div>{quote.company_name}</div>}
                {quote.contact_address && <div>{quote.contact_address}</div>}
                {quote.contact_email && <div>{quote.contact_email}</div>}
                {quote.contact_phone && <div>{quote.contact_phone}</div>}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Quote</div>
              <div className="font-mono text-xs">#{quote.id.slice(0, 8)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(quote.sent_at || quote.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Prepared for</div>
            <div className="font-medium">{quote.customer_name}</div>
            {quote.customer_company && <div className="text-sm text-muted-foreground">{quote.customer_company}</div>}
          </div>

          {quote.intro_message && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{quote.intro_message}</p>
          )}

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2 w-16">Qty</th>
                  <th className="text-right px-3 py-2 w-28">Price</th>
                  <th className="text-right px-3 py-2 w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quote.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-muted-foreground">{it.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{Number(it.qty)}</td>
                    <td className="px-3 py-2 text-right">{fmt(Number(it.unit_price))}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(Number(it.line_total))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={3} className="px-3 py-3 text-right font-medium">Total</td>
                  <td className="px-3 py-3 text-right text-lg font-semibold">{fmt(Number(quote.total))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {quote.footer_message && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{quote.footer_message}</p>
            </>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Questions? Reply to {quote.contact_email || "the sender"}.
        </p>
      </div>
    </div>
  );
}
