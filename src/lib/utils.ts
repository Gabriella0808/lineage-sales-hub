import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a SQL `date` string (YYYY-MM-DD) as a local-midnight Date.
 * Avoids the UTC-shift bug where `new Date("2026-05-28")` becomes
 * May 27 in negative-offset timezones.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return new Date(value);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Formats a SQL `date` string (YYYY-MM-DD, e.g. requested_ship_date,
 * estimated_arrival, last_contact) for display, e.g. "Oct 8, 2026".
 * Uses parseDateOnly() under the hood so it never shifts to the wrong
 * calendar day - unlike `new Date(dateString).toLocaleDateString()`, which
 * parses the string as UTC midnight and can land on the previous day in
 * any negative-UTC-offset timezone (including Eastern).
 * For a real timestamp (timestamptz), use formatReportingDate() from
 * @/utils/reportingDate instead - this is only for date-only columns.
 */
export function formatDateOnly(value: string | null | undefined): string {
  const d = parseDateOnly(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}
