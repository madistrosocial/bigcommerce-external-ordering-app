import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle2, FileSpreadsheet, FileText, History, Loader2, Mail, Package, Search, Send, Users, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getMarketingAudiences,
  getMarketingOrderFormCustomers,
  getMarketingOrderFormHistory,
  getMarketingDeliveryLogs,
  getMarketingProductList,
  getMarketingProductLists,
  getMarketingSenderSettings,
  searchMarketingProducts,
  sendMarketingOrderForms,
} from "@/lib/api";
import { PageShell } from "./Marketing";
import { MarketingDeliveryLogPreview } from "./MarketingDeliveryLogPreview";

type OrderFormCustomer = {
  id: number;
  company?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
};

type OrderFormVariant = {
  id?: number;
  sku?: string;
  stock_level?: number;
  option_values?: Array<{ label?: string; option_display_name?: string }>;
};

type OrderFormProduct = {
  id: number;
  name: string;
  sku?: string;
  stock_level?: number;
  variants?: OrderFormVariant[];
  image?: string;
};

type OrderFormAudience = {
  id: number;
  name: string;
  audience_type: "manual" | "dynamic";
  member_count?: number;
};

const DEFAULT_EMAIL_TITLE = "Your Order Form from MidAtlantic Distribution";
const DEFAULT_EMAIL_BODY = "Hi {first_name},\n\nPlease find your order form attached. Review the available products and let us know if you have any questions.\n\nThank you,\nMidAtlantic Distribution";

function customerName(customer: OrderFormCustomer) {
  return customer.company || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email || `Customer ${customer.id}`;
}

function variantName(variant: OrderFormVariant) {
  return variant.option_values?.map(option => option.label || option.option_display_name).filter(Boolean).join(" / ") || "Default";
}

function productVariants(product: OrderFormProduct) {
  return product.variants?.length ? product.variants : [{ sku: product.sku, stock_level: product.stock_level, option_values: [] }];
}

function availability(stock: number | undefined) {
  return Number(stock || 0) > 0
    ? <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Available</span>
    : <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">OOS</span>;
}

export default function MarketingOrderForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [audienceType, setAudienceType] = useState<"" | "saved_audience" | "selected_customers">("");
  const [selectedAudienceId, setSelectedAudienceId] = useState<number | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<Record<number, OrderFormCustomer>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<number, OrderFormProduct>>({});
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [selectedProductListId, setSelectedProductListId] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [emailTitle, setEmailTitle] = useState(DEFAULT_EMAIL_TITLE);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [productListOpen, setProductListOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const { data: customerPage, isLoading: customersLoading } = useQuery<{ rows: OrderFormCustomer[]; total: number }>({
    queryKey: ["marketing-order-form-customers", customerSearch],
    queryFn: () => getMarketingOrderFormCustomers({ search: customerSearch, limit: 50 }),
    enabled: audienceType === "selected_customers",
  });
  const { data: audiences = [], isLoading: audiencesLoading } = useQuery<OrderFormAudience[]>({
    queryKey: ["marketing-audiences"],
    queryFn: getMarketingAudiences,
  });
  const { data: senderSettings = { emails: [], defaultEmail: "" }, isLoading: senderSettingsLoading } = useQuery<{ emails: string[]; defaultEmail: string }>({
    queryKey: ["marketing-sender-settings"],
    queryFn: getMarketingSenderSettings,
  });
  const { data: productLists = [] } = useQuery<any[]>({
    queryKey: ["marketing-product-lists"],
    queryFn: () => getMarketingProductLists(),
  });
  const { data: selectedProductList } = useQuery<any>({
    queryKey: ["marketing-product-list", selectedProductListId],
    queryFn: () => getMarketingProductList(Number(selectedProductListId)),
    enabled: Boolean(selectedProductListId),
  });
  const { data: productResults = [], isFetching: productsLoading } = useQuery<OrderFormProduct[]>({
    queryKey: ["marketing-order-form-products", productSearch],
    queryFn: () => searchMarketingProducts(productSearch.trim()),
    enabled: productSearch.trim().length >= 2,
  });
  const { data: deliveryLogs, isLoading: deliveryLogsLoading } = useQuery<any>({
    queryKey: ["marketing-delivery-logs", "order_form"],
    queryFn: () => getMarketingDeliveryLogs({ type: "order_form", limit: 10 }),
  });

  const customers = Object.values(selectedCustomers);
  const products = Object.values(selectedProducts);
  const selectedCustomerIds = customers.map(customer => customer.id);
  const selectedProductIds = products.map(product => product.id);
  const selectedAudience = audiences.find(audience => audience.id === selectedAudienceId);
  const senderOptions = Array.from(new Set([
    ...(Array.isArray(senderSettings.emails) ? senderSettings.emails : []),
    ...(senderEmail ? [senderEmail] : []),
  ]));
  const recipientCount = audienceType === "saved_audience"
    ? Number(selectedAudience?.member_count ?? 0)
    : customers.length;
  const audienceReady = audienceType === "saved_audience"
    ? Boolean(selectedAudienceId && recipientCount > 0)
    : audienceType === "selected_customers" && customers.length > 0;
  const canSend = hasPermission("marketing", "send");

  const sendMutation = useMutation({
    mutationFn: () => sendMarketingOrderForms({
      audience_type: audienceType === "saved_audience" ? "saved_audience" : "selected_customers",
      audience_id: audienceType === "saved_audience" ? selectedAudienceId : null,
      customer_ids: audienceType === "selected_customers" ? selectedCustomerIds : undefined,
      product_ids: selectedProductIds,
      format,
      sender_email: senderEmail || null,
      email_title: emailTitle,
      email_body: emailBody,
    }),
    onSuccess: (result: any) => {
      setReviewOpen(false);
      queryClient.invalidateQueries({ queryKey: ["marketing-order-form-history"] });
      const sent = (result.results || []).filter((item: any) => item.status === "sent").length;
      const failed = (result.results || []).filter((item: any) => item.status === "failed").length;
      toast({
        title: sent ? "Order forms processed" : "Order forms failed",
        description: `${sent} sent${failed ? ` · ${failed} failed` : ""}`,
        variant: sent ? "default" : "destructive",
      });
    },
    onError: (error: any) => toast({ title: "Unable to send order forms", description: error.message, variant: "destructive" }),
  });

  const toggleCustomer = (customer: OrderFormCustomer) => {
    setSelectedCustomers(current => {
      const next = { ...current };
      if (next[customer.id]) delete next[customer.id];
      else next[customer.id] = customer;
      return next;
    });
  };
  const toggleProduct = (product: OrderFormProduct) => {
    setSelectedProducts(current => {
      const next = { ...current };
      if (next[product.id]) delete next[product.id];
      else next[product.id] = product;
      return next;
    });
  };
  const addProductList = () => {
    const listProducts = (selectedProductList?.items || [])
      .map((item: any) => item.product_snapshot || {})
      .map((product: any) => ({ ...product, id: Number(product.id ?? product.bigcommerce_id), variants: product.variants || [] }))
      .filter((product: OrderFormProduct) => Number.isInteger(product.id) && product.id > 0);
    setSelectedProducts(current => Object.fromEntries(
      Array.from(new Map([...Object.values(current), ...listProducts].map(product => [product.id, product])).values())
        .map(product => [product.id, product]),
    ));
  };

  const visibleProducts = useMemo(() => productResults.map(product => ({
    ...product,
    id: Number(product.id),
    variants: product.variants || [],
  })), [productResults]);

  return (
    <PageShell
      title="Order Form"
      subtitle="Create customer-specific order forms and send them directly to customers."
      action={<Button variant="outline" onClick={() => window.history.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>}
    >
      <div className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 space-y-5">
          <section className="min-w-0 rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Users className="h-4 w-4 text-blue-500" /> Audience</h2>
                <p className="mt-1 text-xs text-slate-500">Use a saved Marketing audience or select CRM customers manually.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{recipientCount} recipient{recipientCount === 1 ? "" : "s"}</span>
            </div>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={audienceType}
              onChange={event => {
                const nextType = event.target.value as "" | "saved_audience" | "selected_customers";
                setAudienceType(nextType);
                setSelectedAudienceId(null);
                setSelectedCustomers({});
                setCustomerSearch("");
              }}
            >
              <option value="">Choose an audience…</option>
              <option value="saved_audience">Use a saved audience</option>
              <option value="selected_customers">Select customers manually</option>
            </select>
            {audienceType === "saved_audience" && <div className="mt-3 space-y-2">
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedAudienceId || ""}
                disabled={audiencesLoading}
                onChange={event => setSelectedAudienceId(Number(event.target.value) || null)}
              >
                <option value="">{audiencesLoading ? "Loading saved audiences…" : "Choose a saved audience…"}</option>
                {audiences.map(audience => <option key={audience.id} value={audience.id}>{audience.name} ({audience.member_count ?? 0} members)</option>)}
              </select>
              {selectedAudience && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-medium">{selectedAudience.name}</p>
                <p className="mt-1 text-xs text-blue-700">{selectedAudience.member_count ?? 0} audience members will be validated as active CRM customers before sending.</p>
              </div>}
              {!audiencesLoading && !audiences.length && <p className="text-xs text-slate-500">No saved audiences have been created yet. Create one in Marketing → Audiences.</p>}
            </div>}
            {audienceType === "selected_customers" && <div className="mt-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search customer, business, or email…" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                {customersLoading ? <div className="flex items-center justify-center p-6 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading customers…</div> :
                  customerPage?.rows?.length ? customerPage.rows.map(customer => (
                    <label key={customer.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 hover:bg-slate-50">
                      <input type="checkbox" checked={Boolean(selectedCustomers[customer.id])} onChange={() => toggleCustomer(customer)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{customerName(customer)}</span>
                        <span className="block truncate text-xs text-slate-500">{customer.company && customer.first_name ? `${customer.first_name} ${customer.last_name || ""} · ` : ""}{customer.email || "No email"}</span>
                      </span>
                    </label>
                  )) : <p className="p-5 text-center text-sm text-slate-400">No accessible CRM customers found.</p>}
              </div>
              {customers.length > 0 && <div className="flex flex-wrap gap-2">
                {customers.map(customer => <button key={customer.id} type="button" onClick={() => toggleCustomer(customer)} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700"><span className="max-w-[180px] truncate">{customerName(customer)}</span><X className="h-3 w-3" /></button>)}
              </div>}
            </div>}
            {!audienceType && <p className="mt-3 text-xs font-medium text-amber-700">Choose a saved audience or select customers manually before sending.</p>}
          </section>

          <section className="min-w-0 rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Package className="h-4 w-4 text-blue-500" /> Products</h2>
                <p className="mt-1 text-xs text-slate-500">Search by product name or SKU, or open the full product list.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{products.length} selected</span>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <select className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs sm:max-w-[220px]" value={selectedProductListId} onChange={event => setSelectedProductListId(event.target.value)}>
                    <option value="">Load a saved product list…</option>
                    {productLists.map((list: any) => <option key={list.id} value={list.id}>{list.name} ({list.item_count ?? 0})</option>)}
                  </select>
                  <Button type="button" variant="outline" size="sm" onClick={addProductList} disabled={!selectedProductListId || !selectedProductList}><Package className="mr-1.5 h-3.5 w-3.5" /> Add list</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setProductListOpen(true)}><Search className="mr-1.5 h-3.5 w-3.5" /> Search</Button>
                </div>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Search products or SKU…" value={productSearch} onChange={event => setProductSearch(event.target.value)} />
            </div>
            {productSearch.trim().length >= 2 && <div className="mt-3 space-y-1 rounded-lg border p-2">
              {productsLoading ? <div className="flex items-center justify-center p-5 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching products…</div> :
                visibleProducts.length ? visibleProducts.map(product => <ProductSearchRow key={product.id} product={product} selected={Boolean(selectedProducts[product.id])} onToggle={() => toggleProduct(product)} />) :
                  <p className="p-5 text-center text-sm text-slate-400">No products found.</p>}
            </div>}
            <div className="mt-4 space-y-3">
              {products.length ? products.map(product => <SelectedProductCard key={product.id} product={product} onRemove={() => toggleProduct(product)} />) :
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-400">No products selected yet.</p>}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-5">
          <section className="min-w-0 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Send className="h-4 w-4 text-blue-500" /> Review & Send</h2>
             <label className="block min-w-0 text-sm font-medium text-slate-700">Email sent from
               <select className="mt-1.5 h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm" value={senderEmail} disabled={senderSettingsLoading} onChange={event => setSenderEmail(event.target.value)}>
                 <option value="">{senderSettingsLoading ? "Loading sender emails…" : `Use default${senderSettings.defaultEmail ? ` (${senderSettings.defaultEmail})` : ""}`}</option>
                 {senderOptions.map(email => <option key={email} value={email}>{email}{email.toLowerCase() === senderSettings.defaultEmail.toLowerCase() ? " · Default" : ""}</option>)}
               </select>
               <span className="mt-1 block text-xs font-normal text-slate-400">{senderSettings.defaultEmail ? `Defaults to ${senderSettings.defaultEmail}. Manage sender addresses in Marketing settings.` : "No sender addresses are configured yet. Add one in Marketing settings before sending."}</span>
             </label>
             <label className="mt-4 block min-w-0 text-sm font-medium text-slate-700">Email title
               <Input className="mt-1.5" value={emailTitle} maxLength={180} onChange={event => setEmailTitle(event.target.value)} placeholder="Your order form is ready" />
             </label>
             <label className="mt-4 block min-w-0 text-sm font-medium text-slate-700">Email message
               <textarea className="mt-1.5 min-h-36 w-full rounded-md border border-slate-200 p-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" value={emailBody} maxLength={10000} onChange={event => setEmailBody(event.target.value)} placeholder="Write the message customers will receive with their order form attached." />
               <span className="mt-1 block text-xs font-normal text-slate-400">Placeholders are replaced for each customer: <code>{"{first_name}"}</code>, <code>{"{last_name}"}</code>, <code>{"{fullname}"}</code>, <code>{"{business_name}"}</code>, and <code>{"{email}"}</code>.</span>
             </label>
             <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
               <p className="text-xs text-slate-400">Use the customer’s business name with <code>{"{business name}"}</code> or <code>{"{company}"}</code> too.</p>
               <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => { setEmailTitle(DEFAULT_EMAIL_TITLE); setEmailBody(DEFAULT_EMAIL_BODY); }}>Use starter template</Button>
             </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="Recipients" value={recipientCount} />
              <SummaryStat label="Products" value={products.length} />
              <SummaryStat label="Files to generate" value={recipientCount} />
              <SummaryStat label="Format" value={format.toUpperCase()} />
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">File format
              <select className="mt-1.5 h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm" value={format} onChange={event => setFormat(event.target.value as "xlsx" | "csv")}>
                <option value="xlsx">XLSX spreadsheet</option>
                <option value="csv">CSV file</option>
              </select>
            </label>
             <div className="mt-4 min-w-0 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recipients</p>
              <div className="mt-2 space-y-1">{audienceType === "saved_audience" && selectedAudience ? <p className="text-sm text-slate-700">{selectedAudience.name} <span className="text-xs text-slate-400">· {recipientCount} audience members</span></p> : customers.length ? customers.map(customer => <p key={customer.id} className="truncate text-sm text-slate-700">{customer.email} <span className="text-xs text-slate-400">· {customerName(customer)}</span></p>) : <p className="text-sm text-slate-400">Choose an audience to review recipients.</p>}</div>
            </div>
            {!canSend && <p className="mt-3 text-xs font-medium text-amber-700">You can prepare the order form, but a Marketing Send permission is required to email it.</p>}
             <Button className="mt-4 h-auto min-h-10 w-full whitespace-normal px-3 py-2" disabled={!audienceReady || !products.length || !canSend} onClick={() => setReviewOpen(true)}><Check className="mr-2 h-4 w-4 shrink-0" /> Review & Send</Button>
          </section>

           <MarketingDeliveryLogPreview rows={deliveryLogs?.rows ?? []} total={deliveryLogs?.total ?? 0} loading={deliveryLogsLoading} title="Order Form sent history" onViewAll={() => setLocation("/marketing/log?type=order_form")} />
        </div>
      </div>

      <Dialog open={productListOpen} onOpenChange={setProductListOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Product List</DialogTitle><DialogDescription>Search and select products. Current availability is refreshed again when you send.</DialogDescription></DialogHeader>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input autoFocus className="pl-9" placeholder="Search product name or SKU…" value={productSearch} onChange={event => setProductSearch(event.target.value)} /></div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-lg border p-2">
            {productSearch.trim().length < 2 ? <p className="p-8 text-center text-sm text-slate-400">Enter at least two characters to search.</p> :
              productsLoading ? <div className="flex items-center justify-center p-8 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching products…</div> :
                visibleProducts.length ? visibleProducts.map(product => <ProductSearchRow key={product.id} product={product} selected={Boolean(selectedProducts[product.id])} onToggle={() => toggleProduct(product)} />) :
                  <p className="p-8 text-center text-sm text-slate-400">No products found.</p>}
          </div>
          <div className="flex justify-end"><Button onClick={() => setProductListOpen(false)}>Done ({products.length} selected)</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[calc(var(--app-height,100dvh)-1rem)] max-w-2xl overflow-y-auto overscroll-contain pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <DialogHeader><DialogTitle>Order Form Summary</DialogTitle><DialogDescription>One {format.toUpperCase()} file will be generated and sent separately to each recipient.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><SummaryStat label="Recipients" value={recipientCount} /><SummaryStat label="Products" value={products.length} /><SummaryStat label="Files" value={recipientCount} /></div>
            <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recipients</p><div className="space-y-1">{audienceType === "saved_audience" && selectedAudience ? <p className="text-sm text-slate-700">{selectedAudience.name} <span className="text-xs text-slate-400">· {recipientCount} members resolved at send time</span></p> : customers.map(customer => <p key={customer.id} className="text-sm text-slate-700">{customer.email} <span className="text-xs text-slate-400">· {customerName(customer)}</span></p>)}</div></div>
             <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</p><p className="mt-2 text-sm font-medium text-slate-800">{emailTitle || "No email title"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{emailBody || "No email message"}</p></div>
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">The files are built from current BigCommerce product and variant availability. This action does not create an order or modify inventory.</div>
             <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button className="w-full sm:w-auto" variant="outline" onClick={() => setReviewOpen(false)}>Back</Button><Button className="h-auto min-h-10 w-full whitespace-normal px-3 py-2 sm:w-auto" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>{sendMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" /> Sending…</> : <><Send className="mr-2 h-4 w-4 shrink-0" /> Generate & Send Order Forms</>}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-800">{value}</p></div>;
}

function ProductSearchRow({ product, selected, onToggle }: { product: OrderFormProduct; selected: boolean; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition ${selected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"}`}>
    {product.image ? <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"><Package className="h-5 w-5" /></span>}
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{product.name}</span><span className="block truncate text-xs text-slate-500">{product.sku || "No SKU"} · {productVariants(product).length} variant{productVariants(product).length === 1 ? "" : "s"}</span></span>
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${selected ? "bg-blue-600 text-white" : "border text-slate-400"}`}>{selected ? <Check className="h-4 w-4" /> : <PlusIcon />}</span>
  </button>;
}

function PlusIcon() {
  return <span className="text-lg leading-none">+</span>;
}

function SelectedProductCard({ product, onRemove }: { product: OrderFormProduct; onRemove: () => void }) {
  return <div className="rounded-lg border bg-slate-50 p-3">
    <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{product.name}</p><p className="text-xs text-slate-500">{productVariants(product).length} variant{productVariants(product).length === 1 ? "" : "s"}</p></div><button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${product.name}`}><X className="h-4 w-4" /></button></div>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead className="text-slate-400"><tr><th className="pb-1 font-medium">Variant</th><th className="pb-1 font-medium">SKU</th><th className="pb-1 font-medium">Availability</th></tr></thead><tbody className="divide-y divide-slate-200">{productVariants(product).map((variant, index) => <tr key={`${variant.id || variant.sku || "variant"}-${index}`}><td className="py-1.5 text-slate-700">{variantName(variant)}</td><td className="py-1.5 text-slate-500">{variant.sku || product.sku || "—"}</td><td className="py-1.5">{availability(variant.stock_level)}</td></tr>)}</tbody></table></div>
  </div>;
}

function HistoryRow({ entry }: { entry: any }) {
  const sent = entry.status === "sent";
  const failed = entry.status === "failed";
  return <div className="rounded-lg border p-3"><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-full p-1.5 ${sent ? "bg-emerald-50 text-emerald-600" : failed ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>{sent ? <CheckCircle2 className="h-4 w-4" /> : failed ? <XCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{entry.customer_name}</p><p className="truncate text-xs text-slate-500">{entry.recipient_email} · {entry.product_count} product{entry.product_count === 1 ? "" : "s"} · {String(entry.file_format || "xlsx").toUpperCase()}</p>{failed && <p className="mt-1 text-xs text-red-600">{entry.failure_reason || "Send failed"}</p>}</div><span className={`text-xs font-semibold ${sent ? "text-emerald-600" : failed ? "text-red-600" : "text-amber-600"}`}>{sent ? "Sent" : failed ? "Failed" : "Pending"}</span></div><p className="mt-2 text-[11px] text-slate-400">{entry.sent_at ? new Date(entry.sent_at).toLocaleString() : new Date(entry.created_at).toLocaleString()} · {entry.created_by}</p></div>;
}