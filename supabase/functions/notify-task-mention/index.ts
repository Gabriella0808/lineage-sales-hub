// Sends a "you were mentioned" email to a specific user for a task update.
// Idempotent per (update,user).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const updateId: string | undefined = body?.updateId;
    if (!updateId) {
      return new Response(JSON.stringify({ error: "updateId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: upd, error: uErr } = await supabase
      .from("manager_task_updates")
      .select("id, task_id, author_id, body, mentions")
      .eq("id", updateId)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!upd) {
      return new Response(JSON.stringify({ error: "update not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mentions: string[] = Array.isArray(upd.mentions) ? upd.mentions : [];
    if (mentions.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_mentions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: task } = await supabase
      .from("manager_tasks")
      .select("id, title")
      .eq("id", upd.task_id)
      .maybeSingle();
    const taskTitle = task?.title ?? "a task";

    let mentionerName: string | undefined;
    if (upd.author_id) {
      const { data: ap } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", upd.author_id)
        .maybeSingle();
      mentionerName = ap?.full_name || undefined;
    }

    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYnJ2cGd6YXdiYm11bG94bGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjUxNjIsImV4cCI6MjA5MTg0MTE2Mn0.TkFa_54_Lck4rpyFowbxjnYfGfeYS1ZTy7TWMBvtAQ0";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;

    const results: Array<Record<string, unknown>> = [];

    for (const uid of mentions) {
      if (!uid || uid === upd.author_id) continue;
      const { data: userResp, error: gErr } = await supabase.auth.admin.getUserById(uid);
      if (gErr || !userResp?.user?.email) {
        results.push({ uid, skipped: "no_email" });
        continue;
      }
      const email = userResp.user.email;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", uid)
        .maybeSingle();
      const recipientName = profile?.full_name?.split(" ")?.[0] || email.split("@")[0];

      const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          templateName: "task-mention",
          recipientEmail: email,
          idempotencyKey: `task-mention-${updateId}-${uid}`,
          templateData: {
            recipientName,
            mentionerName,
            taskTitle,
            updateBody: upd.body,
            link: "https://www.lineage-portal.com/tasks",
          },
        }),
      });
      const txt = await resp.text();
      console.log("send-transactional-email", { uid, status: resp.status, body: txt.slice(0, 200) });
      results.push({ uid, status: resp.status });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
