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
import { Plus, Trash2, Pencil, Calendar, User, Bell, Check, CheckCheck } from "lucide-react";
import { format } from "date-fns";

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

const COLUMNS: { key: Status; label: string; tone: string }[] = [
  { key: "todo", label: "Todo", tone: "border-muted-foreground/30" },
  { key: "in_progress", label: "In Progress", tone: "border-primary/40" },
  { key: "blocked", label: "Blocked", tone: "border-destructive/40" },
  { key: "done", label: "Done", tone: "border-success/40" },
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
    assigned_user_id: string;
  }>({ title: "", description: "", status: "todo", due_date: "", assigned_user_id: "" });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [tasksRes, assigneesRes, profilesRes] = await Promise.all([
      supabase.from("manager_tasks").select("*").order("created_at", { ascending: false }),
      supabase.rpc("assignable_users"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);
    if (tasksRes.error) {
      toast({ title: "Failed to load tasks", description: tasksRes.error.message, variant: "destructive" });
    } else {
      setTasks((tasksRes.data ?? []) as Task[]);
    }
    if (assigneesRes.error) {
      toast({ title: "Failed to load assignees", description: assigneesRes.error.message, variant: "destructive" });
    } else {
      setAssignees((assigneesRes.data ?? []) as AssignableUser[]);
    }
    if (!profilesRes.error) {
      setProfiles((profilesRes.data ?? []) as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const resetForm = () => {
    setEditing(null);
    setForm({ title: "", description: "", status: "todo", due_date: "", assigned_user_id: "" });
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
      assigned_user_id: t.assigned_user_id ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      due_date: form.due_date || null,
      assigned_user_id: form.assigned_user_id || null,
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
    } else {
      const { error } = await supabase
        .from("manager_tasks")
        .insert({ ...payload, user_id: user.id });
      if (error) {
        toast({ title: "Create failed", description: error.message, variant: "destructive" });
        return;
      }
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
              <Select
                value={form.assigned_user_id || "unassigned"}
                onValueChange={(v) => setForm({ ...form, assigned_user_id: v === "unassigned" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {Array.from(
                    new Map(assignees.map((a) => [a.user_id, a])).values(),
                  )
                    .sort((a, b) =>
                      (a.full_name?.trim() || a.email || "").localeCompare(
                        b.full_name?.trim() || b.email || "",
                      ),
                    )
                    .map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id}>
                        {a.full_name?.trim() || a.email || "Unknown"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
          (t) => t.user_id !== user.id && t.assigned_user_id === user.id && t.status !== "done",
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </h2>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {items.map((t) => (
                    <Card key={t.id} className={`p-3 border-l-4 ${col.tone}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm leading-snug break-words">{t.title}</p>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                              {t.description}
                            </p>
                          )}
                          {t.due_date && (
                            <p className="text-[11px] text-muted-foreground mt-2 inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(t.due_date), "MMM d")}
                            </p>
                          )}
                          {t.assigned_user_id && (
                            <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1 ml-2">
                              <User className="h-3 w-3" />
                              {assigneeName(t.assigned_user_id)}
                            </p>
                          )}
                          {user && t.user_id !== user.id && t.assigned_user_id === user.id && (
                            <p className="text-[11px] text-primary mt-1 font-medium">Assigned to you</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {user && t.user_id === user.id && (
                            <>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(t)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(t.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <Select value={t.status} onValueChange={(v: Status) => updateStatus(t.id, v)}>
                        <SelectTrigger className="h-7 text-xs mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLUMNS.map((c) => (
                            <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Card>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground italic px-1">No tasks</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
