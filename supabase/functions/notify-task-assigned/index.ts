// Sends a "task assigned" email to a specific user for a specific task.
// Idempotent per (task,user) via idempotencyKey.
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
    const taskId: string | undefined = body?.taskId;
    const userId: string | undefined = body?.userId;
    const assignerId: string | undefined = body?.assignerId;

    if (!taskId || !userId) {
      return new Response(JSON.stringify({ error: "taskId and userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: task, error: tErr } = await supabase
      .from("manager_tasks")
      .select("id, title, description, due_date, user_id")
      .eq("id", taskId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!task) {
      return new Response(JSON.stringify({ error: "task not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Don't email the assigner themselves
    const effectiveAssigner = assignerId || task.user_id;
    if (effectiveAssigner === userId) {
      return new Response(JSON.stringify({ ok: true, skipped: "self_assignment" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userResp, error: uErr } = await supabase.auth.admin.getUserById(userId);
    if (uErr) throw uErr;
    const email = userResp?.user?.email;
    if (!email) {
      return new Response(JSON.stringify({ ok: false, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();
    const recipientName = profile?.full_name?.split(" ")?.[0] || email.split("@")[0];

    let assignerName: string | undefined;
    if (effectiveAssigner) {
      const { data: ap } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", effectiveAssigner)
        .maybeSingle();
      assignerName = ap?.full_name || undefined;
    }

    const dueDateLabel = task.due_date
      ? new Date(task.due_date + "T00:00:00Z").toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
        })
      : undefined;

    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYnJ2cGd6YXdiYm11bG94bGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjUxNjIsImV4cCI6MjA5MTg0MTE2Mn0.TkFa_54_Lck4rpyFowbxjnYfGfeYS1ZTy7TWMBvtAQ0";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;

    const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
        "apikey": anonKey,
      },
      body: JSON.stringify({
        templateName: "task-assigned",
        recipientEmail: email,
        idempotencyKey: `task-assigned-${taskId}-${userId}`,
        templateData: {
          recipientName,
          assignerName,
          taskTitle: task.title,
          taskDescription: task.description ?? undefined,
          dueDate: dueDateLabel,
          link: "https://www.lineage-portal.com/tasks",
        },
      }),
    });
    const respText = await resp.text();
    console.log("send-transactional-email", { status: resp.status, body: respText.slice(0, 300) });

    return new Response(JSON.stringify({ ok: resp.ok, status: resp.status }), {
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
