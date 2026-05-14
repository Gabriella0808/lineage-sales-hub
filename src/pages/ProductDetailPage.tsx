import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ImageOff, Minus, Plus, ShoppingCart, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/contexts/CartContext";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  collection: string | null;
  description: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  base_price: number | null;
  stock_status: string | null;
  inventory_level: number | null;
};

function formatPrice(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export default function ProductDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { toast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!sku) return;
    let cancelled = false;
    setLoading(true);
    setActiveImg(0);
    setImgError(false);
    setQty(1);
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, sku, name, brand, category, collection, description, image_url, image_urls, base_price, stock_status, inventory_level")
        .eq("sku", decodeURIComponent(sku))
        .maybeSingle();
      if (!cancelled) {
        setProduct(data as Product | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sku]);

  if (loading) {
    return <div className="p-12 text-center text-muted-foreground">Loading product…</div>;
  }
  if (!product) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-muted-foreground">Product not found.</p>
        <Button variant="outline" onClick={() => navigate("/catalog")}>Back to Catalog</Button>
      </div>
    );
  }

  const images = product.image_urls?.length ? product.image_urls : (product.image_url ? [product.image_url] : []);
  const oos = (product.inventory_level ?? 0) <= 0;
  const showImage = images[activeImg] && !imgError;

  const handleAddToCart = () => {
    addItem({
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      image_url: product.image_url,
      base_price: product.base_price,
    }, qty);
    toast({ title: "Added to cart", description: `${qty} × ${product.name}` });
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/catalog")}
        className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Catalog
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Image side */}
        <div className="space-y-4">
          <div className="relative aspect-square bg-muted/30 rounded-lg overflow-hidden flex items-center justify-center">
            {showImage ? (
              <img
                src={images[activeImg]}
                alt={product.name}
                onError={() => setImgError(true)}
                className="w-full h-full object-contain p-8"
              />
            ) : (
              <ImageOff className="h-16 w-16 text-muted-foreground/40" />
            )}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => { setActiveImg((i) => (i - 1 + images.length) % images.length); setImgError(false); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/90 border shadow-sm flex items-center justify-center hover:bg-background"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setActiveImg((i) => (i + 1) % images.length); setImgError(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/90 border shadow-sm flex items-center justify-center hover:bg-background"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveImg(i); setImgError(false); }}
                  className={cn(
                    "h-20 w-20 rounded-md border-2 overflow-hidden flex-shrink-0 bg-muted/20",
                    i === activeImg ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  <img src={url} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info side */}
        <div className="space-y-5">
          <nav className="text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span className="mx-1.5">/</span>
            <Link to="/catalog" className="hover:text-foreground">Catalog</Link>
            <span className="mx-1.5">/</span>
            <span className="text-foreground">{product.name}</span>
          </nav>

          <div>
            <h1 className="font-serif text-3xl md:text-4xl leading-tight">{product.name}</h1>
            {product.brand && (
              <p className="text-muted-foreground mt-2">By {product.brand}</p>
            )}
            <p className="text-sm text-muted-foreground mt-0.5">SKU: {product.sku}</p>
          </div>

          <div>
            <div className="text-3xl font-semibold">{formatPrice(product.base_price)}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Dealer Price</div>
          </div>

          <div>
            {oos ? (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold bg-destructive text-destructive-foreground">
                Out of Stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-success/15 text-success border border-success/25">
                <Check className="h-3.5 w-3.5" />
                {product.inventory_level} in stock
              </span>
            )}
          </div>

          <div className="flex gap-3 items-stretch">
            <div className="inline-flex items-center border rounded-md">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-12 w-12 flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 h-12 text-center bg-transparent border-x focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="h-12 w-12 flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button
              size="lg"
              onClick={handleAddToCart}
              disabled={oos}
              className="flex-1 h-12 text-base"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {oos ? "Out of Stock" : "Add to Cart"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {product.collection && <Badge variant="outline" className="rounded-full">{product.collection}</Badge>}
            {product.category && <Badge variant="outline" className="rounded-full">{product.category}</Badge>}
          </div>

          {product.description && (
            <div className="pt-4 border-t space-y-2">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Description</h2>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
