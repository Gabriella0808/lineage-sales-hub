// Sends the weekly clearance sales report every Friday.
// Reads from public.v_portal_clearance_sales_analytics (discontinued Acctivate SKUs
// with Lineage invoice data). Triggered by pg_cron at 5 pm ET each Friday,
// but can also be invoked manually with optional dryRun / testEmail / weekStart / weekEnd.
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
    const dryRun: boolean      = !!body?.dryRun;
    const testEmail: string | undefined = body?.testEmail;
    const hideUnits: boolean   = !!body?.hideUnits;
    const showAllReps: boolean = !!body?.showAllReps;

    // Week boundaries — Sunday-start to match the portal's weekly view.
    const anchor = body?.weekStart ? parseISO(body.weekStart as string) : new Date();
    const weekStart = body?.weekStart
      ? parseISO(body.weekStart as string)
      : startOfWeek(anchor, { weekStartsOn: 0 });
    const weekEnd = body?.weekEnd
      ? parseISO(body.weekEnd as string)
      : endOfWeek(anchor, { weekStartsOn: 0 });
    const startStr  = format(weekStart, "yyyy-MM-dd");
    const endStr    = format(weekEnd,   "yyyy-MM-dd");
    const weekLabel = `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;

    // 1. Pull this week's clearance sales from the analytics view.
    //    The view already scopes to discontinued Acctivate SKUs — no extra join needed.
    const salesRows = await fetchAll<{
      sku:           string;
      product:       string | null;
      product_class: string | null;
      quantity_sold: number;
      sales_amount:  number;
      rep_name:      string | null;
    }>((f, t) =>
      supabase
        .from("v_portal_clearance_sales_analytics")
        .select("sku, product, product_class, quantity_sold, sales_amount, rep_name")
        .gte("sale_date", startStr)
        .lte("sale_date", endStr)
        .range(f, t) as any,
    );

    // 2. Aggregate by rep → product_class (shown as "Collection" in the email template).
    type CollAgg = { collection: string; qty: number; revenue: number };
    const repAgg: Record<string, {
      totalQty:     number;
      totalRevenue: number;
      collections:  Record<string, CollAgg>;
    }> = {};

    for (const r of salesRows) {
      const rep = (r.rep_name ?? "Unattributed").trim() || "Unattributed";
      if (MANAGER_NAMES.has(rep.toLowerCase())) continue;
      const qty  = Number(r.quantity_sold) || 0;
      const rev  = Number(r.sales_amount)  || 0;
      const coll = r.product_class ?? "Uncategorized";

      if (!repAgg[rep]) repAgg[rep] = { totalQty: 0, totalRevenue: 0, collections: {} };
      repAgg[rep].totalQty     += qty;
      repAgg[rep].totalRevenue += rev;

      if (!repAgg[rep].collections[coll]) {
        repAgg[rep].collections[coll] = { collection: coll, qty: 0, revenue: 0 };
      }
      repAgg[rep].collections[coll].qty     += qty;
      repAgg[rep].collections[coll].revenue += rev;
    }

    const rows = Object.entries(repAgg)
      .map(([rep, d]) => ({
        rep,
        totalQty:    d.totalQty,
        totalRevenue: d.totalRevenue,
        collections: Object.values(d.collections).sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Optionally append $0 rows for reps without any sales this week.
    if (showAllReps) {
      const { data: allReps } = await supabase
        .from("sales_reps")
        .select("name")
        .not("name", "is", null) as any;
      const repNamesWithSales = new Set(rows.map((r) => r.rep.toLowerCase()));
      for (const rep of (allReps ?? [])) {
        const name: string = rep.name?.trim() ?? "";
        if (!name || MANAGER_NAMES.has(name.toLowerCase())) continue;
        if (repNamesWithSales.has(name.toLowerCase())) continue;
        rows.push({ rep: name, totalQty: 0, totalRevenue: 0, collections: [] });
      }
    }

    const filteredRows  = testEmail
      ? rows.filter((r) => !TEST_EXCLUDED_REPS.has(r.rep.toLowerCase()))
      : rows;

    const totalUnits   = filteredRows.reduce((s, r) => s + r.totalQty,     0);
    const totalRevenue = filteredRows.reduce((s, r) => s + r.totalRevenue, 0);
    const skusMoved    = new Set(salesRows.map((r) => r.sku)).size;

    console.log(`[notify-weekly-clearance] ${weekLabel} — ${salesRows.length} rows, ${filteredRows.length} reps, totalRevenue=${totalRevenue}`);

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dryRun: true, weekLabel, rows: filteredRows, totalUnits, totalRevenue, skusMoved }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Build recipient list: all sales reps + managers + admins.
    let recipients: { name: string; email: string }[];

    if (testEmail) {
      recipients = [{ name: testEmail.split("@")[0], email: testEmail }];
    } else {
      const emailMap = new Map<string, string>(); // lowerEmail → display name

      const addRecipient = (email?: string | null, name?: string | null) => {
        if (!email) return;
        for (const part of String(email).split(/[,;]/)) {
          const e = part.trim().toLowerCase();
          if (!e || !e.includes("@")) continue;
          if (!emailMap.has(e)) emailMap.set(e, name?.trim() || e.split("@")[0]);
        }
      };

      const { data: reps } = await supabase
        .from("sales_reps")
        .select("name, email")
        .not("email", "is", null);
      (reps ?? []).forEach((r: any) => addRecipient(r.email, r.name));

      const { data: mgrs } = await supabase
        .from("managers")
        .select("name, email")
        .not("email", "is", null);
      (mgrs ?? []).forEach((m: any) => addRecipient(m.email, m.name));

      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      for (const ar of adminRoles ?? []) {
        const { data: u } = await (supabase.auth.admin as any).getUserById((ar as any).user_id);
        const email    = u?.user?.email;
        const fullName = u?.user?.user_metadata?.full_name;
        if (email) addRecipient(email, fullName ?? email.split("@")[0]);
      }

      recipients = Array.from(emailMap.entries()).map(([email, name]) => ({ email, name }));
    }

    // 4. Send via the transactional email queue.
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    let emailed = 0;

    for (const r of recipients) {
      try {
        const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "apikey":         Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
          body: JSON.stringify({
            templateName:   "clearance-weekly-report",
            recipientEmail: r.email,
            idempotencyKey: `clearance-weekly-${startStr}-${r.email}-${Date.now()}`,
            templateData: {
              recipientName: r.name,
              weekLabel,
              rows:          filteredRows,
              totalUnits,
              totalRevenue,
              skusMoved,
              hideUnits,
              portalUrl: "https://lineage-collections-portal.com/clearance/analytics",
            },
          }),
        });
        if (resp.ok) emailed++;
        else console.error("[notify-weekly-clearance] send failed", r.email, resp.status, await resp.text());
      } catch (e) {
        console.error("[notify-weekly-clearance] send error", r.email, String(e));
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        weekLabel,
        recipients:   recipients.length,
        emailed,
        totalUnits,
        totalRevenue,
        skusMoved,
        repsWithSales: filteredRows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[notify-weekly-clearance]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
