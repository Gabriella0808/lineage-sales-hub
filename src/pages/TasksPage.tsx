import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
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
import { Plus, Trash2, Pencil, Calendar, Bell, Check, CheckCheck, Search, X, Users, Clock, ListChecks, AlertTriangle, Timer, UserCheck, CircleSlash, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, isWithinInterval, parseISO } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TaskBoardsView from "@/components/TaskBoardsView";

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
  board_id: string | null;
}

interface Board {
  id: string;
  name: string;
  color: string | null;
}



const COLUMNS: {
  key: Status;
  label: string;
  tone: string;
  accent: string;
  headerBg: string;
  pillBg: string;
  pillText: string;
}[] = [
  {
    key: "todo",
    label: "Not Started",
    tone: "border-muted-foreground/30",
    accent: "bg-muted-foreground/50",
    headerBg: "bg-muted/70",
    pillBg: "bg-foreground/85",
    pillText: "text-background",
  },
  {
    key: "in_progress",
    label: "In Motion",
    tone: "border-accent/40",
    accent: "bg-accent",
    headerBg: "bg-accent/15",
    pillBg: "bg-accent",
    pillText: "text-accent-foreground",
  },
  {
    key: "blocked",
    label: "Stuck",
    tone: "border-destructive/40",
    accent: "bg-destructive",
    headerBg: "bg-destructive/15",
    pillBg: "bg-destructive",
    pillText: "text-destructive-foreground",
  },
  {
    key: "done",
    label: "Completed",
    tone: "border-success/40",
    accent: "bg-success",
    headerBg: "bg-success/15",
    pillBg: "bg-success",
    pillText: "text-success-foreground",
  },
];

const ROLE_LABEL: Record<AssignableUser["role"], string> = {
  admin: "Admins",
  manager: "Sales Managers",
  rep: "Sales Reps",
};

export default function TasksPage() {
  const { user } = useAuth();
  const { data: roleInfo } = useUserRole();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});
  const [boards, setBoards] = useState<Board[]>([]);
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
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    status: Status;
    due_date: string;
    assigned_user_ids: string[];
    trade_show: boolean;
  }>({ title: "", description: "", status: "todo", due_date: "", assigned_user_ids: [], trade_show: false });

  const TRADE_SHOW_TAG = "[Trade Show Leads]";

  // ---- Filters ----
  type AssigneeFilter = "all" | "mine" | "created";
  type DueFilter = "any" | "overdue" | "today" | "this_week" | "next_7" | "none";
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [assigneeUserId, setAssigneeUserId] = useState<string>("any");
  const [dueFilter, setDueFilter] = useState<DueFilter>("any");
  const [contextQuery, setContextQuery] = useState("");

  const filtersActive =
    assigneeFilter !== "all" ||
    assigneeUserId !== "any" ||
    dueFilter !== "any" ||
    contextQuery.trim() !== "";

  const clearFilters = () => {
    setAssigneeFilter("all");
    setAssigneeUserId("any");
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

  const isTradeShowTask = (t: Task): boolean => {
    const desc = t.description ?? "";
    return /lead from/i.test(desc) || /\bTrade Show\b/i.test(desc) || /\bTrade Show\b/i.test(t.title);
  };

  const matchesAssigneeUser = (t: Task): boolean => {
    if (assigneeUserId === "any") return true;
    if (assigneeUserId === "__trade_show__") return isTradeShowTask(t);
    return getAssigneeIds(t).includes(assigneeUserId);
  };

  const filteredTasks = tasks.filter(
    (t) => matchesAssignee(t) && matchesAssigneeUser(t) && matchesDue(t) && matchesContext(t),
  );

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [tasksRes, assigneesRes, profilesRes, taRes, boardsRes] = await Promise.all([
      supabase.from("manager_tasks").select("*").order("created_at", { ascending: false }),
      supabase.rpc("assignable_users"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("manager_task_assignees" as any).select("task_id, user_id"),
      supabase.from("task_boards" as any).select("id, name, color").order("name"),
    ]);
    if (!boardsRes.error) setBoards(((boardsRes.data ?? []) as unknown) as Board[]);
    if (tasksRes.error) {
      toast({ title: "Failed to load tasks", description: tasksRes.error.message, variant: "destructive" });
    } else {
      setTasks((tasksRes.data ?? []) as Task[]);
    }
    if (assigneesRes.error) {
      toast({ title: "Failed to load assignees", description: assigneesRes.error.message, variant: "destructive" });
    } else {
      const HIDDEN_USER_IDS = new Set(["664c4627-764e-44ff-94ed-d887e3097265"]); // Brent
      const rolePriority: Record<string, number> = { admin: 3, manager: 2, rep: 1 };
      const dedupMap = new Map<string, AssignableUser>();
      ((assigneesRes.data ?? []) as AssignableUser[])
        .filter((a) => !HIDDEN_USER_IDS.has(a.user_id))
        .forEach((a) => {
          const existing = dedupMap.get(a.user_id);
          if (
            !existing ||
            (rolePriority[a.role] ?? 0) > (rolePriority[existing.role] ?? 0)
          ) {
            dedupMap.set(a.user_id, a);
          }
        });
      setAssignees([...dedupMap.values()]);
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
    setForm({ title: "", description: "", status: "todo", due_date: "", assigned_user_ids: [], trade_show: false });
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
      trade_show: isTradeShowTask(t),
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
    let finalTitle = form.title.trim();
    const hasTag = /\bTrade Show\b/i.test(finalTitle);
    if (form.trade_show && !hasTag) {
      finalTitle = `${TRADE_SHOW_TAG} ${finalTitle}`;
    } else if (!form.trade_show && hasTag) {
      finalTitle = finalTitle.replace(/\[Trade Show Leads\]\s*/i, "").replace(/\bTrade Show Leads?\b\s*/i, "").trim() || finalTitle;
    }
    const payload = {
      title: finalTitle,
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

  const updateBoard = async (id: string, board_id: string | null) => {
    const prev = tasks;
    const task = tasks.find((t) => t.id === id);
    let group_id: string | null = null;

    if (board_id) {
      // Find first group for the target board so the task actually shows up there
      const { data: groups } = await supabase
        .from("task_board_groups" as any)
        .select("id,name,position")
        .eq("board_id", board_id)
        .order("position", { ascending: true });
      if (groups && groups.length > 0) {
        const statusMatch = (groups as any[]).find((g) =>
          task?.status === "todo" ? /to.?do/i.test(g.name)
          : task?.status === "in_progress" ? /progress/i.test(g.name)
          : task?.status === "done" ? /done|complete/i.test(g.name)
          : task?.status === "blocked" ? /stuck|block/i.test(g.name)
          : false
        );
        group_id = (statusMatch ?? (groups as any[])[0]).id;
      }
    }

    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, board_id, group_id } : t)));
    const { error } = await supabase
      .from("manager_tasks")
      .update({ board_id, group_id } as any)
      .eq("id", id);
    if (error) {
      setTasks(prev);
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
    } else {
      const board = boards.find((b) => b.id === board_id);
      toast({ title: board_id ? `Moved to "${board?.name ?? "board"}"` : "Removed from board" });
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

  const allowedAssigneeRoles: AssignableUser["role"][] =
    roleInfo?.role === "admin"
      ? ["admin", "manager"]
      : roleInfo?.role === "manager"
        ? ["admin", "manager", "rep"]
        : ["admin", "manager", "rep"];
  const visibleAssignees = assignees.filter(
    (a) =>
      allowedAssigneeRoles.includes(a.role) &&
      !(a.full_name ?? "").toLowerCase().includes("michigan (open)"),
  );

  // ---- Header summary metrics ----
  const today = new Date();
  const totalTasks = tasks.length;
  const overdueCount = tasks.filter(
    (t) => t.due_date && t.status !== "done" && parseISO(t.due_date) < startOfDay(today),
  ).length;
  const dueSoonCount = tasks.filter(
    (t) =>
      t.due_date &&
      t.status !== "done" &&
      isWithinInterval(parseISO(t.due_date), { start: startOfDay(today), end: endOfDay(addDays(today, 7)) }),
  ).length;
  const assignedToMeCount = user
    ? tasks.filter((t) => getAssigneeIds(t).includes(user.id) && t.status !== "done").length
    : 0;
  const stuckCount = tasks.filter((t) => t.status === "blocked").length;
  const completedCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command Center"
        title="My Tasks"
        
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> New Action Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{editing ? "Edit Action Item" : "New Action Item"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  maxLength={200}
                />
                <Textarea
                  placeholder="Add context, links, or follow-up notes"
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
                  assignees={visibleAssignees}
                  selectedIds={form.assigned_user_ids}
                  onChange={(ids) => setForm({ ...form, assigned_user_ids: ids })}
                />
                <label className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                  <Checkbox
                    checked={form.trade_show}
                    onCheckedChange={(v) => setForm({ ...form, trade_show: v === true })}
                  />
                  <span className="font-medium">Assign to Trade Show Leads</span>
                  <span className="text-xs text-muted-foreground ml-auto">Tag this task as a trade show lead follow-up</span>
                </label>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="boards">Boards</TabsTrigger>
        </TabsList>

        <TabsContent value="boards" className="mt-4">
          <TaskBoardsView />
        </TabsContent>

        <TabsContent value="list" className="space-y-6 mt-4">

        {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total" value={totalTasks} icon={ListChecks} hint="all action items" />
          <MetricCard label="Overdue" value={overdueCount} icon={AlertTriangle} tone="destructive" hint="past due, open" />
          <MetricCard label="Due Soon" value={dueSoonCount} icon={Timer} tone="warning" hint="next 7 days" />
          <MetricCard label="Assigned to Me" value={assignedToMeCount} icon={UserCheck} tone="accent" hint="open · my queue" />
          <MetricCard label="Stuck" value={stuckCount} icon={CircleSlash} tone="destructive" hint="needs unblocking" />
          <MetricCard label="Completed" value={completedCount} icon={CheckCircle2} tone="success" hint="closed" />
        </div>
        )}

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

            {/* Assigned-to user select */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Select value={assigneeUserId} onValueChange={(v) => setAssigneeUserId(v)}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="Assigned to" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any" className="text-xs">Anyone</SelectItem>
                  <SelectItem value="__trade_show__" className="text-xs">Trade Show Leads</SelectItem>
                  {visibleAssignees
                    .slice()
                    .sort((a, b) =>
                      (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""),
                    )
                    .map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id} className="text-xs">
                        {a.full_name || a.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Task search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={contextQuery}
                onChange={(e) => setContextQuery(e.target.value)}
                placeholder="Search tasks (title & description)"
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
          <div className="hidden md:grid grid-cols-[8px_minmax(0,1fr)_180px_160px_120px_180px_80px] items-center gap-0 border-b bg-muted/30 px-0 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div />
            <div className="px-3">Task</div>
            <div className="px-3">Owner</div>
            <div className="px-3">Status</div>
            <div className="px-3">Due date</div>
            <div className="px-3">Board</div>
            <div className="px-3 text-right">Actions</div>
          </div>

          <div className="divide-y">
            {COLUMNS.map((col) => {
              const items = filteredTasks.filter((t) => t.status === col.key);
              return (
                <div key={col.key} className="">
                  {/* Group header — editorial style */}
                  <div className={`flex items-center gap-3 px-4 py-2.5 ${col.headerBg} border-b border-border/70`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${col.accent}`} />
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">{col.label}</h2>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{items.length}</span>
                    <span className="flex-1 h-px bg-border/60" />
                  </div>

                  {/* Group rows */}
                  {items.length === 0 ? (
                    <div className="px-4 py-4 text-xs italic text-muted-foreground/70">
                      No items in this lane.
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
                            onClick={() => { setDetailTask(t); markRead(t.id); }}
                            className="group/row grid grid-cols-[4px_minmax(0,1fr)] md:grid-cols-[4px_minmax(0,1fr)_180px_160px_120px_180px_80px] items-center gap-0 hover:bg-muted/40 transition-colors cursor-pointer"
                          >
                            {/* Subtle hover accent */}
                            <div className={`self-stretch ${col.accent} opacity-0 group-hover/row:opacity-100 transition-opacity`} />

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
                              <div className="md:hidden mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                            <div className="hidden md:flex items-center px-3 py-2" onClick={(e) => e.stopPropagation()}>
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

                            {/* Board (md+) */}
                            <div className="hidden md:flex items-center px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              {(isMine || assignedToMe) ? (
                                <Select
                                  value={t.board_id ?? "__none__"}
                                  onValueChange={(v) => updateBoard(t.id, v === "__none__" ? null : v)}
                                >
                                  <SelectTrigger className="h-7 px-2 text-xs w-full min-w-0 overflow-hidden [&>span]:truncate [&>span]:block [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left">
                                    <SelectValue placeholder="No board" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__" className="text-xs italic">No board</SelectItem>
                                    {boards.map((b) => (
                                      <SelectItem key={b.id} value={b.id} className="text-xs">
                                        <span className="inline-flex items-center gap-2">
                                          {b.color && (
                                            <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                                          )}
                                          {b.name}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground truncate">
                                  {boards.find((b) => b.id === t.board_id)?.name ?? "—"}
                                </span>
                              )}
                            </div>

                            {/* Actions (md+) */}

                            {/* Actions (md+) */}
                            <div className="hidden md:flex items-center justify-end gap-1 px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                              <div className="md:hidden col-start-2 flex items-center gap-1 px-3 pb-2 -mt-1" onClick={(e) => e.stopPropagation()}>
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
        </TabsContent>
      </Tabs>

      <Sheet open={!!detailTask} onOpenChange={(o) => !o && setDetailTask(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detailTask && (() => {
            const t = detailTask;
            const ownerIds = getAssigneeIds(t);
            const owners = ownerIds.map((uid) => assigneeName(uid) ?? "Unknown");
            const creator = assigneeName(t.user_id) ?? "Unknown";
            const col = COLUMNS.find((c) => c.key === t.status)!;
            const isMine = !!user && t.user_id === user.id;
            return (
              <>
                <SheetHeader className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-3 w-1 rounded-sm ${col.accent}`} />
                    <Badge className={`${col.pillBg} ${col.pillText} border-0`}>{col.label}</Badge>
                  </div>
                  <SheetTitle className="text-xl font-serif leading-tight pr-6 break-words">
                    {t.title}
                  </SheetTitle>
                  <SheetDescription>
                    Created by {creator} · {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Status</p>
                    <Select
                      value={t.status}
                      onValueChange={(v: Status) => {
                        updateStatus(t.id, v);
                        setDetailTask({ ...t, status: v });
                      }}
                    >
                      <SelectTrigger className={`h-8 px-3 text-xs font-semibold border-0 ${col.pillBg} ${col.pillText} rounded-md w-auto gap-1 shadow-sm`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((c) => (
                          <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Due date
                      </p>
                      <p className="text-sm">
                        {t.due_date ? format(new Date(t.due_date), "MMM d, yyyy") : <span className="italic text-muted-foreground">—</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Completed
                      </p>
                      <p className="text-sm">
                        {t.completed_at ? format(new Date(t.completed_at), "MMM d, yyyy") : <span className="italic text-muted-foreground">—</span>}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Users className="h-3 w-3" /> Assigned to
                    </p>
                    {owners.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">Unassigned</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {owners.map((name, i) => (
                          <Badge key={i} variant="secondary" className="font-normal">{name}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Description</p>
                    {t.description ? (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-md p-3 border">
                        {t.description}
                      </p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">No description</p>
                    )}
                  </div>

                  {isMine && (
                    <div className="flex items-center gap-2 pt-4 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setDetailTask(null); openEdit(t); }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          remove(t.id);
                          setDetailTask(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
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

  // Flat list — no role grouping

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
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => setOpen((next) => !next)}
        aria-expanded={open}
      >
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {selectedUsers.length > 0 ? `${selectedUsers.length} selected` : ""}
        </span>
      </Button>
      {open && (
        <div className="rounded-md border bg-popover text-popover-foreground shadow-md">
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
          <div className="h-64 overflow-y-scroll overscroll-contain touch-pan-y">
            <div className="p-1">
              {filtered.map((a) => {
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
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">No people found.</p>
              )}
            </div>
          </div>
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
        </div>
      )}

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
