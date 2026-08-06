/**
 * BcOrderExpandedRow — shared expanded content for BC-native orders.
 * Used by OrdersList (BcExpandedPreview) and CustomerOrdersPanel.
 * Uses OrderNoteEditorDialog for the note editor (single source of truth).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertCircle, ExternalLink, Pencil } from "lucide-react";
import OrderNoteEditorDialog from "@/components/orders/OrderNoteEditorDialog";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtCurrency(v: string | number | null | undefined): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

// Reusable product name (no-op until Product CRM is implemented)
function ProductLink({ name }: { name: string }) {
  return <span className="text-slate-700 truncate">{name}</span>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  bcOrderId: number;
  /** Local CRM customer ID — drives CRM timeline events on note save */
  crmCustomerId?: number | null;
  /** If provided, the customer section is rendered with a CRM link */
  crmHref?: string | null;
  customerLabel?: string;     // Company or customer name
  customerSubLabel?: string;  // Contact person (if company)
  customerEmail?: string | null;
  syncError?: string | null;
  /** Called after a note is saved so the parent can invalidate related queries */
  onNoteSaved?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BcOrderExpandedRow({
  bcOrderId, crmCustomerId, crmHref,
  customerLabel, customerSubLabel, customerEmail,
  syncError, onNoteSaved,
}: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canEditNote = hasPermission("crm", "notes_edit");
  const [editingNote, setEditingNote] = useState<"staff" | "customer" | null>(null);

  const { data, isLoading } = useQuery<{ order: any; products: any[]; crm_customer_id?: number | null }>({
    queryKey: ["bc-order-detail", String(bcOrderId)],
    queryFn: async () => {
      const r = await fetch(`/api/bigcommerce/orders/${bcOrderId}/detail`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load order detail");
      return r.json();
    },
    staleTime: 120_000,
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ type, text }: { type: "staff" | "customer"; text: string }) => {
      const resolvedCrmId = crmCustomerId ?? data?.crm_customer_id ?? null;
      const r = await fetch(`/api/bigcommerce/orders/${bcOrderId}/notes`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(type === "staff" ? { staff_notes: text } : { customer_message: text }),
          ...(resolvedCrmId ? { crm_customer_id: resolvedCrmId } : {}),
        }),
      });
      if (!r.ok) throw new Error("Failed to save note");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bc-order-detail", String(bcOrderId)] });
      queryClient.invalidateQueries({ queryKey: ["orders", "consolidated"] });
      if (crmCustomerId) {
        queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "orders"] });
        queryClient.invalidateQueries({ queryKey: ["crm", "customer", crmCustomerId, "timeline"] });
      }
      setEditingNote(null);
      onNoteSaved?.();
    },
  });

  if (isLoading) {
    return (
      <div className="bg-slate-50 border-t px-4 py-4 text-[12px] text-slate-400 italic">
        Loading order details…
      </div>
    );
  }

  const bcOrder = data?.order;
  const items: any[]  = data?.products ?? [];
  const billing       = bcOrder?.billing_address ?? {};
  const grandTotal    = parseFloat(bcOrder?.total_inc_tax ?? "0");
  const subtotalEx    = parseFloat(bcOrder?.subtotal_ex_tax ?? "0");
  const totalTax      = parseFloat(bcOrder?.total_tax ?? "0");
  const shipping      = parseFloat(bcOrder?.shipping_cost_inc_tax ?? bcOrder?.base_shipping_cost ?? "0");

  const staffNote = bcOrder?.staff_notes?.replace(/<[^>]+>/g, " ").trim() ?? "";
  const custNote  = bcOrder?.customer_message ?? "";

  return (
    <div className="bg-slate-50 border-t px-4 py-3 space-y-3 text-sm">
      {/* Sync error */}
      {syncError && (
        <div className="flex gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div><span className="font-semibold">Sync Error: </span>{syncError}</div>
        </div>
      )}

      {/* Customer + Billing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {customerLabel && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer</p>
            <p
              className={`text-[13px] font-semibold leading-tight ${crmHref ? "text-blue-600 cursor-pointer hover:underline" : "text-slate-800"}`}
              onClick={crmHref ? () => setLocation(crmHref) : undefined}
            >
              {customerLabel}
              {crmHref && <ExternalLink className="h-3 w-3 inline ml-0.5 opacity-60" />}
            </p>
            {customerSubLabel && <p className="text-[12px] text-slate-500">{customerSubLabel}</p>}
            {customerEmail && <p className="text-[11px] text-slate-400">{customerEmail}</p>}
          </div>
        )}
        {billing?.street_1 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Billing Address</p>
            <p className="text-[12px] text-slate-600 leading-relaxed">
              {[billing.first_name, billing.last_name].filter(Boolean).join(" ")}
              {billing.company && <><br />{billing.company}</>}
              <br />{billing.street_1}{billing.street_2 ? `, ${billing.street_2}` : ""}
              <br />{billing.city}{billing.state ? `, ${billing.state}` : ""} {billing.zip}
              {billing.country && <><br />{billing.country}</>}
            </p>
          </div>
        )}
      </div>

      {/* Line items */}
      {items.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Products ({items.length})
          </p>
          <div className="space-y-1">
            {items.map((item: any, i: number) => {
              const qty       = Number(item.quantity ?? 0);
              const lineTotal = parseFloat(item.total_inc_tax ?? "0");
              const lineTax   = parseFloat(item.total_tax ?? "0");
              const discount  = parseFloat(item.discount_amount ?? "0");
              return (
                <div key={i} className="flex items-center justify-between text-[12px] gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="shrink-0 text-slate-400 font-medium">{qty}×</span>
                    <ProductLink name={item.name} />
                    {item.sku && (
                      <span className="text-slate-400 font-mono shrink-0 text-[10px]">{item.sku}</span>
                    )}
                    {lineTax  > 0 && <span className="text-slate-300 shrink-0 text-[10px]">+{fmtCurrency(lineTax)} tax</span>}
                    {discount > 0 && <span className="text-green-600 shrink-0 text-[10px]">-{fmtCurrency(discount)}</span>}
                  </div>
                  <span className="text-slate-700 font-medium shrink-0 tabular-nums">{fmtCurrency(lineTotal)}</span>
                </div>
              );
            })}
          </div>

          {/* Order totals */}
          <div className="border-t mt-2 pt-2 flex justify-end">
            <div className="space-y-0.5 text-right">
              {subtotalEx > 0 && <div className="text-[11px] text-slate-400">Subtotal (ex. tax): {fmtCurrency(subtotalEx)}</div>}
              {totalTax  > 0 && <div className="text-[11px] text-slate-400">Tax: {fmtCurrency(totalTax)}</div>}
              {shipping  > 0 && <div className="text-[11px] text-slate-400">Shipping: {fmtCurrency(shipping)}</div>}
              <div className="text-[13px] font-bold text-slate-900 tabular-nums">Grand Total: {fmtCurrency(grandTotal)}</div>
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

      <p className="text-[11px] text-slate-400">BC Order #{bcOrderId}</p>

      {/* Unified note editor dialog */}
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
