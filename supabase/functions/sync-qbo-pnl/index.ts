import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SYNC_YEAR      = 2026;
const MINOR_VERSION  = "70";

// ── Types ────────────────────────────────────────────────────────────────────

interface QboConnection {
  id:                       string;
  realm_id:                 string;
  access_token:             string;
  refresh_token:            string;
  access_token_expires_at:  string | null;
  refresh_token_expires_at: string | null;
}

interface TokenResponse {
  access_token:               string;
  refresh_token:              string;
  expires_in:                 number;
  x_refresh_token_expires_in: number;
}

interface ExtractedPnl {
  invoiced_actual:        number;
  sales:                  number | null;
  ecommerce_allowance:    number | null;
  discounts:              number | null;
  qc_factory_defect:      number | null;
  qc_freight_damage:      number | null;
  qc_internal_oversight:  number | null;
  qc_returns:             number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getQboBaseUrl(): string {
  const env = Deno.env.get("QBO_ENVIRONMENT") ?? "sandbox";
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Last calendar day of month m (1-based) in year y. */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null || raw === "" || raw === "0.00" || raw === "0") return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function parseAmountOrZero(raw: string | undefined | null): number {
  return parseAmount(raw) ?? 0;
}

/** Map a QBO account display name to the relevant ExtractedPnl field. */
function mapAccountName(
  name: string,
  amount: number,
  out: ExtractedPnl,
): void {
  const n = name.toLowerCase().trim();
  // Match most-specific patterns first to avoid false positives.
  if (n === "sales")                                               { out.sales                 = (out.sales                ?? 0) + amount; return; }
  if (n.includes("e-commerce allowance") || n.includes("ecommerce allowance")) { out.ecommerce_allowance   = (out.ecommerce_allowance   ?? 0) + amount; return; }
  if (n === "discounts" || n === "discount given")                 { out.discounts              = (out.discounts             ?? 0) + amount; return; }
  if (n.includes("factory defect"))                                { out.qc_factory_defect      = (out.qc_factory_defect     ?? 0) + amount; return; }
  if (n.includes("freight damage"))                                { out.qc_freight_damage      = (out.qc_freight_damage     ?? 0) + amount; return; }
  if (n.includes("internal oversight"))                            { out.qc_internal_oversight  = (out.qc_internal_oversight ?? 0) + amount; return; }
  if (n.includes("qc returns") || (n.includes("returns") && n.startsWith("qc"))) {
    out.qc_returns = (out.qc_returns ?? 0) + amount;
  }
}

/** Recursively walk a P&L Rows.Row array and populate ExtractedPnl. */
function walkRows(rows: unknown[], out: ExtractedPnl): void {
  if (!Array.isArray(rows)) return;
  for (const row of rows as Record<string, unknown>[]) {
    if (row["type"] === "Data") {
      const cols = (row["ColData"] as Record<string, string>[] | undefined) ?? [];
      const accountName = cols[0]?.value ?? "";
      const amount = parseAmountOrZero(cols[1]?.value);
      if (accountName) mapAccountName(accountName, amount, out);
    } else if (row["type"] === "Section") {
      // Recurse into nested sections (e.g. "Quality Control").
      const inner = (row["Rows"] as Record<string, unknown> | undefined) ?? {};
      walkRows((inner["Row"] as unknown[]) ?? [], out);
    }
  }
}

/** Parse Total Income and named accounts from a QBO P&L report response. */
function extractPnl(report: Record<string, unknown>): ExtractedPnl {
  const out: ExtractedPnl = {
    invoiced_actual:       0,
    sales:                 null,
    ecommerce_allowance:   null,
    discounts:             null,
    qc_factory_defect:     null,
    qc_freight_damage:     null,
    qc_internal_oversight: null,
    qc_returns:            null,
  };

  const topRows = ((report["Rows"] as Record<string, unknown>)?.["Row"] as unknown[]) ?? [];

  // Find the Income section (group="Income" or Header ColData[0]="Income").
  const incomeSection = (topRows as Record<string, unknown>[]).find((r) => {
    if (r["group"] === "Income") return true;
    const header = r["Header"] as Record<string, unknown> | undefined;
    const cols   = (header?.["ColData"] as Record<string, string>[] | undefined) ?? [];
    return cols[0]?.value === "Income";
  });

  if (!incomeSection) return out;

  // Total Income from the section Summary.
  const summary = incomeSection["Summary"] as Record<string, unknown> | undefined;
  const sumCols  = (summary?.["ColData"] as Record<string, string>[] | undefined) ?? [];
  out.invoiced_actual = parseAmountOrZero(sumCols[1]?.value);

  // Walk rows for named accounts.
  const innerRows = (incomeSection["Rows"] as Record<string, unknown> | undefined) ?? {};
  walkRows((innerRows["Row"] as unknown[]) ?? [], out);

  return out;
}

// ── Core logic ───────────────────────────────────────────────────────────────

async function refreshAccessToken(
  conn: QboConnection,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
      "Accept":        "application/json",
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId     = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;

  const supabase  = createClient(supabaseUrl, serviceKey);
  const qboBase   = getQboBaseUrl();

  // ── 1. Load active QBO connection ─────────────────────────────────────────
  const { data: connRows, error: connErr } = await supabase
    .from("qbo_connections")
    .select("id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (connErr || !connRows || connRows.length === 0) {
    return jsonError("No active QuickBooks connection found. Connect QBO first.", 400);
  }

  let conn = connRows[0] as QboConnection;

  // ── 2. Refresh access token ────────────────────────────────────────────────
  let freshTokens: TokenResponse;
  try {
    freshTokens = await refreshAccessToken(conn, clientId, clientSecret);
  } catch (err) {
    await logSync(supabase, {
      function_name: "sync-qbo-pnl",
      status:        "error",
      qbo_endpoint:  TOKEN_ENDPOINT,
      error_message: String(err),
    });
    return jsonError(`Token refresh failed: ${String(err)}`, 502);
  }

  const now = Date.now();
  const { error: tokenUpdateErr } = await supabase
    .from("qbo_connections")
    .update({
      access_token:             freshTokens.access_token,
      refresh_token:            freshTokens.refresh_token,
      access_token_expires_at:  new Date(now + freshTokens.expires_in * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + freshTokens.x_refresh_token_expires_in * 1000).toISOString(),
      updated_at:               new Date().toISOString(),
    })
    .eq("realm_id", conn.realm_id);

  if (tokenUpdateErr) {
    console.error("Failed to persist refreshed tokens:", tokenUpdateErr.message);
  }

  // Use the fresh access token for all subsequent API calls.
  conn = { ...conn, access_token: freshTokens.access_token };

  // ── 3. Determine month range ───────────────────────────────────────────────
  const today        = new Date();
  const currentYear  = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-based

  // Sync from January to the current month of SYNC_YEAR.
  // If SYNC_YEAR is in the future, cap at December.
  const endMonth = currentYear === SYNC_YEAR ? currentMonth : 12;

  const results: { month: number; start_date: string; end_date: string; invoiced_actual: number; status: string }[] = [];

  // ── 4. Sync each month ─────────────────────────────────────────────────────
  for (let month = 1; month <= endMonth; month++) {
    const startDate = `${SYNC_YEAR}-${pad(month)}-01`;
    const endDate   = `${SYNC_YEAR}-${pad(month)}-${pad(lastDayOfMonth(SYNC_YEAR, month))}`;
    const pnlUrl    = `${qboBase}/v3/company/${conn.realm_id}/reports/ProfitAndLoss` +
      `?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual&minorversion=${MINOR_VERSION}`;

    let intuitTid: string | null = null;
    let pnlData: Record<string, unknown> | null = null;

    try {
      const pnlRes = await fetch(pnlUrl, {
        headers: {
          "Authorization": `Bearer ${conn.access_token}`,
          "Accept":        "application/json",
        },
      });

      intuitTid = pnlRes.headers.get("intuit_tid") ?? pnlRes.headers.get("Intuit-Tid") ?? null;

      if (!pnlRes.ok) {
        const errBody = await pnlRes.text();
        await logSync(supabase, {
          function_name: "sync-qbo-pnl",
          status:        "error",
          qbo_endpoint:  pnlUrl,
          intuit_tid:    intuitTid,
          error_code:    String(pnlRes.status),
          error_message: errBody,
        });
        results.push({ month, start_date: startDate, end_date: endDate, invoiced_actual: 0, status: `error:${pnlRes.status}` });
        continue;
      }

      pnlData = await pnlRes.json() as Record<string, unknown>;
    } catch (fetchErr) {
      await logSync(supabase, {
        function_name: "sync-qbo-pnl",
        status:        "error",
        qbo_endpoint:  pnlUrl,
        error_message: String(fetchErr),
      });
      results.push({ month, start_date: startDate, end_date: endDate, invoiced_actual: 0, status: "fetch_error" });
      continue;
    }

    // Parse the P&L report.
    const pnl = extractPnl(pnlData);

    // Upsert into portal_qbo_monthly_invoicing_actuals.
    const { error: upsertErr } = await supabase
      .from("portal_qbo_monthly_invoicing_actuals")
      .upsert(
        {
          year:                  SYNC_YEAR,
          month_number:          month,
          invoiced_actual:       pnl.invoiced_actual,
          sales:                 pnl.sales,
          ecommerce_allowance:   pnl.ecommerce_allowance,
          discounts:             pnl.discounts,
          qc_factory_defect:     pnl.qc_factory_defect,
          qc_freight_damage:     pnl.qc_freight_damage,
          qc_internal_oversight: pnl.qc_internal_oversight,
          qc_returns:            pnl.qc_returns,
          qbo_report_basis:      "Accrual",
          qbo_start_date:        startDate,
          qbo_end_date:          endDate,
          source:                "qbo",
          synced_at:             new Date().toISOString(),
        },
        { onConflict: "year,month_number" },
      );

    if (upsertErr) {
      await logSync(supabase, {
        function_name: "sync-qbo-pnl",
        status:        "error",
        qbo_endpoint:  pnlUrl,
        intuit_tid:    intuitTid,
        error_code:    "upsert_failed",
        error_message: upsertErr.message,
        raw_response:  pnlData,
      });
      results.push({ month, start_date: startDate, end_date: endDate, invoiced_actual: pnl.invoiced_actual, status: "upsert_error" });
      continue;
    }

    await logSync(supabase, {
      function_name: "sync-qbo-pnl",
      status:        "ok",
      qbo_endpoint:  pnlUrl,
      intuit_tid:    intuitTid,
    });

    results.push({
      month,
      start_date:      startDate,
      end_date:        endDate,
      invoiced_actual: pnl.invoiced_actual,
      status:          "ok",
    });
  }

  // ── 5. Refresh materialized view ──────────────────────────────────────────
  let viewRefreshStatus = "ok";
  const { error: viewErr } = await (supabase as any).rpc("refresh_portal_monthly_invoiced_actuals");
  if (viewErr) {
    console.error("Materialized view refresh failed:", viewErr.message);
    viewRefreshStatus = `error: ${viewErr.message}`;
  }

  // ── 6. Return summary ─────────────────────────────────────────────────────
  const synced  = results.filter((r) => r.status === "ok").length;
  const errored = results.filter((r) => r.status !== "ok").length;

  return new Response(
    JSON.stringify({
      ok:                   errored === 0,
      year:                 SYNC_YEAR,
      months_synced:        synced,
      months_errored:       errored,
      view_refresh:         viewRefreshStatus,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// ── Utility: write to qbo_sync_logs ──────────────────────────────────────────

async function logSync(
  supabase: ReturnType<typeof createClient>,
  entry: {
    function_name:  string;
    status:         string;
    qbo_endpoint?:  string;
    intuit_tid?:    string | null;
    error_code?:    string;
    error_message?: string;
    raw_response?:  unknown;
  },
): Promise<void> {
  const { error } = await supabase
    .from("qbo_sync_logs")
    .insert({
      function_name:  entry.function_name,
      status:         entry.status,
      qbo_endpoint:   entry.qbo_endpoint   ?? null,
      intuit_tid:     entry.intuit_tid     ?? null,
      error_code:     entry.error_code     ?? null,
      error_message:  entry.error_message  ?? null,
      raw_response:   entry.raw_response   ?? null,
      created_at:     new Date().toISOString(),
    });
  if (error) {
    console.error("Failed to write sync log:", error.message);
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
