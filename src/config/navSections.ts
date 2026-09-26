import {
  LayoutDashboard, Store, BookOpen, BarChart3, Settings,
  UserCog, ListChecks, Boxes, MapPinned, Plane, PieChart,
  Megaphone, ClipboardList, Network, Target, Package, ShoppingCart,
  FileText, Send, FolderOpen, Tag, Database, AudioLines, Clock,
  Download, Rocket, ShieldCheck,
} from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";
import { isAllowedEmail, isCustomerService } from "@/components/EmailGuard";
import { menuRule } from "@/config/pageAccess";
import { overrideFor, type AccessOverrides } from "@/config/accessOverrides";

export type NavItem = {
  /** Page key in config/pageAccess.ts - the menu rule (roles/allow/deny) comes from there. */
  key: string;
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
  allowEmails?: string[];
  denyEmails?: string[];
  children?: { key: string; title: string; url: string; icon: typeof LayoutDashboard; roles: AppRole[]; allowEmails?: string[]; denyEmails?: string[] }[];
};

/** Expands a page key into its menu rule (roles / allowEmails / denyEmails) from pageAccess.ts. */
const access = (key: string) => {
  const r = menuRule(key);
  return {
    key,
    roles: r.roles,
    ...(r.allowEmails && { allowEmails: r.allowEmails }),
    ...(r.denyEmails && { denyEmails: r.denyEmails }),
  };
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * Lineage Collections - internal operating system navigation.
 * Items are grouped into operational sections so the shell reads
 * like a purpose-built tool, not a generic admin template.
 *
 * Lives in its own module (not AppLayout.tsx) so other components — e.g.
 * ReportIssueDialog's "which page" dropdown — can import it without a
 * circular dependency on AppLayout.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "command",
    label: "Command Center",
    items: [
      { title: "Company-wide",     url: "/",  icon: BarChart3, ...access("company-wide") },
      { title: "Team Performance", url: "/",  icon: BarChart3, ...access("team-performance") },
      { title: "My Performance",   url: "/",  icon: BarChart3, ...access("my-performance") },
      { title: "My Tasks", url: "/tasks", icon: ListChecks, ...access("my-tasks") },
      { title: "Meeting Intelligence", url: "/meeting-intelligence", icon: AudioLines, ...access("meeting-intelligence") },
    ],
  },
  {
    id: "catalog",
    label: "Products & Orders",
    items: [
      { title: "Product Catalog", url: "/catalog", icon: Package, ...access("product-catalog") },
      { title: "Cart", url: "/cart", icon: ShoppingCart, ...access("cart") },
      { title: "My Quotes", url: "/my-quotes", icon: FileText, ...access("my-quotes") },
      { title: "Customer Quotes", url: "/customer-quotes", icon: Send, ...access("customer-quotes") },
      { title: "Digital Assets", url: "/digital-assets", icon: FolderOpen, ...access("digital-assets") },
    ],
  },
  {
    id: "sales",
    label: "Sales Operations",
    items: [
    {
      title: "Sales Targets",
      url: "/sales-targets",
      icon: Target,
      ...access("sales-targets"),
    },
    {
      title: "Field Check-Ins",
      url: "/check-ins",
      icon: MapPinned,
      ...access("field-check-ins"),
      children: [
        { title: "Prospects", url: "/crm/accounts", icon: Store, ...access("prospects") },
        { title: "Prospect Reporting", url: "/prospects/reporting", icon: BarChart3, ...access("prospect-reporting") },
        { title: "Visit Analytics", url: "/check-ins/analytics", icon: PieChart, ...access("visit-analytics") },
      ],
    },
      { title: "Travel Log", url: "/travel-log", icon: Plane, ...access("travel-log") },
      {
        title: "Trade Show Leads", url: "/trade-show-leads", icon: Megaphone, ...access("trade-show-leads"),
        children: [
          { title: "Capture Leads", url: "/trade-show-leads/capture", icon: ClipboardList, ...access("capture-leads") },
          { title: "High Point Market Appointments", url: "/trade-show-leads/hp-appointments", icon: ClipboardList, ...access("hp-appointments") },
        ],
      },
      {
        title: "Holiday Promotions", url: "/promotions/labor-day-promo", icon: Tag, ...access("holiday-promotions"),
        children: [
          { title: "Labor Day Promo", url: "/promotions/labor-day-promo", icon: Tag, ...access("labor-day-promo") },
          { title: "Discontinued Products", url: "/clearance", icon: Tag, ...access("discontinued-products") },
          { title: "Discontinued Analytics", url: "/clearance/analytics", icon: BarChart3, ...access("discontinued-analytics") },
          { title: "Pre-Sale - New Product Intros", url: "/promotions/pre-sale", icon: Rocket, ...access("pre-sale") },
        ],
      },
    ],
  },
  {
    id: "network",
    label: "Dealer Network",
    items: [
      { title: "Dealers", url: "/dealers", icon: Store, ...access("dealers") },
      { title: "Directory",  url: "/directory", icon: BookOpen, ...access("directory") },
    ],
  },
  {
    id: "ops",
    label: "Inventory & Reporting",
    items: [
      { title: "Inventory", url: "/inventory", icon: Boxes, ...access("inventory") },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { title: "Organizational Chart", url: "/org-chart", icon: Network, ...access("org-chart") },
      { title: "Sales Managers", url: "/managers", icon: UserCog, ...access("sales-managers") },
      { title: "Sales Rep Database (Acctivate)", url: "/reps-acctivate", icon: Database, ...access("reps-acctivate") },
      { title: "Rep Login Activity", url: "/rep-activity", icon: Clock, ...access("rep-login-activity") },
      { title: "Portal Access", url: "/portal-access", icon: ShieldCheck, ...access("portal-access") },
      { title: "Desktop App", url: "/desktop-app", icon: Download, ...access("desktop-app") },
      { title: "Settings",       url: "/settings", icon: Settings, ...access("settings") },
    ],
  },
];

const CS_ALLOWED_URLS = new Set(["/", "/tasks", "/dealers", "/settings"]);

/**
 * The single source of truth for "which nav items can this user actually
 * see" — mirrors AppLayout.tsx's SidebarNav filtering exactly (role gate,
 * customer-service override, the org-chart/andrew exclusion, allowEmails)
 * so the sidebar and anything else that needs "pages this user has access
 * to" (e.g. ReportIssueDialog's page picker) can never drift apart.
 *
 * `overrides` are the deliberate changes made from the Portal Access page.
 * They win over the coded rules below; with none supplied the result is
 * exactly what the coded rules alone produce.
 */
export function getVisibleNavSections(
  role: AppRole,
  user: { email?: string | null } | null | undefined,
  overrides?: AccessOverrides,
): NavSection[] {
  const cs = isCustomerService(user?.email);
  const email = user?.email;
  const lc = email?.toLowerCase();
  const ov = (key: string) => (overrides ? overrideFor(key, "menu", email, role, overrides) : undefined);
  const allowOk = (x: { allowEmails?: string[] }) => !x.allowEmails || (!!email && x.allowEmails.map((e) => e.toLowerCase()).includes(lc!));
  const denyOk = (x: { denyEmails?: string[] }) => !x.denyEmails || !email || !x.denyEmails.map((e) => e.toLowerCase()).includes(lc!);

  // The coded rule for a top-level item / a child item.
  const topByCode = (i: NavItem) =>
    (cs ? CS_ALLOWED_URLS.has(i.url) : i.roles.includes(role)) &&
    !(i.url === "/org-chart" && lc === "andrew@lineage-collections.com") &&
    allowOk(i) && denyOk(i);
  const childByCode = (c: NonNullable<NavItem["children"]>[number]) => c.roles.includes(role) && allowOk(c) && denyOk(c);

  return NAV_SECTIONS
    .filter((s) => {
      if (cs) return true;
      if (s.id === "catalog") return isAllowedEmail(email) || s.items.some((i) => ov(i.key) === true);
      return true;
    })
    .map((s) => ({
      ...s,
      items: s.items.flatMap((i): NavItem[] => {
        const own = ov(i.key) ?? topByCode(i);
        const children = cs
          ? (() => { const kept = i.children?.filter((c) => ov(c.key) === true); return kept && kept.length ? kept : undefined; })()
          : i.children?.filter((c) => ov(c.key) ?? childByCode(c));
        // Granting a child page also shows its parent group.
        const childGranted = !!children?.some((c) => ov(c.key) === true);
        return own || childGranted ? [{ ...i, children }] : [];
      }),
    }))
    .filter((s) => s.items.length > 0);
}
