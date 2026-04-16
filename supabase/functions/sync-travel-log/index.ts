import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MONDAY_API = "https://api.monday.com/v2";
const BOARD_ID = "18393784224";

const COL = {
  salesperson: "multiple_person_mkz83vem",
  travelDates: "timerange_mkz8we7t",
  purpose: "dropdown_mkz8tgvx",
  approvalStatus: "color_mkz82ffa",
  notes: "long_text_mkz847ha",
  repCode: "dropdown_mm2fdwa3",
};

interface MondayItem {
  id: string;
  name: string;
  column_values: { id: string; text: string; value: string | null }[];
}

function getCol(item: MondayItem, colId: string): string {
  return item.column_values.find((c) => c.id === colId)?.text ?? "";
}

function getColValue(item: MondayItem, colId: string): string | null {
  return item.column_values.find((c) => c.id === colId)?.value ?? null;
}

// Normalize full name: lowercase, remove all non-alpha
function normalizeFull(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

// Extract last name — take last word
function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, "");
}

// Extract first name
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const mondayToken = Deno.env.get("MONDAY_API_TOKEN");
  if (!mondayToken) {
    return new Response(
      JSON.stringify({ success: false, error: "MONDAY_API_TOKEN not configured" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch all items with pagination
    let allItems: MondayItem[] = [];
    let cursor: string | null = null;

    const firstQuery = `{
      boards(ids: ${BOARD_ID}) {
        items_page(limit: 500) {
          cursor
          items {
            id
            name
            column_values { id text value }
          }
        }
      }
    }`;

    const firstRes = await fetch(MONDAY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: mondayToken },
      body: JSON.stringify({ query: firstQuery }),
    });

    if (!firstRes.ok) {
      throw new Error(`monday.com API failed [${firstRes.status}]: ${await firstRes.text()}`);
    }

    const firstData = await firstRes.json();
    const firstPage = firstData.data?.boards?.[0]?.items_page;
    allItems = firstPage?.items ?? [];
    cursor = firstPage?.cursor ?? null;

    while (cursor) {
      const nextQuery = `{
        next_items_page(limit: 500, cursor: "${cursor}") {
          cursor
          items { id name column_values { id text value } }
        }
      }`;
      const nextRes = await fetch(MONDAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: mondayToken },
        body: JSON.stringify({ query: nextQuery }),
      });
      const nextData = await nextRes.json();
      const nextPage = nextData.data?.next_items_page;
      allItems = [...allItems, ...(nextPage?.items ?? [])];
      cursor = nextPage?.cursor ?? null;
    }

    console.log(`Fetched ${allItems.length} travel log items`);

    if (allItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No items found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch managers + sales reps for matching
    const { data: managers } = await supabase.from("managers").select("id, name");
    const managerList = (managers ?? []) as { id: string; name: string }[];

    const { data: salesReps } = await supabase.from("sales_reps").select("id, acctivate_id");
    const repCodeMap = new Map<string, string>();
    for (const r of (salesReps ?? []) as { id: string; acctivate_id: string | null }[]) {
      if (r.acctivate_id) repCodeMap.set(r.acctivate_id.trim().toLowerCase(), r.id);
    }

    function findRepIds(repCodeText: string): string[] {
      if (!repCodeText) return [];
      const codes = repCodeText.split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
      const ids = new Set<string>();
      for (const code of codes) {
        const id = repCodeMap.get(code);
        if (id) ids.add(id);
      }
      return [...ids];
    }

    // Match a single Monday name to a manager using last name + first name prefix
    function findManager(mondayName: string): { id: string; name: string } | null {
      const mNorm = normalizeFull(mondayName);
      const mLast = lastName(mondayName);
      const mFirst = firstName(mondayName);

      // 1. Full normalized name match (handles "Mateo Delisa" == "Mateo De Lisa")
      for (const mgr of managerList) {
        if (normalizeFull(mgr.name) === mNorm) return mgr;
      }

      // 2. Last name + first name prefix match
      for (const mgr of managerList) {
        const dbLast = lastName(mgr.name);
        const dbFirst = firstName(mgr.name);
        if (mLast === dbLast && (mFirst.startsWith(dbFirst) || dbFirst.startsWith(mFirst))) {
          return mgr;
        }
      }

      // 3. Last name only (unique match)
      const lastNameMatches = managerList.filter(m => lastName(m.name) === mLast);
      if (lastNameMatches.length === 1) return lastNameMatches[0];

      // 4. Full normalized contains (handles nicknames like Chris/Christopher)
      for (const mgr of managerList) {
        const dbNorm = normalizeFull(mgr.name);
        if (mNorm.includes(dbNorm) || dbNorm.includes(mNorm)) return mgr;
      }

      // 5. Single-word exact
      const exact = managerList.find(m => m.name.toLowerCase() === mondayName.trim().toLowerCase());
      if (exact) return exact;

      return null;
    }

    // Find ALL matching manager IDs for a salesperson text field
    function findAllManagerIds(salespersonText: string): string[] {
      if (!salespersonText) return [];
      const names = salespersonText.split(",").map(n => n.trim()).filter(Boolean);
      const ids = new Set<string>();
      for (const name of names) {
        const mgr = findManager(name);
        if (mgr) ids.add(mgr.id);
      }
      return [...ids];
    }

    // Delete existing travel_log entries from Monday
    await supabase.from("travel_log").delete().not("monday_id", "is", null);

    // Build rows — one per manager per item
    const rows: {
      monday_id: string;
      notes: string | null;
      travel_date: string;
      travel_end_date: string | null;
      salesperson_name: string | null;
      manager_id: string | null;
      purpose: string | null;
      approval_status: string | null;
    }[] = [];

    for (const item of allItems) {
      const salespersonText = getCol(item, COL.salesperson);
      const dateValue = getColValue(item, COL.travelDates);
      let travelDate = new Date().toISOString().split("T")[0];
      let travelEndDate: string | null = null;

      if (dateValue) {
        try {
          const parsed = JSON.parse(dateValue);
          if (parsed.from) travelDate = parsed.from;
          if (parsed.to) travelEndDate = parsed.to;
        } catch { /* fallback */ }
      }

      const notes = `${item.name}${getCol(item, COL.notes) ? " — " + getCol(item, COL.notes) : ""}`;
      const purpose = getCol(item, COL.purpose) || null;
      const approvalStatus = getCol(item, COL.approvalStatus) || null;

      const managerIds = findAllManagerIds(salespersonText);

      if (managerIds.length === 0) {
        // Still insert with no manager
        rows.push({
          monday_id: `${item.id}_unassigned`,
          notes,
          travel_date: travelDate,
          travel_end_date: travelEndDate,
          salesperson_name: salespersonText || null,
          manager_id: null,
          purpose,
          approval_status: approvalStatus,
        });
      } else {
        // One row per manager
        for (const mgrId of managerIds) {
          rows.push({
            monday_id: `${item.id}_${mgrId}`,
            notes,
            travel_date: travelDate,
            travel_end_date: travelEndDate,
            salesperson_name: salespersonText || null,
            manager_id: mgrId,
            purpose,
            approval_status: approvalStatus,
          });
        }
      }
    }

    // Insert all rows
    const { error: insertErr } = await supabase.from("travel_log").insert(rows);

    if (insertErr) {
      console.error("Travel log insert error:", insertErr.message);
      throw new Error(`Insert failed: ${insertErr.message}`);
    }

    // Summary per manager
    const perManager: Record<string, number> = {};
    for (const r of rows) {
      const key = r.manager_id ?? "unmatched";
      perManager[key] = (perManager[key] ?? 0) + 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_at: new Date().toISOString(),
        results: {
          monday_items: allItems.length,
          travel_entries_created: rows.length,
          per_manager: perManager,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Travel log sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
