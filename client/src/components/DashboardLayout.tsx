import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { FileUp, LayoutDashboard, LogOut, Menu, PanelLeft, PlugZap, ReceiptText, Settings2, Tag, UtensilsCrossed } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/admin" },
  { icon: ReceiptText, label: "Orders", path: "/admin/orders" },
  { icon: UtensilsCrossed, label: "Menu", path: "/admin/menu" },
  { icon: FileUp, label: "Import menu", path: "/admin/import" },
  { icon: Tag, label: "Coupons", path: "/admin/coupons" },
  { icon: Settings2, label: "Restaurant", path: "/admin/restaurant" },
  { icon: PlugZap, label: "Integrations", path: "/admin/integrations" },
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
              {!isCollapsed ? <div className="min-w-0"><span className="font-display block text-lg tracking-tight text-[#3f2c20]">Spice Garden</span><span className="block text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#a06e53]">Operations desk</span></div> : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-1">
            {!isCollapsed && <div className="mx-2 mt-3 rounded-2xl bg-[#38271f] p-4 text-white"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e9bda2]">Kitchen status</p><p className="font-display mt-2 text-lg">Ready to configure</p><p className="mt-1 text-xs leading-relaxed text-white/65">Add your menu, then switch the kitchen on when you are ready for real orders.</p></div>}
            <SidebarMenu className="px-2 py-4">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 rounded-xl transition-all font-semibold ${isActive ? "bg-[#f9e4d5] text-[#9d3727] hover:bg-[#f9e4d5]" : "text-[#6d5140] hover:bg-[#f8eee6]"}`}
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

      <SidebarInset className="min-h-screen bg-[#f7f2eb]">
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#eadccf] bg-[#fffdf9]/95 px-4 backdrop-blur">
            <div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#a06e53]">Spice Garden</p><span className="font-display block truncate text-xl text-[#3f2c20]">{activeMenuItem?.label ?? "Operations"}</span></div>
            <SidebarTrigger className="h-10 w-10 rounded-xl border border-[#e4cdbb] bg-[#fff8f0] text-[#9d3727]" aria-label="Open operations navigation"><Menu className="h-5 w-5" /></SidebarTrigger>
          </div>
        )}
        <main className="flex-1 p-0 pb-24 md:p-0 md:pb-0">{children}</main>
        {isMobile && <nav aria-label="Primary operations navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e6d3c2] bg-[#fffdf9]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"><div className="mx-auto grid max-w-lg grid-cols-4 gap-1">{mobilePrimaryItems.map(item => { const active = location === item.path; return <button key={item.path} onClick={() => setLocation(item.path)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-extrabold transition-colors ${active ? "bg-[#f8e3d4] text-[#aa3e2c]" : "text-[#856552]"}`}><item.icon className="h-4 w-4" />{item.label}</button>; })}<button onClick={toggleSidebar} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-extrabold text-[#856552]"><PanelLeft className="h-4 w-4" />More</button></div></nav>}
      </SidebarInset>
    </>
  );
}
