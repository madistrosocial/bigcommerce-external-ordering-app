import { useState, useCallback, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useTimeService } from "@/hooks/useTimeService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Search, Filter, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ShoppingBag, DollarSign, CheckCircle2, Clock, AlertCircle, Printer,
  MoreHorizontal, ExternalLink, Send, Download, RotateCcw,
} from "lucide-react";

// ── Static BC status list ─────────────────────────────────────────────────────
const BC_STATUSES = [
  "Incomplete", "Pending", "Awaiting Payment", "Awaiting Fulfillment",
  "Awaiting Shipment", "Awaiting Pickup", "Partially Shipped", "Shipped",
  "Completed", "Cancelled", "Declined", "Refunded", "Disputed",
  "Manual Verification Required", "Partially Refunded",
];

// ── Types ──────────────────────────────────────────────────────────────────────
type SalesChannel = "salesapp" | "allorders";

interface KPIs {
  total: number; revenue: number;
  successful: number; pending: number; failed: number;
  completed: number; awaitingFulfillment: number; cancelled: number;
}

interface OrderItem {
  name: string; sku?: string; quantity: number; price_at_sale: string;
}

interface ConsolidatedOrder {
  id: number;
  customer_name: string;
  customer_email: string | null;
  bigcommerce_customer_id: number | null;
  billing_address: any;
  status: string;
  bc_status: string | null;
  sync_error: string | null;
  order_note: string | null;
  customer_note: string | null;
  items: OrderItem[];
  total: string;
  date: string;
  created_by_user_id: number | null;
  bigcommerce_order_id: number | null;
  created_by_name: string | null;
  company: string | null;
  crm_customer_id: number | null;
  is_bc_mirror: boolean;
}

interface OrdersData {
  orders: ConsolidatedOrder[];
  total: number;
  kpis: KPIs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCurrency(v: string | number | null): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

function getInitials(company: string | null, name: string): string {
  const src = company || name || "?";
  return src.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
}

// Handles both local statuses (synced/pending_sync/failed) and BC status text
function StatusBadge({ status, isBcMirror }: { status: string; isBcMirror?: boolean }) {
  // Local sync status mapping
  const localMap: Record<string, { cls: string; label: string }> = {
    synced:       { cls: "bg-green-100 text-green-700",  label: "Synced"   },
    pending_sync: { cls: "bg-amber-100 text-amber-700",  label: "Pending"  },
    failed:       { cls: "bg-red-100 text-red-700",      label: "Failed"   },
    draft:        { cls: "bg-slate-100 text-slate-500",  label: "Draft"    },
  };
  // BC status color mapping (by keyword)
  const getBcClass = (s: string) => {
    const sl = s.toLowerCase();
    if (sl.includes("complet") || sl.includes("shipped") || sl === "shipped") return "bg-green-100 text-green-700";
    if (sl.includes("await") || sl.includes("pending") || sl.includes("partial")) return "bg-amber-100 text-amber-700";
    if (sl.includes("cancel") || sl.includes("declin") || sl.includes("refund") || sl.includes("disput")) return "bg-red-100 text-red-700";
    if (sl.includes("manual") || sl.includes("verif")) return "bg-orange-100 text-orange-700";
    return "bg-slate-100 text-slate-500";
  };

  const cfg = isBcMirror
    ? { cls: getBcClass(status), label: status }
    : (localMap[status] ?? { cls: getBcClass(status), label: status });

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const PAGE_SIZE = 50;

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className={`bg-white border rounded-lg px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 ${color}`}>
      <div className="shrink-0"><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-base sm:text-2xl font-bold text-slate-900 tabular-nums leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Expanded row preview ──────────────────────────────────────────────────────
function ExpandedPreview({ order }: { order: ConsolidatedOrder }) {
  const addr = order.billing_address as any;
  const total = parseFloat(order.total);
  return (
    <div className="bg-slate-50 border-t px-4 py-3 space-y-3 text-sm">
      {order.sync_error && (
        <div className="flex gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div><span className="font-semibold">Sync Error: </span>{order.sync_error}</div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer</p>
          <p className="text-[13px] font-semibold text-slate-800">{order.company || order.customer_name}</p>
          {order.company && <p className="text-[12px] text-slate-500">{order.customer_name}</p>}
          {order.customer_email && <p className="text-[11px] text-slate-400">{order.customer_email}</p>}
        </div>
        {addr?.street_1 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Billing Address</p>
            <p className="text-[12px] text-slate-600 leading-relaxed">
              {addr.street_1}{addr.street_2 ? `, ${addr.street_2}` : ""}<br />
              {addr.city}{addr.state ? `, ${addr.state}` : ""} {addr.zip}<br />
              {addr.country}
            </p>
          </div>
        )}
        <div className="space-y-1">
          {order.order_note && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Staff Note</p>
              <p className="text-[12px] text-slate-600">{order.order_note}</p>
            </div>
          )}
          {order.customer_note && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Customer Note</p>
              <p className="text-[12px] text-slate-600">{order.customer_note}</p>
            </div>
          )}
        </div>
      </div>
      {/* Line items — Sales App orders only */}
      {!order.is_bc_mirror && (order.items ?? []).length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Items ({order.items.length})
          </p>
          <div className="space-y-1">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0 text-slate-400 font-medium">{item.quantity}×</span>
                  <span className="text-slate-700 truncate">{item.name}</span>
                  {item.sku && <span className="text-slate-400 font-mono shrink-0">{item.sku}</span>}
                </div>
                <span className="text-slate-700 font-medium shrink-0 tabular-nums">
                  {fmtCurrency(parseFloat(item.price_at_sale) * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t mt-2 pt-2 flex justify-end">
            <div className="text-[13px] font-bold text-slate-900 tabular-nums">Total: {fmtCurrency(total)}</div>
          </div>
        </div>
      )}
      {order.bigcommerce_order_id && (
        <p className="text-[11px] text-slate-400">BC Order #{order.bigcommerce_order_id}</p>
      )}
    </div>
  );
}

// ── BC expanded row preview — fetches line items from BC API ─────────────────
function BcExpandedPreview({ bcOrderId, order }: { bcOrderId: number; order: ConsolidatedOrder }) {
  const { data, isLoading } = useQuery<{ order: any; products: any[] }>({
    queryKey: ["bc-order-detail", bcOrderId],
    queryFn: async () => {
      const r = await fetch(`/api/bigcommerce/orders/${bcOrderId}/detail`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <div className="bg-slate-50 border-t px-4 py-4 text-[12px] text-slate-400 italic">
        Loading order details…
      </div>
    );
  }

  const bcOrder = data?.order;
  const items: any[] = data?.products ?? [];
  const billing = bcOrder?.billing_address ?? {};
  const grandTotal = parseFloat(bcOrder?.total_inc_tax ?? order.total ?? "0");
  const subtotalEx = parseFloat(bcOrder?.subtotal_ex_tax ?? "0");
  const totalTax   = parseFloat(bcOrder?.total_tax ?? "0");
  const shipping   = parseFloat(bcOrder?.shipping_cost_inc_tax ?? bcOrder?.base_shipping_cost ?? "0");

  const staffNote = (bcOrder?.staff_notes ?? order.order_note ?? "").replace(/<[^>]+>/g, " ").trim();
  const custNote  = bcOrder?.customer_message ?? order.customer_note ?? "";

  return (
    <div className="bg-slate-50 border-t px-4 py-3 space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Customer */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer</p>
          <p className="text-[13px] font-semibold text-slate-800">{order.company || order.customer_name}</p>
          {order.company && <p className="text-[12px] text-slate-500">{order.customer_name}</p>}
          {order.customer_email && <p className="text-[11px] text-slate-400">{order.customer_email}</p>}
        </div>

        {/* Billing address */}
        {billing?.street_1 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Billing Address</p>
            <p className="text-[12px] text-slate-600 leading-relaxed">
              {[billing.first_name, billing.last_name].filter(Boolean).join(" ")}
              {billing.company && <><br />{billing.company}</>}
              <br />{billing.street_1}{billing.street_2 ? `, ${billing.street_2}` : ""}
              <br />{billing.city}{billing.state ? `, ${billing.state}` : ""} {billing.zip}
              <br />{billing.country}
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          {staffNote && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Staff Note</p>
              <p className="text-[12px] text-slate-600">{staffNote}</p>
            </div>
          )}
          {custNote && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Customer Note</p>
              <p className="text-[12px] text-slate-600">{custNote}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
      {items.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Items ({items.length})
          </p>
          <div className="space-y-1">
            {items.map((item: any, i: number) => {
              const qty      = Number(item.quantity ?? 0);
              const lineTotal = parseFloat(item.total_inc_tax ?? "0");
              const lineTax  = parseFloat(item.total_tax ?? "0");
              const discount = parseFloat(item.discount_amount ?? "0");
              return (
                <div key={i} className="flex items-center justify-between text-[12px] gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="shrink-0 text-slate-400 font-medium">{qty}×</span>
                    <span className="text-slate-700 truncate">{item.name}</span>
                    {item.sku && <span className="text-slate-400 font-mono shrink-0">{item.sku}</span>}
                    {lineTax > 0 && <span className="text-slate-300 shrink-0 text-[10px]">+{fmtCurrency(lineTax)} tax</span>}
                    {discount > 0 && <span className="text-green-600 shrink-0 text-[10px]">-{fmtCurrency(discount)}</span>}
                  </div>
                  <span className="text-slate-700 font-medium shrink-0 tabular-nums">{fmtCurrency(lineTotal)}</span>
                </div>
              );
            })}
          </div>
          <div className="border-t mt-2 pt-2 flex justify-end">
            <div className="space-y-0.5 text-right">
              {subtotalEx > 0 && <div className="text-[11px] text-slate-400">Subtotal (ex. tax): {fmtCurrency(subtotalEx)}</div>}
              {totalTax  > 0 && <div className="text-[11px] text-slate-400">Tax: {fmtCurrency(totalTax)}</div>}
              {shipping  > 0 && <div className="text-[11px] text-slate-400">Shipping: {fmtCurrency(shipping)}</div>}
              <div className="text-[13px] font-bold text-slate-900 tabular-nums">Total: {fmtCurrency(grandTotal)}</div>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400">BC Order #{bcOrderId}</p>
    </div>
  );
}

// ── Mobile order card ─────────────────────────────────────────────────────────
function MobileOrderCard({ order, onOpenDetail, onPrint }: {
  order: ConsolidatedOrder; onOpenDetail: () => void; onPrint: () => void;
}) {
  const fmt = useTimeService();
  const [open, setOpen] = useState(false);
  const initials = getInitials(order.company, order.customer_name);
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(v => !v)}>
        <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-900 truncate">{order.company || order.customer_name}</p>
          <p className="text-[11px] text-slate-400">#{order.bigcommerce_order_id || order.id} · {order.date && fmt.relative(order.date)}</p>
        </div>
        <div className="text-right shrink-0 mr-1">
          <p className="text-[13px] font-bold text-slate-900 tabular-nums">{fmtCurrency(order.total)}</p>
          <StatusBadge status={order.status} isBcMirror={order.is_bc_mirror} />
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <>
          {order.is_bc_mirror && order.bigcommerce_order_id
            ? <BcExpandedPreview bcOrderId={order.bigcommerce_order_id} order={order} />
            : <ExpandedPreview order={order} />}
          <div className="flex gap-2 px-4 py-2 border-t bg-white">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1" onClick={onPrint}>
              <Printer className="h-3 w-3" /> Print
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1" onClick={onOpenDetail}>
              <ExternalLink className="h-3 w-3" /> Details
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function OrdersList() {
  const [, setLocation] = useLocation();
  const fmt = useTimeService();
  const { currentUser } = useStore();

  // ── Filter state ────────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [salesChannel, setSalesChannel] = useState<SalesChannel>("salesapp");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createdBy, setCreatedBy] = useState("");   // "" | "me" | userId string
  const [syncStatus, setSyncStatus] = useState(""); // "" | "synced" | "pending_sync" | "failed"
  const [bcStatus, setBcStatus] = useState("");     // "" | BC status string
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const debounce = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((window as any).__ordersSearchTimer);
    (window as any).__ordersSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }, []);

  const handleChannelChange = (ch: SalesChannel) => {
    setSalesChannel(ch);
    // Reset filters that don't apply to the new channel
    if (ch === "allorders") {
      setCreatedBy("");
      setSyncStatus("");
    }
    setBcStatus("");
    setPage(1);
  };

  const hasAnyFilter = !!(
    debouncedSearch || bcStatus || dateFrom || dateTo ||
    (salesChannel === "salesapp" && (createdBy || syncStatus))
  );

  const clearFilters = () => {
    setSearch(""); setDebouncedSearch(""); setCreatedBy("");
    setSyncStatus(""); setBcStatus(""); setDateFrom(""); setDateTo("");
    setPage(1);
  };

  const resolvedCreatedBy = createdBy === "me" ? String(currentUser?.id ?? "") : (createdBy || "");

  // ── Users for "Created By" dropdown ─────────────────────────────────────────
  const { data: allUsers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["users", "summary"],
    queryFn: async () => {
      const r = await fetch("/api/users/summary", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 120_000,
  });

  // ── Main data query ─────────────────────────────────────────────────────────
  const params = new URLSearchParams({
    page: String(page), limit: String(PAGE_SIZE),
    search: debouncedSearch,
    createdBy: salesChannel === "salesapp" ? resolvedCreatedBy : "",
    syncStatus: salesChannel === "salesapp" ? syncStatus : "",
    bcStatus,
    dateFrom, dateTo,
    salesChannel,
  });

  const { data, isLoading } = useQuery<OrdersData>({
    queryKey: ["orders", "consolidated", salesChannel, page, debouncedSearch, resolvedCreatedBy, syncStatus, bcStatus, dateFrom, dateTo],
    queryFn: async () => {
      const r = await fetch(`/api/orders/consolidated?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json();
    },
    staleTime: 30_000,
  });

  const orderList = data?.orders ?? [];
  const total = data?.total ?? 0;
  const kpis = data?.kpis ?? { total: 0, revenue: 0, successful: 0, pending: 0, failed: 0, completed: 0, awaitingFulfillment: 0, cancelled: 0 };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleExpand = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openInvoice = (order: ConsolidatedOrder) => {
    const id = order.bigcommerce_order_id || order.id;
    window.open(`/invoice/${id}`, "_blank");
  };

  const openDetail = (order: ConsolidatedOrder) => {
    if (order.is_bc_mirror) {
      if (order.bigcommerce_order_id) {
        setLocation(`/orders/bc/${order.bigcommerce_order_id}`);
      } else {
        openInvoice(order);
      }
    } else {
      setLocation(`/orders/${order.id}`);
    }
  };

  // ── KPI configuration per channel ───────────────────────────────────────────
  const kpiCards = salesChannel === "salesapp" ? [
    { icon: ShoppingBag,  label: "Total",      value: kpis.total.toLocaleString(),       color: "text-slate-500" },
    { icon: DollarSign,   label: "Revenue",    value: fmtCurrency(kpis.revenue),          color: "text-blue-500"  },
    { icon: CheckCircle2, label: "Successful", value: kpis.successful.toLocaleString(),   color: "text-green-500" },
    { icon: Clock,        label: "Pending",    value: kpis.pending.toLocaleString(),      color: "text-amber-500" },
    { icon: AlertCircle,  label: "Failed",     value: kpis.failed.toLocaleString(),       color: "text-red-500"   },
  ] : [
    { icon: ShoppingBag,  label: "Total",               value: kpis.total.toLocaleString(),               color: "text-slate-500" },
    { icon: DollarSign,   label: "Revenue",             value: fmtCurrency(kpis.revenue),                  color: "text-blue-500"  },
    { icon: CheckCircle2, label: "Completed",           value: kpis.completed.toLocaleString(),            color: "text-green-500" },
    { icon: Clock,        label: "Awaiting Fulfillment",value: kpis.awaitingFulfillment.toLocaleString(),  color: "text-amber-500" },
    { icon: AlertCircle,  label: "Cancelled",           value: kpis.cancelled.toLocaleString(),            color: "text-red-500"   },
  ];

  return (
    <div className="flex flex-col h-full">

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      {data && (
        <div className="border-b bg-white px-3 sm:px-4 py-2 sm:py-3 shrink-0">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {kpiCards.map(c => (
              <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={c.color} />
            ))}
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-800">Orders</h1>
            <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString()} orders</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Sales Channel toggle — always visible */}
            <Select value={salesChannel} onValueChange={v => handleChannelChange(v as SalesChannel)}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="salesapp">Sales App</SelectItem>
                <SelectItem value="allorders">All Orders</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={showFilters ? "default" : "outline"}
              className="h-8 text-xs gap-1 relative"
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {hasAnyFilter && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border border-white" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="border-b bg-white px-4 pb-3 pt-2 shrink-0">
          <div className="bg-slate-50 border rounded-xl p-3 space-y-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={e => debounce(e.target.value)}
                placeholder="Search order #, company, customer, email, phone…"
                className="pl-8 h-8 text-sm w-full"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Created By — Sales App only */}
              {salesChannel === "salesapp" && (
                <Select value={createdBy || "__all__"} onValueChange={v => { setCreatedBy(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-xs w-40">
                    <SelectValue placeholder="Created By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Users</SelectItem>
                    <SelectItem value="me">Me</SelectItem>
                    {allUsers.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Sync Status — Sales App only */}
              {salesChannel === "salesapp" && (
                <Select value={syncStatus || "__all__"} onValueChange={v => { setSyncStatus(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue placeholder="Sync Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sync States</SelectItem>
                    <SelectItem value="synced">Successful</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* BC Status — always visible */}
              <Select value={bcStatus || "__all__"} onValueChange={v => { setBcStatus(v === "__all__" ? "" : v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue placeholder="BC Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All BC Statuses</SelectItem>
                  {BC_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date range */}
              <input
                type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="h-8 text-xs border border-slate-200 rounded-md px-2 text-slate-700 bg-white"
                title="From date"
              />
              <input
                type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="h-8 text-xs border border-slate-200 rounded-md px-2 text-slate-700 bg-white"
                title="To date"
              />
            </div>

            {hasAnyFilter && (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 gap-1" onClick={clearFilters}>
                  <X className="h-3 w-3" /> Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading orders…</div>
        ) : orderList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No orders found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            {/* ── Desktop table ── */}
            <table className="hidden sm:table w-full text-sm border-collapse" style={{ tableLayout: "fixed", minWidth: "860px" }}>
              <thead className="sticky top-0 bg-slate-50 border-b z-10">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="w-24 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Order #</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                  <th className="w-32 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  {salesChannel === "salesapp" && (
                    <th className="w-32 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Created By</th>
                  )}
                  <th className="w-36 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  {salesChannel === "salesapp" && (
                    <th className="w-14 px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Items</th>
                  )}
                  <th className="w-28 px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  <th className="w-24 px-3 py-2.5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderList.map(order => {
                  const initials = getInitials(order.company, order.customer_name);
                  const isExpanded = expandedRows.has(order.id);
                  return (
                    <Fragment key={order.id}>
                      <tr
                        className="group border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => toggleExpand(order.id)}
                      >
                        {/* Expand toggle */}
                        <td className="px-2 py-2 text-slate-400">
                          {isExpanded
                            ? <ChevronUp className="h-3.5 w-3.5 mx-auto" />
                            : <ChevronDown className="h-3.5 w-3.5 mx-auto" />}
                        </td>

                        {/* Order # */}
                        <td className="px-3 py-2">
                          <span
                            className="text-[13px] font-semibold text-blue-600 hover:underline cursor-pointer"
                            onClick={e => { e.stopPropagation(); openDetail(order); }}
                          >
                            #{order.bigcommerce_order_id || order.id}
                          </span>
                        </td>

                        {/* Customer */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 select-none">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-slate-900 truncate leading-tight">{order.company || order.customer_name}</p>
                              {order.company && <p className="text-[11px] text-slate-500 truncate leading-tight">{order.customer_name}</p>}
                              {order.customer_email && <p className="text-[11px] text-slate-400 truncate leading-tight">{order.customer_email}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2">
                          <StatusBadge status={order.status} isBcMirror={order.is_bc_mirror} />
                          {/* Show BC status below local status in Sales App mode when it exists */}
                          {!order.is_bc_mirror && order.bc_status && (
                            <div className="mt-0.5">
                              <span className="text-[10px] text-slate-400 leading-tight">{order.bc_status}</span>
                            </div>
                          )}
                        </td>

                        {/* Created By — Sales App only */}
                        {salesChannel === "salesapp" && (
                          <td className="px-3 py-2 hidden lg:table-cell">
                            {order.created_by_name
                              ? <span className="text-[13px] text-slate-600 truncate">{order.created_by_name}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        )}

                        {/* Date */}
                        <td className="px-3 py-2">
                          <p className="text-[13px] text-slate-700 whitespace-nowrap">{order.date ? fmt.relative(order.date) : "—"}</p>
                        </td>

                        {/* Items — Sales App only */}
                        {salesChannel === "salesapp" && (
                          <td className="px-3 py-2 text-right">
                            <span className="text-[13px] font-medium text-slate-700 tabular-nums">{order.items?.length ?? 0}</span>
                          </td>
                        )}

                        {/* Total */}
                        <td className="px-3 py-2 text-right">
                          <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{fmtCurrency(order.total)}</span>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                              title="Print Invoice"
                              onClick={() => openInvoice(order)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDetail(order)}>
                                  <ExternalLink className="h-3.5 w-3.5" /> Open Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openInvoice(order)}>
                                  <Printer className="h-3.5 w-3.5" /> Print Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openInvoice(order)}>
                                  <Send className="h-3.5 w-3.5" /> Send Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openInvoice(order)}>
                                  <Download className="h-3.5 w-3.5" /> Download Invoice
                                </DropdownMenuItem>
                                {!order.is_bc_mirror && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem disabled className="gap-2 text-slate-400 cursor-not-allowed">
                                      <RotateCcw className="h-3.5 w-3.5" /> Re-Order
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {isExpanded && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={salesChannel === "salesapp" ? 9 : 7} className="p-0">
                            {order.is_bc_mirror && order.bigcommerce_order_id
                              ? <BcExpandedPreview bcOrderId={order.bigcommerce_order_id} order={order} />
                              : <ExpandedPreview order={order} />}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* ── Mobile cards ── */}
            <div className="sm:hidden px-3 py-3 space-y-2">
              {orderList.map(order => (
                <MobileOrderCard
                  key={order.id}
                  order={order}
                  onOpenDetail={() => openDetail(order)}
                  onPrint={() => openInvoice(order)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="border-t bg-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} total
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
