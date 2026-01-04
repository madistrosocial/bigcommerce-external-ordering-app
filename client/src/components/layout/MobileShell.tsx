import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { 
  Menu, 
  ShoppingCart, 
  Package, 
  Users, 
  LogOut, 
  Wifi, 
  WifiOff, 
  RefreshCw 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

interface MobileShellProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
}

export function MobileShell({ children, title = "VanSales Pro", showBack = false }: MobileShellProps) {
  const { currentUser, isOfflineMode, toggleOfflineMode, logout, cart } = useStore();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (isOfflineMode) {
      toast({
        title: "Cannot Sync",
        description: "You are currently in offline mode.",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    // Simulate network delay
    setTimeout(async () => {
      // Find pending orders
      const pendingOrders = await db.orders.where('status').equals('pending_sync').toArray();
      
      if (pendingOrders.length > 0) {
        // "Sync" them
        await db.orders.bulkPut(pendingOrders.map(o => ({ ...o, status: 'synced' })));
        toast({
          title: "Sync Complete",
          description: `Synced ${pendingOrders.length} orders to BigCommerce.`,
        });
      } else {
        toast({
          title: "Up to date",
          description: "No pending orders to sync.",
        });
      }
      setIsSyncing(false);
    }, 1500);
  };

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  if (!currentUser) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b bg-white dark:bg-slate-950 px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
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
                      >
                        <Package className="mr-2 h-5 w-5" />
                        Products & Inventory
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start"
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
                      >
                        <Package className="mr-2 h-5 w-5" />
                        Product Catalog
                      </Button>
                      <Button 
                        variant={location === '/orders' ? 'secondary' : 'ghost'} 
                        className="w-full justify-start"
                        onClick={() => setLocation('/orders')}
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
                    >
                      {isOfflineMode ? <WifiOff className="h-4 w-4 mr-2"/> : <Wifi className="h-4 w-4 mr-2"/>}
                      {isOfflineMode ? "ON" : "OFF"}
                    </Button>
                  </div>
                  <Button variant="destructive" className="w-full" onClick={handleLogout}>
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
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSync}
            disabled={isSyncing || isOfflineMode}
            className={cn(isSyncing && "animate-spin")}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
          
          {currentUser.role === 'agent' && (
            <Button 
              variant="default" 
              size="icon" 
              className="relative"
              onClick={() => setLocation('/cart')}
            >
              <ShoppingCart className="h-5 w-5" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px]">
                  {cart.length}
                </span>
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Offline Banner */}
      {isOfflineMode && (
        <div className="bg-orange-500 text-white text-xs font-bold text-center py-1 uppercase tracking-wide">
          Offline Mode Active - Orders will be queued
        </div>
      )}

      {/* Main Content */}
      <main className="p-4 md:p-6 max-w-4xl mx-auto animate-in fade-in duration-300">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
