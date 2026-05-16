import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUsersSummary } from "@/lib/api";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Monitor, ShoppingBag, Package, BookOpen,
  ShoppingCart, Settings, ChevronLeft, ChevronRight, ChevronDown,
  ChevronUp, LogOut, Truck, Wifi, WifiOff, Menu, X,
  Users, Layers, Pin, Plug, UsersRound, Wrench, Receipt,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Nav types ────────────────────────────────────────────────────────────────

interface NavLeaf { label: string; path: string }
interface NavGroup {
  id: string; label: string; icon: React.ElementType;
  children?: NavLeaf[]; path?: string;
}

// Chromeless routes (no sidebar/header)
const CHROMELESS_PATHS = ["/"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPathInGroup(group: NavGroup, location: string): boolean {
  if (group.path) return location === group.path;
  return group.children?.some((c) => location === c.path || location.startsWith(c.path + "/")) ?? false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SaaSLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { currentUser, isOfflineMode, setOfflineMode, toggleOfflineMode, logout } = useStore();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("vansales_sidebar_collapsed") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [businessLogo, setBusinessLogo] = useState<string | null>(() => {
    try { return localStorage.getItem("vansales_business_logo") || null; } catch { return null; }
  });
  const prevLocation = useRef(location);

  useEffect(() => {
    fetch("/api/public/business-logo")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const logo = data?.value ?? null;
        setBusinessLogo(logo);
        try {
          if (logo) localStorage.setItem("vansales_business_logo", logo);
          else localStorage.removeItem("vansales_business_logo");
        } catch {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (location !== prevLocation.current) {
      setMobileOpen(false);
      prevLocation.current = location;
    }
  }, [location]);

  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(false);
      toast({ title: "Back Online", description: "You can now sync orders to BigCommerce." });
    };
    const handleOffline = () => {
      setOfflineMode(true);
      toast({ title: "Offline Mode Active", description: "Orders will be saved as drafts.", variant: "destructive" });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, [setOfflineMode, toast]);

  const handleLogout = () => { logout(); setLocation("/"); };
  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem("vansales_sidebar_collapsed", String(v)); } catch {}
  };
  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      if (prev.has(id)) return new Set();
      return new Set([id]);
    });
  };
  const navigate = (path: string) => { setLocation(path); setMobileOpen(false); };

  const isChromeless = CHROMELESS_PATHS.includes(location) || !currentUser;

  const { data: usersSummary = [] } = useQuery({
    queryKey: ["users", "summary"],
    queryFn: getUsersSummary,
    enabled: !!currentUser && !isChromeless,
    staleTime: 5 * 60 * 1000,
  });

  const myGroupName = usersSummary.find((u) => u.id === currentUser?.id)?.group_name ?? null;

  if (isChromeless) return <>{children}</>;

  const role = currentUser.role as "admin" | "agent";

  // ── Build nav items based on permissions ────────────────────────────────────

  // Orders children (all permission-gated)
  const ordersChildren: NavLeaf[] = [
    ...(hasPermission("orders_my") ? [{ label: "My Orders", path: "/orders" }] : []),
    ...(hasPermission("orders_drafts") ? [{ label: "Drafts", path: "/orders/drafts" }] : []),
    ...(hasPermission("orders_all") ? [{ label: "All Orders", path: "/orders/all" }] : []),
    ...(hasPermission("orders_bc") ? [{ label: "BC Orders", path: "/orders/bc" }] : []),
  ];

  // Customers children
  const customersChildren: NavLeaf[] = [
    ...(hasPermission("customers_create") ? [{ label: "Create BC Customer", path: "/customers/create" }] : []),
    ...(hasPermission("customers_all") ? [{ label: "All Customers", path: "/customers/all" }] : []),
  ];

  // Inventory children
  const inventoryChildren: NavLeaf[] = [
    ...(hasPermission("inventory_push") ? [{ label: "Push Inventory", path: "/inventory/push" }] : []),
    ...(hasPermission("inventory_logs") ? [{ label: "Push Logs", path: "/inventory-push-logs" }] : []),
  ];

  // Tools children — permission-gated
  const toolsChildren: NavLeaf[] = [
    ...(hasPermission("tools_bc_link") ? [{ label: "BC Product Link", path: "/tools/bc-product-link" }] : []),
    ...(hasPermission("tools_bc_link_logs") ? [{ label: "Product Link Logs", path: "/tools/bc-product-link-logs" }] : []),
  ];

  // Build final nav list — only include items the user can access
  const navItems: NavGroup[] = [
    ...(hasPermission("dashboard") ? [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }] : []),
    ...(hasPermission("pos") ? [{ id: "pos", label: "POS", icon: Monitor, path: "/pos" }] : []),
    ...(customersChildren.length > 0 ? [{ id: "customers", label: "Customers", icon: Users, children: customersChildren }] : []),
    ...(ordersChildren.length > 0 ? [{ id: "orders", label: "Orders", icon: ShoppingBag, children: ordersChildren }] : []),
    ...(inventoryChildren.length > 0 ? [{ id: "inventory", label: "Inventory", icon: Package, children: inventoryChildren }] : []),
    ...(hasPermission("catalog") ? [{ id: "catalog", label: "Catalog", icon: BookOpen, path: "/catalog" }] : []),
    ...(hasPermission("cart") ? [{ id: "cart", label: "Cart", icon: ShoppingCart, path: "/cart" }] : []),
    ...(toolsChildren.length > 0 ? [{ id: "tools", label: "Tools", icon: Wrench, children: toolsChildren }] : []),
  ];

  // Settings section: system admins always; agents with admin:view permission
  const showSettings = hasPermission("admin");

  // Settings links — User Groups only visible to system admins (manage users/groups)
  const settingsLinks = [
    { label: "Catalog Management", path: "/admin/catalog", icon: Pin },
    { label: "User Management", path: "/admin/users", icon: Users },
    ...(role === "admin" ? [{ label: "User Groups", path: "/admin/groups", icon: UsersRound }] : []),
    { label: "BC Integration", path: "/admin/integration", icon: Plug },
    { label: "Price Tiers", path: "/admin/price-tiers", icon: Layers },
    { label: "Invoice Settings", path: "/admin/invoice", icon: Receipt },
  ];

  function isActive(path: string) { return location === path; }
  function isGroupActive(group: NavGroup) { return isPathInGroup(group, location); }

  // ── Sidebar content ─────────────────────────────────────────────────────────

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={cn("flex border-b border-slate-700 shrink-0", collapsed ? "items-center justify-center px-2 h-14" : "flex-col items-center justify-center px-3 py-3 gap-1")}>
        {businessLogo ? (
          <img
            src={businessLogo}
            alt="Logo"
            className={cn("object-contain", collapsed ? "h-8 w-8 shrink-0" : "h-[120px] w-auto max-w-full")}
            data-testid="img-sidebar-logo"
          />
        ) : (
          <div className="shrink-0 h-7 w-7 rounded-md bg-blue-500 flex items-center justify-center">
            <Truck className="h-4 w-4 text-white" />
          </div>
        )}
        {!collapsed && !businessLogo && <span className="font-bold text-[13px] text-white truncate">Midatlantic</span>}
        <button onClick={() => setMobileOpen(false)} className={cn("text-slate-400 hover:text-white md:hidden", collapsed ? "ml-auto" : "absolute top-2 right-2")}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* User card */}
      {!collapsed && (
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-xs font-semibold text-slate-100 truncate">{currentUser.name}</p>
          <p className="text-[11px] text-slate-400 capitalize">{myGroupName ?? currentUser.role}</p>
        </div>
      )}

      {!collapsed && <p className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-widest text-slate-500 uppercase">Main</p>}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.path) {
            const active = isActive(item.path);
            return (
              <button key={item.id} onClick={() => navigate(item.path!)} title={collapsed ? item.label : undefined}
                data-testid={`nav-${item.id}`}
                className={cn("w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors",
                  collapsed && "justify-center px-0",
                  active ? "bg-blue-600 text-white font-medium" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100")}>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          }

          const groupOpen = openGroups.has(item.id);
          const groupActive = isGroupActive(item);
          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (collapsed) { setCollapsedPersist(false); setOpenGroups((p) => { const n = new Set(p); n.add(item.id); return n; }); }
                  else toggleGroup(item.id);
                }}
                title={collapsed ? item.label : undefined}
                data-testid={`nav-group-${item.id}`}
                className={cn("w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors",
                  collapsed && "justify-center px-0",
                  groupActive ? "text-blue-400 font-medium" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100")}>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (<><span className="flex-1 truncate text-left">{item.label}</span>
                  {groupOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</>)}
              </button>
              {!collapsed && groupOpen && item.children && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                  {item.children.map((child) => (
                    <button key={child.path} onClick={() => navigate(child.path)}
                      data-testid={`nav-${child.path.replace(/\//g, "-")}`}
                      className={cn("w-full text-left rounded-md px-2 py-1.5 text-[12px] transition-colors truncate",
                        isActive(child.path) ? "bg-blue-600/30 text-blue-300 font-medium" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100")}>
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Settings section */}
        {showSettings && (
          <>
            <div className="my-2 border-t border-slate-700" />
            {!collapsed && (
              <p className="px-2 pb-1 text-[10px] font-bold tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
                <Settings className="h-3 w-3" /> Settings
              </p>
            )}
            {settingsLinks.map((link) => {
              const active = isActive(link.path);
              return (
                <button key={link.path} onClick={() => navigate(link.path)} title={collapsed ? link.label : undefined}
                  data-testid={`nav-${link.path.replace(/\//g, "-")}`}
                  className={cn("w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors",
                    collapsed && "justify-center px-0",
                    active ? "bg-amber-600/30 text-amber-300 font-medium" : "text-amber-500/70 hover:bg-slate-800 hover:text-amber-300")}>
                  <link.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{link.label}</span>}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 shrink-0">
        {!collapsed && (
          <div className="px-3 pt-2">
            <button onClick={toggleOfflineMode} data-testid="btn-offline-toggle"
              className={cn("w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors",
                isOfflineMode ? "bg-orange-500/20 text-orange-400" : "text-slate-500 hover:bg-slate-800 hover:text-slate-300")}>
              {isOfflineMode ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              Offline: {isOfflineMode ? "ON" : "OFF"}
            </button>
          </div>
        )}
        <div className={cn("px-3 pb-2", collapsed && "flex justify-center px-2")}>
          <button onClick={handleLogout} data-testid="btn-sidebar-logout"
            className={cn("w-full flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors",
              collapsed && "w-auto px-2 py-2")}>
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
        <div className="p-2 hidden md:block">
          <button onClick={() => setCollapsedPersist(!collapsed)} data-testid="btn-sidebar-toggle"
            className={cn("w-full flex items-center rounded-md px-2 py-1.5 text-[12px] text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors",
              collapsed ? "justify-center" : "justify-between")}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : (<><span>Collapse</span><ChevronLeft className="h-4 w-4" /></>)}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex h-screen bg-white overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobileOpen(false)} />}

      <aside className={cn("hidden md:flex flex-col bg-slate-900 text-slate-100 transition-all duration-200 shrink-0 border-r border-slate-800",
        collapsed ? "w-[60px]" : "w-[220px]")}>
        <SidebarContent />
      </aside>

      <aside
        className={cn("fixed left-0 h-full w-[240px] bg-slate-900 text-slate-100 z-40 flex flex-col transition-transform duration-200 border-r border-slate-800 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full")}
        style={{ top: "env(safe-area-inset-top)" }}
      >
        <SidebarContent />
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-3 md:px-4 h-14 bg-white border-b shrink-0 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="md:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 mr-2" data-testid="btn-mobile-menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-semibold text-slate-700 tracking-wide uppercase truncate">Sales | Midatlantic Distribution</h1>
          {isOfflineMode && (
            <span className="hidden sm:inline ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-600 uppercase tracking-wide whitespace-nowrap">Offline</span>
          )}
          <div className="flex items-center gap-1 ml-auto" />
        </header>

        {isOfflineMode && (
          <div className="bg-orange-500 text-white text-[11px] font-bold text-center py-1 uppercase tracking-widest shrink-0">
            Offline Mode — Orders will be queued for sync
          </div>
        )}

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
