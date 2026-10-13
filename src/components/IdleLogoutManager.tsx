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
 * one clock for deciding WHEN to warn - but once the warning dialog is up
 * in a given tab, it's sticky: only an explicit "Stay signed in" click
 * dismisses it there. Incidental mouse movement on the way to the button
 * (or activity elsewhere) no longer makes it vanish before it can be used.
 * The sign-out itself is just a normal signOut() - ProtectedRoute already
 * redirects to /auth on its own once session is null, so there's no
 * separate navigation to do here.
 *
 * Mounted once in AppLayout's Shell, so it's only ever active while there's
 * a real session (every route it covers is already behind ProtectedRoute).
 */
export function IdleLogoutManager() {
  const { session, signOut } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);
  // Mirrors secondsLeft !== null, readable inside event handlers without
  // needing secondsLeft in the effect's dependency array (which would tear
  // down and re-add every listener on every tick of the countdown).
  const warningShownRef = useRef(false);

  useEffect(() => {
    if (!session) {
      warningShownRef.current = false;
      setSecondsLeft(null);
      return;
    }
    writeLastActivity(Date.now());
    loggingOutRef.current = false;
    warningShownRef.current = false;

    const recordActivity = () => {
      // Once the warning is up, nothing but the button dismisses it - not
      // mouse movement, not typing, not another tab's activity.
      if (warningShownRef.current) return;
      const now = Date.now();
      if (now - lastWriteRef.current < WRITE_THROTTLE_MS) return;
      lastWriteRef.current = now;
      writeLastActivity(now);
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, recordActivity, { passive: true }));

    const interval = window.setInterval(() => {
      if (loggingOutRef.current || warningShownRef.current) return;
      const elapsed = Date.now() - readLastActivity();
      if (elapsed >= IDLE_TIMEOUT_MS) {
        loggingOutRef.current = true;
        setSecondsLeft(null);
        // Bug sweep fix (Finding 1b): local-only - this tab's own idle
        // timeout must not end a session in a different, actively-used
        // tab that never showed its own warning (see this component's own
        // "sticky once shown" comment above for why that scenario is
        // real).
        void signOut({ scope: "local" });
      } else if (elapsed >= IDLE_TIMEOUT_MS - WARNING_MS) {
        warningShownRef.current = true;
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - elapsed) / 1000)));
      }
    }, CHECK_INTERVAL_MS);

    // While the warning is showing, keep counting down toward the actual
    // sign-out on its own clock - independent of readLastActivity(), since
    // that's now frozen (recordActivity is a no-op while warningShownRef
    // is true).
    const countdown = window.setInterval(() => {
      if (!warningShownRef.current || loggingOutRef.current) return;
      setSecondsLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          loggingOutRef.current = true;
          void signOut({ scope: "local" });
          return null;
        }
        return s - 1;
      });
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, recordActivity));
      window.clearInterval(interval);
      window.clearInterval(countdown);
    };
  }, [session, signOut]);

  const stayActive = () => {
    warningShownRef.current = false;
    lastWriteRef.current = Date.now();
    writeLastActivity(Date.now());
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
