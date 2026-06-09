import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { SaaSLayout } from "@/components/layout/SaaSLayout";

import Login from "@/pages/Login";
import DashboardPage from "@/pages/Dashboard";
import AdminDashboard from "@/pages/admin/Dashboard";
import RBACPage from "@/pages/admin/RBAC";
import AdminUsersPage from "@/pages/admin/AdminUsers";
import AdminIntegrationPage from "@/pages/admin/AdminIntegration";
import InvoiceSettingsPage from "@/pages/admin/InvoiceSettings";
import Catalog from "@/pages/agent/Catalog";
import Cart from "@/pages/agent/Cart";
import POSPage from "@/pages/agent/POS";
import InventoryPushLogs from "@/pages/agent/InventoryPushLogs";
import InventoryPushPage from "@/pages/agent/InventoryPush";
import PriceTiersPage from "@/pages/admin/PriceTiers";
import MyOrders from "@/pages/agent/MyOrders";
import DraftOrders from "@/pages/agent/DraftOrders";
import AllOrders from "@/pages/agent/AllOrders";
import CreateCustomer from "@/pages/agent/CreateCustomer";
import AllCustomers from "@/pages/agent/AllCustomers";
import BCOrders from "@/pages/agent/BCOrders";
import AdminGroups from "@/pages/admin/AdminGroups";
import BCProductLink from "@/pages/tools/BCProductLink";
import BCProductLinkLogs from "@/pages/tools/BCProductLinkLogs";
import PromoSkuTracker from "@/pages/tools/PromoSkuTracker";
import InvoicePrintPage from "@/pages/InvoicePrintPage";
import ShipStationExportPage from "@/pages/admin/ShipStationExport";
import NotFound from "@/pages/not-found";

// ─── Route guards ─────────────────────────────────────────────────────────────

function ProtectedRoute({
  component: Component,
  role,
}: {
  component: React.ComponentType;
  role?: "admin" | "agent";
}) {
  const { currentUser } = useStore();
  if (!currentUser || !currentUser.is_enabled) return <Redirect to="/" />;
  if (role && currentUser.role !== role && currentUser.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }
  return <Component />;
}

function AdminRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { currentUser } = useStore();
  const { hasPermission, isLoading } = usePermissions();
  if (!currentUser || !currentUser.is_enabled) return <Redirect to="/" />;
  if (currentUser.role !== "admin") return <Redirect to="/dashboard" />;
  if (isLoading) return null;
  if (!hasPermission("admin", "view")) return <Redirect to="/dashboard" />;
  return <Component />;
}

// ─── Router ───────────────────────────────────────────────────────────────────

function Router() {
  const [location] = useLocation();

  // All routes (shared between layout and no-layout modes)
  const routes = (
    <Switch>
      {/* ── Standalone invoice page (no layout) ── */}
      <Route path="/invoice/:orderId" component={InvoicePrintPage} />

      {/* Public */}
      <Route path="/" component={Login} />

      {/* Dashboard — any authenticated user */}
      <Route path="/dashboard">
        {() => <ProtectedRoute component={DashboardPage} />}
      </Route>

      {/* ── Agent routes ── */}
      <Route path="/catalog">
        {() => <ProtectedRoute component={Catalog} role="agent" />}
      </Route>
      <Route path="/cart">
        {() => <ProtectedRoute component={Cart} role="agent" />}
      </Route>
      <Route path="/orders">
        {() => <ProtectedRoute component={MyOrders} role="agent" />}
      </Route>
      <Route path="/orders/drafts">
        {() => <ProtectedRoute component={DraftOrders} role="agent" />}
      </Route>
      <Route path="/orders/all">
        {() => <ProtectedRoute component={AllOrders} />}
      </Route>
      <Route path="/pos">
        {() => <ProtectedRoute component={POSPage} role="agent" />}
      </Route>
      <Route path="/inventory-push-logs">
        {() => <ProtectedRoute component={InventoryPushLogs} role="agent" />}
      </Route>
      <Route path="/inventory/push">
        {() => <ProtectedRoute component={InventoryPushPage} />}
      </Route>
      <Route path="/inventory/logs">
        {() => <Redirect to="/inventory-push-logs" />}
      </Route>

      {/* ── BC Orders ── */}
      <Route path="/orders/bc">
        {() => <ProtectedRoute component={BCOrders} />}
      </Route>

      {/* ── Customer routes ── */}
      <Route path="/customers/create">
        {() => <ProtectedRoute component={CreateCustomer} />}
      </Route>
      <Route path="/customers/all">
        {() => <ProtectedRoute component={AllCustomers} />}
      </Route>

      {/* ── Admin routes ── */}
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>
      <Route path="/admin/catalog">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsersPage} role="admin" />}
      </Route>
      <Route path="/admin/groups">
        {() => <ProtectedRoute component={AdminGroups} role="admin" />}
      </Route>
      <Route path="/admin/integration">
        {() => <ProtectedRoute component={AdminIntegrationPage} role="admin" />}
      </Route>
      <Route path="/admin/invoice">
        {() => <ProtectedRoute component={InvoiceSettingsPage} role="admin" />}
      </Route>
      <Route path="/admin/price-tiers">
        {() => <ProtectedRoute component={PriceTiersPage} role="admin" />}
      </Route>
      <Route path="/admin/shipstation">
        {() => <ProtectedRoute component={ShipStationExportPage} role="admin" />}
      </Route>
      <Route path="/admin/rbac">
        {() => <AdminRoute component={RBACPage} />}
      </Route>
      <Route path="/orders/admin">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>

      {/* ── Tools routes ── */}
      <Route path="/tools/bc-product-link">
        {() => <ProtectedRoute component={BCProductLink} />}
      </Route>
      <Route path="/tools/bc-product-link-logs">
        {() => <ProtectedRoute component={BCProductLinkLogs} />}
      </Route>
      <Route path="/tools/promo-sku-tracker">
        {() => <ProtectedRoute component={PromoSkuTracker} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );

  // Invoice pages render without any layout wrapper
  if (location.startsWith("/invoice/")) {
    return routes;
  }

  return <SaaSLayout>{routes}</SaaSLayout>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  useEffect(() => {
    document.body.style.margin = "0";
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
