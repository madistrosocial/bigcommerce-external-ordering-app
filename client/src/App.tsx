import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { SaaSLayout } from "@/components/layout/SaaSLayout";
import { TimezoneProvider } from "@/contexts/TimezoneContext";

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
import InventoryAuditPage from "@/pages/agent/InventoryAudit";
import AdminSkuvaultPage from "@/pages/admin/AdminSkuvault";
import PriceTiersPage from "@/pages/admin/PriceTiers";
import MyOrders from "@/pages/agent/MyOrders";
import DraftOrders from "@/pages/agent/DraftOrders";
import AllOrders from "@/pages/agent/AllOrders";
import OrdersList from "@/pages/orders/OrdersList";
import OrderDetail from "@/pages/orders/OrderDetail";
import BcOrderDetail from "@/pages/orders/BcOrderDetail";
import CreateCustomer from "@/pages/agent/CreateCustomer";
import SubmitDocs from "@/pages/agent/SubmitDocs";
import SignupList from "@/pages/agent/SignupList";
import BCOrders from "@/pages/agent/BCOrders";
import AdminGroups from "@/pages/admin/AdminGroups";
import BCProductLink from "@/pages/tools/BCProductLink";
import BCProductLinkLogs from "@/pages/tools/BCProductLinkLogs";
import PromoSkuTracker from "@/pages/tools/PromoSkuTracker";
import InvoicePrintPage from "@/pages/InvoicePrintPage";
import ShipStationExportPage from "@/pages/admin/ShipStationExport";
import CRMSettings from "@/pages/admin/CRMSettings";
import EmailTemplates from "@/pages/admin/EmailTemplates";
import CRMCustomers from "@/pages/crm/Customers";
import CustomerProfile from "@/pages/crm/CustomerProfile";
import CRMReactivation from "@/pages/crm/Reactivation";
import CRMNotes from "@/pages/crm/CRMNotes";
import CRMToDo from "@/pages/crm/ToDo";
import StoreCreditLedger from "@/pages/crm/StoreCreditLedger";
import PriceOverrideAuditPage from "@/pages/admin/reports/PriceOverrideAudit";
import StoreCreditUsageReportPage from "@/pages/admin/reports/StoreCreditUsageReport";
import SalesReportPage from "@/pages/admin/reports/SalesReport";
import { MarketingDashboard, MarketingCampaigns, MarketingCampaignRoute, MarketingAudiences, MarketingSettings } from "@/pages/marketing/Marketing";
import { MarketingAnalytics, MarketingTemplates, MarketingAutomations } from "@/pages/marketing/MarketingPhase2";
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
  if (!currentUser || !currentUser.is_enabled || !currentUser.auth_token) return <Redirect to="/" />;
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
  if (!currentUser || !currentUser.is_enabled || !currentUser.auth_token) return <Redirect to="/" />;
  if (currentUser.role !== "admin") return <Redirect to="/dashboard" />;
  if (isLoading) return null;
  if (!hasPermission("admin", "view")) return <Redirect to="/dashboard" />;
  return <Component />;
}

function PermissionRoute({
  component: Component,
  module,
  action = "view",
}: {
  component: React.ComponentType;
  module: string;
  action?: string;
}) {
  const { currentUser } = useStore();
  const { hasPermission, isLoading } = usePermissions();
  if (!currentUser || !currentUser.is_enabled) return <Redirect to="/" />;
  if (isLoading) return null;
  if (!hasPermission(module, action)) return <Redirect to="/dashboard" />;
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
      <Route path="/inventory/audit">
        {() => <ProtectedRoute component={InventoryAuditPage} />}
      </Route>
      <Route path="/inventory/logs">
        {() => <Redirect to="/inventory-push-logs" />}
      </Route>

      {/* ── Marketing routes ── */}
      <Route path="/marketing">
        {() => <PermissionRoute component={MarketingDashboard} module="marketing" />}
      </Route>
      <Route path="/marketing/settings">
        {() => <PermissionRoute component={MarketingSettings} module="marketing" action="send" />}
      </Route>
      <Route path="/marketing/campaigns">
        {() => <PermissionRoute component={MarketingCampaigns} module="marketing" />}
      </Route>
      <Route path="/marketing/campaigns/new">
        {() => <PermissionRoute component={MarketingCampaignRoute} module="marketing" action="create" />}
      </Route>
      <Route path="/marketing/campaigns/:id/edit">
        {() => <PermissionRoute component={MarketingCampaignRoute} module="marketing" action="edit" />}
      </Route>
      <Route path="/marketing/campaigns/:id">
        {() => <PermissionRoute component={MarketingCampaignRoute} module="marketing" />}
      </Route>
      <Route path="/marketing/audiences">
        {() => <PermissionRoute component={MarketingAudiences} module="marketing" action="manage_audiences" />}
      </Route>
      <Route path="/marketing/templates">
        {() => <PermissionRoute component={MarketingTemplates} module="marketing" action="manage_templates" />}
      </Route>
      <Route path="/marketing/automations">
        {() => <PermissionRoute component={MarketingAutomations} module="marketing" action="manage_automations" />}
      </Route>
      <Route path="/marketing/analytics">
        {() => <PermissionRoute component={MarketingAnalytics} module="marketing" action="view_analytics" />}
      </Route>

      {/* ── BC Orders ── */}
      <Route path="/orders/bc">
        {() => <ProtectedRoute component={BCOrders} />}
      </Route>
      <Route path="/orders/list">
        {() => <ProtectedRoute component={OrdersList} />}
      </Route>
      <Route path="/orders/bc/:id">
        {() => <ProtectedRoute component={BcOrderDetail} />}
      </Route>
      <Route path="/orders/:id">
        {() => <ProtectedRoute component={OrderDetail} />}
      </Route>

      {/* ── Customer routes ── */}
      <Route path="/customers/create">
        {() => <ProtectedRoute component={CreateCustomer} />}
      </Route>
      <Route path="/customers/submit-docs">
        {() => <PermissionRoute component={SubmitDocs} module="customers_submit_docs" />}
      </Route>
      <Route path="/customers/signup-list">
        {() => <PermissionRoute component={SignupList} module="customer_signups" />}
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
      <Route path="/admin/skuvault">
        {() => <ProtectedRoute component={AdminSkuvaultPage} role="admin" />}
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

      {/* ── CRM routes ── */}
      <Route path="/crm/customers">
        {() => <ProtectedRoute component={CRMCustomers} />}
      </Route>
      <Route path="/crm/customers/:id">
        {() => <ProtectedRoute component={CustomerProfile} />}
      </Route>
      <Route path="/crm/reactivation">
        {() => <ProtectedRoute component={CRMReactivation} />}
      </Route>
      <Route path="/crm/notes">
        {() => <ProtectedRoute component={CRMNotes} />}
      </Route>
      <Route path="/crm/todos">
        {() => <ProtectedRoute component={CRMToDo} />}
      </Route>
      <Route path="/crm/store-credit">
        {() => <ProtectedRoute component={StoreCreditLedger} />}
      </Route>
      <Route path="/admin/crm">
        {() => <ProtectedRoute component={CRMSettings} role="admin" />}
      </Route>
      <Route path="/admin/email-templates">
        {() => <ProtectedRoute component={EmailTemplates} role="admin" />}
      </Route>

      {/* ── Reporting routes ── */}
      <Route path="/reports/sales">
        {() => <ProtectedRoute component={SalesReportPage} />}
      </Route>
      <Route path="/reports/price-override-audit">
        {() => <ProtectedRoute component={PriceOverrideAuditPage} />}
      </Route>
      <Route path="/reports/store-credit-usage">
        {() => { window.location.replace("/crm/store-credit"); return null; }}
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
      <TimezoneProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </TimezoneProvider>
    </QueryClientProvider>
  );
}

export default App;
