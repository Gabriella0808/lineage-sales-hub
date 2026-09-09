// Labor Day Promo (LD26) Internal Email — self-contained send
//
// Mirrors send-daily-performance-email's structure (render locally, enqueue via
// enqueue_email directly). Data logic mirrors src/pages/LaborDayPromoPage.tsx
// exactly: participant roster drives the numbers (zero-sales dealers/reps still
// count toward goals), sales lines not matched to a roster row are excluded from
// totals, same as the portal page's "unmatched" audit panel.
//
// Request body (all optional):
//   dryRun: true              — compute data + recipients, do not send
//   testEmail: "a@b.com"      — send only to this address; sets testMode: true in response
//
// HARD CUTOFF: this function no-ops (no data fetch, no send) for any America/
// New_York date after 2026-09-15, regardless of mode (cron/dryRun/test) or
// whether the cron job itself is still active. See CUTOFF_DATE_ET below.
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { template as laborDayPromoTemplate } from "../_shared/transactional-email-templates/labor-day-promo-report.tsx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME     = "Lineage Collections";
const FROM_DOMAIN   = "lineage-collections.com";
const SENDER_DOMAIN = "lineage-collections.com";
const TEMPLATE_LABEL = "labor-day-promo-report";
const PORTAL_URL     = "https://lineage-collections-portal.com/promotions/labor-day-promo";
const SUBJECT         = "Labor Day Promo Results - Daily Update";

const PROMO_SLUG    = "ld26";
const DISCOUNT_CODE = "LD26";
const DEALER_GOAL   = 5000;
const CUTOFF_DATE_ET = "2026-09-15"; // last day this email should send (inclusive)
const UNCLASSIFIED   = "Unclassified Collection"; // mirrors LaborDayPromoPage.tsx

// ── Timezone helpers ──────────────────────────────────────────────────────────

function getTodayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function getNowETDisplay(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date()) + " ET";
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
  opts: { email: string; html: string; text: string; subject: string; idempotencyKey: string },
): Promise<SendResult> {
  const { email, html, text, subject, idempotencyKey } = opts;
  const normalised = email.toLowerCase();
  const messageId = crypto.randomUUID();

  const { data: existing } = await supabase
    .from("email_send_log")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["sent", "pending", "suppressed"])
    .maybeSingle();

  if (existing) {
    console.log(`[ld26-email] skipping ${email} — already ${existing.status}`);
    return { ok: true, skipped: true };
  }

  const { data: suppressed, error: suppErr } = await supabase
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalised)
    .maybeSingle();

  if (suppErr) {
    const msg = `suppression check failed: ${suppErr.message}`;
    console.error(`[ld26-email] ${email}: ${msg}`);
    return { ok: false, error: msg };
  }

  if (suppressed) {
    console.log(`[ld26-email] ${email} is suppressed — skipping`);
    await supabase.from("email_send_log").insert({
      message_id: messageId, idempotency_key: idempotencyKey,
      template_name: TEMPLATE_LABEL, recipient_email: email, status: "suppressed",
    });
    return { ok: true, skipped: true };
  }

  let unsubscribeToken: string;
  const { data: existingToken, error: tokenErr } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalised)
    .maybeSingle();

  if (tokenErr) {
    const msg = `token lookup failed: ${tokenErr.message}`;
    console.error(`[ld26-email] ${email}: ${msg}`);
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
    console.log(`[ld26-email] ${email} token used — treating as suppressed`);
    return { ok: true, skipped: true };
  }

  await supabase.from("email_send_log").insert({
    message_id: messageId, idempotency_key: idempotencyKey,
    template_name: TEMPLATE_LABEL, recipient_email: email, status: "pending",
  });

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
    console.error(`[ld26-email] ${email}: ${msg}`);
    await supabase.from("email_send_log").insert({
      message_id: messageId, idempotency_key: idempotencyKey,
      template_name: TEMPLATE_LABEL, recipient_email: email,
      status: "failed", error_message: msg,
    });
    return { ok: false, error: msg };
  }

  console.log(`[ld26-email] enqueued → ${email}`);
  return { ok: true };
}

// ── LD26 data types ────────────────────────────────────────────────────────────

interface Participant {
  cust_id: string;
  company_name: string | null;
  dealer_name: string | null;
  salesperson_id: string;
  salesperson_name: string | null;
}

interface SalesLine {
  transaction_date: string;
  customer_id: string;
  product_class: string | null;
  amount: number;
}

const norm = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Hard cutoff — checked before anything else, applies to every mode ────
    const todayET = getTodayET();
    if (todayET > CUTOFF_DATE_ET) {
      console.log(`[ld26-email] past cutoff (${CUTOFF_DATE_ET} ET) — today is ${todayET} ET — no-op`);
      return new Response(
        JSON.stringify({
          ok: true, stopped: true,
          reason: `Past hard cutoff date (${CUTOFF_DATE_ET} America/New_York, inclusive). Today is ${todayET}.`,
          todayET, cutoffDateET: CUTOFF_DATE_ET,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body?.dryRun;
    const testEmail: string | undefined = body?.testEmail;
    const testMode = testEmail !== undefined;
    const mode = testMode ? "test" : dryRun ? "dry-run" : "cron";

    console.log(`[ld26-email] mode=${mode} todayET=${todayET} cutoff=${CUTOFF_DATE_ET}`);

    // ── 1. Fetch participant roster + LD26 booking lines (same source as the
    //        portal page) + optional promo date range ──────────────────────
    const [participantsRes, salesRes, promoRes] = await Promise.all([
      supabase
        .from("labor_day_2026_participants")
        .select("cust_id,company_name,dealer_name,salesperson_id,salesperson_name")
        .eq("promo_slug", PROMO_SLUG)
        .eq("active", true),
      supabase
        .from("v_portal_dealer_rep_reporting_lines")
        .select("transaction_date,customer_id,product_class,amount")
        .eq("metric_type", "bookings")
        .eq("discount_code", DISCOUNT_CODE),
      supabase
        .from("promotions")
        .select("start_date,end_date")
        .eq("slug", "labor-day-promo")
        .maybeSingle(),
    ]);

    if (participantsRes.error) throw participantsRes.error;
    if (salesRes.error) throw salesRes.error;

    const participants: Participant[] = (participantsRes.data ?? []).map((r: any) => ({
      cust_id:          String(r.cust_id ?? ""),
      company_name:     r.company_name ?? null,
      dealer_name:      r.dealer_name ?? null,
      salesperson_id:   String(r.salesperson_id ?? ""),
      salesperson_name: r.salesperson_name ?? null,
    }));

    const dateFrom = promoRes.data?.start_date ?? null;
    const dateTo   = promoRes.data?.end_date ?? null;

    let lines: SalesLine[] = (salesRes.data ?? []).map((r: any) => ({
      transaction_date: String(r.transaction_date ?? ""),
      customer_id:      r.customer_id ?? "",
      product_class:    r.product_class ?? null,
      amount:            Number(r.amount) || 0,
    }));
    if (dateFrom) lines = lines.filter((l) => l.transaction_date >= dateFrom);
    if (dateTo)   lines = lines.filter((l) => l.transaction_date <= dateTo);

    // ── 2. Match sales to the roster (normalized customer_id) — participant-
    //        driven: every roster row appears, $0 sales included. Grouped by
    //        collection (product_class) within each dealer, same as the
    //        portal page's Rep > Dealer > Collection > SKU table (SKU level
    //        omitted here — too granular for a daily email). ────────────────
    const salesByCustId = new Map<string, { total: number; collections: Map<string, number> }>();
    for (const l of lines) {
      const key = norm(l.customer_id);
      if (!salesByCustId.has(key)) salesByCustId.set(key, { total: 0, collections: new Map() });
      const agg = salesByCustId.get(key)!;
      agg.total += l.amount;
      const collName = l.product_class && l.product_class.trim() ? l.product_class.trim() : UNCLASSIFIED;
      agg.collections.set(collName, (agg.collections.get(collName) ?? 0) + l.amount);
    }

    interface CollectionAgg { name: string; total_sales: number }
    interface DealerAgg {
      dealer_name: string; total_sales: number; goal: number; pct_goal: number;
      collections: CollectionAgg[];
    }
    interface RepAgg {
      rep_name: string; participating_dealers: number; dealers_with_sales: number;
      total_sales: number; goal: number; pct_goal: number; dealers: DealerAgg[];
    }

    const repMap = new Map<string, { rep_name: string; dealers: DealerAgg[] }>();
    for (const p of participants) {
      const custAgg = salesByCustId.get(norm(p.cust_id));
      const dealerSales = custAgg?.total ?? 0;
      const collections: CollectionAgg[] = custAgg
        ? [...custAgg.collections.entries()]
            .map(([name, total_sales]) => ({ name, total_sales }))
            .sort((a, b) => b.total_sales - a.total_sales)
        : [];

      const repKey  = p.salesperson_id;
      const repName = p.salesperson_name || p.salesperson_id;
      if (!repMap.has(repKey)) repMap.set(repKey, { rep_name: repName, dealers: [] });
      repMap.get(repKey)!.dealers.push({
        dealer_name: p.company_name || p.dealer_name || p.cust_id,
        total_sales: dealerSales,
        goal: DEALER_GOAL,
        pct_goal: (dealerSales / DEALER_GOAL) * 100,
        collections,
      });
    }

    const repRows: RepAgg[] = [...repMap.values()].map((r) => {
      const dealers = [...r.dealers].sort((a, b) => b.total_sales - a.total_sales);
      const total = dealers.reduce((s, d) => s + d.total_sales, 0);
      const goal  = dealers.length * DEALER_GOAL;
      return {
        rep_name: r.rep_name,
        participating_dealers: dealers.length,
        dealers_with_sales: dealers.filter((d) => d.total_sales > 0).length,
        total_sales: total,
        goal,
        pct_goal: goal > 0 ? (total / goal) * 100 : 0,
        dealers,
      };
    }).sort((a, b) => b.total_sales - a.total_sales || a.rep_name.localeCompare(b.rep_name));

    const allDealerRows = repRows.flatMap((r) => r.dealers.map((d) => ({ ...d, rep_name: r.rep_name })));

    const totalSales = repRows.reduce((s, r) => s + r.total_sales, 0);
    const participatingDealers = participants.length;
    const totalGoal = participatingDealers * DEALER_GOAL;
    const pctGoal = totalGoal > 0 ? (totalSales / totalGoal) * 100 : 0;
    const dealersWithSales = allDealerRows.filter((d) => d.total_sales > 0).length;
    const dealersNoSales = participatingDealers - dealersWithSales;
    const activeSellingReps = repRows.filter((r) => r.total_sales > 0).length;

    const topRep = repRows[0] ?? null;
    const topDealer = [...allDealerRows].sort((a, b) => b.total_sales - a.total_sales)[0] ?? null;

    console.log(
      `[ld26-email] participants=${participatingDealers} withSales=${dealersWithSales} noSales=${dealersNoSales} ` +
      `activeReps=${activeSellingReps} totalSales=$${Math.round(totalSales)} totalGoal=$${totalGoal} pctGoal=${pctGoal.toFixed(1)}%`,
    );

    const templateData = {
      updatedAsOf: getNowETDisplay(),
      totalSales,
      totalGoal,
      pctGoal,
      participatingDealers,
      dealersWithSales,
      dealersNoSales,
      activeSellingReps,
      topRepName: topRep?.rep_name ?? "-",
      topRepSales: topRep?.total_sales ?? 0,
      topDealerName: topDealer?.dealer_name ?? "-",
      topDealerSales: topDealer?.total_sales ?? 0,
      repRows,
      portalUrl: PORTAL_URL,
    };

    // ── 3. Resolve recipients — admin/manager portal users ONLY ─────────────
    // Never dealers, never reps unless they also hold an admin/manager role.
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager"]);
    if (roleErr) throw roleErr;

    const eligibleRoleById = new Map<string, string>();
    for (const r of roleRows ?? []) eligibleRoleById.set(String(r.user_id), r.role);

    const listResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listResult.error) throw listResult.error;

    const now = new Date();
    const seen = new Set<string>();
    const allRecipients: string[] = [];
    let adminCount = 0;
    let managerCount = 0;
    for (const u of listResult.data?.users ?? []) {
      const role = eligibleRoleById.get(u.id);
      if (!role) continue;
      if (u.banned_until && new Date(u.banned_until) > now) continue;
      const email = (u.email ?? "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      allRecipients.push(email);
      if (role === "admin") adminCount++;
      else if (role === "manager") managerCount++;
    }

    // Log recipient count + role breakdown; never log full customer/dealer data
    // (this function never touches dealer/customer emails at all).
    console.log(
      `[ld26-email] mode=${mode} recipientCount=${allRecipients.length} admin=${adminCount} manager=${managerCount}`,
    );

    // ── 4. Dry run ────────────────────────────────────────────────────────
    if (dryRun) {
      console.log(`[ld26-email] dry-run — not sending`);
      return new Response(
        JSON.stringify({
          ok: true,
          mode,
          dryRun: true,
          todayET,
          cutoffDateET: CUTOFF_DATE_ET,
          recipientCount: allRecipients.length,
          adminCount,
          managerCount,
          recipients: allRecipients,
          totalSales,
          totalGoal,
          pctGoal,
          participatingDealers,
          dealersWithSales,
          dealersNoSales,
          activeSellingReps,
          topRep: topRep ? { rep_name: topRep.rep_name, total_sales: topRep.total_sales } : null,
          topDealer: topDealer ? { dealer_name: topDealer.dealer_name, total_sales: topDealer.total_sales } : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 5. Render template (once, shared across all recipients) ─────────────
    const html = await renderAsync(React.createElement(laborDayPromoTemplate.component, templateData));
    const text = await renderAsync(React.createElement(laborDayPromoTemplate.component, templateData), { plainText: true });
    const subject = SUBJECT;

    // ── 6. Send — testMode sends ONLY to testEmail, never to real recipients ─
    const toList: string[] = testMode ? [testEmail!] : allRecipients;
    console.log(`[ld26-email] mode=${mode} sending to ${toList.length} recipient(s)`);
    let emailed = 0;
    const errors: string[] = [];

    for (const email of toList) {
      const idempotencyKey = `labor-day-promo-${todayET}-${email}${testMode ? `-test-${Date.now()}` : ""}`;
      const result = await sendToRecipient(supabase, { email, html, text, subject, idempotencyKey });
      if (result.ok) {
        if (!result.skipped) emailed++;
      } else {
        errors.push(`${email}: ${result.error ?? "unknown error"}`);
      }
    }

    console.log(`[ld26-email] mode=${mode} emailed=${emailed} errors=${errors.length}`);

    if (emailed === 0 && errors.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false, mode, ...(testMode ? { testMode: true } : {}),
          recipientCount: toList.length, emailed, errors,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true, mode, ...(testMode ? { testMode: true } : {}),
        todayET,
        recipientCount: toList.length,
        adminCount: testMode ? undefined : adminCount,
        managerCount: testMode ? undefined : managerCount,
        totalSales, totalGoal, pctGoal,
        emailed, errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ld26-email] fatal:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
