import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Calendar, User, Bell, Check, CheckCheck, Search, X, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, isWithinInterval, parseISO } from "date-fns";

type Status = "todo" | "in_progress" | "blocked" | "done";

interface AssignableUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "manager" | "rep";
}

interface Profile {
  user_id: string;
  full_name: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  assigned_manager_id: string | null;
  assigned_user_id: string | null;
  user_id: string;
}

const COLUMNS: {
  key: Status;
  label: string;
  tone: string;
  // Monday-style group accent (left bar + group header tint)
  accent: string;
  headerBg: string;
  // Status pill colors
  pillBg: string;
  pillText: string;
}[] = [
  {
    key: "todo",
    label: "Not Started",
    tone: "border-muted-foreground/30",
    accent: "bg-muted-foreground/60",
    headerBg: "bg-muted/40",
    pillBg: "bg-muted-foreground/80",
    pillText: "text-background",
  },
  {
    key: "in_progress",
    label: "Working on it",
    tone: "border-primary/40",
    accent: "bg-[hsl(38_92%_50%)]",
    headerBg: "bg-[hsl(38_92%_50%/0.08)]",
    pillBg: "bg-[hsl(38_92%_50%)]",
    pillText: "text-white",
  },
  {
    key: "blocked",
    label: "Stuck",
    tone: "border-destructive/40",
    accent: "bg-destructive",
    headerBg: "bg-destructive/10",
    pillBg: "bg-destructive",
    pillText: "text-destructive-foreground",
  },
  {
    key: "done",
    label: "Done",
    tone: "border-success/40",
    accent: "bg-[hsl(142_71%_45%)]",
    headerBg: "bg-[hsl(142_71%_45%/0.08)]",
    pillBg: "bg-[hsl(142_71%_45%)]",
    pillText: "text-white",
  },
];

const ROLE_LABEL: Record<AssignableUser["role"], string> = {
  admin: "Admins",
  manager: "Sales Managers",
  rep: "Sales Reps",
};

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const readKey = user ? `tasks_read_${user.id}` : "";
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!readKey) return;
    try {
      const stored = JSON.parse(localStorage.getItem(readKey) || "[]");
      setReadIds(new Set(stored));
    } catch {
      setReadIds(new Set());
    }
  }, [readKey]);

  const persistRead = (next: Set<string>) => {
    setReadIds(next);
    if (readKey) localStorage.setItem(readKey, JSON.stringify([...next]));
  };

  const markRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    persistRead(next);
  };

  const markAllRead = (ids: string[]) => {
    const next = new Set(readIds);
    ids.forEach((i) => next.add(i));
    persistRead(next);
  };

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    status: Status;
    due_date: string;
    assigned_user_ids: string[];
  }>({ title: "", description: "", status: "todo", due_date: "", assigned_user_ids: [] });

  // ---- Filters ----
  type AssigneeFilter = "all" | "mine" | "created";
  type DueFilter = "any" | "overdue" | "today" | "this_week" | "next_7" | "none";
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("any");
  const [contextQuery, setContextQuery] = useState("");

  const filtersActive =
    assigneeFilter !== "all" || dueFilter !== "any" || contextQuery.trim() !== "";

  const clearFilters = () => {
    setAssigneeFilter("all");
    setDueFilter("any");
    setContextQuery("");
  };

  const matchesDue = (t: Task): boolean => {
    if (dueFilter === "any") return true;
    if (dueFilter === "none") return !t.due_date;
    if (!t.due_date) return false;
    const d = parseISO(t.due_date);
    const now = new Date();
    if (dueFilter === "overdue") return d < startOfDay(now) && t.status !== "done";
    if (dueFilter === "today")
      return isWithinInterval(d, { start: startOfDay(now), end: endOfDay(now) });
    if (dueFilter === "this_week")
      return isWithinInterval(d, {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      });
    if (dueFilter === "next_7")
      return isWithinInterval(d, { start: startOfDay(now), end: endOfDay(addDays(now, 7)) });
    return true;
  };

  const getAssigneeIds = (t: Task): string[] => {
    const ids = new Set<string>(taskAssignees[t.id] ?? []);
    if (t.assigned_user_id) ids.add(t.assigned_user_id);
    return [...ids];
  };

  const matchesAssignee = (t: Task): boolean => {
    if (!user) return true;
    if (assigneeFilter === "all") return true;
    if (assigneeFilter === "mine") return getAssigneeIds(t).includes(user.id);
    if (assigneeFilter === "created") return t.user_id === user.id;
    return true;
  };

  const matchesContext = (t: Task): boolean => {
    const q = contextQuery.trim().toLowerCase();
    if (!q) return true;
    const hay = `${t.title} ${t.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  };

  const filteredTasks = tasks.filter(
    (t) => matchesAssignee(t) && matchesDue(t) && matchesContext(t),
  );

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [tasksRes, assigneesRes, profilesRes, taRes] = await Promise.all([
      supabase.from("manager_tasks").select("*").order("created_at", { ascending: false }),
      supabase.rpc("assignable_users"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("manager_task_assignees" as any).select("task_id, user_id"),
    ]);
    if (tasksRes.error) {
      toast({ title: "Failed to load tasks", description: tasksRes.error.message, variant: "destructive" });
    } else {
      setTasks((tasksRes.data ?? []) as Task[]);
    }
    if (assigneesRes.error) {
      toast({ title: "Failed to load assignees", description: assigneesRes.error.message, variant: "destructive" });
    } else {
      const HIDDEN_USER_IDS = new Set(["664c4627-764e-44ff-94ed-d887e3097265"]); // Brent
      const filtered = ((assigneesRes.data ?? []) as AssignableUser[]).filter(
        (a) => !HIDDEN_USER_IDS.has(a.user_id),
      );
      setAssignees(filtered);
    }
    if (!profilesRes.error) {
      setProfiles((profilesRes.data ?? []) as Profile[]);
    }
    if (!taRes.error) {
      const map: Record<string, string[]> = {};
      ((taRes.data ?? []) as unknown as { task_id: string; user_id: string }[]).forEach((row) => {
        if (!map[row.task_id]) map[row.task_id] = [];
        map[row.task_id].push(row.user_id);
      });
      setTaskAssignees(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const resetForm = () => {
    setEditing(null);
    setForm({ title: "", description: "", status: "todo", due_date: "", assigned_user_ids: [] });
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? "",
      status: t.status,
      due_date: t.due_date ?? "",
      assigned_user_ids: getAssigneeIds(t),
    });
    setOpen(true);
  };

  const syncAssignees = async (taskId: string, ids: string[]) => {
    // Replace assignees: delete all then insert chosen set
    await supabase.from("manager_task_assignees" as any).delete().eq("task_id", taskId);
    if (ids.length > 0) {
      const rows = ids.map((uid) => ({ task_id: taskId, user_id: uid }));
      const { error } = await supabase.from("manager_task_assignees" as any).insert(rows);
      if (error) {
        toast({ title: "Couldn't save assignees", description: error.message, variant: "destructive" });
      }
    }
  };

  const save = async () => {
    if (!user) return;
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const ids = form.assigned_user_ids;
    const primary = ids[0] ?? null; // keep legacy field in sync with first assignee
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      due_date: form.due_date || null,
      assigned_user_id: primary,
    } as any;
    if (editing) {
      const { error } = await supabase
        .from("manager_tasks")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
      await syncAssignees(editing.id, ids);
    } else {
      const { data, error } = await supabase
        .from("manager_tasks")
        .insert({ ...payload, user_id: user.id })
        .select("id")
        .single();
      if (error || !data) {
        toast({ title: "Create failed", description: error?.message ?? "Unknown error", variant: "destructive" });
        return;
      }
      await syncAssignees(data.id, ids);
    }
    setOpen(false);
    resetForm();
    load();
  };

  const updateStatus = async (id: string, status: Status) => {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    const { error } = await supabase.from("manager_tasks").update({ status }).eq("id", id);
    if (error) {
      setTasks(prev);
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("manager_tasks").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setTasks((ts) => ts.filter((t) => t.id !== id));
    }
  };

  const assigneeName = (userId: string | null) => {
    if (!userId) return null;
    const a = assignees.find((x) => x.user_id === userId);
    if (a) return a.full_name?.trim() || a.email || "Unknown";
    const p = profiles.find((x) => x.user_id === userId);
    return p?.full_name?.trim() || "Unknown";
  };

  const groupedAssignees = (["admin", "manager", "rep"] as const).map((role) => ({
    role,
    label: ROLE_LABEL[role],
    items: assignees
      .filter((a) => a.role === role)
      .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold">My Tasks</h1>
          <p className="text-sm text-muted-foreground">Tasks you created or were assigned to you</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Task" : "New Task"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200}
              />
              <Textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.status} onValueChange={(v: Status) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <AssigneeMultiPicker
                assignees={assignees}
                selectedIds={form.assigned_user_ids}
                onChange={(ids) => setForm({ ...form, assigned_user_ids: ids })}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!loading && user && (() => {
        const assignedToMe = tasks.filter(
          (t) => t.user_id !== user.id && getAssigneeIds(t).includes(user.id) && t.status !== "done",
        );
        const unread = assignedToMe.filter((t) => !readIds.has(t.id));
        if (unread.length === 0) return null;
        return (
          <Card className="p-4 border-l-4 border-primary bg-primary/5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Assigned to you</h2>
                <span className="text-xs text-muted-foreground">({unread.length} new)</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => markAllRead(unread.map((t) => t.id))}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </Button>
            </div>
            <ul className="space-y-1.5">
              {unread.slice(0, 8).map((t) => {
                const creator = profiles.find((p) => p.user_id === t.user_id);
                const creatorName = creator?.full_name?.trim() || "Someone";
                return (
                  <li
                    key={t.id}
                    className="text-sm flex items-center justify-between gap-2 rounded px-2 py-1 bg-background/60"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{creatorName}</span>
                      <span className="text-muted-foreground"> assigned a task to you: </span>
                      <span className="font-medium">{t.title}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => markRead(t.id)}
                    >
                      <Check className="h-3.5 w-3.5" /> Mark read
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })()}

      {/* Filters */}
      {!loading && (
        <Card className="p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
            {/* Quick assignee chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { key: "all", label: "All tasks" },
                { key: "mine", label: "Assigned to me" },
                { key: "created", label: "Created by me" },
              ] as { key: AssigneeFilter; label: string }[]).map((opt) => (
                <Button
                  key={opt.key}
                  size="sm"
                  variant={assigneeFilter === opt.key ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setAssigneeFilter(opt.key)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            <div className="hidden lg:block h-6 w-px bg-border" />

            {/* Due date select */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={dueFilter} onValueChange={(v: DueFilter) => setDueFilter(v)}>
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any" className="text-xs">Any due date</SelectItem>
                  <SelectItem value="overdue" className="text-xs">Overdue</SelectItem>
                  <SelectItem value="today" className="text-xs">Due today</SelectItem>
                  <SelectItem value="this_week" className="text-xs">This week</SelectItem>
                  <SelectItem value="next_7" className="text-xs">Next 7 days</SelectItem>
                  <SelectItem value="none" className="text-xs">No due date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Context search (territory / dealer) */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={contextQuery}
                onChange={(e) => setContextQuery(e.target.value)}
                placeholder="Search territory or dealer (matches title & description)"
                className="h-8 pl-8 text-xs"
              />
              {contextQuery && (
                <button
                  type="button"
                  onClick={() => setContextQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 lg:ml-auto">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filteredTasks.length} of {tasks.length}
              </span>
              {filtersActive && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Board column header (Monday-style) */}
          <div className="hidden md:grid grid-cols-[8px_minmax(0,1fr)_180px_160px_120px_80px] items-center gap-0 border-b bg-muted/30 px-0 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div />
            <div className="px-3">Task</div>
            <div className="px-3">Owner</div>
            <div className="px-3">Status</div>
            <div className="px-3">Due date</div>
            <div className="px-3 text-right">Actions</div>
          </div>

          <div className="divide-y">
            {COLUMNS.map((col) => {
              const items = filteredTasks.filter((t) => t.status === col.key);
              return (
                <div key={col.key} className="">
                  {/* Group header */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 ${col.headerBg} border-b`}
                  >
                    <span className={`inline-block h-3 w-1 rounded-sm ${col.accent}`} />
                    <h2 className="text-sm font-semibold">{col.label}</h2>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>

                  {/* Group rows */}
                  {items.length === 0 ? (
                    <div className="px-3 py-3 pl-6 text-xs italic text-muted-foreground">
                      No tasks
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {items.map((t) => {
                        const ownerIds = getAssigneeIds(t);
                        const owners = ownerIds.map((uid) => ({
                          id: uid,
                          name: assigneeName(uid) ?? "Unknown",
                        }));
                        const primary = owners[0];
                        const initialsOf = (n: string) =>
                          n
                            .split(/\s+/)
                            .map((p) => p[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join("")
                            .toUpperCase();
                        const isMine = !!user && t.user_id === user.id;
                        const assignedToMe =
                          !!user && t.user_id !== user.id && ownerIds.includes(user.id);
                        return (
                          <li
                            key={t.id}
                            className="grid grid-cols-[8px_minmax(0,1fr)] md:grid-cols-[8px_minmax(0,1fr)_180px_160px_120px_80px] items-center gap-0 hover:bg-muted/30 transition-colors"
                          >
                            {/* Colored left accent bar */}
                            <div className={`self-stretch ${col.accent}`} />

                            {/* Task title + description */}
                            <div className="px-3 py-2 min-w-0">
                              <p className="text-sm font-medium leading-snug break-words">
                                {t.title}
                              </p>
                              {t.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {t.description}
                                </p>
                              )}
                              {assignedToMe && (
                                <p className="text-[11px] text-primary mt-1 font-medium">
                                  Assigned to you
                                </p>
                              )}
                              {/* Mobile-only inline meta */}
                              <div className="md:hidden mt-2 flex flex-wrap items-center gap-2">
                                {primary && (
                                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                                      {initialsOf(primary.name)}
                                    </span>
                                    {primary.name}
                                    {owners.length > 1 && (
                                      <span className="text-muted-foreground">
                                        +{owners.length - 1}
                                      </span>
                                    )}
                                  </span>
                                )}
                                <Select
                                  value={t.status}
                                  onValueChange={(v: Status) => updateStatus(t.id, v)}
                                >
                                  <SelectTrigger
                                    className={`h-6 px-2 text-[11px] font-semibold border-0 ${col.pillBg} ${col.pillText} rounded-full w-auto gap-1`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {COLUMNS.map((c) => (
                                      <SelectItem
                                        key={c.key}
                                        value={c.key}
                                        className="text-xs"
                                      >
                                        {c.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {t.due_date && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(t.due_date), "MMM d")}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Owner column (md+) */}
                            <div className="hidden md:flex items-center gap-2 px-3 py-2 min-w-0">
                              {owners.length === 0 ? (
                                <span className="text-xs italic text-muted-foreground">
                                  Unassigned
                                </span>
                              ) : (
                                <div className="flex items-center min-w-0">
                                  <div className="flex -space-x-1.5">
                                    {owners.slice(0, 3).map((o) => (
                                      <span
                                        key={o.id}
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary ring-2 ring-background"
                                        title={o.name}
                                      >
                                        {initialsOf(o.name)}
                                      </span>
                                    ))}
                                    {owners.length > 3 && (
                                      <span
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
                                        title={owners.slice(3).map((o) => o.name).join(", ")}
                                      >
                                        +{owners.length - 3}
                                      </span>
                                    )}
                                  </div>
                                  <span className="truncate text-sm ml-2">
                                    {owners.length === 1
                                      ? owners[0].name
                                      : `${owners.length} people`}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Status pill (md+) */}
                            <div className="hidden md:flex items-center px-3 py-2">
                              <Select
                                value={t.status}
                                onValueChange={(v: Status) => updateStatus(t.id, v)}
                              >
                                <SelectTrigger
                                  className={`h-7 px-3 text-xs font-semibold border-0 ${col.pillBg} ${col.pillText} rounded-md w-full justify-center gap-1 shadow-sm`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {COLUMNS.map((c) => (
                                    <SelectItem
                                      key={c.key}
                                      value={c.key}
                                      className="text-xs"
                                    >
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Due date (md+) */}
                            <div className="hidden md:flex items-center px-3 py-2 text-xs text-muted-foreground">
                              {t.due_date ? (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {format(new Date(t.due_date), "MMM d, yyyy")}
                                </span>
                              ) : (
                                <span className="italic">—</span>
                              )}
                            </div>

                            {/* Actions (md+) */}
                            <div className="hidden md:flex items-center justify-end gap-1 px-3 py-2">
                              {isMine && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => openEdit(t)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => remove(t.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>

                            {/* Mobile actions */}
                            {isMine && (
                              <div className="md:hidden col-start-2 flex items-center gap-1 px-3 pb-2 -mt-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => openEdit(t)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => remove(t.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

interface AssigneeMultiPickerProps {
  assignees: AssignableUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function AssigneeMultiPicker({ assignees, selectedIds, onChange }: AssigneeMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const unique = Array.from(new Map(assignees.map((a) => [a.user_id, a])).values());
  const filtered = unique
    .filter((a) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        (a.full_name ?? "").toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      (a.full_name?.trim() || a.email || "").localeCompare(
        b.full_name?.trim() || b.email || "",
      ),
    );

  const grouped = (["admin", "manager", "rep"] as const).map((role) => ({
    role,
    label: ROLE_LABEL[role],
    items: filtered.filter((a) => a.role === role),
  }));

  const toggle = (uid: string) => {
    if (selectedIds.includes(uid)) {
      onChange(selectedIds.filter((id) => id !== uid));
    } else {
      onChange([...selectedIds, uid]);
    }
  };

  const selectedUsers = selectedIds
    .map((id) => unique.find((a) => a.user_id === id))
    .filter(Boolean) as AssignableUser[];

  const triggerLabel = (() => {
    if (selectedUsers.length === 0) return "Assign to...";
    if (selectedUsers.length === 1)
      return selectedUsers[0].full_name?.trim() || selectedUsers[0].email || "Unknown";
    return `${selectedUsers.length} people assigned`;
  })();

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Users className="h-4 w-4 text-muted-foreground" />
              {triggerLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              {selectedUsers.length > 0 ? `${selectedUsers.length} selected` : ""}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people..."
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <ScrollArea className="max-h-72">
            <div className="p-1">
              {grouped.map((g) =>
                g.items.length === 0 ? null : (
                  <div key={g.role} className="py-1">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.label}
                    </p>
                    {g.items.map((a) => {
                      const checked = selectedIds.includes(a.user_id);
                      const name = a.full_name?.trim() || a.email || "Unknown";
                      return (
                        <button
                          key={a.user_id}
                          type="button"
                          onClick={() => toggle(a.user_id)}
                          className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox checked={checked} className="pointer-events-none" />
                          <span className="truncate">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                ),
              )}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">No people found.</p>
              )}
            </div>
          </ScrollArea>
          {selectedUsers.length > 0 && (
            <div className="border-t p-2 flex justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onChange([])}
              >
                Clear all
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUsers.map((u) => {
            const name = u.full_name?.trim() || u.email || "Unknown";
            return (
              <span
                key={u.user_id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5"
              >
                {name}
                <button
                  type="button"
                  onClick={() => toggle(u.user_id)}
                  className="hover:text-foreground"
                  aria-label={`Remove ${name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

