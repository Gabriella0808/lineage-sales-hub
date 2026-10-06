/**
 * Shared file-type/upload/download helpers, used by Digital Assets.
 * (Team Updates has its own, earlier, bucket-specific copy of similar logic
 * - not touched here, to avoid any risk to that already-working feature.)
 */
import {
  FileText, FileSpreadsheet, FileArchive, File as FileIcon,
  FileVideo, type LucideIcon,
} from "lucide-react";

export function isImage(contentType: string | null) {
  return !!contentType && contentType.startsWith("image/");
}

export function isPdf(contentType: string | null) {
  return contentType === "application/pdf";
}

export function isVideo(contentType: string | null) {
  return !!contentType && contentType.startsWith("video/");
}

export const DOC_TYPES = new Set(["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
export const SHEET_TYPES = new Set(["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"]);
export const SLIDE_TYPES = new Set(["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
export const ARCHIVE_TYPES = new Set(["application/zip", "application/x-zip-compressed"]);

export function fileCategory(contentType: string | null): { icon: LucideIcon; className: string; label: string } {
  if (isPdf(contentType)) return { icon: FileText, className: "bg-destructive/10 text-destructive", label: "PDF" };
  if (isVideo(contentType)) return { icon: FileVideo, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400", label: "Video" };
  if (contentType && DOC_TYPES.has(contentType)) return { icon: FileText, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400", label: "Word" };
  if (contentType && SHEET_TYPES.has(contentType)) return { icon: FileSpreadsheet, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "Excel" };
  if (contentType && SLIDE_TYPES.has(contentType)) return { icon: FileText, className: "bg-orange-500/10 text-orange-600 dark:text-orange-400", label: "PowerPoint" };
  if (contentType && ARCHIVE_TYPES.has(contentType)) return { icon: FileArchive, className: "bg-muted text-muted-foreground", label: "Archive" };
  return { icon: FileIcon, className: "bg-muted text-muted-foreground", label: "File" };
}

export function formatBytes(n: number | null) {
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
export async function downloadFile(url: string, fileName: string) {
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** supabase-js's own storage.upload() is plain fetch under the hood, with no
 *  progress callback - for a large file that leaves the upload UI looking
 *  hung for however long the upload actually takes. This hits the same
 *  Storage REST endpoint directly via XHR (which does support upload
 *  progress events) purely to report real progress; auth and body shape
 *  otherwise match what storage-js itself sends. */
export function uploadFileWithProgress(
  bucket: string,
  path: string,
  file: File,
  accessToken: string,
  onProgress: (loadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", encodeURI(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`));
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
