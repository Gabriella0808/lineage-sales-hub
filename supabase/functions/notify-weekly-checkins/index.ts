// Computes last week's check-in stats (Mon-Sun) per manager team and
// emails a weekly report to the sales team. Designed to be triggered by
// pg_cron each Friday, but can also be invoked manually.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type TeamId = "will" | "mateo" | "chris";

const TEAM: { id: TeamId; name: string; managerEmail: string; repOwners: string[] }[] = [
  { id: "will", name: "Will Grisack", managerEmail: "will@lineage-collections.com", repOwners: ["will"] },
  { id: "mateo", name: "Mateo De Lisa", managerEmail: "mateo@lineage-collections.com", repOwners: ["mateo"] },
  { id: "chris", name: "Chris De Lisa", managerEmail: "chris@lineage-collections.com", repOwners: ["chris"] },
];

const RECIPIENTS: { name: string; email: string }[] = [
  { name: "Scott", email: "scott@lineage-collections.com" },
  { name: "Justin", email: "justin@lineage-collections.com" },
  { name: "Will", email: "will@lineage-collections.com" },
  { name: "Mateo", email: "mateo@lineage-collections.com" },
  { name: "Chris", email: "chris@lineage-collections.com" },
  { name: "Gabriella", email: "gabriella@lineage-collections.com" },
];

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Returns the Monday-Sunday range for the CURRENT week containing `now`.
// The Friday email reports the in-progress week so it always reflects
// this week's check-ins (zeros if none yet).
function currentWeekRange(now: Date) {
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  const sinceMon = day === 0 ? 6 : day - 1;
  const thisMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMon));
  const thisSun = new Date(thisMon);
  thisSun.setUTCDate(thisMon.getUTCDate() + 6);
  return { start: thisMon, end: thisSun };
}

async function fetchAll<T>(builder: (from: number, to: number) => any): Promise<T[]> {
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

    const now = new Date();
    const { start, end } = currentWeekRange(now);
    const startStr = fmtDate(start);
    const endStr = fmtDate(end);
    const weekLabel = `${fmtLabel(start)} - ${fmtLabel(end)}, ${end.getUTCFullYear()}`;

    // Pull supporting tables to attribute check-ins by team
    const [managers, ums, cis, dealers, reps] = await Promise.all([
      fetchAll<{ id: string; email: string | null }>((f, t) =>
        supabase.from("managers").select("id,email").range(f, t)),
      fetchAll<{ user_id: string; manager_id: string }>((f, t) =>
        supabase.from("user_managers").select("user_id,manager_id").range(f, t)),
      fetchAll<{ id: string; user_id: string; dealer_id: string | null; visit_date: string; new_placement: string | null }>((f, t) =>
        supabase.from("dealer_check_ins")
          .select("id,user_id,dealer_id,visit_date,new_placement")
          .gte("visit_date", startStr)
          .lte("visit_date", endStr)
          .range(f, t)),
      fetchAll<{ id: string; rep_id: string | null; rep_owner: string | null }>((f, t) =>
        supabase.from("dealers").select("id,rep_id,rep_owner").range(f, t)),
      fetchAll<{ id: string; manager_id: string | null }>((f, t) =>
        supabase.from("sales_reps").select("id,manager_id").range(f, t)),
    ]);

    // managerId -> teamId
    const managerToTeam: Record<string, TeamId> = {};
    managers.forEach((m) => {
      const email = (m.email ?? "").toLowerCase();
      const t = TEAM.find((x) => x.managerEmail === email);
      if (t) managerToTeam[m.id] = t.id;
    });

    // userId -> teamId via user_managers
    const userToTeam: Record<string, TeamId> = {};
    ums.forEach((u) => {
      const t = managerToTeam[u.manager_id];
      if (t) userToTeam[u.user_id] = t;
    });

    // dealerId -> teamId via rep_owner or rep -> manager
    const ownerToTeam: Record<string, TeamId> = {};
    TEAM.forEach((t) => t.repOwners.forEach((o) => { ownerToTeam[o.toLowerCase()] = t.id; }));
    const repToTeam: Record<string, TeamId> = {};
    reps.forEach((r) => {
      if (r.manager_id && managerToTeam[r.manager_id]) repToTeam[r.id] = managerToTeam[r.manager_id];
    });
    const dealerToTeam: Record<string, TeamId> = {};
    dealers.forEach((d) => {
      const owner = (d.rep_owner ?? "").trim().toLowerCase();
      if (owner && ownerToTeam[owner]) dealerToTeam[d.id] = ownerToTeam[owner];
      else if (d.rep_id && repToTeam[d.rep_id]) dealerToTeam[d.id] = repToTeam[d.rep_id];
    });

    // Aggregate
    const stats: Record<TeamId, { checkIns: number; placements: number }> = {
      will: { checkIns: 0, placements: 0 },
      mateo: { checkIns: 0, placements: 0 },
      chris: { checkIns: 0, placements: 0 },
    };
    cis.forEach((c) => {
      const team = (c.dealer_id && dealerToTeam[c.dealer_id]) || userToTeam[c.user_id];
      if (!team) return;
      stats[team].checkIns += 1;
      if ((c.new_placement ?? "").toLowerCase() === "yes") stats[team].placements += 1;
    });

    const rows = TEAM.map((t) => ({
      name: t.name,
      checkIns: stats[t.id].checkIns,
      placements: stats[t.id].placements,
    }));
    const totalCheckIns = rows.reduce((s, r) => s + r.checkIns, 0);
    const totalPlacements = rows.reduce((s, r) => s + r.placements, 0);

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dryRun: true, weekLabel, rows, totalCheckIns, totalPlacements }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzYnJ2cGd6YXdiYm11bG94bGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjUxNjIsImV4cCI6MjA5MTg0MTE2Mn0.TkFa_54_Lck4rpyFowbxjnYfGfeYS1ZTy7TWMBvtAQ0";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;

    const recipients = testEmail
      ? [{ name: testEmail.split("@")[0], email: testEmail }]
      : RECIPIENTS;
    let emailed = 0;
    for (const r of recipients) {
      try {
        const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({
            templateName: "weekly-checkin-report",
            recipientEmail: r.email,
            idempotencyKey: `weekly-checkin-${startStr}-${r.email}${testEmail ? `-test-${Date.now()}` : ""}`,
            templateData: {
              recipientName: r.name,
              weekLabel,
              rows,
              totalCheckIns,
              totalPlacements,
              portalUrl: "https://www.lineage-managerhub.com/check-ins/analytics",
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
      JSON.stringify({ ok: true, weekLabel, recipients: RECIPIENTS.length, emailed, totalCheckIns, totalPlacements }),
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
