/**
 * CustomerOrdersPanel — reusable orders component for CRM customer pages.
 * Fetches /api/crm/customers/:id/orders, shows expandable rows with full BC
 * order detail (line items + note editing) on expand.  Note edits sync to
 * BigCommerce and create CRM timeline events via the shared
 * PATCH /api/bigcommerce/orders/:bcOrderId/notes endpoint.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimeService } from "@/hooks/useTimeService";
import { Button } from "@/components/ui/button";
import OrderNoteEditorDialog from "@/components/orders/OrderNoteEditorDialog";
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ExternalLink, Pencil, Printer,
} from "lucide-react";

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

// ── Expanded content for one BC order ─────────────────────────────────────────

function ExpandedBcOrderRow({
  bcOrderId,
  crmCustomerId,
  onNotesSaved,
}: {
  bcOrderId: number;
  crmCustomerId: number;
  onNotesSaved: () => void;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canEditNote = hasPermission("crm", "notes_edit");
  const [editingNote, setEditingNote] = useState<"staff" | "customer" | null>(null);

  const { data, isLoading } = useQuery<{ order: any; products: any[] }>({
    queryKey: ["bc-order-detail", String(bcOrderId)],
    queryFn: async () => {
      const r = await fetch(`/api/bigcommerce/orders/${bcOrderId}/detail`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ type, text }: { type: "staff" | "customer"; text: string }) => {
      const r = await fetch(`/api/bigcommerce/orders/${bcOrderId}/notes`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(type === "staff" ? { staff_notes: text } : { customer_message: text }),
          crm_customer_id: crmCustomerId,
        }),
      });
      if (!r.ok) throw new Error("Failed to save note");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bc-order-detail", String(bcOrderId)] });
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "timeline"] });
      setEditingNote(null);
      onNotesSaved();
    },
  });

  if (isLoading) {
    return (
      <div className="bg-slate-50 border-t px-4 py-3 text-xs text-slate-400 italic">
        Loading order details…
      </div>
    );
  }

  const bcOrder = data?.order;
  const items: any[] = data?.products ?? [];
  const billing = bcOrder?.billing_address ?? {};
  const grandTotal = parseFloat(bcOrder?.total_inc_tax ?? "0");
  const subtotalEx = parseFloat(bcOrder?.subtotal_ex_tax ?? "0");
  const totalTax   = parseFloat(bcOrder?.total_tax ?? "0");
  const shipping   = parseFloat(bcOrder?.shipping_cost_inc_tax ?? bcOrder?.base_shipping_cost ?? "0");

  const staffNote = bcOrder?.staff_notes?.replace(/<[^>]+>/g, " ").trim() ?? "";
  const custNote  = bcOrder?.customer_message ?? "";

  return (
    <div className="bg-slate-50 border-t px-4 py-3 space-y-3 text-sm">
      {/* Billing address */}
      {billing?.street_1 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Billing Address</p>
          <p className="text-[12px] text-slate-600 leading-relaxed">
            {[billing.first_name, billing.last_name].filter(Boolean).join(" ")}
            {billing.company && <><br />{billing.company}</>}
            <br />{billing.street_1}{billing.street_2 ? `, ${billing.street_2}` : ""}
            <br />{billing.city}{billing.state ? `, ${billing.state}` : ""} {billing.zip}
          </p>
        </div>
      )}

      {/* Line items */}
      {items.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Products ({items.length})
          </p>
          <div className="space-y-1">
            {items.map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[12px] gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span className="shrink-0 text-slate-400 font-medium">{Number(item.quantity)}×</span>
                  <span className="font-medium text-slate-800 truncate">{item.name}</span>
                  {item.sku && (
                    <span className="text-slate-400 font-mono text-[10px] shrink-0">{item.sku}</span>
                  )}
                </div>
                <span className="text-slate-700 font-medium shrink-0 tabular-nums">
                  {fmtCurrency(item.total_inc_tax ?? "0")}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t mt-2 pt-2 flex justify-end">
            <div className="space-y-0.5 text-right">
              {subtotalEx > 0 && (
                <div className="text-[11px] text-slate-400">Subtotal (ex. tax): {fmtCurrency(subtotalEx)}</div>
              )}
              {totalTax > 0 && (
                <div className="text-[11px] text-slate-400">Tax: {fmtCurrency(totalTax)}</div>
              )}
              {shipping > 0 && (
                <div className="text-[11px] text-slate-400">Shipping: {fmtCurrency(shipping)}</div>
              )}
              <div className="text-[13px] font-bold text-slate-900 tabular-nums">
                Grand Total: {fmtCurrency(grandTotal)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes — always shown, editable if permitted */}
      <div className="border-t pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer Notes</p>
            {canEditNote && (
              <button
                className="text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-0.5 transition-colors"
                onClick={() => setEditingNote("customer")}
              >
                <Pencil className="h-2.5 w-2.5" /> Edit
              </button>
            )}
          </div>
          <p className="text-[12px] text-slate-600 whitespace-pre-wrap">
            {custNote || <span className="text-slate-300">—</span>}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Staff Notes</p>
            {canEditNote && (
              <button
                className="text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-0.5 transition-colors"
                onClick={() => setEditingNote("staff")}
              >
                <Pencil className="h-2.5 w-2.5" /> Edit
              </button>
            )}
          </div>
          <p className="text-[12px] text-slate-600 whitespace-pre-wrap">
            {staffNote || <span className="text-slate-300">—</span>}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm" variant="outline" className="h-7 text-xs gap-1"
          onClick={() => setLocation(`/orders/bc/${bcOrderId}`)}
        >
          <ExternalLink className="h-3 w-3" /> View Full Order
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 text-xs gap-1"
          onClick={() => window.open(`/invoice/${bcOrderId}`, "_blank")}
        >
          <Printer className="h-3 w-3" /> Print Invoice
        </Button>
      </div>

      {/* Note editor dialog */}
      <OrderNoteEditorDialog
        open={!!editingNote}
        type={editingNote ?? "staff"}
        initialText={editingNote === "staff" ? staffNote : custNote}
        onSave={text => saveNoteMutation.mutate({ type: editingNote!, text })}
        onClose={() => { setEditingNote(null); saveNoteMutation.reset(); }}
        isPending={saveNoteMutation.isPending}
        error={saveNoteMutation.isError ? (saveNoteMutation.error as Error).message : null}
      />
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  crmCustomerId: number;
  /** When set, only show this many rows and hide pagination (used in Overview tab). */
  limit?: number;
}

export default function CustomerOrdersPanel({ crmCustomerId, limit }: Props) {
  const fmt = useTimeService();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

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

  const toggle = (bcId: number) => setExpandedId(prev => prev === bcId ? null : bcId);

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
      {/* Column header (desktop only) */}
      <div className="hidden sm:grid grid-cols-[1fr_160px_130px_110px_28px] gap-0 px-4 py-2 border-b bg-slate-50">
        {["Order", "Date", "Status", "Total", ""].map((h, i) => (
          <span
            key={i}
            className={`text-[11px] font-semibold text-slate-400 uppercase tracking-wide ${i === 3 ? "text-right" : ""}`}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y">
        {displayOrders.map((order: any) => {
          const bcId: number = order.bigcommerce_order_id;
          const isExpanded = expandedId === bcId;
          const hasNotes = !!(order.staff_notes || order.customer_order_notes);

          return (
            <div key={bcId ?? order.id}>
              {/* Row header — clickable to expand */}
              <button
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                onClick={() => toggle(bcId)}
              >
                {/* Desktop layout */}
                <div className="hidden sm:grid grid-cols-[1fr_160px_130px_110px_28px] gap-2 items-center">
                  <div>
                    <span className="text-[13px] font-semibold text-blue-700 font-mono">
                      #{order.order_number ?? bcId}
                    </span>
                    {hasNotes && <span className="ml-1.5 text-amber-500 text-[10px]">📝</span>}
                  </div>
                  <span className="text-[12px] text-slate-500">{fmt.dateTime(order.order_date)}</span>
                  <StatusBadge status={order.status ?? "—"} />
                  <span className="text-[13px] font-semibold text-slate-800 tabular-nums text-right">
                    {fmtCurrency(order.order_total)}
                  </span>
                  <div className="text-slate-400 flex justify-end">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {/* Mobile layout */}
                <div className="sm:hidden flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-blue-700 font-mono">
                        #{order.order_number ?? bcId}
                      </span>
                      {hasNotes && <span className="text-amber-500 text-[10px]">📝</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400">{fmt.dateTime(order.order_date)}</span>
                      <StatusBadge status={order.status ?? "—"} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] font-semibold text-slate-800 tabular-nums">
                      {fmtCurrency(order.order_total)}
                    </span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </div>
              </button>

              {/* Expanded BC detail with note editing */}
              {isExpanded && bcId && (
                <ExpandedBcOrderRow
                  bcOrderId={bcId}
                  crmCustomerId={crmCustomerId}
                  onNotesSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "orders"] });
                    queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "timeline"] });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination footer (only when not in limit/preview mode) */}
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
