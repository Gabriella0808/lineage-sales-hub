import { useState } from "react";
import {
  LayoutDashboard, LogOut,
  ChevronDown, Compass, RefreshCw,
  ChevronLeft, ChevronRight, AlertCircle,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import lineageLogo from "@/assets/lineage-logo-white.png";
import { NavLink } from "@/components/NavLink";
import { isCustomerService } from "@/components/EmailGuard";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";
import { ReportContextProvider } from "@/contexts/ReportContextProvider";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { getVisibleNavSections, type NavItem } from "@/config/navSections";

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
            "relative flex-1 flex items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] text-sidebar-foreground/90",
            "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-background",
            "before:pointer-events-none before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity",
          )}
          activeClassName={cn(
            "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            "before:opacity-100",
          )}
        >
          {collapsed && (
            <item.icon className="h-[15px] w-[15px] shrink-0 text-sidebar-foreground/70 group-hover/item:text-sidebar-accent-foreground" />
          )}
          {!collapsed && <span className="truncate">{item.title}</span>}
        </NavLink>
        {!collapsed && hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleGroup(); }}
            aria-label={`Toggle ${item.title}`}
            aria-expanded={isOpen}
            className="p-1 mr-1 rounded text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-background"
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
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-background"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
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
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const closeOnMobile = () => { if (isMobile) setOpenMobile(false); };
  const { data: roleInfo } = useUserRole();
  const role: AppRole = roleInfo?.role ?? "rep";
  const location = useLocation();
  const { user } = useAuth();
  const [reportIssueOpen, setReportIssueOpen] = useState(false);

  const sections = getVisibleNavSections(role, user);

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
    <>
    <Sidebar collapsible="icon" className="border-r-0 bg-sidebar">
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border/70">
        <div className="flex items-center gap-3">
          <img src={lineageLogo} alt="Lineage Collections" className="h-9 w-auto" />
        </div>
      </SidebarHeader>

      <SidebarContent className="py-4 px-2 overflow-y-auto no-scrollbar">
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

      <div className="px-2 pt-1 pb-1 border-t border-sidebar-border/70">
        <button
          type="button"
          onClick={() => { setReportIssueOpen(true); closeOnMobile(); }}
          className={cn(
            "w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] text-sidebar-foreground/70",
            "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-background",
            collapsed && "justify-center",
          )}
        >
          <AlertCircle className="h-[15px] w-[15px] shrink-0" />
          {!collapsed && <span className="truncate">Report Issue</span>}
        </button>
      </div>

      <SidebarFooter className="p-3 border-t border-sidebar-border/70">
        <div className="flex items-center gap-3 px-1.5">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center overflow-hidden">
            <img src={lineageLogo} alt="Lineage Collections" className="w-8 h-8 object-contain" />
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

    <ReportIssueDialog open={reportIssueOpen} onOpenChange={setReportIssueOpen} />

    {/* Floating collapse toggle at sidebar edge (desktop only) */}
    {!isMobile && (
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{ left: `calc(var(--sidebar-${collapsed ? "width-icon" : "width"}) - 12px)` }}
        className={cn(
          "hidden lg:flex fixed top-[72px] z-50 h-6 w-6 items-center justify-center rounded-full",
          "bg-sidebar-primary text-sidebar-primary-foreground shadow-md",
          "hover:bg-sidebar-primary/90 transition-[left,background-color] duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <ChevronLeft className={cn("h-3.5 w-3.5", collapsed && "rotate-180")} />
      </button>
    )}
    </>
  );
}


export default function AppLayout({ children }: { children: React.ReactNode }) {
  const defaultOpen = typeof window === "undefined" ? true : window.innerWidth >= 1024;
  return (
    <ReportContextProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <div className="min-h-screen flex w-full bg-background">
          <SidebarNav />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center border-b border-border/70 px-3 sm:px-5 bg-card/80 backdrop-blur shrink-0 gap-2 sm:gap-3">
              <SidebarTrigger className="mr-1 shrink-0 lg:hidden" />
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
    </ReportContextProvider>
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
