/**
 * CustomerOrdersPanel — reusable orders panel for CRM customer pages.
 * Matches the Orders list view: same table layout, actions column with the
 * full context menu (Print, Open Details, Send/Download Invoice, Store Credit,
 * Re-Order disabled), clickable order # linking to the full order page, and
 * the shared BcOrderExpandedRow for expanded content (unified note editor).
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { Button } from "@/components/ui/button";
import BcOrderExpandedRow from "@/components/orders/BcOrderExpandedRow";
import BcOrderActionsMenu from "@/components/orders/BcOrderActionsMenu";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(v: string | number | null | undefined): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

function StatusBadge({ status }: { status: string }) {
  const sl = (status ?? "").toLowerCase();
  const cls =
    sl.includes("complet") || sl === "shipped"
      ? "bg-green-100 text-green-700 border border-green-200"
      : sl.includes("await") || sl.includes("pending") || sl.includes("partial")
      ? "bg-amber-100 text-amber-700 border border-amber-200"
      : sl.includes("cancel") || sl.includes("declin") || sl.includes("refund")
      ? "bg-red-100 text-red-700 border border-red-200"
      : "bg-slate-100 text-slate-500 border border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status ?? "—"}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CustomerInfo {
  name: string;
  email: string | null;
  company: string | null;
  bigcommerceCustomerId: number | null;
}

interface Props {
  crmCustomerId: number;
  /** Customer info passed from the parent — used for Store Credit dialog */
  customerInfo?: CustomerInfo;
  /** When set, only show this many rows and hide pagination (Overview tab). */
  limit?: number;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function CustomerOrdersPanel({ crmCustomerId, customerInfo, limit }: Props) {
  const fmt = useTimeService();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["crm", "customer", crmCustomerId, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${crmCustomerId}/orders`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json();
    },
    enabled: !!crmCustomerId,
    staleTime: 0,
  });

  const allOrders = orders as any[];
  const displayOrders = limit
    ? allOrders.slice(0, limit)
    : allOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = limit ? 1 : Math.max(1, Math.ceil(allOrders.length / PAGE_SIZE));

  const toggle = (bcId: number) =>
    setExpandedId(prev => (prev === bcId ? null : bcId));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
        Loading orders…
      </div>
    );
  }

  if (allOrders.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
        No orders found.
      </div>
    );
  }

  return (
    <div>
      {/* ── Desktop column header ── */}
      <div className="hidden sm:flex items-center px-4 py-2 border-b bg-slate-50 gap-2">
        <span className="flex-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Order</span>
        <span className="w-40 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Date</span>
        <span className="w-32 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Status</span>
        <span className="w-28 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-right">Total</span>
        <span className="w-16 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">Actions</span>
        <span className="w-5" />
      </div>

      {/* ── Rows ── */}
      <div className="divide-y">
        {displayOrders.map((order: any) => {
          const bcId: number = order.bigcommerce_order_id;
          const isExpanded = expandedId === bcId;
          const hasNotes = !!(order.staff_notes || order.customer_order_notes);
          const orderNum = order.order_number ?? bcId;

          // Customer info for Store Credit — use passed prop, fallback to order fields
          const scName  = customerInfo?.company || customerInfo?.name || order.customer_name || "Customer";
          const scEmail = customerInfo?.email ?? order.customer_email ?? null;
          const scComp  = customerInfo?.company ?? null;
          const scBcCid = customerInfo?.bigcommerceCustomerId ?? order.bigcommerce_customer_id ?? null;

          return (
            <div key={bcId ?? order.id}>
              {/* ── Row ── */}
              <div className="flex items-center gap-2 hover:bg-slate-50 transition-colors">
                {/* Clickable region (expands row) */}
                <div
                  className="flex-1 flex items-center gap-2 px-4 py-3 cursor-pointer min-w-0"
                  onClick={() => toggle(bcId)}
                >
                  {/* Desktop layout */}
                  <div className="hidden sm:flex items-center gap-2 w-full">
                    {/* Order # — linked to full order page */}
                    <div className="flex-1 min-w-0">
                      <button
                        className="font-mono text-[13px] font-semibold text-blue-700 hover:underline focus:outline-none"
                        onClick={e => { e.stopPropagation(); setLocation(`/orders/bc/${bcId}`); }}
                        title="Open full order page"
                      >
                        #{orderNum}
                      </button>
                      {hasNotes && <span className="ml-1.5 text-amber-500 text-[10px]">📝</span>}
                    </div>
                    <span className="w-40 text-[12px] text-slate-500 shrink-0">
                      {fmt.dateTime(order.order_date)}
                    </span>
                    <div className="w-32 shrink-0">
                      <StatusBadge status={order.status ?? "—"} />
                    </div>
                    <span className="w-28 text-[13px] font-semibold text-slate-800 tabular-nums text-right shrink-0">
                      {fmtCurrency(order.order_total)}
                    </span>
                  </div>

                  {/* Mobile layout */}
                  <div className="sm:hidden flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <button
                        className="font-mono text-[13px] font-semibold text-blue-700 hover:underline focus:outline-none"
                        onClick={e => { e.stopPropagation(); setLocation(`/orders/bc/${bcId}`); }}
                      >
                        #{orderNum}
                      </button>
                      {hasNotes && <span className="text-amber-500 text-[10px]">📝</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400">{fmt.dateTime(order.order_date)}</span>
                      <StatusBadge status={order.status ?? "—"} />
                    </div>
                    <span className="text-[13px] font-semibold text-slate-800 tabular-nums">
                      {fmtCurrency(order.order_total)}
                    </span>
                  </div>
                </div>

                {/* Actions column — stopPropagation so row click doesn't toggle expand */}
                <div
                  className="shrink-0 flex items-center gap-0.5 pr-2"
                  onClick={e => e.stopPropagation()}
                >
                  {bcId && (
                    <BcOrderActionsMenu
                      bcOrderId={bcId}
                      orderNumber={orderNum}
                      customerName={scName}
                      customerEmail={scEmail}
                      company={scComp}
                      crmCustomerId={crmCustomerId}
                      bigcommerceCustomerId={scBcCid}
                    />
                  )}
                  {/* Expand chevron */}
                  <div
                    className="h-6 w-6 ml-0.5 flex items-center justify-center text-slate-400 cursor-pointer"
                    onClick={() => toggle(bcId)}
                  >
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
              </div>

              {/* ── Expanded row ── */}
              {isExpanded && bcId && (
                <BcOrderExpandedRow
                  bcOrderId={bcId}
                  crmCustomerId={crmCustomerId}
                  onNoteSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "orders"] });
                    queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "timeline"] });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pagination (only when not in limit/preview mode) ── */}
      {!limit && totalPages > 1 && (
        <div className="border-t px-4 py-2.5 flex items-center justify-between bg-slate-50">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} · {allOrders.length} orders
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm" className="h-7 px-2"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 px-2"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
