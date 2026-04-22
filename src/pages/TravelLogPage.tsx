import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  parseISO,
  isWithinInterval,
} from "date-fns";
import {
  Plane,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  CalendarDays,
  MapPin,
  User,
  FileText,
} from "lucide-react";

interface TravelEntry {
  id: string;
  rep_id: string | null;
  salesperson_name: string | null;
  travel_date: string;
  travel_end_date: string | null;
  purpose: string | null;
  approval_status: string | null;
  notes: string | null;
  monday_id: string | null;
}

// Stable hashed color per salesperson
const PALETTE = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];
function colorFor(name: string | null): string {
  if (!name) return "#94a3b8";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TravelLogPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [travel, setTravel] = useState<TravelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    salesperson_name: "",
    state_visited: "",
    purpose: "",
    travel_date: format(new Date(), "yyyy-MM-dd"),
    travel_end_date: "",
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("travel_log")
      .select("id, rep_id, salesperson_name, travel_date, travel_end_date, purpose, approval_status, notes, monday_id")
      .order("travel_date", { ascending: false })
      .limit(1000);
    if (error) {
      toast({ title: "Failed to load travel log", description: error.message, variant: "destructive" });
    } else {
      setTravel((data ?? []) as TravelEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const syncFromMonday = async () => {
    setSyncing(true);
    const { error } = await supabase.functions.invoke("sync-travel-log");
    setSyncing(false);
    if (error) {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Synced from monday.com" });
    load();
  };

  const addTrip = async () => {
    if (!user) return;
    if (!form.salesperson_name.trim()) {
      toast({ title: "Salesperson required", variant: "destructive" });
      return;
    }
    if (!form.travel_date) {
      toast({ title: "Start date required", variant: "destructive" });
      return;
    }
    setSaving(true);
    // Combine state + purpose for the purpose field (since travel_log lacks a state column)
    const purposeText = [form.state_visited.trim(), form.purpose.trim()]
      .filter(Boolean)
      .join(" — ");
    const { data, error } = await supabase
      .from("travel_log")
      .insert({
        salesperson_name: form.salesperson_name.trim(),
        travel_date: form.travel_date,
        travel_end_date: form.travel_end_date || null,
        purpose: purposeText || null,
        notes: form.notes.trim() || null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Failed to add trip", description: error.message, variant: "destructive" });
      return;
    }
    if (data) setTravel((p) => [data as TravelEntry, ...p]);
    setForm({
      salesperson_name: "",
      state_visited: "",
      purpose: "",
      travel_date: format(new Date(), "yyyy-MM-dd"),
      travel_end_date: "",
      notes: "",
    });
    setAddOpen(false);
    toast({ title: "Trip added" });
  };

  // Build the month grid (6 rows x 7 cols)
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    const out: Date[] = [];
    let d = start;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [cursor]);

  // Map day -> trips active that day (handles multi-day trips)
  const tripsByDay = useMemo(() => {
    const m = new Map<string, TravelEntry[]>();
    for (const t of travel) {
      const start = parseISO(t.travel_date);
      const end = t.travel_end_date ? parseISO(t.travel_end_date) : start;
      // iterate days inclusive
      let d = start;
      while (d <= end) {
        const key = format(d, "yyyy-MM-dd");
        const arr = m.get(key) ?? [];
        arr.push(t);
        m.set(key, arr);
        d = addDays(d, 1);
      }
    }
    return m;
  }, [travel]);

  const selectedTrips = useMemo(() => {
    const key = format(selectedDate, "yyyy-MM-dd");
    return tripsByDay.get(key) ?? [];
  }, [selectedDate, tripsByDay]);

  // Last traveled per salesperson (most recent trip overall)
  const lastTraveled = useMemo(() => {
    const m = new Map<string, TravelEntry>();
    for (const t of travel) {
      const key = t.salesperson_name || t.rep_id || t.id;
      const cur = m.get(key);
      if (!cur || cur.travel_date < t.travel_date) m.set(key, t);
    }
    return Array.from(m.values()).sort((a, b) =>
      a.travel_date < b.travel_date ? 1 : -1,
    );
  }, [travel]);

  const [detailTrip, setDetailTrip] = useState<TravelEntry | null>(null);

  const daysAgo = (iso: string) => {
    const ms = Date.now() - parseISO(iso).getTime();
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  };

  // Upcoming trips (today or future), sorted by start date
  const upcomingTrips = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return travel
      .filter((t) => {
        const end = t.travel_end_date ? parseISO(t.travel_end_date) : parseISO(t.travel_date);
        return end >= today;
      })
      .sort((a, b) => (a.travel_date < b.travel_date ? -1 : 1));
  }, [travel]);

  // Salesperson list for legend
  const peopleInMonth = useMemo(() => {
    const set = new Map<string, string>(); // name -> color
    for (const d of days) {
      const k = format(d, "yyyy-MM-dd");
      const trips = tripsByDay.get(k) ?? [];
      for (const t of trips) {
        const name = t.salesperson_name ?? "Unknown";
        if (!set.has(name)) set.set(name, colorFor(name));
      }
    }
    return Array.from(set.entries());
  }, [days, tripsByDay]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Sales Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Track travel schedules for your sales team.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={syncFromMonday} disabled={syncing} className="h-9">
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" /> Add trip
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add new trip</DialogTitle>
                <DialogDescription>
                  Log travel details and dates for the team calendar.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="t-name">Salesperson *</Label>
                  <Input
                    id="t-name"
                    value={form.salesperson_name}
                    onChange={(e) => setForm({ ...form, salesperson_name: e.target.value })}
                    placeholder="e.g., Gabriella Maccioni"
                    maxLength={120}
                  />
                </div>

                <div className="rounded-md border p-3 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Trip details
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-state">State visited</Label>
                    <Input
                      id="t-state"
                      value={form.state_visited}
                      onChange={(e) => setForm({ ...form, state_visited: e.target.value })}
                      placeholder="e.g., California, Texas, New York"
                      maxLength={120}
                    />
                    <p className="text-[11px] text-muted-foreground">Enter the state you're traveling to.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-purpose">Purpose</Label>
                    <Input
                      id="t-purpose"
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      placeholder="e.g., Trade show, Client visit, Conference"
                      maxLength={200}
                    />
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> Travel dates
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="t-start">Start date *</Label>
                      <Input
                        id="t-start"
                        type="date"
                        value={form.travel_date}
                        onChange={(e) => setForm({ ...form, travel_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="t-end">End date</Label>
                      <Input
                        id="t-end"
                        type="date"
                        value={form.travel_end_date}
                        min={form.travel_date}
                        onChange={(e) => setForm({ ...form, travel_end_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="t-notes">Additional notes</Label>
                  <Textarea
                    id="t-notes"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    placeholder="Meeting objectives, key contacts, special arrangements…"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={addTrip} disabled={saving}>
                  {saving ? "Saving…" : (<><Plus className="h-4 w-4" /> Add trip</>)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Calendar */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Travel Schedule</h2>
            <p className="text-xs text-muted-foreground">{format(cursor, "MMMM yyyy")}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())} className="h-8">
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const trips = tripsByDay.get(key) ?? [];
            const inMonth = isSameMonth(d, cursor);
            const isSel = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, new Date());
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={[
                  "relative min-h-[88px] border-b border-r p-2 text-left transition-colors",
                  inMonth ? "bg-card" : "bg-muted/20",
                  isSel ? "ring-2 ring-primary ring-inset z-10" : "",
                  "hover:bg-accent/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={[
                      "text-sm",
                      inMonth ? "text-foreground" : "text-muted-foreground/60",
                      isToday ? "font-semibold text-primary" : "",
                    ].join(" ")}
                  >
                    {format(d, "d")}
                  </span>
                  {trips.length > 0 && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {trips.length}
                    </span>
                  )}
                </div>
                {/* Dots representing salespeople */}
                <div className="absolute bottom-1.5 left-2 right-2 flex flex-wrap gap-1 justify-center">
                  {trips.slice(0, 6).map((t, idx) => (
                    <span
                      key={`${t.id}-${idx}`}
                      title={t.salesperson_name ?? ""}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: colorFor(t.salesperson_name) }}
                    />
                  ))}
                  {trips.length > 6 && (
                    <span className="text-[9px] text-muted-foreground">+{trips.length - 6}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        {peopleInMonth.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap p-3 border-t bg-muted/20">
            <span className="text-xs font-medium text-muted-foreground">Salespeople this month:</span>
            {peopleInMonth.map(([name, color]) => (
              <span key={name} className="inline-flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {name}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Upcoming Trips */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" /> Upcoming Trips
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {upcomingTrips.length} scheduled {upcomingTrips.length === 1 ? "trip" : "trips"}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : upcomingTrips.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No upcoming trips scheduled.</p>
        ) : (
          <div className="space-y-2">
            {upcomingTrips.map((t) => {
              const start = parseISO(t.travel_date);
              const end = t.travel_end_date ? parseISO(t.travel_end_date) : start;
              const isMulti = !isSameDay(start, end);
              const color = colorFor(t.salesperson_name);
              const title = t.purpose || "Trip";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTrip(t)}
                  className="w-full text-left rounded-lg border bg-muted/20 hover:bg-accent/40 hover:border-primary transition-colors flex items-stretch overflow-hidden group"
                >
                  <span
                    className="w-1.5 shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="flex-1 flex items-center justify-between gap-3 px-4 py-3 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-primary">
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        {t.salesperson_name ?? "Unknown"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {t.approval_status && (
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {t.approval_status}
                        </p>
                      )}
                      <p className="text-xs font-medium">
                        {isMulti
                          ? `${format(start, "MMM d")} – ${format(end, "MMM d")}`
                          : format(start, "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Last traveled per salesperson */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" /> Last traveled
          </h2>
          <span className="text-xs text-muted-foreground">
            {lastTraveled.length} {lastTraveled.length === 1 ? "person" : "people"}
          </span>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : lastTraveled.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No travel records yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lastTraveled.map((t) => {
              const start = parseISO(t.travel_date);
              const end = t.travel_end_date ? parseISO(t.travel_end_date) : start;
              const isMulti = !isSameDay(start, end);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTrip(t)}
                  className="text-left rounded-lg border p-3 hover:border-primary hover:bg-accent/40 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: colorFor(t.salesperson_name) }}
                      />
                      <p className="font-medium text-sm truncate group-hover:text-primary">
                        {t.salesperson_name ?? "Unknown"}
                      </p>
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                      {daysAgo(t.travel_date)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" />
                    {isMulti
                      ? `${format(start, "MMM d")} → ${format(end, "MMM d, yyyy")}`
                      : format(start, "MMM d, yyyy")}
                  </p>
                  {t.purpose && (
                    <p className="text-xs mt-1 line-clamp-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      {t.purpose}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Trip Details for selected date */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" />
            Trip details — {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {selectedTrips.length} {selectedTrips.length === 1 ? "trip" : "trips"}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : selectedTrips.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No trips scheduled for this day. Click another date or use “Add trip”.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {selectedTrips.map((t) => {
              const start = parseISO(t.travel_date);
              const end = t.travel_end_date ? parseISO(t.travel_end_date) : start;
              const isMulti = !isSameDay(start, end);
              return (
                <div key={t.id} className="rounded-lg border p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: colorFor(t.salesperson_name) }}
                      />
                      <p className="font-semibold truncate flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.salesperson_name ?? "Unknown"}
                      </p>
                    </div>
                    {t.approval_status && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {t.approval_status}
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {isMulti
                      ? `${format(start, "MMM d")} → ${format(end, "MMM d, yyyy")}`
                      : format(start, "MMM d, yyyy")}
                  </div>

                  {t.purpose && (
                    <div className="text-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-0.5">
                        <MapPin className="h-3 w-3" /> Purpose
                      </p>
                      <p className="text-sm">{t.purpose}</p>
                    </div>
                  )}

                  {t.notes && (
                    <div className="text-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-0.5">
                        <FileText className="h-3 w-3" /> Notes
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{t.notes}</p>
                    </div>
                  )}

                  {t.monday_id && (
                    <p className="text-[10px] text-muted-foreground pt-1 border-t">
                      monday.com ID: {t.monday_id}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Trip detail dialog (from Last traveled) */}
      <Dialog open={!!detailTrip} onOpenChange={(o) => !o && setDetailTrip(null)}>
        <DialogContent className="sm:max-w-lg">
          {detailTrip && (() => {
            const start = parseISO(detailTrip.travel_date);
            const end = detailTrip.travel_end_date ? parseISO(detailTrip.travel_end_date) : start;
            const isMulti = !isSameDay(start, end);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: colorFor(detailTrip.salesperson_name) }}
                    />
                    {detailTrip.salesperson_name ?? "Unknown"}
                  </DialogTitle>
                  <DialogDescription>Travel details</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
                      <CalendarDays className="h-3 w-3" /> Dates
                    </p>
                    <p className="text-sm">
                      {isMulti
                        ? `${format(start, "EEE, MMM d, yyyy")} → ${format(end, "EEE, MMM d, yyyy")}`
                        : format(start, "EEEE, MMMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{daysAgo(detailTrip.travel_date)}</p>
                  </div>
                  {detailTrip.purpose && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
                        <MapPin className="h-3 w-3" /> Purpose
                      </p>
                      <p className="text-sm">{detailTrip.purpose}</p>
                    </div>
                  )}
                  {detailTrip.notes && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
                        <FileText className="h-3 w-3" /> Notes
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{detailTrip.notes}</p>
                    </div>
                  )}
                  {detailTrip.approval_status && (
                    <div>
                      <Badge variant="secondary" className="text-[10px]">{detailTrip.approval_status}</Badge>
                    </div>
                  )}
                  {detailTrip.monday_id && (
                    <p className="text-[10px] text-muted-foreground pt-2 border-t">
                      monday.com ID: {detailTrip.monday_id}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDetailTrip(null)}>Close</Button>
                  <Button
                    onClick={() => {
                      setSelectedDate(parseISO(detailTrip.travel_date));
                      setCursor(parseISO(detailTrip.travel_date));
                      setDetailTrip(null);
                    }}
                  >
                    View on calendar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
