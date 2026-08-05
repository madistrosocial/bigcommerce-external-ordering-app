import { useState, useCallback, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimeService } from "@/hooks/useTimeService";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Search, Filter, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ShoppingBag, DollarSign, CheckCircle2, Clock, AlertCircle, Printer,
  MoreHorizontal, ExternalLink, Send, Download, RotateCcw, FileText,
  User, Package,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────────────────
interface KPIs {
  total: number;
  revenue: number;
  successful: number;
  pending: number;
  failed: number;
}

interface OrderItem {
  name: string;
  sku?: string;
  quantity: number;
  price_at_sale: string;
}

interface ConsolidatedOrder {
  id: number;
  customer_name: string;
  customer_email: string | null;
  bigcommerce_customer_id: number | null;
  billing_address: any;
  status: string;
  sync_error: string | null;
  order_note: string | null;
  customer_note: string | null;
  items: OrderItem[];
  total: string;
  date: string;
  created_by_user_id: number;
  bigcommerce_order_id: number | null;
  created_by_name: string | null;
  company: string | null;
  crm_customer_id: number | null;
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

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    synced:       { cls: "bg-green-100 text-green-700",  label: "Synced"   },
    pending_sync: { cls: "bg-amber-100 text-amber-700",  label: "Pending"  },
    failed:       { cls: "bg-red-100 text-red-700",      label: "Failed"   },
    draft:        { cls: "bg-slate-100 text-slate-500",  label: "Draft"    },
  };
  const c = cfg[status] ?? { cls: "bg-slate-100 text-slate-500", label: status };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${c.cls}`}>
      {c.label}
    </span>
  );
}

const PAGE_SIZE = 50;

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className={`bg-white border rounded-lg px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 ${color}`}>
      <div className="shrink-0">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-base sm:text-2xl font-bold text-slate-900 tabular-nums leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Expanded row preview ──────────────────────────────────────────────────────
function ExpandedPreview({ order }: { order: ConsolidatedOrder }) {
  const total = parseFloat(order.total);
  const addr = order.billing_address as any;
  return (
    <div className="bg-slate-50 border-t px-4 py-3 space-y-3 text-sm">
      {order.sync_error && (
        <div className="flex gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div><span className="font-semibold">Sync Error: </span>{order.sync_error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Customer */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer</p>
          <p className="text-[13px] font-semibold text-slate-800">{order.company || order.customer_name}</p>
          {order.company && <p className="text-[12px] text-slate-500">{order.customer_name}</p>}
          {order.customer_email && <p className="text-[11px] text-slate-400">{order.customer_email}</p>}
        </div>

        {/* Billing address */}
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

        {/* Notes */}
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

      {/* Line items */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
          Items ({order.items?.length ?? 0})
        </p>
        <div className="space-y-1">
          {(order.items ?? []).map((item, i) => (
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

        {/* Totals */}
        <div className="border-t mt-2 pt-2 flex justify-end">
          <div className="text-[13px] font-bold text-slate-900 tabular-nums">
            Total: {fmtCurrency(total)}
          </div>
        </div>
      </div>

      {order.bigcommerce_order_id && (
        <p className="text-[11px] text-slate-400">BC Order #{order.bigcommerce_order_id}</p>
      )}
    </div>
  );
}

// ── Mobile order card ─────────────────────────────────────────────────────────
function MobileOrderCard({ order, onOpenDetail, onPrint }: {
  order: ConsolidatedOrder;
  onOpenDetail: () => void;
  onPrint: () => void;
}) {
  const fmt = useTimeService();
  const [open, setOpen] = useState(false);
  const initials = getInitials(order.company, order.customer_name);

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-900 truncate">{order.company || order.customer_name}</p>
          <p className="text-[11px] text-slate-400">#{order.bigcommerce_order_id || order.id} · {order.date && fmt.relative(order.date)}</p>
        </div>
        <div className="text-right shrink-0 mr-1">
          <p className="text-[13px] font-bold text-slate-900 tabular-nums">{fmtCurrency(order.total)}</p>
          <StatusBadge status={order.status} />
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <>
          <ExpandedPreview order={order} />
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
  const { toast } = useToast();
  const { currentUser } = useStore();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  // ── Filter state ────────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createdBy, setCreatedBy] = useState("");   // "" = all, "me" = current user, number string = specific user
  const [syncStatus, setSyncStatus] = useState("");  // "" | "synced" | "pending_sync" | "failed"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Expanded rows (desktop)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const debounce = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((window as any).__ordersSearchTimer);
    (window as any).__ordersSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }, []);

  const hasAnyFilter = !!(debouncedSearch || createdBy || syncStatus || dateFrom || dateTo);
  const clearFilters = () => {
    setSearch(""); setDebouncedSearch(""); setCreatedBy("");
    setSyncStatus(""); setDateFrom(""); setDateTo(""); setPage(1);
  };

  // Resolve "me" / specific / all
  const resolvedCreatedBy = createdBy === "me" ? String(currentUser?.id ?? "") : (createdBy || "");

  // ── Load users for filter ───────────────────────────────────────────────────
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
    page: String(page),
    limit: String(PAGE_SIZE),
    search: debouncedSearch,
    createdBy: resolvedCreatedBy,
    syncStatus,
    dateFrom,
    dateTo,
  });

  const { data, isLoading } = useQuery<OrdersData>({
    queryKey: ["orders", "consolidated", page, debouncedSearch, resolvedCreatedBy, syncStatus, dateFrom, dateTo],
    queryFn: async () => {
      const r = await fetch(`/api/orders/consolidated?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json();
    },
    staleTime: 30_000,
  });

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const kpis = data?.kpis ?? { total: 0, revenue: 0, successful: 0, pending: 0, failed: 0 };
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
    setLocation(`/orders/${order.id}`);
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      {data && (
        <div className="border-b bg-white px-3 sm:px-4 py-2 sm:py-3 shrink-0">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            <KpiCard icon={ShoppingBag}   label="Total"      value={kpis.total.toLocaleString()}    color="text-slate-500" />
            <KpiCard icon={DollarSign}    label="Revenue"    value={fmtCurrency(kpis.revenue)}       color="text-blue-500"  />
            <KpiCard icon={CheckCircle2}  label="Successful" value={kpis.successful.toLocaleString()} color="text-green-500" />
            <KpiCard icon={Clock}         label="Pending"    value={kpis.pending.toLocaleString()}   color="text-amber-500" />
            <KpiCard icon={AlertCircle}   label="Failed"     value={kpis.failed.toLocaleString()}    color="text-red-500"   />
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-800">Orders</h1>
            <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString()} orders</p>
          </div>
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
                placeholder="Search customer, email, order number…"
                className="pl-8 h-8 text-sm w-full"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Created By */}
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

              {/* Sync Status */}
              <Select value={syncStatus || "__all__"} onValueChange={v => { setSyncStatus(v === "__all__" ? "" : v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  <SelectItem value="synced">Successful</SelectItem>
                  <SelectItem value="pending_sync">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              {/* Date From */}
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="h-8 text-xs border border-slate-200 rounded-md px-2 text-slate-700 bg-white"
                title="From date"
              />
              <input
                type="date"
                value={dateTo}
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
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No orders found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            {/* ── Desktop table (hidden on mobile) ── */}
            <table
              className="hidden sm:table w-full text-sm border-collapse"
              style={{ tableLayout: "fixed", minWidth: "900px" }}
            >
              <thead className="sticky top-0 bg-slate-50 border-b z-10">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="w-24 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Order #</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                  <th className="w-28 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="w-32 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Created By</th>
                  <th className="w-36 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="w-16 px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Items</th>
                  <th className="w-28 px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  <th className="w-24 px-3 py-2.5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
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
                          <StatusBadge status={order.status} />
                        </td>

                        {/* Created By */}
                        <td className="px-3 py-2 hidden lg:table-cell">
                          {order.created_by_name
                            ? <span className="text-[13px] text-slate-600 truncate">{order.created_by_name}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>

                        {/* Date */}
                        <td className="px-3 py-2">
                          <p className="text-[13px] text-slate-700 whitespace-nowrap">{order.date ? fmt.relative(order.date) : "—"}</p>
                        </td>

                        {/* Items */}
                        <td className="px-3 py-2 text-right">
                          <span className="text-[13px] font-medium text-slate-700 tabular-nums">{order.items?.length ?? 0}</span>
                        </td>

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
                                <button className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors" title="More actions">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled className="gap-2 text-slate-400 cursor-not-allowed">
                                  <RotateCcw className="h-3.5 w-3.5" /> Re-Order
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {isExpanded && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={9} className="p-0">
                            <ExpandedPreview order={order} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* ── Mobile cards (hidden on sm+) ── */}
            <div className="sm:hidden px-3 py-3 space-y-2">
              {orders.map(order => (
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
