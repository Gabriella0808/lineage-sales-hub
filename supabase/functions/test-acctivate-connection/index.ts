import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import sql from "npm:mssql@10.0.2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const hostRaw = Deno.env.get("ACCTIVATE_DB_HOST") ?? "";
  const portEnv = Deno.env.get("ACCTIVATE_DB_PORT") ?? "1433";
  const database = Deno.env.get("ACCTIVATE_DB_NAME") ?? "";
  const user = Deno.env.get("ACCTIVATE_DB_USER") ?? "";
  const password = Deno.env.get("ACCTIVATE_DB_PASSWORD") ?? "";

  // Acctivate host may be stored as "host,port" --- split if so
  let server = hostRaw;
  let port = parseInt(portEnv, 10);
  if (hostRaw.includes(",")) {
    const [h, p] = hostRaw.split(",");
    server = h.trim();
    if (p) port = parseInt(p.trim(), 10);
  }

  const diagnostics = {
    server,
    port,
    database,
    user_present: !!user,
    password_present: !!password,
  };

  try {
    const pool = await sql.connect({
      server,
      port,
      database,
      user,
      password,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      connectionTimeout: 15000,
      requestTimeout: 15000,
    });

    const result = await pool.request().query(
      "SELECT @@VERSION AS version, DB_NAME() AS db, SUSER_SNAME() AS login_name"
    );
    await pool.close();

    return new Response(
      JSON.stringify({ success: true, diagnostics, info: result.recordset[0] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    return new Response(
      JSON.stringify({ success: false, diagnostics, error: message, code }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
