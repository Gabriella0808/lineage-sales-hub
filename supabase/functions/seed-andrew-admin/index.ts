import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const email = "andrew@lineage-collections.com";
  const password = "Lineage2026!";
  const fullName = "Andrew Grisack";

  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (createErr) {
    let page = 1;
    while (!userId) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      const existing = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (existing) { userId = existing.id; break; }
      if (data.users.length < 1000) break;
      page++;
    }
  } else {
    userId = created.user?.id ?? null;
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: "could not resolve user", detail: createErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("profiles").upsert({ user_id: userId, full_name: fullName }, { onConflict: "user_id" });
  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("user_roles").insert({ user_id: userId, role: "admin" });

  return new Response(JSON.stringify({ ok: true, user_id: userId, email, password }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
