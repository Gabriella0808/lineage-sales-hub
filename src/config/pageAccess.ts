import type { AppRole } from "@/hooks/useUserRole";

/**
 * Single source of truth for "who can see / open which page".
 *
 * Every gated destination has one entry here, keyed by a stable page key.
 * Both enforcement points read from this file:
 *   - the sidebar / menu (config/navSections.ts, via `menu`)
 *   - the route guards (components/PageGate.tsx, via `route`)
 *
 * Stage 1 of the permissions work: this file is a straight, behaviour-
 * preserving copy of the rules that used to be repeated by hand in
 * navSections.ts and App.tsx. `menu` and `route` are deliberately kept
 * separate because they do NOT always agree today (see the MISMATCH notes) -
 * folding them together is a product decision, not a refactor.
 */

/** Sidebar/menu visibility for a page. */
export interface MenuRule {
  roles: AppRole[];
  allowEmails?: string[];
  denyEmails?: string[];
}

/** What happens when someone opens the page's URL directly. */
export interface RouteRule {
  /** Wrapped in <ProtectedRoute> (role/email checks below apply). False = any signed-in user. */
  protected?: boolean;
  allow?: AppRole[];
  allowEmails?: string[];
  denyEmails?: string[];
  /** Extra guard component layered inside: "email" = EmailGuard (Gabriella + customer service), "crm" = CrmGuard (admin/manager). */
  guard?: "email" | "crm";
}

export interface PageAccess {
  /** Human-readable name (used by the upcoming permissions screen). */
  title: string;
  menu?: MenuRule;
  route?: RouteRule;
}

const ALL: AppRole[] = ["admin", "manager", "rep", "dealer"];
const AM: AppRole[] = ["admin", "manager"];
const AMR: AppRole[] = ["admin", "manager", "rep"];

const GABRIELLA = "gabriella@lineage-collections.com";

export const PAGE_ACCESS: Record<string, PageAccess> = {
  // ── Command Center ─────────────────────────────────────────────
  "home": { title: "Home (Company-wide / Team / My Performance)", route: {} },
  "company-wide": { title: "Company-wide", menu: { roles: ["admin"] }, route: {} },
  "team-performance": { title: "Team Performance", menu: { roles: ["manager"] } },
  "my-performance": { title: "My Performance", menu: { roles: ["rep"] } },
  "kpi": { title: "KPI", route: {} },
  "reports-bookings": { title: "Bookings report", route: {} },
  "reports-invoicing": { title: "Invoicing report", route: {} },
  "my-tasks": { title: "My Tasks", menu: { roles: AMR }, route: {} },
  "monday-boards": { title: "Monday boards", route: {} },
  "meeting-intelligence": {
    title: "Meeting Intelligence",
    menu: { roles: AM, allowEmails: ["gmaccioni0808@gmail.com"] },
    route: { protected: true, allowEmails: ["gmaccioni0808@gmail.com"] },
  },

  // ── Products & Orders (EmailGuard on every route) ──────────────
  "product-catalog": { title: "Product Catalog", menu: { roles: ALL }, route: { guard: "email" } },
  "product-detail": { title: "Product detail", route: { guard: "email" } },
  "cart": { title: "Cart", menu: { roles: ALL }, route: { guard: "email" } },
  "my-quotes": { title: "My Quotes", menu: { roles: ALL }, route: { guard: "email" } },
  "customer-quotes": { title: "Customer Quotes", menu: { roles: ALL }, route: { guard: "email" } },
  "customer-quote-new": { title: "New customer quote", route: { guard: "email" } },
  "customer-quote-edit": { title: "Edit customer quote", route: { guard: "email" } },
  "digital-assets": { title: "Digital Assets", menu: { roles: ALL }, route: { guard: "email" } },

  // ── Sales Operations ───────────────────────────────────────────
  "sales-targets": { title: "Sales Targets", menu: { roles: AM }, route: { protected: true, allow: AM } },
  "field-check-ins": { title: "Field Check-Ins", menu: { roles: AM }, route: { protected: true, allow: AM } },
  "prospects": { title: "Prospects", menu: { roles: AM }, route: { protected: true, allow: AM, guard: "crm" } },
  "prospect-reporting": {
    title: "Prospect Reporting",
    menu: { roles: AM, allowEmails: [GABRIELLA] },
    route: { protected: true, allow: AM, allowEmails: [GABRIELLA], guard: "crm" },
  },
  "prospects-analytics": { title: "Prospects analytics", route: { protected: true, allow: AM, guard: "crm" } },
  "prospect-new": { title: "New prospect", route: { protected: true, allow: AM, guard: "crm" } },
  "prospect-detail": { title: "Prospect detail", route: { protected: true, allow: AM, guard: "crm" } },
  "visit-analytics": { title: "Visit Analytics", menu: { roles: AM }, route: { protected: true, allow: AM } },
  "travel-log": { title: "Travel Log", menu: { roles: AM }, route: { protected: true, allow: AM } },
  // MISMATCH (kept as-is): the menu shows this to reps, but the route sends reps away.
  "trade-show-leads": { title: "Trade Show Leads", menu: { roles: AMR }, route: { protected: true, allow: AM } },
  "capture-leads": { title: "Capture Leads", menu: { roles: AM }, route: { protected: true, allow: AM } },
  "hp-appointments": {
    title: "High Point Market Appointments",
    menu: { roles: AMR },
    route: { protected: true, allow: AMR },
  },
  "holiday-promotions": { title: "Holiday Promotions", menu: { roles: AMR } },
  "labor-day-promo": { title: "Labor Day Promo", menu: { roles: AMR }, route: { protected: true, allow: AMR } },
  "discontinued-products": { title: "Discontinued Products", menu: { roles: AMR }, route: { protected: true, allow: AMR } },
  "discontinued-analytics": { title: "Discontinued Analytics", menu: { roles: AM }, route: { protected: true, allow: AM } },
  "pre-sale": {
    title: "Pre-Sale - New Product Intros",
    menu: { roles: AM, allowEmails: [GABRIELLA] },
    route: { protected: true, allowEmails: [GABRIELLA] },
  },

  // ── Dealer Network ─────────────────────────────────────────────
  // MISMATCH (kept as-is): the menu hides Dealers from reps, but the route is open to any signed-in user.
  "dealers": { title: "Dealers", menu: { roles: AM }, route: {} },
  "directory": { title: "Directory", menu: { roles: AM }, route: { protected: true, allow: AM } },

  // ── Inventory & Reporting ──────────────────────────────────────
  // MISMATCH (kept as-is): the menu shows Inventory to admin/manager/dealer only, but the route lets any signed-in user in.
  "inventory": { title: "Inventory", menu: { roles: ["admin", "manager", "dealer"] }, route: { protected: true } },

  // ── Administration ─────────────────────────────────────────────
  "org-chart": { title: "Organizational Chart", menu: { roles: ["admin"] }, route: { protected: true, allow: ["admin"], denyEmails: ["andrew@lineage-collections.com"] } },
  "sales-managers": { title: "Sales Managers", menu: { roles: AM }, route: { protected: true, allow: AM } },
  "reps-acctivate": { title: "Sales Rep Database (Acctivate)", menu: { roles: ["admin"] }, route: { protected: true, allow: ["admin"] } },
  "rep-login-activity": {
    title: "Rep Login Activity",
    menu: { roles: AM, denyEmails: ["kate@lineage-collections.com"] },
    route: { protected: true, allow: AM, denyEmails: ["kate@lineage-collections.com"] },
  },
  "desktop-app": {
    title: "Desktop App",
    menu: { roles: ALL, allowEmails: [GABRIELLA, "justin@lineage-collections.com", "scott@lineage-collections.com"] },
    route: { protected: true, allowEmails: [GABRIELLA, "justin@lineage-collections.com", "scott@lineage-collections.com"] },
  },
  // MISMATCH (kept as-is): the menu shows Settings to admin/manager/rep only, but the route is open to any signed-in user.
  "settings": { title: "Settings", menu: { roles: AMR }, route: {} },
  "portal-access": {
    title: "Portal Access",
    menu: { roles: ["admin"], allowEmails: [GABRIELLA] },
    route: { protected: true, allowEmails: [GABRIELLA] },
  },
};

/** Menu rule for a nav item - throws at startup if a key is missing, so a typo can never silently open or hide a page. */
export function menuRule(key: string): MenuRule {
  const rule = PAGE_ACCESS[key]?.menu;
  if (!rule) throw new Error(`pageAccess: no menu rule for "${key}"`);
  return rule;
}
