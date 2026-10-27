import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resolveLastActivityAt } from "@/lib/idleClock";

const ACTIVITY_KEY = "lc.lastActivityAt";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // sign out after 30 min with no REAL portal activity
const WARNING_MS = 60 * 1000;           // warn 60s before that actually happens
const WRITE_THROTTLE_MS = 5_000;        // don't hammer localStorage on every keystroke

// Deliberately excludes mousemove/scroll/wheel: those fire from a hand
// resting near a trackpad or momentum scroll settling, with no real intent
// behind them - a tab sitting open but untouched would otherwise never
// time out. mousedown/keydown/touchstart require an actual click, tap, or
// keypress, which is what opening a section, uploading, or downloading all
// start with. Page navigation is tracked separately below (pathname) since
// it isn't reliably covered by a click - browser back/forward wouldn't be.
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart"] as const;

function writeLastActivity(ts: number) {
  try { localStorage.setItem(ACTIVITY_KEY, String(ts)); } catch { /* private mode etc - just won't sync across tabs */ }
}

function readLastActivity(): number | null {
  try {
    const n = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

/**
 * Signs the user out after IDLE_TIMEOUT_MS of no REAL portal activity, with
 * a WARNING_MS countdown dialog first so nobody loses unsaved work by
 * surprise. "Activity" means a deliberate click/tap/keypress or navigating
 * to a different page - not merely having the tab open - recorded to
 * localStorage so every open tab shares one clock. Once the warning dialog
 * is up in a given tab, it's sticky: only an explicit "Stay signed in"
 * click dismisses it there.
 *
 * The actual countdown/timeout logic runs inside idleTimer.worker.ts, not
 * on the main thread. Browsers throttle (or near-fully suspend) a page's
 * own setInterval once its tab is backgrounded, which is exactly why a
 * main-thread-only timer can show the warning dialog but then never
 * actually reach 0 and sign out while the tab is hidden or another tab is
 * active - it just sits there until something re-checks it, which may not
 * happen for a long time. A dedicated worker thread's timers aren't subject
 * to that same background-tab throttling, so the warning appears and the
 * sign-out fires on schedule regardless of which tab is focused.
 *
 * Mounted once in AppLayout's Shell, so it's only ever active while there's
 * a real session (every route it covers is already behind ProtectedRoute).
 */
export function IdleLogoutManager() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);
  // Mirrors secondsLeft !== null, readable inside event handlers without
  // needing secondsLeft in the effect's dependency array.
  const warningShownRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const prevPathnameRef = useRef(location.pathname);

  // Stable across renders (refs only) so it can be a dependency of both the
  // DOM-event listeners below and the route-change effect without either
  // one re-running on every render.
  const recordActivity = useCallback(() => {
    // Once the warning is up, nothing but the button dismisses it - not a
    // click, a keypress, a route change, or another tab's activity.
    if (warningShownRef.current) return;
    const now = Date.now();
    if (now - lastWriteRef.current < WRITE_THROTTLE_MS) return;
    lastWriteRef.current = now;
    writeLastActivity(now);
    workerRef.current?.postMessage({ type: "activity", ts: now });
  }, []);

  useEffect(() => {
    if (!session) {
      warningShownRef.current = false;
      setSecondsLeft(null);
      return;
    }

    // If already past the idle threshold, the worker's first tick (within
    // ~1s) signs out immediately instead of starting a fresh countdown.
    const lastActivityAt = resolveLastActivityAt(readLastActivity(), Date.now());
    writeLastActivity(lastActivityAt);
    loggingOutRef.current = false;
    warningShownRef.current = false;

    const worker = new Worker(new URL("../workers/idleTimer.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.postMessage({ type: "init", idleTimeoutMs: IDLE_TIMEOUT_MS, warningMs: WARNING_MS, lastActivityAt });

    worker.onmessage = (e: MessageEvent) => {
      if (loggingOutRef.current) return;
      const msg = e.data;
      if (msg.type === "timeout") {
        loggingOutRef.current = true;
        warningShownRef.current = false;
        setSecondsLeft(null);
        // Local-only: this tab's own idle timeout must not end a session in
        // a different, actively-used tab that never showed its own warning.
        void signOut({ scope: "local" });
      } else if (msg.type === "warn") {
        warningShownRef.current = true;
        setSecondsLeft(msg.secondsLeft);
      } else if (msg.type === "clear-warning") {
        warningShownRef.current = false;
        setSecondsLeft(null);
      }
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, recordActivity, { passive: true }));

    // Cross-tab: when another tab records activity, localStorage's
    // "storage" event fires in this tab immediately and synchronously - it
    // isn't a polled timer, so it isn't subject to background-tab timer
    // throttling either. Forward it straight into this tab's worker.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ACTIVITY_KEY || warningShownRef.current) return;
      const ts = Number(e.newValue);
      if (Number.isFinite(ts)) worker.postMessage({ type: "activity", ts });
    };
    window.addEventListener("storage", onStorage);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, recordActivity));
      window.removeEventListener("storage", onStorage);
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
    };
  }, [session, signOut, recordActivity]);

  // Moving to a different page counts as real activity too - a click
  // already covers most navigation, but this also catches browser
  // back/forward and programmatic redirects that don't start with a click
  // inside this page. Skipped on the pathname's first render (prevPathnameRef
  // is seeded with it) so a fresh mount - e.g. reloading a phone tab that's
  // been idle for days - can't silently overwrite the deliberately-resumed
  // stale timestamp above before the worker's first tick gets a chance to
  // detect it and sign out.
  useEffect(() => {
    if (prevPathnameRef.current === location.pathname) return;
    prevPathnameRef.current = location.pathname;
    recordActivity();
  }, [location.pathname, recordActivity]);

  const stayActive = () => {
    warningShownRef.current = false;
    const now = Date.now();
    lastWriteRef.current = now;
    writeLastActivity(now);
    workerRef.current?.postMessage({ type: "activity", ts: now });
    setSecondsLeft(null);
  };

  if (!session || secondsLeft === null) return null;

  return (
    <Dialog open onOpenChange={() => { /* only the button below can dismiss this */ }}>
      <DialogContent
        className="sm:max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader>
          <DialogTitle>Still there?</DialogTitle>
          <DialogDescription>
            You'll be signed out in {secondsLeft}s due to inactivity.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={stayActive}>Stay signed in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
