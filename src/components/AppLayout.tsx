
import {
  LayoutDashboard, Users, Map, Store, BookOpen, BarChart3, Settings,
  UserCog, LogOut, LayoutGrid, CheckSquare, Package, MapPinned, Plane,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import lineageLogo from "@/assets/lineage-logo-white.png";
import { NavLink } from "@/components/NavLink";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
  SidebarHeader, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[]; // who can see this item
};

const NAV_ITEMS: NavItem[] = [
  { title: "Overview",        url: "/",              icon: LayoutDashboard, roles: ["admin", "manager", "rep"] },
  { title: "Sales Managers",  url: "/managers",      icon: UserCog,         roles: ["admin"] },
  { title: "Sales Reps",      url: "/reps",          icon: Users,           roles: ["admin", "manager"] },
  { title: "My Dealers",      url: "/dealers",       icon: Store,           roles: ["rep"] },
  { title: "Dealers",         url: "/dealers",       icon: Store,           roles: ["admin", "manager"] },
  { title: "Directory",       url: "/directory",     icon: BookOpen,        roles: ["admin", "manager"] },
  { title: "Company-wide",    url: "/company-wide",  icon: BarChart3,       roles: ["admin"] },
  { title: "Team Performance",url: "/company-wide",  icon: BarChart3,       roles: ["manager"] },
  { title: "My Performance",  url: "/company-wide",  icon: BarChart3,       roles: ["rep"] },
  { title: "Monday Boards",   url: "/monday-boards", icon: LayoutGrid,      roles: ["admin", "manager"] },
  { title: "Check-Ins",       url: "/check-ins",     icon: MapPinned,       roles: ["manager"] },
  { title: "Travel Log",      url: "/travel-log",    icon: Plane,           roles: ["admin", "manager"] },
  { title: "Inventory",       url: "/inventory",     icon: Package,         roles: ["admin"] },
  { title: "My Tasks",        url: "/tasks",         icon: CheckSquare,     roles: ["admin", "manager", "rep"] },
  { title: "Settings",        url: "/settings",      icon: Settings,        roles: ["admin", "manager", "rep"] },
];

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { data: roleInfo } = useUserRole();
  const role = roleInfo?.role ?? "rep";

  // de-dupe by url+title in case two role-specific labels collide
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img src={lineageLogo} alt="Lineage Collections" className="h-8 w-auto" />
        </div>
      </SidebarHeader>

      <SidebarContent className="py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild size="default">
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4 mr-3 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground">
            LC
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">Lineage Collections</p>
              <p className="text-[11px] text-sidebar-muted truncate capitalize">{role} portal</p>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SidebarNav />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b px-4 bg-card shrink-0 gap-3">
            <SidebarTrigger className="mr-1" />
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <SignOutButton />
          </header>
          <main className="flex-1 p-6 overflow-auto">
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
    <div className="flex items-center gap-2">
      <div className="hidden md:flex flex-col items-end leading-tight">
        <span className="text-xs text-muted-foreground truncate max-w-[180px]">{user.email}</span>
        {roleInfo && (
          <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">
            {roleInfo.role}
          </span>
        )}
      </div>
      <NotificationsBell />
      <Button variant="ghost" size="sm" onClick={() => signOut()} className="h-8">
        <LogOut className="h-3.5 w-3.5 mr-1" /> Sign out
      </Button>
    </div>
  );
}
