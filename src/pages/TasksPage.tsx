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
import { Plus, Trash2, Pencil, Calendar, Bell, Check, CheckCheck, Search, X, Users, Clock, ListChecks, AlertTriangle, Timer, UserCheck, CircleSlash, CheckCircle2, ChevronDown, Filter, GripVertical, MessageSquarePlus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DueDatePopover } from "@/components/DueDatePopover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format, formatDistanceToNow, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, isWithinInterval, parseISO } from "date-fns";
import { parseDateOnly } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TaskBoardsView from "@/components/TaskBoardsView";
import { TaskAttachments, PendingAttachmentPicker, uploadPendingAttachments } from "@/components/TaskAttachments";
import { TaskUpdatesDialog } from "@/components/TaskUpdatesDialog";

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
  group_id?: string | null;
  visibility: "public" | "private";
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
    label: "In Progress",
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
  const PRIVATE_TASK_EMAILS = [
    "justin@lineage-collections.com",
    "scott@lineage-collections.com",
    "gabriella@lineage-collections.com",
  ];
  const canSetPrivate = !!user?.email && PRIVATE_TASK_EMAILS.includes(user.email.toLowerCase());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
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
    kpi_review: boolean;
    visibility: "public" | "private";
  }>({ title: "", description: "", status: "todo", due_date: "", assigned_user_ids: [], trade_show: false, kpi_review: false, visibility: "public" });

  const TRADE_SHOW_TAG = "[Trade Show Leads]";
  const KPI_REVIEW_TAG = "[KPI Review]";

  // ---- Filters ----
  type AssigneeFilter = "all" | "mine" | "created";
  type DueFilter = "any" | "overdue" | "today" | "this_week" | "next_7" | "none";
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [assigneeUserId, setAssigneeUserId] = useState<string>("any");
  const [dueFilter, setDueFilter] = useState<DueFilter>("any");
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [boardFilter, setBoardFilter] = useState<string[]>([]);
  const [responsibleFilter, setResponsibleFilter] = useState<string[]>([]);
  const [contextQuery, setContextQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // ---- Bulk select ----
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- Inline title editing ----
  const [inlineEditingTaskId, setInlineEditingTaskId] = useState<string | null>(null);
  const [inlineEditTaskTitle, setInlineEditTaskTitle] = useState("");
  const saveInlineTaskTitle = async (id: string) => {
    const title = inlineEditTaskTitle.trim();
    setInlineEditingTaskId(null);
    if (!title) return;
    const { error } = await supabase.from("manager_tasks").update({ title }).eq("id", id);
    if (error) { toast({ title: "Failed to update title", variant: "destructive" }); return; }
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t)));
  };

  // ---- Inline add row ----
  const [addingListItem, setAddingListItem] = useState(false);
  const [newListItemTitle, setNewListItemTitle] = useState("");
  const quickCreateListTask = async (title: string) => {
    if (!user || !title.trim()) return;
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic: Task = {
      id: tempId,
      title: title.trim(),
      description: null,
      status: "todo",
      due_date: null,
      completed_at: null,
      created_at: now,
      assigned_manager_id: null,
      assigned_user_id: null,
      user_id: user.id,
      board_id: null,
      group_id: null,
      visibility: "public",
    };
    setTasks((prev) => [optimistic, ...prev]);
    const { data, error } = await supabase
      .from("manager_tasks")
      .insert({
        id: tempId,
        title: title.trim(),
        status: "todo",
        user_id: user.id,
        visibility: "public",
      })
      .select("*")
      .single();
    if (error || !data) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      toast({ title: "Create failed", description: error?.message ?? "Unknown error", variant: "destructive" });
    } else {
      setTasks((prev) => prev.map((t) => (t.id === tempId ? (data as Task) : t)));
    }
  };

  // ---- Updates dialog + counts ----
  const [updatesTaskId, setUpdatesTaskId] = useState<string | null>(null);
  const [updateCounts, setUpdateCounts] = useState<Record<string, number>>({});
  const refreshUpdateCounts = async () => {
    const { data } = await supabase.from("manager_task_updates" as any).select("task_id");
    const counts: Record<string, number> = {};
    ((data ?? []) as unknown as { task_id: string }[]).forEach((r) => {
      counts[r.task_id] = (counts[r.task_id] ?? 0) + 1;
    });
    setUpdateCounts(counts);
  };

  // ---- Inline due date + assignees ----
  const updateTaskDueDate = async (id: string, d: Date | null) => {
    const due_date = d ? format(d, "yyyy-MM-dd") : null;
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, due_date } : t)));
    const { error } = await supabase.from("manager_tasks").update({ due_date }).eq("id", id);
    if (error) { setTasks(prev); toast({ title: "Date update failed", variant: "destructive" }); }
  };

  const setTaskAssigneesInline = async (taskId: string, userIds: string[]) => {
    const prev = taskAssignees;
    setTaskAssignees((m) => ({ ...m, [taskId]: userIds }));
    const { error: delErr } = await supabase.from("manager_task_assignees" as any).delete().eq("task_id", taskId);
    if (delErr) { setTaskAssignees(prev); toast({ title: "Assignee update failed", variant: "destructive" }); return; }
    if (userIds.length > 0) {
      const rows = userIds.map((uid) => ({ task_id: taskId, user_id: uid }));
      const { error: insErr } = await supabase.from("manager_task_assignees" as any).insert(rows as any);
      if (insErr) { setTaskAssignees(prev); toast({ title: "Assignee update failed", variant: "destructive" }); }
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  const filtersActive =
    assigneeUserId !== "any" ||
    dueFilter !== "any" ||
    statusFilter.length > 0 ||
    boardFilter.length > 0 ||
    responsibleFilter.length > 0 ||
    contextQuery.trim() !== "";

  const clearFilters = () => {
    setAssigneeFilter("all");
    setAssigneeUserId("any");
    setDueFilter("any");
    setStatusFilter([]);
    setBoardFilter([]);
    setResponsibleFilter([]);
    setContextQuery("");
    setOpenFilter(null);
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

  const matchesResponsible = (t: Task): boolean => {
    if (responsibleFilter.length === 0) return true;
    const ids = getAssigneeIds(t);
    return responsibleFilter.some((id) => {
      if (id === "__unassigned__") return ids.length === 0;
      return ids.includes(id);
    });
  };

  const isTradeShowTask = (t: Task): boolean => {
    const desc = t.description ?? "";
    return /lead from/i.test(desc) || /\bTrade Show\b/i.test(desc) || /\bTrade Show\b/i.test(t.title);
  };

  const isKpiReviewTask = (t: Task): boolean => {
    const desc = t.description ?? "";
    return /\bKPI Review\b/i.test(t.title) || /\bKPI Review\b/i.test(desc);
  };

  const matchesAssigneeUser = (t: Task): boolean => {
    if (assigneeUserId === "any") {
      // Default scope: only my tasks (created by me or assigned to me)
      if (!user) return true;
      return t.user_id === user.id || getAssigneeIds(t).includes(user.id);
    }
    if (assigneeUserId === "__trade_show__") return isTradeShowTask(t);
    if (assigneeUserId === "__kpi_review__") return isKpiReviewTask(t);
    return getAssigneeIds(t).includes(assigneeUserId) || t.user_id === assigneeUserId;
  };

  const filteredTasks = tasks.filter(
    (t) => matchesAssignee(t) && matchesAssigneeUser(t) && matchesDue(t) && matchesContext(t) && matchesResponsible(t) && (statusFilter.length === 0 || statusFilter.includes(t.status)) && (boardFilter.length === 0 || boardFilter.includes(t.board_id ?? "")) && (showCompleted || t.status !== "done"),
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
    await refreshUpdateCounts();
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const resetForm = () => {
    setEditing(null);
    setForm({ title: "", description: "", status: "todo", due_date: "", assigned_user_ids: [], trade_show: false, kpi_review: false, visibility: "public" });
    setPendingFiles([]);
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
      kpi_review: isKpiReviewTask(t),
      visibility: t.visibility ?? "public",
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
    const hasKpiTag = /\bKPI Review\b/i.test(finalTitle);
    if (form.kpi_review && !hasKpiTag) {
      finalTitle = `${KPI_REVIEW_TAG} ${finalTitle}`;
    } else if (!form.kpi_review && hasKpiTag) {
      finalTitle = finalTitle.replace(/\[KPI Review\]\s*/i, "").replace(/\bKPI Review\b\s*/i, "").trim() || finalTitle;
    }
    const payload = {
      title: finalTitle,
      description: form.description.trim() || null,
      status: form.status,
      due_date: form.due_date || null,
      assigned_user_id: primary,
      visibility: canSetPrivate ? form.visibility : "public",
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
      // If creating from the Boards tab, attach to the currently-active board
      // and place the task in the group whose name maps to its status.
      let extra: { board_id?: string; group_id?: string | null } = {};
      if (activeTab === "boards") {
        let activeBoardId: string | null = null;
        try { activeBoardId = localStorage.getItem("active_task_board_id"); } catch {}
        if (activeBoardId) {
          extra.board_id = activeBoardId;
          const { data: groups } = await supabase
            .from("task_board_groups" as any)
            .select("id,name,position")
            .eq("board_id", activeBoardId)
            .order("position", { ascending: true });
          const list = (groups ?? []) as any[];
          if (list.length > 0) {
            const wanted = ({ todo: "to do", in_progress: "in progress", blocked: "stuck", done: "done" } as Record<Status, string>)[form.status];
            const match = list.find((g) => (g.name ?? "").toLowerCase().trim() === wanted);
            extra.group_id = (match ?? list[0]).id;
          }
        }
      }
      const { data, error } = await supabase
        .from("manager_tasks")
        .insert({ ...payload, ...extra, user_id: user.id })
        .select("id")
        .single();
      if (error || !data) {
        toast({ title: "Create failed", description: error?.message ?? "Unknown error", variant: "destructive" });
        return;
      }
      await syncAssignees(data.id, ids);
      if (pendingFiles.length > 0) {
        await uploadPendingAttachments(data.id, user.id, pendingFiles);
      }
    }
    setOpen(false);
    resetForm();
    load();
  };

  const groupMatchesStatus = (name: string, status: Status) =>
    status === "todo" ? /to.?do|backlog|not.?started|new/i.test(name)
    : status === "in_progress" ? /progress|doing|working|wip/i.test(name)
    : status === "done" ? /done|complete|finished/i.test(name)
    : status === "blocked" ? /stuck|block|hold|waiting/i.test(name)
    : false;

  const findGroupIdForStatus = async (
    board_id: string | null,
    status: Status,
  ): Promise<string | null | undefined> => {
    if (!board_id) return undefined;
    const { data: groups } = await supabase
      .from("task_board_groups" as any)
      .select("id,name")
      .eq("board_id", board_id);
    if (!groups || groups.length === 0) return undefined;
    const match = (groups as any[]).find((g) => groupMatchesStatus(g.name, status));
    return match ? (match.id as string) : undefined;
  };

  const updateStatus = async (id: string, status: Status) => {
    const prev = tasks;
    const task = tasks.find((t) => t.id === id);
    const targetGroupId = task ? await findGroupIdForStatus(task.board_id, status) : undefined;
    const shouldMove =
      targetGroupId !== undefined && !!task && task.group_id !== targetGroupId;

    setTasks((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, status, ...(shouldMove ? { group_id: targetGroupId as string } : {}) }
          : t,
      ),
    );
    const payload: any = { status };
    if (shouldMove) payload.group_id = targetGroupId;
    const { error } = await supabase.from("manager_tasks").update(payload).eq("id", id);
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

  const bulkUpdateStatus = async (status: Status) => {
    if (!user || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const editable = tasks.filter(
      (t) => ids.includes(t.id) && (t.user_id === user.id || getAssigneeIds(t).includes(user.id)),
    );
    if (editable.length === 0) {
      toast({ title: "Nothing to update", description: "You can only edit tasks you created or are assigned to.", variant: "destructive" });
      return;
    }
    const editableIds = editable.map((t) => t.id);
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (editableIds.includes(t.id) ? { ...t, status } : t)));
    const { error } = await supabase.from("manager_tasks").update({ status }).in("id", editableIds);
    if (error) {
      setTasks(prev);
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Updated ${editableIds.length} task${editableIds.length === 1 ? "" : "s"}` });
    exitSelectMode();
  };

  const bulkUpdateVisibility = async (visibility: "public" | "private") => {
    if (!user || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const editable = tasks.filter((t) => ids.includes(t.id) && t.user_id === user.id);
    if (editable.length === 0) {
      toast({ title: "Nothing to update", description: "You can only change visibility on tasks you created.", variant: "destructive" });
      return;
    }
    const editableIds = editable.map((t) => t.id);
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (editableIds.includes(t.id) ? { ...t, visibility } : t)));
    const { error } = await supabase.from("manager_tasks").update({ visibility }).in("id", editableIds);
    if (error) {
      setTasks(prev);
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Set ${editableIds.length} task${editableIds.length === 1 ? "" : "s"} to ${visibility}` });
    exitSelectMode();
  };

  const bulkDelete = async () => {
    if (!user || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const deletable = tasks.filter((t) => ids.includes(t.id) && t.user_id === user.id).map((t) => t.id);
    if (deletable.length === 0) {
      toast({ title: "Nothing to delete", description: "You can only delete tasks you created.", variant: "destructive" });
      return;
    }
    if (!confirm(`Delete ${deletable.length} task${deletable.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    const { error } = await supabase.from("manager_tasks").delete().in("id", deletable);
    if (error) {
      toast({ title: "Bulk delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setTasks((ts) => ts.filter((t) => !deletable.includes(t.id)));
    toast({ title: `Deleted ${deletable.length} task${deletable.length === 1 ? "" : "s"}` });
    exitSelectMode();
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
      ? ["admin", "manager", "rep"]
      : roleInfo?.role === "manager"
        ? ["admin", "manager", "rep"]
        : ["admin", "manager", "rep"];
  const visibleAssignees = assignees.filter(
    (a) =>
      allowedAssigneeRoles.includes(a.role) &&
      !(a.full_name ?? "").toLowerCase().includes("michigan (open)"),
  );

  // ---- Header summary metrics (only the current user's tasks: created by or assigned to me) ----
  const today = new Date();
  const myTasks = user
    ? tasks.filter((t) => t.user_id === user.id || getAssigneeIds(t).includes(user.id))
    : [];
  const totalTasks = myTasks.length;
  const overdueCount = myTasks.filter(
    (t) => t.due_date && t.status !== "done" && parseISO(t.due_date) < startOfDay(today),
  ).length;
  const dueSoonCount = myTasks.filter(
    (t) =>
      t.due_date &&
      t.status !== "done" &&
      isWithinInterval(parseISO(t.due_date), { start: startOfDay(today), end: endOfDay(addDays(today, 7)) }),
  ).length;
  const assignedToMeCount = user
    ? myTasks.filter((t) => getAssigneeIds(t).includes(user.id) && t.status !== "done").length
    : 0;
  const stuckCount = myTasks.filter((t) => t.status === "blocked").length;
  const completedCount = myTasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command Center"
        title="My Tasks"
        
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{editing ? "Edit Action Item" : activeTab === "boards" ? "New Item" : "New Action Item"}</DialogTitle>
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
                  tradeShow={form.trade_show}
                  onTradeShowChange={(v) => setForm({ ...form, trade_show: v })}
                  kpiReview={form.kpi_review}
                  onKpiReviewChange={(v) => setForm({ ...form, kpi_review: v })}
                />
                {canSetPrivate && !(activeTab === "boards" && !editing) && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Visibility</p>
                      <p className="text-xs text-muted-foreground">
                        {form.visibility === "public"
                          ? "Public - anyone in the portal can view this task."
                          : "Private - only you and assignees can view this task."}
                      </p>
                    </div>
                    <div className="inline-flex rounded-md border bg-muted p-0.5">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, visibility: "public" })}
                        className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                          form.visibility === "public"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground"
                        }`}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, visibility: "private" })}
                        className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                          form.visibility === "private"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground"
                        }`}
                      >
                        Private
                      </button>
                    </div>
                  </div>
                )}
                {editing ? (
                  <TaskAttachments taskId={editing.id} />
                ) : (
                  <PendingAttachmentPicker files={pendingFiles} onChange={setPendingFiles} />
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                  <SelectItem value="any" className="text-xs">My Tasks</SelectItem>
                  <SelectItem value="__trade_show__" className="text-xs">Trade Show Leads</SelectItem>
                  <SelectItem value="__kpi_review__" className="text-xs">KPI Review</SelectItem>
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
              {tasks.some((t) => t.status === "done") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => setShowCompleted((v) => !v)}
                >
                  {showCompleted ? "Hide completed" : `Show completed (${tasks.filter((t) => t.status === "done").length})`}
                </Button>
              )}
              <Button
                size="sm"
                variant={selectMode ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
              >
                {selectMode ? "Done" : "Select"}
              </Button>
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
        <div className="space-y-6">
          {(() => {
            const HEX_BY_STATUS: Record<Status, string> = {
              todo: "#94a3b8",
              in_progress: "#f59e0b",
              blocked: "#ef4444",
              done: "#10b981",
            };
            const columnHeader = (
              <div className="hidden md:grid grid-cols-[28px_minmax(0,1fr)_44px_140px_140px_120px_140px_60px] items-center bg-muted/40 text-[11px] font-medium text-muted-foreground border-b border-border">
                <div className="px-2 py-1.5 border-r border-border" />
                <div className="px-2 py-1.5 border-r border-border text-center">
                  <Popover open={openFilter === "item"} onOpenChange={(open) => setOpenFilter(open ? "item" : null)}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        Item
                        {contextQuery.trim() && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                            1
                          </span>
                        )}
                        <Filter className="h-3 w-3 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="center">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by item</div>
                      <Input
                        value={contextQuery}
                        onChange={(e) => setContextQuery(e.target.value)}
                        placeholder="Search title or description"
                        className="h-8 text-xs"
                      />
                      {contextQuery.trim() && (
                        <button
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline w-full text-left px-1"
                          onClick={() => { setContextQuery(""); setOpenFilter(null); }}
                        >
                          Clear filter
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="px-2 py-1.5 border-r border-border text-center">
                  <MessageSquarePlus className="h-3.5 w-3.5 inline" />
                </div>
                <div className="px-2 py-1.5 border-r border-border text-center">
                  <Popover open={openFilter === "responsible"} onOpenChange={(open) => setOpenFilter(open ? "responsible" : null)}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        Responsible
                        {responsibleFilter.length > 0 && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                            {responsibleFilter.length}
                          </span>
                        )}
                        <Filter className="h-3 w-3 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="center">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by responsible</div>
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-muted/50">
                          <Checkbox
                            checked={responsibleFilter.includes("__unassigned__")}
                            onCheckedChange={(val) => {
                              setResponsibleFilter((prev) =>
                                val ? [...prev, "__unassigned__"] : prev.filter((x) => x !== "__unassigned__")
                              );
                              setOpenFilter(null);
                            }}
                          />
                          <span className="text-xs">Unassigned</span>
                        </label>
                        {visibleAssignees
                          .slice()
                          .sort((a, b) =>
                            (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")
                          )
                          .map((a) => {
                            const checked = responsibleFilter.includes(a.user_id);
                            return (
                              <label key={a.user_id} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-muted/50">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(val) => {
                                    setResponsibleFilter((prev) =>
                                      val ? [...prev, a.user_id] : prev.filter((x) => x !== a.user_id)
                                    );
                                    setOpenFilter(null);
                                  }}
                                />
                                <span className="text-xs">{a.full_name || a.email}</span>
                              </label>
                            );
                          })}
                      </div>
                      {responsibleFilter.length > 0 && (
                        <button
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline w-full text-left px-1"
                          onClick={() => { setResponsibleFilter([]); setOpenFilter(null); }}
                        >
                          Clear filters
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="px-2 py-1.5 border-r border-border text-center">
                  <Popover open={openFilter === "status"} onOpenChange={(open) => setOpenFilter(open ? "status" : null)}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        Status
                        {statusFilter.length > 0 && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                            {statusFilter.length}
                          </span>
                        )}
                        <Filter className="h-3 w-3 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="center">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by status</div>
                      <div className="space-y-1">
                        {COLUMNS.map((c) => {
                          const checked = statusFilter.includes(c.key);
                          return (
                            <label key={c.key} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-muted/50">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(val) => {
                                  setStatusFilter((prev) =>
                                    val ? [...prev, c.key] : prev.filter((x) => x !== c.key)
                                  );
                                  setOpenFilter(null);
                                }}
                              />
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.pillBg} ${c.pillText}`}>
                                {c.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {statusFilter.length > 0 && (
                        <button
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline w-full text-left px-1"
                          onClick={() => { setStatusFilter([]); setOpenFilter(null); }}
                        >
                          Clear filters
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="px-2 py-1.5 border-r border-border text-center">
                  <Popover open={openFilter === "due"} onOpenChange={(open) => setOpenFilter(open ? "due" : null)}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        Due date
                        {dueFilter !== "any" && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                            1
                          </span>
                        )}
                        <Filter className="h-3 w-3 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="center">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by due date</div>
                      <div className="space-y-1">
                        {[
                          { value: "any", label: "Any due date" },
                          { value: "overdue", label: "Overdue" },
                          { value: "today", label: "Due today" },
                          { value: "this_week", label: "This week" },
                          { value: "next_7", label: "Next 7 days" },
                          { value: "none", label: "No due date" },
                        ].map((opt) => {
                          const checked = dueFilter === opt.value;
                          return (
                            <label key={opt.value} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-muted/50">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(val) => {
                                  if (val) {
                                    setDueFilter(opt.value as DueFilter);
                                    setOpenFilter(null);
                                  }
                                }}
                              />
                              <span className="text-xs">{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      {dueFilter !== "any" && (
                        <button
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline w-full text-left px-1"
                          onClick={() => { setDueFilter("any"); setOpenFilter(null); }}
                        >
                          Clear filter
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="px-2 py-1.5 border-r border-border text-center">
                  <Popover open={openFilter === "board"} onOpenChange={(open) => setOpenFilter(open ? "board" : null)}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        Board
                        {boardFilter.length > 0 && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                            {boardFilter.length}
                          </span>
                        )}
                        <Filter className="h-3 w-3 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="center">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by board</div>
                      <div className="space-y-1">
                        {boards.map((b) => {
                          const checked = boardFilter.includes(b.id);
                          return (
                            <label key={b.id} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-muted/50">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(val) => {
                                  setBoardFilter((prev) =>
                                    val ? [...prev, b.id] : prev.filter((x) => x !== b.id)
                                  );
                                  setOpenFilter(null);
                                }}
                              />
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: b.color || "#94a3b8" }}
                                />
                                <span className="text-xs">{b.name}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {boardFilter.length > 0 && (
                        <button
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline w-full text-left px-1"
                          onClick={() => { setBoardFilter([]); setOpenFilter(null); }}
                        >
                          Clear filters
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="px-2 py-1.5 text-center" />
              </div>
            );
            const items = filteredTasks;
            return (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <h2 className="text-base font-bold text-foreground">All Tasks</h2>
                  <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                    {items.length} {items.length === 1 ? "task" : "tasks"}
                  </span>
                  {selectMode && items.length > 0 && (
                    <Checkbox
                      className="ml-2"
                      checked={items.every((t) => selectedIds.has(t.id))}
                      onCheckedChange={(v) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (v) items.forEach((t) => next.add(t.id));
                          else items.forEach((t) => next.delete(t.id));
                          return next;
                        });
                      }}
                      aria-label="Select all"
                    />
                  )}
                </div>

                <div className="rounded-md overflow-hidden border border-border shadow-sm border-l-[6px] border-l-primary bg-card">
                  {columnHeader}
                  {items.length === 0 ? (
                    <div className="px-4 py-3 text-xs italic text-muted-foreground/70">
                      No tasks match your filters.
                    </div>
                  ) : (
                    <ul>
                      {(() => {
                        const submit = (close: boolean) => {
                          const title = newListItemTitle.trim();
                          if (title) {
                            void quickCreateListTask(title);
                          }
                          setNewListItemTitle("");
                          if (close) setAddingListItem(false);
                        };
                        return (
                          <li
                            onClick={() => {
                              if (!addingListItem) {
                                setAddingListItem(true);
                                setNewListItemTitle("");
                              }
                            }}
                            className="grid grid-cols-[28px_minmax(0,1fr)_44px] md:grid-cols-[28px_minmax(0,1fr)_44px_140px_140px_120px_140px_60px] items-center hover:bg-muted/30 cursor-pointer min-h-[36px] border-b border-border bg-card text-xs text-muted-foreground"
                          >
                            <div className="border-r border-border h-full" />
                            <div className="px-3 py-1.5" onClick={(e) => addingListItem && e.stopPropagation()}>
                              {addingListItem ? (
                                <Input
                                  autoFocus
                                  value={newListItemTitle}
                                  onChange={(e) => setNewListItemTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      submit(false);
                                    }
                                    if (e.key === "Escape") {
                                      setNewListItemTitle("");
                                      setAddingListItem(false);
                                    }
                                  }}
                                  onBlur={() => submit(true)}
                                  placeholder="Enter item name and press Enter"
                                  className="h-7 text-sm"
                                />
                              ) : (
                                <span className="italic">+ Add item</span>
                              )}
                            </div>
                            <div className="border-r border-border h-full" />
                            <div className="hidden md:block border-r border-border h-full" />
                            <div className="hidden md:block border-r border-border h-full" />
                            <div className="hidden md:block border-r border-border h-full" />
                            <div className="hidden md:block border-r border-border h-full" />
                            <div className="hidden md:block" />
                          </li>
                        );
                      })()}
                      {items.map((t) => {
                        const col = COLUMNS.find((c) => c.key === t.status) ?? COLUMNS[0];
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
                            className={`group/row grid grid-cols-[28px_minmax(0,1fr)_44px] md:grid-cols-[28px_minmax(0,1fr)_44px_140px_140px_120px_140px_60px] items-stretch hover:bg-muted/30 transition-colors border-b border-border last:border-b-0 bg-card ${
                              selectMode && selectedIds.has(t.id) ? "bg-primary/10" : ""
                            }`}
                          >
                            {/* Drag handle / select */}
                            <div
                              className="flex items-center justify-center text-muted-foreground/40 border-r border-border"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {selectMode ? (
                                <Checkbox
                                  checked={selectedIds.has(t.id)}
                                  onCheckedChange={() => toggleSelect(t.id)}
                                  aria-label="Select task"
                                />
                              ) : (
                                <Checkbox
                                  checked={t.status === "done"}
                                  onCheckedChange={(v) => updateStatus(t.id, v ? "done" : "todo")}
                                  aria-label="Mark complete"
                                  className="h-4 w-4"
                                />
                              )}
                            </div>

                            {/* Title */}
                            <div className="px-3 py-2 min-w-0 text-left border-r border-border" onClick={(e) => e.stopPropagation()}>
                              {inlineEditingTaskId === t.id ? (
                                <input
                                  autoFocus
                                  value={inlineEditTaskTitle}
                                  onChange={(e) => setInlineEditTaskTitle(e.target.value)}
                                  onBlur={() => saveInlineTaskTitle(t.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); saveInlineTaskTitle(t.id); }
                                    else if (e.key === "Escape") { e.preventDefault(); setInlineEditingTaskId(null); }
                                  }}
                                  className="text-sm leading-snug break-words w-full bg-transparent border-b border-current outline-none px-0 py-0"
                                />
                              ) : (
                                <p
                                  className="text-sm leading-snug break-words cursor-pointer hover:underline"
                                  title="Click to view details, double-click to rename"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectMode) { toggleSelect(t.id); return; }
                                    setDetailTask(t);
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (selectMode) return;
                                    setInlineEditingTaskId(t.id);
                                    setInlineEditTaskTitle(t.title);
                                  }}
                                >
                                  {t.title}
                                </p>
                              )}
                              {t.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.description}</p>
                              )}
                              {assignedToMe && (
                                <p className="text-[11px] text-primary mt-0.5 font-medium">Assigned to you</p>
                              )}
                            </div>

                            {/* Comments / updates */}
                            <div
                              className="flex items-center justify-center border-r border-border"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => setUpdatesTaskId(t.id)}
                                title="Updates & attachments"
                                className="relative inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              >
                                <MessageSquarePlus className="h-4 w-4" />
                                {updateCounts[t.id] > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 inline-flex h-3.5 min-w-3.5 px-1 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                                    {updateCounts[t.id]}
                                  </span>
                                )}
                              </button>
                            </div>

                            {/* Responsible (md+) */}
                            <div
                              className="hidden md:flex items-center justify-center px-2 border-r border-border"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="flex items-center justify-center w-full h-full py-1 hover:bg-muted/40 rounded">
                                    {owners.length === 0 ? (
                                      <span className="text-xs italic text-muted-foreground">Unassigned</span>
                                    ) : (
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
                                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
                                            +{owners.length - 3}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-0" align="center">
                                  <Command>
                                    <CommandInput placeholder="Search people..." />
                                    <CommandList>
                                      <CommandEmpty>No people found.</CommandEmpty>
                                      <CommandGroup heading="People">
                                        {assignees.map((u) => {
                                          const current = getAssigneeIds(t);
                                          const selected = current.includes(u.user_id);
                                          const name = u.full_name || u.email || u.user_id.slice(0, 8);
                                          return (
                                            <CommandItem
                                              key={u.user_id}
                                              value={`${u.full_name ?? ""} ${u.email ?? ""}`}
                                              onSelect={() => {
                                                const next = selected
                                                  ? current.filter((x) => x !== u.user_id)
                                                  : [...current, u.user_id];
                                                setTaskAssigneesInline(t.id, next);
                                              }}
                                              className="flex items-center gap-2"
                                            >
                                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                                                {initialsOf(name)}
                                              </span>
                                              <span className="flex-1 text-sm">{name}</span>
                                              {selected && <Check className="h-4 w-4 text-primary" />}
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>

                            {/* Status (md+) full-bleed */}
                            <div className="hidden md:flex items-stretch border-r border-border" onClick={(e) => e.stopPropagation()}>
                              <Select value={t.status} onValueChange={(v: Status) => updateStatus(t.id, v)}>
                                <SelectTrigger
                                  className={`h-auto w-full rounded-none border-0 ${col.pillBg} ${col.pillText} text-xs font-semibold justify-center gap-1 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden hover:opacity-90`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {COLUMNS.map((c) => (
                                    <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Due date (md+) */}
                            <div className="hidden md:flex items-stretch border-r border-border" onClick={(e) => e.stopPropagation()}>
                              <DueDatePopover dueDate={t.due_date} onChange={(d) => updateTaskDueDate(t.id, d)} />
                            </div>

                            {/* Board (md+) */}
                            <div className="hidden md:flex items-stretch border-r border-border" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={t.board_id ?? "__none__"}
                                onValueChange={(v) => updateBoard(t.id, v === "__none__" ? null : v)}
                                disabled={!(isMine || assignedToMe)}
                              >
                                <SelectTrigger className="h-auto w-full rounded-none border-0 bg-transparent text-xs justify-center gap-1 focus:ring-0 focus:ring-offset-0 hover:bg-muted/40 [&>svg]:opacity-50">
                                  <SelectValue placeholder="No board">
                                    {t.board_id ? (
                                      <span className="inline-flex items-center gap-1.5">
                                        <span
                                          className="inline-block h-2 w-2 rounded-full"
                                          style={{ background: boards.find((b) => b.id === t.board_id)?.color || "hsl(var(--muted-foreground))" }}
                                        />
                                        <span className="truncate">{boards.find((b) => b.id === t.board_id)?.name ?? "Board"}</span>
                                      </span>
                                    ) : (
                                      <span className="italic text-muted-foreground">No board</span>
                                    )}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-xs italic">No board</SelectItem>
                                  {boards.map((b) => (
                                    <SelectItem key={b.id} value={b.id} className="text-xs">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span
                                          className="inline-block h-2 w-2 rounded-full"
                                          style={{ background: b.color || "hsl(var(--muted-foreground))" }}
                                        />
                                        {b.name}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>


                            {/* Actions (md+) */}
                            <div className="hidden md:flex items-center justify-center gap-0.5 px-1" onClick={(e) => e.stopPropagation()}>
                              {(isMine || assignedToMe) && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isMine && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(t.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>

                            {/* Mobile meta */}
                            <div className="md:hidden col-start-2 px-3 pb-2 -mt-1 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <Badge className={`${col.pillBg} ${col.pillText} border-0 text-[10px]`}>{col.label}</Badge>
                              {primary && (
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                                    {initialsOf(primary.name)}
                                  </span>
                                  {primary.name}
                                  {owners.length > 1 && <span>+{owners.length - 1}</span>}
                                </span>
                              )}
                              {t.due_date && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {format(parseDateOnly(t.due_date)!, "MMM d")}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
        </TabsContent>
      </Tabs>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-2 rounded-full border bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
          <span className="text-xs font-medium px-2">
            {selectedIds.size} selected
          </span>
          <div className="h-5 w-px bg-border" />
          <Select onValueChange={(v: Status) => bulkUpdateStatus(v)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Change status" />
            </SelectTrigger>
            <SelectContent>
              {COLUMNS.map((c) => (
                <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canSetPrivate && (
            <Select onValueChange={(v: "public" | "private") => bulkUpdateVisibility(v)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public" className="text-xs">Public</SelectItem>
                <SelectItem value="private" className="text-xs">Private</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-destructive hover:text-destructive"
            onClick={bulkDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={exitSelectMode}>
            Cancel
          </Button>
        </div>
      )}

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
                        {t.due_date ? format(parseDateOnly(t.due_date)!, "MMM d, yyyy") : <span className="italic text-muted-foreground">-</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Completed
                      </p>
                      <p className="text-sm">
                        {t.completed_at ? format(new Date(t.completed_at), "MMM d, yyyy") : <span className="italic text-muted-foreground">-</span>}
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

                  <TaskAttachments taskId={t.id} />



                  {(isMine || (user && getAssigneeIds(t).includes(user.id))) && (
                    <div className="flex items-center gap-2 pt-4 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setDetailTask(null); openEdit(t); }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {isMine && (
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
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <TaskUpdatesDialog
        taskId={updatesTaskId}
        open={!!updatesTaskId}
        onOpenChange={(o) => { if (!o) { setUpdatesTaskId(null); refreshUpdateCounts(); } }}
        users={assignees.map((a) => ({ user_id: a.user_id, full_name: a.full_name, email: a.email }))}
        onActivityChange={refreshUpdateCounts}
      />
    </div>
  );
}


interface AssigneeMultiPickerProps {
  assignees: AssignableUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  tradeShow?: boolean;
  onTradeShowChange?: (v: boolean) => void;
  kpiReview?: boolean;
  onKpiReviewChange?: (v: boolean) => void;
}

function AssigneeMultiPicker({ assignees, selectedIds, onChange, tradeShow, onTradeShowChange, kpiReview, onKpiReviewChange }: AssigneeMultiPickerProps) {
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

  // Flat list - no role grouping

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
    const parts: string[] = [];
    if (tradeShow) parts.push("Trade Show Leads");
    if (kpiReview) parts.push("KPI Review");
    if (selectedUsers.length === 1) parts.push(selectedUsers[0].full_name?.trim() || selectedUsers[0].email || "Unknown");
    else if (selectedUsers.length > 1) parts.push(`${selectedUsers.length} people`);
    if (parts.length === 0) return "Assign to...";
    return parts.join(" + ");
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
              {onTradeShowChange && (
                <>
                  <button
                    type="button"
                    onClick={() => onTradeShowChange(!tradeShow)}
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox checked={!!tradeShow} className="pointer-events-none" />
                    <span className="truncate font-medium">Trade Show Leads</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Group</span>
                  </button>
                  <div className="my-1 h-px bg-border" />
                </>
              )}
              {onKpiReviewChange && (
                <>
                  <button
                    type="button"
                    onClick={() => onKpiReviewChange(!kpiReview)}
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox checked={!!kpiReview} className="pointer-events-none" />
                    <span className="truncate font-medium">KPI Review</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Group</span>
                  </button>
                  <div className="my-1 h-px bg-border" />
                </>
              )}
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
