// Desktop platform abstraction. Every Tauri-specific API call in the app
// should go through this module rather than being sprinkled into ordinary
// components — that keeps the web build (which has none of these APIs
// available) working unmodified, and gives us one place to update if the
// underlying native APIs change.
//
// On the web, every function here degrades to the closest normal browser
// behavior (window.open, an <a download> blob trick, etc.) rather than
// throwing — callers don't need to branch on platform themselves.

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Opens a URL in the user's default system browser (desktop) or a new tab
 * (web). Never navigates the app's own window/webview to an external site —
 * that's both a UX and security requirement (see src-tauri capabilities).
 */
export async function openExternal(url: string): Promise<void> {
  if (isDesktop()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export interface SaveFileOptions {
  suggestedName: string;
  contents: string | Uint8Array;
  mimeType?: string;
  /** Tauri save-dialog filter, e.g. [{ name: "CSV", extensions: ["csv"] }] */
  filters?: { name: string; extensions: string[] }[];
}

/**
 * Saves a file using a native "Save As" dialog on desktop, or triggers a
 * normal browser download on web. Desktop writes are restricted by the
 * app's Tauri capabilities to the Downloads/Documents folders.
 */
export async function saveFile(options: SaveFileOptions): Promise<void> {
  if (isDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: options.suggestedName, filters: options.filters });
    if (!path) return; // user cancelled
    if (typeof options.contents === "string") {
      await writeTextFile(path, options.contents);
    } else {
      await writeFile(path, options.contents);
    }
    return;
  }

  const blob = typeof options.contents === "string"
    ? new Blob([options.contents], { type: options.mimeType ?? "text/plain" })
    : new Blob([options.contents], { type: options.mimeType ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options.suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface DesktopAppInfo {
  version: string;
  platform: string;
}

let cachedAppInfo: DesktopAppInfo | null = null;

export async function getDesktopAppInfo(): Promise<DesktopAppInfo | null> {
  if (!isDesktop()) return null;
  if (cachedAppInfo) return cachedAppInfo;
  const [{ getVersion }, { platform }] = await Promise.all([
    import("@tauri-apps/api/app"),
    import("@tauri-apps/plugin-os"),
  ]);
  cachedAppInfo = { version: await getVersion(), platform: platform() };
  return cachedAppInfo;
}

/** Sets the native window title to "<page> — Lineage Collections". No-op on web (browser tab title is set separately via document.title). */
export async function setWindowTitle(pageTitle: string): Promise<void> {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(pageTitle ? `${pageTitle} — Lineage Collections` : "Lineage Collections");
}
