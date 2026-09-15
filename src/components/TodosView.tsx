import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, isBefore, startOfDay } from "date-fns";
import { parseDateOnly } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  AlertTriangle,
  Clock,
  ExternalLink,
  Trash2,
  Pencil,
  Users,
  Check,
  X,
} from "lucide-react";
import { DueDatePopover } from "@/components/DueDatePopover";
import { TaskUpdatesDialog } from "@/components/TaskUpdatesDialog";
import { TaskAttachments, PendingAttachmentPicker, uploadPendingAttachments } from "@/components/TaskAttachments";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = "todo" | "in_progress" | "blocked" | "done";
type FilterTab = "all" | "overdue" | "today" | "upcoming" | "completed";

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
  group_id: string | null;
  visibility: "public" | "private";
}

interface BoardInfo {
  id: string;
  name: string;
  color: string | null;
}

interface GroupInfo {
  id: string;
  board_id: string;
  name: string;
  position: number;
}

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

export interface TodosViewProps {
  onSwitchToBoards?: (boardId?: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DueBucket = "overdue" | "today" | "upcoming" | "none" | "done";

function getDueBucket(due_date: string | null, status: Status): DueBucket {
  if (status === "done") return "done";
  if (!due_date) return "none";
  const d = parseDateOnly(due_date);
  const today = startOfDay(new Date());
  if (isBefore(d, today)) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  return "upcoming";
}

const BUCKET_ORDER: Record<DueBucket, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  none: 3,
  done: 4,
};

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ba = getDueBucket(a.due_date, a.status);
    const bb = getDueBucket(b.due_date, b.status);
    if (BUCKET_ORDER[ba] !== BUCKET_ORDER[bb]) return BUCKET_ORDER[ba] - BUCKET_ORDER[bb];
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

const STATUS_LABELS: Record<Status, string> = {
  todo: "Not Started",
  in_progress: "In Progress",
  blocked: "Stuck",
  done: "Completed",
};

const STATUS_COLORS: Record<Status, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  blocked: "bg-destructive/15 text-destructive",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

function formatDueDate(due_date: string): string {
  const d = parseDateOnly(due_date);
  const today = startOfDay(new Date());
  if (d.getTime() === today.getTime()) return "Today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return format(d, "MMM d");
}

const HIDDEN_USER_IDS = new Set(["664c4627-764e-44ff-94ed-d887e3097265"]);

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  assigneeNames: string[];
  commentCount: number;
  groupName?: string;
  onToggle: (id: string, done: boolean) => void;
  onStatusChange: (id: string, status: Status) => void;
  onOpen: (task: Task) => void;
  onComments: (id: string) => void;
}

function TaskRow({ task, assigneeNames, commentCount, groupName, onToggle, onStatusChange, onOpen, onComments }: TaskRowProps) {
  const bucket = getDueBucket(task.due_date, task.status);

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 border-b border-border/40 cursor-pointer group transition-colors"
      onClick={() => onOpen(task)}
    >
      <Checkbox
        checked={task.status === "done"}
        onCheckedChange={(v) => onToggle(task.id, !!v)}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />

      <div className="flex flex-col shrink-0 w-16">
        <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">Date Created</span>
        <span className="text-xs text-muted-foreground tabular-nums">{format(new Date(task.created_at), "MMM d")}</span>
      </div>

      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-sm leading-snug",
            task.status === "done" && "line-through text-muted-foreground",
          )}
        >
          {task.title}
        </span>
        {groupName && (
          <span className="ml-2 text-[10px] text-muted-foreground/70 font-medium uppercase tracking-wide">
            {groupName}
          </span>
        )}
      </div>

      <div className="flex flex-col shrink-0 w-16">
        <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">Due Date</span>
        {task.due_date ? (
          <span
            className={cn(
              "text-xs whitespace-nowrap flex items-center gap-0.5 tabular-nums",
              bucket === "overdue" && "text-destructive font-semibold",
              bucket === "today" && "text-amber-600 dark:text-amber-400 font-semibold",
              (bucket === "upcoming" || bucket === "none") && "text-muted-foreground",
              task.status === "done" && "text-muted-foreground/50",
            )}
          >
            {bucket === "overdue" && <AlertTriangle className="h-3 w-3" />}
            {bucket === "today" && <Clock className="h-3 w-3" />}
            {formatDueDate(task.due_date)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            className={cn(
              "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5 hover:opacity-80 transition-opacity",
              STATUS_COLORS[task.status],
            )}
          >
            {STATUS_LABELS[task.status]}
            <ChevronDown className="h-2.5 w-2.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {(Object.entries(STATUS_LABELS) as [Status, string][]).map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, value); }}
              className="flex items-center gap-2 text-xs"
            >
              <span className={cn("h-2 w-2 rounded-full", {
                "bg-muted-foreground": value === "todo",
                "bg-amber-500": value === "in_progress",
                "bg-destructive": value === "blocked",
                "bg-emerald-500": value === "done",
              })} />
              {label}
              {task.status === value && <Check className="h-3 w-3 ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {assigneeNames.length > 0 && (
        <div className="shrink-0 flex -space-x-1">
          {assigneeNames.slice(0, 3).map((name, i) => (
            <div
              key={i}
              title={name}
              className="h-5 w-5 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center"
            >
              <span className="text-[9px] font-bold text-primary">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onComments(task.id); }}
        className={cn(
          "shrink-0 flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
          commentCount === 0 && "opacity-0 group-hover:opacity-60",
        )}
        title="Comments"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {commentCount > 0 && <span>{commentCount}</span>}
      </button>
    </div>
  );
}

// Compact assignee multi-picker used in the edit dialog
interface AssigneePickerProps {
  users: AssignableUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function AssigneePicker({ users, selectedIds, onChange }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const unique = Array.from(new Map(users.map((u) => [u.user_id, u])).values());
  const filtered = unique.filter((u) => {
    const q = query.toLowerCase();
    return !q || (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
  });

  const selectedUsers = unique.filter((u) => selectedIds.includes(u.user_id));

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    setOpen(false);
  };


  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full justify-start font-normal">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {selectedUsers.length === 0
              ? "Assign to…"
              : selectedUsers.map((u) => u.full_name || u.email).join(", ")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-64" align="start">
          <Command>
            <CommandInput placeholder="Search users…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No users found</CommandEmpty>
              <CommandGroup>
                {filtered.map((u) => (
                  <CommandItem key={u.user_id} onSelect={() => toggle(u.user_id)}>
                    <Check className={cn("mr-2 h-3.5 w-3.5", selectedIds.includes(u.user_id) ? "opacity-100" : "opacity-0")} />
                    <span className="text-sm">{u.full_name || u.email}</span>
                    <span className="ml-auto text-xs text-muted-foreground capitalize">{u.role}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUsers.map((u) => (
            <Badge key={u.user_id} variant="secondary" className="font-normal text-xs gap-1">
              {u.full_name || u.email}
              <button
                type="button"
                onClick={() => toggle(u.user_id)}
                className="ml-0.5 rounded-full opacity-60 hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TodosView({ onSwitchToBoards }: TodosViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskAssigneeMap, setTaskAssigneeMap] = useState<Record<string, string[]>>({});
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [collapsedBoards, setCollapsedBoards] = useState<Record<string, boolean>>({});
  const [todosCollapsed, setTodosCollapsed] = useState(false);
  const [boardTasksCollapsed, setBoardTasksCollapsed] = useState(false);

  // Detail sheet
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "todo" as Status,
    due_date: "",
    assigned_user_ids: [] as string[],
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // New task
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", description: "", due_date: "", assigned_user_ids: [] as string[] });

  // Inline quick-add
  const [addingInline, setAddingInline] = useState(false);
  const [inlineTitle, setInlineTitle] = useState("");
  const inlineRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  // Comments
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);

    const [assignmentRes, assignableRes, profilesRes] = await Promise.all([
      supabase.from("manager_task_assignees" as any).select("task_id").eq("user_id", user.id),
      supabase.rpc("assignable_users"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);

    const assignedTaskIds: string[] = ((assignmentRes.data ?? []) as { task_id: string }[]).map((r) => r.task_id);

    // Fetch tasks I created or am assigned to
    let tasksData: Task[] = [];
    const { data: allVisible } = await supabase
      .from("manager_tasks")
      .select("*")
      .order("created_at", { ascending: false });

    const assignedSet = new Set(assignedTaskIds);
    tasksData = ((allVisible ?? []) as Task[]).filter(
      (t) => t.user_id === user.id || assignedSet.has(t.id),
    );

    const taskIds = tasksData.map((t) => t.id);

    // Fetch boards by the specific IDs referenced in the user's tasks — not all boards.
    // The general SELECT on task_boards is scoped by RLS to boards the user owns,
    // which misses boards they're only assigned tasks on. Fetching by specific IDs
    // works because RLS allows reading a board when you have tasks there.
    const boardIds = [...new Set(tasksData.filter((t) => t.board_id).map((t) => t.board_id!))];

    const [taRes, boardRes, grpRes, countRes] = await Promise.all([
      taskIds.length
        ? supabase.from("manager_task_assignees" as any).select("task_id, user_id").in("task_id", taskIds)
        : Promise.resolve({ data: [] }),
      boardIds.length
        ? supabase.rpc("get_boards_by_ids" as any, { p_board_ids: boardIds })
        : Promise.resolve({ data: [] }),
      supabase.from("task_board_groups" as any).select("id, board_id, name, position"),
      supabase.from("manager_task_updates" as any).select("task_id"),
    ]);

    const taMap: Record<string, string[]> = {};
    ((taRes.data ?? []) as { task_id: string; user_id: string }[]).forEach((r) => {
      if (!taMap[r.task_id]) taMap[r.task_id] = [];
      taMap[r.task_id].push(r.user_id);
    });

    const counts: Record<string, number> = {};
    ((countRes.data ?? []) as { task_id: string }[]).forEach((r) => {
      counts[r.task_id] = (counts[r.task_id] ?? 0) + 1;
    });

    const HIDDEN = new Set(["664c4627-764e-44ff-94ed-d887e3097265"]);
    const rolePriority: Record<string, number> = { admin: 3, manager: 2, rep: 1 };
    const dedupMap = new Map<string, AssignableUser>();
    ((assignableRes.data ?? []) as AssignableUser[])
      .filter((a) => !HIDDEN.has(a.user_id))
      .forEach((a) => {
        const ex = dedupMap.get(a.user_id);
        if (!ex || (rolePriority[a.role] ?? 0) > (rolePriority[ex.role] ?? 0)) dedupMap.set(a.user_id, a);
      });

    setTasks(tasksData);
    setTaskAssigneeMap(taMap);
    setBoards(((boardRes.data ?? []) as unknown) as BoardInfo[]);
    setGroups(((grpRes.data ?? []) as unknown) as GroupInfo[]);
    setProfiles(((profilesRes.data ?? []) as Profile[]));
    setAssignableUsers([...dedupMap.values()]);
    setCommentCounts(counts);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time refresh — patch updates in-place, full reload only for insert/delete
  useEffect(() => {
    const channel = supabase
      .channel("todos-view-tasks")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "manager_tasks" }, (payload) => {
        setTasks((prev) => prev.map((t) => t.id === (payload.new as Task).id ? { ...t, ...(payload.new as Task) } : t));
      })
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "manager_tasks" }, () => load(true))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "manager_tasks" }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const getAssigneeNames = (taskId: string): string[] => {
    const ids = taskAssigneeMap[taskId] ?? [];
    return ids.map((id) => {
      const p = profiles.find((p) => p.user_id === id);
      return p?.full_name?.trim() || assignableUsers.find((u) => u.user_id === id)?.email || id;
    }).filter(Boolean) as string[];
  };

  const getGroupName = (task: Task): string | undefined => {
    if (!task.group_id) return undefined;
    return groups.find((g) => g.id === task.group_id)?.name;
  };

  const boardMap = new Map(boards.map((b) => [b.id, b]));

  // Split tasks
  const standaloneTasks = tasks.filter((t) => !t.board_id);
  const boardTasks = tasks.filter((t) => {
    if (!t.board_id) return false;
    const name = boardMap.get(t.board_id)?.name ?? "";
    return !name.toUpperCase().includes("SOP");
  });

  // Filter function
  const passesFilter = (t: Task): boolean => {
    if (filterTab === "all") return t.status !== "done";
    if (filterTab === "completed") return t.status === "done";
    const bucket = getDueBucket(t.due_date, t.status);
    if (filterTab === "overdue") return bucket === "overdue";
    if (filterTab === "today") return bucket === "today";
    if (filterTab === "upcoming") return bucket === "upcoming";
    return true;
  };

  const filteredStandalone = sortTasks(standaloneTasks.filter(passesFilter));
  const filteredBoardTasks = sortTasks(boardTasks.filter(passesFilter));

  // Group board tasks by board id
  const boardGroups = new Map<string, Task[]>();
  filteredBoardTasks.forEach((t) => {
    const bid = t.board_id!;
    if (!boardGroups.has(bid)) boardGroups.set(bid, []);
    boardGroups.get(bid)!.push(t);
  });

  // Summary counts
  const incomplete = tasks.filter((t) => t.status !== "done");
  const overdueCount = incomplete.filter((t) => getDueBucket(t.due_date, t.status) === "overdue").length;
  const todayCount = incomplete.filter((t) => getDueBucket(t.due_date, t.status) === "today").length;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const toggleDone = async (id: string, done: boolean) => {
    const now = new Date().toISOString();
    const update = done
      ? { status: "done" as Status, completed_at: now }
      : { status: "todo" as Status, completed_at: null };
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...update } : t)));
    await supabase.from("manager_tasks").update(update).eq("id", id);
  };

  const changeStatus = async (id: string, status: Status) => {
    const now = new Date().toISOString();
    const update = {
      status,
      completed_at: status === "done" ? now : null,
    };
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...update } : t)));
    await supabase.from("manager_tasks").update(update).eq("id", id);
  };

  const syncAssignees = async (taskId: string, ids: string[]) => {
    await supabase.from("manager_task_assignees" as any).delete().eq("task_id", taskId);
    if (ids.length > 0) {
      await supabase.from("manager_task_assignees" as any).insert(ids.map((uid) => ({ task_id: taskId, user_id: uid })));
    }
    // Keep legacy field in sync
    await supabase.from("manager_tasks").update({ assigned_user_id: ids[0] ?? null }).eq("id", taskId);
  };

  const quickAdd = async (title: string) => {
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
      .insert({ id: tempId, title: title.trim(), status: "todo", user_id: user.id, visibility: "public" })
      .select("*")
      .single();
    if (error || !data) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      toast({ title: "Create failed", description: error?.message, variant: "destructive" });
    } else {
      setTasks((prev) => prev.map((t) => (t.id === tempId ? (data as Task) : t)));
    }
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      due_date: task.due_date ?? "",
      assigned_user_ids: taskAssigneeMap[task.id] ?? [],
    });
    setPendingFiles([]);
    setDetailTask(null);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingTask || !editForm.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const update = {
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      status: editForm.status,
      due_date: editForm.due_date || null,
      completed_at: editForm.status === "done" ? (editingTask.completed_at ?? new Date().toISOString()) : null,
    };
    setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? { ...t, ...update } : t)));
    await supabase.from("manager_tasks").update(update).eq("id", editingTask.id);
    await syncAssignees(editingTask.id, editForm.assigned_user_ids);
    setTaskAssigneeMap((prev) => ({ ...prev, [editingTask.id]: editForm.assigned_user_ids }));
    if (pendingFiles.length > 0) {
      await uploadPendingAttachments(editingTask.id, pendingFiles);
      setPendingFiles([]);
    }
    setEditOpen(false);
    setEditingTask(null);
    toast({ title: "Saved" });
  };

  const createNew = async () => {
    if (!user || !newForm.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("manager_tasks")
      .insert({
        title: newForm.title.trim(),
        description: newForm.description.trim() || null,
        status: "todo",
        due_date: newForm.due_date || null,
        user_id: user.id,
        visibility: "public",
      })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Create failed", description: error?.message, variant: "destructive" });
      return;
    }
    if (newForm.assigned_user_ids.length > 0) {
      await syncAssignees(data.id, newForm.assigned_user_ids);
    }
    setTasks((prev) => [data as Task, ...prev]);
    setNewForm({ title: "", description: "", due_date: "", assigned_user_ids: [] });
    setNewOpen(false);
    toast({ title: "To Do created" });
  };

  const deleteTask = async (task: Task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    setDeletingTask(null);
    if (detailTask?.id === task.id) setDetailTask(null);
    await supabase.from("manager_tasks").delete().eq("id", task.id);
    toast({ title: "Deleted" });
  };

  // ── Filter tab UI ─────────────────────────────────────────────────────────────

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Due Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <p className="text-sm text-muted-foreground py-6">Loading…</p>;
  }

  const isMine = (task: Task) => task.user_id === user?.id;

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">
            {incomplete.length} incomplete task{incomplete.length !== 1 ? "s" : ""}
          </p>
          {(overdueCount > 0 || todayCount > 0) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {overdueCount > 0 && (
                <span className="text-destructive font-medium">{overdueCount} overdue</span>
              )}
              {overdueCount > 0 && todayCount > 0 && <span className="mx-1">·</span>}
              {todayCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">{todayCount} due today</span>
              )}
            </p>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New To Do
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterTab(key)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              filterTab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Section A: My To Do's (standalone) ── */}
      <div>
        <button
          type="button"
          onClick={() => setTodosCollapsed((v) => !v)}
          className="flex items-center gap-1.5 mb-2 group"
        >
          {todosCollapsed
            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
            My To Do's
          </h3>
          <span className="text-xs text-muted-foreground/60">({filteredStandalone.length})</span>
        </button>
        {!todosCollapsed && <Card className="overflow-hidden">
          {filteredStandalone.length === 0 && filterTab !== "all" ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No tasks match this filter.</p>
          ) : filteredStandalone.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Nothing here yet.{" "}
              <button type="button" className="underline hover:no-underline" onClick={() => setAddingInline(true)}>
                Add your first to do
              </button>
            </p>
          ) : (
            filteredStandalone.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                assigneeNames={getAssigneeNames(task.id)}
                commentCount={commentCounts[task.id] ?? 0}
                onToggle={toggleDone}
                onStatusChange={changeStatus}
                onOpen={setDetailTask}
                onComments={setCommentsTaskId}
              />
            ))
          )}

          {/* Inline quick-add */}
          {addingInline ? (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border/40">
              <Checkbox disabled className="shrink-0 opacity-30" />
              <Input
                ref={inlineRef}
                autoFocus
                value={inlineTitle}
                onChange={(e) => setInlineTitle(e.target.value)}
                placeholder="Task title…"
                className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-0 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    quickAdd(inlineTitle);
                    setInlineTitle("");
                    setAddingInline(false);
                  }
                  if (e.key === "Escape") { setAddingInline(false); setInlineTitle(""); }
                }}
                onBlur={() => {
                  if (inlineTitle.trim()) quickAdd(inlineTitle);
                  setInlineTitle("");
                  setAddingInline(false);
                }}
              />
              <span className="text-[10px] text-muted-foreground shrink-0">↵ to save</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingInline(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border/40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add to do
            </button>
          )}
        </Card>}
      </div>

      {/* ── Section B: Board Tasks (grouped) ── */}
      {boardGroups.size > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setBoardTasksCollapsed((v) => !v)}
            className="flex items-center gap-1.5 mb-2 group"
          >
            {boardTasksCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
              Board Tasks
            </h3>
            <span className="text-xs text-muted-foreground/60">({[...boardGroups.values()].reduce((s, t) => s + t.length, 0)})</span>
          </button>
          {!boardTasksCollapsed && <div className="space-y-3">
            {[...boardGroups.entries()].map(([boardId, boardTaskList]) => {
              const board = boardMap.get(boardId);
              const isCollapsed = collapsedBoards[boardId] ?? false;

              return (
                <Card key={boardId} className="overflow-hidden">
                  {/* Board header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 border-b border-border/50">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedBoards((prev) => ({ ...prev, [boardId]: !isCollapsed }))
                      }
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      {board?.color && (
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: board.color }}
                        />
                      )}
                      <span className="text-sm font-medium truncate">
                        {board?.name ?? "Unknown Board"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({boardTaskList.length})
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Open board"
                      onClick={() => onSwitchToBoards?.(boardId)}
                      className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Board tasks */}
                  {!isCollapsed &&
                    boardTaskList.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        assigneeNames={getAssigneeNames(task.id)}
                        commentCount={commentCounts[task.id] ?? 0}
                        groupName={getGroupName(task)}
                        onToggle={toggleDone}
                        onStatusChange={changeStatus}
                        onOpen={setDetailTask}
                        onComments={setCommentsTaskId}
                      />
                    ))}
                </Card>
              );
            })}
          </div>}
        </div>
      )}

      {/* ── Detail Sheet ── */}
      <Sheet open={!!detailTask} onOpenChange={(o) => { if (!o) setDetailTask(null); }}>
        <SheetContent className="sm:max-w-[520px] overflow-y-auto">
          {detailTask && (() => {
            const t = detailTask;
            const bucket = getDueBucket(t.due_date, t.status);
            const names = getAssigneeNames(t.id);
            const board = t.board_id ? boardMap.get(t.board_id) : null;
            const groupName = getGroupName(t);

            return (
              <>
                <SheetHeader className="mb-5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={t.status === "done"}
                      onCheckedChange={(v) => {
                        toggleDone(t.id, !!v);
                        setDetailTask((prev) =>
                          prev ? { ...prev, status: !!v ? "done" : "todo" } : null,
                        );
                      }}
                      className="mt-0.5 shrink-0"
                    />
                    <SheetTitle className="text-base font-semibold leading-snug flex-1">
                      {t.title}
                    </SheetTitle>
                  </div>
                </SheetHeader>

                <div className="space-y-4 text-sm">
                  {/* Status + due date row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-xs font-medium px-2 py-1 rounded-full", STATUS_COLORS[t.status])}>
                      {STATUS_LABELS[t.status]}
                    </span>
                    {t.due_date && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          bucket === "overdue" && "text-destructive font-semibold",
                          bucket === "today" && "text-amber-600 dark:text-amber-400 font-semibold",
                          (bucket === "upcoming" || bucket === "none") && "text-muted-foreground",
                        )}
                      >
                        {bucket === "overdue" && <AlertTriangle className="h-3 w-3" />}
                        {bucket === "today" && <Clock className="h-3 w-3" />}
                        Due {formatDueDate(t.due_date)}
                      </span>
                    )}
                    {board && (
                      <button
                        type="button"
                        onClick={() => { setDetailTask(null); onSwitchToBoards?.(board.id); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {board.name}
                        {groupName && ` › ${groupName}`}
                      </button>
                    )}
                  </div>

                  {/* Assignees */}
                  {names.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                        Assigned to
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {names.map((name, i) => (
                          <Badge key={i} variant="secondary" className="font-normal">{name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {t.description && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                        Description
                      </p>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-md p-3 border">
                        {t.description}
                      </p>
                    </div>
                  )}

                  <TaskAttachments taskId={t.id} />

                  <div className="flex items-center gap-2 pt-4 border-t">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setCommentsTaskId(t.id)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Comments
                      {(commentCounts[t.id] ?? 0) > 0 && (
                        <span className="ml-1 text-xs">{commentCounts[t.id]}</span>
                      )}
                    </Button>
                    {isMine(t) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive ml-auto"
                        onClick={() => setDeletingTask(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditingTask(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit To Do</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
            />
            <Textarea
              placeholder="Description (optional)"
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={2000}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={editForm.status}
                onValueChange={(v: Status) => setEditForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_LABELS) as [Status, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={editForm.due_date}
                onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <AssigneePicker
              users={assignableUsers}
              selectedIds={editForm.assigned_user_ids}
              onChange={(ids) => setEditForm((f) => ({ ...f, assigned_user_ids: ids }))}
            />
            {editingTask ? (
              <TaskAttachments taskId={editingTask.id} />
            ) : (
              <PendingAttachmentPicker files={pendingFiles} onChange={setPendingFiles} />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New To Do Dialog ── */}
      <Dialog open={newOpen} onOpenChange={(o) => { if (!o) { setNewOpen(false); setNewForm({ title: "", description: "", due_date: "", assigned_user_ids: [] }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New To Do</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Title"
              value={newForm.title}
              onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              onKeyDown={(e) => { if (e.key === "Enter") createNew(); }}
            />
            <Textarea
              placeholder="Description (optional)"
              value={newForm.description}
              onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={2000}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-3">
              <div />
              <Input
                type="date"
                value={newForm.due_date}
                onChange={(e) => setNewForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <AssigneePicker
              users={assignableUsers}
              selectedIds={newForm.assigned_user_ids}
              onChange={(ids) => setNewForm((f) => ({ ...f, assigned_user_ids: ids }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={createNew}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deletingTask} onOpenChange={(o) => { if (!o) setDeletingTask(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">"{deletingTask?.title}"</span>?
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingTask(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingTask && deleteTask(deletingTask)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Comments Dialog ── */}
      <TaskUpdatesDialog
        taskId={commentsTaskId}
        open={!!commentsTaskId}
        onOpenChange={(o) => {
          if (!o) {
            setCommentsTaskId(null);
            load(true);
          }
        }}
        users={assignableUsers.map((a) => ({ user_id: a.user_id, full_name: a.full_name, email: a.email }))}
        onActivityChange={() => load(true)}
      />
    </div>
  );
}
