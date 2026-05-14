import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STORE_HASH = Deno.env.get("BIGCOMMERCE_STORE_HASH");
const ACCESS_TOKEN = Deno.env.get("BIGCOMMERCE_ACCESS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function resolveStoreHash() {
  const raw = (STORE_HASH || "").trim();
  return /^[a-z0-9]{10}$/i.test(raw) ? raw : "ybkui2vf1q";
}

async function bcFetch(path: string) {
  const hash = resolveStoreHash();
  const token = (ACCESS_TOKEN || "").trim();
  console.log(`BigCommerce sync using store hash length ${hash.length}`);
  const url = `https://api.bigcommerce.com/stores/${hash}/v3${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Auth-Token": token,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`BC ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!STORE_HASH || !ACCESS_TOKEN) {
      throw new Error("BigCommerce credentials missing");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const stats = { products: 0, variants: 0, pages: 0 };
    let page = 1;
    const limit = 100;

    while (true) {
      const data = await bcFetch(
        `/catalog/products?include=variants,images,primary_image&limit=${limit}&page=${page}&is_visible=true`
      );
      stats.pages++;

      const products = data.data || [];
      if (products.length === 0) break;

      // Upsert parent products
      const parentRows = products.map((p: any) => ({
        bc_product_id: String(p.id),
        sku: p.sku || `BC-${p.id}`,
        name: p.name,
        description: p.description?.replace(/<[^>]*>/g, "").slice(0, 5000) ?? null,
        image_url: p.primary_image?.url_standard ?? p.images?.[0]?.url_standard ?? null,
        image_urls: p.images?.map((img: any) => img.url_standard).filter(Boolean) ?? null,
        base_price: p.price ?? 0,
        is_active: p.is_visible !== false,
        stock_status: p.availability ?? null,
        inventory_level: p.inventory_level ?? 0,
        category: Array.isArray(p.categories) ? String(p.categories[0] ?? "") : null,
        last_synced_at: new Date().toISOString(),
      }));

      for (const row of parentRows) {
        await supabase.from("products").upsert(row, { onConflict: "sku" });
        stats.products++;
      }

      // Upsert variants (treat each as its own SKU)
      for (const p of products) {
        const variants = (p.variants || []).filter((v: any) => v.sku && v.sku !== p.sku);
        for (const v of variants) {
          await supabase.from("products").upsert({
            bc_product_id: String(p.id),
            sku: v.sku,
            name: `${p.name}${v.option_values?.length ? " - " + v.option_values.map((o:any)=>o.label).join(" / ") : ""}`,
            description: p.description?.replace(/<[^>]*>/g, "").slice(0, 5000) ?? null,
            image_url: v.image_url ?? p.primary_image?.url_standard ?? null,
            base_price: v.price ?? p.price ?? 0,
            is_active: p.is_visible !== false,
            stock_status: v.purchasing_disabled ? "disabled" : p.availability,
            inventory_level: v.inventory_level ?? 0,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: "sku" });
          stats.variants++;
        }
      }

      const meta = data.meta?.pagination;
      if (!meta || page >= meta.total_pages) break;
      page++;
    }

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
