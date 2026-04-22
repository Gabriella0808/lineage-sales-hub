import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USERS = [
  "will@lineage-collections.com",
  "gabriella@lineage-collections.com",
  "chris@lineage-collections.com",
  "mateo@lineage-collections.com",
  "justin@lineage-collections.com",
  "scott@lineage-collections.com",
  "sergio@lineage-collections.com",
  "brent@lineage-collections.com",
];

const PASSWORD = "Lineage2026!";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{ email: string; status: string; error?: string }> = [];

  for (const email of USERS) {
    const fullName = email.split("@")[0].replace(/^./, (c) => c.toUpperCase());
    const { error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      results.push({ email, status: "error", error: error.message });
    } else {
      results.push({ email, status: "created" });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
