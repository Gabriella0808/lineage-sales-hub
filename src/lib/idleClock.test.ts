import { describe, it, expect } from "vitest";
import { resolveLastActivityAt } from "./idleClock";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// The bug this covers: a mobile browser evicts and reloads a backgrounded
// tab after hours/days away, remounting IdleLogoutManager. Before this fix
// the idle clock was unconditionally stamped with "now" on every mount, so
// a phone idle since market would always look freshly active on reload and
// the 30-minute timeout could never actually fire. Desktop rarely hit this
// because the tab/worker just kept running continuously in the background.
describe("resolveLastActivityAt", () => {
  it("resumes from a stored timestamp instead of resetting to now", () => {
    const now = 1_000_000;
    const stored = now - 10 * 60 * 1000; // 10 minutes ago
    expect(resolveLastActivityAt(stored, now)).toBe(stored);
  });

  it("preserves a stale timestamp old enough to already be past the idle threshold", () => {
    const now = 1_000_000;
    const stored = now - (IDLE_TIMEOUT_MS + 60_000); // idle well past 30 min
    expect(resolveLastActivityAt(stored, now)).toBe(stored);
  });

  it("falls back to now when nothing is stored (first-ever login)", () => {
    const now = 1_000_000;
    expect(resolveLastActivityAt(null, now)).toBe(now);
  });

  it("ignores a stored timestamp from the future (clock skew)", () => {
    const now = 1_000_000;
    expect(resolveLastActivityAt(now + 60_000, now)).toBe(now);
  });
});
