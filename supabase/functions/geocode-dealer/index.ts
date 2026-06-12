import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { dealer_id } = await req.json();
    if (!dealer_id) {
      return new Response(JSON.stringify({ error: "dealer_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("MAPBOX_PUBLIC_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Mapbox token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: dealer, error: fetchErr } = await supabase
      .from("dealers")
      .select("id, street_address, city, state, lat, lng")
      .eq("id", dealer_id)
      .maybeSingle();
    if (fetchErr || !dealer) {
      return new Response(JSON.stringify({ error: fetchErr?.message ?? "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const query = [dealer.street_address, dealer.city, dealer.state]
      .filter(Boolean)
      .join(", ");
    if (!query) {
      return new Response(JSON.stringify({ error: "No address to geocode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=us&limit=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `Geocode failed: ${text}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await res.json();
    const feature = json?.features?.[0];
    if (!feature?.center) {
      return new Response(JSON.stringify({ error: "No geocode result", query }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [lng, lat] = feature.center as [number, number];

    const { error: updErr } = await supabase
      .from("dealers")
      .update({ lat, lng })
      .eq("id", dealer_id);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ lat, lng, query }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
