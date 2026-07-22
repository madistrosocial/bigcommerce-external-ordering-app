import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Users, ShoppingBag, Database, Clock, BarChart2, Info,
  HeartPulse, Save, Zap, Trash2, PlayCircle, StopCircle, List,
} from "lucide-react";
import { useTimeService } from "@/hooks/useTimeService";

function LastSync({ ts }: { ts: string | null }) {
  const fmt = useTimeService();
  if (!ts) return <span className="text-slate-400">Never</span>;
  try {
    return <span className="text-slate-500">{fmt.relative(ts)}</span>;
  } catch {
    return <span className="text-slate-400">—</span>;
  }
}

function SyncLog({ log }: { log: string | null }) {
  if (!log) return null;
  return (
    <p className={`text-xs mt-1.5 font-mono ${log.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
      {log}
    </p>
  );
}

export default function CRMSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Sync states
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [syncingLineItems, setSyncingLineItems] = useState(false);
  const [incSyncingCustomers, setIncSyncingCustomers] = useState(false);
  const [incSyncingOrders, setIncSyncingOrders] = useState(false);
  const [incSyncingLineItems, setIncSyncingLineItems] = useState(false);
  const [resettingCustomers, setResettingCustomers] = useState<"idle" | "confirm">("idle");
  const [resettingOrders, setResettingOrders] = useState<"idle" | "confirm">("idle");
  const [resettingLineItems, setResettingLineItems] = useState<"idle" | "confirm">("idle");
  const [togglingAutoCustomers, setTogglingAutoCustomers] = useState(false);
  const [togglingAutoOrders, setTogglingAutoOrders] = useState(false);
  const [togglingAutoLineItems, setTogglingAutoLineItems] = useState(false);

  const [recalculating, setRecalculating] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);

  const [customerLog, setCustomerLog] = useState<string | null>(null);
  const [orderLog, setOrderLog] = useState<string | null>(null);
  const [lineItemLog, setLineItemLog] = useState<string | null>(null);
  const [recalcLog, setRecalcLog] = useState<string | null>(null);
  const [thresholdErrors, setThresholdErrors] = useState<string[]>([]);

  const { data: status, isLoading } = useQuery({
    queryKey: ["crm", "status"],
    queryFn: async () => {
      const r = await fetch("/api/crm/status", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to fetch CRM status");
      return r.json() as Promise<{
        customer_count: number; order_count: number; line_item_count: number;
        last_customer_sync: string | null; last_order_sync: string | null;
        last_stats_recalc: string | null;
        last_customer_incremental_sync: string | null;
        last_order_incremental_sync: string | null;
        auto_sync_customers: boolean; auto_sync_orders: boolean;
        last_line_items_sync: string | null;
        last_line_items_incremental_sync: string | null;
        auto_sync_line_items: boolean;
      }>;
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
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false);
  if (thresholds && !thresholdsLoaded) {
    setHealthyDays(String(thresholds.healthy_days));
    setWatchDays(String(thresholds.watch_days));
    setAtRiskDays(String(thresholds.at_risk_days));
    setThresholdsLoaded(true);
  }

  // ── Sync helpers ──────────────────────────────────────────────────────────

  const runSync = async (
    url: string, method: "POST" | "DELETE",
    setLoading: (v: boolean) => void,
    setLog: (v: string | null) => void,
    label: string,
  ) => {
    setLoading(true);
    setLog(null);
    try {
      const r = await fetch(url, { method, headers: { ...getAuthHeaders(), "Content-Type": "application/json" } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `${label} failed`);
      const msg = data.synced != null ? `✓ ${label}: ${data.synced} records` : `✓ ${label} complete`;
      setLog(msg);
      toast({ title: label, description: msg.replace("✓ ", "") });
      qc.invalidateQueries({ queryKey: ["crm"] });
    } catch (e: any) {
      setLog(`✗ ${e.message}`);
      toast({ title: `${label} Failed`, description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const syncCustomers    = () => runSync("/api/crm/sync/customers", "POST", setSyncingCustomers, setCustomerLog, "Full Customer Sync");
  const syncOrders       = () => runSync("/api/crm/sync/orders", "POST", setSyncingOrders, setOrderLog, "Full Order Sync");
  const syncLineItems    = () => runSync("/api/crm/sync/line-items", "POST", setSyncingLineItems, setLineItemLog, "Full Line Items Sync");
  const incSyncCustomers = () => runSync("/api/crm/sync/customers/incremental", "POST", setIncSyncingCustomers, setCustomerLog, "Incremental Customer Sync");
  const incSyncOrders    = () => runSync("/api/crm/sync/orders/incremental", "POST", setIncSyncingOrders, setOrderLog, "Incremental Order Sync");
  const incSyncLineItems = () => runSync("/api/crm/sync/line-items/incremental", "POST", setIncSyncingLineItems, setLineItemLog, "Incremental Line Items Sync");

  const resetCustomers = async () => {
    if (resettingCustomers === "idle") { setResettingCustomers("confirm"); return; }
    setResettingCustomers("idle");
    await runSync("/api/crm/sync/customers/reset", "DELETE", setSyncingCustomers, setCustomerLog, "Customer Reset");
  };
  const resetOrders = async () => {
    if (resettingOrders === "idle") { setResettingOrders("confirm"); return; }
    setResettingOrders("idle");
    await runSync("/api/crm/sync/orders/reset", "DELETE", setSyncingOrders, setOrderLog, "Order Reset");
  };
  const resetLineItems = async () => {
    if (resettingLineItems === "idle") { setResettingLineItems("confirm"); return; }
    setResettingLineItems("idle");
    await runSync("/api/crm/sync/line-items/reset", "DELETE", setSyncingLineItems, setLineItemLog, "Line Items Reset");
  };

  const toggleAutoCustomers = async () => {
    setTogglingAutoCustomers(true);
    try {
      const next = !status?.auto_sync_customers;
      const r = await fetch("/api/crm/sync/auto/customers", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!r.ok) throw new Error("Failed to toggle auto-sync");
      toast({ title: next ? "Customer Auto-Sync Enabled" : "Customer Auto-Sync Disabled", description: next ? "Incremental sync will run every 15 minutes." : "Auto-sync stopped." });
      qc.invalidateQueries({ queryKey: ["crm", "status"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setTogglingAutoCustomers(false); }
  };

  const toggleAutoOrders = async () => {
    setTogglingAutoOrders(true);
    try {
      const next = !status?.auto_sync_orders;
      const r = await fetch("/api/crm/sync/auto/orders", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!r.ok) throw new Error("Failed to toggle auto-sync");
      toast({ title: next ? "Order Auto-Sync Enabled" : "Order Auto-Sync Disabled", description: next ? "Incremental sync will run every 15 minutes." : "Auto-sync stopped." });
      qc.invalidateQueries({ queryKey: ["crm", "status"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setTogglingAutoOrders(false); }
  };

  const toggleAutoLineItems = async () => {
    setTogglingAutoLineItems(true);
    try {
      const next = !status?.auto_sync_line_items;
      const r = await fetch("/api/crm/sync/auto/line-items", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!r.ok) throw new Error("Failed to toggle auto-sync");
      toast({ title: next ? "Line Items Auto-Sync Enabled" : "Line Items Auto-Sync Disabled", description: next ? "Incremental sync will run every 15 minutes." : "Auto-sync stopped." });
      qc.invalidateQueries({ queryKey: ["crm", "status"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setTogglingAutoLineItems(false); }
  };

  const recalculateStats = async () => {
    setRecalculating(true);
    setRecalcLog(null);
    const t0 = Date.now();
    try {
      const r = await fetch("/api/crm/recalculate-stats", { method: "POST", headers: getAuthHeaders() });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Recalculation failed");
      setRecalcLog([
        `✓ Customers with orders : ${(data.customers_in_orders ?? 0).toLocaleString()}`,
        `✓ Customer rows updated : ${(data.updated ?? 0).toLocaleString()}`,
        `✓ Duration              : ${(data.duration_ms ?? (Date.now() - t0)).toLocaleString()} ms`,
      ].join("\n"));
      toast({ title: "Stats Recalculated", description: `${data.updated ?? 0} records updated in ${data.duration_ms ?? 0} ms` });
      qc.invalidateQueries({ queryKey: ["crm"] });
    } catch (e: any) {
      setRecalcLog(`✗ Error: ${e.message}`);
      toast({ title: "Recalculation Failed", description: e.message, variant: "destructive" });
    } finally { setRecalculating(false); }
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
      toast({ title: "Health Thresholds Saved", description: `${data.recalc?.updated ?? 0} customer statuses recalculated.` });
      qc.invalidateQueries({ queryKey: ["crm"] });
    } catch (e: any) {
      toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    } finally { setSavingThresholds(false); }
  };

  // ── Sync card component ───────────────────────────────────────────────────

  const SyncCard = ({
    icon: Icon, iconBg, title, description,
    lastFull, lastIncremental, log, autoEnabled,
    busyFull, busyInc, busyAuto,
    onFull, onInc, onAuto, onReset, resetState,
    testPrefix,
  }: {
    icon: React.ElementType; iconBg: string; title: string; description: string;
    lastFull: string | null; lastIncremental: string | null;
    log: string | null; autoEnabled: boolean;
    busyFull: boolean; busyInc: boolean; busyAuto: boolean;
    onFull: () => void; onInc: () => void; onAuto: () => void;
    onReset: () => void; resetState: "idle" | "confirm";
    testPrefix: string;
  }) => (
    <div className="p-4 border rounded-lg space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-800">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" /> Full: <LastSync ts={lastFull} />
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Zap className="h-3 w-3" /> Incremental: <LastSync ts={lastIncremental} />
            </div>
          </div>
          <SyncLog log={log} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Full Sync */}
        <Button
          size="sm" onClick={onFull}
          disabled={busyFull || busyInc}
          className="gap-1.5 text-xs"
          data-testid={`btn-full-sync-${testPrefix}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busyFull ? "animate-spin" : ""}`} />
          {busyFull ? "Syncing…" : "Full Sync"}
        </Button>

        {/* Incremental Sync */}
        <Button
          size="sm" variant="outline" onClick={onInc}
          disabled={busyFull || busyInc}
          className="gap-1.5 text-xs"
          data-testid={`btn-inc-sync-${testPrefix}`}
        >
          <Zap className={`h-3.5 w-3.5 ${busyInc ? "animate-pulse" : ""}`} />
          {busyInc ? "Syncing…" : "Incremental"}
        </Button>

        {/* Auto toggle */}
        <Button
          size="sm" variant="outline" onClick={onAuto}
          disabled={busyAuto}
          className={`gap-1.5 text-xs ${autoEnabled ? "border-green-500 text-green-700 bg-green-50 hover:bg-green-100" : "text-slate-600"}`}
          data-testid={`btn-auto-${testPrefix}`}
        >
          {autoEnabled
            ? <><StopCircle className="h-3.5 w-3.5" /> Auto: ON</>
            : <><PlayCircle className="h-3.5 w-3.5" /> Auto</>}
          {autoEnabled && <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5 bg-green-100 text-green-700">15 min</Badge>}
        </Button>

        {/* Reset (two-step) */}
        <Button
          size="sm" variant="outline" onClick={onReset}
          className={`gap-1.5 text-xs ml-auto ${resetState === "confirm" ? "border-red-400 text-red-700 bg-red-50 hover:bg-red-100 animate-pulse" : "text-slate-500 hover:text-red-600 hover:border-red-300"}`}
          data-testid={`btn-reset-${testPrefix}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {resetState === "confirm" ? "Confirm Reset?" : "Reset"}
        </Button>
      </div>
      {resetState === "confirm" && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          ⚠ This will erase all local {title.toLowerCase()} data. Click "Confirm Reset?" again to proceed, or click elsewhere to cancel.
        </p>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">CRM Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Sync BigCommerce data into the local CRM mirror tables.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
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
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><List className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{isLoading ? "—" : (status?.line_item_count ?? 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500">Mirrored Line Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Health Configuration */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-blue-800">
            <HeartPulse className="h-4 w-4" /> Customer Health Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Set the day thresholds that determine customer health status. Saving automatically recalculates all health scores.
          </p>
          {loadingThresholds ? (
            <div className="text-sm text-slate-400 py-2">Loading thresholds…</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> Healthy Max Days
                  </Label>
                  <Input type="number" min={1} data-testid="input-healthy-days" value={healthyDays} onChange={e => setHealthyDays(e.target.value)} className="h-9 text-sm" placeholder="30" />
                  <p className="text-[11px] text-slate-400">0 to {healthyDays || "?"} days</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-yellow-700 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" /> Watch Max Days
                  </Label>
                  <Input type="number" min={1} data-testid="input-watch-days" value={watchDays} onChange={e => setWatchDays(e.target.value)} className="h-9 text-sm" placeholder="60" />
                  <p className="text-[11px] text-slate-400">{healthyDays || "?"} to {watchDays || "?"} days</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" /> At Risk Max Days
                  </Label>
                  <Input type="number" min={1} data-testid="input-at-risk-days" value={atRiskDays} onChange={e => setAtRiskDays(e.target.value)} className="h-9 text-sm" placeholder="90" />
                  <p className="text-[11px] text-slate-400">{watchDays || "?"} to {atRiskDays || "?"} days</p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Lost</p>
                  <p className="text-xs text-red-600 mt-0.5">No orders, or last order older than At Risk Max Days ({atRiskDays || "?"} days).</p>
                </div>
              </div>
              {thresholdErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  {thresholdErrors.map((err, i) => <p key={i} className="text-xs text-red-700">{err}</p>)}
                </div>
              )}
              <div className="flex items-center justify-between gap-4 pt-1">
                <p className="text-xs text-slate-400">Saving will automatically recalculate all customer health statuses.</p>
                <Button onClick={saveThresholds} disabled={savingThresholds} size="sm" className="shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-700" data-testid="btn-save-thresholds">
                  {savingThresholds ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save & Recalculate</>}
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
          <p className="text-xs text-slate-500">
            <strong>Full Sync</strong> — pulls all records from BigCommerce.&nbsp;
            <strong>Incremental</strong> — pulls only records modified since last sync.&nbsp;
            <strong>Auto</strong> — runs incremental every 15 min automatically.&nbsp;
            <strong>Reset</strong> — clears the local mirror table.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <SyncCard
            icon={Users} iconBg="bg-blue-100 text-blue-600"
            title="Sync Customers" description="Mirror BigCommerce customers locally."
            lastFull={status?.last_customer_sync ?? null}
            lastIncremental={status?.last_customer_incremental_sync ?? null}
            log={customerLog}
            autoEnabled={status?.auto_sync_customers ?? false}
            busyFull={syncingCustomers} busyInc={incSyncingCustomers} busyAuto={togglingAutoCustomers}
            onFull={syncCustomers} onInc={incSyncCustomers} onAuto={toggleAutoCustomers}
            onReset={resetCustomers} resetState={resettingCustomers}
            testPrefix="customers"
          />
          <SyncCard
            icon={ShoppingBag} iconBg="bg-green-100 text-green-600"
            title="Sync Orders" description="Mirror BigCommerce orders and update customer lifetime stats."
            lastFull={status?.last_order_sync ?? null}
            lastIncremental={status?.last_order_incremental_sync ?? null}
            log={orderLog}
            autoEnabled={status?.auto_sync_orders ?? false}
            busyFull={syncingOrders} busyInc={incSyncingOrders} busyAuto={togglingAutoOrders}
            onFull={syncOrders} onInc={incSyncOrders} onAuto={toggleAutoOrders}
            onReset={resetOrders} resetState={resettingOrders}
            testPrefix="orders"
          />
          <SyncCard
            icon={List} iconBg="bg-purple-100 text-purple-600"
            title="Sync Order Line Items" description="Mirror order line items for the Sales Report. Requires orders to be synced first."
            lastFull={status?.last_line_items_sync ?? null}
            lastIncremental={status?.last_line_items_incremental_sync ?? null}
            log={lineItemLog}
            autoEnabled={status?.auto_sync_line_items ?? false}
            busyFull={syncingLineItems} busyInc={incSyncingLineItems} busyAuto={togglingAutoLineItems}
            onFull={syncLineItems} onInc={incSyncLineItems} onAuto={toggleAutoLineItems}
            onReset={resetLineItems} resetState={resettingLineItems}
            testPrefix="line-items"
          />
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
                Recomputes <strong>Lifetime Orders</strong>, <strong>Lifetime Revenue</strong>, <strong>Last Order Date</strong>, and <strong>Health Status</strong> for every customer.
              </p>
              <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                <Clock className="h-3 w-3" /> Last run: <LastSync ts={status?.last_stats_recalc ?? null} />
              </div>
              <SyncLog log={recalcLog} />
            </div>
            <Button onClick={recalculateStats} disabled={recalculating} size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100" data-testid="btn-recalculate-stats">
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
