import { useState } from "react";
import {
  LayoutDashboard, Users, Store, BookOpen, BarChart3, Settings,
  UserCog, LogOut, LayoutGrid, ListChecks, Boxes, MapPinned, Plane, PieChart,
  ChevronDown, Megaphone, ClipboardList, Compass, Network, RefreshCw, Target, Package, ShoppingCart,
  FileText, Send, FolderOpen, LifeBuoy, Undo2, BookMarked,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import lineageLogo from "@/assets/lineage-logo-white.png";
import { NavLink } from "@/components/NavLink";
import { isAllowedEmail, isCustomerService } from "@/components/EmailGuard";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
  children?: { title: string; url: string; icon: typeof LayoutDashboard; roles: AppRole[] }[];
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * Lineage Collections — internal operating system navigation.
 * Items are grouped into operational sections so the shell reads
 * like a purpose-built tool, not a generic admin template.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    id: "command",
    label: "Command Center",
    items: [
      { title: "Overview",  url: "/",      icon: Compass,     roles: ["admin", "manager", "rep"] },
      { title: "My Tasks", url: "/tasks", icon: ListChecks, roles: ["admin", "manager", "rep"] },
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
    id: "support",
    label: "Customer Service",
    items: [
      { title: "Tickets & Cases", url: "/tickets", icon: LifeBuoy, roles: ["admin", "manager", "rep", "dealer"] },
      { title: "Returns & RMAs", url: "/returns", icon: Undo2, roles: ["admin", "manager", "rep", "dealer"] },
      { title: "Knowledge Base", url: "/knowledge-base", icon: BookMarked, roles: ["admin", "manager", "rep", "dealer"] },
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
        { title: "Visit Analytics", url: "/check-ins/analytics", icon: PieChart, roles: ["admin", "manager"] },
      ],
    },
      { title: "Travel Log", url: "/travel-log", icon: Plane, roles: ["admin", "manager"] },
      {
        title: "Trade Show Leads", url: "/trade-show-leads", icon: Megaphone, roles: ["admin", "manager"],
        children: [
          { title: "Capture Leads", url: "/trade-show-leads/capture", icon: ClipboardList, roles: ["admin", "manager"] },
        ],
      },
    ],
  },
  {
    id: "network",
    label: "Dealer Network",
    items: [
      { title: "Dealers", url: "/dealers", icon: Store, roles: ["admin", "manager", "rep"] },
      { title: "Directory",  url: "/directory", icon: BookOpen, roles: ["admin", "manager"] },
    ],
  },
  {
    id: "ops",
    label: "Inventory & Reporting",
    items: [
      { title: "Inventory", url: "/inventory", icon: Boxes, roles: ["admin", "manager", "rep", "dealer"] },
      { title: "Company-wide",     url: "/company-wide",  icon: BarChart3, roles: ["admin"] },
      { title: "Team Performance", url: "/company-wide",  icon: BarChart3, roles: ["manager"] },
      { title: "My Performance",   url: "/company-wide",  icon: BarChart3, roles: ["rep"] },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { title: "Organizational Chart", url: "/org-chart", icon: Network,  roles: ["admin"] },
      { title: "Sales Managers", url: "/managers", icon: UserCog,  roles: ["admin"] },
      { title: "Sales Reps",     url: "/reps",     icon: Users,    roles: ["admin", "manager"] },
      { title: "Settings",       url: "/settings", icon: Settings, roles: ["admin", "manager", "rep"] },
    ],
  },
];

function SidebarNavItemRow({
  item, role, collapsed, isOpen, onToggleGroup, closeOnMobile,
}: {
  item: NavItem;
  role: AppRole;
  collapsed: boolean;
  isOpen: boolean;
  onToggleGroup: () => void;
  closeOnMobile: () => void;
}) {
  const hasChildren = !!item.children?.length;
  return (
    <li>
      <div className="group/item relative flex items-center">
        <NavLink
          to={item.url}
          end={item.url === "/"}
          onClick={closeOnMobile}
          className={cn(
            "flex-1 flex items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] text-sidebar-foreground/90",
            "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground transition-colors",
          )}
          activeClassName={cn(
            "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            "shadow-[inset_2px_0_0_0_hsl(var(--sidebar-primary))]",
          )}
        >
          <item.icon className="h-[15px] w-[15px] shrink-0 text-sidebar-foreground/70 group-hover/item:text-sidebar-accent-foreground" />
          {!collapsed && <span className="truncate">{item.title}</span>}
        </NavLink>
        {!collapsed && hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleGroup(); }}
            aria-label={`Toggle ${item.title}`}
            aria-expanded={isOpen}
            className="p-1 mr-1 rounded text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
          </button>
        )}
      </div>
      {!collapsed && hasChildren && isOpen && (
        <ul className="mt-0.5 ml-7 border-l border-sidebar-border/70 pl-3 space-y-0.5">
          {item.children!.filter((c) => c.roles.includes(role)).map((child) => (
            <li key={child.url}>
              <NavLink
                to={child.url}
                onClick={closeOnMobile}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <child.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{child.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SidebarNav() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const closeOnMobile = () => { if (isMobile) setOpenMobile(false); };
  const { data: roleInfo } = useUserRole();
  const role: AppRole = roleInfo?.role ?? "rep";
  const location = useLocation();
  const { user } = useAuth();

  const cs = isCustomerService(user?.email);
  const CS_ALLOWED = new Set(["/", "/tasks", "/dealers", "/settings", "/tickets", "/returns", "/knowledge-base"]);

  const sections = NAV_SECTIONS
    .filter((s) => {
      if (cs) return true;
      if (s.id === "catalog") return isAllowedEmail(user?.email);
      if (s.id === "support") return isCustomerService(user?.email);
      return true;
    })
    .map((s) => ({
      ...s,
      items: s.items
        .filter((i) => (cs ? CS_ALLOWED.has(i.url) : i.roles.includes(role)))
        .map((i) => (cs ? { ...i, children: undefined } : i)),
    }))
    .filter((s) => s.items.length > 0);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sections.forEach((s) => s.items.forEach((item) => {
      if (item.children) {
        const inside =
          location.pathname === item.url ||
          location.pathname.startsWith(item.url + "/") ||
          item.children.some((c) => location.pathname === c.url);
        initial[item.title] = inside;
      }
    }));
    return initial;
  });

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-sidebar">
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border/70">
        <div className="flex items-center gap-3">
          <img src={lineageLogo} alt="Lineage Collections" className="h-9 w-auto" />
        </div>
      </SidebarHeader>

      <SidebarContent className="py-4 px-2 overflow-y-auto">
        <nav className="space-y-5">
          {sections.map((section, idx) => (
            <div key={section.id}>
              {!collapsed && (
                <div className="px-2.5 mb-1.5 flex items-center gap-2">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-sidebar-section">
                    {section.label}
                  </span>
                  <span className="flex-1 h-px bg-sidebar-border/60" />
                </div>
              )}
              {collapsed && idx > 0 && (
                <div className="mx-2 mb-2 h-px bg-sidebar-border/60" />
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarNavItemRow
                    key={`${section.id}-${item.title}`}
                    item={item}
                    role={role}
                    collapsed={collapsed}
                    isOpen={openGroups[item.title] ?? false}
                    onToggleGroup={() => toggleGroup(item.title)}
                    closeOnMobile={closeOnMobile}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border/70">
        <div className="flex items-center gap-3 px-1.5">
          <div className="w-8 h-8 rounded-sm bg-gradient-bronze flex items-center justify-center text-[11px] font-semibold text-sidebar-primary-foreground shadow-soft">
            LC
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">Lineage Collections</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-sidebar-section truncate">{isCustomerService(user?.email) ? "CUSTOMER SERVICE" : role} workspace</p>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const defaultOpen = typeof window === "undefined" ? true : window.innerWidth >= 1024;
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <div className="min-h-screen flex w-full bg-background">
        <SidebarNav />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border/70 px-3 sm:px-5 bg-card/80 backdrop-blur shrink-0 gap-2 sm:gap-3">
            <SidebarTrigger className="mr-1 shrink-0" />
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground hidden lg:inline tabular-nums">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline lg:hidden tabular-nums">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <RefreshUpdatesButton />
            <SignOutButton />
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function SignOutButton() {
  const { user, signOut } = useAuth();
  const { data: roleInfo } = useUserRole();
  if (!user) return null;
  return (
    <div className="flex items-center gap-1 sm:gap-2 min-w-0">
      <div className="hidden md:flex flex-col items-end leading-tight">
        <span className="text-xs text-foreground truncate max-w-[180px]">{user.email}</span>
        {roleInfo && (
          <span className="text-[9.5px] uppercase tracking-[0.2em] text-accent font-semibold">
            {isCustomerService(user?.email) ? "CUSTOMER SERVICE" : roleInfo.role}
          </span>
        )}
      </div>
      <NotificationsBell />
      <Button variant="ghost" size="sm" onClick={() => signOut()} className="h-8 px-2 sm:px-3">
        <LogOut className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}

function RefreshUpdatesButton() {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch {
      // ignore
    }
    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString());
    window.location.replace(url.toString());
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRefresh}
      className="h-8 px-2 sm:px-3"
      title="Refresh updates"
      aria-label="Refresh updates"
    >
      <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-1", refreshing && "animate-spin")} />
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );
}
