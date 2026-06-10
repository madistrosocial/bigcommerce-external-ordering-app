import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, ShoppingBag, Database, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function CRMSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [customerLog, setCustomerLog] = useState<string | null>(null);
  const [orderLog, setOrderLog] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["crm", "status"],
    queryFn: async () => {
      const r = await fetch("/api/crm/status", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to fetch CRM status");
      return r.json();
    },
    refetchInterval: 10_000,
  });

  const syncCustomers = async () => {
    setSyncingCustomers(true);
    setCustomerLog(null);
    try {
      const r = await fetch("/api/crm/sync/customers", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Sync failed");
      setCustomerLog(`✓ Synced ${data.synced} customers`);
      toast({ title: "Customer Sync Complete", description: `${data.synced} customers synced` });
      qc.invalidateQueries({ queryKey: ["crm"] });
    } catch (e: any) {
      setCustomerLog(`✗ ${e.message}`);
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncingCustomers(false);
    }
  };

  const syncOrders = async () => {
    setSyncingOrders(true);
    setOrderLog(null);
    try {
      const r = await fetch("/api/crm/sync/orders", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Sync failed");
      setOrderLog(`✓ Synced ${data.synced} orders`);
      toast({ title: "Order Sync Complete", description: `${data.synced} orders synced` });
      qc.invalidateQueries({ queryKey: ["crm"] });
    } catch (e: any) {
      setOrderLog(`✗ ${e.message}`);
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncingOrders(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">CRM Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Sync BigCommerce data into the local CRM mirror tables.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{isLoading ? "—" : (status?.customer_count ?? 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500">Mirrored Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><ShoppingBag className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{isLoading ? "—" : (status?.order_count ?? 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500">Mirrored Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" /> Sync Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer Sync */}
          <div className="flex items-start justify-between gap-4 p-4 border rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">Sync Customers</p>
              <p className="text-xs text-slate-500 mt-0.5">Pull all BigCommerce customers into the local mirror.</p>
              {status?.last_customer_sync && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  Last synced {formatDistanceToNow(new Date(status.last_customer_sync), { addSuffix: true })}
                </div>
              )}
              {customerLog && (
                <p className={`text-xs mt-1.5 font-mono ${customerLog.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                  {customerLog}
                </p>
              )}
            </div>
            <Button
              onClick={syncCustomers}
              disabled={syncingCustomers}
              size="sm"
              className="shrink-0"
              data-testid="btn-sync-customers"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingCustomers ? "animate-spin" : ""}`} />
              {syncingCustomers ? "Syncing…" : "Sync Customers Now"}
            </Button>
          </div>

          {/* Order Sync */}
          <div className="flex items-start justify-between gap-4 p-4 border rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">Sync Orders</p>
              <p className="text-xs text-slate-500 mt-0.5">Pull all BigCommerce orders into the local mirror and update customer lifetime stats.</p>
              {status?.last_order_sync && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  Last synced {formatDistanceToNow(new Date(status.last_order_sync), { addSuffix: true })}
                </div>
              )}
              {orderLog && (
                <p className={`text-xs mt-1.5 font-mono ${orderLog.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                  {orderLog}
                </p>
              )}
            </div>
            <Button
              onClick={syncOrders}
              disabled={syncingOrders}
              size="sm"
              className="shrink-0"
              data-testid="btn-sync-orders"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingOrders ? "animate-spin" : ""}`} />
              {syncingOrders ? "Syncing…" : "Sync Orders Now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-400 border rounded-lg p-3 bg-slate-50">
        <strong>Performance note:</strong> All CRM customer lists, profiles, and exports read from local mirrored tables. BigCommerce is only called during these sync operations.
      </div>
    </div>
  );
}
