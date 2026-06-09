// Computes clearance product sales for the requested week (or current week),
// broken down by rep, and emails the report to all reps, managers, and admins.
// Can be triggered manually from the Clearance Analytics page or scheduled via pg_cron.
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

// Hardcoded admin recipients that are not in sales_reps or managers tables
const ADMIN_RECIPIENTS: { name: string; email: string }[] = [
  { name: "Scott", email: "scott@lineage-collections.com" },
  { name: "Justin", email: "justin@lineage-collections.com" },
  { name: "Gabriella", email: "gabriella@lineage-collections.com" },
];

// Manager first names (lowercased) — these appear as rep_owner on some dealers
// but should NOT be counted in the per-rep stats breakdown.
const MANAGER_NAMES = new Set(["will", "mateo", "chris"]);

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

function toDisplayName(raw: string): string {
  if (!raw) return "Unknown";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
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

    // Determine week range — caller may pass weekStart (YYYY-MM-DD), otherwise use current week
    const anchor = body?.weekStart ? parseISO(body.weekStart as string) : new Date();
    const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");
    const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

    // 1. Get all clearance SKUs
    const clearanceRows = await fetchAll<{ sku: string; product: string | null; collection: string | null }>((f, t) =>
      supabase.from("inventory").select("sku,product,collection").eq("is_clearance", true).range(f, t) as any,
    );
    const skuSet = new Set(clearanceRows.map((r) => r.sku));
    const skuNames: Record<string, string> = {};
    const skuCollection: Record<string, string> = {};
    clearanceRows.forEach((r) => {
      skuNames[r.sku] = r.product ?? r.sku;
      skuCollection[r.sku] = r.collection ?? "Uncategorized";
    });


    if (skuSet.size === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No clearance SKUs found.", weekLabel }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Get invoice lines for the week filtered to clearance SKUs
    const skuList = Array.from(skuSet);
    const invoiceLines = await fetchAll<{
      sku: string | null;
      qty: number | null;
      extended_price: number | null;
      dealer_id: string | null;
      product_name: string | null;
    }>((f, t) =>
      supabase
        .from("dealer_invoice_lines")
        .select("sku,qty,extended_price,dealer_id,product_name")
        .gte("invoice_date", startStr)
        .lte("invoice_date", endStr)
        .in("sku", skuList)
        .range(f, t) as any,
    );

    // 3. Get dealers for rep attribution
    const dealerIds = [...new Set(invoiceLines.map((l) => l.dealer_id).filter(Boolean))] as string[];
    const dealers = dealerIds.length > 0
      ? await fetchAll<{ id: string; rep_owner: string | null }>((f, t) =>
          supabase.from("dealers").select("id,rep_owner").in("id", dealerIds).range(f, t) as any,
        )
      : [];
    const dealerToRep: Record<string, string> = {};
    dealers.forEach((d) => { if (d.rep_owner) dealerToRep[d.id] = d.rep_owner; });

    // 4. Aggregate by rep → SKU + collection
    type SkuAgg = { sku: string; product: string; collection: string; qty: number; revenue: number };
    type CollectionAgg = { collection: string; qty: number; revenue: number };
    const repAgg: Record<string, {
      totalQty: number;
      totalRevenue: number;
      skus: Record<string, SkuAgg>;
      collections: Record<string, CollectionAgg>;
    }> = {};

    for (const line of invoiceLines) {
      const rawRep = dealerToRep[line.dealer_id ?? ""] ?? "Unknown";
      const rep = toDisplayName(rawRep);
      const sku = line.sku ?? "?";
      const qty = line.qty ?? 0;
      const revenue = line.extended_price ?? 0;
      const collection = skuCollection[sku] ?? "Uncategorized";
      if (!repAgg[rep]) repAgg[rep] = { totalQty: 0, totalRevenue: 0, skus: {}, collections: {} };
      repAgg[rep].totalQty += qty;
      repAgg[rep].totalRevenue += revenue;
      if (!repAgg[rep].skus[sku]) {
        repAgg[rep].skus[sku] = {
          sku,
          product: skuNames[sku] ?? line.product_name ?? sku,
          collection,
          qty: 0,
          revenue: 0,
        };
      }
      repAgg[rep].skus[sku].qty += qty;
      repAgg[rep].skus[sku].revenue += revenue;
      if (!repAgg[rep].collections[collection]) {
        repAgg[rep].collections[collection] = { collection, qty: 0, revenue: 0 };
      }
      repAgg[rep].collections[collection].qty += qty;
      repAgg[rep].collections[collection].revenue += revenue;
    }

    const rows = Object.entries(repAgg)
      .sort(([, a], [, b]) => b.totalQty - a.totalQty)
      .map(([rep, data]) => ({
        rep,
        totalQty: data.totalQty,
        totalRevenue: data.totalRevenue,
        skus: Object.values(data.skus).sort((a, b) => b.qty - a.qty),
        collections: Object.values(data.collections).sort((a, b) => b.qty - a.qty),
      }));


    const totalUnits = rows.reduce((s, r) => s + r.totalQty, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
    const skusMoved = new Set(invoiceLines.map((l) => l.sku).filter(Boolean)).size;

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dryRun: true, weekLabel, rows, totalUnits, totalRevenue, skusMoved }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Build recipient list: admins + managers + reps (deduplicated)
    const [salesReps, managers] = await Promise.all([
      fetchAll<{ name: string; email: string | null }>((f, t) =>
        supabase.from("sales_reps").select("name,email").not("email", "is", null).range(f, t) as any,
      ),
      fetchAll<{ name: string; email: string | null }>((f, t) =>
        supabase.from("managers").select("name,email").not("email", "is", null).range(f, t) as any,
      ),
    ]);

    const seen = new Set<string>();
    const allRecipients: { name: string; email: string }[] = [];

    const add = (name: string, email: string | null) => {
      if (!email) return;
      const key = email.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      allRecipients.push({ name, email });
    };

    ADMIN_RECIPIENTS.forEach((r) => add(r.name, r.email));
    managers.forEach((m) => add(m.name, m.email));
    salesReps.forEach((r) => add(r.name, r.email));

    const recipients = testEmail
      ? [{ name: testEmail.split("@")[0], email: testEmail }]
      : allRecipients;

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
            idempotencyKey: `clearance-weekly-${startStr}-${r.email}${testEmail ? `-test-${Date.now()}` : ""}`,
            templateData: {
              recipientName: r.name,
              weekLabel,
              rows,
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
        repsWithSales: rows.length,
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
