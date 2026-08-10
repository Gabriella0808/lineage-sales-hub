import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Layers, Trash2, Pencil, LayoutTemplate, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BoardTemplate {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_builtin: boolean;
  created_by: string;
  created_at: string;
  archived_at: string | null;
}

interface TemplateGroup {
  id: string;
  template_id: string;
  name: string;
  color: string | null;
  position: number;
}

interface TemplateTask {
  id: string;
  template_id: string;
  group_id: string | null;
  title: string;
  description: string | null;
  position: number;
}

export interface BoardTemplatesViewProps {
  onBoardCreated?: (boardId: string) => void;
}

// ─── Template colour palette ─────────────────────────────────────────────────

const COLOURS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupsForTemplate(groups: TemplateGroup[], templateId: string): TemplateGroup[] {
  return groups.filter((g) => g.template_id === templateId).sort((a, b) => a.position - b.position);
}

function tasksForGroup(tasks: TemplateTask[], groupId: string): TemplateTask[] {
  return tasks.filter((t) => t.group_id === groupId).sort((a, b) => a.position - b.position);
}

function tasksUngrouped(tasks: TemplateTask[], templateId: string): TemplateTask[] {
  return tasks.filter((t) => t.template_id === templateId && !t.group_id).sort((a, b) => a.position - b.position);
}

// ─── Template card ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: BoardTemplate;
  groups: TemplateGroup[];
  tasks: TemplateTask[];
  canEdit: boolean;
  onUse: (t: BoardTemplate) => void;
  onEdit: (t: BoardTemplate) => void;
  onDuplicate: (t: BoardTemplate) => void;
  onArchive: (t: BoardTemplate) => void;
}

function TemplateCard({ template, groups, tasks, canEdit, onUse, onEdit, onDuplicate, onArchive }: TemplateCardProps) {
  const tmplGroups = groupsForTemplate(groups, template.id);
  const totalTasks = tasks.filter((t) => t.template_id === template.id).length;

  return (
    <Card className="flex flex-col gap-0 overflow-hidden hover:shadow-md transition-shadow">
      {/* Colour stripe */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: template.color ?? "#94a3b8" }}
      />

      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold leading-snug truncate">{template.name}</h3>
              {template.is_builtin && (
                <Badge variant="secondary" className="text-[10px] font-medium shrink-0">Built-in</Badge>
              )}
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onUse(template)}>
                <Layers className="h-3.5 w-3.5 mr-2" /> Use template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(template)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEdit(template)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                  </DropdownMenuItem>
                  {!template.is_builtin && (
                    <DropdownMenuItem
                      onClick={() => onArchive(template)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{tmplGroups.length} group{tmplGroups.length !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{totalTasks} task{totalTasks !== 1 ? "s" : ""}</span>
        </div>

        {/* Group preview */}
        {tmplGroups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tmplGroups.slice(0, 5).map((g) => (
              <span
                key={g.id}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {g.name}
              </span>
            ))}
            {tmplGroups.length > 5 && (
              <span className="text-[10px] text-muted-foreground">+{tmplGroups.length - 5} more</span>
            )}
          </div>
        )}

        <Button
          size="sm"
          className="mt-auto w-full"
          onClick={() => onUse(template)}
        >
          Use Template
        </Button>
      </div>
    </Card>
  );
}

// ─── Template editor (create / edit) ─────────────────────────────────────────

interface GroupDraft {
  id: string; // temp id or real id
  name: string;
  color: string | null;
  tasks: TaskDraft[];
}

interface TaskDraft {
  id: string;
  title: string;
}

function makeGroupDraft(name = "", tasks: TaskDraft[] = []): GroupDraft {
  return { id: crypto.randomUUID(), name, color: null, tasks };
}

function makeTaskDraft(title = ""): TaskDraft {
  return { id: crypto.randomUUID(), title };
}

interface TemplateEditorProps {
  template: BoardTemplate | null; // null = create new
  existingGroups: TemplateGroup[];
  existingTasks: TemplateTask[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function TemplateEditor({ template, existingGroups, existingTasks, open, onClose, onSaved }: TemplateEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOURS[0]);
  const [groups, setGroups] = useState<GroupDraft[]>([makeGroupDraft("To Do"), makeGroupDraft("In Progress"), makeGroupDraft("Done")]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name);
      setDescription(template.description ?? "");
      setColor(template.color ?? COLOURS[0]);
      const tmplGroups = existingGroups
        .filter((g) => g.template_id === template.id)
        .sort((a, b) => a.position - b.position);
      setGroups(
        tmplGroups.map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          tasks: existingTasks
            .filter((t) => t.group_id === g.id)
            .sort((a, b) => a.position - b.position)
            .map((t) => ({ id: t.id, title: t.title })),
        })),
      );
    } else {
      setName("");
      setDescription("");
      setColor(COLOURS[0]);
      setGroups([makeGroupDraft("To Do"), makeGroupDraft("In Progress"), makeGroupDraft("Done")]);
    }
  }, [open, template, existingGroups, existingTasks]);

  const addGroup = () => setGroups((prev) => [...prev, makeGroupDraft()]);
  const removeGroup = (id: string) => setGroups((prev) => prev.filter((g) => g.id !== id));
  const updateGroup = (id: string, patch: Partial<GroupDraft>) =>
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const addTask = (groupId: string) =>
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, tasks: [...g.tasks, makeTaskDraft()] } : g)),
    );
  const removeTask = (groupId: string, taskId: string) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) } : g,
      ),
    );
  const updateTask = (groupId: string, taskId: string, title: string) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, title } : t)) }
          : g,
      ),
    );

  const save = async () => {
    if (!user || !name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      let templateId = template?.id;

      if (template) {
        // Update existing
        await supabase
          .from("board_templates" as any)
          .update({ name: name.trim(), description: description.trim() || null, color })
          .eq("id", template.id);

        // Delete old groups (cascade deletes tasks)
        await supabase.from("board_template_groups" as any).delete().eq("template_id", template.id);
      } else {
        // Create new
        const { data, error } = await supabase
          .from("board_templates" as any)
          .insert({ name: name.trim(), description: description.trim() || null, color, created_by: user.id })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("Failed to create template");
        templateId = (data as { id: string }).id;
      }

      // Insert groups + tasks
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (!g.name.trim()) continue;
        const { data: grpData } = await supabase
          .from("board_template_groups" as any)
          .insert({ template_id: templateId, name: g.name.trim(), color: g.color, position: gi })
          .select("id")
          .single();
        const grpId = (grpData as { id: string } | null)?.id;
        if (!grpId) continue;

        const validTasks = g.tasks.filter((t) => t.title.trim());
        if (validTasks.length > 0) {
          await supabase.from("board_template_tasks" as any).insert(
            validTasks.map((t, ti) => ({
              template_id: templateId,
              group_id: grpId,
              title: t.title.trim(),
              position: ti,
            })),
          );
        }
      }

      toast({ title: template ? "Template updated" : "Template created" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + description */}
          <Input
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
          />

          {/* Colour picker */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Color</p>
            <div className="flex gap-2 flex-wrap">
              {COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform",
                    color === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Groups */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Groups & Tasks
            </p>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.id} className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Group name"
                      value={g.name}
                      onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                      className="h-7 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeGroup(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="space-y-1.5 pl-2">
                    {g.tasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-1.5">
                        <div className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                        <Input
                          placeholder="Task title"
                          value={t.title}
                          onChange={(e) => updateTask(g.id, t.id, e.target.value)}
                          className="h-6 text-xs flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:bg-background/60 px-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeTask(g.id, t.id)}
                          className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addTask(g.id)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors pl-2"
                    >
                      <Plus className="h-3 w-3" /> Add task
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addGroup}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/60 rounded-md px-3 py-2 w-full"
              >
                <Plus className="h-3.5 w-3.5" /> Add group
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : template ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BoardTemplatesView({ onBoardCreated }: BoardTemplatesViewProps) {
  const { user } = useAuth();
  const { data: roleInfo } = useUserRole();
  const isAdmin = roleInfo?.role === "admin";
  const { toast } = useToast();

  const [templates, setTemplates] = useState<BoardTemplate[]>([]);
  const [groups, setGroups] = useState<TemplateGroup[]>([]);
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BoardTemplate | null>(null);

  // Use template
  const [usingTemplate, setUsingTemplate] = useState<BoardTemplate | null>(null);
  const [boardName, setBoardName] = useState("");
  const [creating, setCreating] = useState(false);

  // Archive confirm
  const [archivingTemplate, setArchivingTemplate] = useState<BoardTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tmplRes, grpRes, taskRes] = await Promise.all([
      supabase.from("board_templates" as any).select("*").order("is_builtin", { ascending: false }).order("name"),
      supabase.from("board_template_groups" as any).select("*").order("position"),
      supabase.from("board_template_tasks" as any).select("*").order("position"),
    ]);
    setTemplates(((tmplRes.data ?? []) as unknown) as BoardTemplate[]);
    setGroups(((grpRes.data ?? []) as unknown) as TemplateGroup[]);
    setTasks(((taskRes.data ?? []) as unknown) as TemplateTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const canEditTemplate = (t: BoardTemplate): boolean => {
    if (isAdmin) return true;
    return t.created_by === user?.id && !t.is_builtin;
  };

  const handleUse = (t: BoardTemplate) => {
    setUsingTemplate(t);
    setBoardName(t.name);
  };

  const confirmUse = async () => {
    if (!usingTemplate || !boardName.trim()) {
      toast({ title: "Board name is required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc("create_board_from_template" as any, {
      p_template_id: usingTemplate.id,
      p_board_name: boardName.trim(),
    });
    setCreating(false);
    if (error) {
      toast({ title: "Failed to create board", description: error.message, variant: "destructive" });
      return;
    }
    setUsingTemplate(null);
    setBoardName("");
    toast({ title: `Board "${boardName.trim()}" created`, description: "Switching to Boards…" });
    onBoardCreated?.(data as string);
  };

  const handleEdit = (t: BoardTemplate) => {
    setEditingTemplate(t);
    setEditorOpen(true);
  };

  const handleDuplicate = async (t: BoardTemplate) => {
    if (!user) return;
    const { data: newTmpl, error } = await supabase
      .from("board_templates" as any)
      .insert({
        name: `${t.name} (copy)`,
        description: t.description,
        color: t.color,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !newTmpl) {
      toast({ title: "Duplicate failed", description: error?.message, variant: "destructive" });
      return;
    }
    const newId = (newTmpl as { id: string }).id;

    const tmplGroups = groups.filter((g) => g.template_id === t.id).sort((a, b) => a.position - b.position);
    for (const g of tmplGroups) {
      const { data: newGrp } = await supabase
        .from("board_template_groups" as any)
        .insert({ template_id: newId, name: g.name, color: g.color, position: g.position })
        .select("id")
        .single();
      const newGrpId = (newGrp as { id: string } | null)?.id;
      if (!newGrpId) continue;

      const grpTasks = tasks.filter((tk) => tk.group_id === g.id).sort((a, b) => a.position - b.position);
      if (grpTasks.length > 0) {
        await supabase.from("board_template_tasks" as any).insert(
          grpTasks.map((tk) => ({
            template_id: newId,
            group_id: newGrpId,
            title: tk.title,
            description: tk.description,
            position: tk.position,
          })),
        );
      }
    }

    toast({ title: "Template duplicated" });
    load();
  };

  const handleArchive = async (t: BoardTemplate) => {
    await supabase.from("board_templates" as any).delete().eq("id", t.id);
    setArchivingTemplate(null);
    toast({ title: "Template deleted" });
    load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-6">Loading templates…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Board Templates</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Start a new board from a predefined structure. Templates are blueprints - editing a board later won't modify the template.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => { setEditingTemplate(null); setEditorOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Template
        </Button>
      </div>

      {/* Template grid */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <LayoutTemplate className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No templates yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Create a template to quickly spin up boards with a predefined group and task structure.
          </p>
          <Button size="sm" onClick={() => { setEditingTemplate(null); setEditorOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first template
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              groups={groups}
              tasks={tasks}
              canEdit={canEditTemplate(t)}
              onUse={handleUse}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onArchive={(t) => setArchivingTemplate(t)}
            />
          ))}
        </div>
      )}

      {/* ── Use template dialog ── */}
      <Dialog open={!!usingTemplate} onOpenChange={(o) => { if (!o) { setUsingTemplate(null); setBoardName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Board from "{usingTemplate?.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A new board will be created with{" "}
              <span className="font-medium text-foreground">
                {groupsForTemplate(groups, usingTemplate?.id ?? "").length} groups
              </span>{" "}
              and{" "}
              <span className="font-medium text-foreground">
                {tasks.filter((t) => t.template_id === usingTemplate?.id).length} tasks
              </span>
              .
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Board name</label>
              <Input
                autoFocus
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="Board name"
                maxLength={100}
                onKeyDown={(e) => { if (e.key === "Enter") confirmUse(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setUsingTemplate(null); setBoardName(""); }}>
              Cancel
            </Button>
            <Button onClick={confirmUse} disabled={creating}>
              {creating ? "Creating…" : "Create Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!archivingTemplate} onOpenChange={(o) => { if (!o) setArchivingTemplate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">"{archivingTemplate?.name}"</span>?
            Boards created from it are not affected.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchivingTemplate(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => archivingTemplate && handleArchive(archivingTemplate)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Template editor ── */}
      <TemplateEditor
        template={editingTemplate}
        existingGroups={groups}
        existingTasks={tasks}
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingTemplate(null); }}
        onSaved={load}
      />
    </div>
  );
}
