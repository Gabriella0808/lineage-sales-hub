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
    // Fetch all items from Travel Log board with pagination
    let allItems: MondayItem[] = [];
    let cursor: string | null = null;

    // First page
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

    // Paginate
    while (cursor) {
      const nextQuery = `{
        next_items_page(limit: 500, cursor: "${cursor}") {
          cursor
          items {
            id
            name
            column_values { id text value }
          }
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

    console.log(`Fetched ${allItems.length} travel log items from Monday.com`);

    if (allItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No items found on Travel Log board" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch managers to map salesperson names
    const { data: managers } = await supabase.from("managers").select("id, name");
    const managerList = managers ?? [];

    // Normalize name for matching
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

    const managerMap = new Map(
      managerList.map((m: { id: string; name: string }) => [normalize(m.name), m.id])
    );

    // Find manager ID by matching salesperson name
    function findManagerId(salespersonText: string): string | null {
      // salesperson text can be "Christopher De Lisa" or "Justin Jeangerard, Christopher De Lisa"
      const names = salespersonText.split(",").map((n) => n.trim());
      for (const name of names) {
        const normalized = normalize(name);
        // Direct match
        const directMatch = managerMap.get(normalized);
        if (directMatch) return directMatch;

        // Partial match
        for (const [mName, mId] of managerMap) {
          if (normalized.includes(mName) || mName.includes(normalized)) {
            return mId as string;
          }
        }
      }
      return null;
    }

    // Build travel_log rows
    const rows = allItems.map((item) => {
      const salespersonText = getCol(item, COL.salesperson);
      const dateValue = getColValue(item, COL.travelDates);
      let travelDate = new Date().toISOString().split("T")[0];
      let travelEndDate: string | null = null;

      if (dateValue) {
        try {
          const parsed = JSON.parse(dateValue);
          if (parsed.from) travelDate = parsed.from;
          if (parsed.to) travelEndDate = parsed.to;
        } catch {
          // fallback
        }
      }

      return {
        monday_id: item.id,
        notes: `${item.name}${getCol(item, COL.notes) ? " — " + getCol(item, COL.notes) : ""}`,
        travel_date: travelDate,
        travel_end_date: travelEndDate,
        salesperson_name: salespersonText || null,
        manager_id: findManagerId(salespersonText),
        purpose: getCol(item, COL.purpose) || null,
        approval_status: getCol(item, COL.approvalStatus) || null,
      };
    });

    // Upsert by monday_id
    const { error: upsertErr } = await supabase
      .from("travel_log")
      .upsert(rows, { onConflict: "monday_id", ignoreDuplicates: false });

    if (upsertErr) {
      console.error("Travel log upsert error:", upsertErr.message);
      throw new Error(`Upsert failed: ${upsertErr.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_at: new Date().toISOString(),
        results: {
          travel_entries: rows.length,
          matched_to_managers: rows.filter((r) => r.manager_id !== null).length,
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
