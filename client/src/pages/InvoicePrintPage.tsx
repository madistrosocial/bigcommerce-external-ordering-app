import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useStore } from "@/lib/store";
import { useTimeService } from "@/hooks/useTimeService";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Printer, Mail, X, AlertCircle } from "lucide-react";
import JsBarcode from "jsbarcode";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as api from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? "0"));
  return `$${isNaN(n) ? "0.00" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateBarcodeSvg(text: string): string {
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    (JsBarcode as any)(svg, text, {
      format: "CODE128",
      displayValue: false,
      height: 55,
      width: 2,
      margin: 0,
    });
    return svg.outerHTML;
  } catch {
    return `<svg width="200" height="55"><text x="10" y="30" font-size="12" fill="#aaa">Barcode N/A</text></svg>`;
  }
}

function buildItemsRows(products: any[]): string {
  if (!products || products.length === 0) {
    return `<tr><td colspan="4" style="text-align:center;color:#aaa;padding:20px">No items</td></tr>`;
  }
  return products
    .map((p) => {
      const qty = Number(p.quantity) || 1;
      const name = escHtml(p.name || "");
      const sku = escHtml(p.sku || "");
      const upc = p.upc || "";
      // BC overwrites base_price with any manually-adjusted price, so we use
      // catalogue_price (fetched from the product catalogue) as the true original.
      // Fall back to base_price if catalogue_price wasn't available.
      const salePrice = parseFloat(p.price_ex_tax ?? p.base_price ?? "0");
      const origPrice = p.catalogue_price != null
        ? parseFloat(p.catalogue_price)
        : parseFloat(p.base_price ?? "0");
      const lineTotal = salePrice * qty;
      const hasDiscount = origPrice > salePrice + 0.005;

      const origLineTotal = origPrice * qty;
      const barcodeText = upc ? ` , Barcode: ${escHtml(upc)}` : "";
      const lineTotalHtml = hasDiscount
        ? `<span class="price-original">${fmt(origLineTotal)}</span><span class="price-sale">${fmt(lineTotal)}</span>`
        : fmt(lineTotal);

      // Build display name: append variant label(s) from product_options if present
      const optionValues = Array.isArray(p.product_options)
        ? (p.product_options as any[]).map((o) => o.display_value).filter(Boolean)
        : [];
      const displayName = optionValues.length > 0
        ? `${name} | ${optionValues.map(escHtml).join(", ")}`
        : name;

      return `<tr>
  <td>
    <div class="item-name"><strong>${displayName}</strong></div>
    <div class="item-meta">SKU: ${sku}${barcodeText}</div>
  </td>
  <td>${qty}</td>
  <td>${fmt(salePrice)}</td>
  <td>${lineTotalHtml}</td>
</tr>`;
    })
    .join("\n");
}

function substituteVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function InvoicePrintPage() {
  const [, params] = useRoute("/invoice/:orderId");
  const orderId = params?.orderId;
  const { currentUser } = useStore();
  const { toast } = useToast();
  const timeFmt = useTimeService();

  const [invoiceHtml, setInvoiceHtml] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [isSending, setIsSending] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!orderId) return;
    loadInvoice();
  }, [orderId]);

  async function loadInvoice() {
    setIsLoading(true);
    setError(null);
    try {
      const [orderData, settings] = await Promise.all([
        fetch(`/api/bigcommerce/orders/${orderId}/detail`, {
          headers: api.getAuthHeaders(),
        }).then(async (r) => {
          if (!r.ok) {
            let msg = `HTTP ${r.status}`;
            try { const j = await r.json(); msg = j.error || j.message || msg; } catch {}
            throw new Error(msg);
          }
          return r.json();
        }),
        api.getInvoiceSettings(),
      ]);

      const html = buildInvoiceHtml(orderData, settings);
      const invNum = `CNC${orderData.order.id}`;
      setInvoiceNumber(invNum);
      setInvoiceHtml(html);

      const billingEmail = orderData.order.billing_address?.email || "";
      setCustomerEmail(billingEmail);
      setEmailTo(billingEmail);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  function buildInvoiceHtml(orderData: any, settings: api.InvoiceSettings): string {
    const order = orderData.order;
    const products = orderData.products || [];

    const invNum = `CNC${order.id}`;
    const barcodeSvg = generateBarcodeSvg(invNum);

    const billing = order.billing_address || {};
    const customerName = `${billing.first_name || ""} ${billing.last_name || ""}`.trim();
    const customerCompany = billing.company || "";
    const streetParts = [billing.street_1, billing.street_2].filter(Boolean);
    const customerStreet = streetParts.join(", ");
    const cityParts = [billing.city, billing.state, billing.zip].filter(Boolean);
    const customerCityState = cityParts.join(", ");
    const custEmail = billing.email || "";
    const custPhone = billing.phone || "";

    const companyAddr = (settings.company_address || "")
      .split("\n")
      .map(escHtml)
      .join("<br>");

    const logoHtml = settings.logo_base64
      ? `<img src="${settings.logo_base64}" alt="Logo" style="max-height:75px;max-width:180px;object-fit:contain" />`
      : "";

    const orderDate = order.date_created ? timeFmt.dateLong(order.date_created) : "";

    const itemsRows = buildItemsRows(products);
    const totalItems = products.reduce(
      (sum: number, p: any) => sum + (Number(p.quantity) || 0),
      0
    );

    const subtotal = fmt(order.subtotal_ex_tax ?? order.subtotal_inc_tax);
    const discount = fmt(order.discount_amount);
    const tax = fmt(order.total_tax);
    const total = fmt(order.total_ex_tax ?? order.total_inc_tax);
    const storeCreditAmt = parseFloat(order.store_credit_amount ?? "0");
    const storeCreditRow = storeCreditAmt > 0
      ? `<tr class="store-credit-row"><td>Store Credit</td><td>-${fmt(storeCreditAmt)}</td></tr>`
      : "";
    const unpaidAmt = order.payment_status !== "paid" ? fmt(order.total_inc_tax) : "$0.00";
    const outstanding = order.payment_status !== "paid" ? fmt(order.total_inc_tax) : "$0.00";

    // Use the customer note (customer_message) — the note the agent typed in the
    // "Customer Note" field at checkout, not the internal staff note.
    const notesText = (order.customer_message || "").trim();
    const notesHtml = notesText
      ? `<div class="notes-section">Notes: ${escHtml(notesText)}</div>`
      : "";

    // Extract the original checkout agent from staff_notes ("Checkout by: {name}").
    // Falls back to the current viewer only if the field is absent (e.g. legacy orders).
    const rawStaffNotes: string = order.staff_notes || "";
    const checkoutLine = rawStaffNotes.split("\n").find((l: string) => l.startsWith("Checkout by: "));
    const servedBy = checkoutLine
      ? checkoutLine.replace(/^Checkout by:\s*/, "").trim()
      : ((currentUser as any)?.name || currentUser?.username || "Agent");
    const timestamp = timeFmt.timestamp(new Date());

    const vars: Record<string, string> = {
      company_name: escHtml(settings.company_name || ""),
      logo_html: logoHtml,
      customer_name: escHtml(customerName),
      customer_company: escHtml(customerCompany),
      customer_street: escHtml(customerStreet),
      customer_city_state: escHtml(customerCityState),
      customer_email: escHtml(custEmail),
      customer_phone: escHtml(custPhone),
      company_address: companyAddr,
      invoice_number: invNum,
      order_date: orderDate,
      items_rows: itemsRows,
      subtotal,
      discount,
      tax,
      total,
      store_credit_row: storeCreditRow,
      unpaid: unpaidAmt,
      outstanding,
      total_items: String(totalItems),
      notes_html: notesHtml,
      barcode_svg: barcodeSvg,
      served_by: escHtml(servedBy),
      timestamp,
      terms: escHtml(settings.terms || ""),
    };

    return substituteVars(settings.html_template, vars);
  }

  function handlePrint() {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    } else {
      window.print();
    }
  }

  async function generatePdfBase64(): Promise<string> {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) throw new Error("Invoice not ready");
    const body = iframe.contentDocument.body;
    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    // A4 width = 210mm; add 10mm margin each side → 190mm content
    const A4_W = 210;
    const A4_H = 297;
    const MARGIN = 10;
    const contentW = A4_W - MARGIN * 2;
    const mmPerPx = contentW / canvas.width;
    const contentH = A4_H - MARGIN * 2;
    const pxPerPage = contentH / mmPerPx;
    const pages = Math.ceil(canvas.height / pxPerPage);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    for (let i = 0; i < pages; i++) {
      if (i > 0) pdf.addPage();
      const sy = Math.floor(i * pxPerPage);
      const sh = Math.min(Math.ceil(pxPerPage), canvas.height - sy);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sh;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      const pageImg = pageCanvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(pageImg, "JPEG", MARGIN, MARGIN, contentW, sh * mmPerPx);
    }
    return pdf.output("datauristring");
  }

  async function handleSendEmail() {
    if (!emailTo.trim()) {
      toast({
        title: "Email required",
        description: "Please enter a recipient email address.",
        variant: "destructive",
      });
      return;
    }
    setIsSending(true);
    try {
      toast({ title: "Generating PDF…", description: "Please wait a moment." });
      const pdfDataUri = await generatePdfBase64();
      await api.sendInvoiceEmail({
        to: emailTo.trim(),
        subject: `Invoice ${invoiceNumber}`,
        pdf_base64: pdfDataUri,
      });
      toast({
        title: "Email sent",
        description: `Invoice sent to ${emailTo.trim()}`,
      });
      setEmailOpen(false);
    } catch (e: any) {
      toast({ title: "Email failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="h-full bg-slate-100 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div
        className="bg-slate-800 text-white flex items-center gap-3 px-4 py-2.5 shrink-0 no-print"
        style={{ printColorAdjust: "exact" } as any}
      >
        <Printer className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="text-sm font-semibold flex-1 truncate">
          {invoiceNumber ? `Invoice ${invoiceNumber}` : "Invoice Viewer"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-slate-600 bg-slate-700 hover:bg-slate-600 text-white"
          onClick={handlePrint}
          disabled={!invoiceHtml}
          data-testid="btn-print-invoice"
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print / Save PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-slate-600 bg-slate-700 hover:bg-slate-600 text-white"
          onClick={() => setEmailOpen(true)}
          disabled={!invoiceHtml}
          data-testid="btn-email-invoice"
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
        </Button>
        <button
          className="ml-1 text-slate-400 hover:text-white transition-colors"
          onClick={() => window.close()}
          title="Close"
          data-testid="btn-close-invoice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-start justify-center p-6 bg-slate-100 overflow-auto">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm">Loading invoice…</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-red-500">
            <AlertCircle className="h-8 w-8 mb-3" />
            <p className="text-sm font-medium">Failed to load invoice</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">{error}</p>
          </div>
        )}

        {invoiceHtml && !isLoading && (
          <iframe
            ref={iframeRef}
            srcDoc={invoiceHtml}
            title="Invoice"
            className="bg-white shadow-xl rounded"
            style={{ width: "850px", minHeight: "1100px", border: "none", display: "block" }}
            onLoad={() => {
              if (iframeRef.current?.contentDocument?.body) {
                const h = iframeRef.current.contentDocument.body.scrollHeight;
                iframeRef.current.style.height = `${Math.max(1100, h + 60)}px`;
              }
            }}
            data-testid="iframe-invoice"
          />
        )}
      </div>

      {/* Email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-email-to">Recipient Email</Label>
              <Input
                id="invoice-email-to"
                type="email"
                placeholder="customer@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                data-testid="input-invoice-email-to"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                readOnly
                value={`Invoice ${invoiceNumber}`}
                className="bg-slate-50 text-slate-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={isSending} data-testid="btn-send-email">
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
