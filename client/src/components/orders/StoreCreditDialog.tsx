import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StoreCreditOrder {
  id?: number;                     // local Sales App order id (if applicable)
  bigcommerce_order_id?: number | null;
  order_number?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  company?: string | null;
  crm_customer_id?: number | null;
  bigcommerce_customer_id?: number | null;
}

interface SelectedItem {
  checked: boolean;
  missing_qty: number;
}

interface IssuedResult {
  order: StoreCreditOrder;
  reason: string;
  creditAmount: number;
  creditTax: number;
  selectedProducts: Array<{
    name: string; sku: string; qty: number; unit_price: number; tax: number; line_total: number;
  }>;
}

interface Props {
  open: boolean;
  order: StoreCreditOrder | null;
  onClose: () => void;
  onIssued: (result: IssuedResult) => void;
}

function fmtCurrency(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function StoreCreditDialog({ open, order, onClose, onIssued }: Props) {
  const { user } = useStore();
  const bcOrderId = order?.bigcommerce_order_id;

  const [reason, setReason] = useState("Missing Items");
  const [selected, setSelected] = useState<Record<number, SelectedItem>>({});

  // Reset state when order changes
  useEffect(() => {
    setReason("Missing Items");
    setSelected({});
  }, [order?.id, order?.bigcommerce_order_id]);

  // Fetch BC line items
  const { data, isLoading } = useQuery<{ order: any; products: any[] }>({
    queryKey: ["bc-order-detail", bcOrderId],
    queryFn: async () => {
      const r = await fetch(`/api/bigcommerce/orders/${bcOrderId}/detail`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load order");
      return r.json();
    },
    enabled: open && !!bcOrderId,
    staleTime: 60_000,
  });

  const items: any[] = data?.products ?? [];

  // Derived totals
  const selectedItems = items.filter((_, i) => selected[i]?.checked);
  const creditLines = selectedItems.map((item, _) => {
    const idx = items.indexOf(item);
    const missingQty = selected[idx]?.missing_qty ?? 0;
    const unitPrice = parseFloat(item.price_inc_tax ?? item.price_ex_tax ?? "0");
    const unitTax = parseFloat(item.total_tax ?? "0") / Math.max(1, Number(item.quantity ?? 1));
    const lineTax = unitTax * missingQty;
    const lineTotal = unitPrice * missingQty;
    return { item, idx, missingQty, unitPrice, unitTax, lineTax, lineTotal };
  });
  const subtotal = creditLines.reduce((s, l) => s + l.lineTotal, 0);
  const taxTotal = creditLines.reduce((s, l) => s + l.lineTax, 0);
  const grandTotal = subtotal + taxTotal;

  const issueMutation = useMutation({
    mutationFn: async () => {
      const products = creditLines.map(l => ({
        name: l.item.name,
        sku: l.item.sku ?? "",
        qty: l.missingQty,
        unit_price: l.unitPrice,
        tax: l.lineTax,
        line_total: l.lineTotal + l.lineTax,
      }));
      const r = await fetch("/api/store-credit/issue", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: order?.crm_customer_id,
          bigcommerce_customer_id: order?.bigcommerce_customer_id,
          bigcommerce_order_id: bcOrderId,
          order_id: order?.id,
          reason,
          amount: subtotal,
          tax: taxTotal,
          products,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      onIssued({
        order: order!,
        reason,
        creditAmount: subtotal,
        creditTax: taxTotal,
        selectedProducts: creditLines.map(l => ({
          name: l.item.name,
          sku: l.item.sku ?? "",
          qty: l.missingQty,
          unit_price: l.unitPrice,
          tax: l.lineTax,
          line_total: l.lineTotal + l.lineTax,
        })),
      });
      onClose();
    },
  });

  const orderLabel = order?.bigcommerce_order_id ? `#${order.bigcommerce_order_id}` : order?.id ? `#${order.id}` : "";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            Issue Store Credit
            {orderLabel && <span className="text-slate-500 font-normal text-sm">Order {orderLabel}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-1">
          {/* Reason */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Reason</label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Missing Items"
              className="text-sm"
            />
          </div>

          {/* Line items */}
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Missing Items</p>
            {isLoading ? (
              <p className="text-sm text-slate-400 italic">Loading order items…</p>
            ) : !bcOrderId ? (
              <p className="text-sm text-slate-400 italic">No BigCommerce order linked — cannot fetch line items.</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No items found.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Product</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-16">Ord Qty</th>
                      <th className="px-2 py-2 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-20">Missing</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Unit Price</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-20">Tax</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const sel = selected[i];
                      const isChecked = sel?.checked ?? false;
                      const maxQty = Number(item.quantity ?? 0);
                      const missingQty = sel?.missing_qty ?? 0;
                      const unitPrice = parseFloat(item.price_inc_tax ?? item.price_ex_tax ?? "0");
                      const unitTax = parseFloat(item.total_tax ?? "0") / Math.max(1, maxQty);
                      const lineTotal = unitPrice * missingQty + unitTax * missingQty;
                      return (
                        <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => setSelected(prev => ({
                                ...prev,
                                [i]: { checked: e.target.checked, missing_qty: e.target.checked ? 1 : 0 },
                              }))}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-[13px] font-medium text-slate-900 leading-tight">{item.name}</p>
                            {item.sku && <p className="text-[11px] text-slate-400 font-mono">{item.sku}</p>}
                          </td>
                          <td className="px-2 py-2 text-right text-[13px] text-slate-600 tabular-nums">{maxQty}</td>
                          <td className="px-2 py-2 text-center">
                            {isChecked ? (
                              <input
                                type="number"
                                min={1}
                                max={maxQty}
                                value={missingQty}
                                onChange={e => setSelected(prev => ({
                                  ...prev,
                                  [i]: { checked: true, missing_qty: Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)) },
                                }))}
                                className="w-16 text-center border rounded px-1 py-0.5 text-[13px] tabular-nums"
                              />
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right text-[13px] text-slate-600 tabular-nums">{fmtCurrency(unitPrice)}</td>
                          <td className="px-2 py-2 text-right text-[13px] tabular-nums">
                            {unitTax > 0 ? <span className="text-slate-500">{fmtCurrency(unitTax * missingQty)}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                            {isChecked && missingQty > 0 ? fmtCurrency(lineTotal) : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Summary */}
          {grandTotal > 0 && (
            <div className="flex justify-end">
              <div className="w-56 space-y-1 border rounded-lg p-3 bg-slate-50">
                <div className="flex justify-between text-[13px] text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium">{fmtCurrency(subtotal)}</span>
                </div>
                {taxTotal > 0 && (
                  <div className="flex justify-between text-[13px] text-slate-600">
                    <span>Tax</span>
                    <span className="tabular-nums font-medium">{fmtCurrency(taxTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[14px] font-bold text-blue-700 border-t pt-1.5 mt-1.5">
                  <span>Total Store Credit</span>
                  <span className="tabular-nums">{fmtCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {issueMutation.isError && (
            <p className="text-sm text-red-600">{(issueMutation.error as Error).message}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={issueMutation.isPending}>Cancel</Button>
          <Button
            onClick={() => issueMutation.mutate()}
            disabled={issueMutation.isPending || grandTotal === 0 || creditLines.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Wallet className="h-4 w-4 mr-1.5" />
            {issueMutation.isPending ? "Issuing…" : `Issue Store Credit ${grandTotal > 0 ? fmtCurrency(grandTotal) : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
