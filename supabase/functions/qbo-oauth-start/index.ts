import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientId     = Deno.env.get("QBO_CLIENT_ID")!;
  const redirectUri  = Deno.env.get("QBO_REDIRECT_URI")!;
  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Generate a cryptographically secure state value.
  const state = crypto.randomUUID();

  const { error } = await supabase
    .from("qbo_oauth_states")
    .insert({ state, created_at: new Date().toISOString() });

  if (error) {
    console.error("Failed to store OAuth state:", error.message);
    return new Response(
      JSON.stringify({ error: "Failed to initiate OAuth flow." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: "code",
    scope:         "com.intuit.quickbooks.accounting",
    redirect_uri:  redirectUri,
    state,
  });

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;

  return Response.redirect(authUrl, 302);
});
