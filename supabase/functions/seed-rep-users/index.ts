import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PASSWORD = "Lineage2026!";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull all reps with an email
  const { data: reps, error: repsErr } = await admin
    .from("sales_reps")
    .select("id, name, email")
    .not("email", "is", null);

  if (repsErr) {
    return new Response(JSON.stringify({ error: repsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ email: string; rep_id: string; status: string; detail?: string }> = [];

  for (const rep of reps ?? []) {
    const email = (rep.email ?? "").trim().toLowerCase();
    if (!email) {
      results.push({ email: "", rep_id: rep.id, status: "skipped", detail: "no email" });
      continue;
    }

    let userId: string | null = null;

    // Try create
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: rep.name },
    });

    if (createErr) {
      // Likely already exists — look it up
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listErr) {
        results.push({ email, rep_id: rep.id, status: "error", detail: `lookup: ${listErr.message}` });
        continue;
      }
      const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (!existing) {
        results.push({ email, rep_id: rep.id, status: "error", detail: createErr.message });
        continue;
      }
      userId = existing.id;
    } else {
      userId = created.user?.id ?? null;
    }

    if (!userId) {
      results.push({ email, rep_id: rep.id, status: "error", detail: "no user id" });
      continue;
    }

    // Link user → rep
    const { error: linkErr } = await admin
      .from("user_reps")
      .upsert({ user_id: userId, rep_id: rep.id }, { onConflict: "user_id" });
    if (linkErr) {
      results.push({ email, rep_id: rep.id, status: "linked_failed", detail: linkErr.message });
      continue;
    }

    // Assign rep role (idempotent — unique constraint on (user_id, role) prevents dupes if exists)
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "rep" });
    // Ignore duplicate role errors
    if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
      results.push({ email, rep_id: rep.id, status: "role_failed", detail: roleErr.message });
      continue;
    }

    results.push({ email, rep_id: rep.id, status: "ok" });
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    errors: results.filter((r) => r.status.includes("error") || r.status.includes("failed")).length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };

  return new Response(JSON.stringify({ summary, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
