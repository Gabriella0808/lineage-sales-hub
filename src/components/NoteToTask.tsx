import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList } from "lucide-react";

interface NoteToTaskProps {
  /** "rep" or "dealer" — controls reference text and title */
  refType: "rep" | "dealer";
  /** Display name of the rep/dealer (used in task title + description). */
  refName: string;
  /** UUID of the rep/dealer (stored in description as a permanent reference). */
  refId: string;
}

/**
 * Note input that submits as a task in My Tasks (manager_tasks),
 * with the originating rep/dealer captured in title + description.
 */
export function NoteToTask({ refType, refName, refId }: NoteToTaskProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to save notes as tasks.", variant: "destructive" });
      return;
    }
    const trimmed = note.trim();
    if (!trimmed) {
      toast({ title: "Note is empty", variant: "destructive" });
      return;
    }
    if (trimmed.length > 2000) {
      toast({ title: "Note too long", description: "Max 2000 characters.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const label = refType === "rep" ? "Rep" : "Dealer";
    const { error } = await supabase.from("manager_tasks").insert({
      user_id: user.id,
      title: `Note re: ${refName}`,
      description: `[${label}: ${refName} · ${refId}]\n\n${trimmed}`,
      status: "todo",
    });
    setSubmitting(false);

    if (error) {
      toast({ title: "Couldn't save note", description: error.message, variant: "destructive" });
      return;
    }
    setNote("");
    toast({
      title: "Saved as task",
      description: `Added to My Tasks with reference to ${refName}.`,
    });
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder={`Write a note about this ${refType}…  (it'll be saved as a task in My Tasks)`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        rows={3}
        className="text-sm"
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {note.length}/2000 · saved with reference to {refName}
        </p>
        <Button size="sm" onClick={submit} disabled={submitting || !note.trim()}>
          <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
          {submitting ? "Saving…" : "Save as task"}
        </Button>
      </div>
    </div>
  );
}
