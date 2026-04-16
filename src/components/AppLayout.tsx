
import { LayoutDashboard, Users, Map, Store, BookOpen, BarChart3, Settings, UserCog, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import lineageLogo from "@/assets/lineage-logo-white.png";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Sales Managers", url: "/managers", icon: UserCog },
  { title: "Sales Reps", url: "/reps", icon: Users },
  { title: "Territories", url: "/territories", icon: Map },
  { title: "Dealers", url: "/dealers", icon: Store },
  { title: "Directory", url: "/directory", icon: BookOpen },
  { title: "KPI", url: "/kpi", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

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
              {navItems.map((item) => (
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
              <p className="text-[11px] text-sidebar-muted truncate">Sales Portal</p>
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
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground hidden md:inline truncate max-w-[180px]">{user.email}</span>
      <Button variant="ghost" size="sm" onClick={() => signOut()} className="h-8">
        <LogOut className="h-3.5 w-3.5 mr-1" /> Sign out
      </Button>
    </div>
  );
}
