import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { Award, BarChart3, Bell, Box, ChefHat, FileUp, Globe, Grid3X3, Layers, LayoutDashboard, LogOut, Menu, PanelLeft, PlugZap, ReceiptText, RefreshCw, Settings2, ShieldCheck, Store, Tag, TriangleAlert, UtensilsCrossed, Users } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

// =============================================================================
// Shared admin navigation + helpers
// =============================================================================

export type AdminPermissionScope = "team" | "integrations" | "domains";

export type AdminNavItem = {
  section: string;
  icon: typeof LayoutDashboard;
  label: string;
  group: "Operate" | "Catalog" | "Grow" | "Setup";
  permission?: AdminPermissionScope;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { section: "overview", icon: LayoutDashboard, label: "Overview", group: "Operate" },
  { section: "orders", icon: ReceiptText, label: "Orders", group: "Operate" },
  { section: "kds", icon: ChefHat, label: "KDS", group: "Operate" },
  { section: "inventory", icon: Box, label: "Inventory", group: "Operate" },
  { section: "menu", icon: UtensilsCrossed, label: "Menu", group: "Catalog" },
  { section: "categories", icon: Grid3X3, label: "Categories", group: "Catalog" },
  { section: "combos", icon: Layers, label: "Combos", group: "Catalog" },
  { section: "coupons", icon: Tag, label: "Coupons", group: "Catalog" },
  { section: "import", icon: FileUp, label: "Import menu", group: "Catalog" },
  { section: "customers", icon: Users, label: "Customers", group: "Grow" },
  { section: "analytics", icon: BarChart3, label: "Analytics", group: "Grow" },
  { section: "loyalty", icon: Award, label: "Loyalty", group: "Grow" },
  { section: "restaurant", icon: Settings2, label: "Restaurant", group: "Setup" },
  { section: "outlets", icon: Store, label: "Outlets", group: "Setup" },
  { section: "staff", icon: ShieldCheck, label: "Staff", group: "Setup", permission: "team" },
  { section: "integrations", icon: PlugZap, label: "Integrations", group: "Setup", permission: "integrations" },
  { section: "domains", icon: Globe, label: "Domains", group: "Setup", permission: "domains" },
  { section: "notifications", icon: Bell, label: "Notifications", group: "Setup" },
];

export const SECTION_TITLES: Record<string, string> = {
  overview: "Today at a glance",
  orders: "Order queue",
  kds: "Kitchen display",
  inventory: "Inventory & recipes",
  menu: "Menu studio",
  categories: "Category manager",
  combos: "Combo builder",
  coupons: "Offers desk",
  import: "Menu import",
  customers: "Customer directory",
  analytics: "Analytics",
  loyalty: "Loyalty program",
  restaurant: "Restaurant settings",
  outlets: "Outlet manager",
  staff: "Team management",
  integrations: "Integration settings",
  domains: "Custom domains",
  notifications: "Notification settings",
};

export function cleanAdminLocation(location: string): string {
  const path = location.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function parseAdminLocation(location: string): { slug?: string; section: string } {
  const parts = cleanAdminLocation(location).split("/").filter(Boolean);
  if (parts[0]?.toLowerCase() !== "admin") return { section: "overview" };
  if (parts.length >= 3) return { slug: parts[1], section: parts[2].toLowerCase() || "overview" };
  if (parts.length === 2) {
    if (parts[1].toLowerCase() in SECTION_TITLES) return { section: parts[1].toLowerCase() };
    return { slug: parts[1], section: "overview" };
  }
  return { section: "overview" };
}

export function adminPath(slug: string | undefined, section: string): string {
  const base = slug ? `/admin/${encodeURIComponent(slug)}` : "/admin";
  return section === "overview" ? base : `${base}/${encodeURIComponent(section)}`;
}

export function sectionTitle(section: string): string {
  return SECTION_TITLES[section] ?? "Operations";
}

export function isForbiddenError(err: unknown): boolean {
  const code = (err as { data?: { code?: string } } | null)?.data?.code;
  if (code === "FORBIDDEN") return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("FORBIDDEN") || msg.includes("Missing permission") || msg.includes("not a member");
}

export function useMyPermissions(restaurantId: string | undefined) {
  const teamProbe = trpc.admin.listMembers.useQuery(
    { restaurantId: restaurantId ?? "" },
    { enabled: !!restaurantId, retry: false, staleTime: 60_000, refetchOnWindowFocus: false }
  );
  const integrationsProbe = trpc.admin.integrationStatus.useQuery(
    { restaurantId: restaurantId ?? "" },
    { enabled: !!restaurantId, retry: false, staleTime: 60_000, refetchOnWindowFocus: false }
  );

  const teamHidden = !!teamProbe.error && isForbiddenError(teamProbe.error);
  const integrationsHidden = !!integrationsProbe.error && isForbiddenError(integrationsProbe.error);

  return {
    canManageTeam: !teamHidden,
    canManageDomains: !teamHidden,
    canManageIntegrations: !integrationsHidden,
    permissionsLoading: !!restaurantId && (teamProbe.isLoading || integrationsProbe.isLoading),
  };
}

export function canSeeNavItem(
  item: AdminNavItem,
  perms: { canManageTeam: boolean; canManageDomains: boolean; canManageIntegrations: boolean }
): boolean {
  if (item.permission === "team") return perms.canManageTeam;
  if (item.permission === "domains") return perms.canManageDomains;
  if (item.permission === "integrations") return perms.canManageIntegrations;
  return true;
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <main className="grid min-h-[50vh] place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <TriangleAlert className="mx-auto h-6 w-6 text-red-600" aria-hidden />
        <p role="alert" className="mt-3 text-sm font-bold leading-relaxed text-red-700">
          {message}
        </p>
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="mt-4 h-10 rounded-xl border-gray-200 bg-white text-xs font-extrabold text-gray-700"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
            Retry
          </Button>
        )}
      </div>
    </main>
  );
}

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/admin" },
  { icon: ReceiptText, label: "Orders", path: "/admin/orders" },
  { icon: ChefHat, label: "KDS", path: "/admin/kds" },
  { icon: Box, label: "Inventory", path: "/admin/inventory" },
  { icon: UtensilsCrossed, label: "Menu", path: "/admin/menu" },
  { icon: Grid3X3, label: "Categories", path: "/admin/categories" },
  { icon: FileUp, label: "Import menu", path: "/admin/import" },
  { icon: Tag, label: "Coupons", path: "/admin/coupons" },
  { icon: Users, label: "Customers", path: "/admin/customers" },
  { icon: Settings2, label: "Restaurant", path: "/admin/restaurant" },
  { icon: PlugZap, label: "Integrations", path: "/admin/integrations" },
  { icon: Globe, label: "Domains", path: "/admin/domains" },
  { icon: ShieldCheck, label: "Team", path: "/admin/staff" },
  { icon: Bell, label: "Notifications", path: "/admin/notifications" },
  { icon: BarChart3, label: "Analytics", path: "/admin/analytics" },
  { icon: Store, label: "Outlets", path: "/admin/outlets" },
  { icon: Award, label: "Loyalty", path: "/admin/loyalty" },
  { icon: UtensilsCrossed, label: "Combos", path: "/admin/combos" },
];
const mobilePrimaryItems = menuItems.slice(0, 3);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? <div className="min-w-0"><span className="font-bold block text-lg tracking-tight text-gray-900">Kitchen Admin</span><span className="block text-[9px] font-extrabold uppercase tracking-[0.16em] text-gray-500">Operations desk</span></div> : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-1">
            {!isCollapsed && <div className="mx-2 mt-3 rounded-2xl bg-gray-900 p-4 text-white"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-gray-300">Kitchen status</p><p className="font-bold mt-2 text-lg">Ready to configure</p><p className="mt-1 text-xs leading-relaxed text-white/65">Add your menu, then switch the kitchen on when you are ready for real orders.</p></div>}
            <SidebarMenu className="px-2 py-4">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 rounded-xl transition-all font-semibold ${isActive ? "bg-red-50 text-[#c84630] hover:bg-red-50" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="min-h-screen bg-[#F8F9FA]">
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur">
            <div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-gray-500">Kitchen Admin</p><span className="font-bold block truncate text-xl text-gray-900">{activeMenuItem?.label ?? "Operations"}</span></div>
            <SidebarTrigger className="h-10 w-10 rounded-xl border border-gray-200 bg-white text-gray-700" aria-label="Open operations navigation"><Menu className="h-5 w-5" /></SidebarTrigger>
          </div>
        )}
        <main className="flex-1 p-0 pb-24 md:p-0 md:pb-0">{children}</main>
        {isMobile && <nav aria-label="Primary operations navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"><div className="mx-auto grid max-w-lg grid-cols-4 gap-1">{mobilePrimaryItems.map(item => { const active = location === item.path; return <button key={item.path} onClick={() => setLocation(item.path)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-extrabold transition-colors ${active ? "bg-red-50 text-[#c84630]" : "text-gray-500"}`}><item.icon className="h-4 w-4" />{item.label}</button>; })}<button onClick={toggleSidebar} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-extrabold text-gray-500"><PanelLeft className="h-4 w-4" />More</button></div></nav>}
      </SidebarInset>
    </>
  );
}
