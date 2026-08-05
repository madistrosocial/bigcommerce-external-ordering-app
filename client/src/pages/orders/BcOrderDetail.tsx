import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import {
  ArrowLeft, Printer, Send, Download,
  Package, User, FileText, CheckCircle2, Clock,
  AlertCircle, Mail, Phone, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCurrency(v: string | number | null | undefined): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

function StatusBadge({ status }: { status: string }) {
  const sl = (status ?? "").toLowerCase();
  const cls = sl.includes("complet") || sl.includes("shipped") || sl === "shipped"
    ? "bg-green-100 text-green-700 border border-green-200"
    : sl.includes("await") || sl.includes("pending") || sl.includes("partial")
    ? "bg-amber-100 text-amber-700 border border-amber-200"
    : sl.includes("cancel") || sl.includes("declin") || sl.includes("refund") || sl.includes("disput")
    ? "bg-red-100 text-red-700 border border-red-200"
    : "bg-slate-100 text-slate-500 border border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function AddressBlock({ address, label }: { address: any; label: string }) {
  if (!address) return null;
  const a = address;
  const hasContent = a.street_1 || a.city || a.country;
  if (!hasContent) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="text-[13px] text-slate-600 leading-relaxed space-y-0.5">
        {(a.first_name || a.last_name) && (
          <p className="font-medium text-slate-800">{[a.first_name, a.last_name].filter(Boolean).join(" ")}</p>
        )}
        {a.company && <p>{a.company}</p>}
        {a.street_1 && <p>{a.street_1}{a.street_2 ? `, ${a.street_2}` : ""}</p>}
        {(a.city || a.state || a.zip) && (
          <p>{a.city}{a.state ? `, ${a.state}` : ""} {a.zip}</p>
        )}
        {a.country && <p>{a.country}</p>}
        {a.phone && (
          <p className="flex items-center gap-1 text-slate-500">
            <Phone className="h-3 w-3" />{a.phone}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BcOrderDetail() {
  const [, params] = useRoute("/orders/bc/:id");
  const [, setLocation] = useLocation();
  const fmt = useTimeService();
  const bcOrderId = params?.id;

  const { data, isLoading, error } = useQuery<{ order: any; products: any[]; crm_customer_id: number | null }>({
    queryKey: ["bc-order-detail", bcOrderId],
    queryFn: async () => {
      const r = await fetch(`/api/bigcommerce/orders/${bcOrderId}/detail`, {
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error("Order not found");
      return r.json();
    },
    enabled: !!bcOrderId,
    staleTime: 60_000,
  });

  const openInvoice = () => window.open(`/invoice/${bcOrderId}`, "_blank");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        Loading order…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
        <AlertCircle className="h-8 w-8 opacity-40" />
        <p className="text-sm">Order not found</p>
        <Button size="sm" variant="outline" onClick={() => setLocation("/orders/list")}>
          Back to Orders
        </Button>
      </div>
    );
  }

  const { order, products, crm_customer_id } = data;
  const billing = order.billing_address ?? {};
  const items: any[] = Array.isArray(products) ? products : [];

  const subtotalExTax = parseFloat(order.subtotal_ex_tax ?? "0");
  const totalTax      = parseFloat(order.total_tax ?? "0");
  const shipping      = parseFloat(order.shipping_cost_inc_tax ?? order.base_shipping_cost ?? "0");
  const grandTotal    = parseFloat(order.total_inc_tax ?? "0");

  const initials = ((billing.company || billing.first_name || "?") as string)
    .split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setLocation("/orders/list")}
            className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">Order #{order.id}</h1>
              <StatusBadge status={order.status ?? ""} />
              <span className="text-xs text-slate-400 font-mono">BC #{order.id}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
              {order.date_created && <span>{fmt.dateTime(order.date_created)}</span>}
              {order.payment_method && <span>· {order.payment_method}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Send className="h-3.5 w-3.5" /> Send
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-4">

        {/* ── Customer + Address ───────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <User className="h-4 w-4 text-slate-400" /> Customer Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Identity */}
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {initials}
                </div>
                <div>
                  {billing.company ? (
                    <p
                      className={`text-[13px] font-semibold leading-tight ${crm_customer_id ? "text-blue-600 cursor-pointer hover:underline" : "text-slate-900"}`}
                      onClick={crm_customer_id ? () => setLocation(`/crm/customers/${crm_customer_id}`) : undefined}
                    >
                      {billing.company}
                      {crm_customer_id && <ExternalLink className="h-3 w-3 inline ml-0.5 opacity-60" />}
                    </p>
                  ) : null}
                  <p className={`leading-tight ${billing.company ? "text-[12px] text-slate-500" : `text-[13px] font-semibold ${crm_customer_id ? "text-blue-600 cursor-pointer hover:underline" : "text-slate-900"}`}`}
                     onClick={!billing.company && crm_customer_id ? () => setLocation(`/crm/customers/${crm_customer_id}`) : undefined}
                  >
                    {[billing.first_name, billing.last_name].filter(Boolean).join(" ") || "—"}
                    {!billing.company && crm_customer_id && <ExternalLink className="h-3 w-3 inline ml-0.5 opacity-60" />}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                {billing.email && (
                  <p className="text-[12px] text-slate-500 flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                    <a href={`mailto:${billing.email}`} className="hover:text-blue-500 transition-colors">
                      {billing.email}
                    </a>
                  </p>
                )}
                {billing.phone && (
                  <p className="text-[12px] text-slate-500 flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                    {billing.phone}
                  </p>
                )}
              </div>
            </div>

            <AddressBlock address={order.billing_address} label="Billing Address" />

            {/* Notes */}
            <div className="space-y-2">
              {order.staff_notes && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Staff Notes</p>
                  <p className="text-[13px] text-slate-600 leading-relaxed"
                     dangerouslySetInnerHTML={{ __html: order.staff_notes.replace(/<[^>]+>/g, " ") }} />
                </div>
              )}
              {order.customer_message && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer Note</p>
                  <p className="text-[13px] text-slate-600 leading-relaxed">{order.customer_message}</p>
                </div>
              )}
              {!order.staff_notes && !order.customer_message && (
                <p className="text-[12px] text-slate-400 italic">No notes</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Products ─────────────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-1.5">
            <Package className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Products ({items.length})</h2>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Product</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-14">Qty</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Unit Price</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Discount</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-20">Tax</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const qty        = Number(item.quantity ?? 0);
                const unitEx     = parseFloat(item.price_ex_tax ?? item.base_price ?? "0");
                const lineTax    = parseFloat(item.total_tax ?? "0");
                const lineTotal  = parseFloat(item.total_inc_tax ?? "0");
                const discount   = parseFloat(item.discount_amount ?? "0");
                return (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-medium text-slate-900">{item.name}</p>
                      {item.sku && <p className="text-[11px] text-slate-400 font-mono">{item.sku}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-medium text-slate-700 tabular-nums">{qty}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] text-slate-700 tabular-nums">{fmtCurrency(unitEx)}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums">
                      {discount > 0
                        ? <span className="text-green-600">-{fmtCurrency(discount)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums">
                      {lineTax > 0
                        ? <span className="text-slate-500">{fmtCurrency(lineTax)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-semibold text-slate-900 tabular-nums">{fmtCurrency(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="px-4 py-3 border-t bg-slate-50">
            <div className="flex justify-end">
              <div className="w-64 space-y-1">
                <div className="flex justify-between text-[13px] text-slate-600">
                  <span>Subtotal (ex. tax)</span>
                  <span className="tabular-nums font-medium">{fmtCurrency(subtotalExTax)}</span>
                </div>
                {totalTax > 0 && (
                  <div className="flex justify-between text-[13px] text-slate-600">
                    <span>Tax</span>
                    <span className="tabular-nums font-medium">{fmtCurrency(totalTax)}</span>
                  </div>
                )}
                {shipping > 0 && (
                  <div className="flex justify-between text-[13px] text-slate-600">
                    <span>Shipping</span>
                    <span className="tabular-nums font-medium">{fmtCurrency(shipping)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[14px] font-bold text-slate-900 border-t pt-1.5 mt-1.5">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{fmtCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-400" /> Timeline
          </h2>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-slate-800">Order Created in BigCommerce</p>
                {order.date_created && (
                  <p className="text-[11px] text-slate-400">{fmt.dateTime(order.date_created)}</p>
                )}
              </div>
            </div>
            {order.date_shipped && (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-slate-800">Shipped</p>
                  <p className="text-[11px] text-slate-400">{fmt.dateTime(order.date_shipped)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Invoice ──────────────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-slate-400" /> Invoice
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Printer className="h-3.5 w-3.5" /> Print Invoice
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Send className="h-3.5 w-3.5" /> Send Invoice
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Download className="h-3.5 w-3.5" /> Download Invoice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
