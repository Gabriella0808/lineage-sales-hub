import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // Verify caller and check admin role
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "Forbidden: admin only" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const action = body.action as string;

  try {
    if (action === "list_emails") {
      const emails: Record<string, string> = {};
      let page = 1;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return json({ error: error.message }, 500);
        for (const u of data.users) emails[u.id] = u.email ?? "";
        if (data.users.length < 1000) break;
        page++;
      }
      return json({ emails });
    }

    if (action === "create_user") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim() || email.split("@")[0];
      const role = (body.role ?? "rep") as "admin" | "manager" | "rep" | "dealer";
      if (!email || password.length < 8) return json({ error: "Email and password (min 8 chars) required" }, 400);

      let userId: string | null = null;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (createErr) {
        // try to find existing
        let page = 1;
        while (!userId) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) return json({ error: createErr.message }, 400);
          const existing = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
          if (existing) { userId = existing.id; break; }
          if (data.users.length < 1000) break;
          page++;
        }
        if (!userId) return json({ error: createErr.message }, 400);
      } else {
        userId = created.user?.id ?? null;
      }
      if (!userId) return json({ error: "Could not resolve user id" }, 500);

      // Ensure profile
      await admin.from("profiles").upsert({ user_id: userId, full_name: fullName }, { onConflict: "user_id" });
      // Replace role
      await admin.from("user_roles").delete().eq("user_id", userId);
      const { error: roleErr } = await admin.from("user_roles").insert({ user_id: userId, role });
      if (roleErr) return json({ error: roleErr.message }, 500);

      return json({ ok: true, user_id: userId });
    }

    if (action === "delete_user") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id required" }, 400);
      if (targetId === userRes.user.id) return json({ error: "You cannot delete your own account" }, 400);
      await admin.from("user_roles").delete().eq("user_id", targetId);
      await admin.from("user_managers").delete().eq("user_id", targetId);
      await admin.from("user_reps").delete().eq("user_id", targetId);
      await admin.from("user_dealers").delete().eq("user_id", targetId);
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "set_password") {
      const targetId = String(body.user_id ?? "");
      const password = String(body.password ?? "");
      if (!targetId || password.length < 8) return json({ error: "user_id and password (min 8) required" }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
