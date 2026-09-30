import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download, Eye, File as FileIcon, FileArchive, FileSpreadsheet, FileText, FileVideo, Loader2, MoreVertical, Paperclip, Pencil, Pin, PinOff, Play, Plus, SmilePlus, Trash2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const BUCKET = "team-post-attachments";
const MAX_FILES = 6;
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB, matches the bucket's own cap - mainly for video
// Images, common office documents, and video - matches the bucket's own
// allowed_mime_types exactly, so a type that passes here always uploads.
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
]);
// Fixed quick-reaction set - mirrors the DB check constraint on
// team_post_reactions.emoji, so a pick here always saves cleanly.
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🎉", "👏"] as const;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** supabase-js's own storage.upload() is plain fetch under the hood, with no
 *  progress callback - for a large video that leaves "Post update" looking
 *  hung for however long the upload actually takes. This hits the exact
 *  same Storage REST endpoint directly via XHR (which does support upload
 *  progress events) purely to report real progress; auth and body shape
 *  otherwise match what storage-js itself sends. */
function uploadFileWithProgress(path: string, file: File, accessToken: string, onProgress: (loadedBytes: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", encodeURI(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`));
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("Upload failed - network error."));
    const formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", file);
    xhr.send(formData);
  });
}

interface TeamPostAttachment {
  id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
}

interface TeamPostRow {
  id: string;
  author_user_id: string;
  title: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
  pinned: boolean;
}

interface ReactionGroup {
  emoji: string;
  users: { userId: string; name: string }[];
}

interface TeamPost extends TeamPostRow {
  authorName: string;
  attachments: TeamPostAttachment[];
  reactions: ReactionGroup[];
  /** Read receipts, sourced from the notifications notify-team-post already
   *  creates per recipient. Only meaningful once this is rolled out beyond
   *  Gabriella-only testing - until then every post shows 1 of 1. */
  seen: { count: number; total: number; seenBy: { userId: string; name: string }[] };
}

function useTeamPosts() {
  const qc = useQueryClient();

  // Live feed - a new post, edit, delete, reaction or read receipt from
  // anyone shows up without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel("team-posts-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "team_posts" }, () => qc.invalidateQueries({ queryKey: ["team_posts"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_post_attachments" }, () => qc.invalidateQueries({ queryKey: ["team_posts"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_post_reactions" }, () => qc.invalidateQueries({ queryKey: ["team_posts"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_post_reads" }, () => qc.invalidateQueries({ queryKey: ["team_posts"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: "type=eq.team_post" }, () => qc.invalidateQueries({ queryKey: ["team_posts"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return useQuery({
    queryKey: ["team_posts"],
    staleTime: 15_000,
    queryFn: async (): Promise<TeamPost[]> => {
      // New tables - not in the generated Supabase types yet.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const db = supabase as any;
      const [{ data: posts, error: postsErr }, { data: attachments, error: attErr }, { data: reactions, error: reactErr }, { data: reads, error: readsErr }, { data: audienceSize, error: audienceErr }] = await Promise.all([
        db.from("team_posts").select("id, author_user_id, title, body, created_at, updated_at, pinned").order("created_at", { ascending: false }),
        db.from("team_post_attachments").select("id, post_id, file_path, file_name, content_type, size_bytes"),
        db.from("team_post_reactions").select("post_id, user_id, emoji"),
        // Who has actually opened this post, independent of who was ever
        // emailed about it - see the migration's comment for why this
        // can't just be notifications.read_at.
        db.from("team_post_reads").select("post_id, user_id, read_at"),
        db.rpc("team_post_audience_size"),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (postsErr) throw postsErr;
      if (attErr) throw attErr;
      if (reactErr) throw reactErr;
      if (readsErr) throw readsErr;
      if (audienceErr) throw audienceErr;
      const total = (audienceSize as number | null) ?? 0;

      const authorIds = [...new Set([
        ...(posts ?? []).map((p: TeamPostRow) => p.author_user_id),
        ...(reactions ?? []).map((r: { user_id: string }) => r.user_id),
        ...(reads ?? []).map((s: { user_id: string }) => s.user_id),
      ])] as string[];
      const { data: profiles } = authorIds.length
        ? await supabase.from("profiles").select("user_id, full_name").in("user_id", authorIds)
        : { data: [] as { user_id: string; full_name: string | null }[] };
      const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

      const attByPost = new Map<string, TeamPostAttachment[]>();
      for (const a of (attachments ?? []) as (TeamPostAttachment & { post_id: string })[]) {
        const list = attByPost.get(a.post_id) ?? [];
        list.push(a);
        attByPost.set(a.post_id, list);
      }

      // Grouped by post then by emoji, so each emoji renders as its own
      // pill with its own count - a person can appear under more than one
      // emoji on the same post.
      const reactionsByPost = new Map<string, Map<string, { userId: string; name: string }[]>>();
      for (const r of (reactions ?? []) as { post_id: string; user_id: string; emoji: string }[]) {
        const byEmoji = reactionsByPost.get(r.post_id) ?? new Map<string, { userId: string; name: string }[]>();
        const list = byEmoji.get(r.emoji) ?? [];
        list.push({ userId: r.user_id, name: nameById.get(r.user_id) || "Someone" });
        byEmoji.set(r.emoji, list);
        reactionsByPost.set(r.post_id, byEmoji);
      }

      const seenByPost = new Map<string, { userId: string; name: string }[]>();
      for (const r of (reads ?? []) as { post_id: string; user_id: string }[]) {
        const list = seenByPost.get(r.post_id) ?? [];
        list.push({ userId: r.user_id, name: nameById.get(r.user_id) || "Someone" });
        seenByPost.set(r.post_id, list);
      }

      const mapped = (posts ?? []).map((p: TeamPostRow) => {
        const byEmoji = reactionsByPost.get(p.id);
        // Keeps pills in the same fixed order as the picker, and only for
        // emoji someone actually used.
        const reactions: ReactionGroup[] = byEmoji
          ? REACTION_EMOJIS.filter((e) => byEmoji.has(e)).map((e) => ({ emoji: e, users: byEmoji.get(e)! }))
          : [];
        const seenBy = seenByPost.get(p.id) ?? [];
        return {
          ...p,
          authorName: nameById.get(p.author_user_id) || "Someone",
          attachments: attByPost.get(p.id) ?? [],
          reactions,
          seen: { count: seenBy.length, total, seenBy },
        };
      });

      // Pinned posts float to the top (newest pinned first), everything else
      // stays newest-first below - the query above already sorts by
      // created_at desc, so this only needs to separate the two groups.
      return [...mapped].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    },
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function isImage(contentType: string | null) {
  return !!contentType && contentType.startsWith("image/");
}

function isPdf(contentType: string | null) {
  return contentType === "application/pdf";
}

function isVideo(contentType: string | null) {
  return !!contentType && contentType.startsWith("video/");
}

const DOC_TYPES = new Set(["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const SHEET_TYPES = new Set(["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"]);
const SLIDE_TYPES = new Set(["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
const ARCHIVE_TYPES = new Set(["application/zip", "application/x-zip-compressed"]);

/** Drives the icon, color and label on a FileChip - one look per file
 *  family instead of a single generic "File" icon for everything. */
function fileCategory(contentType: string | null): { icon: typeof FileText; className: string; label: string } {
  if (isPdf(contentType)) return { icon: FileText, className: "bg-destructive/10 text-destructive", label: "PDF" };
  if (isVideo(contentType)) return { icon: FileVideo, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400", label: "Video" };
  if (contentType && DOC_TYPES.has(contentType)) return { icon: FileText, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400", label: "Word" };
  if (contentType && SHEET_TYPES.has(contentType)) return { icon: FileSpreadsheet, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "Excel" };
  if (contentType && SLIDE_TYPES.has(contentType)) return { icon: FileText, className: "bg-orange-500/10 text-orange-600 dark:text-orange-400", label: "PowerPoint" };
  if (contentType && ARCHIVE_TYPES.has(contentType)) return { icon: FileArchive, className: "bg-muted text-muted-foreground", label: "Archive" };
  return { icon: FileIcon, className: "bg-muted text-muted-foreground", label: "File" };
}

function formatBytes(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Forces a real download instead of navigating (a plain <a download> is
 *  ignored by browsers for a cross-origin URL like Supabase's signed URLs)
 *  by fetching the file as a blob first and downloading that same-origin
 *  object URL instead. Falls back to a plain new-tab open if that fails for
 *  any reason - still gets the file into the person's hands either way. */
async function downloadFile(url: string, fileName: string) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function useSignedUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

function ImageTile({ a, className, onOpen }: { a: TeamPostAttachment; className?: string; onOpen: () => void }) {
  const url = useSignedUrl(a.file_path);
  return (
    <button type="button" onClick={onOpen} className={cn("block overflow-hidden rounded-md border bg-muted", className)}>
      {url ? <img src={url} alt={a.file_name} className="h-full w-full object-cover hover:opacity-90 transition-opacity" /> : <div className="h-full w-full animate-pulse bg-muted" />}
    </button>
  );
}

/** Same tile treatment as an image, but shows the video's first frame with a
 *  play-icon overlay instead of a static image. */
function VideoTile({ a, className, onOpen }: { a: TeamPostAttachment; className?: string; onOpen: () => void }) {
  const url = useSignedUrl(a.file_path);
  return (
    <button type="button" onClick={onOpen} className={cn("relative block overflow-hidden rounded-md border bg-muted group", className)}>
      {url ? (
        <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-foreground">
          <Play className="h-3 w-3 ml-0.5 fill-current" />
        </span>
      </span>
    </button>
  );
}

/** Outlook-style attachment tile: file-type icon, name and size, click to preview inline. */
function FileChip({ a, onOpen }: { a: TeamPostAttachment; onOpen: () => void }) {
  const { icon: Icon, className, label } = fileCategory(a.content_type);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/60 hover:border-foreground/20 transition-colors text-left"
      title={`Preview ${a.file_name}`}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", className)}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium truncate max-w-[200px]">{a.file_name}</span>
        <span className="block text-[11px] text-muted-foreground">{label}{a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}</span>
      </span>
    </button>
  );
}

/** Images and video preview inline; a PDF previews via the browser's built-in
 *  viewer. Anything else (Word, Excel, zip, ...) can't be rendered in the
 *  browser, so it falls back to a plain icon + name card instead of trying
 *  to show it as an image. Every type gets the same header bar (name,
 *  Download, Open in new tab) and the same screen-bounded dialog, so
 *  nothing can render taller or wider than the viewport - content that's
 *  actually media (image/video) fits inside via object-contain rather than
 *  stretching or overflowing. */
function AttachmentPreview({ a, onClose }: { a: TeamPostAttachment | null; onClose: () => void }) {
  const url = useSignedUrl(a?.file_path ?? "");
  const pdf = a && isPdf(a.content_type);
  const video = a && isVideo(a.content_type);
  const image = a && isImage(a.content_type);
  const { icon: Icon, className: iconClassName, label } = a ? fileCategory(a.content_type) : { icon: FileIcon, className: "", label: "" };
  return (
    <Dialog open={!!a} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 flex flex-col gap-0">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 bg-background">
          <span className="text-sm font-medium truncate">{a?.file_name}</span>
          {url && a && (
            <span className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => downloadFile(url, a.file_name)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </button>
              <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">Open in new tab</a>
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto bg-muted/30">
          {!url ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : pdf ? (
            <iframe src={url} title={a?.file_name} className="h-full w-full" />
          ) : video ? (
            <video src={url} controls autoPlay className="max-h-full max-w-full object-contain" />
          ) : image ? (
            <img src={url} alt={a?.file_name} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-3 p-8">
              <span className={cn("flex h-12 w-12 items-center justify-center rounded-md", iconClassName)}>
                <Icon className="h-6 w-6" />
              </span>
              <p className="text-xs text-muted-foreground">{label} · can't preview this type in the portal - download it instead</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 1 image = full width; 2 = side by side; 3+ = a compact grid. Files (non-images) always list below. */
function AttachmentGrid({ attachments, onOpen }: { attachments: TeamPostAttachment[]; onOpen: (a: TeamPostAttachment) => void }) {
  const images = attachments.filter((a) => isImage(a.content_type));
  const videos = attachments.filter((a) => isVideo(a.content_type));
  const files = attachments.filter((a) => !isImage(a.content_type) && !isVideo(a.content_type));

  return (
    <div className="space-y-2">
      {images.length === 1 && (
        <ImageTile a={images[0]} className="h-72 w-full" onOpen={() => onOpen(images[0])} />
      )}
      {images.length === 2 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((a) => <ImageTile key={a.id} a={a} className="h-48 w-full" onOpen={() => onOpen(a)} />)}
        </div>
      )}
      {images.length >= 3 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((a) => <ImageTile key={a.id} a={a} className="h-28 w-full" onOpen={() => onOpen(a)} />)}
        </div>
      )}
      {videos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {videos.map((a) => <VideoTile key={a.id} a={a} className="w-40 aspect-video shrink-0" onOpen={() => onOpen(a)} />)}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((a) => <FileChip key={a.id} a={a} onOpen={() => onOpen(a)} />)}
        </div>
      )}
    </div>
  );
}

/** One emoji's pill: shows the count, highlights when the current user is
 *  in it, and a tooltip listing who reacted. Clicking toggles the current
 *  user's own reaction with this specific emoji. */
function ReactionPill({ group, mine, onToggle, disabled }: {
  group: ReactionGroup;
  mine: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 h-7 rounded-full border px-2 text-xs font-medium transition-colors",
            mine ? "bg-accent/40 border-accent text-foreground" : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted",
          )}
        >
          <span>{group.emoji}</span>
          <span>{group.users.length}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{group.users.map((u) => u.name).join(", ")}</TooltipContent>
    </Tooltip>
  );
}

/** A row of per-emoji reaction pills plus a "+" picker to add a new
 *  reaction type - a person can react to the same post with more than
 *  one emoji, same as Slack/iMessage. */
function ReactionBar({ postId, reactions, currentUserId }: { postId: string; reactions: ReactionGroup[]; currentUserId: string }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: async (emoji: string) => {
      const mine = reactions.some((g) => g.emoji === emoji && g.users.some((u) => u.userId === currentUserId));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      if (mine) {
        const { error } = await db.from("team_post_reactions").delete().eq("post_id", postId).eq("user_id", currentUserId).eq("emoji", emoji);
        if (error) throw error;
      } else {
        const { error } = await db.from("team_post_reactions").insert({ post_id: postId, user_id: currentUserId, emoji });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_posts"] }),
  });

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {reactions.map((group) => (
        <ReactionPill
          key={group.emoji}
          group={group}
          mine={group.users.some((u) => u.userId === currentUserId)}
          onToggle={() => toggle.mutate(group.emoji)}
          disabled={toggle.isPending}
        />
      ))}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Add a reaction"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-1.5">
          <div className="flex items-center gap-0.5">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { toggle.mutate(emoji); setPickerOpen(false); }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-muted transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PostCard({ post, canManage, isAdmin, currentUserId, highlighted, onEdit, onDelete, onTogglePin }: {
  post: TeamPost;
  canManage: boolean;
  isAdmin: boolean;
  currentUserId: string | undefined;
  highlighted: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const [previewAttachment, setPreviewAttachment] = useState<TeamPostAttachment | null>(null);
  const edited = post.updated_at && post.updated_at !== post.created_at;

  return (
    <Card
      id={`post-${post.id}`}
      className={cn(
        post.pinned && "border-accent/60 bg-accent/[0.04]",
        highlighted && "ring-2 ring-accent transition-shadow duration-1000",
      )}
    >
      <CardContent className="p-5 space-y-3">
        {post.pinned && (
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Pin className="h-3 w-3 fill-current" /> Pinned
          </p>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Avatar className="h-9 w-9 mt-0.5">
              <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">{initials(post.authorName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              {post.title && <h3 className="font-display text-lg font-medium leading-snug">{post.title}</h3>}
              <p className="text-xs text-muted-foreground mt-0.5">
                {post.authorName} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                {edited && " · edited"}
              </p>
            </div>
          </div>
          {(canManage || isAdmin) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted" aria-label="Post actions">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAdmin && (
                  <DropdownMenuItem onClick={onTogglePin}>
                    {post.pinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
                    {post.pinned ? "Unpin" : "Pin to top"}
                  </DropdownMenuItem>
                )}
                {canManage && <DropdownMenuItem onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
                {canManage && <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {post.body && <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.body}</p>}
        {post.attachments.length > 0 && <AttachmentGrid attachments={post.attachments} onOpen={setPreviewAttachment} />}
        <div className="flex items-center justify-between pt-1">
          {currentUserId && <ReactionBar postId={post.id} reactions={post.reactions} currentUserId={currentUserId} />}
          {post.seen.total > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <Eye className="h-3 w-3" /> Seen by {post.seen.count} of {post.seen.total}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                {post.seen.seenBy.length > 0 ? (
                  <ul className="space-y-1">
                    {post.seen.seenBy.map((u) => (
                      <li key={u.userId} className="text-xs px-1 py-0.5">{u.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground px-1 py-0.5">No one has seen this yet.</p>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </CardContent>
      <AttachmentPreview a={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </Card>
  );
}

function ComposeDialog({ open, onOpenChange, editing }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TeamPost | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ sentBytes: number; totalBytes: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setBody(editing?.body ?? "");
      setFiles([]);
      setFileError(null);
      setUploadProgress(null);
    }
  }, [open, editing]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFileError(null);
    const picked = Array.from(list);
    if (files.length + picked.length > MAX_FILES) {
      setFileError(`Up to ${MAX_FILES} attachments per post.`);
      return;
    }
    for (const f of picked) {
      if (!ALLOWED_TYPES.has(f.type)) { setFileError(`"${f.name}" isn't a supported type.`); return; }
      if (f.size > MAX_FILE_BYTES) { setFileError(`"${f.name}" is over 500MB.`); return; }
    }
    setFiles((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in.");
      // New tables - not in the generated Supabase types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // Real upload progress needs the raw access token (uploadFileWithProgress
      // bypasses supabase-js's storage client to get XHR progress events).
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not signed in.");

      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
      setUploadProgress(totalBytes > 0 ? { sentBytes: 0, totalBytes } : null);
      let sentBeforeCurrentFile = 0;

      const uploadAll = async (postId: string) => {
        for (const file of files) {
          const path = `${postId}/${crypto.randomUUID()}-${file.name}`;
          const sentBeforeThisFile = sentBeforeCurrentFile;
          try {
            await uploadFileWithProgress(path, file, accessToken, (loaded) => {
              setUploadProgress({ sentBytes: sentBeforeThisFile + loaded, totalBytes });
            });
          } catch (e) {
            throw new Error(`Uploading "${file.name}" failed: ${(e as Error).message}`);
          }
          sentBeforeCurrentFile += file.size;
          const { error: attErr } = await db.from("team_post_attachments").insert({
            post_id: postId, file_path: path, file_name: file.name, content_type: file.type, size_bytes: file.size,
          });
          if (attErr) throw attErr;
        }
      };

      if (editing) {
        const { error: updErr } = await db
          .from("team_posts")
          .update({ title: title.trim() || null, body: body.trim() || null })
          .eq("id", editing.id);
        if (updErr) throw updErr;
        // Attachments aren't editable yet - new files can still be added to an existing post.
        await uploadAll(editing.id);
        return editing.id;
      }

      const { data: inserted, error: insertErr } = await db
        .from("team_posts")
        .insert({ author_user_id: user.id, title: title.trim() || null, body: body.trim() || null })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      const postId = inserted.id as string;

      await uploadAll(postId);

      const { error: notifyErr } = await supabase.functions.invoke("notify-team-post", { body: { postId } });
      if (notifyErr) {
        // The post itself succeeded - surface this as a soft warning, not a failure of the whole action.
        console.error("notify-team-post failed:", notifyErr.message);
      }
      return postId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team_posts"] });
      setUploadProgress(null);
      onOpenChange(false);
    },
    onError: () => setUploadProgress(null),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit update" : "New team update"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <Textarea placeholder="What's happening?" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} />

          <div className="space-y-2">
            <input ref={fileInputRef} type="file" multiple accept={[...ALLOWED_TYPES].join(",")} className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={files.length >= MAX_FILES}>
              <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Add attachment{editing ? " (adds to existing)" : ""}
            </Button>
            {fileError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{fileError}</p>}
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground shrink-0 ml-2">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {uploadProgress && uploadProgress.totalBytes > 0 && (() => {
            const pct = Math.min(100, Math.round((uploadProgress.sentBytes / uploadProgress.totalBytes) * 100));
            return (
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Uploading {formatBytes(uploadProgress.sentBytes)} of {formatBytes(uploadProgress.totalBytes)} ({pct}%)
                </p>
              </div>
            );
          })()}

          {save.isError && <p className="text-xs text-destructive">{(save.error as Error).message}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={(!title.trim() && !body.trim() && files.length === 0) || save.isPending}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {save.isPending && uploadProgress && uploadProgress.totalBytes > 0
              ? `Uploading ${Math.min(100, Math.round((uploadProgress.sentBytes / uploadProgress.totalBytes) * 100))}%`
              : editing ? "Save changes" : "Post update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirm({ post, onOpenChange }: { post: TeamPost; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      if (post.attachments.length > 0) {
        await supabase.storage.from(BUCKET).remove(post.attachments.map((a) => a.file_path));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("team_posts").delete().eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team_posts"] });
      onOpenChange(false);
    },
  });

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this update?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes it, and any attachments, for everyone. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {del.isError && <p className="text-xs text-destructive">{(del.error as Error).message}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); del.mutate(); }} disabled={del.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {del.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function TeamUpdatesPage() {
  const { user } = useAuth();
  const { data: roleInfo } = useUserRole();
  const qc = useQueryClient();
  const isAdmin = roleInfo?.role === "admin";
  const canPost = isAdmin || roleInfo?.role === "manager";
  const { data: posts = [], isLoading, error } = useTeamPosts();
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<TeamPost | null>(null);
  const [deletingPost, setDeletingPost] = useState<TeamPost | null>(null);

  // Deep link from the email/notification button - "?post=<id>" jumps
  // straight to that message and briefly highlights it.
  const [params, setParams] = useSearchParams();
  const targetPostId = params.get("post");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!targetPostId || posts.length === 0) return;
    const el = document.getElementById(`post-${targetPostId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(targetPostId);
    const clearParam = () => { const next = new URLSearchParams(params); next.delete("post"); setParams(next, { replace: true }); };
    clearParam();
    const t = window.setTimeout(() => setHighlightId(null), 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPostId, posts.length]);

  // Marks the bell notification read too, for anyone who does have one
  // (currently just Gabriella, while RECIPIENT_MODE is gabriella-only) -
  // this is about the bell's own unread badge, separate from "Seen by"
  // below, which tracks real page views for everyone with access.
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    db.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("type", "team_post")
      .is("read_at", null)
      .then(() => qc.invalidateQueries({ queryKey: ["team_posts"] }));
  }, [user, qc]);

  // "Seen by" needs to count everyone who's actually opened Team Updates
  // and had a post on their screen - not just people notify-team-post
  // happened to email (that's gabriella-only right now, so relying on
  // notifications alone would mean no other admin/manager's view ever
  // counted). Being on this page at all means every currently-loaded post
  // is visible, so upsert a team_post_reads row for each one.
  const postIds = posts.map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (!user || !postIds) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const rows = postIds.split(",").map((id) => ({ post_id: id, user_id: user.id }));
    db.from("team_post_reads")
      .upsert(rows, { onConflict: "post_id,user_id", ignoreDuplicates: true })
      .then(() => qc.invalidateQueries({ queryKey: ["team_posts"] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, postIds]);

  const openNew = () => { setEditingPost(null); setComposeOpen(true); };
  const openEdit = (p: TeamPost) => { setEditingPost(p); setComposeOpen(true); };
  const canManage = (p: TeamPost) => isAdmin || (roleInfo?.role === "manager" && p.author_user_id === user?.id);

  const togglePin = useMutation({
    mutationFn: async (p: TeamPost) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("team_posts").update({ pinned: !p.pinned }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_posts"] }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Command Center"
        title="Team Updates"
        subtitle="News, events and announcements from the team - newest first."
        actions={canPost ? (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" /> New post
          </Button>
        ) : undefined}
      />

      {error && (
        <Card><CardContent className="p-6 text-sm text-destructive">Couldn't load updates: {(error as Error).message}</CardContent></Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No updates yet.{canPost && " Post the first one."}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              canManage={canManage(p)}
              isAdmin={isAdmin}
              currentUserId={user?.id}
              highlighted={p.id === highlightId}
              onEdit={() => openEdit(p)}
              onDelete={() => setDeletingPost(p)}
              onTogglePin={() => togglePin.mutate(p)}
            />
          ))}
        </div>
      )}

      {canPost && <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} editing={editingPost} />}
      {deletingPost && <DeleteConfirm post={deletingPost} onOpenChange={(v) => !v && setDeletingPost(null)} />}
    </div>
  );
}
