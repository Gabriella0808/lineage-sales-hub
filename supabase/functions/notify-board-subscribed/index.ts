// Sends a "board access updated" email when a user is added to a task board.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const boardId: string | undefined = body?.boardId;
    const userId: string | undefined = body?.userId;
    const addedBy: string | undefined = body?.addedBy;

    if (!boardId || !userId) {
      return new Response(JSON.stringify({ error: "boardId and userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Don't email someone who added themselves
    if (addedBy && addedBy === userId) {
      return new Response(JSON.stringify({ ok: true, skipped: "self_subscription" }), {
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

    let inviterName: string | undefined;
    if (addedBy) {
      const { data: ap } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", addedBy)
        .maybeSingle();
      inviterName = ap?.full_name || undefined;
    }

    const { data: board } = await supabase
      .from("task_boards")
      .select("name, description")
      .eq("id", boardId)
      .maybeSingle();

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;

    const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
        "apikey": anonKey,
      },
      body: JSON.stringify({
        templateName: "board-subscribed",
        recipientEmail: email,
        idempotencyKey: `board-subscribed-${boardId}-${userId}`,
        templateData: {
          recipientName,
          inviterName,
          boardName: board?.name ?? undefined,
          boardDescription: board?.description ?? undefined,
          link: "https://www.lineage-collections-portal.com/tasks",
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
