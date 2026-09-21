import { useState } from "react";
import { isDesktop } from "@/lib/desktop";

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string; notes?: string }
  | { status: "downloading" }
  | { status: "error"; message: string };

/**
 * Wraps @tauri-apps/plugin-updater. No-ops on web. Used by the Settings
 * "Check for Updates" button and by UpdatePrompt, which checks shortly after
 * the app opens and every few hours.
 */
export function useAppUpdater() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  const checkForUpdates = async () => {
    if (!isDesktop()) return;
    setState({ status: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        setState({ status: "available", version: update.version, notes: update.body ?? undefined });
      } else {
        setState({ status: "up-to-date" });
      }
    } catch (err) {
      // Deliberately not exposing the raw error to the user — per the
      // desktop error-handling spec: "The application could not update.
      // Your existing version remains installed." Technical detail stays
      // in the console for troubleshooting.
      console.error("[updater] check failed:", err);
      setState({ status: "error", message: "The application could not check for updates. Your existing version remains installed." });
    }
  };

  const installUpdate = async () => {
    if (!isDesktop()) return;
    setState({ status: "downloading" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();
      if (!update?.available) {
        setState({ status: "up-to-date" });
        return;
      }
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      console.error("[updater] install failed:", err);
      setState({ status: "error", message: "The application could not update. Your existing version remains installed." });
    }
  };

  return { state, checkForUpdates, installUpdate };
}
