import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONDAY_API = "https://api.monday.com/v2";
const BOARD_ID = "18395527308";

function pickColVal(cols: any[], matchers: string[]): string {
  if (!cols) return "";
  const lower = matchers.map((m) => m.toLowerCase());
  for (const c of cols) {
    const title = (c.column?.title || c.title || "").toLowerCase();
    if (lower.some((m) => title.includes(m))) {
      return (c.text ?? "").toString();
    }
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: "MONDAY_API_TOKEN not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const items: any[] = [];
    let cursor: string | null = null;

    do {
      const query = cursor
        ? `{ next_items_page(limit: 100, cursor: "${cursor}") { cursor items { id name column_values { id text column { title } } } } }`
        : `{ boards(ids: ${BOARD_ID}) { items_page(limit: 100) { cursor items { id name column_values { id text column { title } } } } } }`;

      const res = await fetch(MONDAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2024-01" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (json.errors) {
        return new Response(JSON.stringify({ success: false, error: JSON.stringify(json.errors) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }
      const page = cursor ? json.data?.next_items_page : json.data?.boards?.[0]?.items_page;
      const batch = page?.items ?? [];
      items.push(...batch);
      cursor = page?.cursor ?? null;
    } while (cursor);

    const rows = items.map((it) => {
      const cols = it.column_values || [];
      const orderRaw = pickColVal(cols, ["order amount", "order value", "amount"]);
      const orderNum = parseFloat(orderRaw.replace(/[^0-9.\-]/g, "")) || 0;
      const dateRaw = pickColVal(cols, ["created", "date", "lead date"]);
      let lead_date: string | null = null;
      if (dateRaw) {
        const d = new Date(dateRaw);
        if (!isNaN(d.getTime())) lead_date = d.toISOString().slice(0, 10);
      }
      return {
        monday_item_id: String(it.id),
        contact_name: it.name || pickColVal(cols, ["contact", "name"]),
        dealer: pickColVal(cols, ["dealer", "company"]),
        email: pickColVal(cols, ["email"]).split(",")[0].trim() || null,
        additional_email: pickColVal(cols, ["additional email", "alternate"]) || null,
        phone: pickColVal(cols, ["phone"]) || null,
        trade_show: pickColVal(cols, ["lead source", "trade show", "event", "market"]) || null,
        sales_rep: pickColVal(cols, ["sales rep", "rep ", "owner"]) || null,
        product_interest: pickColVal(cols, ["collection interest", "product"]) || null,
        order_amount: orderNum,
        status: pickColVal(cols, ["status", "stage"]) || null,
        notes: pickColVal(cols, ["notes", "comments"]) || null,
        lead_date,
        raw: { id: it.id, name: it.name, column_values: cols },
      };
    });

    // Build market map (existing + auto-create from unique trade_show values)
    const { data: existingMarkets } = await supabase
      .from("trade_show_markets")
      .select("id, name");
    const marketMap = new Map<string, string>();
    (existingMarkets || []).forEach((m: any) => marketMap.set(m.name.toLowerCase().trim(), m.id));

    const uniqueShows = Array.from(
      new Set(
        rows
          .map((r) => (r.trade_show || "").trim())
          .filter((s) => s && !marketMap.has(s.toLowerCase()))
      )
    );

    let marketsCreated = 0;
    for (const showName of uniqueShows) {
      // Try to detect season + year from name
      const yearMatch = showName.match(/(20\d{2})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      let season: string | null = null;
      if (/spring/i.test(showName)) season = "Spring";
      else if (/fall|autumn/i.test(showName)) season = "Fall";
      else if (/summer/i.test(showName)) season = "Summer";
      else if (/winter/i.test(showName)) season = "Winter";

      const { data: created, error: mErr } = await supabase
        .from("trade_show_markets")
        .insert({ name: showName, season, year, is_active: true })
        .select("id, name")
        .single();
      if (!mErr && created) {
        marketMap.set(created.name.toLowerCase().trim(), created.id);
        marketsCreated++;
      }
    }

    // Attach market_id to rows
    const rowsWithMarket = rows.map((r) => ({
      ...r,
      market_id: r.trade_show ? marketMap.get(r.trade_show.toLowerCase().trim()) || null : null,
    }));

    let upserted = 0;
    for (const row of rowsWithMarket) {
      const { error } = await supabase
        .from("trade_show_leads")
        .upsert(row, { onConflict: "monday_item_id" });
      if (!error) upserted++;
    }

    return new Response(JSON.stringify({ success: true, total: items.length, upserted, marketsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
