import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONDAY_API = "https://api.monday.com/v2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, error: "MONDAY_API_TOKEN not configured" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  try {
    const boards: any[] = [];
    let page = 1;
    const limit = 100;

    // Paginate through all boards
    while (true) {
      const query = `{
        boards(limit: ${limit}, page: ${page}, state: active, order_by: used_at) {
          id
          name
          description
          state
          board_kind
          items_count
          updated_at
          url
          owners { id name email }
          workspace { id name }
        }
      }`;

      const res = await fetch(MONDAY_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
          "API-Version": "2024-01",
        },
        body: JSON.stringify({ query }),
      });

      const json = await res.json();
      if (json.errors) {
        return new Response(
          JSON.stringify({ success: false, error: JSON.stringify(json.errors) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      const batch = json.data?.boards ?? [];
      boards.push(...batch);
      if (batch.length < limit) break;
      page++;
      if (page > 50) break; // safety
    }

    return new Response(
      JSON.stringify({ success: true, count: boards.length, boards }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
