// Daily Performance Email
//
// Sends a summary of today's invoices and bookings to all admins and managers.
// Scheduled by pg_cron at 22:15 UTC (6:15 PM EDT) every day.
//
// Request body (all optional):
//   dryRun: true       — compute data + recipients but do not send
//   testEmail: string  — send to this address only (skips real recipient list)
//   date: "YYYY-MM-DD" — override the reporting date (for back-testing)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://www.lineage-collections-portal.com/";

// ── Timezone helpers ──────────────────────────────────────────────────────────

function getReportingDateET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDisplayDate(dateStr: string): string {
  // Parse YYYY-MM-DD as a local date (avoid UTC-offset day shift)
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Collection mapping ────────────────────────────────────────────────────────

// brand_category values that are not real sales lines
const EXCLUDED_CATS = new Set([
  "freighto", "tariff", "salestax", "ccfee",
  "freight", "tax", "surcharge", "qc",
]);

function toCollectionLabel(bc: string | null | undefined): string | null {
  if (!bc || bc.trim() === "") return null;
  const s = bc.toLowerCase().trim();
  if (EXCLUDED_CATS.has(s)) return null;
  if (s === "sea winds" || s === "sw") return "SW";
  if (s.includes("finn") || s === "finnlou" || s === "fin") return "FIN";
  if (s === "lux") return "LUX";
  if (s === "hosp" || s === "hospitality") return "HOSP";
  if (s === "misc" || s === "allow") return "MISC";
  return null; // unrecognised — exclude to avoid leaking non-sales rows
}

// Canonical display order
const COLLECTION_ORDER = ["SW", "FIN", "LUX", "HOSP", "MISC"];

interface CollectionRow {
  label: string;
  amount: number;
}

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
  return COLLECTION_ORDER
    .filter((l) => map.has(l))
    .map((l) => ({ label: l, amount: map.get(l)! }));
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body?.dryRun;
    const testEmail: string | undefined = body?.testEmail;
    const dateOverride: string | undefined = body?.date;

    const reportingDateStr = dateOverride ?? getReportingDateET();
    const reportingDate = formatDisplayDate(reportingDateStr);

    console.log(`[daily-perf] reporting date: ${reportingDateStr}`);

    // ── 1. Fetch today's lines from the canonical view ──────────────────────
    const { data: rawLines, error: dataErr } = await supabase
      .from("v_companywide_reporting_actuals")
      .select("metric_type, brand_category, amount")
      .eq("transaction_date", reportingDateStr)
      .limit(5000);

    if (dataErr) throw dataErr;

    const lines = (rawLines ?? []).map((r: any) => ({
      metric_type:    String(r.metric_type ?? ""),
      brand_category: (r.brand_category as string | null) ?? null,
      amount:         Number(r.amount) || 0,
    }));

    const invoicedRows = aggregateByCollection(lines, "invoiced");
    const bookingRows  = aggregateByCollection(lines, "bookings");
    const totalInvoiced = invoicedRows.reduce((s, r) => s + r.amount, 0);
    const totalBookings  = bookingRows.reduce((s, r) => s + r.amount, 0);

    console.log(`[daily-perf] invoiced $${totalInvoiced.toFixed(0)}, bookings $${totalBookings.toFixed(0)}`);

    // ── 2. Resolve recipients (all admins + managers, deduped by email) ─────
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager"]);
    if (roleErr) throw roleErr;

    const eligibleIds = new Set((roleRows ?? []).map((r: any) => String(r.user_id)));

    const listResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listResult.error) throw listResult.error;

    const seen = new Set<string>();
    const recipients: Array<{ email: string; name: string }> = [];
    for (const u of listResult.data?.users ?? []) {
      if (!eligibleIds.has(u.id)) continue;
      const email = (u.email ?? "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const name =
        (u.user_metadata?.full_name as string | undefined)?.trim() ||
        email.split("@")[0];
      recipients.push({ email, name });
    }

    console.log(`[daily-perf] ${recipients.length} recipient(s): ${recipients.map(r => r.email).join(", ")}`);

    const templateData = {
      reportingDate,
      totalInvoiced,
      totalBookings,
      invoicedRows,
      bookingRows,
      portalUrl: PORTAL_URL,
    };

    // ── 3. Dry run — return computed data without sending ───────────────────
    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          dryRun: true,
          reportingDate,
          reportingDateStr,
          totalInvoiced,
          totalBookings,
          invoicedRows,
          bookingRows,
          recipients: recipients.map((r) => r.email),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Send emails ───────────────────────────────────────────────────────
    const toList = testEmail
      ? [{ email: testEmail, name: testEmail.split("@")[0] }]
      : recipients;

    let emailed = 0;
    for (const r of toList) {
      try {
        const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({
            templateName: "daily-performance-report",
            recipientEmail: r.email,
            // Idempotency key prevents duplicate sends on retries
            idempotencyKey: `daily-performance-${reportingDateStr}-${r.email}${testEmail ? `-test-${Date.now()}` : ""}`,
            templateData,
          }),
        });
        if (resp.ok) {
          emailed++;
          console.log(`[daily-perf] sent to ${r.email}`);
        } else {
          console.error(`[daily-perf] send failed for ${r.email}: ${resp.status} ${await resp.text()}`);
        }
      } catch (e) {
        console.error(`[daily-perf] send error for ${r.email}: ${String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reportingDate,
        reportingDateStr,
        totalInvoiced,
        totalBookings,
        invoicedRows,
        bookingRows,
        recipients: toList.length,
        emailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[daily-perf] fatal:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
