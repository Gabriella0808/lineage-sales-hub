/**
 * Portal-wide booking visibility cutoff.
 *
 * Only booking ACTUALS on or after BOOKINGS_VISIBLE_FROM are displayed in the
 * portal. Goals / projections (b26p, i26p, rep_targets) are never subject to
 * this rule. Invoiced data is never affected.
 *
 * No source rows are deleted — this is a display-only filter.
 */
export const BOOKINGS_VISIBLE_FROM = "2026-08-01";

/**
 * Returns true when booking actuals for the given year + 1-based month
 * should be shown in the portal.
 *
 * @example isBookingVisible(2026, 7) → false  (July 2026 — hidden)
 * @example isBookingVisible(2026, 8) → true   (August 2026 — visible)
 * @example isBookingVisible(2027, 1) → true   (future year — visible)
 */
export function isBookingVisible(year: number, month: number): boolean {
  if (year > 2026) return true;
  if (year === 2026 && month >= 8) return true;
  return false;
}

/**
 * Returns true when booking actuals for the given ISO date string
 * (YYYY-MM-DD) should be shown in the portal.
 */
export function isBookingVisibleDate(date: string): boolean {
  return date >= BOOKINGS_VISIBLE_FROM;
}

/** Convenience inverse — matches the "shouldHide" mental model. */
export function shouldHideBookingActual(year: number, month: number): boolean {
  return !isBookingVisible(year, month);
}

/**
 * Filter an array of line-level rows, keeping only those whose
 * transaction_date falls on or after the cutoff.
 */
export function filterVisibleBookingRows<T extends { transaction_date: string }>(
  rows: T[],
): T[] {
  return rows.filter((r) => isBookingVisibleDate(r.transaction_date));
}
