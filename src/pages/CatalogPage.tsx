import { useEffect, useMemo, useState } from "react";
import { Search, Package, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  collection: string | null;
  description: string | null;
  image_url: string | null;
  base_price: number | null;
  stock_status: string | null;
  inventory_level: number | null;
};

const PAGE_SIZE = 24;

function formatPrice(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="aspect-square w-full bg-muted/40 flex items-center justify-center text-muted-foreground">
        <ImageOff className="h-10 w-10 opacity-40" />
      </div>
    );
  }
  return (
    <div className="aspect-square w-full bg-muted/20 overflow-hidden flex items-center justify-center">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setErrored(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [collection, setCollection] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, brand, category, collection, description, image_url, base_price, stock_status, inventory_level")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1000);
      if (!cancelled) {
        if (!error && data) setProducts(data as Product[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const brands = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.brand) s.add(p.brand);
    return Array.from(s).sort();
  }, [products]);

  const collections = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.collection) s.add(p.collection);
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (brand !== "all" && p.brand !== brand) return false;
      if (collection !== "all" && p.collection !== collection) return false;
      if (q) {
        const hay = `${p.sku} ${p.name} ${p.brand ?? ""} ${p.collection ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, query, brand, collection]);

  useEffect(() => { setPage(1); }, [query, brand, collection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Product Catalog</h1>
        <p className="page-subtitle">
          Synced from BigCommerce · {products.length.toLocaleString()} products
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products or SKU..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-full md:w-56 h-10"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger className="w-full md:w-56 h-10"><SelectValue placeholder="Collection" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              {collections.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          {loading ? "Loading…" : `${filtered.length.toLocaleString()} products found`}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {paged.map((p) => {
          const oos = (p.inventory_level ?? 0) <= 0;
          return (
            <Card key={p.id} className="overflow-hidden flex flex-col group">
              <div className="relative">
                <ProductImage src={p.image_url} alt={p.name} />
                {oos && (
                  <span className="absolute top-3 left-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-destructive text-destructive-foreground shadow-sm">
                    Out of Stock
                  </span>
                )}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className="text-[11px] tracking-wider text-muted-foreground uppercase">{p.sku}</div>
                <h3 className="font-serif text-lg leading-snug mt-1 line-clamp-2">{p.name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.brand && <Badge variant="secondary" className="rounded-full font-normal">{p.brand}</Badge>}
                  {p.collection && <Badge variant="outline" className="rounded-full font-normal">{p.collection}</Badge>}
                </div>
                {p.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{p.description}</p>
                )}
                <div className="mt-auto pt-4 flex items-baseline justify-between">
                  <span className="text-xl font-semibold">{formatPrice(p.base_price)}</span>
                  {p.inventory_level != null && p.inventory_level > 0 && (
                    <span className="text-xs text-muted-foreground">{p.inventory_level} in stock</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <Card className="p-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto opacity-40 mb-3" />
          No products match your filters.
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={cn("px-3 py-1.5 rounded-md text-sm border", currentPage === 1 ? "opacity-40" : "hover:bg-muted")}
          >Previous</button>
          <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className={cn("px-3 py-1.5 rounded-md text-sm border", currentPage === totalPages ? "opacity-40" : "hover:bg-muted")}
          >Next</button>
        </div>
      )}
    </div>
  );
}
