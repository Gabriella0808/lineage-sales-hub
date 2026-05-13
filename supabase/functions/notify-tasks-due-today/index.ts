// Scans manager_tasks for tasks due today (not done) and:
//  1) inserts in-app notifications for the creator + all assignees
//  2) sends a "task due today" email to each recipient
// Idempotent per-day via dedupe on notifications + idempotencyKey on emails.
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
    const dueDateLabel = new Date(today + "T00:00:00Z").toLocaleDateString(
      "en-US",
      { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
    );

    // Optional taskId filter — when called right after task creation
    let taskId: string | null = null;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.taskId === "string") taskId = body.taskId;
      }
    } catch (_) { /* no body */ }

    let query = supabase
      .from("manager_tasks")
      .select("id, title, description, user_id, assigned_user_id, assigned_manager_id, due_date, status")
      .eq("due_date", today)
      .neq("status", "done");
    if (taskId) query = query.eq("id", taskId);

    const { data: tasks, error: tErr } = await query;

    if (tErr) throw tErr;

    let notified = 0;
    let emailed = 0;

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

        const alreadyNotified = !!(existing && existing.length > 0);

        if (!alreadyNotified) {
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

        // Email reminder — idempotency key ensures no duplicates per task/user/day
        try {
          const { data: userResp } = await supabase.auth.admin.getUserById(userId);
          const email = userResp?.user?.email;
          if (!email) continue;

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", userId)
            .maybeSingle();

          const recipientName =
            profile?.full_name?.split(" ")?.[0] ||
            email.split("@")[0];

          const { error: eErr } = await supabase.functions.invoke(
            "send-transactional-email",
            {
              body: {
                templateName: "task-due-today",
                recipientEmail: email,
                idempotencyKey: `task-due-${t.id}-${userId}-${today}`,
                templateData: {
                  recipientName,
                  taskTitle: t.title,
                  taskDescription: t.description ?? undefined,
                  dueDate: dueDateLabel,
                  link: "https://www.lineage-portal.com/tasks",
                },
              },
            },
          );
          if (!eErr) emailed++;
        } catch (e) {
          console.error("Failed to send task-due email", { userId, taskId: t.id, error: String(e) });
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, tasks: tasks?.length ?? 0, notified, emailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
