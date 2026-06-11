import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const protectedRepTables = ["managers", "sales_reps", "territories", "rep_territories"] as const;
const allowedSyncTables = ["dealers", "contacts", "kpi_records", "activities", "tasks", "dealer_sales", "dealer_sales_lines", "dealer_invoices", "dealer_invoice_lines", "products", "inventory", "open_sales_orders", "acctivate_sales_reps", "acctivate_sales_managers", "acctivate_territories"] as const;

const SyncPayloadSchema = z.object({
  table: z.enum(allowedSyncTables),
  rows: z.array(z.record(z.unknown())).min(1).max(5000),
  on_conflict: z.string().optional(),
});

const BatchPayloadSchema = z.object({
  batches: z.array(SyncPayloadSchema).min(1).max(20),
});

const PrunePayloadSchema = z.object({
  action: z.literal("prune"),
  table: z.enum(["inventory", "products", "dealer_sales_lines", "dealers"]),
  keep_acctivate_ids: z.array(z.string()).max(50000),
});

const LookupPayloadSchema = z.object({
  action: z.literal("lookup"),
  table: z.enum(["dealers", "products"]),
});

const ListNamesPayloadSchema = z.object({
  action: z.literal("list_names"),
  table: z.enum(["dealers"]),
});

const BackfillPayloadSchema = z.object({
  action: z.literal("backfill_acctivate_id"),
  table: z.enum(["dealers"]),
  updates: z.array(z.object({ id: z.string().uuid(), acctivate_id: z.string() })).min(1).max(5000),
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
    const requestedTables = [
      body.table,
      ...(Array.isArray(body.batches) ? body.batches.map((batch: { table?: unknown }) => batch.table) : []),
    ].filter(Boolean);
    if (requestedTables.some((table) => protectedRepTables.includes(table as typeof protectedRepTables[number]))) {
      return new Response(
        JSON.stringify({ success: false, error: "Acctivate sync is not allowed to update sales reps, managers, territories, or rep territories." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Lookup mode: return {acctivate_id: id} map for the requested table
    if (body.action === "lookup") {
      const { table } = LookupPayloadSchema.parse(body);
      const map: Record<string, string> = {};
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select("id, acctivate_id")
          .not("acctivate_id", "is", null)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const r of data as { id: string; acctivate_id: string | null }[]) {
          if (r.acctivate_id) map[r.acctivate_id] = r.id;
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return new Response(
        JSON.stringify({ success: true, map, count: Object.keys(map).length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // List names mode: return [{id, name, acctivate_id}] for fuzzy matching client-side
    if (body.action === "list_names") {
      const { table } = ListNamesPayloadSchema.parse(body);
      const out: { id: string; name: string; acctivate_id: string | null }[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select("id, name, acctivate_id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        out.push(...(data as { id: string; name: string; acctivate_id: string | null }[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return new Response(
        JSON.stringify({ success: true, rows: out, count: out.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Backfill acctivate_id for dealers (one update per row, batched)
    if (body.action === "backfill_acctivate_id") {
      const { table, updates } = BackfillPayloadSchema.parse(body);
      let updated = 0;
      for (const u of updates) {
        const { error } = await supabase.from(table).update({ acctivate_id: u.acctivate_id }).eq("id", u.id);
        if (error) console.error(`Backfill error for ${u.id}:`, error.message);
        else updated++;
      }
      return new Response(
        JSON.stringify({ success: true, updated, total: updates.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Prune mode: delete rows whose acctivate_id is not in keep list
    if (body.action === "prune") {
      const { table, keep_acctivate_ids } = PrunePayloadSchema.parse(body);
      const keepSet = new Set(keep_acctivate_ids);

      // Paginate through all rows (Supabase caps each request at 1000)
      const existing: { id: string; acctivate_id: string | null }[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error: fetchErr } = await supabase
          .from(table)
          .select("id, acctivate_id")
          .range(from, from + pageSize - 1);
        if (fetchErr) throw fetchErr;
        if (!data || data.length === 0) break;
        existing.push(...(data as { id: string; acctivate_id: string | null }[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      let toDeleteIds = (existing ?? [])
        .filter((r: { id: string; acctivate_id: string | null }) => !r.acctivate_id || !keepSet.has(r.acctivate_id))
        .map((r: { id: string }) => r.id);

      let preservedWithHistory = 0;
      if (table === "dealers" && toDeleteIds.length > 0) {
        const protectedDealerIds = new Set<string>();
        const checkBatchSize = 500;
        for (let i = 0; i < toDeleteIds.length; i += checkBatchSize) {
          const batch = toDeleteIds.slice(i, i + checkBatchSize);
          const { data: historyRows, error: historyErr } = await supabase
            .from("dealer_check_ins")
            .select("dealer_id")
            .in("dealer_id", batch);
          if (historyErr) throw historyErr;
          for (const row of (historyRows ?? []) as { dealer_id: string | null }[]) {
            if (row.dealer_id) protectedDealerIds.add(row.dealer_id);
          }
        }
        preservedWithHistory = protectedDealerIds.size;
        toDeleteIds = toDeleteIds.filter((id) => !protectedDealerIds.has(id));
      }

      let deleted = 0;
      const batchSize = 200;
      for (let i = 0; i < toDeleteIds.length; i += batchSize) {
        const batch = toDeleteIds.slice(i, i + batchSize);
        const { error: delErr } = await supabase.from(table).delete().in("id", batch);
        if (delErr) console.error("Delete batch error:", delErr.message);
        else deleted += batch.length;
      }

      return new Response(
        JSON.stringify({ success: true, pruned: deleted, preserved_with_history: preservedWithHistory, total_existing: existing?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

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
