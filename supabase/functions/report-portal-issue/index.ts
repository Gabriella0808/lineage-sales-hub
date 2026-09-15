// Global "Report Issue" feature — authenticated portal users (any role) can
// send a bug/data-problem/UI report from anywhere in the app. Email-only:
// no portal_issue_reports table is created here (explicitly deferred).
//
// Auth pattern mirrors submit-quote/index.ts (Authorization header ->
// userClient.auth.getUser() -> 401 if no user). Email send pattern mirrors
// send-labor-day-promo-email/index.ts (render the react-email template
// locally, then enqueue the pre-rendered html/text via enqueue_email
// directly — process-email-queue just ships whatever html/text it's given).
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { template as portalIssueReportTemplate } from "../_shared/transactional-email-templates/portal-issue-report.tsx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SITE_NAME = "Lineage Collections";
const FROM_DOMAIN = "lineage-collections.com";
const SENDER_DOMAIN = "lineage-collections.com";
const TEMPLATE_LABEL = "portal-issue-report";
const RECIPIENT = "gabriella@lineage-collections.com";
const BUCKET = "issue-report-attachments";
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Server-side validation caps — re-checked here regardless of what the
// frontend enforces, since the client can never be trusted.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const REPORTED_PAGE_MAX = 150;
const URL_MAX = 2000;
const USER_AGENT_MAX = 500;
const FILTER_CONTEXT_MAX = 2000;

const ISSUE_TYPES = new Set([
  "Data looks incorrect",
  "Something isn't working",
  "Error message",
  "Display / visual issue",
  "Feature request",
  "Other",
]);
const PRIORITIES = new Set(["Low", "Normal", "High", "Blocking"]);

// Abuse protection: this same user can't enqueue more than this many
// report-issue emails within the rate-limit window below.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

// Renders an arbitrary, client-supplied filter-context object (from
// useCurrentReportContext) as a short human-readable string for the email.
// Defensive: caps total length and never trusts the shape of the object.
function formatFilterContext(ctx: unknown): string | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  const entries = Object.entries(ctx as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  if (entries.length === 0) return undefined;
  const parts = entries.map(([k, v]) => {
    let val: string;
    if (Array.isArray(v)) val = v.length ? v.join(", ") : "(none)";
    else if (typeof v === "object") val = JSON.stringify(v);
    else val = String(v);
    return `${k}: ${val}`;
  });
  return truncate(parts.join(" · "), FILTER_CONTEXT_MAX);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Authenticated users only — reject anonymous/logged-out callers ──
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── 2. Parse + validate/sanitize every field server-side ────────────────
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const issueType = typeof body.issueType === "string" ? body.issueType.trim() : "";
    if (!ISSUE_TYPES.has(issueType)) {
      return jsonResponse({ ok: false, error: `issueType must be one of: ${[...ISSUE_TYPES].join(", ")}` }, 400);
    }

    const title = typeof body.title === "string" ? truncate(body.title.trim(), TITLE_MAX) : "";
    if (!title) return jsonResponse({ ok: false, error: "title is required" }, 400);

    const description = typeof body.description === "string" ? truncate(body.description.trim(), DESCRIPTION_MAX) : "";
    if (!description) return jsonResponse({ ok: false, error: "description is required" }, 400);

    // User-confirmed page picked from the dialog's dropdown (real nav titles,
    // not a raw path) — not a strict enum server-side since the nav list can
    // change; just a length-capped free string like every other text field.
    const reportedPageRaw = typeof body.reportedPage === "string" ? body.reportedPage.trim() : "";
    const reportedPage = reportedPageRaw ? truncate(reportedPageRaw, REPORTED_PAGE_MAX) : "";

    let priority = typeof body.priority === "string" ? body.priority.trim() : "Normal";
    if (!PRIORITIES.has(priority)) priority = "Normal";

    // screenshotPath, if present, must belong to the calling user — this is
    // the only thing standing between "any authenticated user" and "read
    // anyone's uploaded screenshot via a signed URL", since the edge
    // function uses the service role (which bypasses storage RLS) to mint
    // the signed link.
    let screenshotPath: string | null = null;
    if (typeof body.screenshotPath === "string" && body.screenshotPath.trim()) {
      const candidate = body.screenshotPath.trim();
      if (!candidate.startsWith(`${user.id}/`)) {
        return jsonResponse({ ok: false, error: "screenshotPath does not belong to the authenticated user" }, 403);
      }
      screenshotPath = candidate;
    }

    const route = typeof body.route === "string" ? truncate(body.route, 300) : "";
    const url = typeof body.url === "string" ? truncate(body.url, URL_MAX) : "";
    const userAgent = typeof body.userAgent === "string" ? truncate(body.userAgent, USER_AGENT_MAX) : "";
    const viewport = (body.viewport && typeof body.viewport === "object")
      ? (body.viewport as { width?: unknown; height?: unknown })
      : null;
    const viewportText = viewport && typeof viewport.width === "number" && typeof viewport.height === "number"
      ? `${viewport.width} × ${viewport.height}`
      : undefined;
    const filterContextText = formatFilterContext(body.filterContext);

    // Client-supplied role is only a fallback — the authoritative lookup
    // below (user_roles) wins whenever it resolves to something.
    const clientRole = typeof body.role === "string" ? body.role.trim() : "";

    // ── 3. Abuse protection: rate-limit by the same authenticated user ──────
    // There's no portal_issue_reports table yet, so we key off email_send_log
    // (the queryable audit trail behind the pgmq-backed email queue) using a
    // reporterUserId we stamp into its metadata column at insert time below.
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data: recentReports, error: rateLimitErr } = await admin
      .from("email_send_log")
      .select("id")
      .eq("template_name", TEMPLATE_LABEL)
      .contains("metadata", { reporterUserId: user.id })
      .in("status", ["pending", "sent"])
      .gte("created_at", windowStart);

    if (rateLimitErr) {
      console.error("[report-portal-issue] rate-limit check failed:", rateLimitErr.message);
      // Fail open on the rate-limit check itself (don't block a legitimate
      // report because of an infra hiccup) but log loudly.
    } else if ((recentReports?.length ?? 0) >= RATE_LIMIT_MAX) {
      return jsonResponse(
        { ok: false, error: "You've submitted several reports in a short time. Please wait a few minutes and try again." },
        429,
      );
    }

    // ── 4. Resolve display name + role from the canonical portal sources ────
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const reporterName = profile?.full_name || (user.email ? user.email.split("@")[0] : "Unknown user");

    // Mirrors useUserRole()'s resolution exactly (src/hooks/useUserRole.ts):
    // explicit user_roles rows first, then fall back to link-table presence
    // (a dealer/rep frequently has no explicit user_roles row — only a
    // user_dealers/user_reps link — so checking user_roles alone would
    // under-resolve real dealers/reps to "unknown").
    const ADMIN_EMAIL_OVERRIDES = new Set([
      "justin@lineage-collections.com",
      "scott@lineage-collections.com",
      "andrew@lineage-collections.com",
      "gabriella@lineage-collections.com",
    ]);
    const [{ data: roleRows }, { data: managerRow }, { data: repRows }, { data: dealerRow }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", user.id),
      admin.from("user_managers").select("manager_id").eq("user_id", user.id).maybeSingle(),
      admin.from("user_reps").select("rep_id").eq("user_id", user.id),
      admin.from("user_dealers").select("dealer_id").eq("user_id", user.id).maybeSingle(),
    ]);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    const hasManagerLink = !!managerRow?.manager_id;
    const hasRepLink = (repRows ?? []).length > 0;
    const hasDealerLink = !!dealerRow?.dealer_id;

    let resolvedRole: string | null = null;
    if (roles.includes("admin") || ADMIN_EMAIL_OVERRIDES.has((user.email ?? "").toLowerCase())) resolvedRole = "admin";
    else if (roles.includes("manager") || hasManagerLink) resolvedRole = "manager";
    else if (roles.includes("rep") || hasRepLink) resolvedRole = "rep";
    else if (roles.includes("dealer") || hasDealerLink) resolvedRole = "dealer";
    // Fall back to the client-reported role only if the authoritative lookup
    // came back completely empty — never let a client override a real
    // server-side role resolution.
    const role = resolvedRole || clientRole || "unknown";

    // ── 5. Signed URL for the screenshot, if one was uploaded ───────────────
    let screenshotUrl: string | undefined;
    if (screenshotPath) {
      const { data: signed, error: signErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(screenshotPath, SIGNED_URL_TTL_SECONDS);
      if (signErr) {
        console.error("[report-portal-issue] failed to sign screenshot URL:", signErr.message);
        // Don't fail the whole report over a signing hiccup — just omit the link.
      } else {
        screenshotUrl = signed?.signedUrl;
      }
    }

    // ── 6. Render + enqueue ──────────────────────────────────────────────────
    const submittedAt = new Date(); // server-side authoritative timestamp
    const submittedAtLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    }).format(submittedAt) + " ET";

    const templateData = {
      issueType,
      title,
      priority,
      reporterName,
      reporterEmail: user.email ?? "unknown",
      role,
      pageLabel: reportedPage || route || url || "(unknown page)",
      submittedAt: submittedAtLabel,
      description,
      url,
      filterContextText,
      userAgent,
      viewport: viewportText,
      screenshotUrl,
    };

    const html = await renderAsync(React.createElement(portalIssueReportTemplate.component, templateData));
    const text = await renderAsync(React.createElement(portalIssueReportTemplate.component, templateData), { plainText: true });
    const subject = typeof portalIssueReportTemplate.subject === "function"
      ? portalIssueReportTemplate.subject(templateData)
      : portalIssueReportTemplate.subject;

    const messageId = crypto.randomUUID();
    const idempotencyKey = `portal-issue-report-${messageId}`;

    // Log pending BEFORE enqueue (matches send-transactional-email /
    // send-labor-day-promo-email convention) — also carries reporterUserId
    // in metadata, which is what the rate-limit check above queries against.
    await admin.from("email_send_log").insert({
      message_id: messageId,
      idempotency_key: idempotencyKey,
      template_name: TEMPLATE_LABEL,
      recipient_email: RECIPIENT,
      status: "pending",
      metadata: { reporterUserId: user.id, reporterEmail: user.email, issueType, priority },
    });

    const { error: enqueueErr } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: RECIPIENT,
        from: `${SITE_NAME} <notifications@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: TEMPLATE_LABEL,
        idempotency_key: idempotencyKey,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueErr) {
      console.error("[report-portal-issue] enqueue failed:", enqueueErr.message);
      await admin.from("email_send_log").insert({
        message_id: messageId,
        idempotency_key: idempotencyKey,
        template_name: TEMPLATE_LABEL,
        recipient_email: RECIPIENT,
        status: "failed",
        error_message: enqueueErr.message,
      });
      return jsonResponse({ ok: false, error: "Failed to send report" }, 500);
    }

    console.log(`[report-portal-issue] enqueued report from ${user.email} (${role}) — "${title}"`);
    return jsonResponse({ ok: true, queued: true });
  } catch (e) {
    console.error("[report-portal-issue] fatal:", e);
    return jsonResponse({ ok: false, error: "Internal error" }, 500);
  }
});
