import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MONDAY_API = "https://api.monday.com/v2";
const BOARD_ID = "18406187834";

// Column IDs from the board
const COL = {
  repEmail: "email_mkzwfrm5",
  managerEmail: "email_mkzwqj30",
  region: "dropdown_mkzwmtzv",
  status: "color_mkzw4094",
  repCode: "text_mm2f7tdp",
};

interface MondayItem {
  id: string;
  name: string;
  column_values: { id: string; text: string }[];
}

function getCol(item: MondayItem, colId: string): string {
  return item.column_values.find((c) => c.id === colId)?.text ?? "";
}

function mapStatus(mondayStatus: string): string {
  const lower = mondayStatus.toLowerCase();
  if (lower === "active") return "active";
  if (lower === "on leave") return "on-leave";
  return "inactive";
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
    // 1. Fetch all items from monday.com board
    const query = `{
      boards(ids: ${BOARD_ID}) {
        items_page(limit: 200) {
          items {
            id
            name
            column_values { id text }
          }
        }
      }
    }`;

    const mondayRes = await fetch(MONDAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: mondayToken,
      },
      body: JSON.stringify({ query }),
    });

    if (!mondayRes.ok) {
      throw new Error(`monday.com API failed [${mondayRes.status}]: ${await mondayRes.text()}`);
    }

    const mondayData = await mondayRes.json();
    const items: MondayItem[] = mondayData.data?.boards?.[0]?.items_page?.items ?? [];

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No items found on board" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Extract unique regions → territories
    const regionSet = new Set<string>();
    for (const item of items) {
      const region = getCol(item, COL.region);
      if (region) regionSet.add(region);
    }

    const territoryRows = [...regionSet].map((region) => ({
      monday_id: `region_${region.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      name: region,
      region,
      status: "on-track",
    }));

    const { error: tErr } = await supabase
      .from("territories")
      .upsert(territoryRows, { onConflict: "monday_id", ignoreDuplicates: false });

    if (tErr) console.error("Territory upsert error:", tErr.message);

    // 3. Fetch territories back to get IDs
    const { data: territories } = await supabase
      .from("territories")
      .select("id, monday_id, name");

    const territoryMap = new Map(
      (territories ?? []).map((t: { id: string; monday_id: string | null; name: string }) => [t.name, t.id])
    );

    // 4. Extract unique manager emails → managers
    const managerEmails = new Set<string>();
    for (const item of items) {
      const email = getCol(item, COL.managerEmail);
      if (email) managerEmails.add(email);
    }

    // Upsert managers by email
    for (const email of managerEmails) {
      const { error: mErr } = await supabase
        .from("managers")
        .upsert(
          { email, name: email.split("@")[0].replace(/[._]/g, " ") },
          { onConflict: "email" }
        );
      if (mErr) console.error("Manager upsert error:", mErr.message);
    }

    // Fetch managers to get IDs
    const { data: managers } = await supabase.from("managers").select("id, email");
    const managerMap = new Map(
      (managers ?? []).map((m: { id: string; email: string }) => [m.email, m.id])
    );

    // 5. Upsert sales reps
    const repRows = items.map((item) => ({
      monday_id: item.id,
      name: item.name,
      email: getCol(item, COL.repEmail) || null,
      status: mapStatus(getCol(item, COL.status)),
      manager_id: managerMap.get(getCol(item, COL.managerEmail)) ?? null,
      acctivate_id: getCol(item, COL.repCode) || null,
    }));

    const { error: rErr } = await supabase
      .from("sales_reps")
      .upsert(repRows, { onConflict: "monday_id", ignoreDuplicates: false });

    if (rErr) console.error("Sales rep upsert error:", rErr.message);

    // 6. Fetch reps back to get IDs, then link rep_territories
    const { data: reps } = await supabase
      .from("sales_reps")
      .select("id, monday_id, name");

    const repMap = new Map(
      (reps ?? []).map((r: { id: string; monday_id: string | null }) => [r.monday_id, r.id])
    );

    // Build rep-territory links
    const repTerritoryRows: { rep_id: string; territory_id: string }[] = [];
    for (const item of items) {
      const region = getCol(item, COL.region);
      const repId = repMap.get(item.id);
      const territoryId = territoryMap.get(region);
      if (repId && territoryId) {
        repTerritoryRows.push({ rep_id: repId, territory_id: territoryId });
      }
    }

    // Clear existing and re-insert (simplest approach for a small dataset)
    if (repTerritoryRows.length > 0) {
      // Delete rep_territories for reps that came from monday
      const mondayRepIds = repTerritoryRows.map((r) => r.rep_id);
      await supabase.from("rep_territories").delete().in("rep_id", mondayRepIds);
      const { error: rtErr } = await supabase.from("rep_territories").insert(repTerritoryRows);
      if (rtErr) console.error("Rep-territory link error:", rtErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_at: new Date().toISOString(),
        results: {
          territories: territoryRows.length,
          sales_reps: repRows.length,
          rep_territories: repTerritoryRows.length,
          managers: managerEmails.size,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Monday sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
