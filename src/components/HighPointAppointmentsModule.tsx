import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, Search, ChevronDown, CalendarDays, Clock, Building2, Mail,
  Pencil, Trash2, Loader2, Users, TrendingUp, User, Upload,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Constants & helpers ───────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Target:    { dot: "bg-slate-400",   pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  Confirmed: { dot: "bg-blue-500",    pill: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  Showed:    { dot: "bg-green-500",   pill: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  "No-Show": { dot: "bg-red-400",     pill: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
} as const;
type ApptStatus = keyof typeof STATUS_CONFIG;
const STATUSES = Object.keys(STATUS_CONFIG) as ApptStatus[];

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDay(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function showRate(showed: number, noShow: number): string {
  const resolved = showed + noShow;
  return resolved > 0 ? `${Math.round((showed / resolved) * 100)}%` : "—";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ApptEvent = {
  id: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
};

type RepInfo = { id: string; name: string; manager_id: string | null };
type ManagerInfo = { id: string; name: string };

type MarketAppt = {
  id: string;
  event_id: string | null;
  phase: string;
  rep_id: string;
  dealer: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  appointment_day: string | null;
  appointment_time: string | null;
  notes: string | null;
  status: ApptStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  sales_reps: { id: string; name: string; manager_id: string | null } | null;
};

type FormData = {
  rep_id: string;
  dealer: string;
  buyer_name: string;
  buyer_email: string;
  appointment_day: string;
  appointment_time: string;
  notes: string;
  status: ApptStatus;
};

const emptyForm = (): FormData => ({
  rep_id: "", dealer: "", buyer_name: "", buyer_email: "",
  appointment_day: "", appointment_time: "", notes: "", status: "Target",
});

// ── Main component ────────────────────────────────────────────────────────────

export function HighPointAppointmentsModule() {
  const { user } = useAuth();
  const { data: roleInfo } = useUserRole();
  const isAdmin   = roleInfo?.isAdmin   ?? false;
  const isManager = roleInfo?.isManager ?? false;
  const isRep     = roleInfo?.isRep     ?? false;
  const currentRepId     = roleInfo?.repId     ?? null;
  const currentManagerId = roleInfo?.managerId ?? null;

  // Event / phase
  const [events, setEvents]               = useState<ApptEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [phase, setPhase]                 = useState<"Premarket" | "Market">("Premarket");

  // Data
  const [appointments, setAppointments]   = useState<MarketAppt[]>([]);
  const [reps, setReps]                   = useState<RepInfo[]>([]);
  const [managers, setManagers]           = useState<ManagerInfo[]>([]);
  const [loading, setLoading]             = useState(true);

  // Form
  const [formOpen, setFormOpen]           = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [form, setForm]                   = useState<FormData>(emptyForm());
  const [submitting, setSubmitting]       = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget]   = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);

  // Calendar detail
  const [calDetail, setCalDetail]         = useState<MarketAppt | null>(null);

  // Import
  type ImportRow = {
    rep_id: string | null;
    rep_name: string;
    rep_error: boolean;
    buyer_name: string | null;
    dealer: string | null;
    notes: string | null;
    status: ApptStatus;
    _preview_address: string;
    _preview_raw_status: string;
  };
  const [importOpen, setImportOpen]   = useState(false);
  const [importPhase, setImportPhase] = useState<"Premarket" | "Market">("Premarket");
  const [importRows, setImportRows]   = useState<ImportRow[]>([]);
  const [importing, setImporting]     = useState(false);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const mapStatus = (raw: string): ApptStatus => {
    const s = raw.trim().toLowerCase();
    if (!s) return "Target";
    if (s === "confirmed") return "Confirmed";
    if (s === "showed" || s === "show") return "Showed";
    if (s === "no-show" || s === "noshow" || s === "no show") return "No-Show";
    return "Target";
  };

  const parseRows = (records: Record<string, string>[]): ImportRow[] =>
    records
      .map((r) => {
        const col = (names: string[]) => {
          for (const n of names) {
            const key = Object.keys(r).find((k) => k.trim().toLowerCase() === n.toLowerCase());
            if (key !== undefined) return (r[key] ?? "").trim();
          }
          return "";
        };
        const first   = col(["first", "first name"]);
        const last    = col(["last", "last name"]);
        const company = col(["company"]);
        const address = col(["address"]);
        const city    = col(["city"]);
        const state   = col(["state"]);
        const zip     = col(["zip", "zip code", "postal code"]);
        const rawSt   = col(["status"]);
        const rawRep  = col(["rep", "rep name", "sales rep"]);
        const rawNote = col(["notes", "note"]);

        // Match rep by name (case-insensitive, partial OK).
        // If no REP column exists in the file at all (rawRep empty), rep_error stays
        // false — importNoRepColumn will show a fallback dropdown instead.
        let matchedRepId: string | null = null;
        let repError = false;
        if (isRep) {
          matchedRepId = currentRepId ?? null;
        } else if (rawRep) {
          const q = rawRep.toLowerCase();
          const exact = reps.find((r2) => r2.name.toLowerCase() === q);
          const partial = exact ?? reps.find((r2) => r2.name.toLowerCase().includes(q) || q.includes(r2.name.toLowerCase()));
          matchedRepId = partial?.id ?? null;
          repError = !matchedRepId;
        }
        // rawRep empty → leave rep_id null, repError false; fallback dropdown resolves it

        const nameParts = [first, last].filter(Boolean);
        const addrParts = [address, city, state ? (zip ? `${state} ${zip}` : state) : zip].filter(Boolean);
        const addrStr   = addrParts.join(", ");
        const noteParts = [
          rawNote,
          addrStr,
          rawSt && mapStatus(rawSt) === "Target" && rawSt ? `Status: ${rawSt}` : "",
        ].filter(Boolean);

        return {
          rep_id:              matchedRepId,
          rep_name:            rawRep,
          rep_error:           repError,
          buyer_name:          nameParts.length ? nameParts.join(" ") : null,
          dealer:              company || null,
          notes:               noteParts.length ? noteParts.join(" | ") : null,
          status:              mapStatus(rawSt),
          _preview_address:    addrStr,
          _preview_raw_status: rawSt,
        } as ImportRow;
      })
      .filter((r) => r.buyer_name || r.dealer);

  const downloadSampleCsv = () => {
    const repName = reps[0]?.name ?? "Mike Durham";
    const rows = [
      ["FIRST", "LAST", "COMPANY", "ADDRESS", "CITY", "STATE", "ZIP", "Status", "Notes", "REP"],
      ["John", "Smith", "Smith Furniture", "123 Main St", "Charlotte", "NC", "28202", "", "Likes Chatham collection", repName],
      ["Jane", "Doe", "Doe Home Furnishings", "456 Oak Ave", "Raleigh", "NC", "27601", "Confirmed", "", repName],
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "market_appointments_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv" || ext === "txt") {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => setImportRows(parseRows(res.data)),
        error: (e) => toast.error("CSV parse error: " + e.message),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb   = XLSX.read(e.target?.result, { type: "array" });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          setImportRows(parseRows(data));
        } catch (err: any) {
          toast.error("Excel parse error: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const submitImport = async () => {
    try {
      if (!selectedEventId) { toast.error("Select a market first"); return; }
      if (!importRows.length) { toast.error("No rows to import"); return; }

      // Rows with a resolved rep_id go in; unmatched are skipped with a warning
      const valid   = importRows.filter((r) => r.rep_id);
      const skipped = importRows.length - valid.length;
      if (!valid.length) { toast.error("No rows with a recognised REP name — check the REP column matches rep names in the portal."); return; }

      setImporting(true);
      const payload = valid.map((r) => ({
        event_id:   selectedEventId,
        phase:      importPhase,
        rep_id:     r.rep_id,
        dealer:     r.dealer,
        buyer_name: r.buyer_name,
        notes:      r.notes,
        status:     r.status,
        created_by: user?.id ?? null,
      }));
      const BATCH = 50;
      let totalInserted = 0;
      for (let i = 0; i < payload.length; i += BATCH) {
        const batch = payload.slice(i, i + BATCH);
        const { error } = await (supabase as any).from("market_appointments").insert(batch);
        if (error) { toast.error(`Import error: ${error.message}`); setImporting(false); return; }
        totalInserted += batch.length;
      }
      setImporting(false);
      if (skipped > 0) {
        toast.success(`${totalInserted} leads imported · ${skipped} skipped (unrecognised REP)`);
      } else {
        toast.success(`${totalInserted} leads imported`);
      }
      setImportOpen(false);
      setImportRows([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadAppointments(selectedEventId, importPhase);
      if (importPhase !== phase) setPhase(importPhase);
    } catch (err: any) {
      setImporting(false);
      toast.error(err?.message ?? "Import failed — check console for details");
      console.error("[submitImport]", err);
    }
  };

  // New market form
  const [marketFormOpen, setMarketFormOpen] = useState(false);
  const [marketForm, setMarketForm]         = useState({ name: "", location: "", start_date: "", end_date: "" });
  const [marketSubmitting, setMarketSubmitting] = useState(false);

  const submitMarketForm = async () => {
    if (!marketForm.name.trim()) return toast.error("Market name is required");
    setMarketSubmitting(true);
    const { data, error } = await (supabase as any)
      .from("market_appointment_events")
      .insert({
        name:       marketForm.name.trim(),
        location:   marketForm.location.trim() || null,
        start_date: marketForm.start_date || null,
        end_date:   marketForm.end_date   || null,
        created_by: user?.id ?? null,
      })
      .select("id, name, location, start_date, end_date")
      .single();
    setMarketSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Market added");
    setEvents((prev) => [data as ApptEvent, ...prev]);
    setSelectedEventId((data as ApptEvent).id);
    setMarketFormOpen(false);
    setMarketForm({ name: "", location: "", start_date: "", end_date: "" });
  };

  // Filters
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<string>("all");
  const [repFilter, setRepFilter]         = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState<string>("all");

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadEvents = async () => {
    const { data, error } = await (supabase as any)
      .from("market_appointment_events")
      .select("id, name, location, start_date, end_date")
      .order("start_date", { ascending: false });
    if (error) { toast.error(error.message); return; }
    const list = (data ?? []) as ApptEvent[];
    setEvents(list);
    if (list.length > 0) setSelectedEventId((id: string) => id || list[0].id);
  };

  const loadRepData = async () => {
    const [mgrResult, repResult] = await Promise.all([
      supabase.from("managers").select("id, name, email").order("created_at"),
      supabase.from("sales_reps").select("id, name, manager_id").order("name"),
    ]);

    if (!repResult.error) setReps((repResult.data ?? []) as RepInfo[]);

    if (!mgrResult.error) {
      const allMgrs = (mgrResult.data ?? []) as { id: string; name: string; email: string | null }[];
      const allReps = (repResult.data ?? []) as RepInfo[];

      // Mirror ManagersPage exclusions
      const filtered = allMgrs.filter((m) => {
        const n = m.name.trim().toLowerCase();
        const e = m.email?.trim().toLowerCase();
        if (n === "sales" || e === "sales@lineage-collections.com") return false;
        if (n === "scott grisack") return false;
        return true;
      });

      // Mirror ManagersPage deduplication: group by first-name token,
      // keep the record with the most reps, display the longest full name
      const repCountByMgr = new Map<string, number>();
      allReps.forEach((r) => {
        if (!r.manager_id) return;
        repCountByMgr.set(r.manager_id, (repCountByMgr.get(r.manager_id) ?? 0) + 1);
      });

      const groups = new Map<string, typeof filtered>();
      filtered.forEach((m) => {
        const key = m.name.trim().split(/\s+/)[0].toLowerCase();
        const arr = groups.get(key) ?? [];
        arr.push(m);
        groups.set(key, arr);
      });

      const deduped: ManagerInfo[] = [];
      groups.forEach((arr) => {
        const winner = [...arr].sort(
          (a, b) => (repCountByMgr.get(b.id) ?? 0) - (repCountByMgr.get(a.id) ?? 0)
        )[0];
        const bestName = [...arr]
          .map((m) => m.name.trim())
          .sort((a, b) =>
            b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length
          )[0];
        deduped.push({ id: winner.id, name: bestName });
      });

      setManagers(deduped.sort((a, b) => a.name.localeCompare(b.name)));
    }
  };

  const loadAppointments = async (eventId: string, ph: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("market_appointments")
      .select("*, sales_reps(id, name, manager_id)")
      .eq("event_id", eventId)
      .eq("phase", ph)
      .order("appointment_day", { ascending: true, nullsFirst: false })
      .order("appointment_time", { ascending: true, nullsFirst: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setAppointments((data ?? []) as unknown as MarketAppt[]);
    setLoading(false);
  };

  useEffect(() => {
    if (roleInfo !== undefined) {
      loadEvents();
      loadRepData();
    }
  }, [!!roleInfo]);

  useEffect(() => {
    if (selectedEventId && roleInfo !== undefined) {
      loadAppointments(selectedEventId, phase);
    }
  }, [selectedEventId, phase, !!roleInfo]);

  // ── Filtered appointments ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...appointments];
    if (managerFilter !== "all") {
      list = list.filter((a) => a.sales_reps?.manager_id === managerFilter);
    }
    if (repFilter !== "all") {
      list = list.filter((a) => a.rep_id === repFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        [a.dealer, a.buyer_name, a.buyer_email, a.notes, a.sales_reps?.name]
          .some((v) => v && v.toLowerCase().includes(q))
      );
    }
    return list;
  }, [appointments, search, statusFilter, repFilter, managerFilter, isAdmin, isManager]);

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const targets   = filtered.length;
    const confirmed = filtered.filter((a) => a.status !== "Target").length;
    const showed    = filtered.filter((a) => a.status === "Showed").length;
    const noShow    = filtered.filter((a) => a.status === "No-Show").length;
    return { targets, confirmed, showed, showRate: showRate(showed, noShow) };
  }, [filtered]);

  // ── Appointments grouped by day ───────────────────────────────────────────

  const appointmentsByDay = useMemo(() => {
    const dayMap = new Map<string, MarketAppt[]>();
    for (const a of filtered) {
      if (a.status === "Target") continue;
      const key = a.appointment_day ?? "__unscheduled__";
      const list = dayMap.get(key) ?? [];
      list.push(a);
      dayMap.set(key, list);
    }
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => {
        if (a === "__unscheduled__") return 1;
        if (b === "__unscheduled__") return -1;
        return a.localeCompare(b);
      })
      .map(([day, appts]) => ({
        day,
        appts: appts.sort((a, b) =>
          (a.appointment_time ?? "").localeCompare(b.appointment_time ?? "")
        ),
      }));
  }, [filtered]);

  // ── Per-rep stats ─────────────────────────────────────────────────────────

  const byRepStats = useMemo(() => {
    const map = new Map<string, { repId: string; repName: string; managerId: string | null; targets: number; confirmed: number; showed: number; noShow: number }>();
    for (const a of filtered) {
      const cur = map.get(a.rep_id) ?? {
        repId: a.rep_id, repName: a.sales_reps?.name ?? "Unknown",
        managerId: a.sales_reps?.manager_id ?? null,
        targets: 0, confirmed: 0, showed: 0, noShow: 0,
      };
      cur.targets++;
      if (a.status !== "Target") cur.confirmed++;
      if (a.status === "Showed")   cur.showed++;
      if (a.status === "No-Show")  cur.noShow++;
      map.set(a.rep_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.targets - a.targets);
  }, [filtered]);

  // ── Per-manager stats (admin) ─────────────────────────────────────────────

  const byManagerStats = useMemo(() => {
    if (!isAdmin && !isManager && !isRep) return [];
    const map = new Map<string, { managerId: string; managerName: string; targets: number; confirmed: number; showed: number; noShow: number; repCount: number }>();
    for (const r of byRepStats) {
      const mid  = r.managerId ?? "__none__";
      const name = managers.find((m) => m.id === mid)?.name ?? "Unassigned";
      const cur  = map.get(mid) ?? { managerId: mid, managerName: name, targets: 0, confirmed: 0, showed: 0, noShow: 0, repCount: 0 };
      cur.targets   += r.targets;
      cur.confirmed += r.confirmed;
      cur.showed    += r.showed;
      cur.noShow    += r.noShow;
      cur.repCount++;
      map.set(mid, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.targets - a.targets);
  }, [byRepStats, managers, isAdmin]);

  // ── Visible reps for form dropdown ───────────────────────────────────────

  const visibleReps = useMemo(() => {
    return reps;
  }, [reps]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm(), rep_id: isRep ? (currentRepId ?? "") : "" });
    setFormOpen(true);
  };

  const openEdit = (a: MarketAppt) => {
    setEditingId(a.id);
    setForm({
      rep_id:           a.rep_id,
      dealer:           a.dealer           ?? "",
      buyer_name:       a.buyer_name       ?? "",
      buyer_email:      a.buyer_email      ?? "",
      appointment_day:  a.appointment_day  ?? "",
      appointment_time: a.appointment_time?.slice(0, 5) ?? "",
      notes:            a.notes            ?? "",
      status:           a.status,
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!selectedEventId) return;
    if (!form.dealer.trim() && !form.buyer_name.trim())
      return toast.error("Dealer or buyer name is required");
    if (form.buyer_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.buyer_email))
      return toast.error("Invalid email address");

    const repId = isRep ? (currentRepId ?? "") : form.rep_id;
    if (!repId) return toast.error("Please select a rep");

    const payload = {
      event_id:         selectedEventId,
      phase,
      rep_id:           repId,
      dealer:           form.dealer.trim()           || null,
      buyer_name:       form.buyer_name.trim()       || null,
      buyer_email:      form.buyer_email.trim()      || null,
      appointment_day:  form.appointment_day         || null,
      appointment_time: form.appointment_time        || null,
      notes:            form.notes.trim()            || null,
      status:           form.status,
    };

    setSubmitting(true);
    if (editingId) {
      const { error } = await supabase.from("market_appointments").update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); setSubmitting(false); return; }
      toast.success("Lead updated");
    } else {
      const { error } = await supabase.from("market_appointments").insert({ ...payload, created_by: user?.id ?? null });
      if (error) { toast.error(error.message); setSubmitting(false); return; }
      toast.success("Lead added");
    }

    setSubmitting(false);
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    loadAppointments(selectedEventId, phase);
  };

  const updateStatus = async (id: string, status: ApptStatus) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    const { error } = await supabase.from("market_appointments").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); loadAppointments(selectedEventId, phase); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("market_appointments").delete().eq("id", deleteTarget);
    setDeleting(false);
    if (error) { toast.error(error.message); setDeleteTarget(null); return; }
    toast.success("Lead deleted");
    setAppointments((prev) => prev.filter((a) => a.id !== deleteTarget));
    setDeleteTarget(null);
  };

  const showRepCol = true;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mt-2 space-y-5 animate-fade-in">
      {/* Module header */}
      <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Event selector */}
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="h-8 text-sm w-[210px]">
              <SelectValue placeholder="Select market…" />
            </SelectTrigger>
            <SelectContent>
              {events.length === 0 && (
                <SelectItem value="__none__" disabled>No markets yet</SelectItem>
              )}
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Add market — admin / manager only */}
          {(isAdmin || isManager) && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setMarketFormOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Market
            </Button>
          )}

          {/* Phase toggle */}
          <div className="flex border rounded-md overflow-hidden text-xs h-8">
            {(["Premarket", "Market"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={cn(
                  "px-3 font-medium transition-colors",
                  phase === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>

          <Button size="sm" variant="outline" className="h-8" onClick={() => { setImportPhase(phase); setImportRepId(isRep ? (currentRepId ?? "") : ""); setImportOpen(true); }}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import
          </Button>

          <Button size="sm" onClick={openNew} className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Lead
          </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Targets"   value={String(kpis.targets)}   icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Confirmed" value={String(kpis.confirmed)} icon={<CalendarDays className="h-4 w-4" />} />
        <KpiCard label="Showed"    value={String(kpis.showed)}    icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="Show Rate" value={kpis.showRate}          icon={<TrendingUp className="h-4 w-4" />} accent />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search dealer or buyer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-sm w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {showRepCol && visibleReps.length > 0 && (
          <Select value={repFilter} onValueChange={setRepFilter}>
            <SelectTrigger className="h-8 text-sm w-[150px]"><SelectValue placeholder="All reps" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {visibleReps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {managers.length > 0 && (
          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className="h-8 text-sm w-[160px]"><SelectValue placeholder="All managers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All managers</SelectItem>
              {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Workspace tabs */}
      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          {showRepCol && <TabsTrigger value="performance">Performance</TabsTrigger>}
        </TabsList>

        {/* ── Leads tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="leads" className="mt-4">
          {loading ? <LeadsSkeleton /> : filtered.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8 text-muted-foreground/40" />}
              title={appointments.length === 0 ? "No trade show leads yet" : "No leads match your filters"}
              description={
                appointments.length === 0
                  ? `Start building your target list for ${events.find((e) => e.id === selectedEventId)?.name ?? "this event"}.`
                  : "Try adjusting your filters or search."
              }
              action={appointments.length === 0 ? (
                <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1.5" />Add First Lead</Button>
              ) : null}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left px-3 py-2.5 font-medium">Account</th>
                      <th className="text-left px-3 py-2.5 font-medium">Buyer</th>
                      <th className="text-left px-3 py-2.5 font-medium">Appointment</th>
                      {showRepCol && <th className="text-left px-3 py-2.5 font-medium">Rep</th>}
                      <th className="text-left px-3 py-2.5 font-medium">Status</th>
                      <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Notes</th>
                      <th className="px-3 py-2.5 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5 font-medium max-w-[160px] truncate">
                          {a.dealer || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[140px]">
                          <p className="truncate">{a.buyer_name || "—"}</p>
                          {a.buyer_email && (
                            <a href={`mailto:${a.buyer_email}`} onClick={(e) => e.stopPropagation()} className="text-xs hover:underline truncate block">
                              {a.buyer_email}
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm whitespace-nowrap text-muted-foreground">
                          {a.appointment_day ? (
                            <div>
                              <p className="font-medium text-foreground text-xs">{fmtDay(a.appointment_day)}</p>
                              {a.appointment_time && <p className="text-xs">{fmtTime(a.appointment_time)}</p>}
                            </div>
                          ) : "—"}
                        </td>
                        {showRepCol && (
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {a.sales_reps?.name ?? "—"}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <StatusButton status={a.status} onStatusChange={(s) => updateStatus(a.id, s)} />
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate hidden lg:table-cell">
                          {a.notes || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-0.5 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(a.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filtered.map((a) => (
                  <div key={a.id} className="border rounded-lg p-3 bg-card space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.dealer || a.buyer_name || "—"}</p>
                        {a.buyer_name && a.dealer && <p className="text-xs text-muted-foreground">{a.buyer_name}</p>}
                        {(a.appointment_day || a.appointment_time) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.appointment_day && fmtDay(a.appointment_day)}
                            {a.appointment_time && ` · ${fmtTime(a.appointment_time)}`}
                          </p>
                        )}
                        {showRepCol && a.sales_reps?.name && (
                          <p className="text-xs text-muted-foreground">{a.sales_reps.name}</p>
                        )}
                      </div>
                      <StatusButton status={a.status} onStatusChange={(s) => updateStatus(a.id, s)} />
                    </div>
                    {a.notes && <p className="text-xs text-muted-foreground leading-relaxed">{a.notes}</p>}
                    <div className="flex gap-1 pt-1 border-t">
                      <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => openEdit(a)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs flex-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(a.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Appointments tab ───────────────────────────────────────────────── */}
        <TabsContent value="appointments" className="mt-4">
          {loading ? <LeadsSkeleton /> : appointmentsByDay.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8 text-muted-foreground/40" />}
              title="No confirmed appointments yet"
              description="Appointments appear here once leads are moved to Confirmed, Showed, or No-Show."
            />
          ) : (
            <div className="space-y-6">
              {appointmentsByDay.map(({ day, appts }) => (
                <div key={day}>
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                    <h4 className="font-medium text-sm">
                      {day === "__unscheduled__" ? "Unscheduled" : fmtDay(day)}
                    </h4>
                    <span className="text-xs text-muted-foreground">({appts.length})</span>
                  </div>
                  <div className="space-y-2 ml-6">
                    {appts.map((a) => (
                      <div key={a.id} className="border rounded-lg p-3 bg-card hover:bg-muted/20 transition-colors">
                        <div className="flex items-start gap-3">
                          {a.appointment_time ? (
                            <div className="w-16 shrink-0 text-right">
                              <p className="text-xs font-medium">{fmtTime(a.appointment_time)}</p>
                            </div>
                          ) : (
                            <div className="w-16 shrink-0 text-right">
                              <p className="text-xs text-muted-foreground">No time</p>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div>
                                <p className="font-medium text-sm">{a.dealer || "—"}</p>
                                {a.buyer_name && (
                                  <p className="text-xs text-muted-foreground">{a.buyer_name}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {showRepCol && a.sales_reps?.name && (
                                  <span className="text-xs text-muted-foreground hidden sm:inline">{a.sales_reps.name}</span>
                                )}
                                <StatusButton status={a.status} onStatusChange={(s) => updateStatus(a.id, s)} />
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(a)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {a.notes && (
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{a.notes}</p>
                            )}
                            {a.buyer_email && (
                              <a href={`mailto:${a.buyer_email}`} className="text-xs text-primary hover:underline mt-1 flex items-center gap-1">
                                <Mail className="h-3 w-3" />{a.buyer_email}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Calendar tab ───────────────────────────────────────────────────── */}
        <TabsContent value="calendar" className="mt-4">
          {loading ? <LeadsSkeleton /> : (
            <CalendarView
              appointments={filtered}
              showRepCol={showRepCol}
              managers={managers}
              onEdit={openEdit}
              onStatusChange={updateStatus}
              selectedAppt={calDetail}
              onSelectAppt={setCalDetail}
            />
          )}
        </TabsContent>

        {/* ── Performance tab ────────────────────────────────────────────────── */}
        {showRepCol && (
          <TabsContent value="performance" className="mt-4">
            {loading ? <LeadsSkeleton /> : (
              <PerformanceView
                byRepStats={byRepStats}
                byManagerStats={byManagerStats}
                isAdmin={isAdmin}
              />
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ── New market dialog ───────────────────────────────────────────────── */}
      <Dialog open={marketFormOpen} onOpenChange={(o) => { if (!o) { setMarketFormOpen(false); setMarketForm({ name: "", location: "", start_date: "", end_date: "" }); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Market</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Market Name" required>
              <Input
                value={marketForm.name}
                onChange={(e) => setMarketForm({ ...marketForm, name: e.target.value })}
                placeholder="Market Name"
              />
            </FormField>
            <FormField label="Location">
              <Input
                value={marketForm.location}
                onChange={(e) => setMarketForm({ ...marketForm, location: e.target.value })}
                placeholder="Location"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Start Date">
                <Input
                  type="date"
                  value={marketForm.start_date}
                  onChange={(e) => setMarketForm({ ...marketForm, start_date: e.target.value })}
                />
              </FormField>
              <FormField label="End Date">
                <Input
                  type="date"
                  value={marketForm.end_date}
                  onChange={(e) => setMarketForm({ ...marketForm, end_date: e.target.value })}
                />
              </FormField>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMarketFormOpen(false)}>Cancel</Button>
            <Button onClick={submitMarketForm} disabled={marketSubmitting}>
              {marketSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Add Market
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / edit sheet ────────────────────────────────────────────────── */}
      <Sheet open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditingId(null); setForm(emptyForm()); } }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{editingId ? "Edit Lead" : "Add Trade Show Lead"}</SheetTitle>
            {(isAdmin || isManager) && !isRep && form.rep_id && (
              <SheetDescription>
                For: {reps.find((r) => r.id === form.rep_id)?.name ?? "Selected rep"}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="mt-5 space-y-4">
            {/* Rep selector — managers/admins only; reps always submit as themselves */}
            {(isAdmin || isManager) && (
              <FormField label="Rep" required>
                <Select value={form.rep_id} onValueChange={(v) => setForm({ ...form, rep_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select rep…" /></SelectTrigger>
                  <SelectContent>
                    {visibleReps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            )}

            <FormField label="Dealer / Account" required={!form.buyer_name}>
              <Input
                value={form.dealer}
                onChange={(e) => setForm({ ...form, dealer: e.target.value })}
                placeholder="Account Name"
              />
            </FormField>

            <FormField label="Buyer / Contact">
              <Input
                value={form.buyer_name}
                onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
                placeholder="Buyer / Contact"
              />
            </FormField>

            <FormField label="Email">
              <Input
                type="email"
                value={form.buyer_email}
                onChange={(e) => setForm({ ...form, buyer_email: e.target.value })}
                placeholder="Email Address"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Appointment Day">
                <Input
                  type="date"
                  value={form.appointment_day}
                  onChange={(e) => setForm({ ...form, appointment_day: e.target.value })}
                />
              </FormField>
              <FormField label="Appointment Time">
                <Input
                  type="time"
                  value={form.appointment_time}
                  onChange={(e) => setForm({ ...form, appointment_time: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ApptStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Notes">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Notes"
              />
            </FormField>
          </div>

          <div className="flex gap-2 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => { setFormOpen(false); setEditingId(null); setForm(emptyForm()); }}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submitForm} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editingId ? "Save Changes" : "Save Lead"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trade show lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this lead and its appointment information.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import dialog ────────────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportRows([]); if (fileInputRef.current) fileInputRef.current.value = ""; } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bulk Import Leads</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Controls row */}
            <div className="flex flex-wrap gap-3 items-end">
              {/* Phase */}
              <FormField label="Phase">
                <Select value={importPhase} onValueChange={(v) => setImportPhase(v as "Premarket" | "Market")}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Premarket">Premarket</SelectItem>
                    <SelectItem value="Market">Market</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              {/* File picker */}
              <FormField label="File (CSV or Excel)">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="w-[260px] h-9 cursor-pointer"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                    else setImportRows([]);
                  }}
                />
              </FormField>
            </div>

            {/* Column format hint + sample download */}
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Required columns: <span className="font-mono">FIRST · LAST · COMPANY · ADDRESS · CITY · STATE · ZIP · Status · Notes · REP</span>.
                At least one of First/Last or Company must be present per row. REP must match a rep's name exactly.
                Status values Confirmed / Showed / No-Show map directly; anything else defaults to Target and is preserved in notes.
              </p>
              <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={downloadSampleCsv}>
                Download sample CSV
              </Button>
            </div>

            {/* Preview */}
            {importRows.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-medium">{importRows.length} lead{importRows.length !== 1 ? "s" : ""} parsed</p>
                  {importRows.some((r) => r.rep_error) && (
                    <span className="text-xs text-destructive font-medium">
                      {importRows.filter((r) => r.rep_error).length} row{importRows.filter((r) => r.rep_error).length !== 1 ? "s" : ""} have unrecognised REP — fix before importing
                    </span>
                  )}
                </div>
                <div className="rounded-md border overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">Rep</th>
                        <th className="text-left px-3 py-2 font-medium">Name</th>
                        <th className="text-left px-3 py-2 font-medium">Company</th>
                        <th className="text-left px-3 py-2 font-medium">Address</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((r, i) => (
                        <tr key={i} className={cn("border-t", r.rep_error ? "bg-destructive/5" : "hover:bg-muted/20")}>
                          <td className="px-3 py-1.5">
                            {r.rep_error
                              ? <span className="text-destructive font-medium">{r.rep_name || "(blank)"} ✗</span>
                              : <span>{reps.find((rep) => rep.id === r.rep_id)?.name ?? r.rep_name}</span>}
                          </td>
                          <td className="px-3 py-1.5">{r.buyer_name ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-1.5">{r.dealer ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{r._preview_address || "—"}</td>
                          <td className="px-3 py-1.5">
                            <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-medium", STATUS_CONFIG[r.status].pill)}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importRows.length === 0 && (
              <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
                Select a CSV or Excel file to preview leads before importing
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t shrink-0">
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportRows([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitImport}
              disabled={importing || importRows.length === 0}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Import {importRows.length > 0 ? importRows.length : ""} Lead{importRows.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, accent = false }: {
  label: string; value: string; icon?: React.ReactNode; accent?: boolean;
}) {
  return (
    <Card className="p-4 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-serif mt-0.5 tabular-nums", accent && value !== "—" && "text-primary")}>
          {value}
        </p>
      </div>
      {icon && (
        <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
      )}
    </Card>
  );
}

function StatusButton({ status, onStatusChange }: {
  status: ApptStatus;
  onStatusChange: (s: ApptStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[status];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
            "hover:opacity-80 transition-opacity",
            cfg.pill
          )}
        >
          {status}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-34 p-1" align="start">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { onStatusChange(s); setOpen(false); }}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-muted",
              s === status && "bg-muted font-medium"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_CONFIG[s].dot)} />
            {s}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PerformanceView({ byRepStats, byManagerStats, isAdmin }: {
  byRepStats: Array<{ repId: string; repName: string; managerId: string | null; targets: number; confirmed: number; showed: number; noShow: number }>;
  byManagerStats: Array<{ managerId: string; managerName: string; targets: number; confirmed: number; showed: number; noShow: number; repCount: number }>;
  isAdmin: boolean;
}) {
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());
  const toggleManager = (id: string) =>
    setExpandedManagers((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const chartData = byRepStats.slice(0, 10).map((r) => ({
    name: r.repName.split(" ")[0],
    Targets: r.targets,
    Confirmed: r.confirmed,
    Showed: r.showed,
  }));

  if (byRepStats.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-8 w-8 text-muted-foreground/40" />}
        title="No performance data yet"
        description="Add leads and track progress to see performance stats here."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin: by-manager rollup */}
      {isAdmin && byManagerStats.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">By Manager</h3>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left px-3 py-2.5 font-medium">Manager</th>
                  <th className="text-right px-3 py-2.5 font-medium">Reps</th>
                  <th className="text-right px-3 py-2.5 font-medium">Targets</th>
                  <th className="text-right px-3 py-2.5 font-medium">Confirmed</th>
                  <th className="text-right px-3 py-2.5 font-medium">Showed</th>
                  <th className="text-right px-3 py-2.5 font-medium">Show Rate</th>
                  <th className="w-8 px-2" />
                </tr>
              </thead>
              <tbody>
                {byManagerStats.map((m) => (
                  <>
                    <tr
                      key={m.managerId}
                      className="border-t hover:bg-muted/20 cursor-pointer"
                      onClick={() => toggleManager(m.managerId)}
                    >
                      <td className="px-3 py-2.5 font-medium">{m.managerName}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{m.repCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m.targets}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 dark:text-blue-400">{m.confirmed}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-green-600 dark:text-green-400">{m.showed}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">{showRate(m.showed, m.noShow)}</td>
                      <td className="px-2 py-2.5">
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expandedManagers.has(m.managerId) && "rotate-180")} />
                      </td>
                    </tr>
                    {expandedManagers.has(m.managerId) && byRepStats
                      .filter((r) => r.managerId === m.managerId)
                      .map((r) => (
                        <tr key={r.repId} className="border-t bg-muted/10">
                          <td className="px-3 py-2 pl-7 text-muted-foreground text-sm flex items-center gap-1.5">
                            <User className="h-3 w-3 shrink-0" />{r.repName}
                          </td>
                          <td className="px-3 py-2 text-right" />
                          <td className="px-3 py-2 text-right tabular-nums text-sm">{r.targets}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-sm text-blue-600 dark:text-blue-400">{r.confirmed}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-sm text-green-600 dark:text-green-400">{r.showed}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-sm">{showRate(r.showed, r.noShow)}</td>
                          <td />
                        </tr>
                      ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rep stats table */}
      <div>
        <h3 className="text-sm font-medium mb-3">{isAdmin ? "All Reps" : "Team"}</h3>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-3 py-2.5 font-medium">Rep</th>
                <th className="text-right px-3 py-2.5 font-medium">Targets</th>
                <th className="text-right px-3 py-2.5 font-medium">Confirmed</th>
                <th className="text-right px-3 py-2.5 font-medium hidden sm:table-cell">Showed</th>
                <th className="text-right px-3 py-2.5 font-medium hidden sm:table-cell">No-Show</th>
                <th className="text-right px-3 py-2.5 font-medium">Show Rate</th>
              </tr>
            </thead>
            <tbody>
              {byRepStats.map((r) => {
                const maxTargets = byRepStats[0]?.targets || 1;
                const pct = Math.round((r.targets / maxTargets) * 100);
                return (
                  <tr key={r.repId} className="border-t">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{r.repName}</span>
                        <div className="h-1 rounded-full bg-muted overflow-hidden w-24">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.targets}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 dark:text-blue-400">{r.confirmed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-600 dark:text-green-400 hidden sm:table-cell">{r.showed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-500 dark:text-red-400 hidden sm:table-cell">{r.noShow}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{showRate(r.showed, r.noShow)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Volume by Rep</h3>
          <Card className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={28} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Targets"   fill="hsl(var(--muted-foreground)/0.4)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Confirmed" fill="hsl(221 83% 53%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Showed"    fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
      {icon}
      <p className="font-medium text-sm mt-1">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-xs">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function LeadsSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

// ── Calendar view (month grid) ────────────────────────────────────────────────

const CAL_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarView({
  appointments, showRepCol, managers, onEdit, onStatusChange, selectedAppt, onSelectAppt,
}: {
  appointments: MarketAppt[];
  showRepCol: boolean;
  managers: ManagerInfo[];
  onEdit: (a: MarketAppt) => void;
  onStatusChange: (id: string, s: ApptStatus) => void;
  selectedAppt: MarketAppt | null;
  onSelectAppt: (a: MarketAppt | null) => void;
}) {
  const confirmed = appointments.filter((a) => a.status !== "Target");
  const scheduled = confirmed.filter((a) => a.appointment_day);
  const unscheduled = confirmed.filter((a) => !a.appointment_day);

  // Default to the month of the earliest appointment, or current month
  const defaultDate = (() => {
    if (scheduled.length === 0) return new Date();
    const earliest = [...scheduled].sort((a, b) =>
      a.appointment_day!.localeCompare(b.appointment_day!)
    )[0];
    return new Date(earliest.appointment_day! + "T00:00:00");
  })();

  const [year, setYear]   = useState(defaultDate.getFullYear());
  const [month, setMonth] = useState(defaultDate.getMonth());

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  // Group scheduled appointments by ISO date string
  const dayMap = useMemo(() => {
    const map = new Map<string, MarketAppt[]>();
    for (const a of scheduled) {
      const list = map.get(a.appointment_day!) ?? [];
      list.push(a);
      map.set(a.appointment_day!, list);
    }
    for (const [k, list] of map) {
      map.set(k, list.sort((a, b) => (a.appointment_time ?? "").localeCompare(b.appointment_time ?? "")));
    }
    return map;
  }, [scheduled]);

  // Build day cells for the grid (nulls = padding days)
  const startDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday   = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
  const dayKey    = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (confirmed.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-8 w-8 text-muted-foreground/40" />}
        title="No confirmed appointments yet"
        description="Appointments appear here once leads are moved to Confirmed, Showed, or No-Show."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Previous month"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Next month"
        >
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7">
        {CAL_DOW.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground pb-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 border-t border-l rounded-lg overflow-hidden">
        {cells.map((day, i) => {
          if (!day) {
            return <div key={i} className="border-b border-r bg-muted/20 min-h-[100px] sm:min-h-[120px]" />;
          }
          const key   = dayKey(day);
          const appts = dayMap.get(key) ?? [];
          return (
            <div
              key={i}
              className={cn(
                "border-b border-r min-h-[100px] sm:min-h-[120px] p-1.5",
                isToday(day) ? "bg-primary/5" : "bg-background"
              )}
            >
              {/* Day number */}
              <div className={cn(
                "text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1 ml-auto font-medium",
                isToday(day)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              )}>
                {day}
              </div>

              {/* Appointment chips */}
              <div className="space-y-1">
                {appts.slice(0, 2).map((a) => {
                  const managerName = managers.find((m) => m.id === a.sales_reps?.manager_id)?.name;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelectAppt(a)}
                      className={cn(
                        "w-full text-left px-1.5 py-1 rounded font-medium",
                        "hover:opacity-75 transition-opacity",
                        STATUS_CONFIG[a.status].pill
                      )}
                    >
                      {/* Line 1: time + dealer */}
                      <p className="text-[10px] leading-tight truncate">
                        {a.appointment_time && (
                          <span className="opacity-60">{fmtTime(a.appointment_time)} </span>
                        )}
                        {a.dealer || a.buyer_name || "—"}
                      </p>
                      {/* Line 2: rep · manager */}
                      {(a.sales_reps?.name || managerName) && (
                        <p className="text-[9px] leading-tight opacity-65 truncate mt-0.5">
                          {[a.sales_reps?.name, managerName].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </button>
                  );
                })}
                {appts.length > 2 && (
                  <p className="text-[10px] text-muted-foreground px-1 pt-0.5">
                    +{appts.length - 2} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled confirmed appointments */}
      {unscheduled.length > 0 && (
        <div className="pt-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            No date scheduled ({unscheduled.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelectAppt(a)}
                className={cn(
                  "text-left text-xs px-2.5 py-1 rounded-md border font-medium hover:opacity-75 transition-opacity",
                  STATUS_CONFIG[a.status].pill
                )}
              >
                {a.dealer || a.buyer_name || "—"}
                {showRepCol && a.sales_reps?.name && (
                  <span className="opacity-60 ml-1">· {a.sales_reps.name}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Appointment detail sheet */}
      <Sheet open={!!selectedAppt} onOpenChange={(o) => { if (!o) onSelectAppt(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedAppt && (
            <ApptDetailContent
              appt={selectedAppt}
              showRepCol={showRepCol}
              onEdit={() => { onSelectAppt(null); onEdit(selectedAppt); }}
              onStatusChange={(s) => {
                onStatusChange(selectedAppt.id, s);
                onSelectAppt({ ...selectedAppt, status: s });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ApptDetailContent({ appt, showRepCol, onEdit, onStatusChange }: {
  appt: MarketAppt;
  showRepCol: boolean;
  onEdit: () => void;
  onStatusChange: (s: ApptStatus) => void;
}) {
  return (
    <>
      <SheetHeader className="text-left mb-5">
        <SheetTitle className="text-lg">{appt.dealer || appt.buyer_name || "Appointment"}</SheetTitle>
        {appt.buyer_name && appt.dealer && (
          <SheetDescription>{appt.buyer_name}</SheetDescription>
        )}
      </SheetHeader>

      <div className="space-y-4 text-sm">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Status</span>
          <StatusButton status={appt.status} onStatusChange={onStatusChange} />
        </div>

        {/* Date / time */}
        {(appt.appointment_day || appt.appointment_time) && (
          <div className="flex items-start gap-3 border rounded-md px-3 py-2.5 bg-muted/30">
            <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              {appt.appointment_day && (
                <p className="font-medium">{fmtDay(appt.appointment_day)}</p>
              )}
              {appt.appointment_time && (
                <p className="text-muted-foreground text-xs">{fmtTime(appt.appointment_time)}</p>
              )}
            </div>
          </div>
        )}

        {/* Rep */}
        {showRepCol && appt.sales_reps?.name && (
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{appt.sales_reps.name}</span>
          </div>
        )}

        {/* Email */}
        {appt.buyer_email && (
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <a href={`mailto:${appt.buyer_email}`} className="text-primary hover:underline truncate">
              {appt.buyer_email}
            </a>
          </div>
        )}

        {/* Notes */}
        {appt.notes && (
          <div className="border rounded-md px-3 py-2.5 bg-muted/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm leading-relaxed">{appt.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t">
        <Button className="w-full" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Appointment
        </Button>
      </div>
    </>
  );
}
