import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Save, Eye, RotateCcw, Upload, Trash2, ImageIcon,
  Building2, Mail, Code2, Server,
} from "lucide-react";

export default function InvoiceSettingsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [resettingTemplate, setResettingTemplate] = useState(false);

  // Company info
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");

  // Logo
  const [logoBase64, setLogoBase64] = useState("");
  const [logoPreview, setLogoPreview] = useState("");

  // Terms
  const [terms, setTerms] = useState("");

  // SMTP
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");

  // Template
  const [htmlTemplate, setHtmlTemplate] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const s = await api.getInvoiceSettings();
      setCompanyName(s.company_name || "");
      setCompanyAddress(s.company_address || "");
      setCompanyPhone(s.company_phone || "");
      setCompanyEmail(s.company_email || "");
      setLogoBase64(s.logo_base64 || "");
      setLogoPreview(s.logo_base64 || "");
      setTerms(s.terms || "");
      setSmtpHost(s.smtp_host || "");
      setSmtpPort(String(s.smtp_port || 587));
      setSmtpUser(s.smtp_user || "");
      setSmtpPass(s.smtp_pass || "");
      setSmtpFrom(s.smtp_from || "");
      setHtmlTemplate(s.html_template || "");
    } catch (e: any) {
      toast({ title: "Failed to load settings", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveInvoiceSettings({
        company_name: companyName,
        company_address: companyAddress,
        company_phone: companyPhone,
        company_email: companyEmail,
        logo_base64: logoBase64,
        terms,
        html_template: htmlTemplate,
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort) || 587,
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        smtp_from: smtpFrom,
      });
      toast({ title: "Invoice settings saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose an image under 2 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      setLogoBase64(b64);
      setLogoPreview(b64);
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setLogoBase64("");
    setLogoPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleResetTemplate() {
    setResettingTemplate(true);
    try {
      const defaultTemplate = await api.getDefaultInvoiceTemplate();
      setHtmlTemplate(defaultTemplate);
      toast({ title: "Template reset to default" });
    } catch (e: any) {
      toast({ title: "Failed to reset template", description: e.message, variant: "destructive" });
    } finally {
      setResettingTemplate(false);
    }
  }

  function handlePreview() {
    // Build a sample preview with dummy data
    const sampleVars: Record<string, string> = {
      company_name: companyName || "MA Distro, Inc.",
      logo_html: logoBase64
        ? `<img src="${logoBase64}" alt="Logo" style="max-height:75px;max-width:180px;object-fit:contain" />`
        : "",
      customer_name: "John Smith",
      customer_company: "Sample Company",
      customer_street: "123 Main Street",
      customer_city_state: "Durham, NC, 27703",
      customer_email: "john@example.com",
      customer_phone: "555-1234",
      company_address: (companyAddress || "").split("\n").join("<br>"),
      invoice_number: "CNC0007573",
      order_date: new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
      items_rows: `
        <tr>
          <td>
            <div class="item-name"><strong>Sample Product A (Variant Blue)</strong></div>
            <div class="item-meta">SKU: SAMPLE-001 , Barcode: 123456789012</div>
          </td>
          <td>2</td>
          <td>$45.00</td>
          <td><span class="price-original">$119.98</span><span class="price-sale">$90.00</span></td>
        </tr>
        <tr>
          <td>
            <div class="item-name"><strong>Sample Product B (No Discount)</strong></div>
            <div class="item-meta">SKU: SAMPLE-002</div>
          </td>
          <td>1</td>
          <td>$29.99</td>
          <td>$29.99</td>
        </tr>`,
      subtotal: "$119.99",
      discount: "$0.00",
      tax: "$0.00",
      total: "$119.99",
      unpaid: "$119.99",
      outstanding: "$0.00",
      total_items: "3",
      notes_html: `<div class="notes-section">Notes: prices are adjusted / sample preview</div>`,
      barcode_svg: `<svg width="200" height="55"><rect width="200" height="55" fill="#eee" rx="4"/><text x="100" y="33" text-anchor="middle" font-size="11" fill="#aaa">Barcode Preview</text></svg>`,
      served_by: "Admin",
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) + ", " + new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
      terms: terms || "",
    };
    let html = htmlTemplate;
    for (const [key, value] of Object.entries(sampleVars)) {
      html = html.split(`{{${key}}}`).join(value);
    }
    setPreviewHtml(html);
    setPreviewOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Invoice Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Customize your invoice template, company info, logo, and email settings.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} data-testid="btn-save-invoice-settings">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      {/* ── Company Info ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" /> Company Information
          </CardTitle>
          <CardDescription>Displayed in the invoice header and address block.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-company-name">Company Name</Label>
              <Input
                id="inv-company-name"
                placeholder="MA Distro, Inc."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                data-testid="input-inv-company-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-company-phone">Company Phone</Label>
              <Input
                id="inv-company-phone"
                placeholder="+1 (555) 000-0000"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                data-testid="input-inv-company-phone"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-company-email">Company Email</Label>
            <Input
              id="inv-company-email"
              type="email"
              placeholder="info@company.com"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              data-testid="input-inv-company-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-company-address">
              Company Address <span className="text-xs text-slate-400">(shown top-right on invoice)</span>
            </Label>
            <textarea
              id="inv-company-address"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder={"1000 Parliament Ct Ste. #300,\nDurham, NC, 27703"}
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              data-testid="textarea-inv-company-address"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-terms">
              Terms & Footer Text <span className="text-xs text-slate-400">(shown in dark footer bar)</span>
            </Label>
            <textarea
              id="inv-terms"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="By purchasing products from MID Atlantic Distribution, you acknowledge..."
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              data-testid="textarea-inv-terms"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Logo ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-slate-500" /> Company Logo
          </CardTitle>
          <CardDescription>Displayed in the top-right of the invoice. Recommended: transparent PNG, max 2 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            {logoPreview ? (
              <div className="flex-shrink-0 w-40 h-24 border rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="max-w-full max-h-full object-contain"
                  data-testid="img-inv-logo-preview"
                />
              </div>
            ) : (
              <div className="flex-shrink-0 w-40 h-24 border-2 border-dashed rounded-lg bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-1">
                <ImageIcon className="h-7 w-7" />
                <span className="text-xs">No logo</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                data-testid="btn-inv-upload-logo"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Logo
              </Button>
              {logoPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveLogo}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  data-testid="btn-inv-remove-logo"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
                data-testid="input-inv-logo-file"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Email / SMTP ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-500" /> Email / SMTP Settings
          </CardTitle>
          <CardDescription>Configure SMTP to enable the "Email Invoice" feature.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                placeholder="smtp.gmail.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                data-testid="input-smtp-host"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">SMTP Port</Label>
              <Input
                id="smtp-port"
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                data-testid="input-smtp-port"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-user">SMTP Username</Label>
              <Input
                id="smtp-user"
                placeholder="user@gmail.com"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                data-testid="input-smtp-user"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-pass">SMTP Password</Label>
              <Input
                id="smtp-pass"
                type="password"
                placeholder="••••••••"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                data-testid="input-smtp-pass"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from">From Address</Label>
            <Input
              id="smtp-from"
              type="email"
              placeholder="invoices@company.com"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              data-testid="input-smtp-from"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── HTML Template ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="h-4 w-4 text-slate-500" /> HTML/CSS Invoice Template
          </CardTitle>
          <CardDescription>
            Edit the full HTML and CSS for the invoice. Use{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">{"{{variable}}"}</code> placeholders for dynamic data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-slate-50 rounded-lg border p-3 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700 mb-1.5">Available variables:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 font-mono text-[11px]">
              {[
                "{{company_name}}", "{{logo_html}}", "{{company_address}}",
                "{{customer_name}}", "{{customer_company}}", "{{customer_street}}",
                "{{customer_city_state}}", "{{customer_email}}", "{{customer_phone}}",
                "{{invoice_number}}", "{{order_date}}", "{{items_rows}}",
                "{{subtotal}}", "{{discount}}", "{{tax}}", "{{total}}", "{{unpaid}}",
                "{{outstanding}}", "{{total_items}}", "{{notes_html}}",
                "{{barcode_svg}}", "{{served_by}}", "{{timestamp}}", "{{terms}}",
              ].map((v) => (
                <span key={v} className="text-blue-600">{v}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={!htmlTemplate}
              data-testid="btn-preview-template"
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview with Sample Data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetTemplate}
              disabled={resettingTemplate}
              data-testid="btn-reset-template"
            >
              {resettingTemplate ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Reset to Default
            </Button>
          </div>
          <textarea
            className="w-full h-[500px] rounded-md border border-input bg-slate-950 text-slate-100 px-4 py-3 text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            value={htmlTemplate}
            onChange={(e) => setHtmlTemplate(e.target.value)}
            spellCheck={false}
            data-testid="textarea-html-template"
          />
        </CardContent>
      </Card>

      {/* Bottom save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg" data-testid="btn-save-invoice-settings-bottom">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save All Settings
        </Button>
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Invoice Preview (Sample Data)
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-slate-100 p-4 flex justify-center">
            <iframe
              ref={previewIframeRef}
              srcDoc={previewHtml}
              title="Invoice Preview"
              className="bg-white shadow-xl rounded"
              style={{ width: "850px", minHeight: "1100px", border: "none" }}
              onLoad={() => {
                if (previewIframeRef.current?.contentDocument?.body) {
                  const h = previewIframeRef.current.contentDocument.body.scrollHeight;
                  previewIframeRef.current.style.height = `${Math.max(1100, h + 60)}px`;
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
