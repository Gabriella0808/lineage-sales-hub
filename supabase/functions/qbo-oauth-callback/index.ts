import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId    = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("QBO_REDIRECT_URI")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const code    = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state   = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // QBO sent back an error (e.g. user denied access).
  if (errorParam) {
    return htmlResponse(
      "Connection Failed",
      `QuickBooks returned an error: ${errorParam}. Please try again.`,
      true,
    );
  }

  if (!code || !realmId || !state) {
    return htmlResponse("Missing Parameters", "Required OAuth parameters are missing.", true);
  }

  // ── 1. Validate and consume the state ───────────────────────────────────────
  const { data: stateRow, error: stateErr } = await supabase
    .from("qbo_oauth_states")
    .select("state, used_at")
    .eq("state", state)
    .maybeSingle();

  if (stateErr || !stateRow) {
    return htmlResponse("Invalid State", "OAuth state is invalid or has expired.", true);
  }
  if (stateRow.used_at) {
    return htmlResponse("State Already Used", "This OAuth link has already been used.", true);
  }

  await supabase
    .from("qbo_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state);

  // ── 2. Exchange authorization code for tokens ────────────────────────────────
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
      "Accept":        "application/json",
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("Token exchange failed:", tokenRes.status, body);
    return htmlResponse(
      "Token Exchange Failed",
      `Unable to retrieve access tokens from QuickBooks (${tokenRes.status}).`,
      true,
    );
  }

  const tokens = await tokenRes.json() as {
    access_token:              string;
    refresh_token:             string;
    expires_in:                number;
    x_refresh_token_expires_in: number;
    token_type:                string;
  };

  const now = Date.now();
  const accessExpiresAt  = new Date(now + tokens.expires_in * 1000).toISOString();
  const refreshExpiresAt = new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString();

  // ── 3. Upsert connection ─────────────────────────────────────────────────────
  const { error: upsertErr } = await supabase
    .from("qbo_connections")
    .upsert(
      {
        realm_id:                 realmId,
        access_token:             tokens.access_token,
        refresh_token:            tokens.refresh_token,
        access_token_expires_at:  accessExpiresAt,
        refresh_token_expires_at: refreshExpiresAt,
        connected_at:             new Date().toISOString(),
        updated_at:               new Date().toISOString(),
      },
      { onConflict: "realm_id" },
    );

  if (upsertErr) {
    console.error("Failed to save connection:", upsertErr.message);
    return htmlResponse(
      "Database Error",
      "Tokens were received but could not be saved. Please try again.",
      true,
    );
  }

  return htmlResponse(
    "Connected",
    "QuickBooks Online connected successfully. You can close this window.",
    false,
  );
});

function htmlResponse(title: string, message: string, isError: boolean): Response {
  const color = isError ? "#c0392b" : "#27ae60";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Lineage Collections Portal</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f6f4ef; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; }
    .card { background: #fff; border-radius: 10px; padding: 40px 48px; max-width: 420px;
            text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
    .icon { font-size: 40px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px; color: #1a1a1a; }
    p  { font-size: 14px; color: #555; margin: 0; line-height: 1.6; }
    .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%;
           background: ${color}; margin-right: 8px; vertical-align: middle; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isError ? "⚠️" : "✅"}</div>
    <h1><span class="dot"></span>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: isError ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
