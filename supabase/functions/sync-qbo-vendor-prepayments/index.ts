import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Syncs the "Vendor Prepayments" QBO account (id 1203, Other Current
// Asset) into Supabase: the current balance (Inventory page's Prepaid
// Inventory headline figure) and the full transaction-level General
// Ledger detail behind it (the drilldown). Mirrors sync-qbo-pnl's
// token-refresh/logging pattern.
//
// The account id is hardcoded deliberately -- this is a company-specific
// integration against Lineage's real QBO chart of accounts, not a
// generic multi-tenant script (same approach as sync-qbo-pnl's SYNC_YEAR).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "70";
const VENDOR_PREPAYMENTS_ACCOUNT_ID = "1203";
const GL_START_DATE = "2015-01-01"; // wide enough to capture full history

interface QboConnection {
  realm_id: string;
  access_token: string;
  refresh_token: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
}

interface GlLine {
  qbo_txn_id: string | null;
  transaction_date: string;
  transaction_type: string | null;
  doc_num: string | null;
  vendor_name: string | null;
  memo: string | null;
  amount: number;
  running_balance: number | null;
}

function getQboBaseUrl(): string {
  const env = Deno.env.get("QBO_ENVIRONMENT") ?? "sandbox";
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function parseMoney(raw: string | undefined | null): number {
  if (raw == null || raw === "") return 0;
  const n = parseFloat(raw.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Walks the GeneralLedger report's nested section for one account and extracts each transaction line. */
function extractGlLines(report: Record<string, unknown>): GlLine[] {
  const topRows = ((report["Rows"] as Record<string, unknown>)?.["Row"] as unknown[]) ?? [];
  const accountSection = (topRows as Record<string, unknown>[])[0];
  if (!accountSection) return [];

  const innerRows = ((accountSection["Rows"] as Record<string, unknown>)?.["Row"] as unknown[]) ?? [];
  const lines: GlLine[] = [];

  for (const row of innerRows as Record<string, unknown>[]) {
    if (row["type"] !== "Data") continue;
    const cols = (row["ColData"] as Record<string, unknown>[] | undefined) ?? [];
    // Column order: Date, Transaction Type(+id), Num, Name(+id), Memo, Split, Amount, Balance
    const txnTypeCol = cols[1] as { value?: string; id?: string } | undefined;
    const nameCol = cols[3] as { value?: string; id?: string } | undefined;

    lines.push({
      qbo_txn_id: txnTypeCol?.id ?? null,
      transaction_date: (cols[0]?.value as string) ?? "",
      transaction_type: txnTypeCol?.value ?? null,
      doc_num: (cols[2]?.value as string) || null,
      vendor_name: nameCol?.value || null,
      memo: (cols[4]?.value as string) || null,
      amount: parseMoney(cols[6]?.value as string),
      running_balance: cols[7]?.value ? parseMoney(cols[7]?.value as string) : null,
    });
  }

  return lines;
}

async function refreshAccessToken(conn: QboConnection, clientId: string, clientSecret: string): Promise<TokenResponse> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
      "Accept": "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

const ADMIN_EMAILS = new Set([
  "justin@lineage-collections.com",
  "scott@lineage-collections.com",
  "andrew@lineage-collections.com",
  "gabriella@lineage-collections.com",
]);

async function authorize(req: Request, supabase: ReturnType<typeof createClient>): Promise<Response | null> {
  const cronSecret = Deno.env.get("QBO_SYNC_CRON_SECRET");
  const sent = req.headers.get("x-cron-secret");
  if (cronSecret && sent && sent === cronSecret) return null;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return jsonError("Not authorized.", 401);
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return jsonError("Not authorized.", 401);
  if (ADMIN_EMAILS.has((user.email ?? "").toLowerCase())) return null;

  const [roles, mgr] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("user_managers").select("manager_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isLeader = (roles.data ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "manager") || !!mgr.data?.manager_id;
  return isLeader ? null : jsonError("Only admins and managers can run this sync.", 403);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const qboBase = getQboBaseUrl();

  // Two ways in: the scheduled job (shared secret header) or a signed-in
  // admin/manager clicking "Sync now" in the portal.
  const denied = await authorize(req, supabase);
  if (denied) return denied;

  const { data: connRows, error: connErr } = await supabase
    .from("qbo_connections")
    .select("realm_id, access_token, refresh_token")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (connErr || !connRows || connRows.length === 0) {
    return jsonError("No active QuickBooks connection found. Connect QBO first.", 400);
  }

  let conn = connRows[0] as QboConnection;

  let freshTokens: TokenResponse;
  try {
    freshTokens = await refreshAccessToken(conn, clientId, clientSecret);
  } catch (err) {
    await logSync(supabase, { function_name: "sync-qbo-vendor-prepayments", status: "error", qbo_endpoint: TOKEN_ENDPOINT, error_message: String(err) });
    return jsonError(`Token refresh failed: ${String(err)}`, 502);
  }

  const now = Date.now();
  await supabase.from("qbo_connections").update({
    access_token: freshTokens.access_token,
    refresh_token: freshTokens.refresh_token,
    access_token_expires_at: new Date(now + freshTokens.expires_in * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + freshTokens.x_refresh_token_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("realm_id", conn.realm_id);

  conn = { ...conn, access_token: freshTokens.access_token };

  // 1. Authoritative current balance + account name, from the Account entity.
  const acctUrl = `${qboBase}/v3/company/${conn.realm_id}/query?query=${encodeURIComponent(
    `SELECT Id, Name, CurrentBalance FROM Account WHERE Id = '${VENDOR_PREPAYMENTS_ACCOUNT_ID}'`,
  )}&minorversion=${MINOR_VERSION}`;

  const acctRes = await fetch(acctUrl, { headers: { "Authorization": `Bearer ${conn.access_token}`, "Accept": "application/json" } });
  if (!acctRes.ok) {
    const text = await acctRes.text();
    await logSync(supabase, { function_name: "sync-qbo-vendor-prepayments", status: "error", qbo_endpoint: acctUrl, error_code: String(acctRes.status), error_message: text });
    return jsonError(`Account query failed: ${text}`, 502);
  }
  const acctData = await acctRes.json();
  const account = acctData.QueryResponse?.Account?.[0];
  if (!account) {
    return jsonError("Vendor Prepayments account not found in QBO.", 404);
  }

  const { error: summaryErr } = await supabase.from("portal_qbo_vendor_prepayments").upsert(
    {
      qbo_account_id: VENDOR_PREPAYMENTS_ACCOUNT_ID,
      qbo_account_name: account.Name,
      current_balance: account.CurrentBalance,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "qbo_account_id" },
  );
  if (summaryErr) {
    await logSync(supabase, { function_name: "sync-qbo-vendor-prepayments", status: "error", error_code: "summary_upsert_failed", error_message: summaryErr.message });
  }

  // 2. Transaction-level detail from the GeneralLedger report.
  const today = new Date().toISOString().slice(0, 10);
  const glUrl = `${qboBase}/v3/company/${conn.realm_id}/reports/GeneralLedger?account=${VENDOR_PREPAYMENTS_ACCOUNT_ID}&start_date=${GL_START_DATE}&end_date=${today}&minorversion=${MINOR_VERSION}`;

  const glRes = await fetch(glUrl, { headers: { "Authorization": `Bearer ${conn.access_token}`, "Accept": "application/json" } });
  if (!glRes.ok) {
    const text = await glRes.text();
    await logSync(supabase, { function_name: "sync-qbo-vendor-prepayments", status: "error", qbo_endpoint: glUrl, error_code: String(glRes.status), error_message: text });
    return jsonError(`General Ledger report failed: ${text}`, 502);
  }
  const glData = await glRes.json();
  const lines = extractGlLines(glData);

  let upserted = 0;
  const batchSize = 200;
  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize).map((l) => ({
      qbo_account_id: VENDOR_PREPAYMENTS_ACCOUNT_ID,
      qbo_txn_id: l.qbo_txn_id,
      transaction_date: l.transaction_date,
      transaction_type: l.transaction_type,
      doc_num: l.doc_num,
      vendor_name: l.vendor_name,
      memo: l.memo,
      amount: l.amount,
      running_balance: l.running_balance,
      synced_at: new Date().toISOString(),
    }));
    const { error: lineErr } = await supabase
      .from("portal_qbo_vendor_prepayment_lines")
      .upsert(batch, { onConflict: "qbo_account_id,qbo_txn_id,transaction_date,amount" });
    if (lineErr) {
      await logSync(supabase, { function_name: "sync-qbo-vendor-prepayments", status: "error", error_code: "line_upsert_failed", error_message: lineErr.message });
    } else {
      upserted += batch.length;
    }
  }

  await logSync(supabase, { function_name: "sync-qbo-vendor-prepayments", status: "ok", qbo_endpoint: glUrl });

  return new Response(
    JSON.stringify({ ok: true, currentBalance: account.CurrentBalance, linesFound: lines.length, linesUpserted: upserted }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function logSync(
  supabase: ReturnType<typeof createClient>,
  entry: { function_name: string; status: string; qbo_endpoint?: string; error_code?: string; error_message?: string },
): Promise<void> {
  const { error } = await supabase.from("qbo_sync_logs").insert({
    function_name: entry.function_name,
    status: entry.status,
    qbo_endpoint: entry.qbo_endpoint ?? null,
    error_code: entry.error_code ?? null,
    error_message: entry.error_message ?? null,
    created_at: new Date().toISOString(),
  });
  if (error) console.error("Failed to write sync log:", error.message);
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
