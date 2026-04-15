import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SyncPayloadSchema = z.object({
  table: z.enum(["managers", "sales_reps", "territories", "rep_territories", "dealers", "contacts", "kpi_records", "activities", "tasks"]),
  rows: z.array(z.record(z.unknown())).min(1).max(5000),
  on_conflict: z.string().optional(),
});

const BatchPayloadSchema = z.object({
  batches: z.array(SyncPayloadSchema).min(1).max(20),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify request has a valid service key or sync token
  const authHeader = req.headers.get("authorization");
  const syncToken = Deno.env.get("SYNC_API_TOKEN");

  if (syncToken) {
    const provided = authHeader?.replace("Bearer ", "");
    if (provided !== syncToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid sync token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
  }

  try {
    const body = await req.json();
    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Record<string, { synced: number; error?: string }> = {};

    // Support single table or batch mode
    const batches = body.batches ? BatchPayloadSchema.parse(body).batches : [SyncPayloadSchema.parse(body)];

    for (const batch of batches) {
      const { table, rows, on_conflict } = batch;

      const { error, count } = await supabase
        .from(table)
        .upsert(rows as Record<string, unknown>[], {
          onConflict: on_conflict || "acctivate_id",
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`Error upserting ${table}:`, error.message);
        results[table] = { synced: 0, error: error.message };
      } else {
        results[table] = { synced: rows.length };
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced_at: new Date().toISOString(), results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Sync ingestion error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
