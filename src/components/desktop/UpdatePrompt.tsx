import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktop } from "@/lib/desktop";
import { useAppUpdater } from "@/lib/desktop/useAppUpdater";

const FIRST_CHECK_MS = 6_000;
const RECHECK_MS = 4 * 60 * 60_000;
const DISMISSED_KEY = "lc.updateDismissed";

// Desktop app only: checks for a newer published version shortly after the
// app opens (and every few hours), then offers a one-click update.
export function UpdatePrompt() {
  const { state, checkForUpdates, installUpdate } = useAppUpdater();
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY); } catch { return null; }
  });

  useEffect(() => {
    if (!isDesktop()) return;
    const first = window.setTimeout(checkForUpdates, FIRST_CHECK_MS);
    const again = window.setInterval(checkForUpdates, RECHECK_MS);
    return () => { window.clearTimeout(first); window.clearInterval(again); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isDesktop()) return null;
  const downloading = state.status === "downloading";
  if (state.status !== "available" && !downloading) return null;
  if (state.status === "available" && dismissed === state.version) return null;

  const later = () => {
    if (state.status !== "available") return;
    try { sessionStorage.setItem(DISMISSED_KEY, state.version); } catch { /* ignore */ }
    setDismissed(state.version);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[340px] rounded-xl border bg-card p-4 shadow-xl" role="status">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 shrink-0 rounded-lg bg-muted flex items-center justify-center"><Download className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{downloading ? "Installing update..." : `Version ${state.status === "available" ? state.version : ""} is ready`}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {downloading ? "The app will restart when it's done." : "Update now to get the latest features. The app restarts after installing."}
          </p>
          {!downloading && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={installUpdate}>Update now</Button>
              <Button size="sm" variant="ghost" onClick={later}>Later</Button>
            </div>
          )}
          {downloading && <Loader2 className="h-4 w-4 animate-spin mt-3 text-muted-foreground" />}
        </div>
      </div>
    </div>
  );
}
