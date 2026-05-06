import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  LayoutGrid,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Calendar,
  GripVertical,
  UserPlus,
  X,
} from "lucide-react";
import { format } from "date-fns";

type Status = "todo" | "in_progress" | "blocked" | "done";

const STATUS_META: Record<Status, { label: string; pillBg: string; pillText: string }> = {
  todo: { label: "Not Started", pillBg: "bg-foreground/85", pillText: "text-background" },
  in_progress: { label: "In Progress", pillBg: "bg-accent", pillText: "text-accent-foreground" },
  blocked: { label: "Stuck", pillBg: "bg-destructive", pillText: "text-destructive-foreground" },
  done: { label: "Completed", pillBg: "bg-success", pillText: "text-success-foreground" },
};

const GROUP_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
];

interface Board {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_by: string;
}

interface Group {
  id: string;
  board_id: string;
  name: string;
  color: string | null;
  position: number;
}

interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  due_date: string | null;
  board_id: string | null;
  group_id: string | null;
  user_id: string;
  assigned_user_id: string | null;
}

export default function TaskBoardsView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [boards, setBoards] = useState<Board[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [boardDlgOpen, setBoardDlgOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [boardForm, setBoardForm] = useState({ name: "", description: "", color: GROUP_COLORS[0] });

  const [groupDlgOpen, setGroupDlgOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", color: GROUP_COLORS[0] });

  const [taskDlgOpen, setTaskDlgOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<BoardTask | null>(null);
  const [taskForm, setTaskForm] = useState<{
    title: string;
    description: string;
    status: Status;
    due_date: string;
    group_id: string | null;
  }>({ title: "", description: "", status: "todo", due_date: "", group_id: null });

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // members / subscribers
  const [shareDlgOpen, setShareDlgOpen] = useState(false);
  const [members, setMembers] = useState<{ user_id: string }[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [addUserId, setAddUserId] = useState<string>("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [bRes, gRes, tRes] = await Promise.all([
      supabase.from("task_boards" as any).select("*").order("created_at", { ascending: true }),
      supabase.from("task_board_groups" as any).select("*").order("position", { ascending: true }),
      supabase
        .from("manager_tasks")
        .select("id,title,description,status,due_date,board_id,group_id,user_id,assigned_user_id")
        .not("board_id", "is", null),
    ]);
    if (!bRes.error) {
      const list = (bRes.data ?? []) as unknown as Board[];
      setBoards(list);
      if (!activeBoardId && list.length > 0) setActiveBoardId(list[0].id);
    } else {
      toast({ title: "Failed to load boards", description: bRes.error.message, variant: "destructive" });
    }
    if (!gRes.error) setGroups((gRes.data ?? []) as unknown as Group[]);
    if (!tRes.error) setTasks((tRes.data ?? []) as unknown as BoardTask[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const isBoardOwner = !!user && !!activeBoard && activeBoard.created_by === user.id;
  const boardGroups = useMemo(
    () => groups.filter((g) => g.board_id === activeBoardId).sort((a, b) => a.position - b.position),
    [groups, activeBoardId],
  );
  const boardTasks = useMemo(
    () => tasks.filter((t) => t.board_id === activeBoardId),
    [tasks, activeBoardId],
  );

  // --- Board CRUD ---
  const openNewBoard = () => {
    setEditingBoard(null);
    setBoardForm({ name: "", description: "", color: GROUP_COLORS[0] });
    setBoardDlgOpen(true);
  };
  const openEditBoard = (b: Board) => {
    setEditingBoard(b);
    setBoardForm({ name: b.name, description: b.description ?? "", color: b.color ?? GROUP_COLORS[0] });
    setBoardDlgOpen(true);
  };
  const saveBoard = async () => {
    if (!user || !boardForm.name.trim()) {
      toast({ title: "Board name is required", variant: "destructive" });
      return;
    }
    if (editingBoard) {
      const { error } = await supabase
        .from("task_boards" as any)
        .update({
          name: boardForm.name.trim(),
          description: boardForm.description.trim() || null,
          color: boardForm.color,
        })
        .eq("id", editingBoard.id);
      if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      const { data, error } = await supabase
        .from("task_boards" as any)
        .insert({
          name: boardForm.name.trim(),
          description: boardForm.description.trim() || null,
          color: boardForm.color,
        })
        .select("id")
        .single();
      if (error || !data) return toast({ title: "Create failed", description: error?.message, variant: "destructive" });
      // seed default groups
      const newId = (data as any).id as string;
      await supabase.from("task_board_groups" as any).insert([
        { board_id: newId, name: "To Do", color: "#6366f1", position: 0 },
        { board_id: newId, name: "In Progress", color: "#f59e0b", position: 1 },
        { board_id: newId, name: "Stuck", color: "#ef4444", position: 2 },
        { board_id: newId, name: "Done", color: "#10b981", position: 3 },
      ]);
      setActiveBoardId(newId);
    }
    setBoardDlgOpen(false);
    load();
  };
  const deleteBoard = async (b: Board) => {
    if (!confirm(`Delete board "${b.name}"? Tasks will remain in My Tasks but lose board association.`)) return;
    const { error } = await supabase.from("task_boards" as any).delete().eq("id", b.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    if (activeBoardId === b.id) setActiveBoardId(null);
    load();
  };

  // --- Members / Subscribers ---
  const openShareDialog = async () => {
    if (!activeBoardId) return;
    setAddUserId("");
    setShareDlgOpen(true);
    const [mRes, uRes] = await Promise.all([
      supabase.from("task_board_members" as any).select("user_id").eq("board_id", activeBoardId),
      supabase.rpc("assignable_users"),
    ]);
    if (!mRes.error) setMembers((mRes.data ?? []) as any);
    if (!uRes.error) setAssignableUsers((uRes.data ?? []) as any);
  };
  const addMember = async () => {
    if (!activeBoardId || !user || !addUserId || !activeBoard) return;
    const { error } = await supabase
      .from("task_board_members" as any)
      .insert({ board_id: activeBoardId, user_id: addUserId, added_by: user.id });
    if (error) return toast({ title: "Failed to add subscriber", description: error.message, variant: "destructive" });
    setMembers((m) => [...m, { user_id: addUserId }]);

    // In-app notification
    const recipient = assignableUsers.find((u) => u.user_id === addUserId);
    const inviter = assignableUsers.find((u) => u.user_id === user.id);
    const inviterName = inviter?.full_name || inviter?.email || "A teammate";
    await supabase.from("notifications").insert({
      user_id: addUserId,
      type: "board_subscribed",
      title: `${inviterName} added you to a board`,
      body: activeBoard.name,
      link: "/tasks",
      related_id: activeBoardId,
    });

    // Email notification
    if (recipient?.email) {
      supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "board-subscribed",
          recipientEmail: recipient.email,
          idempotencyKey: `board-sub-${activeBoardId}-${addUserId}-${Date.now()}`,
          templateData: {
            recipientName: recipient.full_name || undefined,
            inviterName,
            boardName: activeBoard.name,
            boardDescription: activeBoard.description || undefined,
            link: `${window.location.origin}/tasks`,
          },
        },
      }).catch(() => {});
    }

    setAddUserId("");
    toast({ title: "Subscriber added", description: recipient?.email ? "Email invite sent." : undefined });
  };
  const removeMember = async (uid: string) => {
    if (!activeBoardId) return;
    const { error } = await supabase
      .from("task_board_members" as any)
      .delete()
      .eq("board_id", activeBoardId)
      .eq("user_id", uid);
    if (error) return toast({ title: "Remove failed", description: error.message, variant: "destructive" });
    setMembers((m) => m.filter((x) => x.user_id !== uid));
  };

  // --- Group CRUD ---
  const openNewGroup = () => {
    setEditingGroup(null);
    setGroupForm({ name: "", color: GROUP_COLORS[boardGroups.length % GROUP_COLORS.length] });
    setGroupDlgOpen(true);
  };
  const openEditGroup = (g: Group) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, color: g.color ?? GROUP_COLORS[0] });
    setGroupDlgOpen(true);
  };
  const saveGroup = async () => {
    if (!activeBoardId || !groupForm.name.trim()) return;
    if (editingGroup) {
      const { error } = await supabase
        .from("task_board_groups" as any)
        .update({ name: groupForm.name.trim(), color: groupForm.color })
        .eq("id", editingGroup.id);
      if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("task_board_groups" as any).insert({
        board_id: activeBoardId,
        name: groupForm.name.trim(),
        color: groupForm.color,
        position: boardGroups.length,
      });
      if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
    }
    setGroupDlgOpen(false);
    load();
  };
  const deleteGroup = async (g: Group) => {
    if (!confirm(`Delete group "${g.name}"? Tasks will move out of this group.`)) return;
    const { error } = await supabase.from("task_board_groups" as any).delete().eq("id", g.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  };

  // --- Task CRUD ---
  const openNewTask = (groupId: string | null) => {
    setEditingTask(null);
    setTaskForm({ title: "", description: "", status: "todo", due_date: "", group_id: groupId });
    setTaskDlgOpen(true);
  };
  const openEditTask = (t: BoardTask) => {
    setEditingTask(t);
    setTaskForm({
      title: t.title,
      description: t.description ?? "",
      status: t.status,
      due_date: t.due_date ?? "",
      group_id: t.group_id,
    });
    setTaskDlgOpen(true);
  };
  const saveTask = async () => {
    if (!user || !activeBoardId || !taskForm.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const payload: any = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      status: taskForm.status,
      due_date: taskForm.due_date || null,
      board_id: activeBoardId,
      group_id: taskForm.group_id,
    };
    if (editingTask) {
      const { error } = await supabase.from("manager_tasks").update(payload).eq("id", editingTask.id);
      if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase
        .from("manager_tasks")
        .insert({ ...payload, user_id: user.id });
      if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
    }
    setTaskDlgOpen(false);
    load();
  };
  const deleteTask = async (t: BoardTask) => {
    const { error } = await supabase.from("manager_tasks").delete().eq("id", t.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  };
  const findGroupForStatus = (boardId: string | null, status: Status): string | null => {
    if (!boardId) return null;
    const candidates = groups.filter((g) => g.board_id === boardId);
    const match = candidates.find((g) => inferStatusFromGroupName(g.name) === status);
    return match?.id ?? null;
  };
  const updateTaskStatus = async (id: string, status: Status) => {
    const prev = tasks;
    const task = tasks.find((t) => t.id === id);
    const targetGroupId = task ? findGroupForStatus(task.board_id, status) : null;
    const shouldMove = targetGroupId && task && task.group_id !== targetGroupId;

    setTasks((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, status, ...(shouldMove ? { group_id: targetGroupId } : {}) } : t,
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
  const inferStatusFromGroupName = (name: string | undefined): Status | null => {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    if (/(^|\b)(done|complete|completed|finished)\b/.test(n)) return "done";
    if (/(in[\s-]?progress|in[\s-]?motion|doing|working|wip)/.test(n)) return "in_progress";
    if (/(block|stuck|hold|waiting)/.test(n)) return "blocked";
    if (/(to[\s-]?do|todo|backlog|not[\s-]?started|new)/.test(n)) return "todo";
    return null;
  };
  const moveTaskToGroup = async (id: string, group_id: string | null) => {
    const prev = tasks;
    const targetGroup = group_id ? groups.find((g) => g.id === group_id) : null;
    const inferred = inferStatusFromGroupName(targetGroup?.name);
    const task = tasks.find((t) => t.id === id);
    const newStatus = inferred && task && task.status !== inferred ? inferred : null;

    setTasks((ts) =>
      ts.map((t) => (t.id === id ? { ...t, group_id, ...(newStatus ? { status: newStatus } : {}) } : t)),
    );
    const payload: any = { group_id };
    if (newStatus) payload.status = newStatus;
    const { error } = await supabase.from("manager_tasks").update(payload).eq("id", id);
    if (error) {
      setTasks(prev);
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
    }
  };

  // drag-and-drop
  const onDropToGroup = (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task-id");
    if (id) moveTaskToGroup(id, groupId);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading boards…</p>;

  return (
    <div className="space-y-4">
      {/* Board tabs */}
      <Card className="p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => setActiveBoardId(b.id)}
              className={`group/tab inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeBoardId === b.id
                  ? "bg-foreground text-background"
                  : "hover:bg-muted text-foreground/80"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: b.color ?? "#6366f1" }}
              />
              {b.name}
            </button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1"
            onClick={openNewBoard}
          >
            <Plus className="h-3.5 w-3.5" /> New board
          </Button>
        </div>
      </Card>

      {!activeBoard ? (
        <Card className="p-10 text-center">
          <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold mb-1">No board selected</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first board to organize tasks.
          </p>
          <Button onClick={openNewBoard}>
            <Plus className="h-4 w-4" /> Create board
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Board header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: activeBoard.color ?? "#6366f1" }}
                />
                <h2 className="font-serif text-xl leading-tight">{activeBoard.name}</h2>
              </div>
              {activeBoard.description && (
                <p className="text-sm text-muted-foreground mt-1">{activeBoard.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={openShareDialog}>
                <UserPlus className="h-3.5 w-3.5" /> Share
              </Button>
              {isBoardOwner && (
                <>
                  <Button size="sm" variant="outline" onClick={openNewGroup}>
                    <Plus className="h-3.5 w-3.5" /> Add group
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEditBoard(activeBoard)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteBoard(activeBoard)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Groups */}
          <div className="divide-y">
            {boardGroups.length === 0 && (
              <div className="p-6 text-sm italic text-muted-foreground">
                No groups yet. {isBoardOwner && "Click \"Add group\" to create one."}
              </div>
            )}
            {boardGroups.map((g) => {
              const items = boardTasks.filter((t) => t.group_id === g.id);
              const isCollapsed = collapsed[g.id];
              return (
                <div
                  key={g.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropToGroup(e, g.id)}
                >
                  {/* Group header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60"
                    style={{ backgroundColor: `${g.color ?? "#6366f1"}14` }}
                  >
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: g.color ?? "#6366f1" }}
                    />
                    <h3 className="text-sm font-semibold" style={{ color: g.color ?? undefined }}>
                      {g.name}
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openNewTask(g.id)}>
                      <Plus className="h-3.5 w-3.5" /> Item
                    </Button>
                  </div>

                  {/* Group rows */}
                  {!isCollapsed && (
                    <>
                      {/* column header */}
                      <div className="hidden md:grid grid-cols-[24px_minmax(0,1fr)_140px_140px_60px] items-center gap-0 bg-muted/20 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <div />
                        <div className="px-2">Task</div>
                        <div className="px-2">Status</div>
                        <div className="px-2">Due date</div>
                        <div />
                      </div>
                      {items.length === 0 ? (
                        <div className="px-4 py-3 text-xs italic text-muted-foreground/70">
                          Drag tasks here or click "+ Item".
                        </div>
                      ) : (
                        <ul className="divide-y">
                          {items.map((t) => {
                            const meta = STATUS_META[t.status];
                            const isMine = !!user && t.user_id === user.id;
                            return (
                              <li
                                key={t.id}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                                className="grid grid-cols-[24px_minmax(0,1fr)] md:grid-cols-[24px_minmax(0,1fr)_140px_140px_60px] items-center hover:bg-muted/40 cursor-grab active:cursor-grabbing"
                              >
                                <div className="flex items-center justify-center text-muted-foreground/40">
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                                <div className="px-2 py-2 min-w-0">
                                  <p className="text-sm font-medium leading-snug break-words">{t.title}</p>
                                  {t.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                      {t.description}
                                    </p>
                                  )}
                                </div>
                                <div className="hidden md:flex items-center px-2">
                                  <Select
                                    value={t.status}
                                    onValueChange={(v: Status) => updateTaskStatus(t.id, v)}
                                  >
                                    <SelectTrigger
                                      className={`h-7 px-3 text-xs font-semibold border-0 ${meta.pillBg} ${meta.pillText} rounded-md w-full justify-center gap-1 shadow-sm`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(Object.keys(STATUS_META) as Status[]).map((s) => (
                                        <SelectItem key={s} value={s} className="text-xs">
                                          {STATUS_META[s].label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="hidden md:flex items-center px-2 text-xs text-muted-foreground">
                                  {t.due_date ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(t.due_date), "MMM d")}
                                    </span>
                                  ) : (
                                    <span className="italic">—</span>
                                  )}
                                </div>
                                <div className="hidden md:flex items-center justify-end gap-0.5 px-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => openEditTask(t)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  {isMine && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => deleteTask(t)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                                {/* mobile meta */}
                                <div className="md:hidden col-start-2 px-2 pb-2 -mt-1 flex flex-wrap items-center gap-2">
                                  <Badge className={`${meta.pillBg} ${meta.pillText} border-0 text-[10px]`}>
                                    {meta.label}
                                  </Badge>
                                  {t.due_date && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(t.due_date), "MMM d")}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Board dialog */}
      <Dialog open={boardDlgOpen} onOpenChange={setBoardDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingBoard ? "Edit board" : "New board"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Board name"
              value={boardForm.name}
              onChange={(e) => setBoardForm({ ...boardForm, name: e.target.value })}
            />
            <Textarea
              placeholder="Description (optional)"
              value={boardForm.description}
              onChange={(e) => setBoardForm({ ...boardForm, description: e.target.value })}
            />
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Color</p>
              <div className="flex flex-wrap gap-1.5">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setBoardForm({ ...boardForm, color: c })}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      boardForm.color === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBoardDlgOpen(false)}>Cancel</Button>
            <Button onClick={saveBoard}>{editingBoard ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group dialog */}
      <Dialog open={groupDlgOpen} onOpenChange={setGroupDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingGroup ? "Edit group" : "New group"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Group name (e.g. To Do, Q1 Goals)"
              value={groupForm.name}
              onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
            />
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Color</p>
              <div className="flex flex-wrap gap-1.5">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setGroupForm({ ...groupForm, color: c })}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      groupForm.color === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGroupDlgOpen(false)}>Cancel</Button>
            <Button onClick={saveGroup}>{editingGroup ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task dialog */}
      <Dialog open={taskDlgOpen} onOpenChange={setTaskDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingTask ? "Edit task" : "New task"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            />
            <Textarea
              placeholder="Description"
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
            />
            <Input
              type="date"
              value={taskForm.due_date}
              onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
            />
            <Select
              value={taskForm.group_id ?? ""}
              onValueChange={(v) => setTaskForm({ ...taskForm, group_id: v || null })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                {boardGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskDlgOpen(false)}>Cancel</Button>
            <Button onClick={saveTask}>{editingTask ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share / subscribers dialog */}
      <Dialog open={shareDlgOpen} onOpenChange={setShareDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Share board</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Subscribers can view this board and add tasks to it.
          </p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a person to add…" />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers
                    .filter((u) => u.user_id !== user?.id && !members.some((m) => m.user_id === u.user_id))
                    .map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.full_name || u.email || u.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={addMember} disabled={!addUserId}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Subscribers ({members.length})
              </p>
              {members.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No subscribers yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {members.map((m) => {
                    const u = assignableUsers.find((x) => x.user_id === m.user_id);
                    return (
                      <li
                        key={m.user_id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <span className="text-sm">
                          {u?.full_name || u?.email || m.user_id.slice(0, 8)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => removeMember(m.user_id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShareDlgOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
