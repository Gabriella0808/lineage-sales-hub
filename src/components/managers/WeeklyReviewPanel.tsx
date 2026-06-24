import { useState, useEffect, useMemo } from "react";
import { format, parseISO, startOfWeek, addDays, subWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Save, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

type Responses = Record<string, string>;

interface Field {
  key: string;
  label: string;
  hint?: string;
  type?: "text" | "textarea" | "number";
}

interface Section {
  title: string;
  fields?: Field[];
  metrics?: { key: string; label: string }[]; // actual/goal pairs
}

const SECTIONS: Section[] = [
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
      { key: "travel_efficient", label: "Was travel efficient?", type: "textarea" },
      {
        key: "travel_next_4_6_weeks",
        label: "What is lined up for the next 4-6 weeks?",
        hint: "Is the travel log up to date?",
        type: "textarea",
      },
      {
        key: "travel_planning_notes",
        label: "Next couple of weeks - careful planning notes",
        hint: "Who should be seen in portal, prospects, Night & Day targets, top 100s, etc.",
        type: "textarea",
      },
    ],
  },
  {
    title: "Prospecting",
    fields: [
      { key: "prospect_progress", label: "What progress did you make this week? (review list in Portal)", type: "textarea" },
      
      { key: "trade_show_followups", label: "Trade show lead follow-ups", type: "textarea" },
      { key: "entertainment_opps", label: "Entertainment opportunities", type: "textarea" },
      { key: "contact_us_opps", label: "Contact-us opps - were they followed through on?", type: "textarea" },
    ],
  },
  {
    title: "Rep Reviews",
    fields: [
      { key: "rep_bookings", label: "Bookings by reps", type: "textarea" },
      { key: "rep_contacts", label: "Contacts by reps", type: "textarea" },
      { key: "rep_clearance_promo", label: "Clearance and promotion performance", type: "textarea" },
      { key: "rep_last_login", label: "Last log-in to system", type: "textarea" },
      { key: "rep_no_connect", label: "Anyone you didn't connect with all week?", type: "textarea" },
      { key: "rep_one_idea", label: "One idea to help each one this week", type: "textarea" },
      {
        key: "rep_dealer_focus",
        label: "Dealer focus per territory",
        hint: "Review dealers in each territory and pick a couple to focus on selling deeper into.",
        type: "textarea",
      },
    ],
  },
  {
    title: "Open Rep Areas",
    fields: [
      { key: "open_target_areas", label: "What are target areas to fill?", type: "textarea" },
      { key: "open_who_talked", label: "Who did you talk to?", type: "textarea" },
      { key: "open_recruiting", label: "What avenues are you using to recruit?", type: "textarea" },
    ],
  },
  {
    title: "My Tasks",
    fields: [
      { key: "tasks_status", label: "Are tasks up to date? Review statuses.", type: "textarea" },
    ],
  },
  {
    title: "Road Shows",
    fields: [
      { key: "road_shows", label: "Road shows", hint: "Be sure that overall you have two set up per rep per year.", type: "textarea" },
    ],
  },
  {
    title: "Trade Shows",
    fields: [{ key: "trade_shows", label: "Trade shows", type: "textarea" }],
  },
  {
    title: "Future Planning Events",
    fields: [{ key: "future_events", label: "Future planning events", type: "textarea" }],
  },
];

// Monday of current week (week the Friday email is sent for)
function currentMonday(d = new Date()): string {
  const monday = startOfWeek(d, { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

function lastNMondays(n = 12): string[] {
  const out: string[] = [];
  let m = parseISO(currentMonday());
  for (let i = 0; i < n; i++) {
    out.push(format(m, "yyyy-MM-dd"));
    m = subWeeks(m, 1);
  }
  return out;
}

export function WeeklyReviewPanel({
  managerId,
  managerName,
}: {
  managerId: string;
  managerName: string;
}) {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<string>(currentMonday());
  const [responses, setResponses] = useState<Responses>({});

  // Saved reviews list (for picker)
  const { data: savedWeeks = [] } = useQuery({
    queryKey: ["manager-weekly-reviews", managerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_weekly_reviews")
        .select("week_start, updated_at")
        .eq("manager_id", managerId)
        .order("week_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Load review for selected week
  const { data: existing, isFetching } = useQuery({
    queryKey: ["manager-weekly-review", managerId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_weekly_reviews")
        .select("*")
        .eq("manager_id", managerId)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setResponses((existing?.responses as Responses) ?? {});
  }, [existing, weekStart]);

  // Pull check-ins + placements from Check-In Analytics source (dealer_check_ins)
  // for this manager's linked users, within the selected week (Mon..Sun).
  const { data: visitStats } = useQuery({
    queryKey: ["manager-weekly-visit-stats", managerId, weekStart],
    queryFn: async () => {
      // Collect user ids that map to this manager
      const userIds = new Set<string>();
      const [{ data: ums }, { data: mgrUserId }] = await Promise.all([
        supabase.from("user_managers").select("user_id").eq("manager_id", managerId),
        supabase.rpc("user_id_for_manager", { _manager_id: managerId }),
      ]);
      (ums ?? []).forEach((r: any) => r.user_id && userIds.add(r.user_id));
      if (typeof mgrUserId === "string" && mgrUserId) userIds.add(mgrUserId);

      if (userIds.size === 0) return { checkIns: 0, placements: 0 };

      const start = weekStart;
      const end = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("dealer_check_ins")
        .select("id,new_placement,visit_date,user_id")
        .in("user_id", Array.from(userIds))
        .gte("visit_date", start)
        .lte("visit_date", end);
      if (error) throw error;
      const rows = data ?? [];
      return {
        checkIns: rows.length,
        placements: rows.filter((r: any) => (r.new_placement ?? "").toLowerCase() === "yes").length,
      };
    },
  });

  // Auto-fill actuals from visit analytics (overrides any manual edit so it
  // always reflects the source of truth - same numbers shown in Check-In Analytics).
  useEffect(() => {
    if (!visitStats) return;
    setResponses((p) => ({
      ...p,
      daily_checkins_actual: String(visitStats.checkIns),
      placements_actual: String(visitStats.placements),
    }));
  }, [visitStats]);

  const weekOptions = useMemo(() => {
    const merged = new Set<string>([...lastNMondays(12), ...savedWeeks.map((w) => w.week_start)]);
    return [...merged].sort((a, b) => (a < b ? 1 : -1));
  }, [savedWeeks]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      const payload = {
        manager_id: managerId,
        week_start: weekStart,
        responses,
        updated_by: userId,
        ...(existing ? {} : { created_by: userId }),
      };
      const { error } = await supabase
        .from("manager_weekly_reviews")
        .upsert(payload, { onConflict: "manager_id,week_start" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Weekly review saved");
      qc.invalidateQueries({ queryKey: ["manager-weekly-reviews", managerId] });
      qc.invalidateQueries({ queryKey: ["manager-weekly-review", managerId, weekStart] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const setField = (key: string, val: string) =>
    setResponses((p) => ({ ...p, [key]: val }));

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Weekly Review</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Fill in each Friday for {managerName}. Saved by week.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={weekStart} onValueChange={setWeekStart}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((w) => {
                  const isSaved = savedWeeks.some((s) => s.week_start === w);
                  return (
                    <SelectItem key={w} value={w}>
                      <span className="flex items-center gap-2">
                        Week of {format(parseISO(w), "MMM d, yyyy")}
                        {isSaved && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">saved</Badge>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || isFetching}
            >
              {saveMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {section.title}
            </h3>

            {section.metrics && (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_120px_120px] gap-3 items-center">
                  <span className="text-xs text-muted-foreground" />
                  <Label className="text-xs text-center text-muted-foreground">Actual</Label>
                  <Label className="text-xs text-center text-muted-foreground">Goal</Label>
                </div>
                {section.metrics.map((m) => {
                  const isAuto = m.key === "daily_checkins" || m.key === "placements";
                  return (
                    <div key={m.key} className="grid grid-cols-[1fr_120px_120px] gap-3 items-center">
                      <Label className="text-sm">
                        {m.label}
                        {isAuto && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            auto from check-ins
                          </span>
                        )}
                      </Label>
                      <Input
                        type="text"
                        value={responses[`${m.key}_actual`] ?? ""}
                        onChange={(e) => setField(`${m.key}_actual`, e.target.value)}
                        placeholder="-"
                        className="text-center"
                        readOnly={isAuto}
                      />
                      <Input
                        type="text"
                        value={responses[`${m.key}_goal`] ?? ""}
                        onChange={(e) => setField(`${m.key}_goal`, e.target.value)}
                        placeholder="-"
                        className="text-center"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {section.fields && (
              <div className="space-y-4">
                {section.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-sm">{f.label}</Label>
                    {f.hint && (
                      <p className="text-xs text-muted-foreground -mt-1">{f.hint}</p>
                    )}
                    {f.type === "textarea" || !f.type ? (
                      <Textarea
                        rows={3}
                        value={responses[f.key] ?? ""}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                    ) : (
                      <Input
                        type={f.type}
                        value={responses[f.key] ?? ""}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Weekly Review
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
