import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { seedDatabase } from "@/lib/mock-data";

import Login from "@/pages/Login";
import AdminDashboard from "@/pages/admin/Dashboard";
import Catalog from "@/pages/agent/Catalog";
import Cart from "@/pages/agent/Cart";
import Orders from "@/pages/agent/Orders";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/catalog" component={Catalog} />
      <Route path="/cart" component={Cart} />
      <Route path="/orders" component={Orders} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    seedDatabase();
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
