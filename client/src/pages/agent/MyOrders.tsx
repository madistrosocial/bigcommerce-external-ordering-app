import { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { useTimeService } from "@/hooks/useTimeService";
import * as api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, CloudOff, AlertCircle, FileText,
  ChevronDown, ChevronUp, Printer, Loader2, ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(status: string) {
  switch (status) {
    case "synced": return "bg-green-500";
    case "pending_sync": return "bg-orange-400";
    case "failed": return "bg-red-500";
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
    default:
      return <Badge variant="outline" className="text-[10px] h-4 px-1.5">{status}</Badge>;
  }
}

// ─── OrderRow ─────────────────────────────────────────────────────────────────

interface RowProps {
  order: api.Order;
  storeHash: string;
}

function OrderRow({ order, storeHash }: RowProps) {
  const [open, setOpen] = useState(false);
  const fmt = useTimeService();

  const printInvoice = () => {
    const id = order.bigcommerce_order_id || order.id;
    if (!id) return;
    window.open(`/invoice/${id}`, "_blank");
  };

  return (
    <div className="border-b last:border-b-0" data-testid={`order-row-${order.id}`}>
      {/* collapsed header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          open ? "bg-slate-50" : "hover:bg-slate-50",
        )}
        data-testid={`order-toggle-${order.id}`}
      >
        <div className={cn("w-2 h-2 rounded-full shrink-0", statusDot(order.status))} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{order.customer_name}</p>
          <p className="text-xs text-slate-400">
            {order.date && fmt.dateTime(order.date)}
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

      {/* expanded detail */}
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
              <span className="text-xs text-slate-400">
                BigCommerce Order #{order.bigcommerce_order_id}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={printInvoice}
                data-testid={`btn-print-${order.id}`}
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

export default function MyOrders() {
  const { currentUser } = useStore();

  const { data: bcConfig } = useQuery({
    queryKey: ["bigcommerce", "public-config"],
    queryFn: api.getBigCommercePublicConfig,
  });
  const storeHash: string = bcConfig?.storeHash ?? "";

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ["orders", currentUser?.id],
    queryFn: () => api.getOrdersByUser(currentUser?.id || 0),
    enabled: !!currentUser,
  });

  const orders = allOrders.filter((o) => o.status !== "draft");

  return (
    <div className="bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <ShoppingBag className="h-5 w-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">My Orders</h1>
        {!isLoading && (
          <span className="ml-auto text-xs text-slate-400">
            {orders.length} order{orders.length !== 1 ? "s" : ""}
          </span>
        )}
      </header>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ShoppingBag className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No orders yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} storeHash={storeHash} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
