import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Boxes, ChevronDown, ChevronLeft, LayoutGrid, Moon, Sun, ChevronRight, LayoutDashboard, LogOut, Menu, Package,
  RefreshCw, Search, Settings, Star, Store, Target,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import lineageLogo from "@/assets/lineage-logo-white.png";
import { NavLink } from "@/components/NavLink";
import { isCustomerService } from "@/components/EmailGuard";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";
import { ReportContextProvider } from "@/contexts/ReportContextProvider";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { getVisibleNavSections, type NavItem, type NavSection } from "@/config/navSections";
import { useDesktopWindowTitle } from "@/lib/desktop/useDesktopWindowTitle";
import { useConnectivity } from "@/lib/desktop/useConnectivity";
import { OfflineScreen } from "@/components/desktop/OfflineScreen";

const SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  command: LayoutDashboard,
  catalog: Package,
  sales: Target,
  network: Store,
  ops: Boxes,
  admin: Settings,
};

const PANEL_KEY = "lc.navPanelOpen";

function matchScore(url: string, pathname: string): number {
  if (url === "/") return pathname === "/" ? 1 : 0;
  return pathname === url || pathname.startsWith(url + "/") ? url.length : 0;
}

function locate(sections: NavSection[], pathname: string) {
  type Child = NonNullable<NavItem["children"]>[number];
  let best: { sectionId: string; item: NavItem | null; child: Child | null; score: number } = { sectionId: sections[0]?.id ?? "", item: null, child: null, score: 0 };
  for (const s of sections) {
    for (const item of s.items) {
      const own = matchScore(item.url, pathname);
      if (own > best.score) best = { sectionId: s.id, item, child: null, score: own };
      for (const c of item.children ?? []) {
        const cs = matchScore(c.url, pathname) + 0.5;
        if (matchScore(c.url, pathname) > 0 && cs > best.score) best = { sectionId: s.id, item, child: c, score: cs };
      }
    }
  }
  return best;
}

function initials(email?: string | null) {
  const name = (email ?? "?").split("@")[0].replace(/[^a-zA-Z]+/g, " ").trim();
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function PanelItems({ section, role, onNavigate }: { section: NavSection; role: AppRole; onNavigate?: () => void }) {
  const location = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <ul className="space-y-0.5">
      {section.items.map((item) => {
        const kids = (item.children ?? []).filter((c) => c.roles.includes(role));
        const inside = kids.some((c) => matchScore(c.url, location.pathname) > 0) || matchScore(item.url, location.pathname) > 0;
        const expanded = open[item.title] ?? inside;
        return (
          <li key={`${section.id}-${item.title}`}>
            <div className="flex items-center">
              <NavLink
                to={item.url}
                end={item.url === "/"}
                onClick={onNavigate}
                className="flex-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                activeClassName="bg-secondary text-foreground font-medium"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
              {kids.length > 0 && (
                <button
                  type="button"
                  aria-label={`Toggle ${item.title}`}
                  aria-expanded={expanded}
                  onClick={() => setOpen((p) => ({ ...p, [item.title]: !expanded }))}
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
                </button>
              )}
            </div>
            {kids.length > 0 && expanded && (
              <ul className="mt-0.5 ml-4 pl-3 border-l space-y-0.5">
                {kids.map((c) => (
                  <li key={c.url}>
                    <NavLink
                      to={c.url}
                      onClick={onNavigate}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      activeClassName="bg-secondary text-foreground font-medium"
                    >
                      <span className="truncate">{c.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function hardRefresh() {
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
}

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

function ClassicSidebar({ sections, role, user, onReportIssue }: { sections: NavSection[]; role: AppRole; user: { email?: string | null } | null | undefined; onReportIssue: () => void }) {
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const closeOnMobile = () => { if (isMobile) setOpenMobile(false); };
  const location = useLocation();

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
          onClick={() => { onReportIssue(); closeOnMobile(); }}
          className={cn(
            "w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] bg-sidebar-primary text-sidebar-primary-foreground",
            "hover:bg-sidebar-primary/90 transition-colors",
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



type NavStyle = "classic" | "top" | "bottom" | "drawer";
const STYLE_KEY = "lc.navStyle";
const PINS_KEY = "lc.navPins";
const STYLE_LABELS: Record<NavStyle, string> = {
  classic: "Classic sidebar",
  top: "Top navigation bar",
  bottom: "Bottom dock",
  drawer: "Right-side drawer",
};
const ALL_STYLES = Object.keys(STYLE_LABELS) as NavStyle[];

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: roleInfo } = useUserRole();
  const role: AppRole = roleInfo?.role ?? "rep";
  const sections = useMemo(() => getVisibleNavSections(role, user), [role, user]);
  const here = useMemo(() => locate(sections, location.pathname), [sections, location.pathname]);
  const sectionOf = sections.find((s) => s.id === here.sectionId);
  const roleLabel = isCustomerService(user?.email) ? "Customer service" : role;

  const [navStyle, setNavStyleState] = useState<NavStyle>(() => {
    try { const v = localStorage.getItem(STYLE_KEY); return ALL_STYLES.includes(v as NavStyle) ? (v as NavStyle) : "classic"; } catch { return "classic"; }
  });
  const setNavStyle = (v: NavStyle) => { setNavStyleState(v); try { localStorage.setItem(STYLE_KEY, v); } catch { /* ignore */ } };

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [flyout, setFlyout] = useState<string | null>(null);
  useEffect(() => { setFlyout(null); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goTo = (url: string) => { setSearchOpen(false); setMobileOpen(false); setFlyout(null); navigate(url); };

  const { mode: themeMode, setMode: setThemeMode, resolved: themeResolved } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  const dark = navStyle === "drawer" || navStyle === "top";

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("flex items-center gap-2 rounded-full pl-1 pr-2 py-1", dark ? "hover:bg-sidebar-accent" : "hover:bg-muted")} aria-label="Account menu">
          <span className={cn("h-8 w-8 rounded-full text-[11px] font-semibold flex items-center justify-center", dark ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground")}>{initials(user?.email)}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 hidden sm:block", dark ? "text-sidebar-muted" : "text-muted-foreground")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium truncate">{user?.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{roleLabel}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Appearance</DropdownMenuLabel>
        {(["light", "dark", "system"] as const).map((m) => (
          <DropdownMenuItem key={m} onClick={() => setThemeMode(m)} className="capitalize">
            <span className="w-4 mr-2">{themeMode === m ? "\u2713" : ""}</span>{m === "system" ? "Match my device" : `${m} mode`}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Navigation style</DropdownMenuLabel>
        {ALL_STYLES.map((k) => (
          <DropdownMenuItem key={k} onClick={() => setNavStyle(k)}>
            <span className="w-4 mr-2">{navStyle === k ? "\u2713" : ""}</span>{STYLE_LABELS[k]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => goTo("/settings")}><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setIssueOpen(true)}><AlertCircle className="h-4 w-4 mr-2" />Report an issue</DropdownMenuItem>
        <DropdownMenuItem onClick={() => hardRefresh()}><RefreshCw className="h-4 w-4 mr-2" />Refresh app</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const themeButton = (
    <button
      type="button"
      onClick={() => setThemeMode(themeResolved === "dark" ? "light" : "dark")}
      className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center transition-colors", dark ? "hover:bg-sidebar-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
      aria-label={themeResolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={themeResolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {themeResolved === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );

  const searchButton = (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className={cn(
        "flex items-center gap-2 h-9 w-full max-w-[280px] rounded-lg border px-3 text-[13px] transition-colors",
        dark ? "border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/80 hover:bg-sidebar-accent" : "bg-background text-muted-foreground hover:border-foreground/30",
      )}
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search pages</span>
      <kbd className={cn("hidden sm:inline text-[10px] rounded border px-1.5 py-0.5 font-sans", dark ? "border-sidebar-border" : "bg-muted")}>Ctrl K</kbd>
    </button>
  );

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-[13px] min-w-0">
      <span className="text-muted-foreground truncate">{sectionOf?.label}</span>
      {here.item && (<><ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className={cn("truncate", !here.child && "font-medium")}>{here.item.title}</span></>)}
      {here.child && (<><ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium truncate">{here.child.title}</span></>)}
    </nav>
  );

  // ── Style A: top navigation bar ──
  const topHeader = (
    <header className="h-14 shrink-0 flex items-center gap-2 bg-sidebar text-sidebar-foreground px-3 sm:px-5">
      <button type="button" onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-1 rounded-md hover:bg-sidebar-accent" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      <button type="button" onClick={() => goTo("/")} className="mr-3 shrink-0" title="Home"><img src={lineageLogo} alt="Lineage Collections" className="h-8 w-auto" /></button>
      <nav className="hidden lg:flex items-center gap-0.5" aria-label="Main navigation">
        {sections.map((sec) => (
          <DropdownMenu key={sec.id}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent", sec.id === here.sectionId && "bg-sidebar-accent text-sidebar-accent-foreground font-medium")}>
                {sec.label.split(" & ")[0]}<ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {sec.items.map((item) => {
                const kids = (item.children ?? []).filter((c) => c.roles.includes(role));
                return (
                  <div key={`${sec.id}-${item.title}`}>
                    <DropdownMenuItem onClick={() => goTo(item.url)} className={cn(matchScore(item.url, location.pathname) > 0 && "font-medium bg-secondary")}>
                      <item.icon className="h-4 w-4 mr-2 text-muted-foreground" />{item.title}
                    </DropdownMenuItem>
                    {kids.map((c) => (
                      <DropdownMenuItem key={c.url} onClick={() => goTo(c.url)} className={cn("pl-9 text-[12.5px] text-muted-foreground", matchScore(c.url, location.pathname) > 0 && "font-medium bg-secondary text-foreground")}>{c.title}</DropdownMenuItem>
                    ))}
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </nav>
      <div className="flex-1" />
      {searchButton}
      {themeButton}
      <NotificationsBell />
      {accountMenu}
    </header>
  );

  // ── Styles B and C share a light header ──
  const lightHeader = (
    <header className="h-14 shrink-0 flex items-center gap-3 border-b bg-card px-3 sm:px-5">
      <button type="button" onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-1 rounded-md hover:bg-muted" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      {breadcrumb}
      <div className="flex-1" />
      {searchButton}
      {themeButton}
      <NotificationsBell />
      {accountMenu}
    </header>
  );

  // ── Style: bottom dock ──
  const bottomDock = (
    <>
      {flyout && <div className="hidden lg:block fixed inset-0 z-30" onClick={() => setFlyout(null)} />}
      <div className="hidden lg:flex fixed bottom-4 left-1/2 -translate-x-1/2 z-40 items-end gap-1 rounded-2xl bg-sidebar p-2 shadow-xl">
        {sections.map((sec) => {
          const Icon = SECTION_ICONS[sec.id] ?? LayoutDashboard;
          const active = sec.id === here.sectionId || flyout === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              title={sec.label}
              onClick={() => setFlyout(flyout === sec.id ? null : sec.id)}
              className={cn("group/d flex flex-col items-center gap-1 rounded-xl px-3.5 pt-2 pb-1.5 text-sidebar-foreground/75 transition-all hover:-translate-y-1.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", active && "bg-sidebar-accent text-sidebar-accent-foreground")}
            >
              <Icon className="h-6 w-6 transition-transform group-hover/d:scale-125" />
              <span className="text-[10px] leading-none">{sec.label.split(" ")[0]}</span>
            </button>
          );
        })}
        <button type="button" title="Report an issue" onClick={() => setIssueOpen(true)} className="ml-1 self-center h-10 w-10 rounded-xl flex items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90"><AlertCircle className="h-5 w-5" /></button>
      </div>
      {flyout && (() => {
        const sec = sections.find((x) => x.id === flyout);
        return sec ? (
          <div className="hidden lg:block fixed bottom-[100px] left-1/2 -translate-x-1/2 z-40 w-[300px] max-h-[60vh] overflow-y-auto rounded-2xl border bg-card p-3 shadow-xl">
            <p className="px-2.5 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sec.label}</p>
            <PanelItems section={sec} role={role} onNavigate={() => setFlyout(null)} />
          </div>
        ) : null;
      })()}
    </>
  );

  // ── Style: right-side drawer ──
  const drawerHeader = (
    <>
      <header className="h-14 shrink-0 flex items-center gap-2 bg-sidebar text-sidebar-foreground px-3 sm:px-5">
        <button type="button" onClick={() => goTo("/")} className="mr-3 shrink-0" title="Home"><img src={lineageLogo} alt="Lineage Collections" className="h-8 w-auto" /></button>
        <div className="hidden md:block text-sidebar-foreground/80">{breadcrumb}</div>
        <div className="flex-1" />
        {searchButton}
        {themeButton}
        <NotificationsBell />
        <button type="button" onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] bg-sidebar-accent hover:bg-sidebar-accent/80" aria-label="Open menu"><Menu className="h-4 w-4" /><span className="hidden sm:inline">Menu</span></button>
        {accountMenu}
      </header>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[380px] sm:max-w-[380px] p-0 overflow-y-auto">
          <div className="p-5 border-b bg-sidebar"><img src={lineageLogo} alt="Lineage Collections" className="h-8 w-auto" /></div>
          <div className="p-4 space-y-6">
            {sections.map((sx) => (
              <div key={sx.id}>
                <p className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sx.label}</p>
                <PanelItems section={sx} role={role} onNavigate={() => setDrawerOpen(false)} />
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );

  const header = navStyle === "top" ? topHeader : navStyle === "drawer" ? drawerHeader : lightHeader;

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      {navStyle === "classic" && <ClassicSidebar sections={sections} role={role} user={user} onReportIssue={() => setIssueOpen(true)} />}
      <div className="flex-1 flex flex-col min-w-0">
        {header}
        <main className="flex-1 overflow-auto">
          <div className={cn("mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8", navStyle === "bottom" && "lg:pb-28")}>{children}</div>
        </main>
      </div>
      {navStyle === "bottom" && bottomDock}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[290px] p-0 overflow-y-auto">
          <div className="p-4 border-b bg-sidebar"><img src={lineageLogo} alt="Lineage Collections" className="h-8 w-auto" /></div>
          <div className="p-3 space-y-5">
            {sections.map((sx) => (
              <div key={sx.id}>
                <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sx.label}</p>
                <PanelItems section={sx} role={role} onNavigate={() => setMobileOpen(false)} />
              </div>
            ))}
            <button type="button" onClick={() => { setMobileOpen(false); setIssueOpen(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] bg-primary text-primary-foreground">
              <AlertCircle className="h-4 w-4" />Report an issue
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Jump to a page..." />
        <CommandList>
          <CommandEmpty>No pages match.</CommandEmpty>
          {sections.map((sx) => (
            <CommandGroup key={sx.id} heading={sx.label}>
              {sx.items.flatMap((item) => [item, ...((item.children ?? []).filter((c) => c.roles.includes(role)) as NavItem[])]).map((item) => (
                <CommandItem key={`${sx.id}-${item.title}-${item.url}`} value={`${sx.label} ${item.title}`} onSelect={() => goTo(item.url)}>
                  <item.icon className="h-4 w-4 mr-2 text-muted-foreground" />{item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <ReportIssueDialog open={issueOpen} onOpenChange={setIssueOpen} />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useDesktopWindowTitle();
  const { isConnected, checking, retry } = useConnectivity();

  if (!isConnected) {
    return <OfflineScreen onRetry={retry} checking={checking} />;
  }

  return (
    <ReportContextProvider>
      <SidebarProvider defaultOpen={typeof window === "undefined" ? true : window.innerWidth >= 1024}>
        <Shell>{children}</Shell>
      </SidebarProvider>
    </ReportContextProvider>
  );
}
