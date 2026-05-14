import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CS_EMAIL = Deno.env.get("CUSTOMER_SERVICE_EMAIL");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { quoteId } = await req.json();
    if (!quoteId) return new Response(JSON.stringify({ error: "quoteId required" }), { status: 400, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: quote, error: qErr } = await admin
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", quoteId)
      .eq("user_id", user.id)
      .single();
    if (qErr || !quote) throw new Error("Quote not found");
    if (quote.status !== "draft") throw new Error("Quote already submitted");

    const items = quote.quote_items || [];
    const total = items.reduce((s: number, i: any) => s + Number(i.line_total || 0), 0);

    await admin.from("quotes").update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      total,
    }).eq("id", quoteId);

    // Notify customer service via in-app notification
    const { data: admins } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    const lines = items.map((i: any) => `• ${i.qty} × ${i.sku} — ${i.name} @ $${Number(i.unit_price).toFixed(2)}`).join("\n");
    const body = `New quote from ${user.email}\n\n${lines}\n\nTotal: $${total.toFixed(2)}${quote.notes ? `\n\nNotes: ${quote.notes}` : ""}`;

    if (admins?.length) {
      await admin.from("notifications").insert(
        admins.map((a: any) => ({
          user_id: a.user_id,
          type: "new_quote",
          title: "New quote submitted",
          body,
          link: "/catalog/quotes",
          related_id: quoteId,
        }))
      );
    }

    // Email customer service if configured (using existing send-transactional-email infra would go here)
    console.log(`Quote ${quoteId} submitted. CS email: ${CS_EMAIL || "not configured"}`);

    return new Response(JSON.stringify({ ok: true, quoteId, total }), {
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
