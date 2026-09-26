import type { AppRole } from "@/hooks/useUserRole";

/**
 * Deliberate access changes made from the Portal Access page, layered on top
 * of the coded defaults in pageAccess.ts. Precedence, most specific first:
 *   1. a change for this specific person (matched by email)
 *   2. a change for their role / profile (customer service is a profile that
 *      REPLACES their saved role, since those accounts are saved as managers)
 *   3. the coded default
 * "menu" = shown in the sidebar; "route" = can open the page by its address.
 * null / missing = no change for that half.
 */

export type AccessProfile = AppRole | "customer_service";
export type AccessHalf = "menu" | "route";

export interface RoleOverride { page_key: string; profile: AccessProfile; menu: boolean | null; route: boolean | null }
export interface UserOverride { page_key: string; email: string; menu: boolean | null; route: boolean | null }

export interface AccessOverrides {
  roleOverrides: RoleOverride[];
  userOverrides: UserOverride[];
  /** email (lowercase) -> special profile, e.g. customer service */
  profiles: Record<string, AccessProfile>;
}

export const EMPTY_OVERRIDES: AccessOverrides = { roleOverrides: [], userOverrides: [], profiles: {} };

/** Pages that can never be changed: Home is the redirect target, Portal Access is the editor itself. */
export const LOCKED_PAGES = new Set(["home", "portal-access"]);

export const profileFor = (email: string | null | undefined, role: AppRole, o: AccessOverrides): AccessProfile =>
  (email && o.profiles[email.toLowerCase()]) || role;

export type OverrideSource = "person" | "role";

/** The change that applies to this person for this page/half, if any. */
export function findOverride(
  pageKey: string,
  half: AccessHalf,
  email: string | null | undefined,
  role: AppRole,
  o: AccessOverrides,
): { value: boolean; source: OverrideSource } | undefined {
  if (LOCKED_PAGES.has(pageKey)) return undefined;
  const e = email?.toLowerCase();
  if (e) {
    const u = o.userOverrides.find((x) => x.page_key === pageKey && x.email === e);
    if (u && u[half] !== null && u[half] !== undefined) return { value: u[half] as boolean, source: "person" };
  }
  const profile = profileFor(email, role, o);
  const r = o.roleOverrides.find((x) => x.page_key === pageKey && x.profile === profile);
  if (r && r[half] !== null && r[half] !== undefined) return { value: r[half] as boolean, source: "role" };
  return undefined;
}

/** Same as findOverride but returns just the true/false answer (or undefined = use the coded default). */
export const overrideFor = (
  pageKey: string,
  half: AccessHalf,
  email: string | null | undefined,
  role: AppRole,
  o: AccessOverrides,
): boolean | undefined => findOverride(pageKey, half, email, role, o)?.value;
