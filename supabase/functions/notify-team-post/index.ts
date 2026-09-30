// Fans out a Team Update post to every internal-staff recipient: one
// in-portal notification (bell icon) + one email each. Called by the
// client right after it inserts the team_posts row (RLS already enforced
// admin/manager-only there).
//
// Auth pattern mirrors report-portal-issue/index.ts (Authorization header ->
// userClient.auth.getUser() -> 401 if no user), plus an extra check here:
// only the post's own author or an admin may trigger the fan-out, since
// anyone who can READ a post (any internal-staff role) could otherwise call
// this directly with a known postId and re-blast the whole team.
//
// Idempotent: if this post has already been notified (a notifications row
// with related_id = postId already exists), it returns immediately instead
// of emailing everyone a second time - protects against a client retry or
// a double-click on "Post".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EXCERPT_MAX = 200;

// Real rollout: every admin/manager with page access gets notified/emailed
// (team_post_recipients() matches the page's own access rule - see
// 20260930020000_team_updates_exclude_reps.sql, which also excludes reps
// and CS-flagged accounts from that function, same as the page itself).
const RECIPIENT_MODE: "gabriella-only" | "internal-staff" = "internal-staff";
const GABRIELLA_EMAIL = "gabriella@lineage-collections.com";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const postId: string | undefined = body?.postId;
    if (!postId) return jsonResponse({ error: "postId is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: post, error: postErr } = await admin
      .from("team_posts")
      .select("id, title, body, author_user_id")
      .eq("id", postId)
      .maybeSingle();
    if (postErr) throw postErr;
    if (!post) return jsonResponse({ error: "Post not found" }, 404);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (post.author_user_id !== user.id && !isAdmin) {
      return jsonResponse({ error: "Only the post's author or an admin can send this notification" }, 403);
    }

    // Idempotency guard - see header comment.
    const { count: alreadySent } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", "team_post")
      .eq("related_id", postId);
    if (alreadySent && alreadySent > 0) {
      return jsonResponse({ ok: true, alreadyNotified: true, sentNotifications: 0, sentEmails: 0 });
    }

    const { data: attachments } = await admin
      .from("team_post_attachments")
      .select("id")
      .eq("post_id", postId);
    const attachmentCount = attachments?.length ?? 0;

    const { data: authorProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", post.author_user_id)
      .maybeSingle();
    const authorName = authorProfile?.full_name || "Someone";

    let recipients: { user_id: string; email: string; full_name: string | null }[];
    if (RECIPIENT_MODE === "gabriella-only") {
      // Deliberately does NOT exclude the author here (unlike the real
      // internal-staff mode below) - while testing, Gabriella is expected to
      // be both the poster and the recipient, so she needs to see her own
      // test post land in her inbox.
      const { data: found, error: listErr } = await admin.auth.admin.listUsers();
      if (listErr) throw listErr;
      const match = found?.users.find((u) => u.email?.toLowerCase() === GABRIELLA_EMAIL);
      if (!match) throw new Error(`Couldn't find a user for ${GABRIELLA_EMAIL}`);
      const { data: prof } = await admin.from("profiles").select("full_name").eq("user_id", match.id).maybeSingle();
      recipients = [{ user_id: match.id, email: GABRIELLA_EMAIL, full_name: prof?.full_name ?? null }];
    } else {
      const { data, error: recErr } = await admin.rpc("team_post_recipients", { p_exclude_user_id: post.author_user_id });
      if (recErr) throw recErr;
      recipients = data ?? [];
    }

    // A message can be attachment-only (no caption), same as WhatsApp - both
    // title and body are optional now, so this needs a real fallback rather
    // than assuming either is present.
    const excerpt = post.body
      ? (post.body.length > EXCERPT_MAX ? `${post.body.slice(0, EXCERPT_MAX)}…` : post.body)
      : (attachmentCount > 0 ? `Sent ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : "");
    // Deep-links to this specific post - TeamUpdatesPage reads ?post= and
    // scrolls to/highlights the matching card.
    const link = `https://lineage-collections-portal.com/team-updates?post=${postId}`;
    const notifTitle = `${authorName} sent you a message`;

    let sentNotifications = 0;
    let sentEmails = 0;
    const emailErrors: string[] = [];

    for (const r of (recipients ?? []) as { user_id: string; email: string; full_name: string | null }[]) {
      const { error: notifErr } = await admin.from("notifications").insert({
        user_id: r.user_id,
        type: "team_post",
        title: notifTitle,
        body: excerpt,
        link: `/team-updates?post=${postId}`,
        related_id: postId,
      });
      if (!notifErr) sentNotifications++;

      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
          body: JSON.stringify({
            templateName: "team-post",
            recipientEmail: r.email,
            idempotencyKey: `team-post-${postId}-${r.user_id}`,
            templateData: {
              recipientName: r.full_name ?? undefined,
              authorName,
              title: post.title ?? undefined,
              excerpt,
              attachmentCount,
              link,
            },
          }),
        });
        if (resp.ok) sentEmails++;
        else emailErrors.push(`${r.email}: ${resp.status} ${await resp.text()}`);
      } catch (e) {
        emailErrors.push(`${r.email}: ${String(e)}`);
      }
    }

    return jsonResponse({
      ok: true,
      recipients: recipients?.length ?? 0,
      sentNotifications,
      sentEmails,
      emailErrors: emailErrors.length ? emailErrors : undefined,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
