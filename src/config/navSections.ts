import {
  LayoutDashboard, Store, BookOpen, BarChart3, Settings,
  UserCog, ListChecks, Boxes, MapPinned, Plane, PieChart,
  Megaphone, ClipboardList, Network, Target, Package, ShoppingCart,
  FileText, Send, FolderOpen, Tag, Database, AudioLines, Clock,
  Download, Rocket,
} from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";
import { isAllowedEmail, isCustomerService } from "@/components/EmailGuard";

export type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
  allowEmails?: string[];
  denyEmails?: string[];
  children?: { title: string; url: string; icon: typeof LayoutDashboard; roles: AppRole[]; allowEmails?: string[]; denyEmails?: string[] }[];
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
      { title: "Company-wide",     url: "/",  icon: BarChart3, roles: ["admin"] },
      { title: "Team Performance", url: "/",  icon: BarChart3, roles: ["manager"] },
      { title: "My Performance",   url: "/",  icon: BarChart3, roles: ["rep"] },
      { title: "My Tasks", url: "/tasks", icon: ListChecks, roles: ["admin", "manager", "rep"] },
      { title: "Meeting Intelligence", url: "/meeting-intelligence", icon: AudioLines, roles: ["admin", "manager"], allowEmails: ["gmaccioni0808@gmail.com"] },
    ],
  },
  {
    id: "catalog",
    label: "Products & Orders",
    items: [
      { title: "Product Catalog", url: "/catalog", icon: Package, roles: ["admin", "manager", "rep", "dealer"] },
      { title: "Cart", url: "/cart", icon: ShoppingCart, roles: ["admin", "manager", "rep", "dealer"] },
      { title: "My Quotes", url: "/my-quotes", icon: FileText, roles: ["admin", "manager", "rep", "dealer"] },
      { title: "Customer Quotes", url: "/customer-quotes", icon: Send, roles: ["admin", "manager", "rep", "dealer"] },
      { title: "Digital Assets", url: "/digital-assets", icon: FolderOpen, roles: ["admin", "manager", "rep", "dealer"] },
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
      roles: ["admin", "manager"],
    },
    {
      title: "Field Check-Ins",
      url: "/check-ins",
      icon: MapPinned,
      roles: ["admin", "manager"],
      children: [
        { title: "Prospects", url: "/crm/accounts", icon: Store, roles: ["admin", "manager"] },
        { title: "Prospect Reporting", url: "/prospects/reporting", icon: BarChart3, roles: ["admin", "manager"], allowEmails: ["gabriella@lineage-collections.com"] },
        { title: "Visit Analytics", url: "/check-ins/analytics", icon: PieChart, roles: ["admin", "manager"] },
      ],
    },
      { title: "Travel Log", url: "/travel-log", icon: Plane, roles: ["admin", "manager"] },
      {
        title: "Trade Show Leads", url: "/trade-show-leads", icon: Megaphone, roles: ["admin", "manager", "rep"],
        children: [
          { title: "Capture Leads", url: "/trade-show-leads/capture", icon: ClipboardList, roles: ["admin", "manager"] },
          { title: "High Point Market Appointments", url: "/trade-show-leads/hp-appointments", icon: ClipboardList, roles: ["admin", "manager", "rep"] },
        ],
      },
      {
        title: "Holiday Promotions", url: "/promotions/labor-day-promo", icon: Tag, roles: ["admin", "manager", "rep"],
        children: [
          { title: "Labor Day Promo", url: "/promotions/labor-day-promo", icon: Tag, roles: ["admin", "manager", "rep"] },
          { title: "Discontinued Products", url: "/clearance", icon: Tag, roles: ["admin", "manager", "rep"] },
          { title: "Discontinued Analytics", url: "/clearance/analytics", icon: BarChart3, roles: ["admin", "manager"] },
          { title: "Pre-Sale", url: "/promotions/pre-sale", icon: Rocket, roles: ["admin", "manager"] },
        ],
      },
    ],
  },
  {
    id: "network",
    label: "Dealer Network",
    items: [
      { title: "Dealers", url: "/dealers", icon: Store, roles: ["admin", "manager"] },
      { title: "Directory",  url: "/directory", icon: BookOpen, roles: ["admin", "manager"] },
    ],
  },
  {
    id: "ops",
    label: "Inventory & Reporting",
    items: [
      { title: "Inventory", url: "/inventory", icon: Boxes, roles: ["admin", "manager", "dealer"] },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { title: "Organizational Chart", url: "/org-chart", icon: Network,  roles: ["admin"] },
      { title: "Sales Managers", url: "/managers", icon: UserCog,  roles: ["admin", "manager"] },
      { title: "Sales Rep Database (Acctivate)", url: "/reps-acctivate", icon: Database, roles: ["admin"] },
      { title: "Rep Login Activity", url: "/rep-activity", icon: Clock, roles: ["admin", "manager"], denyEmails: ["kate@lineage-collections.com"] },
      { title: "Desktop App", url: "/desktop-app", icon: Download, roles: ["admin", "manager", "rep", "dealer"], allowEmails: ["gabriella@lineage-collections.com", "justin@lineage-collections.com", "scott@lineage-collections.com"] },
      { title: "Settings",       url: "/settings", icon: Settings, roles: ["admin", "manager", "rep"] },
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
 */
export function getVisibleNavSections(
  role: AppRole,
  user: { email?: string | null } | null | undefined,
): NavSection[] {
  const cs = isCustomerService(user?.email);
  return NAV_SECTIONS
    .filter((s) => {
      if (cs) return true;
      if (s.id === "catalog") return isAllowedEmail(user?.email);
      return true;
    })
    .map((s) => ({
      ...s,
      items: s.items
        .filter((i) => (cs ? CS_ALLOWED_URLS.has(i.url) : i.roles.includes(role)))
        .filter((i) => !(i.url === "/org-chart" && user?.email?.toLowerCase() === "andrew@lineage-collections.com"))
        .filter((i) => !i.allowEmails || (!!user?.email && i.allowEmails.map((e) => e.toLowerCase()).includes(user.email!.toLowerCase())))
        .filter((i) => !i.denyEmails || !user?.email || !i.denyEmails.map((e) => e.toLowerCase()).includes(user.email!.toLowerCase()))
        .map((i) => cs
          ? { ...i, children: undefined }
          : {
              ...i,
              children: i.children
                ?.filter((c) => c.roles.includes(role))
                .filter((c) => !c.allowEmails || (!!user?.email && c.allowEmails.map((e) => e.toLowerCase()).includes(user.email!.toLowerCase())))
                .filter((c) => !c.denyEmails || !user?.email || !c.denyEmails.map((e) => e.toLowerCase()).includes(user.email!.toLowerCase())),
            }),
    }))
    .filter((s) => s.items.length > 0);
}
