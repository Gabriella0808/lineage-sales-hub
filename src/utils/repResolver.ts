export interface RepIdentifier {
  rep_name: string;
  rep_id:   string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolves Live KPI dropdown display names to the exact rep_name / rep_id values
 * stored in v_portal_dealer_rep_reporting_lines (sourced from Acctivate).
 *
 * Matching order (most to least stable):
 *   1. Exact normalized match (e.g. "Internet" === "Internet")
 *   2. Display name fully contains the stored name, or vice versa, with a
 *      minimum length guard to avoid spurious substring matches
 *      (e.g. "bradrobertson" ⊇ "robertson")
 *   3. Last-word surname match — handles "Brad Robertson" → "Robertson",
 *      "Dave Ervin" → "Ervin", "Jordan Shindell" → "Shindell", etc.
 *
 * Returns:
 *   repIds   – unique Acctivate rep codes / IDs (use as primary `.in` filter)
 *   repNames – unique exact rep_name strings from the view (fallback filter)
 *              Always includes the original display names so we never filter nothing.
 */
export function resolveRepIdentifiers(
  displayNames: string[],
  knownIdentifiers: RepIdentifier[],
): { repIds: string[]; repNames: string[] } {
  const repIds   = new Set<string>();
  const repNames = new Set<string>();

  for (const display of displayNames) {
    const normDisplay  = normalize(display);
    const displayParts = display.trim().toLowerCase().split(/\s+/);
    const displayLast  = normalize(displayParts.at(-1) ?? "");

    // Always keep the raw display name as a last-resort fallback.
    repNames.add(display);

    for (const known of knownIdentifiers) {
      const normKnown = normalize(known.rep_name);
      const knownLast = normalize(known.rep_name.trim().split(/\s+/).at(-1) ?? "");

      const isMatch =
        // 1. Exact normalized match
        normDisplay === normKnown ||
        // 2a. Display contains known name (minimum 4 chars to avoid "a" ⊂ "barbara")
        (normKnown.length >= 4 && normDisplay.includes(normKnown)) ||
        // 2b. Known name contains display name
        (normDisplay.length >= 4 && normKnown.includes(normDisplay)) ||
        // 3. Surname match (minimum 4 chars)
        (displayLast.length >= 4 && displayLast === knownLast);

      if (isMatch) {
        repNames.add(known.rep_name);
        if (known.rep_id) repIds.add(known.rep_id);
      }
    }
  }

  return {
    repIds:   Array.from(repIds),
    repNames: Array.from(repNames),
  };
}
