import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Login from "@/pages/Login";
import AdminDashboard from "@/pages/admin/Dashboard";
import Catalog from "@/pages/agent/Catalog";
import Cart from "@/pages/agent/Cart";
import Orders from "@/pages/agent/Orders";
import NotFound from "@/pages/not-found";

import ProtectedRoute from "@/components/auth/ProtectedRoute";

import { useStore } from "@/lib/store";


function ProtectedRoute({
  component: Component,
  role,
}: {
  component: React.ComponentType;
  role?: "admin" | "agent";
}) {
  const { currentUser } = useStore();

  // Not logged in → go to Login ("/")
  if (!currentUser) {
    return <Redirect to="/" />;
  }

  // Logged in but wrong role
  if (role && currentUser.role !== role) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />

      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} role="admin" />
      </Route>

      <Route path="/catalog">
        <ProtectedRoute component={Catalog} role="agent" />
      </Route>

      <Route path="/cart">
        <ProtectedRoute component={Cart} role="agent" />
      </Route>

      <Route path="/orders">
        <ProtectedRoute component={Orders} role="agent" />
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
