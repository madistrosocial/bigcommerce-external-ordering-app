import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";

import Login from "@/pages/Login";
import AdminDashboard from "@/pages/admin/Dashboard";
import Catalog from "@/pages/agent/Catalog";
import Cart from "@/pages/agent/Cart";
import Orders from "@/pages/agent/Orders";
import NotFound from "@/pages/not-found";

/**
 * Renders the component only if the current user is authenticated and has
 * the required role. Otherwise redirects immediately to "/" with no flash.
 *
 * Because useStore() reads from localStorage synchronously on init,
 * currentUser is available on the very first render — no loading state needed.
 */
function ProtectedRoute({
  component: Component,
  role,
}: {
  component: React.ComponentType;
  role: "admin" | "agent";
}) {
  const { currentUser } = useStore();

  if (!currentUser || !currentUser.is_enabled || currentUser.role !== role) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />

      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>

      <Route path="/catalog">
        {() => <ProtectedRoute component={Catalog} role="agent" />}
      </Route>

      <Route path="/cart">
        {() => <ProtectedRoute component={Cart} role="agent" />}
      </Route>

      <Route path="/orders">
        {() => <ProtectedRoute component={Orders} role="agent" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
