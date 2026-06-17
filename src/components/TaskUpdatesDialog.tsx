import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskAttachments } from "@/components/TaskAttachments";
import { Paperclip, Send, AtSign, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface UpdateRow {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
}

interface User {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export function TaskUpdatesDialog({
  taskId,
  taskTitle,
  open,
  onOpenChange,
  users,
  onActivityChange,
}: {
  taskId: string | null;
  taskTitle?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: User[];
  onActivityChange?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.user_id, u));
    return m;
  }, [users]);

  const displayName = (u: User | undefined) =>
    u?.full_name || u?.email?.split("@")[0] || "Unknown";

  const load = async () => {
    if (!taskId) return;
    const { data, error } = await supabase
      .from("manager_task_updates" as any)
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load updates", description: error.message, variant: "destructive" });
      return;
    }
    setUpdates((data as any) as UpdateRow[]);
  };

  useEffect(() => {
    if (open && taskId) {
      load();
      setBody("");
      setMentionQuery(null);
    }
  }, [open, taskId]);

  const detectMention = (val: string, caret: number) => {
    const before = val.slice(0, caret);
    const m = before.match(/(?:^|\s)@(\w*)$/);
    setMentionQuery(m ? m[1] : null);
  };

  const insertMention = (u: User) => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const after = body.slice(caret);
    const replaced = before.replace(/@(\w*)$/, `@${displayName(u)} `);
    const next = replaced + after;
    setBody(next);
    setMentionQuery(null);
    setTimeout(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const extractMentionIds = (text: string): string[] => {
    const ids: string[] = [];
    for (const u of users) {
      const name = displayName(u);
      if (!name) continue;
      const re = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text)) ids.push(u.user_id);
    }
    return ids;
  };

  const send = async () => {
    if (!taskId || !user || !body.trim()) return;
    setSending(true);
    const mentions = extractMentionIds(body);
    const bodyText = body.trim();
    const { error } = await supabase.from("manager_task_updates" as any).insert({
      task_id: taskId,
      author_id: user.id,
      body: bodyText,
      mentions,
    });
    setSending(false);
    if (error) {
      toast({ title: "Couldn't post update", description: error.message, variant: "destructive" });
      return;
    }
    setBody("");
    load();
    onActivityChange?.();

    // Mentioned users receive an email via the manager_task_updates DB trigger
    // (notify_task_mention_on_insert -> notify-task-mention edge function).
  };

  const remove = async (u: UpdateRow) => {
    const { error } = await supabase.from("manager_task_updates" as any).delete().eq("id", u.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setUpdates((arr) => arr.filter((x) => x.id !== u.id));
    onActivityChange?.();
  };

  const renderBody = (text: string) => {
    const parts = text.split(/(@\w[\w .'-]*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("@")) {
        return (
          <span key={i} className="font-medium text-primary bg-primary/10 rounded px-1">
            {p}
          </span>
        );
      }
      return <span key={i}>{p}</span>;
    });
  };

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return users
      .filter((u) => {
        const name = displayName(u).toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        return !q || name.includes(q) || email.includes(q);
      })
      .slice(0, 6);
  }, [mentionQuery, users]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            Updates {taskTitle && <span className="text-muted-foreground font-normal">— {taskTitle}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Composer */}
          <div className="rounded-lg border bg-card p-3 space-y-2 relative">
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Write an update and mention others with @"
              className="min-h-[80px] resize-none border-0 focus-visible:ring-0 p-0 text-sm"
            />
            {mentionSuggestions.length > 0 && (
              <div className="absolute z-10 left-3 right-3 top-20 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                {mentionSuggestions.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => insertMention(u)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                      {displayName(u).split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex-1">{displayName(u)}</span>
                    {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setBody((b) => b + "@");
                    setTimeout(() => textareaRef.current?.focus(), 0);
                    setMentionQuery("");
                  }}
                >
                  <AtSign className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button size="sm" onClick={send} disabled={!body.trim() || sending}>
                <Send className="h-3.5 w-3.5 mr-1" />
                {sending ? "Posting…" : "Post update"}
              </Button>
            </div>
          </div>

          {/* Attachments */}
          {taskId && (
            <div className="rounded-lg border bg-card p-3">
              <TaskAttachments taskId={taskId} onChange={onActivityChange} />
            </div>
          )}

          {/* Updates list */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Updates {updates.length > 0 && <span>({updates.length})</span>}
            </p>
            {updates.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 py-8 text-center">
                <p className="text-sm font-medium">No updates yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Share progress, mention a teammate, or upload a file to get things moving
                </p>
              </div>
            ) : (
              updates.map((u) => {
                const author = userMap.get(u.author_id);
                const name = displayName(author);
                const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
                const canDelete = user && u.author_id === user.id;
                return (
                  <div key={u.id} className="flex gap-3 rounded-lg border bg-card p-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                      {initials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap break-words">{renderBody(u.body)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
