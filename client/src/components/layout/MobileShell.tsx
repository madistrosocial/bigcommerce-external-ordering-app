import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Menu, 
  ShoppingCart, 
  Package, 
  Users, 
  LogOut, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  User,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";

interface MobileShellProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
}

export function MobileShell({ children, title = "VanSales Pro", showBack = false }: MobileShellProps) {
  const { currentUser, isOfflineMode, setOfflineMode, toggleOfflineMode, logout, cart } = useStore();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(false);
      toast({ title: "Back Online", description: "You can now sync orders to BigCommerce." });
    };
    const handleOffline = () => {
      setOfflineMode(true);
      toast({ title: "Offline Mode", description: "Orders will be saved as drafts.", variant: "destructive" });
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOfflineMode, toast]);

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ['orders', 'pending'],
    queryFn: api.getPendingSyncOrders,
    refetchInterval: isOfflineMode ? false : 30000, // Refetch every 30s when online
    enabled: !!currentUser && currentUser.role === 'agent'
  });

  const syncOrderMutation = useMutation({
    mutationFn: (orderId: number) => api.syncOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  const handleSync = async () => {
    if (isOfflineMode) {
      toast({
        title: "Cannot Sync",
        description: "You are currently in offline mode.",
        variant: "destructive",
      });
      return;
    }

    if (pendingOrders.length === 0) {
      toast({
        title: "Up to date",
        description: "No pending orders to sync.",
      });
      return;
    }

    // Sync all pending orders
    try {
      const results = await Promise.allSettled(pendingOrders.map(order => 
        syncOrderMutation.mutateAsync(order.id!)
      ));
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');
      
      if (failed.length === 0) {
        toast({
          title: "Sync Complete",
          description: `Successfully synced ${succeeded} order(s) to BigCommerce.`,
        });
      } else {
        const errorDetails = failed.map((f: any) => f.reason?.message || 'Unknown error').join(', ');
        toast({
          title: `Sync Partially Failed`,
          description: `Synced ${succeeded} order(s). Failed: ${failed.length}. Error: ${errorDetails}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Could not sync orders.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  if (!currentUser) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      <header className="sticky top-0 z-40 w-full border-b bg-white dark:bg-slate-950 px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-menu">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col h-full py-6">
                <div className="mb-8 px-2">
                  <h2 className="text-2xl font-bold font-heading text-slate-900 dark:text-white uppercase tracking-wider">
                    VanSales<span className="text-primary">Pro</span>
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Logged in as {currentUser.name}
                  </p>
                </div>

                <nav className="flex-1 space-y-2">
                  {currentUser.role === 'admin' ? (
                    <>
                      <Button 
                        variant={location === '/admin' ? 'secondary' : 'ghost'} 
                        className="w-full justify-start"
                        onClick={() => setLocation('/admin')}
                        data-testid="nav-admin"
                      >
                        <Package className="mr-2 h-5 w-5" />
                        Products & Inventory
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start"
                        data-testid="nav-users"
                      >
                        <Users className="mr-2 h-5 w-5" />
                        User Management
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button 
                        variant={location === '/catalog' ? 'secondary' : 'ghost'} 
                        className="w-full justify-start"
                        onClick={() => setLocation('/catalog')}
                        data-testid="nav-catalog"
                      >
                        <Package className="mr-2 h-5 w-5" />
                        Product Catalog
                      </Button>
                      <Button 
                        variant={location === '/orders' ? 'secondary' : 'ghost'} 
                        className="w-full justify-start"
                        onClick={() => setLocation('/orders')}
                        data-testid="nav-orders"
                      >
                        <ShoppingCart className="mr-2 h-5 w-5" />
                        Order History
                      </Button>
                    </>
                  )}
                </nav>

                <div className="mt-auto pt-6 border-t space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-sm font-medium">Offline Mode</span>
                    <Button 
                      variant={isOfflineMode ? "default" : "outline"} 
                      size="sm"
                      onClick={toggleOfflineMode}
                      className={cn(isOfflineMode && "bg-orange-500 hover:bg-orange-600")}
                      data-testid="button-toggle-offline"
                    >
                      {isOfflineMode ? <WifiOff className="h-4 w-4 mr-2"/> : <Wifi className="h-4 w-4 mr-2"/>}
                      {isOfflineMode ? "ON" : "OFF"}
                    </Button>
                  </div>
                  <Button variant="destructive" className="w-full" onClick={handleLogout} data-testid="button-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          
          <h1 className="text-lg font-bold font-heading uppercase truncate max-w-[200px]">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {currentUser.role === 'agent' && (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleSync}
                disabled={syncOrderMutation.isPending || isOfflineMode}
                className={cn(syncOrderMutation.isPending && "animate-spin")}
                data-testid="button-sync"
              >
                <RefreshCw className="h-5 w-5" />
                {pendingOrders.length > 0 && !isOfflineMode && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px]">
                    {pendingOrders.length}
                  </span>
                )}
              </Button>
              
              <Button 
                variant="default" 
                size="icon" 
                className="relative"
                onClick={() => setLocation('/cart')}
                data-testid="button-cart"
              >
                <ShoppingCart className="h-5 w-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px]" data-testid="badge-cart-count">
                    {cart.length}
                  </span>
                )}
              </Button>
            </>
          )}
          
          {/* Desktop/Tablet user menu - visible on md screens and up */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="hidden md:flex items-center gap-2" data-testid="button-user-menu">
                <User className="h-5 w-5" />
                <span className="text-sm font-medium max-w-[120px] truncate">{currentUser.name}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{currentUser.name}</span>
                  <span className="text-xs font-normal text-slate-500">{currentUser.role}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleOfflineMode} data-testid="menu-toggle-offline">
                {isOfflineMode ? <WifiOff className="mr-2 h-4 w-4" /> : <Wifi className="mr-2 h-4 w-4" />}
                Offline Mode: {isOfflineMode ? "ON" : "OFF"}
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
        <div className="bg-orange-500 text-white text-xs font-bold text-center py-1 uppercase tracking-wide">
          Offline Mode Active - Orders will be queued
        </div>
      )}

      <main className="p-4 md:p-6 max-w-4xl mx-auto animate-in fade-in duration-300">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
