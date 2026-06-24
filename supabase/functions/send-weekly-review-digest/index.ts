// Sends Gabriella one email per sales manager weekly review for the
// current week (Mon-Sun). Triggered by pg_cron each Friday at 6pm ET.
// Pass { test: true } to force-send the most recent review per manager.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENT = "gabriella@lineage-collections.com";

const SECTIONS: Array<{
  title: string;
  metrics?: { key: string; label: string }[];
  fields?: { key: string; label: string; hint?: string }[];
}> = [
  {
    title: "Weekly Metrics",
    metrics: [
      { key: "bookings", label: "Bookings" },
      { key: "daily_checkins", label: "Daily Check-Ins" },
      { key: "placements", label: "Placements" },
    ],
  },
  {
    title: "Travel Review",
    fields: [
      { key: "travel_efficient", label: "Was travel efficient?" },
      { key: "travel_next_4_6_weeks", label: "What is lined up for the next 4-6 weeks?", hint: "Is the travel log up to date?" },
      { key: "travel_planning_notes", label: "Next couple of weeks - careful planning notes", hint: "Who should be seen in portal, prospects, Night & Day targets, top 100s, etc." },
    ],
  },
  {
    title: "Prospecting",
    fields: [
      { key: "prospect_progress", label: "What progress did you make this week? (review list in Portal)" },
      { key: "trade_show_followups", label: "Trade show lead follow-ups" },
      { key: "entertainment_opps", label: "Entertainment opportunities" },
      { key: "contact_us_opps", label: "Contact-us opps - were they followed through on?" },
    ],
  },
  {
    title: "Rep Reviews",
    fields: [
      { key: "rep_bookings", label: "Bookings by reps" },
      { key: "rep_contacts", label: "Contacts by reps" },
      { key: "rep_clearance_promo", label: "Clearance and promotion performance" },
      { key: "rep_last_login", label: "Last log-in to system" },
      { key: "rep_no_connect", label: "Anyone you didn't connect with all week?" },
      { key: "rep_one_idea", label: "One idea to help each one this week" },
      { key: "rep_dealer_focus", label: "Dealer focus per territory", hint: "Review dealers in each territory and pick a couple to focus on selling deeper into." },
    ],
  },
  {
    title: "Open Rep Areas",
    fields: [
      { key: "open_target_areas", label: "What are target areas to fill?" },
      { key: "open_who_talked", label: "Who did you talk to?" },
      { key: "open_recruiting", label: "What avenues are you using to recruit?" },
    ],
  },
  {
    title: "My Tasks",
    fields: [
      { key: "tasks_status", label: "Are tasks up to date? Review statuses." },
    ],
  },
  {
    title: "Road Shows",
    fields: [
      { key: "road_shows", label: "Road shows", hint: "Be sure that overall you have two set up per rep per year." },
    ],
  },
  {
    title: "Trade Shows",
    fields: [{ key: "trade_shows", label: "Trade shows" }],
  },
  {
    title: "Future Planning Events",
    fields: [{ key: "future_events", label: "Future planning events" }],
  },
];

function currentWeekStart(now: Date): string {
  const day = now.getUTCDay();
  const sinceMon = day === 0 ? 6 : day - 1;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMon));
  return mon.toISOString().slice(0, 10);
}

function fmtWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const isTest: boolean = !!body?.test;

    const weekStart = currentWeekStart(new Date());

    const { data: managers, error: mErr } = await supabase
      .from("managers")
      .select("id, name");
    if (mErr) throw mErr;

    let reviews: Array<{ manager_id: string; week_start: string; responses: Record<string, string> }> = [];

    if (isTest) {
      // Most recent review per manager (any week)
      const { data, error } = await supabase
        .from("manager_weekly_reviews")
        .select("manager_id, week_start, responses")
        .order("week_start", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      for (const r of data ?? []) {
        if (seen.has(r.manager_id)) continue;
        seen.add(r.manager_id);
        reviews.push(r as any);
      }
    } else {
      const { data, error } = await supabase
        .from("manager_weekly_reviews")
        .select("manager_id, week_start, responses")
        .eq("week_start", weekStart);
      if (error) throw error;
      reviews = (data ?? []) as any;
    }

    if (reviews.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: "No reviews found", weekStart, test: isTest }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mgrName = (id: string) => managers?.find((m) => m.id === id)?.name ?? "Sales Manager";

    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYnJ2cGd6YXdiYm11bG94bGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjUxNjIsImV4cCI6MjA5MTg0MTE2Mn0.TkFa_54_Lck4rpyFowbxjnYfGfeYS1ZTy7TWMBvtAQ0";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;

    let sent = 0;
    for (const r of reviews) {
      const responses = r.responses ?? {};
      const sections = SECTIONS.map((s) => ({
        title: s.title,
        metrics: s.metrics?.map((m) => ({
          key: m.key,
          label: m.label,
          actual: responses[`${m.key}_actual`] ?? undefined,
          goal: responses[`${m.key}_goal`] ?? undefined,
        })),
        fields: s.fields?.map((f) => ({
          key: f.key,
          label: f.label,
          hint: f.hint,
          value: responses[f.key] ?? undefined,
        })),
      }));

      const idempotencyKey = isTest
        ? `manager-weekly-review-test-${r.manager_id}-${Date.now()}`
        : `manager-weekly-review-${r.manager_id}-${r.week_start}`;

      const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          templateName: "sales-manager-weekly-review",
          recipientEmail: RECIPIENT,
          idempotencyKey,
          templateData: {
            managerName: mgrName(r.manager_id),
            weekLabel: `${isTest ? "[TEST] " : ""}${fmtWeekLabel(r.week_start)}`,
            portalUrl: "https://www.lineage-managerhub.com/managers",
            sections,
          },
        }),
      });

      if (resp.ok) sent++;
      else console.error("send failed", r.manager_id, resp.status, await resp.text());
    }

    return new Response(
      JSON.stringify({ ok: true, sent, total: reviews.length, weekStart, test: isTest }),
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
