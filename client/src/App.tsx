import { Switch, Route, Redirect } from "wouter";
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
import Catalog from "@/pages/agent/Catalog";
import Cart from "@/pages/agent/Cart";
import Orders from "@/pages/agent/Orders";
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
  return (
    <Switch>
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
      {/* Inventory sub-pages */}
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
      {/* /admin/catalog → main admin console */}
      <Route path="/admin/catalog">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>
      {/* /admin/users → user module-toggle management */}
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsersPage} role="admin" />}
      </Route>
      {/* /admin/groups → user group management */}
      <Route path="/admin/groups">
        {() => <ProtectedRoute component={AdminGroups} role="admin" />}
      </Route>
      {/* /admin/integration → BigCommerce settings page */}
      <Route path="/admin/integration">
        {() => <ProtectedRoute component={AdminIntegrationPage} role="admin" />}
      </Route>
      {/* /admin/price-tiers → Price tier configuration */}
      <Route path="/admin/price-tiers">
        {() => <ProtectedRoute component={PriceTiersPage} role="admin" />}
      </Route>
      {/* Legacy RBAC tab */}
      <Route path="/admin/rbac">
        {() => <AdminRoute component={RBACPage} />}
      </Route>
      {/* Admin orders view */}
      <Route path="/orders/admin">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>

      {/* ── Tools routes ── */}
      <Route path="/tools/bc-product-link">
        {() => <ProtectedRoute component={BCProductLink} role="admin" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  useEffect(() => {
    document.body.style.margin = "0";
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SaaSLayout>
          <Router />
        </SaaSLayout>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
