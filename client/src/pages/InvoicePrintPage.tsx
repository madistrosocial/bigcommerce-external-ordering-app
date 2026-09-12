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
import * as api from "@/lib/api";
import { buildInvoiceHtml, generatePdfBase64 } from "@/lib/invoice-renderer";

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
        api.getInvoiceRenderSettings(),
      ]);

      const invNum = `CNC${orderData.order.id}`;
      const html = buildInvoiceHtml(orderData, settings, timeFmt, {
        referenceNumber: invNum,
        servedByFallback: (currentUser as any)?.name || currentUser?.username || "Agent",
      });
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

  function handlePrint() {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    } else {
      window.print();
    }
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
      const pdfDataUri = await generatePdfBase64(iframeRef.current);
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
