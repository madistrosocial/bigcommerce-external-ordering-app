import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getKoleConnection, getUsersSummary, searchGlobal, type GlobalSearchResult } from "@/lib/api";
import { toPublicVendorName } from "@/lib/vendor-display";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Monitor, ShoppingBag, Package, BookOpen,
  ShoppingCart, Settings, ChevronLeft, ChevronRight, ChevronDown,
  ChevronUp, LogOut, Truck, Wifi, WifiOff, Menu, X,
  User, Users, Layers, Pin, Plug, UsersRound, Wrench, Receipt, Ship, ContactRound, FileBarChart, Mail, Megaphone, KeyRound, Link2, Clock3, PackageOpen, Search, Loader2, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  const userInitials = (currentUser?.name || currentUser?.username || "U")
    .split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const { hasPermission } = usePermissions();
  const { data: dropshipConnection } = useQuery({
    queryKey: ["dropship-connection"],
    queryFn: getKoleConnection,
    enabled: hasPermission("dropshipping_vendor"),
  });
  const dropshipDisplayName = toPublicVendorName(dropshipConnection?.displayName);
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
  const searchRef = useRef<HTMLDivElement>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);

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

  useEffect(() => {
    const query = globalSearchQuery.trim();
    if (query.length < 2) {
      setGlobalSearchResults(null);
      setGlobalSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setGlobalSearchLoading(true);
      try {
        const results = await searchGlobal(query, controller.signal);
        setGlobalSearchResults(results);
        setGlobalSearchOpen(true);
      } catch (error: any) {
        if (error?.name !== "AbortError") setGlobalSearchResults({ customers: [], orders: [] });
      } finally {
        if (!controller.signal.aborted) setGlobalSearchLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [globalSearchQuery]);

  useEffect(() => {
    const handleOutsideSearchClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setGlobalSearchOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideSearchClick);
    return () => document.removeEventListener("mousedown", handleOutsideSearchClick);
  }, []);

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
  const navigate = (path: string) => {
    setLocation(path);
    setMobileOpen(false);
    if (!path.startsWith("/admin/")) {
      setOpenGroups((prev) => {
        if (!prev.has("settings")) return prev;
        const next = new Set(prev);
        next.delete("settings");
        return next;
      });
    }
  };
  const openSearchResult = (path: string) => {
    setGlobalSearchQuery("");
    setGlobalSearchResults(null);
    setGlobalSearchOpen(false);
    navigate(path);
  };

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
  const canViewAllAttendance = hasPermission("attendance", "view_all");

  // ── Build nav items based on permissions ────────────────────────────────────

  // Orders children (all permission-gated)
  const ordersChildren: NavLeaf[] = [
    ...(hasPermission("orders_drafts") ? [{ label: "Drafts", path: "/orders/drafts" }] : []),
    ...(hasPermission("orders_bulk") ? [{ label: "Bulk Order", path: "/orders/bulk" }] : []),
    ...(hasPermission("orders_all") ? [{ label: "Sales History", path: "/orders/list" }] : []),
  ];

  // Inventory children
  const inventoryChildren: NavLeaf[] = [
    ...(hasPermission("inventory_push") ? [{ label: "Push Inventory", path: "/inventory/push" }] : []),
    ...(hasPermission("inventory_remove") ? [{ label: "Remove Inventory", path: "/inventory/remove" }] : []),
    ...(hasPermission("inventory_audit") ? [{ label: "Inventory Audit", path: "/inventory/audit" }] : []),
    ...(hasPermission("inventory_logs") ? [{ label: "Logs", path: "/inventory/logs" }] : []),
  ];

  const marketingChildren: NavLeaf[] = [
    ...(hasPermission("marketing") ? [{ label: "Overview", path: "/marketing" }] : []),
    ...(hasPermission("marketing", "view_campaigns") ? [{ label: "Campaigns", path: "/marketing/campaigns" }] : []),
    ...(hasPermission("marketing", "view_order_form") ? [{ label: "Order Form", path: "/marketing/order-form" }] : []),
    ...(hasPermission("marketing", "view_product_lists") ? [{ label: "Product Lists", path: "/marketing/product-lists" }] : []),
    ...(hasPermission("marketing", "view_audiences") ? [{ label: "Audiences", path: "/marketing/audiences" }] : []),
    ...(hasPermission("marketing", "view_audience_readiness") ? [{ label: "Audience Readiness", path: "/marketing/audience-readiness" }] : []),
    ...(hasPermission("marketing", "view_templates") ? [{ label: "Templates", path: "/marketing/templates" }] : []),
    ...(hasPermission("marketing", "view_automations") ? [{ label: "Automations", path: "/marketing/automations" }] : []),
    ...(hasPermission("marketing", "view_log") ? [{ label: "Log", path: "/marketing/log" }] : []),
    ...(hasPermission("marketing", "view_analytics") ? [{ label: "Analytics", path: "/marketing/analytics" }] : []),
    ...(hasPermission("marketing", "view_settings") ? [{ label: "Settings", path: "/marketing/settings" }] : []),
  ];

  // Tools children — permission-gated
  const toolsChildren: NavLeaf[] = [
    ...(hasPermission("tools_image_editor") ? [{ label: "Image Editor", path: "/tools/image-editor" }] : []),
    ...(hasPermission("tools_bc_link") ? [{ label: "BC Product Link", path: "/tools/bc-product-link" }] : []),
    ...(hasPermission("tools_bc_link_logs") ? [{ label: "Product Link Logs", path: "/tools/bc-product-link-logs" }] : []),
    ...(hasPermission("promo_sku_tracker") ? [{ label: "Promo SKU Tracker", path: "/tools/promo-sku-tracker" }] : []),
  ];

  const dropshippingChildren: NavLeaf[] = [
    ...(hasPermission("dropshipping_dashboard") ? [{ label: "Dashboard", path: "/dropshipping/dashboard" }] : []),
    ...(hasPermission("dropshipping_vendor") ? [{ label: dropshipDisplayName, path: "/dropshipping/kole" }] : []),
    ...(hasPermission("dropshipping_catalog") ? [{ label: "Product Catalog", path: "/dropshipping/products" }] : []),
    ...(hasPermission("dropshipping_product_sync") ? [{ label: "Product Sync", path: "/dropshipping/product-sync" }] : []),
    ...(hasPermission("dropshipping_sync_logs") ? [{ label: "Sync Logs", path: "/dropshipping/sync-logs" }] : []),
  ];

  // Attendance children — employees see their own clock; managers see scoped admin views.
  const attendanceChildren: NavLeaf[] = [
    ...(hasPermission("attendance", "clock") ? [{ label: "My Attendance", path: "/attendance" }] : []),
    ...(canViewAllAttendance && hasPermission("attendance", "view_dashboard") ? [{ label: "Overview", path: "/attendance/overview" }] : []),
    ...(hasPermission("attendance", "view_logs") ? [{ label: "Attendance Logs", path: "/attendance/logs" }] : []),
    ...(canViewAllAttendance && hasPermission("attendance", "view_reports") ? [{ label: "Reports", path: "/attendance/reports" }] : []),
    ...(hasPermission("attendance", "view_home_locations") ? [{ label: "Home Locations", path: "/attendance/locations" }] : []),
    ...(hasPermission("attendance", "view") ? [{ label: "Payroll", path: "/attendance/payroll" }] : []),
    ...(hasPermission("payroll", "view") || hasPermission("payroll", "approve_overtime") ? [{ label: "Payroll Management", path: "/payroll" }] : []),
    ...(hasPermission("attendance", "view") ? [{ label: "Leave", path: "/attendance/leave" }] : []),
  ];

  // CRM children
  const crmChildren: NavLeaf[] = [
    ...(hasPermission("crm_customers") ? [{ label: "CRM", path: "/crm/customers" }] : []),
    ...(hasPermission("customers_create") ? [{ label: "Create BC Customer", path: "/customers/create" }] : []),
    ...(hasPermission("customers_submit_docs") ? [{ label: "Submit Docs", path: "/customers/submit-docs" }] : []),
    ...(hasPermission("crm_customers") ? [{ label: "To Do", path: "/crm/todos" }] : []),
    ...(hasPermission("crm_reactivation") ? [{ label: "Reactivation", path: "/crm/reactivation" }] : []),
    ...(hasPermission("crm_notes") ? [{ label: "Notes", path: "/crm/notes" }] : []),
    ...(hasPermission("crm_customers") ? [{ label: "Store Credit", path: "/crm/store-credit" }] : []),
    ...(hasPermission("customer_signups") ? [{ label: "Signup List", path: "/customers/signup-list" }] : []),
  ];

  // Reporting children
  const reportingChildren: NavLeaf[] = [
    ...(hasPermission("reporting_sales") ? [{ label: "Sales Report", path: "/reports/sales" }] : []),
    ...(hasPermission("reporting_exports") ? [{ label: "Exports", path: "/reports/exports" }] : []),
    ...(hasPermission("reporting_price_override_audit") ? [{ label: "Price Override Audit", path: "/reports/price-override-audit" }] : []),
  ];

  const product360Children: NavLeaf[] = hasPermission("product_360")
    ? [
        { label: "Overview", path: "/product-360" },
        { label: "Products", path: "/product-360/products" },
        { label: "Sales Performance", path: "/product-360/sales" },
        { label: "Profitability", path: "/product-360/profitability" },
        { label: "Inventory Intelligence", path: "/product-360/inventory" },
        { label: "Replenishment", path: "/product-360/replenishment" },
        { label: "Customers", path: "/product-360/customers" },
        { label: "Product History", path: "/product-360/history" },
      ]
    : [];

  // Build final nav list — only include items the user can access
  const navItems: NavGroup[] = [
    ...(hasPermission("dashboard") ? [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }] : []),
    ...(hasPermission("pos") ? [{ id: "pos", label: "POS", icon: Monitor, path: "/pos" }] : []),
    ...(crmChildren.length > 0 ? [{ id: "crm", label: "Customers", icon: ContactRound, children: crmChildren }] : []),
    ...(ordersChildren.length > 0 ? [{ id: "orders", label: "Orders", icon: ShoppingBag, children: ordersChildren }] : []),
    ...(inventoryChildren.length > 0 ? [{ id: "inventory", label: "Inventory", icon: Package, children: inventoryChildren }] : []),
    ...(marketingChildren.length > 0 ? [{ id: "marketing", label: "Marketing", icon: Megaphone, children: marketingChildren }] : []),
    ...(hasPermission("catalog") ? [{ id: "catalog", label: "Catalog", icon: BookOpen, path: "/catalog" }] : []),
    ...(product360Children.length > 0 ? [{ id: "product-360", label: "Product 360", icon: Layers, children: product360Children }] : []),
    ...(hasPermission("cart") ? [{ id: "cart", label: "Cart", icon: ShoppingCart, path: "/cart" }] : []),
    ...(dropshippingChildren.length > 0 ? [{ id: "dropshipping", label: "Dropshipping", icon: PackageOpen, children: dropshippingChildren }] : []),
    ...(toolsChildren.length > 0 ? [{ id: "tools", label: "Tools", icon: Wrench, children: toolsChildren }] : []),
    ...(attendanceChildren.length > 0 ? [{ id: "attendance", label: "Attendance", icon: Clock3, children: attendanceChildren }] : []),
    ...(reportingChildren.length > 0 ? [{ id: "reporting", label: "Reporting", icon: FileBarChart, children: reportingChildren }] : []),
  ];

  // Settings section: system admins always; agents with admin:view permission
  const showSettings = hasPermission("admin");

  // Settings links — User Groups only visible to system admins (manage users/groups)
  const settingsLinks = [
    { label: "Catalog Management", path: "/admin/catalog", icon: Pin },
    { label: "User Management", path: "/admin/users", icon: Users },
    ...(role === "admin" ? [{ label: "User Groups", path: "/admin/groups", icon: UsersRound }] : []),
    { label: "BC Integration", path: "/admin/integration", icon: Plug },
    { label: "SKUVault", path: "/admin/skuvault", icon: Plug },
    { label: "Zoho", path: "/admin/zoho", icon: KeyRound },
    ...(role === "admin" ? [{ label: "Constant Contact", path: "/admin/constant-contact", icon: Mail }] : []),
    ...(role === "admin" ? [{ label: "Zoho Account Mapping", path: "/admin/zoho/account-mapping", icon: Link2 }] : []),
    { label: "Attendance Settings", path: "/admin/attendance", icon: Clock3 },
    { label: "Price Tiers", path: "/admin/price-tiers", icon: Layers },
    { label: "Invoice Settings", path: "/admin/invoice", icon: Receipt },
    { label: "ShipStation Export", path: "/admin/shipstation", icon: Ship },
    { label: "CRM Settings", path: "/admin/crm", icon: ContactRound },
    { label: "Email Templates", path: "/admin/email-templates", icon: Mail },
    ...(role === "admin" ? [{ label: "System Activity", path: "/syslog", icon: Activity }] : []),
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
        <div className="px-4 py-3 border-b border-slate-800 text-center md:hidden">
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
            <div>
              <button
                onClick={() => {
                  if (collapsed) { setCollapsedPersist(false); setOpenGroups((p) => { const n = new Set(p); n.add("settings"); return n; }); }
                  else toggleGroup("settings");
                }}
                title={collapsed ? "Settings" : undefined}
                data-testid="nav-group-settings"
                className={cn("w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors",
                  collapsed && "justify-center px-0",
                  settingsLinks.some((link) => isActive(link.path)) ? "text-blue-400 font-medium" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100")}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-left">Settings</span>
                    {openGroups.has("settings") ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </>
                )}
              </button>
              {!collapsed && openGroups.has("settings") && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                  {settingsLinks.map((link) => (
                    <button key={link.path} onClick={() => navigate(link.path)}
                      data-testid={`nav-${link.path.replace(/\//g, "-")}`}
                      className={cn("w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors truncate",
                        isActive(link.path) ? "bg-amber-600/30 text-amber-300 font-medium" : "text-amber-500/70 hover:bg-slate-800 hover:text-amber-300")}
                    >
                      <link.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{link.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
      className="flex bg-white overflow-hidden"
      style={{
        height: "100%",
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
        style={{
          top: "env(safe-area-inset-top)",
          bottom: 0,
          height: "auto",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <SidebarContent />
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header
          className="flex items-center justify-between px-3 md:px-4 h-14 bg-white border-b shrink-0 shadow-sm"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            height: "calc(3.5rem + env(safe-area-inset-top))",
          }}
        >
          <button onClick={() => setMobileOpen(true)} className="md:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 mr-2" data-testid="btn-mobile-menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="hidden sm:block min-w-0 shrink text-sm font-semibold text-slate-700 tracking-wide uppercase truncate">Sales | Midatlantic Distribution</h1>
          {isOfflineMode && (
            <span className="hidden sm:inline ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-600 uppercase tracking-wide whitespace-nowrap">Offline</span>
          )}
          <div ref={searchRef} className="relative min-w-0 flex-1 max-w-md ml-auto mr-2 sm:mr-4">
            <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-slate-400 transition-colors focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
              {globalSearchLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Search className="h-4 w-4 shrink-0" />}
              <input
                value={globalSearchQuery}
                onChange={(event) => {
                  setGlobalSearchQuery(event.target.value);
                  setGlobalSearchOpen(true);
                }}
                onFocus={() => { if (globalSearchQuery.trim().length >= 2) setGlobalSearchOpen(true); }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setGlobalSearchOpen(false);
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                  if (event.key === "Enter" && globalSearchResults?.customers[0]) {
                    openSearchResult(`/crm/customers/${globalSearchResults.customers[0].id}`);
                  } else if (event.key === "Enter" && globalSearchResults?.orders[0]) {
                    openSearchResult(`/orders/bc/${globalSearchResults.orders[0].bigcommerce_order_id}`);
                  }
                }}
                placeholder="Search customers or order IDs"
                aria-label="Search customers or BigCommerce order IDs"
                data-testid="input-global-search"
                className="min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
            {globalSearchOpen && globalSearchQuery.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(26rem,calc(100vh-5rem))] overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">
                {globalSearchLoading && (
                  <div className="px-3 py-4 text-center text-xs text-slate-500">Searching…</div>
                )}
                {!globalSearchLoading && globalSearchResults && globalSearchResults.customers.length === 0 && globalSearchResults.orders.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-slate-500">No customers or orders found.</div>
                )}
                {!globalSearchLoading && globalSearchResults && globalSearchResults.customers.length > 0 && (
                  <div>
                    <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Customers</p>
                    {globalSearchResults.customers.map((customer) => (
                      <button
                        key={`customer-${customer.id}`}
                        onClick={() => openSearchResult(`/crm/customers/${customer.id}`)}
                        className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-blue-50"
                        data-testid={`global-search-customer-${customer.id}`}
                      >
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-slate-700">{customer.name}</span>
                          <span className="block truncate text-[11px] text-slate-500">{customer.email}</span>
                          {customer.address && <span className="block truncate text-[11px] text-slate-400">{customer.address}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!globalSearchLoading && globalSearchResults && globalSearchResults.orders.length > 0 && (
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Orders</p>
                    {globalSearchResults.orders.map((order) => (
                      <button
                        key={`order-${order.bigcommerce_order_id}`}
                        onClick={() => openSearchResult(`/orders/bc/${order.bigcommerce_order_id}`)}
                        className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-blue-50"
                        data-testid={`global-search-order-${order.bigcommerce_order_id}`}
                      >
                        <ShoppingBag className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-700">Order #{order.bigcommerce_order_id}</span>
                          <span className="block truncate text-[11px] text-slate-500">{order.customer_name}{order.status ? ` · ${order.status}` : ""}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 rounded-full bg-slate-100 p-0 text-slate-600 hover:bg-blue-100 hover:text-blue-700"
                  aria-label={`Open user menu for ${currentUser.name}`}
                  data-testid="btn-user-menu"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={currentUser.avatar_data || undefined} alt="" />
                    <AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-700">{userInitials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 shadow-lg">
                <DropdownMenuLabel className="py-3 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Avatar className="h-20 w-20 border-2 border-slate-100 shadow-sm">
                      <AvatarImage src={currentUser.avatar_data || undefined} alt={`${currentUser.name} profile photo`} />
                      <AvatarFallback className="bg-blue-100 text-xl font-semibold text-blue-700">{userInitials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">{currentUser.name}</span>
                    <span className="text-xs font-normal text-slate-400 capitalize">
                      {myGroupName ?? currentUser.role}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={toggleOfflineMode} data-testid="menu-toggle-offline">
                  {isOfflineMode ? <WifiOff className="mr-2 h-4 w-4" /> : <Wifi className="mr-2 h-4 w-4" />}
                  Offline Mode: {isOfflineMode ? "ON" : "OFF"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-account-settings">
                   <Settings className="mr-2 h-4 w-4" />
                   User settings
                 </DropdownMenuItem>
                 <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="menu-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
