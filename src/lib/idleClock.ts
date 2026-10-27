/**
 * Resume the real idle clock across a fresh page load instead of resetting
 * it to "now" - a mobile browser that evicts and reloads a backgrounded tab
 * after hours or days away would otherwise look freshly active the instant
 * it reloads, and 30 minutes would never actually elapse. A stored value
 * from the future (clock skew) is ignored.
 */
export function resolveLastActivityAt(stored: number | null, now: number): number {
  return stored != null && stored <= now ? stored : now;
}
