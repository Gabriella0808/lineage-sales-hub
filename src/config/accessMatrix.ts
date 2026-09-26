import { getVisibleNavSections } from "@/config/navSections";
import { PAGE_ACCESS, type RouteRule } from "@/config/pageAccess";
import { EMPTY_OVERRIDES, findOverride, type AccessHalf, type AccessOverrides, type OverrideSource } from "@/config/accessOverrides";
import { isAllowedEmail } from "@/components/EmailGuard";
import type { AppRole } from "@/hooks/useUserRole";

/**
 * Computes, for one person, what the portal actually enforces - used by the
 * Portal Access page so it shows the truth rather than a copy of it.
 *
 * - Menu visibility reuses getVisibleNavSections (the exact function the
 *   sidebar renders from), so the customer-service rules, section rules, email
 *   allow/deny lists and any saved changes all apply automatically.
 * - Route access mirrors PageGate: a saved change wins, otherwise the coded
 *   rule (ProtectedRoute + EmailGuard + CrmGuard from pageAccess.ts).
 */

/** The coded route rule alone (no saved changes). */
export function routeAllowed(rule: RouteRule | undefined, role: AppRole, email: string | null | undefined): boolean {
  if (!rule) return true; // page has no route of its own
  const e = email?.toLowerCase() ?? null;
  const lc = (a?: string[]) => a?.map((x) => x.toLowerCase());
  if (rule.protected) {
    if (rule.allow && !rule.allow.includes(role)) return false;
    if (rule.denyEmails && e && lc(rule.denyEmails)!.includes(e)) return false;
    if (rule.allowEmails && (!e || !lc(rule.allowEmails)!.includes(e))) return false;
  }
  if (rule.guard === "email" && !isAllowedEmail(email)) return false;
  if (rule.guard === "crm" && !(role === "admin" || role === "manager")) return false;
  return true;
}

/** Page keys that appear in this person's sidebar. */
export function menuKeysFor(role: AppRole, email: string | null | undefined, overrides: AccessOverrides = EMPTY_OVERRIDES): Set<string> {
  const keys = new Set<string>();
  for (const section of getVisibleNavSections(role, email ? { email } : null, overrides)) {
    for (const item of section.items) {
      keys.add(item.key);
      item.children?.forEach((c) => keys.add(c.key));
    }
  }
  return keys;
}

/** Can they open this page by its address (saved changes first, then the coded rule)? */
export function canOpenPage(key: string, role: AppRole, email: string | null | undefined, overrides: AccessOverrides = EMPTY_OVERRIDES): boolean {
  const change = findOverride(key, "route", email, role, overrides);
  return change ? change.value : routeAllowed(PAGE_ACCESS[key].route, role, email);
}

export type PageState = {
  /** Shown in their sidebar? null = this page is never listed in the menu. */
  inMenu: boolean | null;
  /** Can they open it by its address? null = the entry has no page of its own (menu group). */
  canOpen: boolean | null;
  /** Where each answer comes from: a change for the person, a change for their role, or the coded default. */
  menuSource: OverrideSource | "default";
  routeSource: OverrideSource | "default";
};

export function pageState(
  key: string,
  role: AppRole,
  email: string | null | undefined,
  menu: Set<string>,
  overrides: AccessOverrides = EMPTY_OVERRIDES,
): PageState {
  const def = PAGE_ACCESS[key];
  return {
    inMenu: def.menu ? menu.has(key) : null,
    canOpen: def.route ? canOpenPage(key, role, email, overrides) : null,
    menuSource: (def.menu && findOverride(key, "menu", email, role, overrides)?.source) || "default",
    routeSource: (def.route && findOverride(key, "route", email, role, overrides)?.source) || "default",
  };
}

export type Verdict = "full" | "url-only" | "menu-blocked" | "none";

/**
 * full          - can open it, and it is in their menu (or the page is never in a menu)
 * url-only      - can open it by typing the address, but it is NOT in their menu
 * menu-blocked  - it is in their menu, but opening it sends them away (a mismatch)
 * none          - no access
 */
export function verdict(s: Pick<PageState, "inMenu" | "canOpen">): Verdict {
  const opens = s.canOpen ?? s.inMenu === true; // menu-only groups count as reachable when shown
  const listed = s.inMenu;
  if (opens && (listed === true || listed === null)) return "full";
  if (opens && listed === false) return "url-only";
  if (!opens && listed === true) return "menu-blocked";
  return "none";
}

export const PAGE_KEYS = Object.keys(PAGE_ACCESS);

/** Which half a page has, so the editor only offers switches that mean something. */
export const hasHalf = (key: string, half: AccessHalf) => (half === "menu" ? !!PAGE_ACCESS[key].menu : !!PAGE_ACCESS[key].route);
