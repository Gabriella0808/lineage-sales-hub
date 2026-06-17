import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, ChevronLeft, GripVertical } from "lucide-react";

export interface SopTemplate {
  id: string;
  name: string;
  description: string | null;
  is_builtin: boolean;
  created_by: string | null;
}
export interface SopTemplateItem {
  id: string;
  template_id: string;
  title: string;
  position: number;
}

export function SopTemplatesManager({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SopTemplate[]>([]);
  const [editing, setEditing] = useState<SopTemplate | null>(null);
  const [items, setItems] = useState<SopTemplateItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("sop_templates" as any)
      .select("*")
      .order("is_builtin", { ascending: false })
      .order("name");
    if (error) {
      toast({ title: "Failed to load templates", description: error.message, variant: "destructive" });
      return;
    }
    setTemplates((data ?? []) as unknown as SopTemplate[]);
  };

  const loadItems = async (templateId: string) => {
    const { data, error } = await supabase
      .from("sop_template_items" as any)
      .select("*")
      .eq("template_id", templateId)
      .order("position");
    if (error) {
      toast({ title: "Failed to load steps", description: error.message, variant: "destructive" });
      return;
    }
    setItems((data ?? []) as unknown as SopTemplateItem[]);
  };

  useEffect(() => {
    if (open) {
      loadTemplates();
      setEditing(null);
      setItems([]);
    }
  }, [open]);

  const createTemplate = async () => {
    if (!user || !newName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("sop_templates" as any)
      .insert({
        name: newName.trim(),
        description: newDesc.trim() || null,
        created_by: user.id,
        is_builtin: false,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Create failed", description: error?.message, variant: "destructive" });
      return;
    }
    setNewName("");
    setNewDesc("");
    await loadTemplates();
    setEditing(data as unknown as SopTemplate);
    setItems([]);
    onChanged?.();
  };

  const renameTemplate = async (t: SopTemplate, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("sop_templates" as any).update({ name: trimmed }).eq("id", t.id);
    if (error) return toast({ title: "Rename failed", description: error.message, variant: "destructive" });
    setTemplates((ts) => ts.map((x) => (x.id === t.id ? { ...x, name: trimmed } : x)));
    if (editing?.id === t.id) setEditing({ ...editing, name: trimmed });
    onChanged?.();
  };

  const deleteTemplate = async (t: SopTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const { error } = await supabase.from("sop_templates" as any).delete().eq("id", t.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setTemplates((ts) => ts.filter((x) => x.id !== t.id));
    if (editing?.id === t.id) setEditing(null);
    onChanged?.();
  };

  const addItem = async () => {
    if (!editing || !newItemTitle.trim()) return;
    const nextPos = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("sop_template_items" as any)
      .insert({ template_id: editing.id, title: newItemTitle.trim(), position: nextPos })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Add step failed", description: error?.message, variant: "destructive" });
      return;
    }
    setItems((xs) => [...xs, data as unknown as SopTemplateItem]);
    setNewItemTitle("");
  };

  const renameItem = async (item: SopTemplateItem, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("sop_template_items" as any)
      .update({ title: trimmed })
      .eq("id", item.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, title: trimmed } : x)));
  };

  const deleteItem = async (item: SopTemplateItem) => {
    const { error } = await supabase.from("sop_template_items" as any).delete().eq("id", item.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setItems((xs) => xs.filter((x) => x.id !== item.id));
  };

  const canEdit = editing && !editing.is_builtin && editing.created_by === user?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? (
              <button
                onClick={() => setEditing(null)}
                className="inline-flex items-center gap-1 hover:text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
                SOP Templates
              </button>
            ) : (
              "Manage SOP Templates"
            )}
          </DialogTitle>
        </DialogHeader>

        {!editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {templates.length === 0 && (
                <p className="text-sm italic text-muted-foreground">No templates yet.</p>
              )}
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
                >
                  <button
                    onClick={async () => {
                      setEditing(t);
                      await loadItems(t.id);
                    }}
                    className="flex-1 text-left"
                  >
                    <div className="text-sm font-semibold">{t.name}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                    )}
                  </button>
                  {t.is_builtin ? (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-0.5 rounded bg-muted">
                      Built-in
                    </span>
                  ) : t.created_by === user?.id ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteTemplate(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Create new template
              </p>
              <Input
                placeholder="Template name (e.g. New Dealer Onboarding)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Textarea
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
              />
              <Button onClick={createTemplate} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Create template
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={editing.name}
                disabled={!canEdit}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                onBlur={(e) => canEdit && renameTemplate(editing, e.target.value)}
                className="font-semibold"
              />
              {editing.is_builtin && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-0.5 rounded bg-muted shrink-0">
                  Built-in (read-only)
                </span>
              )}
            </div>

            <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
              {items.length === 0 && (
                <p className="text-sm italic text-muted-foreground">No steps yet.</p>
              )}
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                  <Input
                    defaultValue={item.title}
                    disabled={!canEdit}
                    onBlur={(e) => canEdit && e.target.value !== item.title && renameItem(item, e.target.value)}
                    className="h-7 border-0 bg-transparent focus-visible:ring-1 px-1"
                  />
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive shrink-0"
                      onClick={() => deleteItem(item)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <div className="flex items-center gap-2 border-t pt-3">
                <Input
                  placeholder="Add a step…"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addItem();
                  }}
                />
                <Button onClick={addItem} size="sm" className="gap-1 shrink-0">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
