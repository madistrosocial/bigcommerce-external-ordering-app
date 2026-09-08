import { useState, useRef, useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTimeService } from "@/hooks/useTimeService";
import * as api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, ChevronDown, ChevronUp, Send, Mail, Loader2,
  ShoppingCart, Edit, Trash2, User, Search, AlertCircle, UsersRound,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildDraftInvoiceOrderData,
  buildInvoiceHtml,
  generatePdfBase64,
} from "@/lib/invoice-renderer";

// ─── Draft row ────────────────────────────────────────────────────────────────

interface DraftRowProps {
  order: api.Order;
  isOfflineMode: boolean;
  onSubmit: (order: api.Order) => void;
  onLoadToCart: (order: api.Order) => void;
  onEdit: (order: api.Order) => void;
  onSendDraftInvoice: (order: api.Order) => void;
  onDelete: (order: api.Order) => void;
  isSubmitting: boolean;
}

function draftCustomerName(order: api.Order): string {
  const storedName = order.customer_name?.trim();
  if (storedName) return storedName;

  const billingAddress = order.billing_address as
    | { first_name?: string; last_name?: string }
    | undefined;
  const addressName = [billingAddress?.first_name, billingAddress?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return addressName || order.customer_email || "Unnamed customer";
}

function DraftRow({ order, isOfflineMode, onSubmit, onLoadToCart, onEdit, onSendDraftInvoice, onDelete, isSubmitting }: DraftRowProps) {
  const [open, setOpen] = useState(false);
  const fmt = useTimeService();
  const toggle = () => setOpen((v) => !v);

  return (
    <div className="border-b last:border-b-0" data-testid={`draft-row-${order.id}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        className={cn(
          "w-full flex items-center sm:grid sm:grid-cols-[24px_72px_minmax(180px,1fr)_120px_110px_55px_100px_24px] sm:items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer",
          open ? "bg-slate-50" : "hover:bg-slate-50",
        )}
        data-testid={`draft-toggle-${order.id}`}
      >
        <div className="w-2 h-2 rounded-full shrink-0 bg-slate-400 sm:justify-self-center" />
        <div className="hidden sm:block min-w-0 text-[13px] font-semibold text-blue-600">
          #{order.id}
          <Badge className="block w-fit bg-slate-500 text-[9px] h-4 px-1.5 font-medium mt-1">
            Draft
          </Badge>
        </div>
        <div className="flex-1 min-w-0 sm:flex-none">
          <p className="text-sm font-semibold text-slate-800 truncate">{draftCustomerName(order)}</p>
          <p className="text-xs text-slate-400">
            <span className="sm:hidden">{order.date && fmt.dateTime(order.date)}</span>
            {order.customer_email && (
              <span className="sm:ml-0 ml-2 text-slate-400">{order.customer_email}</span>
            )}
          </p>
        </div>
        <div className="hidden sm:block min-w-0 truncate text-[13px] text-slate-600">
          {order.created_by_name || "—"}
        </div>
        <div className="hidden sm:block text-[13px] text-slate-700 whitespace-nowrap">
          {order.date ? fmt.relative(order.date) : "—"}
        </div>
        <div className="hidden sm:block text-right text-[13px] font-medium text-slate-700 tabular-nums">
          {order.items.length}
        </div>
        <div className="text-right shrink-0 sm:mr-0 mr-1 sm:justify-self-end">
          <p className="text-sm font-semibold text-slate-900">${parseFloat(order.total).toFixed(2)}</p>
          <Badge className="sm:hidden bg-slate-500 text-[10px] h-4 px-1.5 font-medium mt-0.5">
            <FileText className="h-2.5 w-2.5 mr-0.5" />Draft
          </Badge>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </div>

      {open && (
        <div className="bg-slate-50 border-t px-4 py-3 space-y-3">
          {order.order_note && (
            <div className="flex gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700">
              <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div><span className="font-semibold">Note: </span>{order.order_note}</div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              Items ({order.items.length})
            </p>
            <div className="space-y-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-slate-700 flex-1 pr-4 truncate">
                    {item.quantity}× {item.name}
                    {item.sku && <span className="text-slate-400 ml-1.5 font-mono">{item.sku}</span>}
                  </span>
                  <span className="text-slate-700 font-medium shrink-0">
                    ${(parseFloat(item.price_at_sale) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t mt-2 pt-2 text-xs font-bold text-slate-800">
              Total: ${parseFloat(order.total).toFixed(2)}
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            {!isOfflineMode ? (
              <>
                <Button
                  className="w-full h-9 text-sm"
                  onClick={() => onSubmit(order)}
                  disabled={isSubmitting}
                  data-testid={`btn-submit-draft-${order.id}`}
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Submit to BigCommerce
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-9 text-sm"
                  onClick={() => onSendDraftInvoice(order)}
                  data-testid={`btn-send-draft-invoice-${order.id}`}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Draft Invoice
                </Button>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => onLoadToCart(order)}
                    data-testid={`btn-load-cart-${order.id}`}
                  >
                    <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Load to Cart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => onEdit(order)}
                    data-testid={`btn-edit-draft-${order.id}`}
                  >
                    <Edit className="h-3.5 w-3.5 mr-1" /> Edit Customer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onDelete(order)}
                    data-testid={`btn-delete-draft-${order.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-orange-600 text-center py-1">
                Go online to submit this draft order.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DraftOrders() {
  const { currentUser, isOfflineMode, addToCart, clearCart } = useStore();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const timeFmt = useTimeService();
  const canViewAllDrafts = hasPermission("orders", "view_all_drafts");
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");

  // Draft edit dialog state
  const [editingDraft, setEditingDraft] = useState<api.Order | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<api.BigCommerceCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<api.BigCommerceCustomer | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [draftInvoiceOpen, setDraftInvoiceOpen] = useState(false);
  const [draftInvoiceOrder, setDraftInvoiceOrder] = useState<api.Order | null>(null);
  const [draftInvoiceHtml, setDraftInvoiceHtml] = useState("");
  const [draftInvoiceTo, setDraftInvoiceTo] = useState("");
  const [draftInvoiceLoading, setDraftInvoiceLoading] = useState(false);
  const [draftInvoiceSending, setDraftInvoiceSending] = useState(false);
  const [draftInvoiceFrameReady, setDraftInvoiceFrameReady] = useState(false);
  const draftInvoiceFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!canViewAllDrafts) setShowAllDrafts(false);
  }, [canViewAllDrafts]);

  const { data: drafts = [], isLoading } = useQuery<api.Order[]>({
    queryKey: ["orders", "drafts", currentUser?.id, showAllDrafts && canViewAllDrafts ? "all" : "own"],
    queryFn: () => api.getDraftOrders(showAllDrafts && canViewAllDrafts),
    enabled: !!currentUser,
  });

  const visibleDrafts = useMemo(() => {
    const query = draftSearch.trim().toLowerCase();
    if (!query) return drafts;
    return drafts.filter((order) => {
      const searchable = [
        order.id,
        draftCustomerName(order),
        order.customer_email,
        order.created_by_name,
        ...order.items.map((item) => `${item.name} ${item.sku}`),
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [draftSearch, drafts]);

  const draftValue = visibleDrafts.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);
  const draftItemCount = visibleDrafts.reduce((sum, order) => sum + order.items.length, 0);

  // ── Draft actions ───────────────────────────────────────────────────────────

  const openDraftEdit = (order: api.Order) => {
    setEditingDraft(order);
    setCustomerName(draftCustomerName(order));
    setCustomerEmail(order.customer_email || "");
    setCustomerSearchQuery("");
    setSearchResults([]);
    setSelectedCustomer(null);
    setCustomerAddresses([]);
    setSelectedAddress(null);
  };

  const closeDraftEdit = () => {
    setEditingDraft(null);
    setSelectedCustomer(null);
    setSelectedAddress(null);
    setSearchResults([]);
  };

  const handleCustomerSearch = async () => {
    if (!customerSearchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await api.searchBigCommerceCustomers(customerSearchQuery.trim());
      setSearchResults(results);
      if (!results.length) toast({ title: "No customers found", description: "Try a different search term." });
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCustomer = async (customer: api.BigCommerceCustomer) => {
    setSelectedCustomer(customer);
    setSelectedAddress(null);
    try {
      const addresses = await api.getCustomerAddresses(customer.id);
      setCustomerAddresses(addresses);
      if (addresses.length === 1) setSelectedAddress(addresses[0]);
    } catch (e: any) {
      toast({ title: "Failed to load addresses", description: e.message, variant: "destructive" });
      setCustomerAddresses([]);
    }
  };

  const handleSubmitDraft = async () => {
    if (!editingDraft || !selectedCustomer || !selectedAddress) {
      toast({ title: "Please select a customer and address", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const billingAddress = {
        first_name: selectedAddress.first_name, last_name: selectedAddress.last_name,
        company: selectedAddress.company, street_1: selectedAddress.street_1,
        street_2: selectedAddress.street_2, city: selectedAddress.city,
        state: selectedAddress.state, zip: selectedAddress.zip,
        country: selectedAddress.country, country_iso2: selectedAddress.country_iso2,
        email: selectedCustomer.email, phone: selectedAddress.phone || selectedCustomer.phone,
      };
      const response = await api.submitDraftOrder(editingDraft.id!, {
        bigcommerce_customer_id: selectedCustomer.id,
        billing_address: billingAddress,
      });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      if (response.bigcommerce?.success) {
        toast({ title: "Order Submitted", description: `BigCommerce Order #${response.bigcommerce.order_id}` });
        closeDraftEdit();
      } else {
        toast({ title: "Submission Failed", description: response.bigcommerce?.error || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Submission Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const tryAutoSubmit = async (order: api.Order) => {
    setSubmittingId(order.id!);
    try {
      let customers: api.BigCommerceCustomer[] = [];
      if (order.customer_email) customers = await api.searchBigCommerceCustomers(order.customer_email);
      if (!customers.length && order.customer_name) customers = await api.searchBigCommerceCustomers(order.customer_name);
      if (!customers.length) { openDraftEdit(order); toast({ title: "Customer Not Found", description: "Please search manually." }); return; }

      const customer = customers[0];
      const addresses = await api.getCustomerAddresses(customer.id);
      if (!addresses.length) { openDraftEdit(order); setSelectedCustomer(customer); toast({ title: "No Address Found", description: "Customer has no addresses." }); return; }

      const addr = addresses[0];
      const response = await api.submitDraftOrder(order.id!, {
        bigcommerce_customer_id: customer.id,
        billing_address: {
          first_name: addr.first_name, last_name: addr.last_name, company: addr.company,
          street_1: addr.street_1, street_2: addr.street_2, city: addr.city,
          state: addr.state, zip: addr.zip, country: addr.country,
          country_iso2: addr.country_iso2, email: customer.email, phone: addr.phone || customer.phone,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      if (response.bigcommerce?.success) {
        toast({ title: "Order Submitted", description: `BigCommerce Order #${response.bigcommerce.order_id}` });
      } else {
        toast({ title: "Submission Failed", description: response.bigcommerce?.error || "Unknown error", variant: "destructive" });
      }
    } catch {
      openDraftEdit(order);
      toast({ title: "Auto-submit Failed", description: "Please search manually." });
    } finally {
      setSubmittingId(null);
    }
  };

  const deleteDraft = async (order: api.Order) => {
    try {
      await api.deleteOrder(order.id!);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      try {
        const ids = JSON.parse(localStorage.getItem("vansales_pos_draft_ids") || "[]") as number[];
        localStorage.setItem("vansales_pos_draft_ids", JSON.stringify(ids.filter((id) => id !== order.id)));
      } catch {}
      toast({ title: "Draft deleted" });
    } catch (e: any) {
      toast({ title: "Failed to delete draft", description: e.message, variant: "destructive" });
    }
  };

  const openDraftInvoice = async (order: api.Order) => {
    if (!order.id) return;
    setDraftInvoiceOpen(true);
    setDraftInvoiceOrder(order);
    setDraftInvoiceTo(order.customer_email || "");
    setDraftInvoiceHtml("");
    setDraftInvoiceFrameReady(false);
    setDraftInvoiceLoading(true);
    try {
      const [draftData, settings] = await Promise.all([
        api.getDraftInvoiceData(order.id),
        api.getInvoiceRenderSettings(),
      ]);
      const referenceNumber = String(draftData.order.id);
      setDraftInvoiceOrder(draftData.order);
      setDraftInvoiceTo(draftData.order.customer_email || "");
      setDraftInvoiceHtml(
        buildInvoiceHtml(
          buildDraftInvoiceOrderData(draftData.order),
          settings,
          timeFmt,
          {
            referenceNumber,
            documentTitle: "DRAFT INVOICE",
            referenceLabel: "Draft #",
            servedByFallback: draftData.served_by || currentUser?.name || "Agent",
          },
        ),
      );
    } catch (error: any) {
      toast({
        title: "Unable to prepare draft invoice",
        description: error.message,
        variant: "destructive",
      });
      setDraftInvoiceOpen(false);
    } finally {
      setDraftInvoiceLoading(false);
    }
  };

  const closeDraftInvoice = () => {
    if (draftInvoiceSending) return;
    setDraftInvoiceOpen(false);
    setDraftInvoiceOrder(null);
    setDraftInvoiceHtml("");
    setDraftInvoiceFrameReady(false);
  };

  const handleSendDraftInvoice = async () => {
    const recipient = draftInvoiceTo.trim();
    if (!draftInvoiceOrder?.id) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      toast({
        title: "Valid email required",
        description: "Enter a valid recipient email address.",
        variant: "destructive",
      });
      return;
    }
    if (!draftInvoiceFrameReady) {
      toast({
        title: "Draft invoice is still loading",
        description: "Please wait a moment and try again.",
      });
      return;
    }

    setDraftInvoiceSending(true);
    try {
      const pdfBase64 = await generatePdfBase64(draftInvoiceFrameRef.current);
      await api.sendDraftInvoiceEmail(draftInvoiceOrder.id, {
        to: recipient,
        pdf_base64: pdfBase64,
      });
      toast({
        title: "Draft invoice sent",
        description: `Draft #${draftInvoiceOrder.id} was sent to ${recipient}.`,
      });
      setDraftInvoiceOpen(false);
    } catch (error: any) {
      toast({
        title: "Draft invoice email failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDraftInvoiceSending(false);
    }
  };

  const loadDraftToCart = async (order: api.Order) => {
    clearCart();
    // Fetch fresh stock so max_purchase_quantity is populated on every item —
    // without this, the max-qty override bypass is skipped for drafted carts.
    const bcIds = [...new Set(order.items.map(i => i.bigcommerce_product_id).filter((id): id is number => !!id))];
    const stockMap = new Map<number, api.StockInfo>();
    if (bcIds.length > 0) {
      try {
        const stockData = await api.refreshProductStock(bcIds);
        stockData.forEach(s => stockMap.set(s.bigcommerce_id, s));
      } catch {}
    }
    order.items.forEach((item) => {
      const info = item.bigcommerce_product_id ? stockMap.get(item.bigcommerce_product_id) : undefined;
      const freshVariantInfo = item.variant_id ? info?.variants.find(v => v.id === item.variant_id) : undefined;
      const product: any = {
        id: item.product_id ?? 0, name: item.name, sku: item.sku,
        price: parseFloat(item.price_at_sale), image: item.image || "",
        description: "", stock_level: info?.stock_level ?? 0, is_pinned: false,
        bigcommerce_id: item.bigcommerce_product_id ?? 0, variants: [],
        max_purchase_quantity: info?.max_purchase_quantity ?? null,
      };
      const variant = item.variant_id ? {
        id: item.variant_id, sku: item.sku, price: parseFloat(item.price_at_sale),
        option_values: item.variant_option_values || [],
        stock_level: freshVariantInfo?.stock_level ?? 0,
        max_purchase_quantity: freshVariantInfo?.max_purchase_quantity ?? null,
      } : undefined;
      addToCart(product, item.quantity, variant, parseFloat(item.price_at_sale), parseFloat(item.price_at_sale), null, null);
    });
    if (order.bigcommerce_customer_id) {
      localStorage.setItem("vansales_restore_customer", JSON.stringify({
        bcId: order.bigcommerce_customer_id,
        name: draftCustomerName(order),
        email: order.customer_email,
      }));
    }
    try {
      const posDraftIds = JSON.parse(localStorage.getItem("vansales_pos_draft_ids") || "[]") as number[];
      if (order.id && posDraftIds.includes(order.id)) {
        toast({ title: "Draft loaded", description: "Review and submit from POS." });
        setLocation("/pos");
        return;
      }
    } catch {}
    toast({ title: "Draft loaded to cart" });
    setLocation("/cart");
  };

  const renderDraftRow = (order: api.Order) => (
    <DraftRow
      key={order.id}
      order={order}
      isOfflineMode={isOfflineMode}
      onSubmit={tryAutoSubmit}
      onLoadToCart={loadDraftToCart}
      onEdit={openDraftEdit}
      onSendDraftInvoice={openDraftInvoice}
      onDelete={deleteDraft}
      isSubmitting={submittingId === order.id}
    />
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {!isLoading && (
        <div className="border-b bg-white px-3 sm:px-4 py-2 sm:py-3 shrink-0">
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {[
              { label: "Drafts", value: visibleDrafts.length.toLocaleString(), color: "text-slate-500" },
              { label: "Draft Value", value: `$${draftValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: "text-blue-500" },
              { label: "Customers", value: new Set(visibleDrafts.map((order) => draftCustomerName(order))).size.toLocaleString(), color: "text-green-500" },
              { label: "Items", value: draftItemCount.toLocaleString(), color: "text-amber-500" },
            ].map((card) => (
              <div key={card.label} className="min-w-[108px] sm:min-w-[132px] rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
                <p className={cn("text-base sm:text-lg font-bold leading-tight tabular-nums", card.color)}>{card.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <header className="border-b bg-white px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-800">Drafts</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {visibleDrafts.length.toLocaleString()} draft{visibleDrafts.length !== 1 ? "s" : ""}
              {draftSearch && drafts.length !== visibleDrafts.length ? ` of ${drafts.length}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canViewAllDrafts && (
              <Button
                variant={showAllDrafts ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setShowAllDrafts((value) => !value)}
                data-testid="button-toggle-all-drafts"
              >
                <UsersRound className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{showAllDrafts ? "My Drafts" : "All Users"}</span>
              </Button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Search drafts…"
                className="pl-8 h-8 text-sm w-40 sm:w-56"
                data-testid="input-draft-search"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
          </div>
        ) : visibleDrafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <FileText className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">{draftSearch ? "No drafts found" : "No draft orders"}</p>
            <p className="text-xs mt-1">{draftSearch ? "Try a different search." : "Saved draft orders will appear here."}</p>
          </div>
        ) : (
          <div className="w-full">
            <div className="hidden sm:grid grid-cols-[24px_72px_minmax(180px,1fr)_120px_110px_55px_100px_24px] items-center border-b bg-slate-50 px-4 py-2.5 sticky top-0 z-10 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <span />
              <span>Draft #</span>
              <span>Customer</span>
              <span>Created By</span>
              <span>Date</span>
              <span className="text-right">Items</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            <div className="bg-white border-b">
              {visibleDrafts.map(renderDraftRow)}
            </div>
          </div>
        )}
      </div>

      {/* Draft edit dialog */}
      <Dialog open={!!editingDraft} onOpenChange={(open) => !open && closeDraftEdit()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Draft Order</DialogTitle>
            <DialogDescription>Search for a BigCommerce customer to submit this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} data-testid="input-draft-customer-name" />
            </div>
            <div className="space-y-2">
              <Label>Customer Email</Label>
              <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} data-testid="input-draft-customer-email" />
            </div>
            <div className="border-t pt-4">
              <Label className="mb-2 block">Search BigCommerce Customers</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name or email…"
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomerSearch()}
                  data-testid="input-customer-search"
                />
                <Button onClick={handleCustomerSearch} disabled={isSearching} data-testid="btn-customer-search">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <Label>Select Customer</Label>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {searchResults.map((customer) => (
                    <div
                      key={customer.id}
                      className={cn("p-3 border rounded cursor-pointer transition-colors", selectedCustomer?.id === customer.id ? "border-primary bg-primary/5" : "hover:bg-slate-50")}
                      onClick={() => handleSelectCustomer(customer)}
                      data-testid={`customer-option-${customer.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="font-medium text-sm">{customer.first_name} {customer.last_name}
                            {customer.company && <span className="text-slate-500 font-normal"> | {customer.company}</span>}
                          </div>
                          <div className="text-xs text-slate-500">{customer.email}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedCustomer && customerAddresses.length > 0 && (
              <div className="space-y-2">
                <Label>Select Shipping Address</Label>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {customerAddresses.map((addr, idx) => (
                    <div
                      key={idx}
                      className={cn("p-3 border rounded cursor-pointer transition-colors", selectedAddress === addr ? "border-primary bg-primary/5" : "hover:bg-slate-50")}
                      onClick={() => setSelectedAddress(addr)}
                      data-testid={`address-option-${idx}`}
                    >
                      <div className="text-sm">
                        <div className="font-medium">{addr.first_name} {addr.last_name}</div>
                        <div className="text-xs text-slate-500">{addr.street_1}, {addr.city}, {addr.state} {addr.zip}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedCustomer && customerAddresses.length === 0 && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
                This customer has no shipping addresses in BigCommerce.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDraftEdit}>Cancel</Button>
            <Button onClick={handleSubmitDraft} disabled={!selectedCustomer || !selectedAddress || isSubmitting} data-testid="btn-submit-edited-draft">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Submit Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={draftInvoiceOpen} onOpenChange={(open) => !open && closeDraftInvoice()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Draft Invoice</DialogTitle>
            <DialogDescription>
              A PDF marked “DRAFT INVOICE” will be attached. The saved draft will not be submitted or changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="draft-invoice-email">To</Label>
              <Input
                id="draft-invoice-email"
                type="email"
                placeholder="customer@example.com"
                value={draftInvoiceTo}
                onChange={(event) => setDraftInvoiceTo(event.target.value)}
                disabled={draftInvoiceLoading || draftInvoiceSending}
                data-testid="input-draft-invoice-email"
              />
            </div>
            {draftInvoiceLoading && (
              <div className="flex items-center text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Preparing draft invoice…
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDraftInvoice} disabled={draftInvoiceSending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendDraftInvoice}
              disabled={draftInvoiceLoading || draftInvoiceSending || !draftInvoiceFrameReady}
              data-testid="btn-confirm-send-draft-invoice"
            >
              {draftInvoiceSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Send Draft Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {draftInvoiceHtml && (
        <iframe
          ref={draftInvoiceFrameRef}
          srcDoc={draftInvoiceHtml}
          title="Draft Invoice PDF Source"
          onLoad={() => setDraftInvoiceFrameReady(true)}
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "850px",
            height: "1200px",
            border: 0,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
