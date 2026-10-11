import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ACTIVITY_KEY = "lc.lastActivityAt";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // sign out after 30 min with no portal activity
const WARNING_MS = 60 * 1000;           // warn 60s before that actually happens
const CHECK_INTERVAL_MS = 1_000;        // smooth 1s countdown once the warning is up
const WRITE_THROTTLE_MS = 5_000;        // don't hammer localStorage on every mousemove

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"] as const;

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    return raw ? Number(raw) : Date.now();
  } catch {
    return Date.now();
  }
}
function writeLastActivity(ts: number) {
  try { localStorage.setItem(ACTIVITY_KEY, String(ts)); } catch { /* private mode etc - just won't sync across tabs */ }
}

/**
 * Signs the user out after IDLE_TIMEOUT_MS of no portal activity, with a
 * WARNING_MS countdown dialog first so nobody loses unsaved work by
 * surprise. "Activity" (mouse, keyboard, scroll, touch) is recorded to
 * localStorage rather than only component state, so every open tab shares
 * one clock: being active in one tab keeps all of them signed in, and the
 * `storage` event lets this tab's warning dismiss itself the moment another
 * tab records activity. The sign-out itself is just a normal signOut() -
 * ProtectedRoute already redirects to /auth on its own once session is
 * null, so there's no separate navigation to do here.
 *
 * Mounted once in AppLayout's Shell, so it's only ever active while there's
 * a real session (every route it covers is already behind ProtectedRoute).
 */
export function IdleLogoutManager() {
  const { session, signOut } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!session) {
      setSecondsLeft(null);
      return;
    }
    writeLastActivity(Date.now());
    loggingOutRef.current = false;

    const recordActivity = () => {
      // Dismiss the warning immediately on any real interaction - cheap
      // React state, not throttled. Only the localStorage write (and thus
      // the cross-tab broadcast) is throttled.
      setSecondsLeft(null);
      const now = Date.now();
      if (now - lastWriteRef.current < WRITE_THROTTLE_MS) return;
      lastWriteRef.current = now;
      writeLastActivity(now);
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, recordActivity, { passive: true }));

    // Another tab recorded activity (or extended the session) - follow suit.
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY) setSecondsLeft(null);
    };
    window.addEventListener("storage", onStorage);

    const interval = window.setInterval(() => {
      if (loggingOutRef.current) return;
      const elapsed = Date.now() - readLastActivity();
      if (elapsed >= IDLE_TIMEOUT_MS) {
        loggingOutRef.current = true;
        setSecondsLeft(null);
        void signOut();
      } else if (elapsed >= IDLE_TIMEOUT_MS - WARNING_MS) {
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - elapsed) / 1000)));
      } else {
        setSecondsLeft(null);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, recordActivity));
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [session, signOut]);

  const stayActive = () => {
    lastWriteRef.current = Date.now();
    writeLastActivity(Date.now());
    setSecondsLeft(null);
  };

  if (!session || secondsLeft === null) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) stayActive(); }}>
      <DialogContent className="sm:max-w-sm">
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
