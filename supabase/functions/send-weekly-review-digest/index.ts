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
    const testMissing: boolean = !!body?.testMissing;

    const weekStart = currentWeekStart(new Date());
    const weekLabel = fmtWeekLabel(weekStart);

    // Sales managers we expect a weekly review from.
    const EXPECTED_MANAGER_EMAILS = [
      "will@lineage-collections.com",
      "mateo@lineage-collections.com",
      "chris@lineage-collections.com",
      "kate@lineage-collections.com",
    ];

    const { data: managers, error: mErr } = await supabase
      .from("managers")
      .select("id, name, email");
    if (mErr) throw mErr;

    const expectedManagers = (managers ?? []).filter(
      (m: any) => m.email && EXPECTED_MANAGER_EMAILS.includes(m.email.toLowerCase()),
    );

    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYnJ2cGd6YXdiYm11bG94bGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjUxNjIsImV4cCI6MjA5MTg0MTE2Mn0.TkFa_54_Lck4rpyFowbxjnYfGfeYS1ZTy7TWMBvtAQ0";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;

    async function sendMissing(tag: string) {
      const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: JSON.stringify({
          templateName: "sales-manager-weekly-review-missing",
          recipientEmail: RECIPIENT,
          idempotencyKey: `manager-weekly-review-missing-${tag}`,
          templateData: {
            weekLabel,
            portalUrl: "https://www.lineage-managerhub.com/managers",
          },
        }),
      });
      if (!resp.ok) console.error("missing send failed", resp.status, await resp.text());
      return resp.ok;
    }

    async function sendReview(managerName: string, responses: Record<string, string>, tag: string) {
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
      const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: JSON.stringify({
          templateName: "sales-manager-weekly-review",
          recipientEmail: RECIPIENT,
          idempotencyKey: `manager-weekly-review-${tag}`,
          templateData: {
            managerName,
            weekLabel: `${isTest ? "[TEST] " : ""}${weekLabel}`,
            portalUrl: "https://www.lineage-managerhub.com/managers",
            sections,
          },
        }),
      });
      if (!resp.ok) console.error("review send failed", managerName, resp.status, await resp.text());
      return resp.ok;
    }

    // testMissing: send a single missing-template test email to Gabriella now.
    if (testMissing) {
      const ok = await sendMissing(`test-${Date.now()}`);
      return new Response(
        JSON.stringify({ ok: true, sent: ok ? 1 : 0, mode: "testMissing", weekStart }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pull existing reviews for the current week (or, in test mode, most recent per manager)
    const reviewByManager = new Map<string, Record<string, string>>();
    if (isTest) {
      const { data, error } = await supabase
        .from("manager_weekly_reviews")
        .select("manager_id, week_start, responses")
        .order("week_start", { ascending: false });
      if (error) throw error;
      for (const r of data ?? []) {
        if (!reviewByManager.has(r.manager_id)) {
          reviewByManager.set(r.manager_id, (r.responses ?? {}) as any);
        }
      }
    } else {
      const { data, error } = await supabase
        .from("manager_weekly_reviews")
        .select("manager_id, responses")
        .eq("week_start", weekStart);
      if (error) throw error;
      for (const r of data ?? []) {
        reviewByManager.set(r.manager_id, (r.responses ?? {}) as any);
      }
    }

    let sentReview = 0;
    let sentMissing = 0;
    for (const m of expectedManagers) {
      const tagBase = isTest ? `${m.id}-test-${Date.now()}` : `${m.id}-${weekStart}`;
      const responses = reviewByManager.get(m.id);
      if (responses && Object.keys(responses).length > 0) {
        if (await sendReview(m.name, responses, tagBase)) sentReview++;
      } else {
        if (await sendMissing(tagBase)) sentMissing++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        weekStart,
        managers: expectedManagers.length,
        sentReview,
        sentMissing,
        test: isTest,
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
