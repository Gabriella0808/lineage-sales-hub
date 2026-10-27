// Shared with AuthContext.tsx: signOut() clears this on every sign-out
// (manual or idle-triggered) so a fresh login never inherits a stale
// pre-logout timestamp - see clearLastActivity() below for why that matters.
export const IDLE_ACTIVITY_KEY = "lc.lastActivityAt";

export function writeLastActivity(ts: number) {
  try { localStorage.setItem(IDLE_ACTIVITY_KEY, String(ts)); } catch { /* private mode etc - just won't sync across tabs */ }
}

export function readLastActivity(): number | null {
  try {
    const n = Number(localStorage.getItem(IDLE_ACTIVITY_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

/**
 * Must run on every sign-out, idle-triggered or manual. Without this, a
 * session that gets auto-logged-out for being idle leaves its stale
 * timestamp sitting in storage - and resolveLastActivityAt() below, whose
 * whole job is to trust a stored timestamp over "now", would then read that
 * same already-expired value back on the very next login and immediately
 * sign the person out again before they can do anything, in a loop.
 */
export function clearLastActivity() {
  try { localStorage.removeItem(IDLE_ACTIVITY_KEY); } catch { /* private mode etc */ }
}

/**
 * Resume the real idle clock across a fresh page load instead of resetting
 * it to "now" - a mobile browser that evicts and reloads a backgrounded tab
 * after hours or days away would otherwise look freshly active the instant
 * it reloads, and 30 minutes would never actually elapse. A stored value
 * from the future (clock skew) is ignored. Only valid for a *continuing*
 * session (a reload while still signed in) - a fresh login must never see a
 * stale value here, which is exactly what clearLastActivity() guarantees.
 */
export function resolveLastActivityAt(stored: number | null, now: number): number {
  return stored != null && stored <= now ? stored : now;
}
