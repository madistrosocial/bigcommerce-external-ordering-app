import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import * as api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, CloudOff, AlertCircle, FileText,
  ChevronDown, ChevronUp, Printer, Loader2, ClipboardList, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "day" | "week" | "month" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
};

function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "day": return startOfDay(now);
    case "week": return startOfWeek(now, { weekStartsOn: 1 });
    case "month": return startOfMonth(now);
    case "year": return startOfYear(now);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(status: string) {
  switch (status) {
    case "synced": return "bg-green-500";
    case "pending_sync": return "bg-orange-400";
    case "failed": return "bg-red-500";
    case "draft": return "bg-slate-400";
    default: return "bg-slate-300";
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "synced":
      return <Badge className="bg-green-600 text-[10px] h-4 px-1.5 font-medium"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Synced</Badge>;
    case "pending_sync":
      return <Badge className="bg-orange-500 text-[10px] h-4 px-1.5 font-medium"><CloudOff className="h-2.5 w-2.5 mr-0.5" />Pending</Badge>;
    case "failed":
      return <Badge variant="destructive" className="text-[10px] h-4 px-1.5 font-medium"><AlertCircle className="h-2.5 w-2.5 mr-0.5" />Failed</Badge>;
    case "draft":
      return <Badge className="bg-slate-500 text-[10px] h-4 px-1.5 font-medium"><FileText className="h-2.5 w-2.5 mr-0.5" />Draft</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] h-4 px-1.5">{status}</Badge>;
  }
}

// ─── AllOrderRow ──────────────────────────────────────────────────────────────

interface RowProps {
  order: api.Order;
  storeHash: string;
}

function AllOrderRow({ order, storeHash }: RowProps) {
  const [open, setOpen] = useState(false);

  const printInvoice = () => {
    const id = order.bigcommerce_order_id || order.id;
    if (!id) return;
    window.open(`/invoice/${id}`, "_blank");
  };

  return (
    <div className="border-b last:border-b-0" data-testid={`all-order-row-${order.id}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          open ? "bg-slate-50" : "hover:bg-slate-50",
        )}
        data-testid={`all-order-toggle-${order.id}`}
      >
        <div className={cn("w-2 h-2 rounded-full shrink-0", statusDot(order.status))} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{order.customer_name}</p>
          <p className="text-xs text-slate-400">
            {order.date && format(new Date(order.date), "MMM d, yyyy · h:mm a")}
            {(order as any).created_by_name && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-slate-400">
                <User className="h-2.5 w-2.5" />
                {(order as any).created_by_name}
              </span>
            )}
            {order.bigcommerce_order_id && (
              <span className="ml-2 font-mono text-slate-400">BC #{order.bigcommerce_order_id}</span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0 mr-1">
          <p className="text-sm font-semibold text-slate-900">${parseFloat(order.total).toFixed(2)}</p>
          <div className="mt-0.5 flex justify-end">
            <StatusBadge status={order.status} />
          </div>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="bg-slate-50 border-t px-4 py-3 space-y-3">
          {order.sync_error && (
            <div className="flex gap-2 p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div><span className="font-semibold">Sync Error: </span>{order.sync_error}</div>
            </div>
          )}

          {order.order_note && (
            <div className="flex gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700">
              <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div><span className="font-semibold">Note: </span>{order.order_note}</div>
            </div>
          )}

          {(order as any).created_by_name && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <User className="h-3.5 w-3.5" />
              <span>Created by <strong>{(order as any).created_by_name}</strong></span>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              Items ({order.items.length})
            </p>
            <div className="space-y-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-slate-700 flex-1 pr-4 truncate">
                    {item.quantity}× {item.name}
                    {item.sku && <span className="text-slate-400 ml-1.5 font-mono">{item.sku}</span>}
                  </span>
                  <span className="text-slate-700 font-medium shrink-0">
                    ${(parseFloat(item.price_at_sale) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t mt-2 pt-2 text-xs font-bold text-slate-800">
              Total: ${parseFloat(order.total).toFixed(2)}
            </div>
          </div>

          {order.bigcommerce_order_id && (
            <div className="flex items-center justify-between border-t pt-2.5 gap-2">
              <span className="text-xs text-slate-400">BigCommerce Order #{order.bigcommerce_order_id}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={printInvoice}
                data-testid={`btn-print-all-${order.id}`}
              >
                <Printer className="h-3 w-3" /> Print Invoice
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllOrders() {
  const [period, setPeriod] = useState<Period>("week");

  const { data: bcConfig } = useQuery({
    queryKey: ["setting", "bigcommerce_config"],
    queryFn: () => api.getSetting("bigcommerce_config"),
  });
  const storeHash: string = bcConfig?.value?.storeHash ?? "";

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: api.getAllAdminOrders,
  });

  const periodStart = getPeriodStart(period);
  const orders = allOrders.filter((o) => o.date && new Date(o.date) >= periodStart);

  // Stats
  const synced = orders.filter((o) => o.status === "synced").length;
  const pending = orders.filter((o) => o.status === "pending_sync").length;
  const failed = orders.filter((o) => o.status === "failed").length;
  const totalRevenue = orders
    .filter((o) => o.status === "synced")
    .reduce((sum, o) => sum + parseFloat(o.total), 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0 flex-wrap gap-y-2">
        <ClipboardList className="h-5 w-5 text-slate-600 shrink-0" />
        <h1 className="text-base font-bold text-slate-800">All Orders</h1>

        {/* Period filter */}
        <div className="flex items-center gap-1 ml-auto">
          {(["day", "week", "month", "year"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              data-testid={`period-filter-${p}`}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                period === p
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </header>

      {/* Summary strip */}
      {!isLoading && orders.length > 0 && (
        <div className="bg-white border-b px-4 py-2 flex items-center gap-6 text-xs text-slate-500 overflow-x-auto">
          <span><strong className="text-slate-800">{orders.length}</strong> orders</span>
          <span><strong className="text-green-600">{synced}</strong> synced</span>
          <span><strong className="text-orange-500">{pending}</strong> pending</span>
          {failed > 0 && <span><strong className="text-red-500">{failed}</strong> failed</span>}
          <span className="ml-auto shrink-0">
            Revenue: <strong className="text-slate-800">${totalRevenue.toFixed(2)}</strong>
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No orders in {PERIOD_LABELS[period].toLowerCase()}.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {orders.map((order) => (
              <AllOrderRow key={order.id} order={order} storeHash={storeHash} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
