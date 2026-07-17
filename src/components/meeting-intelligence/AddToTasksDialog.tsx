import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { CheckSquare, ExternalLink, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTitle: string;
  defaultDescription: string;
  defaultDueDate?: string;
  onCreated: (taskId: string) => void;
}

export function AddToTasksDialog({ open, onClose, defaultTitle, defaultDescription, defaultDueDate, onCreated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [dueDate, setDueDate] = useState(defaultDueDate ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("manager_tasks")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          status: "todo",
          user_id: user.id,
          visibility: "private",
        })
        .select("id")
        .single();

      if (error) throw error;

      await (supabase as any)
        .from("manager_task_assignees")
        .insert({ task_id: data.id, user_id: user.id });

      toast({ title: "Task created", description: "Added to My Tasks successfully." });
      onCreated(data.id as string);
      onClose();
    } catch (e: any) {
      toast({ title: "Error creating task", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4 text-primary" />
            Add to My Tasks
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Due Date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-sm" />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckSquare className="h-3.5 w-3.5 mr-1" />}
              Add Task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TaskAddedBannerProps {
  taskId: string;
}

export function TaskAddedBanner({ taskId: _taskId }: TaskAddedBannerProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-md px-3 py-2">
      <CheckSquare className="h-3.5 w-3.5 shrink-0" />
      <span>Added to My Tasks.</span>
      <a href="/tasks" className="flex items-center gap-0.5 underline underline-offset-2 hover:no-underline">
        View in My Tasks <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
