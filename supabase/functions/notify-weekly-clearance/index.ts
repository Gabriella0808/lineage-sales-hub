// Sends the weekly clearance sales report. Pulls per-rep / per-SKU data from
// the public.clearance_weekly_sales table (populated via the Clearance import).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  startOfWeek,
  endOfWeek,
  format,
  parseISO,
} from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MANAGER_NAMES = new Set(["will", "mateo", "chris"]);
const TEST_EXCLUDED_REPS = new Set(["gillis", "damico"]);

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYnJ2cGd6YXdiYm11bG94bGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjUxNjIsImV4cCI6MjA5MTg0MTE2Mn0.TkFa_54_Lck4rpyFowbxjnYfGfeYS1ZTy7TWMBvtAQ0";

async function fetchAll<T>(
  builder: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const out: T[] = [];
  while (true) {
    const { data, error } = await builder(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body?.dryRun;
    const testEmail: string | undefined = body?.testEmail;

    const anchor = body?.weekStart ? parseISO(body.weekStart as string) : new Date();
    const weekStart = body?.weekStart
      ? parseISO(body.weekStart as string)
      : startOfWeek(anchor, { weekStartsOn: 1 });
    const weekEnd = body?.weekEnd
      ? parseISO(body.weekEnd as string)
      : endOfWeek(anchor, { weekStartsOn: 1 });
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");
    const weekLabel = `${format(weekStart, "MMM d")} --- ${format(weekEnd, "MMM d, yyyy")}`;

    // 1. Pull this week's clearance sales rows
    const salesRows = await fetchAll<{
      sku: string;
      product_name: string | null;
      qty_sold: number;
      revenue: number;
      rep_name: string | null;
    }>((f, t) =>
      supabase
        .from("clearance_weekly_sales")
        .select("sku, product_name, qty_sold, revenue, rep_name")
        .gte("week_start", startStr)
        .lte("week_start", endStr)
        .range(f, t) as any,
    );

    // 2. Look up collection names for the SKUs so we can group per-rep rows
    const skuList = [...new Set(salesRows.map((r) => r.sku))];
    const invRows = skuList.length
      ? await fetchAll<{ sku: string; collection: string | null; product: string | null }>((f, t) =>
          supabase
            .from("inventory")
            .select("sku, collection, product")
            .in("sku", skuList)
            .range(f, t) as any,
        )
      : [];
    const skuCollection: Record<string, string> = {};
    const skuProductName: Record<string, string> = {};
    invRows.forEach((r) => {
      skuCollection[r.sku] = r.collection ?? "Uncategorized";
      if (r.product) skuProductName[r.sku] = r.product;
    });

    // 3. Aggregate by rep -†’ collection
    type CollAgg = { collection: string; qty: number; revenue: number };
    const repAgg: Record<string, {
      totalQty: number;
      totalRevenue: number;
      collections: Record<string, CollAgg>;
    }> = {};

    for (const r of salesRows) {
      const rep = (r.rep_name ?? "Unattributed").trim() || "Unattributed";
      if (MANAGER_NAMES.has(rep.toLowerCase())) continue;
      const coll = skuCollection[r.sku] ?? "Uncategorized";
      if (!repAgg[rep]) repAgg[rep] = { totalQty: 0, totalRevenue: 0, collections: {} };
      repAgg[rep].totalQty += r.qty_sold;
      repAgg[rep].totalRevenue += Number(r.revenue ?? 0);
      if (!repAgg[rep].collections[coll]) {
        repAgg[rep].collections[coll] = { collection: coll, qty: 0, revenue: 0 };
      }
      repAgg[rep].collections[coll].qty += r.qty_sold;
      repAgg[rep].collections[coll].revenue += Number(r.revenue ?? 0);
    }

    const rows = Object.entries(repAgg)
      .map(([rep, d]) => ({
        rep,
        totalQty: d.totalQty,
        totalRevenue: d.totalRevenue,
        collections: Object.values(d.collections).sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const filteredRows = testEmail
      ? rows.filter((r) => !TEST_EXCLUDED_REPS.has(r.rep.toLowerCase()))
      : rows;

    const totalUnits = filteredRows.reduce((s, r) => s + r.totalQty, 0);
    const totalRevenue = filteredRows.reduce((s, r) => s + r.totalRevenue, 0);
    const skusMoved = new Set(salesRows.map((r) => r.sku)).size;

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dryRun: true, weekLabel, rows: filteredRows, totalUnits, totalRevenue, skusMoved }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Recipient list --- TESTING: only testEmail or Gabriella.
    const recipients = testEmail
      ? [{ name: testEmail.split("@")[0], email: testEmail }]
      : [{ name: "Gabriella", email: "gabriella@lineage-collections.com" }];

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    let emailed = 0;

    for (const r of recipients) {
      try {
        const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ANON_KEY}`,
            "apikey": ANON_KEY,
          },
          body: JSON.stringify({
            templateName: "clearance-weekly-report",
            recipientEmail: r.email,
            idempotencyKey: `clearance-weekly-${startStr}-${r.email}-${Date.now()}`,
            templateData: {
              recipientName: r.name,
              weekLabel,
              rows: filteredRows,
              totalUnits,
              totalRevenue,
              skusMoved,
              portalUrl: "https://www.lineage-managerhub.com/clearance/analytics",
            },
          }),
        });
        if (resp.ok) emailed++;
        else console.error("send failed", r.email, resp.status, await resp.text());
      } catch (e) {
        console.error("send error", r.email, String(e));
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        weekLabel,
        recipients: recipients.length,
        emailed,
        totalUnits,
        totalRevenue,
        skusMoved,
        repsWithSales: filteredRows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
