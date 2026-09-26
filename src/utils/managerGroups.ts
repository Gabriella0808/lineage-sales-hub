export interface ManagerLite {
  id: string;
  name: string;
  email?: string | null;
}

/**
 * The manager records that belong to the SAME person as `selectedId`.
 *
 * Acctivate writes a manager as just "Will" or "Mateo", and the portal kept
 * creating a separate bare record for that short name next to the real one
 * ("Will Grisack" / "Mateo De Lisa"). Dealers, reps and therefore orders end
 * up split across the two, so reporting scoped to only the real record
 * silently drops most of that manager's numbers.
 *
 * Rule (the same one the Company-wide manager dropdown already uses to hide
 * the short duplicates, and that resolve_dealer_acctivate_links uses to match
 * "Will" to "Will Grisack"): a manager with NO email, whose whole name equals
 * the first word of the selected manager's name, is the same person.
 * Returns the selected id first, then any such duplicates.
 *
 * This only widens REPORTING scope. It never changes which record a dealer or
 * rep is attached to, so Check-Ins, Prospects and Visit Analytics are unaffected.
 */
export function managerGroupIds(selectedId: string, managers: ManagerLite[]): string[] {
  const selected = managers.find((m) => m.id === selectedId);
  if (!selected) return [selectedId];
  const name = selected.name.trim();
  if (!name.includes(" ")) return [selectedId]; // a single-word name has no "short form" to merge
  const first = name.toLowerCase().split(/\s+/)[0];
  const duplicates = managers.filter(
    (m) => m.id !== selectedId && !(m.email ?? "").trim() && m.name.trim().toLowerCase() === first,
  );
  return [selectedId, ...duplicates.map((m) => m.id)];
}
