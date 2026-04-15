import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as sql from "npm:mssql@11";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getMssqlConfig(): sql.config {
  const host = Deno.env.get("ACCTIVATE_DB_HOST");
  const port = Deno.env.get("ACCTIVATE_DB_PORT");
  const user = Deno.env.get("ACCTIVATE_DB_USER");
  const password = Deno.env.get("ACCTIVATE_DB_PASSWORD");
  const database = Deno.env.get("ACCTIVATE_DB_NAME");

  if (!host || !user || !password || !database) {
    throw new Error("Missing Acctivate SQL Server credentials. Check ACCTIVATE_DB_HOST, ACCTIVATE_DB_USER, ACCTIVATE_DB_PASSWORD, ACCTIVATE_DB_NAME secrets.");
  }

  return {
    server: host,
    port: port ? parseInt(port) : 51924,
    user,
    password,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    connectionTimeout: 30000,
    requestTimeout: 60000,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const mssqlConfig = getMssqlConfig();

    console.log(`Connecting to Acctivate SQL Server at ${mssqlConfig.server}:${mssqlConfig.port}...`);
    const pool = await sql.connect(mssqlConfig);
    console.log("Connected to Acctivate SQL Server successfully.");

    const results: Record<string, { synced: number; errors: string[] }> = {};

    // ─── SYNC SALES REPS ─────────────────────────────
    try {
      // Adjust this query to match your Acctivate schema
      // Common Acctivate tables: SalesRep, SalesPerson, etc.
      const repsResult = await pool.request().query(`
        SELECT 
          SalesRepID AS acctivate_id,
          SalesRepName AS name,
          Email AS email,
          Phone AS phone
        FROM SalesRep
        WHERE IsActive = 1
      `);

      for (const row of repsResult.recordset) {
        const { error } = await supabase.from("sales_reps").upsert(
          {
            acctivate_id: String(row.acctivate_id),
            name: row.name || "Unknown",
            email: row.email || null,
            phone: row.phone || null,
            status: "active",
          },
          { onConflict: "acctivate_id" }
        );
        if (error) console.error("Error upserting rep:", error.message);
      }
      results.sales_reps = { synced: repsResult.recordset.length, errors: [] };
    } catch (e) {
      console.error("Error syncing sales reps:", e.message);
      results.sales_reps = { synced: 0, errors: [e.message] };
    }

    // ─── SYNC TERRITORIES ────────────────────────────
    try {
      const terResult = await pool.request().query(`
        SELECT 
          TerritoryID AS acctivate_id,
          TerritoryName AS name,
          Region AS region,
          State AS state
        FROM SalesTerritory
      `);

      for (const row of terResult.recordset) {
        const { error } = await supabase.from("territories").upsert(
          {
            acctivate_id: String(row.acctivate_id),
            name: row.name || "Unknown",
            region: row.region || null,
            state: row.state || null,
            status: "on-track",
          },
          { onConflict: "acctivate_id" }
        );
        if (error) console.error("Error upserting territory:", error.message);
      }
      results.territories = { synced: terResult.recordset.length, errors: [] };
    } catch (e) {
      console.error("Error syncing territories:", e.message);
      results.territories = { synced: 0, errors: [e.message] };
    }

    // ─── SYNC DEALERS / CUSTOMERS ────────────────────
    try {
      // Acctivate typically stores dealers/customers in a Customer table
      const dealersResult = await pool.request().query(`
        SELECT 
          CustomerID AS acctivate_id,
          CompanyName AS name,
          City AS city,
          State AS state,
          Phone AS phone,
          Email AS email,
          WebAddress AS website,
          SalesRepID AS rep_acctivate_id,
          TerritoryID AS territory_acctivate_id
        FROM Customer
        WHERE IsActive = 1
      `);

      for (const row of dealersResult.recordset) {
        // Look up rep and territory by acctivate_id
        let repId = null;
        let territoryId = null;

        if (row.rep_acctivate_id) {
          const { data: repData } = await supabase
            .from("sales_reps")
            .select("id")
            .eq("acctivate_id", String(row.rep_acctivate_id))
            .maybeSingle();
          repId = repData?.id || null;
        }

        if (row.territory_acctivate_id) {
          const { data: terData } = await supabase
            .from("territories")
            .select("id")
            .eq("acctivate_id", String(row.territory_acctivate_id))
            .maybeSingle();
          territoryId = terData?.id || null;
        }

        const { error } = await supabase.from("dealers").upsert(
          {
            acctivate_id: String(row.acctivate_id),
            name: row.name || "Unknown",
            city: row.city || null,
            state: row.state || null,
            phone: row.phone || null,
            email: row.email || null,
            website: row.website || null,
            rep_id: repId,
            territory_id: territoryId,
            status: "active",
          },
          { onConflict: "acctivate_id" }
        );
        if (error) console.error("Error upserting dealer:", error.message);
      }
      results.dealers = { synced: dealersResult.recordset.length, errors: [] };
    } catch (e) {
      console.error("Error syncing dealers:", e.message);
      results.dealers = { synced: 0, errors: [e.message] };
    }

    await pool.close();
    console.log("Sync complete:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, synced_at: new Date().toISOString(), results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Sync failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
