import { useMemo, useRef, useState } from "react";
import {
  Folder, FolderPlus, Upload, Search, Grid3x3, List, MoreVertical,
  Download, Pencil, FolderInput, Trash2, ChevronRight, Home, Loader2, X,
  Star, Clock, ChevronLeft, ChevronDown, FileUp, FolderUp, ArrowUpDown, Copy,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isDigitalAssetsManager } from "@/hooks/useUserRole";
import {
  DIGITAL_ASSETS_BUCKET, useAllFolders, useAllAssets, useCreateFolder,
  useRenameFolder, useMoveFolder, useDeleteFolder, useRenameAsset,
  useMoveAsset, useDeleteAsset, useCreateAssetRecord,
  useStarredItems, useToggleStar,
  type DigitalFolder, type DigitalAsset,
} from "@/hooks/useDigitalAssets";
import {
  fileCategory, formatBytes, downloadFile, uploadFileWithProgress,
  isImage, isVideo, isPdf,
} from "@/lib/fileHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB, matches the bucket's own cap
// Matches the bucket's own allowed_mime_types exactly, so a type that
// passes here always uploads.
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

function useSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ["digital_asset_signed_url", path],
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage.from(DIGITAL_ASSETS_BUCKET).createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: !!path,
    staleTime: 55 * 60 * 1000,
  });
}

type ViewMode = "grid" | "list";
type SortBy = "modified" | "name-asc" | "name-desc" | "size-desc" | "size-asc";
type UploadState = { file: File; loaded: number; total: number; error?: string };
type DragItem = { kind: "folder" | "asset"; id: string; name: string };
type GridItem = { kind: "folder"; data: DigitalFolder } | { kind: "asset"; data: DigitalAsset };

// Custom MIME type used to tag an in-app drag (a folder/file tile being
// dragged to move it) so it's never confused with an OS file drag (which
// has no custom data types, only Files) - the outer drop zone uses this to
// tell "move something that's already here" apart from "upload a new file".
const DRAG_MIME = "application/x-digital-asset";

function itemSize(item: GridItem): number {
  return item.kind === "asset" ? (item.data.size_bytes ?? 0) : 0;
}

export default function DigitalAssetsPage() {
  const { user } = useAuth();
  // Upload/manage (create, rename, move, delete) is restricted to 4 named
  // people, not the admin/manager role generally - everyone else gets view
  // + download only, same as a rep. Mirrors public.is_digital_assets_
  // manager() on the backend (RLS) - see 20261008040000 migration.
  const canManage = isDigitalAssetsManager(user?.email);

  const { data: folders = [], isLoading: foldersLoading } = useAllFolders();
  const { data: assets = [], isLoading: assetsLoading } = useAllAssets();
  const { data: starredItems = [] } = useStarredItems();
  const toggleStar = useToggleStar();
  const createFolder = useCreateFolder();
  const renameFolderM = useRenameFolder();
  const moveFolderM = useMoveFolder();
  const deleteFolderM = useDeleteFolder();
  const renameAssetM = useRenameAsset();
  const moveAssetM = useMoveAsset();
  const deleteAssetM = useDeleteAsset();
  const createAssetRecord = useCreateAssetRecord();

  const starredSet = useMemo(() => new Set(starredItems.map((s) => `${s.item_type}:${s.item_id}`)), [starredItems]);
  function isStarred(kind: "folder" | "asset", id: string) { return starredSet.has(`${kind}:${id}`); }
  function handleToggleStar(kind: "folder" | "asset", id: string) {
    if (!user) return;
    toggleStar.mutate({ itemType: kind, itemId: id, userId: user.id, starred: isStarred(kind, id) });
  }

  // Suggested-for-you cards clamp long filenames to 2 lines - this is the
  // reliable way to see/get the full name back regardless of pointer type
  // (a title-attribute tooltip alone doesn't reach touch or keyboard users).
  // The toast surfaces the full name as text, not just a clipboard side
  // effect, so it doubles as the "reveal" affordance.
  async function copyFullName(name: string) {
    try {
      await navigator.clipboard.writeText(name);
    } catch {
      // clipboard permission denied/unavailable - still show the full name below
    }
    toast.success(name, { description: "Copied full filename" });
  }

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  // Detailed list is the default view - a user can tell files with similar
  // names apart by their columns without opening each one; grid stays
  // available for a more visual browse.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortBy>("modified");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<"all" | "recents" | "starred">("all");
  const [dragActive, setDragActive] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null | "root">(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const suggestedScrollRef = useRef<HTMLDivElement>(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolder, setRenameFolderTarget] = useState<DigitalFolder | null>(null);
  const [renameAsset, setRenameAssetTarget] = useState<DigitalAsset | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveFolderTarget, setMoveFolderTarget] = useState<DigitalFolder | null>(null);
  const [moveAssetTarget, setMoveAssetTarget] = useState<DigitalAsset | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<DigitalFolder | null>(null);
  const [deleteAssetTarget, setDeleteAssetTarget] = useState<DigitalAsset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<DigitalAsset | null>(null);

  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const breadcrumbPath = useMemo(() => {
    const path: DigitalFolder[] = [];
    let cur = currentFolderId ? foldersById.get(currentFolderId) : undefined;
    while (cur) {
      path.unshift(cur);
      cur = cur.parent_folder_id ? foldersById.get(cur.parent_folder_id) : undefined;
    }
    return path;
  }, [currentFolderId, foldersById]);

  const q = search.trim().toLowerCase();
  // Search, Recents, and Starred all flatten across every folder (not just
  // the current one); plain browsing stays scoped to currentFolderId.
  const flattened = !!q || quickFilter !== "all";
  const visibleFolders = useMemo(() => {
    let list = flattened ? folders : folders.filter((f) => f.parent_folder_id === currentFolderId);
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q));
    if (quickFilter === "starred") list = list.filter((f) => isStarred("folder", f.id));
    return list;
  }, [folders, currentFolderId, q, quickFilter, starredSet]);
  const visibleAssets = useMemo(() => {
    let list = flattened ? assets : assets.filter((a) => a.folder_id === currentFolderId);
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
    if (quickFilter === "starred") list = list.filter((a) => isStarred("asset", a.id));
    return list;
  }, [assets, currentFolderId, q, quickFilter, starredSet]);

  // Direct child count per folder ("Folder • 12 items"), same idea as
  // Dropbox's "Team folder • 30 items" subtitle.
  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of folders) if (f.parent_folder_id) m.set(f.parent_folder_id, (m.get(f.parent_folder_id) ?? 0) + 1);
    for (const a of assets) if (a.folder_id) m.set(a.folder_id, (m.get(a.folder_id) ?? 0) + 1);
    return m;
  }, [folders, assets]);

  // Folders and files merged into one list, ordered per sortBy. "Modified"
  // (the default) additionally groups under date headers, matching
  // Dropbox's "Modified ↓ / Today / Older" pattern; any other sort shows a
  // single flat, explicitly-ordered list instead (grouping by date wouldn't
  // make sense once the order isn't by date).
  const sortedItems = useMemo(() => {
    const merged: GridItem[] = [
      ...visibleFolders.map((data): GridItem => ({ kind: "folder", data })),
      ...visibleAssets.map((data): GridItem => ({ kind: "asset", data })),
    ];
    switch (sortBy) {
      case "name-asc": return merged.sort((a, b) => a.data.name.localeCompare(b.data.name));
      case "name-desc": return merged.sort((a, b) => b.data.name.localeCompare(a.data.name));
      case "size-desc": return merged.sort((a, b) => itemSize(b) - itemSize(a));
      case "size-asc": return merged.sort((a, b) => itemSize(a) - itemSize(b));
      case "modified":
      default:
        return merged.sort((a, b) => new Date(b.data.updated_at).getTime() - new Date(a.data.updated_at).getTime());
    }
  }, [visibleFolders, visibleAssets, sortBy]);

  const groupedItems = useMemo(() => {
    if (sortBy !== "modified") return [{ label: null as string | null, items: sortedItems }];
    const now = Date.now();
    const DAY = 86_400_000;
    const bucketOf = (iso: string): string => {
      const age = now - new Date(iso).getTime();
      if (age < DAY) return "Today";
      if (age < 2 * DAY) return "Yesterday";
      if (age < 7 * DAY) return "This week";
      if (age < 31 * DAY) return "This month";
      return "Older";
    };
    const groups = new Map<string, GridItem[]>();
    for (const item of sortedItems) {
      const key = bucketOf(item.data.updated_at);
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    const order = ["Today", "Yesterday", "This week", "This month", "Older"];
    return order.filter((k) => groups.has(k)).map((k) => ({ label: k as string | null, items: groups.get(k)! }));
  }, [sortedItems, sortBy]);

  // "Suggested for you" - the most recently touched items across the whole
  // library (not just the current folder), same idea as Dropbox's own
  // suggestion row - real, honest "what's relevant right now" rather than
  // anything fabricated. Only shown while plainly browsing (not mid-search
  // or inside a Recents/Starred filter, where it'd be redundant).
  const suggestedItems: GridItem[] = useMemo(() => {
    if (q || quickFilter !== "all") return [];
    const merged: GridItem[] = [
      ...folders.map((data): GridItem => ({ kind: "folder", data })),
      ...assets.map((data): GridItem => ({ kind: "asset", data })),
    ];
    return merged
      .sort((a, b) => new Date(b.data.updated_at).getTime() - new Date(a.data.updated_at).getTime())
      .slice(0, 8);
  }, [folders, assets, q, quickFilter]);

  // A folder can't be moved into itself or into its own descendant.
  const descendantIds = (folderId: string): Set<string> => {
    const out = new Set<string>();
    const walk = (id: string) => {
      for (const f of folders) {
        if (f.parent_folder_id === id && !out.has(f.id)) {
          out.add(f.id);
          walk(f.id);
        }
      }
    };
    walk(folderId);
    return out;
  };

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !user) return;
    try {
      await createFolder.mutateAsync({ name: newFolderName, parentFolderId: currentFolderId, userId: user.id });
      toast.success(`Folder "${newFolderName.trim()}" created`);
      setNewFolderName("");
      setNewFolderOpen(false);
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "A folder with that name already exists here." : (e?.message ?? "Couldn't create folder"));
    }
  }

  async function uploadFiles(files: FileList | File[], targetFolderId: string | null = currentFolderId) {
    if (!user) return;
    const list = Array.from(files);
    for (const file of list) {
      if (!ALLOWED_TYPES.has(file.type)) {
        toast.error(`"${file.name}" isn't a supported file type.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" is over 500MB.`);
        continue;
      }
      const uploadState: UploadState = { file, loaded: 0, total: file.size };
      setUploads((prev) => [...prev, uploadState]);
      const path = `${targetFolderId ?? "root"}/${crypto.randomUUID()}-${file.name}`;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Not signed in");
        await uploadFileWithProgress(DIGITAL_ASSETS_BUCKET, path, file, accessToken, (loaded) => {
          setUploads((prev) => prev.map((u) => (u.file === file ? { ...u, loaded } : u)));
        });
        await createAssetRecord.mutateAsync({
          name: file.name,
          folderId: targetFolderId,
          filePath: path,
          contentType: file.type,
          sizeBytes: file.size,
          userId: user.id,
        });
        setUploads((prev) => prev.filter((u) => u.file !== file));
      } catch (e: any) {
        setUploads((prev) => prev.map((u) => (u.file === file ? { ...u, error: e?.message ?? "Upload failed" } : u)));
      }
    }
  }

  // Uploading a whole folder (webkitdirectory) - recreates the folder's own
  // sub-structure under the current folder, then uploads each file into the
  // right spot. Resolves/creates every needed sub-folder first (shallowest
  // first, so a parent always exists before its child is created, and each
  // path is only ever created once even if many files share it), then
  // uploads files against the resolved folder ids via the same uploadFiles
  // used for a plain file upload.
  async function uploadFolderTree(fileList: FileList) {
    if (!user) return;
    const files = Array.from(fileList);
    const withPaths = files
      .map((file) => ({ file, relPath: (file as any).webkitRelativePath as string | undefined }))
      .filter((f): f is { file: File; relPath: string } => !!f.relPath);
    if (withPaths.length === 0) return;

    // Unique directory paths, e.g. "MyFolder", "MyFolder/Sub" - shallowest first.
    const dirPaths = Array.from(new Set(
      withPaths.map(({ relPath }) => relPath.split("/").slice(0, -1).join("/")),
    )).sort((a, b) => a.split("/").length - b.split("/").length);

    const pathToFolderId = new Map<string, string | null>();
    pathToFolderId.set("", currentFolderId);

    for (const dirPath of dirPaths) {
      const parts = dirPath.split("/");
      let builtPath = "";
      for (const part of parts) {
        const parentPath = builtPath;
        builtPath = builtPath ? `${builtPath}/${part}` : part;
        if (pathToFolderId.has(builtPath)) continue;
        const parentId = pathToFolderId.get(parentPath) ?? null;
        // Already exists (from a prior sync, or someone else's upload) - reuse it rather than fail on the duplicate-name constraint.
        const existing = folders.find((f) => f.parent_folder_id === parentId && f.name.toLowerCase() === part.toLowerCase());
        if (existing) {
          pathToFolderId.set(builtPath, existing.id);
          continue;
        }
        try {
          const created = await createFolder.mutateAsync({ name: part, parentFolderId: parentId, userId: user.id });
          pathToFolderId.set(builtPath, created.id);
        } catch (e: any) {
          toast.error(`Couldn't create folder "${part}": ${e?.message ?? "unknown error"}`);
          pathToFolderId.set(builtPath, parentId); // fall back to the parent so its files still upload somewhere
        }
      }
    }

    // Group files by their resolved target folder and upload each group.
    const byFolder = new Map<string | null, File[]>();
    for (const { file, relPath } of withPaths) {
      const dirPath = relPath.split("/").slice(0, -1).join("/");
      const folderId = pathToFolderId.get(dirPath) ?? currentFolderId;
      const arr = byFolder.get(folderId) ?? [];
      arr.push(file);
      byFolder.set(folderId, arr);
    }
    for (const [folderId, groupFiles] of byFolder) {
      await uploadFiles(groupFiles, folderId);
    }
  }

  async function handleRenameSave() {
    if (!renameValue.trim()) return;
    try {
      if (renameFolder) {
        await renameFolderM.mutateAsync({ id: renameFolder.id, name: renameValue });
      } else if (renameAsset) {
        await renameAssetM.mutateAsync({ id: renameAsset.id, name: renameValue });
      }
      setRenameFolderTarget(null);
      setRenameAssetTarget(null);
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "Something with that name already exists here." : (e?.message ?? "Rename failed"));
    }
  }

  // Shared by both the "Move" dialog and drag-and-drop.
  async function moveItemTo(item: DragItem, destFolderId: string | null) {
    try {
      if (item.kind === "folder") {
        if (item.id === destFolderId) return;
        await moveFolderM.mutateAsync({ id: item.id, parentFolderId: destFolderId });
      } else {
        await moveAssetM.mutateAsync({ id: item.id, folderId: destFolderId });
      }
      toast.success(`Moved "${item.name}"`);
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "Something with that name already exists there." : (e?.message ?? "Move failed"));
    }
  }

  async function handleMoveTo(destFolderId: string | null) {
    const item: DragItem | null = moveFolderTarget
      ? { kind: "folder", id: moveFolderTarget.id, name: moveFolderTarget.name }
      : moveAssetTarget
      ? { kind: "asset", id: moveAssetTarget.id, name: moveAssetTarget.name }
      : null;
    if (!item) return;
    await moveItemTo(item, destFolderId);
    setMoveFolderTarget(null);
    setMoveAssetTarget(null);
  }

  function handleDragStart(e: React.DragEvent, item: DragItem) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
  }

  async function handleDropOnFolder(e: React.DragEvent, destFolderId: string | null) {
    if (!canManage) return;
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return; // an OS file drag, not an in-app move - let the outer zone's upload handler run
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    const item = JSON.parse(raw) as DragItem;
    if (item.kind === "folder" && (item.id === destFolderId || descendantIds(item.id).has(destFolderId ?? ""))) {
      toast.error("Can't move a folder into itself.");
      return;
    }
    await moveItemTo(item, destFolderId);
  }

  async function handleConfirmDelete() {
    try {
      if (deleteFolderTarget) {
        await deleteFolderM.mutateAsync(deleteFolderTarget.id);
        toast.success(`Deleted "${deleteFolderTarget.name}"`);
      } else if (deleteAssetTarget) {
        await deleteAssetM.mutateAsync(deleteAssetTarget);
        toast.success(`Deleted "${deleteAssetTarget.name}"`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setDeleteFolderTarget(null);
      setDeleteAssetTarget(null);
    }
  }

  async function handleDownload(a: DigitalAsset) {
    const { data } = await supabase.storage.from(DIGITAL_ASSETS_BUCKET).createSignedUrl(a.file_path, 300);
    if (data?.signedUrl) downloadFile(data.signedUrl, a.name);
    else toast.error("Couldn't get a download link");
  }

  const isLoading = foldersLoading || assetsLoading;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="page-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Digital Assets</h1>
          <p className="page-subtitle">Photos, videos, and marketing materials</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Upload className="h-4 w-4 mr-1.5" /> Upload <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <FileUp className="h-3.5 w-3.5 mr-2" /> File
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                  <FolderUp className="h-3.5 w-3.5 mr-2" /> Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-1.5" /> New folder
            </Button>
            <input
              ref={fileInputRef} type="file" multiple className="hidden"
              accept={[...ALLOWED_TYPES].join(",")}
              onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }}
            />
            <input
              ref={folderInputRef} type="file" multiple className="hidden"
              // @ts-expect-error - webkitdirectory/directory aren't in React's standard input typings, but are real, broadly-supported attributes for a folder picker.
              webkitdirectory="" directory=""
              onChange={(e) => { if (e.target.files?.length) uploadFolderTree(e.target.files); e.target.value = ""; }}
            />
          </div>
        )}
      </div>

      {suggestedItems.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Suggested for you</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => suggestedScrollRef.current?.scrollBy({ left: -280, behavior: "smooth" })}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => suggestedScrollRef.current?.scrollBy({ left: 280, behavior: "smooth" })}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div ref={suggestedScrollRef} className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
            {suggestedItems.map((item) => (
              <div key={`${item.kind}-${item.data.id}`} className="group relative w-64 shrink-0">
                <button
                  type="button"
                  onClick={() => item.kind === "folder" ? (setCurrentFolderId(item.data.id), setQuickFilter("all")) : setPreviewAsset(item.data)}
                  className="flex items-start gap-2.5 w-full border border-border bg-card hover:border-foreground/30 transition-colors p-2.5 pr-8 text-left"
                >
                  <SuggestedThumb item={item} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug line-clamp-3" title={item.data.name}>{item.data.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.kind === "folder" ? "Folder" : fileCategory(item.data.content_type).label}
                      {item.kind === "folder" && item.data.parent_folder_id && foldersById.get(item.data.parent_folder_id)
                        ? ` • ${foldersById.get(item.data.parent_folder_id)!.name}` : ""}
                    </p>
                  </div>
                </button>
                {/* Sibling, not nested in the button above - a button inside a
                    button is invalid and breaks keyboard/screen-reader focus. */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void copyFullName(item.data.name); }}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-sm border border-border/60 bg-card text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30 focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`Show and copy full filename: ${item.data.name}`}
                  title={item.data.name}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar - quick filters, search, sort, and view toggle grouped into
          one bordered strip so the page reads as "controls" vs. "content"
          at a glance. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant={quickFilter === "recents" ? "secondary" : "ghost"} size="sm" className="h-8"
            onClick={() => setQuickFilter((f) => (f === "recents" ? "all" : "recents"))}
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" /> Recents
          </Button>
          <Button
            variant={quickFilter === "starred" ? "secondary" : "ghost"} size="sm" className="h-8"
            onClick={() => setQuickFilter((f) => (f === "starred" ? "all" : "starred"))}
          >
            <Star className="h-3.5 w-3.5 mr-1.5" /> Starred
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search all files and folders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[220px] pl-8 text-xs"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-8 w-auto gap-1.5 text-xs px-2.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="modified">Modified</SelectItem>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="name-desc">Name Z–A</SelectItem>
              <SelectItem value="size-desc">Size: largest</SelectItem>
              <SelectItem value="size-asc">Size: smallest</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode("list")} aria-label="List view">
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode("grid")} aria-label="Grid view">
              <Grid3x3 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-0.5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {currentFolderId === null && !q && quickFilter === "all" ? (
                <BreadcrumbPage className="flex items-center gap-1"><Home className="h-3.5 w-3.5" /> All files</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <button
                    type="button" onClick={() => { setCurrentFolderId(null); setSearch(""); setQuickFilter("all"); }}
                    onDragOver={(e) => { if (canManage && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDragOverFolderId("root"); } }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={(e) => handleDropOnFolder(e, null)}
                    className={cn("flex items-center gap-1 px-1 -mx-1", dragOverFolderId === "root" && "bg-primary/10 ring-1 ring-primary")}
                  >
                    <Home className="h-3.5 w-3.5" /> All files
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {breadcrumbPath.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1.5">
                <BreadcrumbSeparator><ChevronRight className="h-3.5 w-3.5" /></BreadcrumbSeparator>
                <BreadcrumbItem>
                  {i === breadcrumbPath.length - 1 ? (
                    <BreadcrumbPage>{f.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <button
                        type="button" onClick={() => { setCurrentFolderId(f.id); setSearch(""); setQuickFilter("all"); }}
                        onDragOver={(e) => { if (canManage && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDragOverFolderId(f.id); } }}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={(e) => handleDropOnFolder(e, f.id)}
                        className={cn("px-1 -mx-1", dragOverFolderId === f.id && "bg-primary/10 ring-1 ring-primary")}
                      >
                        {f.name}
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {uploads.length > 0 && (
        <Card className="p-3 space-y-2">
          {uploads.map((u) => (
            <div key={u.file.name + u.file.size} className="flex items-center gap-3 text-xs">
              <span className="truncate flex-1">{u.file.name}</span>
              {u.error ? (
                <span className="text-destructive">{u.error}</span>
              ) : (
                <>
                  <div className="h-1.5 w-32 bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${u.total ? (u.loaded / u.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-muted-foreground w-10 text-right">{u.total ? Math.round((u.loaded / u.total) * 100) : 0}%</span>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setUploads((prev) => prev.filter((x) => x !== u))}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <div
        onDragOver={(e) => {
          if (!canManage) return;
          e.preventDefault();
          // Dragging an existing file/folder over empty space (not onto a
          // folder tile) - not an upload, so don't show the upload-styled
          // highlight. FolderTile's own onDrop handles the actual move.
          if (!e.dataTransfer.types.includes(DRAG_MIME)) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          if (!canManage) return;
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.types.includes(DRAG_MIME)) return; // handled by whatever folder tile it landed on, if any
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        className={cn("transition-colors", dragActive && "ring-2 ring-primary ring-offset-2 bg-primary/5")}
      >
        {isLoading ? (
          viewMode === "grid" ? (
            <div className="grid sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          )
        ) : visibleFolders.length === 0 && visibleAssets.length === 0 ? (
          <Card className="p-16 text-center text-muted-foreground">
            {q ? "No files or folders match your search." : canManage
              ? (dragActive ? "Drop files to upload" : "This folder is empty - drag files here or use Upload.")
              : "This folder is empty."}
          </Card>
        ) : (
          <div data-testid="asset-list">
            {viewMode === "grid" ? (
              <div className="space-y-6">
                {groupedItems.map(({ label, items }) => (
                  <div key={label ?? "flat"} className="space-y-2">
                    {label && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span>{label}</span>
                      </div>
                    )}
                    <div className="grid sm:grid-cols-4 lg:grid-cols-6 gap-3">
                      {items.map((item) => item.kind === "folder" ? (
                        <FolderTile
                          key={item.data.id} folder={item.data} canManage={canManage} itemCount={childCounts.get(item.data.id) ?? 0} starred={isStarred("folder", item.data.id)} onToggleStar={() => handleToggleStar("folder", item.data.id)}
                          onOpen={() => { setCurrentFolderId(item.data.id); setSearch(""); setQuickFilter("all"); }}
                          onRename={() => { setRenameFolderTarget(item.data); setRenameValue(item.data.name); }}
                          onMove={() => setMoveFolderTarget(item.data)}
                          onDelete={() => setDeleteFolderTarget(item.data)}
                          onDragStart={(e) => handleDragStart(e, { kind: "folder", id: item.data.id, name: item.data.name })}
                          onDragOverTarget={(e) => { if (canManage && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDragOverFolderId(item.data.id); } }}
                          onDragLeaveTarget={() => setDragOverFolderId(null)}
                          onDropTarget={(e) => handleDropOnFolder(e, item.data.id)}
                          isDragOver={dragOverFolderId === item.data.id}
                        />
                      ) : (
                        <AssetTile
                          key={item.data.id} asset={item.data} canManage={canManage} starred={isStarred("asset", item.data.id)} onToggleStar={() => handleToggleStar("asset", item.data.id)}
                          onOpen={() => setPreviewAsset(item.data)}
                          onDownload={() => handleDownload(item.data)}
                          onRename={() => { setRenameAssetTarget(item.data); setRenameValue(item.data.name); }}
                          onMove={() => setMoveAssetTarget(item.data)}
                          onDelete={() => setDeleteAssetTarget(item.data)}
                          onDragStart={(e) => handleDragStart(e, { kind: "asset", id: item.data.id, name: item.data.name })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // One shared header + one bordered Card for the whole list -
              // the "Today"/"Yesterday" date labels are lightweight dividers
              // inside it, not a reason to repeat the Name/Type/Size/
              // Modified header for every bucket.
              <Card className="overflow-hidden">
                <ListHeaderRow />
                {groupedItems.map(({ label, items }) => (
                  <div key={label ?? "flat"}>
                    {label && (
                      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                        <span>{label}</span>
                      </div>
                    )}
                    <div className="divide-y divide-border">
                      {items.map((item) => item.kind === "folder" ? (
                        <FolderRow
                          key={item.data.id} folder={item.data} canManage={canManage} itemCount={childCounts.get(item.data.id) ?? 0} starred={isStarred("folder", item.data.id)} onToggleStar={() => handleToggleStar("folder", item.data.id)}
                          onOpen={() => { setCurrentFolderId(item.data.id); setSearch(""); setQuickFilter("all"); }}
                          onRename={() => { setRenameFolderTarget(item.data); setRenameValue(item.data.name); }}
                          onMove={() => setMoveFolderTarget(item.data)}
                          onDelete={() => setDeleteFolderTarget(item.data)}
                          onDragStart={(e) => handleDragStart(e, { kind: "folder", id: item.data.id, name: item.data.name })}
                          onDragOverTarget={(e) => { if (canManage && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDragOverFolderId(item.data.id); } }}
                          onDragLeaveTarget={() => setDragOverFolderId(null)}
                          onDropTarget={(e) => handleDropOnFolder(e, item.data.id)}
                          isDragOver={dragOverFolderId === item.data.id}
                        />
                      ) : (
                        <AssetRow
                          key={item.data.id} asset={item.data} canManage={canManage} starred={isStarred("asset", item.data.id)} onToggleStar={() => handleToggleStar("asset", item.data.id)}
                          onOpen={() => setPreviewAsset(item.data)}
                          onDownload={() => handleDownload(item.data)}
                          onRename={() => { setRenameAssetTarget(item.data); setRenameValue(item.data.name); }}
                          onMove={() => setMoveAssetTarget(item.data)}
                          onDelete={() => setDeleteAssetTarget(item.data)}
                          onDragStart={(e) => handleDragStart(e, { kind: "asset", id: item.data.id, name: item.data.name })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </div>

      {/* New folder */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <Input
            autoFocus placeholder="Folder name" value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || createFolder.isPending}>
              {createFolder.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={!!renameFolder || !!renameAsset} onOpenChange={(o) => { if (!o) { setRenameFolderTarget(null); setRenameAssetTarget(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rename {renameFolder ? "folder" : "file"}</DialogTitle></DialogHeader>
          <Input
            autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameSave(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenameFolderTarget(null); setRenameAssetTarget(null); }}>Cancel</Button>
            <Button onClick={handleRenameSave} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog open={!!moveFolderTarget || !!moveAssetTarget} onOpenChange={(o) => { if (!o) { setMoveFolderTarget(null); setMoveAssetTarget(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move "{moveFolderTarget?.name ?? moveAssetTarget?.name}"</DialogTitle>
            <DialogDescription>Choose a destination folder.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto border border-border divide-y divide-border">
            <MoveDestinationRow label="All files (root)" depth={0} onClick={() => handleMoveTo(null)} />
            {folders
              .filter((f) => !moveFolderTarget || (f.id !== moveFolderTarget.id && !descendantIds(moveFolderTarget.id).has(f.id)))
              .map((f) => {
                let depth = 0;
                let cur: DigitalFolder | undefined = f;
                while (cur?.parent_folder_id) { depth++; cur = foldersById.get(cur.parent_folder_id); }
                return <MoveDestinationRow key={f.id} label={f.name} depth={depth} onClick={() => handleMoveTo(f.id)} />;
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMoveFolderTarget(null); setMoveAssetTarget(null); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteFolderTarget || !!deleteAssetTarget} onOpenChange={(o) => { if (!o) { setDeleteFolderTarget(null); setDeleteAssetTarget(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteFolderTarget?.name ?? deleteAssetTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFolderTarget
                ? "This folder and everything inside it (sub-folders and files) will be permanently deleted. This can't be undone."
                : "This file will be permanently deleted. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview - side drawer, not a centered modal, so browsing the rest of
          the library doesn't feel fully interrupted. Same content (
          AssetPreviewBody) and same single Download action as before. */}
      <Sheet open={!!previewAsset} onOpenChange={(o) => { if (!o) setPreviewAsset(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-y-auto">
          {previewAsset && (
            <>
              <SheetHeader className="p-5 pb-3 border-b space-y-2">
                <SheetTitle className="truncate pr-8 text-left">{previewAsset.name}</SheetTitle>
                <div className="flex items-center gap-2">
                  <FileTypeBadge contentType={previewAsset.content_type} />
                  <span className="text-xs text-muted-foreground">{formatBytes(previewAsset.size_bytes)}</span>
                </div>
              </SheetHeader>
              <div className="p-5">
                <AssetPreviewBody asset={previewAsset} />
              </div>
              <div className="p-5 pt-0">
                <Button variant="outline" onClick={() => handleDownload(previewAsset)}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Grid-template shared by the list header and every list row, so columns
// always line up: generous Name column first (the brief's core requirement
// - distinguishing similar filenames without opening each one), then Type/
// Size/Modified, then a fixed-width Actions column. A real Tailwind class
// (not an inline style) so it can vary by breakpoint - below sm, Type/Size/
// Modified are display:none (via the "hidden sm:block" on each cell), and
// without a matching 2-column template here too, CSS Grid's auto-placement
// drops the still-visible Name/Actions cells into the *first two* explicit
// tracks (a 96px one meant for Type) instead of their intended tracks -
// verified on a real phone-width screenshot, where Name silently vanished.
const LIST_ROW_GRID = "grid-cols-[minmax(0,1fr)_28px] sm:grid-cols-[minmax(0,1fr)_96px_88px_112px_32px]";

function ListHeaderRow() {
  return (
    <div
      className={cn("hidden sm:grid items-center gap-3 px-4 py-2 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground", LIST_ROW_GRID)}
    >
      <span>Name</span>
      <span>Type</span>
      <span className="text-right">Size</span>
      <span>Modified</span>
      <span />
    </div>
  );
}

function SuggestedThumb({ item }: { item: GridItem }) {
  if (item.kind === "folder") {
    return (
      <div className="h-9 w-9 shrink-0 border border-border flex items-center justify-center bg-muted/40">
        <Folder className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  const { icon: Icon } = fileCategory(item.data.content_type);
  const thumbUrl = useSignedUrl(isImage(item.data.content_type) ? item.data.file_path : null).data;
  return (
    <div className="h-9 w-9 shrink-0 border border-border flex items-center justify-center overflow-hidden bg-muted/40">
      {thumbUrl ? <img src={thumbUrl} alt={item.data.name} className="h-full w-full object-cover" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}

function FileTypeBadge({ contentType }: { contentType: string | null }) {
  const { label } = fileCategory(contentType);
  return <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Badge>;
}

function MoveDestinationRow({ label, depth, onClick }: { label: string; depth: number; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {label}
    </button>
  );
}

function ItemMenu({ onDownload, onRename, onMove, onDelete, onToggleStar, starred, canManage }: {
  onDownload?: () => void; onRename: () => void; onMove: () => void; onDelete: () => void;
  onToggleStar: () => void; starred: boolean; canManage: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onToggleStar}>
          <Star className={cn("h-3.5 w-3.5 mr-2", starred && "fill-warning text-warning")} /> {starred ? "Unstar" : "Star"}
        </DropdownMenuItem>
        {onDownload && <DropdownMenuItem onClick={onDownload}><Download className="h-3.5 w-3.5 mr-2" /> Download</DropdownMenuItem>}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRename}><Pencil className="h-3.5 w-3.5 mr-2" /> Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}><FolderInput className="h-3.5 w-3.5 mr-2" /> Move</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DragDropProps {
  canManage: boolean;
  onDragStart: (e: React.DragEvent) => void;
  /** Only folders accept a drop. */
  onDragOverTarget?: (e: React.DragEvent) => void;
  onDragLeaveTarget?: () => void;
  onDropTarget?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
}

interface StarProps { starred: boolean; onToggleStar: () => void; }

// Compact, refined folder tile - a small neutral icon, not a large colored
// illustration, per the redesign brief ("oversized blue folder cards" was
// the named problem). Name gets two-line clamp + a title attribute so a
// long/similar folder name is still fully readable on hover even when
// wrapped text is cut off.
function FolderTile({ folder, canManage, itemCount, starred, onToggleStar, onOpen, onRename, onMove, onDelete, onDragStart, onDragOverTarget, onDragLeaveTarget, onDropTarget, isDragOver }: {
  folder: DigitalFolder; itemCount: number; onOpen: () => void; onRename: () => void; onMove: () => void; onDelete: () => void;
} & DragDropProps & StarProps) {
  return (
    <Card
      onClick={onOpen}
      draggable={canManage} onDragStart={onDragStart}
      onDragOver={onDragOverTarget} onDragLeave={onDragLeaveTarget} onDrop={onDropTarget}
      className={cn(
        "cursor-pointer transition-colors duration-150 hover:border-foreground/30 relative group p-3 flex items-start gap-2.5",
        isDragOver && "ring-2 ring-primary bg-primary/5",
      )}
    >
      <div className="h-9 w-9 shrink-0 border border-border flex items-center justify-center bg-muted/40">
        <Folder className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 pr-5">
        <p className="text-sm leading-snug line-clamp-2" title={folder.name}>{folder.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Empty"}</p>
      </div>
      {starred && <Star className="absolute top-2 right-2 h-3.5 w-3.5 fill-warning text-warning" />}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-card">
        <ItemMenu onRename={onRename} onMove={onMove} onDelete={onDelete} canManage={canManage} starred={starred} onToggleStar={onToggleStar} />
      </div>
    </Card>
  );
}

function AssetTile({ asset, canManage, starred, onToggleStar, onOpen, onDownload, onRename, onMove, onDelete, onDragStart }: {
  asset: DigitalAsset; onOpen: () => void; onDownload: () => void; onRename: () => void; onMove: () => void; onDelete: () => void;
} & DragDropProps & StarProps) {
  const { icon: Icon } = fileCategory(asset.content_type);
  const thumbUrl = useSignedUrl(isImage(asset.content_type) ? asset.file_path : null).data;
  return (
    <Card
      onClick={onOpen} draggable={canManage} onDragStart={onDragStart}
      className="overflow-hidden cursor-pointer transition-colors duration-150 hover:border-foreground/30 relative group"
    >
      {starred && <Star className="absolute top-1.5 left-1.5 z-10 h-3.5 w-3.5 fill-warning text-warning drop-shadow" />}
      <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-card">
        <ItemMenu onDownload={onDownload} onRename={onRename} onMove={onMove} onDelete={onDelete} canManage={canManage} starred={starred} onToggleStar={onToggleStar} />
      </div>
      <div className="h-20 flex items-center justify-center overflow-hidden bg-muted/40">
        {thumbUrl ? <img src={thumbUrl} alt={asset.name} className="h-full w-full object-cover" /> : <Icon className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="p-2.5 space-y-1 border-t border-border">
        <p className="text-sm leading-snug line-clamp-2" title={asset.name}>{asset.name}</p>
        <div className="flex items-center gap-1.5">
          <FileTypeBadge contentType={asset.content_type} />
          <span className="text-xs text-muted-foreground">{formatBytes(asset.size_bytes)}</span>
        </div>
      </div>
    </Card>
  );
}

// List row grid matches LIST_COLUMNS/ListHeaderRow exactly, so Name/Type/
// Size/Modified/Actions always align with their header labels. Name is the
// widest column by design (the brief's "generous width" requirement) and
// wraps to two lines rather than single-line-truncating, with a title
// attribute carrying the full name for anything still cut off.
function FolderRow({ folder, canManage, itemCount, starred, onToggleStar, onOpen, onRename, onMove, onDelete, onDragStart, onDragOverTarget, onDragLeaveTarget, onDropTarget, isDragOver }: {
  folder: DigitalFolder; itemCount: number; onOpen: () => void; onRename: () => void; onMove: () => void; onDelete: () => void;
} & DragDropProps & StarProps) {
  return (
    <div
      onClick={onOpen}
      draggable={canManage} onDragStart={onDragStart}
      onDragOver={onDragOverTarget} onDragLeave={onDragLeaveTarget} onDrop={onDropTarget}
      className={cn("grid items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-150 hover:bg-muted/40", LIST_ROW_GRID, isDragOver && "ring-2 ring-primary bg-primary/5")}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm leading-snug line-clamp-2 min-w-0" title={folder.name}>{folder.name}</span>
        {starred && <Star className="h-3.5 w-3.5 fill-warning text-warning shrink-0" />}
      </span>
      <span className="hidden sm:block text-xs text-muted-foreground">Folder</span>
      <span className="hidden sm:block text-xs text-muted-foreground text-right">{itemCount > 0 ? `${itemCount} items` : "—"}</span>
      <span className="hidden sm:block text-xs text-muted-foreground">{format(new Date(folder.updated_at), "MMM d, yyyy")}</span>
      <ItemMenu onRename={onRename} onMove={onMove} onDelete={onDelete} canManage={canManage} starred={starred} onToggleStar={onToggleStar} />
    </div>
  );
}

function AssetRow({ asset, canManage, starred, onToggleStar, onOpen, onDownload, onRename, onMove, onDelete, onDragStart }: {
  asset: DigitalAsset; onOpen: () => void; onDownload: () => void; onRename: () => void; onMove: () => void; onDelete: () => void;
} & DragDropProps & StarProps) {
  const { icon: Icon } = fileCategory(asset.content_type);
  return (
    <div
      onClick={onOpen} draggable={canManage} onDragStart={onDragStart}
      className={cn("grid items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-150 hover:bg-muted/40", LIST_ROW_GRID)}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm leading-snug line-clamp-2 min-w-0" title={asset.name}>{asset.name}</span>
        {starred && <Star className="h-3.5 w-3.5 fill-warning text-warning shrink-0" />}
      </span>
      <span className="hidden sm:block"><FileTypeBadge contentType={asset.content_type} /></span>
      <span className="hidden sm:block text-xs text-muted-foreground text-right">{formatBytes(asset.size_bytes)}</span>
      <span className="hidden sm:block text-xs text-muted-foreground">{format(new Date(asset.updated_at), "MMM d, yyyy")}</span>
      <ItemMenu onDownload={onDownload} onRename={onRename} onMove={onMove} onDelete={onDelete} canManage={canManage} starred={starred} onToggleStar={onToggleStar} />
    </div>
  );
}

function AssetPreviewBody({ asset }: { asset: DigitalAsset }) {
  const { data: url, isLoading } = useSignedUrl(asset.file_path);
  const { icon: Icon, label } = fileCategory(asset.content_type);
  // Bug sweep fix (Finding 6): a valid signed URL doesn't guarantee the
  // underlying object itself still loads (deleted/corrupted out-of-band,
  // 404 from storage, truncated file) - none of img/video/iframe had an
  // error path, so that case silently rendered a broken image icon / empty
  // player / blank frame with no indication anything was wrong.
  const [loadFailed, setLoadFailed] = useState(false);
  if (isLoading) return <div className="h-80 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!url || loadFailed) return <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">Couldn't load preview</div>;
  if (isImage(asset.content_type)) return <img src={url} alt={asset.name} onError={() => setLoadFailed(true)} className="max-h-[70vh] w-full object-contain bg-muted" />;
  if (isVideo(asset.content_type)) return <video src={url} controls onError={() => setLoadFailed(true)} className="max-h-[70vh] w-full bg-black" />;
  if (isPdf(asset.content_type)) return <iframe src={url} onError={() => setLoadFailed(true)} className="w-full h-[70vh] border border-border" title={asset.name} />;
  return (
    <div className="h-60 flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <Icon className="h-10 w-10" />
      <span className="text-sm">{label} - no inline preview, download to open</span>
    </div>
  );
}
