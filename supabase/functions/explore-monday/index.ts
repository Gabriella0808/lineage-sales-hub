import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const mondayToken = Deno.env.get("MONDAY_API_TOKEN");
  if (!mondayToken) {
    return new Response(JSON.stringify({ error: "No MONDAY_API_TOKEN" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const query = `{
    boards(ids: 18393784224) {
      name
      columns { id title type }
      items_page(limit: 5) {
        items {
          id
          name
          column_values { id text value }
        }
      }
    }
  }`;

  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: mondayToken },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
