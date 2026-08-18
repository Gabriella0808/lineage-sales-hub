export const REPORTING_TIME_ZONE = "America/New_York";

/**
 * Returns the current reporting date as a YYYY-MM-DD string in Eastern Time.
 * Use this for all Supabase filters (transaction_date, booking_date, invoice_date).
 * Never use new Date().toISOString().slice(0,10) — that is UTC, not ET.
 */
export function getReportingTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Returns a Date object at local midnight of the current ET reporting date.
 * Safe to pass to date-fns (startOfYear, startOfMonth, endOfMonth, format, etc.)
 * because the calendar date matches the ET date.
 */
export function getReportingToday(): Date {
  const s = getReportingTodayStr();
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getReportingYear(): number {
  return Number(getReportingTodayStr().slice(0, 4));
}

export function getReportingMonth(): number {
  return Number(getReportingTodayStr().slice(5, 7));
}

/**
 * Formats a YYYY-MM-DD date string for display using the ET reporting timezone.
 * Example: "2026-08-18" → "Aug 18, 2026"
 * If no dateString is provided, formats the current ET date.
 */
export function formatReportingDisplayDate(dateString?: string): string {
  const date = dateString ? new Date(`${dateString}T12:00:00`) : new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
