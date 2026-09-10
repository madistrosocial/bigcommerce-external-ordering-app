import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ArrowLeft, Printer, Send, Download, ExternalLink,
  Package, User, FileText, CheckCircle2, Clock,
  AlertCircle, Mail, Phone, MessageSquare, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import StoreCreditDialog from "@/components/orders/StoreCreditDialog";
import type { StoreCreditOrder } from "@/components/orders/StoreCreditDialog";
import EmailComposeDialog from "@/components/orders/EmailComposeDialog";

// ── Types ──────────────────────────────────────────────────────────────────────
interface OrderItem {
  name: string;
  sku?: string;
  quantity: number;
  price_at_sale: string;
}

interface OrderDetailData {
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
  google_sheets_logged: boolean;
  created_by_name: string | null;
  company: string | null;
  crm_customer_id: number | null;
}

// ── Reusable product name wrapper (no-op until Product CRM is implemented) ────
function ProductLink({ name }: { name: string }) {
  return <span>{name}</span>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCurrency(v: string | number | null): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    synced:       { cls: "bg-green-100 text-green-700 border border-green-200",  label: "Synced"   },
    pending_sync: { cls: "bg-amber-100 text-amber-700 border border-amber-200",  label: "Pending"  },
    failed:       { cls: "bg-red-100 text-red-700 border border-red-200",        label: "Failed"   },
    draft:        { cls: "bg-slate-100 text-slate-500 border border-slate-200",  label: "Draft"    },
  };
  const c = cfg[status] ?? { cls: "bg-slate-100 text-slate-500 border border-slate-200", label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
}

function AddressBlock({ address, label }: { address: any; label: string }) {
  if (!address?.street_1) return null;
  const a = address;
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="text-[13px] text-slate-600 leading-relaxed space-y-0.5">
        {(a.first_name || a.last_name) && <p className="font-medium text-slate-800">{[a.first_name, a.last_name].filter(Boolean).join(" ")}</p>}
        {a.company && <p>{a.company}</p>}
        <p>{a.street_1}{a.street_2 ? `, ${a.street_2}` : ""}</p>
        <p>{a.city}{a.state ? `, ${a.state}` : ""} {a.zip}</p>
        <p>{a.country}</p>
        {a.phone && <p className="flex items-center gap-1 text-slate-500"><Phone className="h-3 w-3" />{a.phone}</p>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const [, setLocation] = useLocation();
  const fmt = useTimeService();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const id = params?.id;

  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [storeCreditOpen, setStoreCreditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailData, setEmailData] = useState({ to: "", subject: "", body: "" });

  const canEditNote = hasPermission("crm", "notes_edit");

  const { data: order, isLoading, error } = useQuery<OrderDetailData>({
    queryKey: ["order", "detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${id}/detail`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Order not found");
      return r.json();
    },
    enabled: !!id,
  });

  const saveNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const r = await fetch(`/api/orders/${id}/note`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!r.ok) throw new Error("Failed to save note");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", "detail", id] });
      setEditingNote(false);
    },
  });

  const openInvoice = () => {
    if (!order) return;
    window.open(`/invoice/${order.bigcommerce_order_id || order.id}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading order…</div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
        <AlertCircle className="h-8 w-8 opacity-40" />
        <p className="text-sm">Order not found</p>
        <Button size="sm" variant="outline" onClick={() => setLocation("/orders/list")}>Back to Orders</Button>
      </div>
    );
  }

  const items = order.items ?? [];
  const subtotal = items.reduce((sum, i) => sum + parseFloat(i.price_at_sale) * i.quantity, 0);
  const addr = order.billing_address as any;
  const initials = (order.company || order.customer_name || "?")
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
              <h1 className="text-lg font-bold text-slate-900">
                Order #{order.bigcommerce_order_id || order.id}
              </h1>
              <StatusBadge status={order.status} />
              {order.bigcommerce_order_id && (
                <span className="text-xs text-slate-400 font-mono">BC #{order.bigcommerce_order_id}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
              {order.date && <span>{fmt.dateTime(order.date)}</span>}
              {order.created_by_name && <span>by {order.created_by_name}</span>}
              {order.google_sheets_logged && <span className="text-green-600">· Logged to Sheets</span>}
            </div>
          </div>

          {/* Invoice + Store Credit actions */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Send className="h-3.5 w-3.5" /> Send
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={openInvoice}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-8 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => setStoreCreditOpen(true)}
            >
              <Wallet className="h-3.5 w-3.5" /> Store Credit
            </Button>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-4">

        {/* Sync error banner */}
        {order.sync_error && (
          <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div><span className="font-semibold">Sync Error: </span>{order.sync_error}</div>
          </div>
        )}

        {/* ── Customer + Addresses ─────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <User className="h-4 w-4 text-slate-400" /> Customer Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Identity */}
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {initials}
                </div>
                <div>
                  {order.company ? (
                    <p
                      className={`text-[13px] font-semibold leading-tight ${order.crm_customer_id ? "text-blue-600 cursor-pointer hover:underline" : "text-slate-900"}`}
                      onClick={order.crm_customer_id ? () => setLocation(`/crm/customers/${order.crm_customer_id}`) : undefined}
                    >
                      {order.company}
                      {order.crm_customer_id && <ExternalLink className="h-3 w-3 inline ml-0.5 opacity-60" />}
                    </p>
                  ) : null}
                  <p
                    className={`leading-tight ${order.company ? "text-[12px] text-slate-500" : `text-[13px] font-semibold ${order.crm_customer_id ? "text-blue-600 cursor-pointer hover:underline" : "text-slate-900"}`}`}
                    onClick={!order.company && order.crm_customer_id ? () => setLocation(`/crm/customers/${order.crm_customer_id}`) : undefined}
                  >
                    {order.customer_name}
                    {!order.company && order.crm_customer_id && <ExternalLink className="h-3 w-3 inline ml-0.5 opacity-60" />}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                {order.customer_email && (
                  <p className="text-[12px] text-slate-500 flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                    <a href={`mailto:${order.customer_email}`} className="hover:text-blue-500 transition-colors">{order.customer_email}</a>
                  </p>
                )}
                {addr?.phone && (
                  <p className="text-[12px] text-slate-500 flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                    {addr.phone}
                  </p>
                )}
              </div>
            </div>

            {/* Billing address */}
            <AddressBlock address={order.billing_address} label="Billing Address" />
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
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-16">Qty</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Unit Price</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Discount</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Tax</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const lineTotal = parseFloat(item.price_at_sale) * item.quantity;
                return (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-medium text-slate-900"><ProductLink name={item.name} /></p>
                      {item.sku && <p className="text-[11px] text-slate-400 font-mono">{item.sku}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-medium text-slate-700 tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] text-slate-700 tabular-nums">{fmtCurrency(item.price_at_sale)}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-right text-[13px] text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-semibold text-slate-900 tabular-nums">{fmtCurrency(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="px-4 py-3 border-t bg-slate-50">
            <div className="flex justify-end">
              <div className="w-60 space-y-1">
                <div className="flex justify-between text-[13px] text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium">{fmtCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[13px] text-slate-400">
                  <span>Tax</span>
                  <span>—</span>
                </div>
                <div className="flex justify-between text-[13px] text-slate-400">
                  <span>Shipping</span>
                  <span>—</span>
                </div>
                <div className="flex justify-between text-[14px] font-bold text-slate-900 border-t pt-1.5 mt-1.5">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{fmtCurrency(order.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-slate-400" /> Notes
          </h2>
          <div className="space-y-4">
            {/* Customer Notes — read-only */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer Notes</p>
              {order.customer_note
                ? <p className="text-[13px] text-slate-600 leading-relaxed">{order.customer_note}</p>
                : <p className="text-[12px] text-slate-400 italic">No customer notes</p>}
            </div>

            {/* Staff Notes — editable if canEditNote */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Staff Notes</p>
                {canEditNote && (
                  <Button
                    size="sm" variant="outline"
                    className="h-6 text-[11px] px-2 gap-1"
                    onClick={() => { setNoteText(order.order_note ?? ""); setEditingNote(true); }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </div>
              {order.order_note
                ? <p className="text-[13px] text-slate-600 leading-relaxed">{order.order_note}</p>
                : <p className="text-[12px] text-slate-400 italic">No staff notes</p>}
            </div>
          </div>
        </div>

        {/* Staff Notes edit dialog */}
        <Dialog open={editingNote} onOpenChange={v => { if (!v) setEditingNote(false); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Staff Notes</DialogTitle>
            </DialogHeader>
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={5}
              placeholder="Enter internal staff notes…"
              className="text-sm"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingNote(false)}>Cancel</Button>
              <Button
                onClick={() => saveNoteMutation.mutate(noteText)}
                disabled={saveNoteMutation.isPending}
              >
                {saveNoteMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-400" /> Timeline
          </h2>
          <div className="space-y-2">
            {[
              {
                icon: CheckCircle2, color: "text-blue-500",
                label: "Order Created",
                time: order.date ? fmt.dateTime(order.date) : "—",
                sub: order.created_by_name ? `by ${order.created_by_name}` : undefined,
              },
              order.bigcommerce_order_id ? {
                icon: CheckCircle2, color: "text-green-500",
                label: "Synced to BigCommerce",
                time: `BC Order #${order.bigcommerce_order_id}`,
              } : {
                icon: order.status === "failed" ? AlertCircle : Clock,
                color: order.status === "failed" ? "text-red-400" : "text-amber-400",
                label: order.status === "failed" ? "Sync Failed" : "Pending Sync",
                time: order.sync_error ?? undefined,
              },
            ].map((event, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`mt-0.5 shrink-0 ${event.color}`}>
                  <event.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-slate-800">{event.label}</p>
                  {event.time && <p className="text-[11px] text-slate-400">{event.time}</p>}
                  {event.sub && <p className="text-[11px] text-slate-400">{event.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Invoices ─────────────────────────────────────────────────────── */}
        {order.bigcommerce_order_id && (
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
        )}
      </div>

      {/* ── Store Credit Dialog ─────────────────────────────────────────────── */}
      <StoreCreditDialog
        open={storeCreditOpen}
        order={order ? {
          id: order.id,
          bigcommerce_order_id: order.bigcommerce_order_id,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          company: order.company,
          crm_customer_id: order.crm_customer_id,
          bigcommerce_customer_id: order.bigcommerce_customer_id,
        } : null}
        onClose={() => setStoreCreditOpen(false)}
        onIssued={result => {
          const orderNum = order?.bigcommerce_order_id ?? order?.id ?? "";
          const customerName = order?.company || order?.customer_name || "Valued Customer";
          const totalCredit = result.creditAmount + result.creditTax;
          const creditStr = totalCredit.toLocaleString("en-US", { style: "currency", currency: "USD" });
          const missingItems = result.selectedProducts.map(p => `${p.qty}× ${p.name}${p.sku ? ` (${p.sku})` : ""}`).join(", ");
          const body = `Hello ${customerName},\n\nThank you for your most recent order with Mid Atlantic Distribution.  We apologize for any inconvenience, but due to an inventory error, there is an item that we are unable to fulfill in your order.  This item has been removed from your order and store credit has been issued to your account.\n\nMissing Items: ${missingItems}\n\nStore Credit Applied: ${creditStr}\n\n\nYou will be able to apply this credit at the point of checkout on future orders.  Please feel free to reach back out with any questions or concerns. Again, we thank you for your patience and understanding while we worked to resolve this matter as quickly and effectively as possible.\nWe greatly appreciate your order with MA Distro and look forward to future business.\n\n\n\nThank you,\n\nMid Atlantic Distribution\n1000 Parliament Court, Suite #300\nDurham, North Carolina 27703\nOffice 1(866)818-9598 Ext 0\nsales@midatlanticdistribution.com`;
          setEmailData({ to: order?.customer_email ?? "", subject: `ORDER #${orderNum} - Missing Item Store Credit`, body });
          setStoreCreditOpen(false);
          setEmailOpen(true);
        }}
      />

      {/* ── Email Compose Dialog ──────────────────────────────────────────────── */}
      <EmailComposeDialog
        open={emailOpen}
        to={emailData.to}
        subject={emailData.subject}
        body={emailData.body}
        onClose={() => setEmailOpen(false)}
      />
    </div>
  );
}
