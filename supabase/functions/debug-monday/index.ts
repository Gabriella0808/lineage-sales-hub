import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = Deno.env.get("MONDAY_API_TOKEN")!;
  const query = `{ boards(ids: 18406187834) { items_page(limit: 100) { items { name column_values(ids:["text_mm2f7tdp"]) { text } } } } }`;
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  const items = data.data?.boards?.[0]?.items_page?.items ?? [];
  const codes = items.map((i: { name: string; column_values: { text: string }[] }) => ({ name: i.name, code: i.column_values[0]?.text ?? "" }));
  return new Response(JSON.stringify(codes, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
