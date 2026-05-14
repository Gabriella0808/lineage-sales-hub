import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingCart, ImageOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";

function formatPrice(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export default function CartPage() {
  const { items, subtotal, count, updateQty, removeItem, clear } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmitQuote = () => {
    toast({
      title: "Quote request submitted",
      description: `${count} item${count === 1 ? "" : "s"} sent for review.`,
    });
    clear();
    navigate("/catalog");
  };

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="page-title">Quote Cart</h1>
          <p className="page-subtitle">Items you've added for a quote request</p>
        </div>
        <Card className="p-16 text-center space-y-4">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <div>
            <p className="font-medium">Your cart is empty</p>
            <p className="text-sm text-muted-foreground mt-1">Browse the catalog to add products.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/catalog">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Browse Catalog
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Quote Cart</h1>
          <p className="page-subtitle">{count} item{count === 1 ? "" : "s"} ready for quote request</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/catalog")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Continue Shopping
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {items.map((it) => (
            <Card key={it.sku} className="p-4 flex gap-4">
              <Link to={`/catalog/${encodeURIComponent(it.sku)}`} className="h-24 w-24 flex-shrink-0 bg-muted/30 rounded overflow-hidden flex items-center justify-center">
                {it.image_url ? (
                  <img src={it.image_url} alt={it.name} className="w-full h-full object-contain" />
                ) : (
                  <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                )}
              </Link>
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.sku}</div>
                <Link to={`/catalog/${encodeURIComponent(it.sku)}`} className="font-serif text-lg leading-snug truncate hover:text-primary">
                  {it.name}
                </Link>
                {it.brand && <div className="text-sm text-muted-foreground">{it.brand}</div>}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="inline-flex items-center border rounded-md">
                    <button
                      onClick={() => updateQty(it.sku, it.quantity - 1)}
                      className="h-8 w-8 flex items-center justify-center hover:bg-muted"
                    ><Minus className="h-3 w-3" /></button>
                    <span className="w-10 text-center text-sm">{it.quantity}</span>
                    <button
                      onClick={() => updateQty(it.sku, it.quantity + 1)}
                      className="h-8 w-8 flex items-center justify-center hover:bg-muted"
                    ><Plus className="h-3 w-3" /></button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatPrice((it.base_price ?? 0) * it.quantity)}</span>
                    <button
                      onClick={() => removeItem(it.sku)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div>
          <Card className="p-6 space-y-4 sticky top-4">
            <h2 className="font-serif text-xl">Quote Summary</h2>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Estimated Total</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Final pricing, freight, and lead times will be confirmed in your quote.
            </p>
            <Button size="lg" className="w-full" onClick={handleSubmitQuote}>
              Submit Quote Request
            </Button>
            <button
              onClick={() => clear()}
              className="w-full text-xs text-muted-foreground hover:text-destructive"
            >
              Clear cart
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
