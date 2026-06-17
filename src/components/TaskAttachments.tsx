import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, Download, Loader2, FileText } from "lucide-react";

interface Attachment {
  id: string;
  task_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const BUCKET = "task-attachments";
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId, onChange }: { taskId: string; onChange?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("manager_task_attachments" as any)
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't load attachments", description: error.message, variant: "destructive" });
      return;
    }
    setItems((data as any[]) as Attachment[]);
  };

  useEffect(() => { if (taskId) load(); }, [taskId]);

  const onPick = () => inputRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        toast({ title: "File too large", description: `${file.name} exceeds 25MB.`, variant: "destructive" });
        continue;
      }
      const path = `${taskId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) {
        toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
        continue;
      }
      const { error: insErr } = await supabase.from("manager_task_attachments" as any).insert({
        task_id: taskId,
        uploaded_by: user.id,
        storage_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast({ title: "Couldn't save attachment", description: insErr.message, variant: "destructive" });
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    load();
    onChange?.();
  };

  const download = async (a: Attachment) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 60);
    if (error || !data) {
      toast({ title: "Couldn't open file", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (a: Attachment) => {
    await supabase.storage.from(BUCKET).remove([a.storage_path]);
    const { error } = await supabase.from("manager_task_attachments" as any).delete().eq("id", a.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== a.id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Paperclip className="h-3 w-3" /> Attachments {items.length > 0 && <span>({items.length})</span>}
        </p>
        <Button size="sm" variant="outline" onClick={onPick} disabled={uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Attach files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>
      {loading ? (
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">No attachments</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <button
                onClick={() => download(a)}
                className="flex-1 text-left text-sm truncate hover:underline"
                title={a.file_name}
              >
                {a.file_name}
              </button>
              <span className="text-[11px] text-muted-foreground shrink-0">{fmtSize(a.size_bytes)}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => download(a)}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              {user && (a.uploaded_by === user.id) && (
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => remove(a)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pending attachment picker — used in Create dialog before task exists. */
export function PendingAttachmentPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (f: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Paperclip className="h-3 w-3" /> Attachments {files.length > 0 && <span>({files.length})</span>}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Paperclip className="h-3.5 w-3.5" /> Attach files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            onChange([...files, ...list]);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-[11px] text-muted-foreground">{fmtSize(f.size)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function uploadPendingAttachments(taskId: string, userId: string, files: File[]) {
  for (const file of files) {
    if (file.size > MAX_BYTES) continue;
    const path = `${taskId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) continue;
    await supabase.from("manager_task_attachments" as any).insert({
      task_id: taskId,
      uploaded_by: userId,
      storage_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    });
  }
}
