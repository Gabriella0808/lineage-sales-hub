// Daily Performance Email — self-contained send
//
// Renders daily-performance-report.tsx locally, then enqueues via enqueue_email
// directly (same infrastructure as send-transactional-email, without relying on
// that function's template registry).
//
// Request body (all optional):
//   dryRun: true              — compute data + recipients, do not send
//   testEmail: "a@b.com"     — send only to this address; sets testMode: true in response
//   reportingDate: "YYYY-MM-DD" — use this ET date instead of today (also accepted as "date")
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { template as dailyPerfTemplate } from "../_shared/transactional-email-templates/daily-performance-report.tsx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME     = "Lineage Collections";
const FROM_DOMAIN   = "lineage-collections.com";
const SENDER_DOMAIN = "lineage-collections.com";
const TEMPLATE_LABEL = "daily-performance-report";
const PORTAL_URL     = "https://www.lineage-collections-portal.com/";

// ── Timezone helpers ──────────────────────────────────────────────────────────

function getReportingDateET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// ── Collection mapping ────────────────────────────────────────────────────────

const EXCLUDED_CATS = new Set([
  "freighto", "tariff", "salestax", "ccfee",
  "freight", "tax", "surcharge", "qc",
]);

function toCollectionLabel(bc: string | null | undefined): string | null {
  if (!bc || bc.trim() === "") return null;
  const s = bc.toLowerCase().trim();
  if (EXCLUDED_CATS.has(s)) return null;
  if (s === "sea winds" || s === "sw")                    return "SW";
  if (s.includes("finn") || s === "finnlou" || s === "fin") return "FIN";
  if (s === "lux")                                         return "LUX";
  if (s === "hosp" || s === "hospitality")                 return "HOSP";
  if (s === "misc" || s === "allow")                       return "MISC";
  return null;
}

const COLLECTION_ORDER = ["SW", "FIN", "LUX", "HOSP", "MISC"];

interface CollectionRow { label: string; amount: number }

function aggregateByCollection(
  lines: Array<{ metric_type: string; brand_category: string | null; amount: number }>,
  metricType: string,
): CollectionRow[] {
  const map = new Map<string, number>();
  for (const r of lines) {
    if (r.metric_type !== metricType) continue;
    const label = toCollectionLabel(r.brand_category);
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + r.amount);
  }
  return COLLECTION_ORDER.filter((l) => map.has(l)).map((l) => ({ label: l, amount: map.get(l)! }));
}

// ── Token generator (mirrors send-transactional-email) ────────────────────────

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Per-recipient email send (idempotency + suppression + enqueue) ────────────

interface SendResult { ok: boolean; skipped?: boolean; error?: string }

async function sendToRecipient(
  supabase: SupabaseClient,
  opts: {
    email: string;
    html: string;
    text: string;
    subject: string;
    idempotencyKey: string;
  },
): Promise<SendResult> {
  const { email, html, text, subject, idempotencyKey } = opts;
  const normalised = email.toLowerCase();
  const messageId = crypto.randomUUID();

  // 1. Idempotency — skip if already enqueued / sent today
  const { data: existing } = await supabase
    .from("email_send_log")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["sent", "pending", "suppressed"])
    .maybeSingle();

  if (existing) {
    console.log(`[daily-perf] skipping ${email} — already ${existing.status}`);
    return { ok: true, skipped: true };
  }

  // 2. Suppression check
  const { data: suppressed, error: suppErr } = await supabase
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalised)
    .maybeSingle();

  if (suppErr) {
    const msg = `suppression check failed: ${suppErr.message}`;
    console.error(`[daily-perf] ${email}: ${msg}`);
    return { ok: false, error: msg };
  }

  if (suppressed) {
    console.log(`[daily-perf] ${email} is suppressed — skipping`);
    await supabase.from("email_send_log").insert({
      message_id: messageId, idempotency_key: idempotencyKey,
      template_name: TEMPLATE_LABEL, recipient_email: email, status: "suppressed",
    });
    return { ok: true, skipped: true };
  }

  // 3. Unsubscribe token (one per email address, reused across sends)
  let unsubscribeToken: string;
  const { data: existingToken, error: tokenErr } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalised)
    .maybeSingle();

  if (tokenErr) {
    const msg = `token lookup failed: ${tokenErr.message}`;
    console.error(`[daily-perf] ${email}: ${msg}`);
    return { ok: false, error: msg };
  }

  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token;
  } else if (!existingToken) {
    const newToken = generateToken();
    await supabase.from("email_unsubscribe_tokens").upsert(
      { token: newToken, email: normalised },
      { onConflict: "email", ignoreDuplicates: true },
    );
    const { data: stored } = await supabase
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalised)
      .maybeSingle();
    unsubscribeToken = stored?.token ?? newToken;
  } else {
    // Token used (unsubscribed) but not in suppressed list — treat as suppressed
    console.log(`[daily-perf] ${email} token used — treating as suppressed`);
    return { ok: true, skipped: true };
  }

  // 4. Log pending
  await supabase.from("email_send_log").insert({
    message_id: messageId, idempotency_key: idempotencyKey,
    template_name: TEMPLATE_LABEL, recipient_email: email, status: "pending",
  });

  // 5. Enqueue
  const { error: enqueueErr } = await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id:       messageId,
      to:               email,
      from:             `${SITE_NAME} <notifications@${FROM_DOMAIN}>`,
      sender_domain:    SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose:          "transactional",
      label:            TEMPLATE_LABEL,
      idempotency_key:  idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at:        new Date().toISOString(),
    },
  });

  if (enqueueErr) {
    const msg = `enqueue failed: ${enqueueErr.message}`;
    console.error(`[daily-perf] ${email}: ${msg}`);
    await supabase.from("email_send_log").insert({
      message_id: messageId, idempotency_key: idempotencyKey,
      template_name: TEMPLATE_LABEL, recipient_email: email,
      status: "failed", error_message: msg,
    });
    return { ok: false, error: msg };
  }

  console.log(`[daily-perf] enqueued → ${email}`);
  return { ok: true };
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean    = !!body?.dryRun;
    const testEmail: string | undefined = body?.testEmail;
    const testMode           = testEmail !== undefined;
    const dateOverride: string | undefined = body?.reportingDate ?? body?.date;

    const reportingDateStr = dateOverride ?? getReportingDateET();
    const reportingDate    = formatDisplayDate(reportingDateStr);

    console.log(`[daily-perf] date=${reportingDateStr} testMode=${testMode} dryRun=${dryRun}`);

    // ── 1. Fetch today's data ───────────────────────────────────────────────
    const { data: rawLines, error: dataErr } = await supabase
      .from("v_companywide_reporting_actuals")
      .select("metric_type, brand_category, amount")
      .eq("transaction_date", reportingDateStr)
      .limit(5000);

    if (dataErr) throw dataErr;

    const lines = (rawLines ?? []).map((r: any) => ({
      metric_type:    String(r.metric_type ?? ""),
      brand_category: (r.brand_category ?? null) as string | null,
      amount:         Number(r.amount) || 0,
    }));

    const invoicedRows  = aggregateByCollection(lines, "invoiced");
    const bookingRows   = aggregateByCollection(lines, "bookings");
    const totalInvoiced = invoicedRows.reduce((s, r) => s + r.amount, 0);
    const totalBookings  = bookingRows.reduce((s, r) => s + r.amount, 0);

    console.log(`[daily-perf] invoiced=$${Math.round(totalInvoiced)} bookings=$${Math.round(totalBookings)}`);

    const templateData = {
      reportingDate,
      totalInvoiced,
      totalBookings,
      invoicedRows,
      bookingRows,
      portalUrl: PORTAL_URL,
    };

    // ── 2. Resolve recipients ───────────────────────────────────────────────
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager"]);
    if (roleErr) throw roleErr;

    const eligibleIds = new Set((roleRows ?? []).map((r: any) => String(r.user_id)));

    const listResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listResult.error) throw listResult.error;

    const seen = new Set<string>();
    const allRecipients: string[] = [];
    for (const u of listResult.data?.users ?? []) {
      if (!eligibleIds.has(u.id)) continue;
      const email = (u.email ?? "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      allRecipients.push(email);
    }

    console.log(`[daily-perf] ${allRecipients.length} recipient(s): ${allRecipients.join(", ")}`);

    // ── 3. Dry run ──────────────────────────────────────────────────────────
    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok:             true,
          dryRun:         true,
          reportingDate,
          reportingDateStr,
          totalInvoiced,
          totalBookings,
          invoicedRows,
          bookingRows,
          recipients:     allRecipients,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Render template (once, shared across all recipients) ─────────────
    const html = await renderAsync(
      React.createElement(dailyPerfTemplate.component, templateData),
    );
    const text = await renderAsync(
      React.createElement(dailyPerfTemplate.component, templateData),
      { plainText: true },
    );
    const subject =
      typeof dailyPerfTemplate.subject === "function"
        ? dailyPerfTemplate.subject(templateData)
        : dailyPerfTemplate.subject;

    // ── 5. Send ─────────────────────────────────────────────────────────────
    const toList: string[] = testMode ? [testEmail!] : allRecipients;
    let emailed = 0;
    const errors: string[] = [];

    for (const email of toList) {
      const idempotencyKey = `daily-performance-${reportingDateStr}-${email}${testMode ? `-test-${Date.now()}` : ""}`;
      const result = await sendToRecipient(supabase, { email, html, text, subject, idempotencyKey });
      if (result.ok) {
        if (!result.skipped) emailed++;
      } else {
        errors.push(`${email}: ${result.error ?? "unknown error"}`);
      }
    }

    // Non-200 if nothing was sent and there were errors
    if (emailed === 0 && errors.length > 0) {
      return new Response(
        JSON.stringify({
          ok:     false,
          ...(testMode ? { testMode: true } : {}),
          reportingDate,
          recipients: toList,
          emailed,
          errors,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok:     true,
        ...(testMode ? { testMode: true } : {}),
        reportingDate,
        reportingDateStr,
        totalInvoiced,
        totalBookings,
        recipients: toList,
        emailed,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[daily-perf] fatal:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
