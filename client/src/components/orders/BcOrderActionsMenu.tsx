/**
 * BcOrderActionsMenu — self-contained actions column for BC-native orders.
 * Renders a Printer icon button + DropdownMenu (Open Details, Print/Send/Download
 * Invoice, Store Credit, Re-Order disabled).
 * Manages its own StoreCreditDialog + EmailComposeDialog state so it can be
 * dropped into any context without lifting state to the parent.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Printer, MoreHorizontal, ExternalLink, Send, Download, RotateCcw, Wallet,
} from "lucide-react";
import StoreCreditDialog from "@/components/orders/StoreCreditDialog";
import type { StoreCreditOrder } from "@/components/orders/StoreCreditDialog";
import EmailComposeDialog from "@/components/orders/EmailComposeDialog";

// ── Email template ────────────────────────────────────────────────────────────

const DEFAULT_EMAIL_BODY = `Hello {customerName},

We hope this message finds you well. We wanted to reach out to you regarding order #{orderNumber}.

{reason}

Missing Items : {missingItems}

Store Credit Applied: {creditAmount}


You will be able to apply this credit at the point of checkout on future orders.  Please feel free to reach back out with any questions or concerns. Again, we thank you for your patience and understanding while we worked to resolve this matter as quickly and effectively as possible.
We greatly appreciate your order with MA Distro and look forward to future business.



Thank you,

Mid Atlantic Distribution
1000 Parliament Court, Suite #300
Durham, North Carolina 27703
Office 1(866)818-9598 Ext 0
sales@midatlanticdistribution.com`;

function buildStoreCreditEmail(opts: {
  customerName: string; orderNumber: string; reason: string;
  products: Array<{ name: string; sku: string; qty: number }>;
  creditAmount: number; creditTax: number; template?: string;
}) {
  const missingItems = opts.products
    .map(p => `${p.qty}× ${p.name}${p.sku ? ` (${p.sku})` : ""}`)
    .join(", ");
  const totalCredit = opts.creditAmount + opts.creditTax;
  const creditStr = totalCredit.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return (opts.template || DEFAULT_EMAIL_BODY)
    .replace(/{customerName}/g, opts.customerName)
    .replace(/{orderNumber}/g, opts.orderNumber)
    .replace(/{reason}/g, opts.reason)
    .replace(/{missingItems}/g, missingItems)
    .replace(/{creditAmount}/g, creditStr);
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface BcOrderActionsMenuProps {
  bcOrderId: number;
  orderNumber?: string | number;
  customerName: string;
  customerEmail: string | null;
  company: string | null;
  crmCustomerId: number | null;
  bigcommerceCustomerId: number | null;
  /** Extra class on the outer wrapper (default: flex items-center gap-1) */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BcOrderActionsMenu({
  bcOrderId, orderNumber, customerName, customerEmail, company,
  crmCustomerId, bigcommerceCustomerId, className,
}: BcOrderActionsMenuProps) {
  const [, setLocation] = useLocation();
  const [storeCreditOpen, setStoreCreditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailData, setEmailData] = useState({ to: "", subject: "", body: "" });

  const invoiceUrl = `/invoice/${bcOrderId}`;

  const handleStoreCreditIssued = (result: {
    order: StoreCreditOrder; reason: string; creditAmount: number; creditTax: number;
    selectedProducts: Array<{ name: string; sku: string; qty: number }>;
  }) => {
    const orderNum = result.order.bigcommerce_order_id ?? bcOrderId;
    const name = result.order.company || result.order.customer_name || "Valued Customer";
    const body = buildStoreCreditEmail({
      customerName: name, orderNumber: String(orderNum), reason: result.reason,
      products: result.selectedProducts.map(p => ({ name: p.name, sku: p.sku, qty: p.qty })),
      creditAmount: result.creditAmount, creditTax: result.creditTax,
    });
    setEmailData({
      to: result.order.customer_email ?? "",
      subject: `ORDER #${orderNum} - Missing Item Store Credit`,
      body,
    });
    setStoreCreditOpen(false);
    setEmailOpen(true);
  };

  const storeCreditOrder: StoreCreditOrder = {
    id: 0,
    bigcommerce_order_id: bcOrderId,
    customer_name: customerName,
    customer_email: customerEmail,
    company,
    crm_customer_id: crmCustomerId,
    bigcommerce_customer_id: bigcommerceCustomerId,
  };

  return (
    <>
      <div className={className ?? "flex items-center gap-1"}>
        {/* Quick print */}
        <button
          className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          title="Print Invoice"
          onClick={e => { e.stopPropagation(); window.open(invoiceUrl, "_blank"); }}
        >
          <Printer className="h-3.5 w-3.5" />
        </button>

        {/* Context menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <button className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={e => { e.stopPropagation(); setLocation(`/orders/bc/${bcOrderId}`); }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={e => { e.stopPropagation(); window.open(invoiceUrl, "_blank"); }}
            >
              <Printer className="h-3.5 w-3.5" /> Print Invoice
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={e => { e.stopPropagation(); window.open(invoiceUrl, "_blank"); }}
            >
              <Send className="h-3.5 w-3.5" /> Send Invoice
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={e => { e.stopPropagation(); window.open(invoiceUrl, "_blank"); }}
            >
              <Download className="h-3.5 w-3.5" /> Download Invoice
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-blue-600 focus:text-blue-700"
              onClick={e => { e.stopPropagation(); setStoreCreditOpen(true); }}
            >
              <Wallet className="h-3.5 w-3.5" /> Store Credit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="gap-2 text-slate-400 cursor-not-allowed">
              <RotateCcw className="h-3.5 w-3.5" /> Re-Order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Store Credit dialog — self-contained */}
      <StoreCreditDialog
        open={storeCreditOpen}
        order={storeCreditOrder}
        onClose={() => setStoreCreditOpen(false)}
        onIssued={result => handleStoreCreditIssued(result as any)}
      />

      {/* Email compose dialog — self-contained */}
      <EmailComposeDialog
        open={emailOpen}
        to={emailData.to}
        subject={emailData.subject}
        body={emailData.body}
        onClose={() => setEmailOpen(false)}
      />
    </>
  );
}
