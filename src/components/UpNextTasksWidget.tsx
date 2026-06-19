import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar, Check, ListChecks, MessageSquarePlus } from "lucide-react";
import { format } from "date-fns";
import { parseDateOnly } from "@/lib/utils";
import { TaskUpdatesDialog } from "@/components/TaskUpdatesDialog";

type Status = "todo" | "in_progress" | "blocked" | "done";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  due_date: string | null;
  assigned_user_id: string | null;
  user_id: string;
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

const COLUMNS: { key: Status; label: string; pillBg: string; pillText: string }[] = [
  { key: "todo", label: "Not Started", pillBg: "bg-foreground/85", pillText: "text-background" },
  { key: "in_progress", label: "In Progress", pillBg: "bg-accent", pillText: "text-accent-foreground" },
  { key: "blocked", label: "Stuck", pillBg: "bg-destructive", pillText: "text-destructive-foreground" },
  { key: "done", label: "Completed", pillBg: "bg-success", pillText: "text-success-foreground" },
];

const initialsOf = (n: string) =>
  n.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export default function UpNextTasksWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});
  const [updateCounts, setUpdateCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [updatesTaskId, setUpdatesTaskId] = useState<string | null>(null);

  const getAssigneeIds = (t: Task): string[] => {
    const ids = new Set<string>(taskAssignees[t.id] ?? []);
    if (t.assigned_user_id) ids.add(t.assigned_user_id);
    return [...ids];
  };

  const assigneeName = (userId: string | null) => {
    if (!userId) return null;
    const a = assignees.find((x) => x.user_id === userId);
    if (a) return a.full_name?.trim() || a.email || "Unknown";
    const p = profiles.find((x) => x.user_id === userId);
    return p?.full_name?.trim() || "Unknown";
  };

  const refreshUpdateCounts = async () => {
    const { data } = await supabase.from("manager_task_updates" as any).select("task_id");
    const counts: Record<string, number> = {};
    ((data ?? []) as unknown as { task_id: string }[]).forEach((r) => {
      counts[r.task_id] = (counts[r.task_id] ?? 0) + 1;
    });
    setUpdateCounts(counts);
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [tasksRes, assigneesRes, profilesRes, taRes] = await Promise.all([
      supabase.from("manager_tasks").select("id,title,description,status,due_date,assigned_user_id,user_id").order("created_at", { ascending: false }),
      supabase.rpc("assignable_users"),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("manager_task_assignees" as any).select("task_id, user_id"),
    ]);
    if (!tasksRes.error) setTasks((tasksRes.data ?? []) as Task[]);
    if (!assigneesRes.error) {
      const HIDDEN = new Set(["664c4627-764e-44ff-94ed-d887e3097265"]);
      const prio: Record<string, number> = { admin: 3, manager: 2, rep: 1 };
      const m = new Map<string, AssignableUser>();
      ((assigneesRes.data ?? []) as AssignableUser[])
        .filter((a) => !HIDDEN.has(a.user_id))
        .forEach((a) => {
          const ex = m.get(a.user_id);
          if (!ex || (prio[a.role] ?? 0) > (prio[ex.role] ?? 0)) m.set(a.user_id, a);
        });
      setAssignees([...m.values()]);
    }
    if (!profilesRes.error) setProfiles((profilesRes.data ?? []) as Profile[]);
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

  const updateStatus = async (id: string, status: Status) => {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    const { error } = await supabase.from("manager_tasks").update({ status }).eq("id", id);
    if (error) {
      setTasks(prev);
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    }
  };

  const updateTaskDueDate = async (id: string, d: Date | null) => {
    const due_date = d ? format(d, "yyyy-MM-dd") : null;
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, due_date } : t)));
    const { error } = await supabase.from("manager_tasks").update({ due_date }).eq("id", id);
    if (error) {
      setTasks(prev);
      toast({ title: "Date update failed", variant: "destructive" });
    }
  };

  const setTaskAssigneesInline = async (taskId: string, userIds: string[]) => {
    const prev = taskAssignees;
    setTaskAssignees((m) => ({ ...m, [taskId]: userIds }));
    const { error: delErr } = await supabase.from("manager_task_assignees" as any).delete().eq("task_id", taskId);
    if (delErr) {
      setTaskAssignees(prev);
      toast({ title: "Assignee update failed", variant: "destructive" });
      return;
    }
    if (userIds.length > 0) {
      const rows = userIds.map((uid) => ({ task_id: taskId, user_id: uid }));
      const { error: insErr } = await supabase.from("manager_task_assignees" as any).insert(rows as any);
      if (insErr) {
        setTaskAssignees(prev);
        toast({ title: "Assignee update failed", variant: "destructive" });
      }
    }
  };

  // Filter to "my" tasks (created by me or assigned to me), not done, then sort by due date asc nulls last
  const myUpcoming = tasks
    .filter((t) => {
      if (!user) return false;
      if (t.status === "done") return false;
      return t.user_id === user.id || getAssigneeIds(t).includes(user.id);
    })
    .sort((a, b) => {
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    })
    .slice(0, 7);

  return (
    <div className="glass-card p-4 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-accent" /> Up Next
        </h3>
        <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground underline">
          View all
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : myUpcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming tasks.</p>
      ) : (
        <div className="rounded-md overflow-hidden border border-border shadow-sm border-l-[6px] border-l-primary bg-card">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[28px_minmax(0,1fr)_44px_140px_140px_120px] items-center bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold border-b border-border">
            <div className="border-r border-border h-full" />
            <div className="px-3 py-1.5 border-r border-border">Task</div>
            <div className="px-1 py-1.5 text-center border-r border-border" />
            <div className="px-2 py-1.5 text-center border-r border-border">Responsible</div>
            <div className="px-2 py-1.5 text-center border-r border-border">Status</div>
            <div className="px-2 py-1.5 text-center">Due date</div>
          </div>

          <ul>
            {myUpcoming.map((t) => {
              const col = COLUMNS.find((c) => c.key === t.status) ?? COLUMNS[0];
              const ownerIds = getAssigneeIds(t);
              const owners = ownerIds.map((uid) => ({ id: uid, name: assigneeName(uid) ?? "Unknown" }));
              const assignedToMe = !!user && t.user_id !== user.id && ownerIds.includes(user.id);
              const isOverdue = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()) && t.status !== "done";

              return (
                <li
                  key={t.id}
                  className="grid grid-cols-[28px_minmax(0,1fr)_44px] md:grid-cols-[28px_minmax(0,1fr)_44px_140px_140px_120px] items-stretch hover:bg-muted/30 transition-colors border-b border-border last:border-b-0 bg-card"
                >
                  {/* Complete checkbox */}
                  <div className="flex items-center justify-center text-muted-foreground/40 border-r border-border">
                    <Checkbox
                      checked={t.status === "done"}
                      onCheckedChange={(v) => updateStatus(t.id, v ? "done" : "todo")}
                      aria-label="Mark complete"
                      className="h-4 w-4"
                    />
                  </div>

                  {/* Title */}
                  <div className="px-3 py-2 min-w-0 text-left border-r border-border">
                    <p className="text-sm leading-snug break-words">{t.title}</p>
                    {t.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.description}</p>
                    )}
                    {assignedToMe && (
                      <p className="text-[11px] text-primary mt-0.5 font-medium">Assigned to you</p>
                    )}
                  </div>

                  {/* Updates */}
                  <div className="flex items-center justify-center border-r border-border">
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

                  {/* Responsible */}
                  <div className="hidden md:flex items-center justify-center px-2 border-r border-border">
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

                  {/* Status pill */}
                  <div className="hidden md:flex items-stretch border-r border-border">
                    <Select value={t.status} onValueChange={(v: Status) => updateStatus(t.id, v)}>
                      <SelectTrigger
                        className={`h-auto w-full rounded-none border-0 ${col.pillBg} ${col.pillText} text-xs font-semibold justify-center gap-1 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden hover:opacity-90`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((c) => (
                          <SelectItem key={c.key} value={c.key} className="text-xs">
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Due date */}
                  <div className="hidden md:flex items-stretch">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className={`flex w-full h-full items-center justify-center gap-1 px-2 text-xs hover:bg-muted/40 ${
                            isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {t.due_date ? (
                            <>
                              <Calendar className="h-3 w-3" />
                              {format(parseDateOnly(t.due_date)!, "MMM d")}
                            </>
                          ) : (
                            <span className="italic">-</span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center">
                        <CalendarPicker
                          mode="single"
                          selected={t.due_date ? parseDateOnly(t.due_date)! : undefined}
                          onSelect={(d) => updateTaskDueDate(t.id, d ?? null)}
                          initialFocus
                        />
                        {t.due_date && (
                          <div className="p-2 border-t">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-xs"
                              onClick={() => updateTaskDueDate(t.id, null)}
                            >
                              Clear date
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Mobile meta */}
                  <div className="md:hidden col-start-2 px-3 pb-2 -mt-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${col.pillBg} ${col.pillText}`}>
                      {col.label}
                    </span>
                    {t.due_date && (
                      <span className={`inline-flex items-center gap-1 text-[11px] ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        <Calendar className="h-3 w-3" />
                        {format(parseDateOnly(t.due_date)!, "MMM d")}
                        {isOverdue ? " · Overdue" : ""}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <TaskUpdatesDialog
        taskId={updatesTaskId}
        open={!!updatesTaskId}
        onOpenChange={(v) => !v && setUpdatesTaskId(null)}
        users={assignees}
        onActivityChange={refreshUpdateCounts}
      />
    </div>
  );
}
