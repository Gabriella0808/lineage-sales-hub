/**
 * Single source of truth for "does this dealer_check_ins row count as a real
 * logged meeting?" - used by Visit Analytics (CheckInAnalyticsPage) and the
 * manager Weekly Review panel (WeeklyReviewPanel), which must always agree
 * on this number. Previously each had its own separate copy of this check;
 * Visit Analytics' copy was defined but never actually wired into its
 * counting logic (so it counted every log type - meeting, phone call,
 * email, letter, follow-up, and even "conversion" auto-generated artifacts
 * from CRM account conversion), while Weekly Review's copy correctly
 * filtered to meeting-only - so the two pages silently disagreed. Both now
 * import this one function instead of maintaining their own copy.
 *
 * log_type is stored as a possibly comma-joined multi-select string (e.g.
 * "meeting,follow_up"), since a single visit can be logged with more than
 * one activity type at once.
 */
export function isMeetingCheckIn(row: { log_type: string | null | undefined }): boolean {
  return (row.log_type ?? "")
    .split(",")
    .map((v) => v.trim())
    .includes("meeting");
}
