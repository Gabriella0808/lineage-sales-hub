// Scans manager_tasks for tasks due today (not done) and inserts notifications
// for the creator + all assignees. Idempotent per-day via dedupe check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Today in UTC (date column compares by date)
    const today = new Date().toISOString().slice(0, 10);

    const { data: tasks, error: tErr } = await supabase
      .from("manager_tasks")
      .select("id, title, user_id, assigned_user_id, assigned_manager_id, due_date, status")
      .eq("due_date", today)
      .neq("status", "done");

    if (tErr) throw tErr;

    let notified = 0;
    for (const t of tasks ?? []) {
      // Collect recipients: creator, assigned user, assigned manager (resolved to user), and assignees table
      const recipients = new Set<string>();
      if (t.user_id) recipients.add(t.user_id);
      if (t.assigned_user_id) recipients.add(t.assigned_user_id);

      if (t.assigned_manager_id) {
        const { data: mgrUser } = await supabase.rpc("user_id_for_manager", {
          _manager_id: t.assigned_manager_id,
        });
        if (mgrUser) recipients.add(mgrUser as unknown as string);
      }

      const { data: assignees } = await supabase
        .from("manager_task_assignees")
        .select("user_id")
        .eq("task_id", t.id);
      for (const a of assignees ?? []) recipients.add(a.user_id);

      for (const userId of recipients) {
        // Dedupe: skip if a 'task_due_today' notification for this task already exists today
        const startOfDay = `${today}T00:00:00Z`;
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "task_due_today")
          .eq("related_id", t.id)
          .gte("created_at", startOfDay)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error: nErr } = await supabase.from("notifications").insert({
          user_id: userId,
          type: "task_due_today",
          title: "Task due today",
          body: t.title,
          link: "/tasks",
          related_id: t.id,
        });
        if (!nErr) notified++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, tasks: tasks?.length ?? 0, notified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
