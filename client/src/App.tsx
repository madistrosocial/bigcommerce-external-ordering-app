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

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Login} />

      {/* Admin */}
      <Route path="/admin">
        <ProtectedRoute role="admin">
          <AdminDashboard />
        </ProtectedRoute>
      </Route>

      {/* Agent */}
      <Route path="/catalog">
        <ProtectedRoute role="agent">
          <Catalog />
        </ProtectedRoute>
      </Route>

      <Route path="/cart">
        <ProtectedRoute role="agent">
          <Cart />
        </ProtectedRoute>
      </Route>

      <Route path="/orders">
        <ProtectedRoute role="agent">
          <Orders />
        </ProtectedRoute>
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
