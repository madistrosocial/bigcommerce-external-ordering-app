import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Users, ShoppingBag, Database, Clock, BarChart2, Info, HeartPulse, Save } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function LastSync({ ts }: { ts: string | null }) {
  if (!ts) return <span className="text-slate-400">Never</span>;
  try {
    return (
      <span className="text-slate-500">
        {formatDistanceToNow(new Date(ts), { addSuffix: true })}
      </span>
    );
  } catch {
    return <span className="text-slate-400">—</span>;
  }
}

export default function CRMSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [customerLog, setCustomerLog] = useState<string | null>(null);
  const [orderLog, setOrderLog] = useState<string | null>(null);
  const [recalcLog, setRecalcLog] = useState<string | null>(null);
  const [thresholdErrors, setThresholdErrors] = useState<string[]>([]);

  const { data: status, isLoading } = useQuery({
    queryKey: ["crm", "status"],
    queryFn: async () => {
      const r = await fetch("/api/crm/status", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to fetch CRM status");
      return r.json();
    },
    refetchInterval: 10_000,
  });

  const { data: thresholds, isLoading: loadingThresholds } = useQuery({
    queryKey: ["crm", "health-thresholds"],
    queryFn: async () => {
      const r = await fetch("/api/crm/health-thresholds", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load health thresholds");
      return r.json() as Promise<{ healthy_days: number; watch_days: number; at_risk_days: number }>;
    },
  });

  const [healthyDays, setHealthyDays] = useState("");
  const [watchDays, setWatchDays] = useState("");
  const [atRiskDays, setAtRiskDays] = useState("");

  // Sync local input state when thresholds load (only on first load)
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false);
  if (thresholds && !thresholdsLoaded) {
    setHealthyDays(String(thresholds.healthy_days));
    setWatchDays(String(thresholds.watch_days));
    setAtRiskDays(String(thresholds.at_risk_days));
    setThresholdsLoaded(true);
  }

  const syncCustomers = async () => {
    setSyncingCustomers(true);
    setCustomerLog(null);
    try {
      const r = await fetch("/api/crm/sync/customers", { method: "POST", headers: getAuthHeaders() });
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
      const r = await fetch("/api/crm/sync/orders", { method: "POST", headers: getAuthHeaders() });
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

  const recalculateStats = async () => {
    setRecalculating(true);
    setRecalcLog(null);
    const t0 = Date.now();
    try {
      const r = await fetch("/api/crm/recalculate-stats", { method: "POST", headers: getAuthHeaders() });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Recalculation failed");
      const lines = [
        `✓ Customers with orders : ${(data.customers_in_orders ?? 0).toLocaleString()}`,
        `✓ Customer rows updated : ${(data.updated ?? 0).toLocaleString()}`,
        `✓ Duration              : ${(data.duration_ms ?? (Date.now() - t0)).toLocaleString()} ms`,
      ];
      setRecalcLog(lines.join("\n"));
      toast({ title: "Stats Recalculated", description: `${data.updated ?? 0} customer records updated in ${data.duration_ms ?? 0} ms` });
      qc.invalidateQueries({ queryKey: ["crm"] });
    } catch (e: any) {
      setRecalcLog(`✗ Error: ${e.message}`);
      toast({ title: "Recalculation Failed", description: e.message, variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  const saveThresholds = async () => {
    setThresholdErrors([]);
    const h = parseInt(healthyDays, 10);
    const w = parseInt(watchDays, 10);
    const a = parseInt(atRiskDays, 10);
    const errs: string[] = [];
    if (!Number.isInteger(h) || h < 1) errs.push("Healthy Max Days must be a positive integer.");
    if (!Number.isInteger(w) || w < 1) errs.push("Watch Max Days must be a positive integer.");
    if (!Number.isInteger(a) || a < 1) errs.push("At Risk Max Days must be a positive integer.");
    if (Number.isInteger(h) && Number.isInteger(w) && h >= w) errs.push("Healthy must be less than Watch.");
    if (Number.isInteger(w) && Number.isInteger(a) && w >= a) errs.push("Watch must be less than At Risk.");
    if (errs.length) { setThresholdErrors(errs); return; }

    setSavingThresholds(true);
    try {
      const r = await fetch("/api/crm/health-thresholds", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ healthy_days: h, watch_days: w, at_risk_days: a }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to save thresholds");
      toast({
        title: "Health Thresholds Saved",
        description: `Thresholds updated and ${data.recalc?.updated ?? 0} customer health statuses recalculated.`,
      });
      qc.invalidateQueries({ queryKey: ["crm"] });
    } catch (e: any) {
      toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingThresholds(false);
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

      {/* ── Customer Health Configuration ─────────────────────────────────── */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-blue-800">
            <HeartPulse className="h-4 w-4" /> Customer Health Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Set the day thresholds that determine customer health status. When saved, all customer health scores are automatically recalculated — no manual sync required.
          </p>

          {loadingThresholds ? (
            <div className="text-sm text-slate-400 py-2">Loading thresholds…</div>
          ) : (
            <div className="space-y-4">
              {/* Threshold inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    Healthy Max Days
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    data-testid="input-healthy-days"
                    value={healthyDays}
                    onChange={e => setHealthyDays(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="30"
                  />
                  <p className="text-[11px] text-slate-400">0 to {healthyDays || "?"} days</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-yellow-700 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
                    Watch Max Days
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    data-testid="input-watch-days"
                    value={watchDays}
                    onChange={e => setWatchDays(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="60"
                  />
                  <p className="text-[11px] text-slate-400">{healthyDays || "?"} to {watchDays || "?"} days</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
                    At Risk Max Days
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    data-testid="input-at-risk-days"
                    value={atRiskDays}
                    onChange={e => setAtRiskDays(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="90"
                  />
                  <p className="text-[11px] text-slate-400">{watchDays || "?"} to {atRiskDays || "?"} days</p>
                </div>
              </div>

              {/* Lost note */}
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Lost</p>
                  <p className="text-xs text-red-600 mt-0.5">Automatically assigned to any customer with no orders, or last order older than At Risk Max Days ({atRiskDays || "?"} days).</p>
                </div>
              </div>

              {/* Validation errors */}
              {thresholdErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  {thresholdErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-700">{err}</p>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 pt-1">
                <p className="text-xs text-slate-400">
                  Saving will automatically recalculate all customer health statuses.
                </p>
                <Button
                  onClick={saveThresholds}
                  disabled={savingThresholds}
                  size="sm"
                  className="shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-700"
                  data-testid="btn-save-thresholds"
                >
                  {savingThresholds
                    ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                    : <><Save className="h-3.5 w-3.5" /> Save & Recalculate</>
                  }
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Operations */}
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
              <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                Last synced: <LastSync ts={status?.last_customer_sync ?? null} />
              </div>
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
              {syncingCustomers ? "Syncing…" : "Sync Customers"}
            </Button>
          </div>

          {/* Order Sync */}
          <div className="flex items-start justify-between gap-4 p-4 border rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">Sync Orders</p>
              <p className="text-xs text-slate-500 mt-0.5">Pull all BigCommerce orders and update customer lifetime stats.</p>
              <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                Last synced: <LastSync ts={status?.last_order_sync ?? null} />
              </div>
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
              {syncingOrders ? "Syncing…" : "Sync Orders"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recalculate Stats */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-amber-800">
            <BarChart2 className="h-4 w-4" /> Recalculate Customer Stats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 p-4 border border-amber-200 rounded-lg bg-white">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">Recalculate Lifetime Stats</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Recomputes <strong>Lifetime Orders</strong>, <strong>Lifetime Revenue</strong>, <strong>Last Order Date</strong>, and <strong>Health Status</strong> for every customer using the configured thresholds above.
              </p>
              <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                Last run: <LastSync ts={status?.last_stats_recalc ?? null} />
              </div>
              {recalcLog && (
                <p className={`text-xs mt-1.5 font-mono ${recalcLog.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                  {recalcLog}
                </p>
              )}
            </div>
            <Button
              onClick={recalculateStats}
              disabled={recalculating}
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
              data-testid="btn-recalculate-stats"
            >
              <BarChart2 className={`h-3.5 w-3.5 mr-1.5 ${recalculating ? "animate-pulse" : ""}`} />
              {recalculating ? "Recalculating…" : "Recalculate Stats"}
            </Button>
          </div>

          <div className="flex gap-2 p-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono overflow-x-auto">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
            <pre className="whitespace-pre-wrap leading-relaxed">{`UPDATE customers_mirror
SET lifetime_orders  = COUNT(orders),
    lifetime_revenue = SUM(order_total),
    last_order_date  = MAX(order_date),
    account_health   = CASE days_since ...
FROM customer_orders_mirror
GROUP BY bigcommerce_customer_id`}</pre>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-400 border rounded-lg p-3 bg-slate-50">
        <strong>Performance note:</strong> All CRM customer lists, profiles, and exports read from local mirrored tables. BigCommerce is only called during Sync operations.
      </div>
    </div>
  );
}
