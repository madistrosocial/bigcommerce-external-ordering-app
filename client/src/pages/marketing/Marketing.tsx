import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import {
  Activity, ArrowLeft, BarChart3, CalendarClock, Check, ChevronRight, Clock3,
  FileText, Filter, Mail, Megaphone, MoreHorizontal, Plus, RefreshCw, Search,
  Eye, Monitor, Send, Settings as SettingsIcon, Smartphone, Tablet, Target,
  Trash2, Users, X, Loader2, Package, Pencil, ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RichTextEditor from "@/components/editor/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  createMarketingAudience, createMarketingCampaign, deleteMarketingAudience,
  deleteMarketingCampaign, getMarketingAudience, getMarketingAudienceCustomers,
  getMarketingAudiences, getMarketingCampaign, getMarketingCampaigns,
  getMarketingDashboard, updateMarketingAudience, updateMarketingCampaign,
  updateMarketingCampaignStatus, sendMarketingTest, sendMarketingCampaign,
  pauseMarketingCampaign, duplicateMarketingCampaign, getMarketingRecipients, scheduleMarketingCampaign,
  getMarketingContacts, importMarketingContacts, getMarketingAudienceMembers, getMarketingAudiencePreview,
   getMarketingTemplates, getMarketingCustomerGroups, searchMarketingProducts,
    getMarketingSenderSettings, saveMarketingSenderSettings,
    getMarketingDeliverySettings, saveMarketingDeliverySettings,
} from "@/lib/api";
import {
  DEFAULT_MARKETING_PRODUCT_DISPLAY_OPTIONS,
  MarketingProductDisplayOptions,
  MarketingProductSnapshot,
  normalizeMarketingProductDisplayOptions,
  renderMarketingProductBlock,
  renderMarketingProductGrid,
} from "@shared/marketing-products";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", ready: "Ready", scheduled: "Scheduled", sending: "Sending",
  sent: "Sent", paused: "Paused", failed: "Failed",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", ready: "bg-blue-100 text-blue-700",
  scheduled: "bg-violet-100 text-violet-700", sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700", paused: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
};

function asProductSnapshot(product: any): MarketingProductSnapshot {
  return {
    id: Number(product.id ?? product.bigcommerce_id),
    bigcommerce_id: Number(product.bigcommerce_id ?? product.id),
    name: String(product.name ?? ""),
    sku: String(product.sku ?? ""),
    price: String(product.price ?? ""),
    image: String(product.image ?? ""),
    stock_level: Number(product.stock_level ?? 0),
    product_url: String(product.product_url ?? ""),
  };
}

function replaceMarketingProductMarkup(
  content: string,
  products: MarketingProductSnapshot[],
  options: MarketingProductDisplayOptions,
): string {
  const byId = new Map(products.map(product => [product.id, product]));
  let next = content.replace(
    /<!-- marketing-product-block:(\d+) -->[\s\S]*?<!-- \/marketing-product-block:\1 -->/g,
    (_match, rawId) => {
      const product = byId.get(Number(rawId));
      return product ? renderMarketingProductBlock(product, options) : "";
    },
  );
  next = next.replace(
    /<!-- marketing-product-grid -->[\s\S]*?<!-- \/marketing-product-grid -->/g,
    () => products.length ? renderMarketingProductGrid(products, options) : "",
  );
  return next;
}

function preserveMarketingProductMarkup(editorContent: string, previousContent: string): string {
  const existingBlocks = previousContent.match(
    /<!-- marketing-product-(?:block:\d+|grid) -->[\s\S]*?<!-- \/marketing-product-(?:block:\d+|grid) -->/g,
  ) ?? [];
  return existingBlocks.reduce(
    (content, block) => content.includes(block) ? content : `${content}${content ? "<p></p>" : ""}${block}`,
    editorContent,
  );
}

function upsertMarketingProductMarkup(content: string, markup: string, marker: RegExp): string {
  return marker.test(content)
    ? content.replace(marker, markup)
    : `${content}${content ? "<p></p>" : ""}${markup}`;
}

const PRODUCT_DISPLAY_FIELDS: Array<[keyof MarketingProductDisplayOptions, string, boolean]> = [
  ["showProductImages", "Show product images", true],
  ["showProductTitles", "Show product titles", true],
  ["showProductPrices", "Show prices", false],
  ["showShopNowButton", "Show Shop Now button", true],
];

export function PageShell({ children, title, subtitle, action }: { children: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="marketing-page min-h-full bg-slate-50">
      <div className="border-b bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">Marketing</p><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
          {action}
        </div>
      </div>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

function StatCard({ label, value, caption, icon: Icon, tone = "blue" }: { label: string; value: string | number; caption?: string; icon: React.ElementType; tone?: string }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`rounded-lg p-2 ${tone === "violet" ? "bg-violet-50 text-violet-600" : tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>{caption && <p className="mt-1 text-xs text-slate-400">{caption}</p>}</div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>{STATUS_LABELS[status] || status}</span>;
}

export function MarketingDashboard() {
  const { data, isLoading, refetch } = useQuery<any>({ queryKey: ["marketing-dashboard"], queryFn: getMarketingDashboard });
  const { data: delivery } = useQuery<any>({ queryKey: ["marketing-delivery-settings"], queryFn: getMarketingDeliverySettings });
  const [, setLocation] = useLocation();
  const { hasPermission } = usePermissions();
  if (isLoading) return <PageShell title="Marketing" subtitle="Plan and measure customer communications"><div className="py-16 text-center text-sm text-slate-400">Loading marketing data…</div></PageShell>;
  const d = data || {};
  return <PageShell title="Marketing" subtitle="Plan and measure customer communications" action={<div className="flex flex-wrap justify-end gap-2">{hasPermission("marketing", "send") && <Button variant="outline" onClick={() => setLocation("/marketing/settings")}><SettingsIcon className="mr-2 h-4 w-4" /> Settings</Button>}{hasPermission("marketing", "create") && <Button onClick={() => setLocation("/marketing/campaigns/new")}><Plus className="mr-2 h-4 w-4" /> New campaign</Button>}</div>}>
    <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-900">Performance snapshot</h2><p className="text-sm text-slate-500">Only recorded campaign activity is shown here.</p></div><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total campaigns" value={d.totalCampaigns ?? 0} caption={`${d.draftCampaigns ?? 0} drafts`} icon={Megaphone} />
      <StatCard label="Scheduled" value={d.scheduledCampaigns ?? 0} caption={`${d.activeCampaigns ?? 0} active`} icon={CalendarClock} tone="violet" />
      <StatCard label="Recipients reached" value={d.sentRecipients ?? 0} caption={`${d.totalRecipients ?? 0} planned`} icon={Send} tone="green" />
       <StatCard label="Open rate" value="Not available" caption={delivery?.provider === "zoho" ? "Awaiting recipient events" : "SMTP does not provide open tracking"} icon={BarChart3} />
    </div>
     <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
       <section className="rounded-xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold text-slate-900">Recent campaigns</h2><p className="text-xs text-slate-500">Latest changes across your campaigns</p></div><Button variant="ghost" size="sm" onClick={() => setLocation("/marketing/campaigns")}>View all <ChevronRight className="ml-1 h-4 w-4" /></Button></div><div className="divide-y">{(d.recentCampaigns || []).length ? d.recentCampaigns.map((c: any) => <button key={c.id} onClick={() => setLocation(`/marketing/campaigns/${c.id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Mail className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{c.name}</span><span className="block text-xs text-slate-400">{c.creator_name || "Unknown creator"} · {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ""}</span></span><StatusBadge status={c.status} /></button>) : <EmptyState icon={Megaphone} text="No campaigns yet" action={hasPermission("marketing", "create") ? "Create your first campaign" : undefined} onClick={hasPermission("marketing", "create") ? () => setLocation("/marketing/campaigns/new") : undefined} />}</div></section>
      <section className="rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Activity</h2><p className="text-xs text-slate-500">A real audit trail of marketing changes</p></div><div className="divide-y">{(d.recentActivity || []).length ? d.recentActivity.map((a: any) => <div key={a.id} className="flex gap-3 px-5 py-4"><span className="mt-0.5 rounded-full bg-slate-100 p-1.5 text-slate-500"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0"><p className="text-sm text-slate-700"><strong>{a.user_name || "System"}</strong> {a.action.replaceAll("_", " ")} <strong>{a.campaign_name || "campaign"}</strong></p><p className="mt-1 text-xs text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</p></div></div>) : <EmptyState icon={Clock3} text="No activity recorded" />}</div></section>
    </div>
       <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900"><div className="flex gap-3"><Target className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><p className="font-semibold">{delivery?.provider === "zoho" ? "Zoho campaign measurement" : "SMTP measurement boundary"}</p><p className="mt-1 text-blue-800/80">{delivery?.provider === "zoho" ? "Zoho delivery, open, and click events are recorded through the configured webhook. Product links continue to use the app’s signed click tracking." : "Sent and failed counts are recorded from SMTP responses. Delivery and opens are unavailable; product clicks are recorded through tracked campaign links."}</p></div></div></div>
  </PageShell>;
}

const MARKETING_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MarketingPreviewDevice = "desktop" | "tablet" | "mobile";

const MARKETING_PREVIEW_DEVICES: Array<{
  value: MarketingPreviewDevice;
  label: string;
  width: number;
  icon: React.ElementType;
}> = [
  { value: "desktop", label: "Desktop", width: 680, icon: Monitor },
  { value: "tablet", label: "Tablet", width: 520, icon: Tablet },
  { value: "mobile", label: "Mobile", width: 360, icon: Smartphone },
];

function escapeMarketingPreviewHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarketingPreviewTemplate(content: string): string {
  const values: Record<string, string> = {
    first_name: "Alex",
    last_name: "Morgan",
    full_name: "Alex Morgan",
    customer_name: "Alex Morgan",
    company: "Morgan Market",
    email: "alex@example.com",
    customer_group: "Retail",
    customer_type: "Customer",
    account_health: "Active",
    lifetime_orders: "12",
    lifetime_revenue: "$4,280.00",
    store_credit_balance: "$125.00",
    last_order_date: "August 28, 2026",
    unsubscribe_url: "#",
  };
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{([a-zA-Z0-9_]+)\}/g, (_match, doubleKey, singleKey) => {
    return escapeMarketingPreviewHtml(values[doubleKey || singleKey] ?? "");
  });
}

function MarketingEmailPreview({
  open,
  onOpenChange,
  subject,
  previewText,
  sender,
  content,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  previewText: string;
  sender: string;
  content: string;
}) {
  const [device, setDevice] = useState<MarketingPreviewDevice>("desktop");
  const selectedDevice = MARKETING_PREVIEW_DEVICES.find(option => option.value === device) ?? MARKETING_PREVIEW_DEVICES[0];
  const previewDocument = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#f1f5f9;color:#1e293b;font-family:Arial,Helvetica,sans-serif}
    body{padding:20px 12px}.email-shell{width:100%;max-width:680px;margin:0 auto;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.12)}
    .email-meta{padding:16px 20px;border-bottom:1px solid #e2e8f0;background:#fff;font-size:12px;line-height:18px;color:#64748b}
    .email-meta strong{color:#334155;font-weight:600}.email-content{padding:20px;overflow-wrap:anywhere}
    .email-content img{max-width:100%;height:auto}.email-content table{max-width:100%}
    a{color:#2563eb}
  </style></head><body><div class="email-shell"><div class="email-meta"><div><strong>From:</strong> ${escapeMarketingPreviewHtml(sender || "Not configured")}</div><div><strong>To:</strong> Alex Morgan &lt;alex@example.com&gt;</div><div><strong>Subject:</strong> ${escapeMarketingPreviewHtml(subject || "Your campaign subject")}</div>${previewText ? `<div><strong>Preview:</strong> ${escapeMarketingPreviewHtml(previewText)}</div>` : ""}</div><div class="email-content">${renderMarketingPreviewTemplate(content || "<p>Your campaign message will appear here.</p>")}</div></div></body></html>`;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[min(90vh,760px)] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden p-0">
      <DialogHeader className="border-b px-5 py-4 pr-12">
        <DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4 text-blue-600" /> Email preview</DialogTitle>
        <DialogDescription>See how this campaign renders at common desktop, tablet, and mobile email widths. Unsaved editor changes are included.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-5 py-3">
        <div className="inline-flex rounded-lg border bg-white p-1" role="tablist" aria-label="Preview device">
          {MARKETING_PREVIEW_DEVICES.map(option => {
            const Icon = option.icon;
            return <button key={option.value} type="button" role="tab" aria-selected={device === option.value} onClick={() => setDevice(option.value)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${device === option.value ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="h-3.5 w-3.5" /> {option.label}</button>;
          })}
        </div>
        <span className="text-xs text-slate-500">{selectedDevice.width}px email width</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-4 sm:p-6">
        <div className="mx-auto flex min-h-full items-start justify-center">
          <iframe title={`${selectedDevice.label} campaign email preview`} srcDoc={previewDocument} className="shrink-0 rounded-md border border-slate-300 bg-white shadow-lg" style={{ width: `${selectedDevice.width}px`, height: "560px", maxWidth: "100%" }} sandbox="" />
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

export function MarketingSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ emails: string[]; defaultEmail: string }>({
    queryKey: ["marketing-sender-settings"],
    queryFn: getMarketingSenderSettings,
  });
  const { data: deliveryData } = useQuery<any>({
    queryKey: ["marketing-delivery-settings"],
    queryFn: getMarketingDeliverySettings,
  });
  const [emails, setEmails] = useState<string[]>([]);
  const [defaultEmail, setDefaultEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [provider, setProvider] = useState<"smtp" | "zoho">("smtp");
  const [zohoApiBase, setZohoApiBase] = useState("https://campaigns.zoho.com/emailapi/v2");
  const [replyTo, setReplyTo] = useState("");

  useEffect(() => {
    if (!data) return;
    setEmails(Array.isArray(data.emails) ? data.emails : []);
    setDefaultEmail(data.defaultEmail || "");
  }, [data]);
  useEffect(() => {
    if (!deliveryData) return;
    setProvider(deliveryData.provider === "zoho" ? "zoho" : "smtp");
    setZohoApiBase(deliveryData.zohoApiBase || "https://campaigns.zoho.com/emailapi/v2");
    setReplyTo(deliveryData.replyTo || "");
  }, [deliveryData]);

  const save = useMutation({
    mutationFn: () => saveMarketingSenderSettings({ emails, defaultEmail }),
    onSuccess: (saved: { emails: string[]; defaultEmail: string }) => {
      setEmails(saved.emails);
      setDefaultEmail(saved.defaultEmail);
      qc.invalidateQueries({ queryKey: ["marketing-sender-settings"] });
      toast({ title: "Marketing sender settings saved" });
    },
    onError: (error: any) => toast({ title: "Unable to save sender settings", description: error.message, variant: "destructive" }),
  });
  const saveDelivery = useMutation({
    mutationFn: () => saveMarketingDeliverySettings({ provider, zohoApiBase, replyTo }),
    onSuccess: (saved: any) => {
      setProvider(saved.provider === "zoho" ? "zoho" : "smtp");
      setZohoApiBase(saved.zohoApiBase || zohoApiBase);
      setReplyTo(saved.replyTo || "");
      qc.invalidateQueries({ queryKey: ["marketing-delivery-settings"] });
      toast({ title: "Marketing delivery settings saved" });
    },
    onError: (error: any) => toast({ title: "Unable to save delivery settings", description: error.message, variant: "destructive" }),
  });

  const addEmail = () => {
    const email = newEmail.trim();
    if (!MARKETING_EMAIL_PATTERN.test(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (emails.some(existing => existing.toLowerCase() === email.toLowerCase())) {
      toast({ title: "That sender email is already added", variant: "destructive" });
      return;
    }
    setEmails(old => [...old, email]);
    if (!defaultEmail) setDefaultEmail(email);
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    const next = emails.filter(candidate => candidate !== email);
    setEmails(next);
    if (defaultEmail.toLowerCase() === email.toLowerCase()) setDefaultEmail(next[0] || "");
  };

  return <PageShell title="Marketing" subtitle="Choose the sender identity and delivery provider for campaigns" action={<Button variant="outline" onClick={() => setLocation("/marketing")}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketing</Button>}>
    <section className="max-w-3xl rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-blue-50 p-2 text-blue-600"><SettingsIcon className="h-5 w-5" /></span>
         <div><h2 className="font-semibold text-slate-900">Campaign sender emails</h2><p className="mt-1 text-sm text-slate-500">Add the addresses your configured delivery provider is authorized to send from, then choose the default for new campaigns.</p></div>
      </div>
      {isLoading ? <div className="py-10 text-center text-sm text-slate-400">Loading sender settings…</div> : <div className="mt-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addEmail(); } }} placeholder="marketing@midatlanticdistribution.com" className="flex-1" />
          <Button type="button" variant="outline" onClick={addEmail}><Plus className="mr-2 h-4 w-4" /> Add email</Button>
        </div>
        <div className="divide-y rounded-lg border">
          {emails.length ? emails.map(email => <div key={email} className="flex items-center gap-3 px-3 py-3">
            <input type="radio" name="marketing-default-sender" checked={defaultEmail.toLowerCase() === email.toLowerCase()} onChange={() => setDefaultEmail(email)} aria-label={`Make ${email} the default sender`} />
            <Mail className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{email}</span>
            {defaultEmail.toLowerCase() === email.toLowerCase() && <span className="text-xs font-medium text-blue-600">Default</span>}
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => removeEmail(email)} aria-label={`Remove ${email}`}><Trash2 className="h-4 w-4" /></Button>
          </div>) : <p className="px-3 py-5 text-sm text-slate-400">No campaign sender emails configured yet.</p>}
        </div>
        <p className="text-xs text-slate-500">The campaign dropdown uses the default when no sender is selected. Changing this does not change your SMTP login credentials, and your mail provider must authorize each From address.</p>
        <div className="flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending || !emails.length || !defaultEmail}>{save.isPending ? "Saving…" : "Save sender settings"}</Button></div>
      </div>}
    </section>
    <section className="max-w-3xl rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Send className="h-5 w-5" /></span>
        <div><h2 className="font-semibold text-slate-900">Campaign delivery provider</h2><p className="mt-1 text-sm text-slate-500">Choose how marketing campaigns are transmitted. Invoice and automation email delivery remains SMTP-based.</p></div>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">Provider<select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={provider} onChange={event => setProvider(event.target.value === "zoho" ? "zoho" : "smtp")}><option value="smtp">Existing SMTP</option><option value="zoho">Zoho Email API v2</option></select></label>
        {provider === "zoho" ? <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50/50 p-4">
          <p className={`text-sm font-medium ${deliveryData?.zohoApiKeyConfigured ? "text-emerald-700" : "text-amber-700"}`}>{deliveryData?.zohoApiKeyConfigured ? "Zoho API key is configured." : "Zoho API key is not configured."}</p>
          <p className="text-xs text-slate-600">Store ZOHO_EMAIL_API_KEY in Replit Secrets. The app never accepts or displays that key. Zoho also requires a verified sending domain and DKIM.</p>
          <label className="block text-sm font-medium text-slate-700">Zoho API base URL<Input className="mt-1.5" value={zohoApiBase} onChange={event => setZohoApiBase(event.target.value)} placeholder="https://campaigns.zoho.com/emailapi/v2" /><span className="mt-1 block text-xs font-normal text-slate-400">Use the Zoho data center that owns the verified sending domain.</span></label>
        </div> : <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">Campaigns will use the existing invoice SMTP configuration. To avoid mailbox Sent-folder copies, select Zoho after configuring its API key and verified sending domain.</div>}
        <label className="block text-sm font-medium text-slate-700">Reply-To address <Input className="mt-1.5" type="email" value={replyTo} onChange={event => setReplyTo(event.target.value)} placeholder="replies@midatlanticdistribution.com" /><span className="mt-1 block text-xs font-normal text-slate-400">Optional. This address receives replies; it is separate from the From address.</span></label>
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Use a campaign’s Test email action after saving to verify the selected provider.</p><Button onClick={() => saveDelivery.mutate()} disabled={saveDelivery.isPending || (provider === "zoho" && !deliveryData?.zohoApiKeyConfigured)}>{saveDelivery.isPending ? "Saving…" : "Save delivery settings"}</Button></div>
      </div>
    </section>
  </PageShell>;
}

function EmptyState({ icon: Icon, text, action, onClick }: { icon: React.ElementType; text: string; action?: string; onClick?: () => void }) {
  return <div className="flex flex-col items-center justify-center px-5 py-12 text-center"><Icon className="mb-3 h-9 w-9 text-slate-300" /><p className="text-sm text-slate-500">{text}</p>{action && <Button variant="link" className="mt-1" onClick={onClick}>{action}</Button>}</div>;
}

const MARKETING_ACCOUNT_TYPE_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "internal", label: "Internal" },
] as const;

const MARKETING_US_STATE_OPTIONS = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

function DynamicFilterExtensions({ filters, setFilter }: { filters: Record<string, any>; setFilter: (key: string, value: any) => void }) {
  const selectedAccountTypes = Array.isArray(filters.accountTypes)
    ? filters.accountTypes
    : filters.accountType
      ? [filters.accountType]
      : [];

  const toggleAccountType = (value: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedAccountTypes, value]))
      : selectedAccountTypes.filter((item: string) => item !== value);
    setFilter("accountTypes", next);
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold text-slate-900">Marketing eligibility filters</h2>
        <p className="mt-1 text-xs text-slate-500">Use CRM account classification and email preference to narrow this dynamic audience.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">CRM account type</legend>
          <p className="mb-2 text-xs text-slate-400">Select one or more account types.</p>
          <div className="space-y-2">
            {MARKETING_ACCOUNT_TYPE_OPTIONS.map(option => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedAccountTypes.includes(option.value)}
                  onChange={event => toggleAccountType(option.value, event.target.checked)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm font-medium text-slate-700">
          Marketing preference
          <select
            className="mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm"
            value={filters.marketingPreference || ""}
            onChange={event => setFilter("marketingPreference", event.target.value)}
          >
            <option value="">Any preference</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-400">Customers without a saved preference are treated as subscribed. Unsubscribed contacts remain excluded when a campaign sends.</span>
        </label>
      </div>
    </section>
  );
}

export function MarketingCampaigns() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { hasPermission } = usePermissions();
  const { data, isLoading } = useQuery<any>({ queryKey: ["marketing-campaigns", search, status], queryFn: () => getMarketingCampaigns({ search, status }) });
  return <PageShell title="Campaigns" subtitle="Create, review, and manage customer campaigns" action={hasPermission("marketing", "create") ? <Button onClick={() => setLocation("/marketing/campaigns/new")}><Plus className="mr-2 h-4 w-4" /> New campaign</Button> : undefined}>
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)} /></div><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
     <div className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="hidden grid-cols-[1fr_130px_150px_110px_36px] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid"><span>Campaign</span><span>Audience</span><span>Updated</span><span>Status</span><span /></div>{isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading campaigns…</div> : data?.campaigns?.length ? data.campaigns.map((c: any) => <button key={c.id} onClick={() => setLocation(`/marketing/campaigns/${c.id}`)} className="grid w-full gap-2 border-b px-4 py-4 text-left last:border-0 hover:bg-slate-50 md:grid-cols-[1fr_130px_150px_110px_36px] md:items-center md:gap-4 md:px-5"><span className="min-w-0"><span className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800"><Mail className="h-4 w-4 shrink-0 text-blue-500" />{c.name}</span><span className="mt-1 block truncate pl-6 text-xs text-slate-400">{c.subject_line || "No subject line"}</span></span><span className="text-xs text-slate-500 md:truncate">{c.audience_name || (c.audience_type === "all_eligible" ? "All eligible customers" : c.audience_type.replaceAll("_", " "))}</span><span className="text-xs text-slate-500">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "—"}</span><span><StatusBadge status={c.status} /></span><ChevronRight className="hidden h-4 w-4 text-slate-300 md:block" /></button>) : <EmptyState icon={Megaphone} text={search ? "No campaigns match your search" : "No campaigns yet"} action={!search && hasPermission("marketing", "create") ? "Create your first campaign" : undefined} onClick={!search && hasPermission("marketing", "create") ? () => setLocation("/marketing/campaigns/new") : undefined} />}</div>
  </PageShell>;
}

function CampaignDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const { data: campaign, isLoading } = useQuery<any>({ queryKey: ["marketing-campaign", id], queryFn: () => getMarketingCampaign(id) });
  const { data: delivery } = useQuery<any>({ queryKey: ["marketing-delivery-settings"], queryFn: getMarketingDeliverySettings });
  const { data: recipientData } = useQuery<any>({ queryKey: ["marketing-recipients", id], queryFn: () => getMarketingRecipients(id), enabled: !!id, refetchInterval: campaign?.status === "sending" || campaign?.status === "queued" ? 5000 : false });
  const statusMutation = useMutation({ mutationFn: (status: string) => updateMarketingCampaignStatus(id, status), onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); }, onError: (e: any) => toast({ title: "Unable to update status", description: e.message, variant: "destructive" }) });
  const deleteMutation = useMutation({ mutationFn: () => deleteMarketingCampaign(id), onSuccess: () => { setLocation("/marketing/campaigns"); qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); } });
  const testSend = async () => {
    const email = window.prompt("Send a test email to:");
    if (!email) return;
    try { await sendMarketingTest(id, email); toast({ title: "Test email accepted by SMTP" }); qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); }
    catch (e: any) { toast({ title: "Test send failed", description: e.message, variant: "destructive" }); }
  };
  const sendNow = async () => {
    if (!window.confirm("Send this campaign to all currently eligible recipients? This cannot be undone.")) return;
    try { await sendMarketingCampaign(id); toast({ title: "Campaign queued", description: "The server will send it in the background." }); qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); }
    catch (e: any) { toast({ title: "Unable to queue campaign", description: e.message, variant: "destructive" }); }
  };
  if (isLoading) return <PageShell title="Campaign"><div className="py-16 text-center text-sm text-slate-400">Loading campaign…</div></PageShell>;
  if (!campaign) return <PageShell title="Campaign"><EmptyState icon={X} text="Campaign not found" /></PageShell>;
   const next = campaign.status === "draft" ? "ready" : campaign.status === "scheduled" ? "paused" : null;
  return <PageShell title={campaign.name} subtitle={campaign.internal_description || "Campaign details"} action={<div className="flex gap-2"><Button variant="outline" onClick={() => setLocation("/marketing/campaigns")}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>{hasPermission("marketing", "edit") && campaign.status !== "sent" && <Button onClick={() => setLocation(`/marketing/campaigns/${id}/edit`)}>Edit campaign</Button>}</div>}>
    <div className="flex flex-wrap items-center gap-3"><StatusBadge status={campaign.status} /><span className="text-sm text-slate-500">{campaign.subject_line || "No subject line"}</span><span className="ml-auto text-xs text-slate-400">Created by {campaign.creator_name || "Unknown"}</span></div>
     <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]"><div className="space-y-5">
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-900">Audience</h2><div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4"><Users className="h-5 w-5 text-blue-500" /><div><p className="text-sm font-medium text-slate-800">{campaign.audience_name || (campaign.audience_type === "all_eligible" ? "All eligible customers" : campaign.audience_type.replaceAll("_", " "))}</p><p className="text-xs text-slate-500">{campaign.recipient_count ?? campaign.audience_count ?? 0} planned recipients · {campaign.suppressed_count ?? 0} suppressed</p></div></div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Message preview</h2><span className="text-xs text-slate-400">{campaign.campaign_type}</span></div><div className="rounded-lg border bg-slate-50 p-4"><p className="mb-3 text-sm font-semibold text-slate-800">{campaign.subject_line || "No subject line"}</p><div className="prose prose-sm max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: campaign.message_content || "<p>No message content yet.</p>" }} /></div></section>
    </div><div className="space-y-5">
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-900">Analytics</h2><div className="grid grid-cols-2 gap-3">{[["Planned", campaign.recipient_count ?? 0], ["Sent", campaign.sent_count ?? 0], ["Failed", campaign.failed_count ?? 0], ["Suppressed", campaign.suppressed_count ?? 0], ["Delivered", delivery?.provider === "zoho" ? (campaign.delivered_count ?? 0) : "Not available"], ["Opened", delivery?.provider === "zoho" ? (campaign.opened_count ?? 0) : "Not available"], ["Clicked", campaign.clicked_count ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-800">{value}</p></div>)}</div><p className="mt-4 text-xs text-slate-400">{delivery?.provider === "zoho" ? "Counts update when Zoho sends delivery, open, and click webhook events. Product links also record signed clicks in the app." : "SMTP does not provide delivery or open tracking. Product links record clicks when recipients follow them."}</p></section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Recipients</h2><div className="space-y-2">{(recipientData?.rows || []).slice(0, 20).map((r: any) => <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs"><span className="min-w-0 flex-1 truncate">{r.customer?.company || [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(" ") || r.email}</span><span className="text-slate-400 truncate max-w-[160px]">{r.email}</span><StatusBadge status={r.status} /></div>)}{!recipientData?.rows?.length && <p className="text-sm text-slate-400">Recipients are prepared when the campaign starts.</p>}</div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Activity</h2><div className="space-y-3">{(campaign.activity || []).length ? campaign.activity.map((a: any) => <div key={a.id} className="flex gap-2 text-sm"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="text-slate-600">{a.action.replaceAll("_", " ")} <span className="text-xs text-slate-400">· {a.user_name || "System"} · {new Date(a.created_at).toLocaleString()}</span></span></div>) : <p className="text-sm text-slate-400">No activity yet.</p>}</div></section>
         {hasPermission("marketing", "send") && <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 text-sm font-semibold text-slate-900">Workflow</h2><div className="flex flex-wrap gap-2">{next && <Button size="sm" onClick={() => statusMutation.mutate(next)} disabled={statusMutation.isPending}>{next === "ready" ? "Mark ready" : "Pause campaign"}</Button>}{["ready", "paused", "scheduled"].includes(campaign.status) && <Button size="sm" variant="outline" onClick={() => setLocation(`/marketing/campaigns/${id}/edit`)}><CalendarClock className="mr-1.5 h-4 w-4" /> {campaign.status === "scheduled" ? "Reschedule" : "Schedule campaign"}</Button>}{["ready", "failed", "paused"].includes(campaign.status) && <Button size="sm" onClick={sendNow}><Send className="mr-1.5 h-4 w-4" /> Send now</Button>}{["scheduled", "queued", "sending"].includes(campaign.status) && <Button size="sm" variant="outline" onClick={async () => { try { await pauseMarketingCampaign(id); qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); } catch (e: any) { toast({ title: "Unable to pause", description: e.message, variant: "destructive" }); } }}>Pause</Button>}<Button size="sm" variant="outline" onClick={testSend}>Test email</Button>{hasPermission("marketing", "create") && <Button size="sm" variant="outline" onClick={async () => { const copy = await duplicateMarketingCampaign(id); toast({ title: "Campaign duplicated" }); setLocation(`/marketing/campaigns/${copy.id}/edit`); }}>Duplicate</Button>}{hasPermission("marketing", "delete") && campaign.status !== "sent" && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (window.confirm("Delete this campaign?")) deleteMutation.mutate(); }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}</div><p className="mt-3 text-xs text-slate-400">Sending runs on the server and respects current CRM preferences and suppressions.</p></section>}
        {!hasPermission("marketing", "send") && (hasPermission("marketing", "create") || hasPermission("marketing", "delete")) && <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 text-sm font-semibold text-slate-900">Campaign actions</h2><div className="flex flex-wrap gap-2">{hasPermission("marketing", "create") && <Button size="sm" variant="outline" onClick={async () => { const copy = await duplicateMarketingCampaign(id); toast({ title: "Campaign duplicated" }); setLocation(`/marketing/campaigns/${copy.id}/edit`); }}>Duplicate</Button>}{hasPermission("marketing", "delete") && campaign.status !== "sent" && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (window.confirm("Delete this campaign?")) deleteMutation.mutate(); }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}</div></section>}
     </div></div>
  </PageShell>;
}

function CampaignEditor({ id }: { id?: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const editing = Boolean(id);
  const [form, setForm] = useState<any>({
    name: "", internal_description: "", subject_line: "", preview_text: "",
     message_content: "<p></p>", sender_email: "", template_id: null, audience_type: "",
     audience_config: {}, audience_id: null, scheduled_at: "",
    product_snapshots: [], product_display_options: DEFAULT_MARKETING_PRODUCT_DISPLAY_OPTIONS,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [pickerProducts, setPickerProducts] = useState<MarketingProductSnapshot[]>([]);
  const { data: existing } = useQuery<any>({ queryKey: ["marketing-campaign", id], queryFn: () => getMarketingCampaign(id!), enabled: editing });
  const { data: senderSettings = { emails: [], defaultEmail: "" } } = useQuery<{ emails: string[]; defaultEmail: string }>({
    queryKey: ["marketing-sender-settings"],
    queryFn: getMarketingSenderSettings,
  });
  const { data: audiences = [] } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: templates = [] } = useQuery<any[]>({ queryKey: ["marketing-templates"], queryFn: getMarketingTemplates });
  const { data: customerPage } = useQuery<any>({ queryKey: ["marketing-audience-customers", "campaign-editor"], queryFn: () => getMarketingAudienceCustomers({ limit: 100 }) });
  const { data: customerGroups = [], isLoading: customerGroupsLoading, error: customerGroupsError } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["marketing-customer-groups"],
    queryFn: getMarketingCustomerGroups,
    enabled: form.audience_type === "customer_group",
    staleTime: 5 * 60 * 1000,
  });
  const { data: productResults = [], isFetching: productsLoading, error: productsError } = useQuery<MarketingProductSnapshot[]>({
    queryKey: ["marketing-product-search", productSearch],
    queryFn: () => searchMarketingProducts(productSearch.trim()),
    enabled: pickerOpen && productSearch.trim().length >= 2,
  });
  useEffect(() => { if (existing) { setForm({ ...existing, sender_email: existing.sender_email || "", scheduled_at: existing.scheduled_at ? new Date(existing.scheduled_at).toISOString().slice(0, 16) : "" }); setSelectedIds((existing.recipients || []).map((r: any) => r.id)); } }, [existing]);
  const saveMutation = useMutation({
    mutationFn: (status: string) => {
      const payload = { ...form, status, scheduled_at: form.scheduled_at || null, customer_ids: form.audience_type === "selected_customers" ? selectedIds : undefined };
      return editing ? updateMarketingCampaign(id!, payload) : createMarketingCampaign(payload);
    },
    onSuccess: (campaign: any) => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); toast({ title: editing ? "Campaign updated" : "Campaign created" }); setLocation(`/marketing/campaigns/${campaign.id}`); },
    onError: (e: any) => toast({ title: "Unable to save campaign", description: e.message, variant: "destructive" }),
  });
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!form.scheduled_at) throw new Error("Choose a scheduled date first.");
      if (editing) {
        await updateMarketingCampaign(id!, { ...form, scheduled_at: form.scheduled_at, status: existing?.status === "draft" ? "ready" : existing?.status });
        return scheduleMarketingCampaign(id!, form.scheduled_at);
      }
      const created: any = await createMarketingCampaign({ ...form, status: "ready", scheduled_at: null, customer_ids: form.audience_type === "selected_customers" ? selectedIds : undefined });
      return scheduleMarketingCampaign(created.id, form.scheduled_at);
    },
    onSuccess: (campaign: any) => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); toast({ title: "Campaign scheduled" }); setLocation(`/marketing/campaigns/${campaign.id}`); },
    onError: (e: any) => toast({ title: "Unable to schedule campaign", description: e.message, variant: "destructive" }),
  });
  const set = (key: string, value: any) => setForm((old: any) => ({ ...old, [key]: value }));
  const products: MarketingProductSnapshot[] = (Array.isArray(form.product_snapshots) ? form.product_snapshots : []).map(asProductSnapshot);
  const productOptions = normalizeMarketingProductDisplayOptions(form.product_display_options);
  const senderOptions = Array.from(new Set([
    ...(Array.isArray(senderSettings.emails) ? senderSettings.emails : []),
    ...(form.sender_email ? [String(form.sender_email)] : []),
  ]));
  const selectedGroupName = String(form.audience_config?.customerGroupName ?? form.audience_config?.customerGroup ?? "").trim();
  const audienceIsComplete = Boolean(
    form.audience_type
    && (form.audience_type !== "saved_audience" || Number(form.audience_id))
    && (form.audience_type !== "customer_group" || selectedGroupName)
    && (form.audience_type !== "selected_customers" || selectedIds.length > 0),
  );
  const updateProducts = (nextProducts: MarketingProductSnapshot[]) => {
    const unique = Array.from(new Map(nextProducts.map(product => [product.id, product])).values());
    setForm((old: any) => ({
      ...old,
      product_snapshots: unique,
      message_content: replaceMarketingProductMarkup(
        old.message_content || "",
        unique,
        normalizeMarketingProductDisplayOptions(old.product_display_options),
      ),
    }));
  };
  const updateProductOptions = (nextOptions: MarketingProductDisplayOptions) => {
    setForm((old: any) => ({
      ...old,
      product_display_options: nextOptions,
      message_content: replaceMarketingProductMarkup(old.message_content || "", products, nextOptions),
    }));
  };
  const openProductPicker = () => {
    setPickerProducts(products);
    setProductSearch("");
    setPickerOpen(true);
  };
  const togglePickerProduct = (product: MarketingProductSnapshot) => {
    setPickerProducts(old => old.some(item => item.id === product.id)
      ? old.filter(item => item.id !== product.id)
      : [...old, asProductSnapshot(product)]);
  };
  const insertProductGrid = () => {
    if (!products.length) return;
    set("message_content", upsertMarketingProductMarkup(
      form.message_content || "",
      renderMarketingProductGrid(products, productOptions),
      /<!-- marketing-product-grid -->[\s\S]*?<!-- \/marketing-product-grid -->/,
    ));
  };
  const insertProduct = (product: MarketingProductSnapshot) => {
    set("message_content", upsertMarketingProductMarkup(
      form.message_content || "",
      renderMarketingProductBlock(product, productOptions),
      new RegExp(`<!-- marketing-product-block:${product.id} -->[\\s\\S]*?<!-- /marketing-product-block:${product.id} -->`),
    ));
  };
  const applyTemplate = (value: string) => {
    const templateId = Number(value) || null;
    const template = templates.find((candidate: any) => candidate.id === templateId);
    setForm((old: any) => ({
      ...old,
      template_id: templateId,
      ...(template ? {
        subject_line: template.subject_template || old.subject_line,
         message_content: preserveMarketingProductMarkup(template.body || old.message_content, old.message_content || ""),
      } : {}),
    }));
  };
  const customers = customerPage?.rows ?? [];
  return <PageShell title={editing ? "Edit campaign" : "New campaign"} subtitle="Build, test, schedule, or send this campaign through the configured delivery provider." action={<Button variant="outline" onClick={() => setLocation(editing ? `/marketing/campaigns/${id}` : "/marketing/campaigns")}><ArrowLeft className="mr-2 h-4 w-4" /> Cancel</Button>}>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]"><div className="space-y-5">
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><FileText className="h-4 w-4 text-blue-500" /> Campaign details</h2><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Campaign name<Input className="mt-1.5" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. September new arrivals" /></label><label className="block text-sm font-medium text-slate-700">Internal description<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" value={form.internal_description} onChange={e => set("internal_description", e.target.value)} placeholder="What is this campaign for?" /></label><label className="block text-sm font-medium text-slate-700">Subject line<Input className="mt-1.5" value={form.subject_line} onChange={e => set("subject_line", e.target.value)} placeholder="Your subject line" /></label><label className="block text-sm font-medium text-slate-700">Preview text<Input className="mt-1.5" value={form.preview_text} onChange={e => set("preview_text", e.target.value)} placeholder="Optional inbox preview" /></label><label className="block text-sm font-medium text-slate-700">From email<select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.sender_email || ""} onChange={e => set("sender_email", e.target.value)}><option value="">Use default{senderSettings.defaultEmail ? ` (${senderSettings.defaultEmail})` : ""}</option>{senderOptions.map(email => <option key={email} value={email}>{email}{email.toLowerCase() === senderSettings.defaultEmail.toLowerCase() ? " · Default" : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-400">{senderSettings.defaultEmail ? `Defaults to ${senderSettings.defaultEmail}. Manage sender addresses in Marketing settings.` : "No sender addresses are configured yet. Add one in Marketing settings before sending."}</span></label></div></section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Mail className="h-4 w-4 text-blue-500" /> Message</h2><Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="mr-1.5 h-4 w-4" /> Preview email</Button></div><label className="mb-4 block text-sm font-medium text-slate-700">Use a marketing template<select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.template_id || ""} onChange={e => applyTemplate(e.target.value)}><option value="">Start from scratch</option>{templates.map((template: any) => <option key={template.id} value={template.id}>{template.name}{template.category ? ` · ${template.category}` : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-400">{templates.length ? "Selecting a template fills the subject and message. You can still edit both." : "No active marketing templates are available yet."}</span></label><RichTextEditor value={form.message_content} onChange={value => setForm((old: any) => ({ ...old, message_content: preserveMarketingProductMarkup(value, old.message_content || "") }))} minHeight={240} /></section>
       <section className="rounded-xl border bg-white p-5 shadow-sm">
         <div className="flex flex-wrap items-start justify-between gap-3">
           <div><h2 className="flex items-center gap-2 font-semibold text-slate-900"><ShoppingBag className="h-4 w-4 text-blue-500" /> Products <span className="text-xs font-normal text-slate-400">Optional</span></h2><p className="mt-1 text-xs text-slate-500">Feature catalog products in this email. Products are only added to the message when you insert them.</p></div>
           <Button type="button" variant="outline" size="sm" onClick={openProductPicker}><Plus className="mr-1.5 h-4 w-4" />{products.length ? "Edit products" : "Add products"}</Button>
         </div>
         <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {PRODUCT_DISPLAY_FIELDS.map(([key, label, defaultValue]) => <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={productOptions[key]} onChange={e => updateProductOptions({ ...productOptions, [key]: e.target.checked })} />
             <span>{label}</span>{!Boolean(defaultValue) && <span className="text-[11px] text-slate-400">(off by default)</span>}
           </label>)}
         </div>
         {products.length ? <div className="mt-4 space-y-2">
           <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{products.length} selected product{products.length === 1 ? "" : "s"}</p><Button type="button" size="sm" onClick={insertProductGrid}><Package className="mr-1.5 h-3.5 w-3.5" /> Insert all products</Button></div>
           <div className="grid gap-2 sm:grid-cols-2">{products.map(product => <div key={product.id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-slate-50 p-2.5">
             {product.image ? <img src={product.image} alt="" className="h-14 w-14 shrink-0 rounded object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-200 text-slate-400"><Package className="h-5 w-5" /></div>}
             <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{product.name}</p><p className="truncate text-xs text-slate-500">{product.sku || "No SKU"} · ${Number(product.price || 0).toFixed(2)} · {product.stock_level} in stock</p><Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => insertProduct(product)}><Pencil className="mr-1 h-3 w-3" /> Insert this product</Button></div>
             <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600" aria-label={`Remove ${product.name}`} onClick={() => updateProducts(products.filter(item => item.id !== product.id))}><X className="h-4 w-4" /></Button>
           </div>)}</div>
         </div> : <p className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-slate-400">No products selected yet.</p>}
       </section>
    </div><div className="space-y-5">
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Users className="h-4 w-4 text-blue-500" /> Audience</h2><div className="space-y-3"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => { const nextType = e.target.value; setForm((old: any) => ({ ...old, audience_type: nextType, audience_config: nextType === "customer_group" ? {} : old.audience_config, audience_id: nextType === "saved_audience" ? old.audience_id : null })); }}><option value="">Choose an audience…</option><option value="all_eligible">All eligible customers (explicit opt-in)</option><option value="customer_group">BigCommerce customer group</option><option value="selected_customers">Selected customers</option><option value="saved_audience">Saved audience</option></select>{form.audience_type === "customer_group" && <div className="space-y-2"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_config?.customerGroupId || (selectedGroupName && !customerGroups.some(group => group.name === selectedGroupName) ? selectedGroupName : "")} disabled={customerGroupsLoading || Boolean(customerGroupsError)} onChange={e => { const group = customerGroups.find(candidate => String(candidate.id) === e.target.value); set("audience_config", group ? { customerGroupId: group.id, customerGroupName: group.name } : {}); }}><option value="">{customerGroupsLoading ? "Loading BigCommerce groups…" : "Choose a customer group…"}</option>{selectedGroupName && !form.audience_config?.customerGroupId && !customerGroups.some(group => group.name === selectedGroupName) && <option value={selectedGroupName}>{selectedGroupName} (saved value)</option>}{customerGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{customerGroupsError ? <p className="text-xs text-red-600">Unable to load BigCommerce customer groups. Check the catalog connection.</p> : !customerGroupsLoading && !customerGroups.length && <p className="text-xs text-slate-500">No BigCommerce customer groups were found.</p>}<p className="text-xs text-slate-400">Groups are loaded from BigCommerce and matched to the CRM mirror when the campaign sends.</p></div>}{form.audience_type === "saved_audience" && <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_id || ""} onChange={e => set("audience_id", Number(e.target.value) || null)}><option value="">Choose a saved audience…</option>{audiences.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.member_count})</option>)}</select>}{form.audience_type === "selected_customers" && <div className="max-h-60 space-y-1 overflow-auto rounded-md border p-2">{customers.map((c: any) => <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={e => setSelectedIds(old => e.target.checked ? [...old, c.id] : old.filter(x => x !== c.id))} /><span className="min-w-0 truncate">{c.company || `${c.first_name} ${c.last_name}`}</span><span className="ml-auto text-xs text-slate-400">{c.email}</span></label>)}{!customers.length && <p className="p-3 text-xs text-slate-400">No eligible CRM customers found.</p>}</div>}{!form.audience_type ? <p className="text-xs font-medium text-amber-700">Choose an audience before marking this campaign ready, scheduling it, or sending it.</p> : form.audience_type === "all_eligible" ? <p className="text-xs font-medium text-amber-700">This sends to every eligible customer. Select this only when that is intentional.</p> : <p className="text-xs text-slate-400">Customers come from the CRM mirror and must be active customer accounts.</p>}</div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><CalendarClock className="h-4 w-4 text-blue-500" /> Schedule</h2><label className="block text-sm font-medium text-slate-700">Optional scheduled date<input type="datetime-local" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={form.scheduled_at || ""} onChange={e => set("scheduled_at", e.target.value)} /></label></section>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending || scheduleMutation.isPending || !hasPermission("marketing", editing ? "edit" : "create")}>Save draft</Button>{hasPermission("marketing", "send") && <>{form.scheduled_at && <Button variant="outline" onClick={() => scheduleMutation.mutate()} disabled={saveMutation.isPending || scheduleMutation.isPending || !audienceIsComplete}><CalendarClock className="mr-1.5 h-4 w-4" /> Schedule</Button>}<Button onClick={() => saveMutation.mutate("ready")} disabled={saveMutation.isPending || !audienceIsComplete || !hasPermission("marketing", editing ? "edit" : "create")}>{saveMutation.isPending ? "Saving…" : "Save & review"}</Button></>}</div>
     </div></div>
      <MarketingEmailPreview open={previewOpen} onOpenChange={setPreviewOpen} subject={form.subject_line} previewText={form.preview_text} sender={form.sender_email || senderSettings.defaultEmail} content={replaceMarketingProductMarkup(form.message_content || "", products, productOptions)} />
      {pickerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="marketing-product-picker-title">
       <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
         <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
           <div><h2 id="marketing-product-picker-title" className="font-semibold text-slate-900">Choose campaign products</h2><p className="mt-1 text-xs text-slate-500">Search BigCommerce by product title or SKU, then select the products to feature.</p></div>
           <Button type="button" variant="ghost" size="icon" onClick={() => setPickerOpen(false)} aria-label="Close product picker"><X className="h-4 w-4" /></Button>
         </div>
         <div className="border-b px-5 py-4">
           <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input autoFocus className="pl-9" placeholder="Search product title or SKU…" value={productSearch} onChange={e => setProductSearch(e.target.value)} /></div>
           <p className="mt-2 text-xs text-slate-400">{pickerProducts.length} selected · Prices and stock are internal catalog information.</p>
         </div>
         <div className="min-h-0 flex-1 overflow-y-auto p-5">
           {productSearch.trim().length < 2 ? <div className="py-12 text-center text-sm text-slate-400"><Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />Enter at least 2 characters to search the catalog.</div>
             : productsLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Searching BigCommerce…</div>
             : productsError ? <div className="py-12 text-center text-sm text-red-600">Unable to search BigCommerce. Check the catalog connection and try again.</div>
             : productResults.length ? <div className="grid gap-3 sm:grid-cols-2">{productResults.map(product => {
               const snapshot = asProductSnapshot(product);
               const selected = pickerProducts.some(item => item.id === snapshot.id);
               return <button type="button" key={snapshot.id} onClick={() => togglePickerProduct(snapshot)} className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-blue-400 bg-blue-50/60" : "hover:border-slate-300 hover:bg-slate-50"}`}>
                 <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span>
                 {snapshot.image ? <img src={snapshot.image} alt="" className="h-16 w-16 shrink-0 rounded object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"><Package className="h-6 w-6" /></span>}
                 <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{snapshot.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{snapshot.sku || "No SKU"}</span><span className="mt-1 block text-xs text-slate-400">${Number(snapshot.price || 0).toFixed(2)} · {snapshot.stock_level} in stock</span></span>
               </button>;
             })}</div>
             : <div className="py-12 text-center text-sm text-slate-400">No products matched that title or SKU.</div>}
         </div>
         <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 px-5 py-3"><Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button><Button type="button" onClick={() => { updateProducts(pickerProducts); setPickerOpen(false); }}>{pickerProducts.length ? `Add ${pickerProducts.length} product${pickerProducts.length === 1 ? "" : "s"}` : "Clear selection"}</Button></div>
       </div>
     </div>}
  </PageShell>;
}

export function MarketingCampaignRoute() {
  const [newMatch] = useRoute("/marketing/campaigns/new");
  const [match, params] = useRoute("/marketing/campaigns/:id");
  const [editMatch, editParams] = useRoute("/marketing/campaigns/:id/edit");
  if (newMatch) return <CampaignEditor />;
  if (editMatch && editParams?.id && editParams.id !== "new") return <CampaignEditor id={Number(editParams.id)} />;
  if (match && params?.id) return <CampaignDetail id={Number(params.id)} />;
  return <CampaignEditor />;
}

export function MarketingAudiences() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const [selected, setSelected] = useState<any | null>(null);
  const [audienceEditorFocused, setAudienceEditorFocused] = useState(false);
  const [form, setForm] = useState<any>({ name: "", description: "", audience_type: "manual", dynamic_filters: {} });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [sourceTab, setSourceTab] = useState<"crm" | "imported">("crm");
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupPage, setLookupPage] = useState(0);
  const [contactType, setContactType] = useState("all");
  const [importType, setImportType] = useState<"lead" | "prospect">("lead");
  const [importing, setImporting] = useState(false);
  const [viewingMembers, setViewingMembers] = useState<any | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(0);
  const [memberStatus, setMemberStatus] = useState("all");
  const pageSize = 25;
  const { data: audiences = [], isLoading } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: customerPage } = useQuery<any>({
    queryKey: ["marketing-audience-customers", lookupSearch, lookupPage],
    queryFn: () => getMarketingAudienceCustomers({ search: lookupSearch, limit: pageSize, offset: lookupPage * pageSize }),
    enabled: form.audience_type === "manual" && sourceTab === "crm",
  });
  const { data: contactPage } = useQuery<any>({
    queryKey: ["marketing-contacts", lookupSearch, contactType, lookupPage],
    queryFn: () => getMarketingContacts({ search: lookupSearch, type: contactType, limit: pageSize, offset: lookupPage * pageSize }),
    enabled: form.audience_type === "manual" && sourceTab === "imported",
  });
  const { data: customerGroups = [], isLoading: customerGroupsLoading, error: customerGroupsError } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["marketing-customer-groups"],
    queryFn: getMarketingCustomerGroups,
    enabled: form.audience_type === "dynamic",
    staleTime: 5 * 60 * 1000,
  });
  const { data: preview, isFetching: previewLoading } = useQuery<any>({
    queryKey: ["marketing-audience-preview", form.dynamic_filters],
    queryFn: () => getMarketingAudiencePreview(form.dynamic_filters),
    enabled: form.audience_type === "dynamic",
  });
  const { data: memberData } = useQuery<any>({
    queryKey: ["marketing-audience-members", viewingMembers?.id, memberSearch, memberStatus, memberPage],
    queryFn: () => getMarketingAudienceMembers(viewingMembers.id, { search: memberSearch, status: memberStatus, limit: pageSize, offset: memberPage * pageSize }),
    enabled: Boolean(viewingMembers),
  });
  const save = useMutation({
    mutationFn: () => selected?.id
      ? updateMarketingAudience(selected.id, { ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined, contact_ids: form.audience_type === "manual" ? selectedContactIds : undefined })
      : createMarketingAudience({ ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined, contact_ids: form.audience_type === "manual" ? selectedContactIds : undefined }),
     onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-audiences"] }); setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); setSelectedContactIds([]); setAudienceEditorFocused(false); toast({ title: "Audience saved" }); },
    onError: (e: any) => toast({ title: "Unable to save audience", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteMarketingAudience(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-audiences"] }), onError: (e: any) => toast({ title: "Unable to delete audience", description: e.message, variant: "destructive" }) });
   const startNew = () => { setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); setSelectedContactIds([]); setViewingMembers(null); setAudienceEditorFocused(true); };
  const edit = async (a: any) => {
    const detail = await getMarketingAudience(a.id);
    setSelected(detail);
    setForm({ name: detail.name, description: detail.description, audience_type: detail.audience_type, dynamic_filters: detail.dynamic_filters || {} });
    setSelectedIds(detail.member_customer_ids || (detail.members || []).filter((m: any) => m.customer_id).map((m: any) => m.customer_id));
    setSelectedContactIds(detail.member_contact_ids || (detail.members || []).filter((m: any) => m.contact_id).map((m: any) => m.contact_id));
     setViewingMembers(null);
     setAudienceEditorFocused(true);
  };
  const visibleRows = sourceTab === "crm" ? (customerPage?.rows ?? []) : (contactPage?.rows ?? []);
  const total = sourceTab === "crm" ? customerPage?.total ?? 0 : contactPage?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const allOnPage = visibleRows.length > 0 && visibleRows.every((row: any) => sourceTab === "crm" ? selectedIds.includes(row.id) : selectedContactIds.includes(row.id));
  const toggleAll = () => {
    const ids = visibleRows.map((row: any) => row.id);
    if (sourceTab === "crm") setSelectedIds(old => allOnPage ? old.filter(id => !ids.includes(id)) : Array.from(new Set([...old, ...ids])));
    else setSelectedContactIds(old => allOnPage ? old.filter(id => !ids.includes(id)) : Array.from(new Set([...old, ...ids])));
  };
  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importMarketingContacts(await file.text(), importType);
      toast({ title: "Contacts imported", description: `${result.imported} added, ${result.duplicates} duplicates skipped, ${result.invalid} invalid rows skipped.` });
      qc.invalidateQueries({ queryKey: ["marketing-contacts"] });
    } catch (e: any) { toast({ title: "Import failed", description: e.message, variant: "destructive" }); }
    finally { setImporting(false); event.target.value = ""; }
  };
  const setFilter = (key: string, value: any) => setForm((old: any) => ({ ...old, dynamic_filters: { ...old.dynamic_filters, [key]: value === "" || value === undefined || (Array.isArray(value) && value.length === 0) ? undefined : value } }));
  return <PageShell title="Audiences" subtitle="Build reusable CRM and imported-contact groups" action={hasPermission("marketing", "manage_audiences") ? <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" /> New audience</Button> : undefined}>
     <div className={`grid gap-5 transition-[grid-template-columns] duration-300 ${audienceEditorFocused ? "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]" : "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"}`}>
      <section onFocusCapture={() => setAudienceEditorFocused(false)} className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Saved audiences</h2><p className="text-xs text-slate-500">{audiences.length} audience{audiences.length === 1 ? "" : "s"}</p></div>{isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading audiences…</div> : audiences.length ? <div className="divide-y">{audiences.map((a: any) => <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Users className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.audience_type === "dynamic" ? "Dynamic" : "Manual"} · {a.member_count} members</p></div><Button variant="outline" size="sm" onClick={() => { setViewingMembers(a); setMemberPage(0); setMemberSearch(""); }}>View members</Button><Button variant="ghost" size="sm" onClick={() => edit(a)}>Edit</Button>{hasPermission("marketing", "delete") && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this audience?")) remove.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div> : <EmptyState icon={Users} text="No saved audiences yet" action="Create an audience" onClick={startNew} />}</section>
       <section onFocusCapture={() => setAudienceEditorFocused(true)} className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">{selected ? "Edit audience" : "New audience"}</h2><p className="text-xs text-slate-500">Suppression is evaluated again when a campaign sends.</p></div>{selected && <Button variant="ghost" size="sm" onClick={startNew}><X className="h-4 w-4" /></Button>}</div><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={form.name} onChange={e => setForm((x: any) => ({ ...x, name: e.target.value }))} placeholder="VIP customers" /></label><label className="block text-sm font-medium text-slate-700">Description<textarea className="mt-1.5 min-h-16 w-full rounded-md border border-slate-200 p-3 text-sm" value={form.description} onChange={e => setForm((x: any) => ({ ...x, description: e.target.value }))} /></label><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => { setForm((x: any) => ({ ...x, audience_type: e.target.value })); setLookupPage(0); }}><option value="manual">Manual selection</option><option value="dynamic">Dynamic filters</option></select>
         {form.audience_type === "dynamic" ? <div className="space-y-3"><div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Customer group<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.customerGroup || ""} disabled={customerGroupsLoading || Boolean(customerGroupsError)} onChange={e => setFilter("customerGroup", e.target.value)}><option value="">{customerGroupsLoading ? "Loading BigCommerce groups…" : "Any customer group"}</option>{form.dynamic_filters?.customerGroup && !customerGroups.some(group => group.name === form.dynamic_filters.customerGroup) && <option value={form.dynamic_filters.customerGroup}>{form.dynamic_filters.customerGroup} (saved value)</option>}{customerGroups.map(group => <option key={group.id} value={group.name}>{group.name}</option>)}</select>{customerGroupsError ? <span className="mt-1 block text-[10px] font-normal text-red-600">Unable to load BigCommerce groups.</span> : !customerGroupsLoading && !customerGroups.length && <span className="mt-1 block text-[10px] font-normal text-slate-400">No BigCommerce groups found.</span>}</label><label className="text-xs font-medium text-slate-600">Customer type<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.customerType || ""} onChange={e => setFilter("customerType", e.target.value)}><option value="">Any type</option><option value="Store">Store</option><option value="Distributor">Distributor</option></select></label><label className="text-xs font-medium text-slate-600">Account health<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.accountHealth || ""} onChange={e => setFilter("accountHealth", e.target.value)}><option value="">Any health</option><option value="Healthy">Healthy</option><option value="Watch">Watch</option><option value="At Risk">At Risk</option><option value="Lost">Lost</option></select></label><label className="text-xs font-medium text-slate-600">Account status<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.isActive === false ? "inactive" : form.dynamic_filters?.isActive === true ? "active" : ""} onChange={e => setFilter("isActive", e.target.value === "active" ? true : e.target.value === "inactive" ? false : undefined)}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="text-xs font-medium text-slate-600">State<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.state || ""} onChange={e => setFilter("state", e.target.value)}><option value="">Any U.S. state</option>{MARKETING_US_STATE_OPTIONS.map(([abbreviation, name]) => <option key={abbreviation} value={abbreviation}>{name} ({abbreviation})</option>)}</select></label><label className="text-xs font-medium text-slate-600">Minimum revenue<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minRevenue ?? ""} onChange={e => setFilter("minRevenue", e.target.value ? Number(e.target.value) : undefined)} /></label><label className="text-xs font-medium text-slate-600">Minimum orders<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minOrders ?? ""} onChange={e => setFilter("minOrders", e.target.value ? Number(e.target.value) : undefined)} /></label><label className="text-xs font-medium text-slate-600">Last order before<Input type="date" className="mt-1 h-9 w-full bg-white text-sm" value={form.dynamic_filters?.lastOrderBefore || ""} onChange={e => setFilter("lastOrderBefore", e.target.value)} /></label></div><DynamicFilterExtensions filters={form.dynamic_filters || {}} setFilter={setFilter} /><div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-blue-900">Live preview</p><span className="text-lg font-bold text-blue-700">{previewLoading ? "…" : preview?.total ?? 0}</span></div><p className="mt-1 text-xs text-blue-800/80">{preview?.suppressed ?? 0} suppressed · {Math.max(0, (preview?.total ?? 0) - (preview?.suppressed ?? 0))} eligible</p>{preview?.customers?.slice(0, 5).map((c: any) => <div key={c.id} className="mt-2 flex justify-between text-xs text-blue-900"><span className="truncate">{c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</span><span className={c.marketing_suppressed ? "text-red-600" : "text-emerald-700"}>{c.marketing_suppressed ? "Suppressed" : "Eligible"}</span></div>)}</div></div> : <div className="space-y-3"><div className="flex gap-1 rounded-lg bg-slate-100 p-1"><Button type="button" size="sm" variant={sourceTab === "crm" ? "default" : "ghost"} className="flex-1" onClick={() => { setSourceTab("crm"); setLookupPage(0); }}>CRM customers</Button><Button type="button" size="sm" variant={sourceTab === "imported" ? "default" : "ghost"} className="flex-1" onClick={() => { setSourceTab("imported"); setLookupPage(0); }}>Leads & prospects</Button></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-8" placeholder="Search contacts…" value={lookupSearch} onChange={e => { setLookupSearch(e.target.value); setLookupPage(0); }} /></div>{sourceTab === "imported" && <select className="h-10 rounded-md border bg-white px-2 text-sm" value={contactType} onChange={e => { setContactType(e.target.value); setLookupPage(0); }}><option value="all">All types</option><option value="lead">Leads</option><option value="prospect">Prospects</option></select>}</div>{sourceTab === "imported" && <div className="rounded-lg border border-dashed p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-500">CSV requires email; optional first_name, last_name, company, phone.</p><select className="h-8 rounded-md border bg-white px-2 text-xs" value={importType} onChange={e => setImportType(e.target.value as "lead" | "prospect")}><option value="lead">Lead</option><option value="prospect">Prospect</option></select></div><label className="mt-2 inline-flex cursor-pointer items-center rounded-md border bg-white px-3 py-2 text-xs font-medium text-slate-700">{importing ? "Importing…" : "Choose CSV file"}<input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} disabled={importing || !hasPermission("marketing", "manage_audiences")} /></label></div>}<div className="flex items-center justify-between text-xs text-slate-500"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={allOnPage} onChange={toggleAll} /> Select all on page</label><span>{selectedIds.length + selectedContactIds.length} selected across all pages</span></div><div className="max-h-64 space-y-1 overflow-auto rounded-md border p-2">{visibleRows.map((c: any) => { const checked = sourceTab === "crm" ? selectedIds.includes(c.id) : selectedContactIds.includes(c.id); return <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={checked} onChange={e => sourceTab === "crm" ? setSelectedIds(old => e.target.checked ? [...new Set([...old, c.id])] : old.filter(x => x !== c.id)) : setSelectedContactIds(old => e.target.checked ? [...new Set([...old, c.id])] : old.filter(x => x !== c.id))} /><span className="min-w-0 flex-1 truncate">{c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</span><span className="max-w-[130px] truncate text-slate-400">{c.email}</span>{sourceTab === "imported" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{c.contact_type}</span>}</label>; })}{!visibleRows.length && <p className="p-3 text-center text-xs text-slate-400">No contacts match this search.</p>}</div><div className="flex items-center justify-between text-xs text-slate-500"><span>{total} available</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={lookupPage === 0} onClick={() => setLookupPage(p => p - 1)}>Previous</Button><span>{totalPages ? lookupPage + 1 : 0} / {totalPages || 0}</span><Button type="button" size="sm" variant="outline" disabled={!totalPages || lookupPage + 1 >= totalPages} onClick={() => setLookupPage(p => p + 1)}>Next</Button></div></div><p className="text-xs text-slate-400">Imported contacts stay outside the CRM mirror and can be reused in marketing audiences.</p></div>}<Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim() || !hasPermission("marketing", "manage_audiences")}>{save.isPending ? "Saving…" : "Save audience"}</Button></div></section>
     </div>
    {viewingMembers && <section className="rounded-xl border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-semibold text-slate-900">Members: {viewingMembers.name}</h2><p className="text-xs text-slate-500">{memberData?.total ?? viewingMembers.member_count ?? 0} members · live eligibility</p></div><Button variant="ghost" size="sm" onClick={() => setViewingMembers(null)}><X className="mr-1 h-4 w-4" /> Close</Button></div><div className="p-4"><div className="mb-3 flex flex-col gap-2 sm:flex-row"><Input className="max-w-md" placeholder="Search members…" value={memberSearch} onChange={e => { setMemberSearch(e.target.value); setMemberPage(0); }} /><select className="h-10 rounded-md border bg-white px-3 text-sm" value={memberStatus} onChange={e => { setMemberStatus(e.target.value); setMemberPage(0); }}><option value="all">All eligibility</option><option value="eligible">Eligible</option><option value="suppressed">Suppressed</option><option value="inactive">Inactive</option></select></div><div className="overflow-x-auto"><div className="min-w-[620px] divide-y rounded-md border">{(memberData?.rows ?? []).map((m: any) => <div key={m.member_id} className="grid grid-cols-[1.3fr_1fr_130px_110px] gap-3 px-3 py-3 text-xs"><span className="truncate font-medium text-slate-800">{m.company || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed contact"}</span><span className="truncate text-slate-500">{m.email}</span><span className="capitalize text-slate-500">{m.source}{m.contact_type ? ` · ${m.contact_type}` : ""}</span><span className={m.status === "eligible" ? "text-emerald-700" : "text-red-600"}>{m.status}</span></div>)}{!memberData?.rows?.length && <p className="p-6 text-center text-sm text-slate-400">No members match this search.</p>}</div></div><div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500"><Button size="sm" variant="outline" disabled={memberPage === 0} onClick={() => setMemberPage(p => p - 1)}>Previous</Button><span>{memberData?.total ? memberPage + 1 : 0} / {memberData?.total ? Math.ceil(memberData.total / pageSize) : 0}</span><Button size="sm" variant="outline" disabled={!memberData?.total || memberPage + 1 >= Math.ceil(memberData.total / pageSize)} onClick={() => setMemberPage(p => p + 1)}>Next</Button></div></div></section>}
  </PageShell>;
}

function MarketingAudiencesLegacy() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const { data: audiences = [], isLoading } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["marketing-audience-customers"], queryFn: () => getMarketingAudienceCustomers() });
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ name: "", description: "", audience_type: "manual", dynamic_filters: {} });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const save = useMutation({ mutationFn: () => selected?.id ? updateMarketingAudience(selected.id, { ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined }) : createMarketingAudience({ ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-audiences"] }); setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); toast({ title: "Audience saved" }); }, onError: (e: any) => toast({ title: "Unable to save audience", description: e.message, variant: "destructive" }) });
  const remove = useMutation({ mutationFn: (id: number) => deleteMarketingAudience(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-audiences"] }), onError: (e: any) => toast({ title: "Unable to delete audience", description: e.message, variant: "destructive" }) });
  const startNew = () => { setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); };
  const edit = async (a: any) => { const detail = await getMarketingAudience(a.id); setSelected(detail); setForm({ name: detail.name, description: detail.description, audience_type: detail.audience_type, dynamic_filters: detail.dynamic_filters || {} }); setSelectedIds((detail.members || []).map((m: any) => m.id)); };
  return <PageShell title="Audiences" subtitle="Reusable customer groups built on your existing CRM data" action={hasPermission("marketing", "create") ? <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" /> New audience</Button> : undefined}>
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Saved audiences</h2><p className="text-xs text-slate-500">{audiences.length} audience{audiences.length === 1 ? "" : "s"}</p></div>{isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading audiences…</div> : audiences.length ? <div className="divide-y">{audiences.map((a: any) => <div key={a.id} className="flex items-center gap-3 px-5 py-4"><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Users className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.audience_type === "dynamic" ? "Dynamic" : "Manual"} · {a.member_count} customers</p></div><Button variant="ghost" size="sm" onClick={() => edit(a)}>Edit</Button>{hasPermission("marketing", "delete") && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this audience?")) remove.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div> : <EmptyState icon={Users} text="No saved audiences yet" action="Create an audience" onClick={startNew} />}</section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">{selected ? "Edit audience" : "New audience"}</h2><p className="text-xs text-slate-500">Save a segment for future campaigns.</p></div>{selected && <Button variant="ghost" size="sm" onClick={startNew}><X className="h-4 w-4" /></Button>}</div><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={form.name} onChange={e => setForm((x: any) => ({ ...x, name: e.target.value }))} placeholder="VIP customers" /></label><label className="block text-sm font-medium text-slate-700">Description<textarea className="mt-1.5 min-h-16 w-full rounded-md border border-slate-200 p-3 text-sm" value={form.description} onChange={e => setForm((x: any) => ({ ...x, description: e.target.value }))} /></label><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => setForm((x: any) => ({ ...x, audience_type: e.target.value }))}><option value="manual">Manual selection</option><option value="dynamic">Dynamic filters</option></select>{form.audience_type === "dynamic" ? <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Customer group<Input className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.customerGroup || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, customerGroup: e.target.value } }))} placeholder="Optional group name" /></label><label className="text-xs font-medium text-slate-600">Customer type<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.customerType || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, customerType: e.target.value } }))}><option value="">Any type</option><option value="Store">Store</option><option value="Distributor">Distributor</option></select></label><label className="text-xs font-medium text-slate-600">Account health<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.accountHealth || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, accountHealth: e.target.value } }))}><option value="">Any health</option><option value="Healthy">Healthy</option><option value="Watch">Watch</option><option value="At Risk">At Risk</option><option value="Lost">Lost</option></select></label><label className="text-xs font-medium text-slate-600">Account status<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.isActive === false ? "inactive" : form.dynamic_filters?.isActive === true ? "active" : ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, ...(e.target.value ? { isActive: e.target.value === "active" } : { isActive: undefined }) } }))}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="text-xs font-medium text-slate-600">State<Input className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.state || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, state: e.target.value } }))} placeholder="PA, MD…" /></label><label className="text-xs font-medium text-slate-600">Minimum lifetime revenue<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minRevenue || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, minRevenue: e.target.value ? Number(e.target.value) : undefined } }))} /></label><label className="text-xs font-medium text-slate-600">Minimum orders<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minOrders || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, minOrders: e.target.value ? Number(e.target.value) : undefined } }))} /></label><label className="text-xs font-medium text-slate-600">Last order before<Input type="date" className="mt-1 h-9 w-full bg-white text-sm" value={form.dynamic_filters?.lastOrderBefore || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, lastOrderBefore: e.target.value } }))} /></label><p className="col-span-full text-xs text-slate-400">Dynamic filters recalculate from CRM data and exclude marketing-suppressed customers when used in a campaign.</p></div> : <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-2">{customers.map((c: any) => <label key={c.id} className="flex items-center gap-2 rounded p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={e => setSelectedIds(old => e.target.checked ? [...old, c.id] : old.filter(x => x !== c.id))} /><span className="min-w-0 flex-1 truncate">{c.company || `${c.first_name} ${c.last_name}`}</span></label>)}</div>}<Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim() || !hasPermission("marketing", selected ? "edit" : "create")}>{save.isPending ? "Saving…" : "Save audience"}</Button></div></section>
    </div>
  </PageShell>;
}
