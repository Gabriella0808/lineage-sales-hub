import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = Deno.env.get("MONDAY_API_TOKEN")!;
  const q = `{ boards(ids: 18395527308) { columns { id title type } items_page(limit: 2) { items { id name column_values { id text column { title } } } } } }`;
  const r = await fetch("https://api.monday.com/v2", { method: "POST", headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2024-01" }, body: JSON.stringify({ query: q }) });
  return new Response(JSON.stringify(await r.json(), null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
