import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTimeService } from "@/hooks/useTimeService";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, ShoppingCart, ChevronLeft, ChevronRight,
  Trash2, Plus, Minus, X, Package, History, ChevronDown, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const BC_STATUSES: Record<number, string> = {
  0: "Incomplete", 1: "Pending", 2: "Shipped", 3: "Partially Shipped",
  4: "Refunded", 5: "Cancelled", 6: "Declined", 7: "Awaiting Payment",
  8: "Awaiting Pickup", 9: "Awaiting Shipment", 10: "Completed",
  11: "Awaiting Fulfillment", 12: "Manual Verification Required",
  13: "Disputed", 14: "Partially Refunded",
};

const STATUS_COLORS: Record<number, string> = {
  0: "bg-slate-400", 1: "bg-blue-500", 2: "bg-green-600", 3: "bg-teal-500",
  4: "bg-purple-500", 5: "bg-red-500", 6: "bg-red-700", 7: "bg-amber-400",
  8: "bg-amber-500", 9: "bg-orange-500", 10: "bg-green-700",
  11: "bg-sky-500", 12: "bg-yellow-600", 13: "bg-red-400", 14: "bg-violet-500",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BcOrderListItem {
  id: number;
  status: string;
  status_id: number;
  date_created: string;
  customer_id: number;
  billing_address: { first_name: string; last_name: string; email: string; company: string };
  total_inc_tax: string;
  items_total: number;
  payment_method: string;
}

interface BcLineItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id?: number;
  name: string;
  sku: string;
  quantity: number;
  base_price: string;
  price_inc_tax: string;
  price_ex_tax: string;
  total_inc_tax: string;
  product_options?: any[];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchBcOrders(page: number, limit: number, filter: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filter === "oldest") { params.set("sort", "oldest"); }
  else if (!isNaN(Number(filter))) { params.set("status_id", filter); }
  const res = await fetch(`/api/bigcommerce/orders/list?${params}`, { headers: api.getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to load orders");
  return res.json() as Promise<{ orders: BcOrderListItem[]; hasMore: boolean; page: number }>;
}

async function fetchBcOrderDetail(orderId: number) {
  const res = await fetch(`/api/bigcommerce/orders/${orderId}/detail`, { headers: api.getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to load order detail");
  return res.json() as Promise<{ order: any; products: BcLineItem[] }>;
}

async function updateLineItem(orderId: number, lineId: number, qty: number, price: number) {
  const res = await fetch(`/api/bigcommerce/orders/${orderId}/products/${lineId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...api.getAuthHeaders() },
    body: JSON.stringify({ quantity: qty, price_inc_tax: price, price_ex_tax: price }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Update failed");
  return data;
}

async function deleteLineItem(orderId: number, lineId: number) {
  const res = await fetch(`/api/bigcommerce/orders/${orderId}/products/${lineId}`, {
    method: "DELETE",
    headers: api.getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Delete failed");
  return data;
}

async function addLineItem(orderId: number, payload: any) {
  const res = await fetch(`/api/bigcommerce/orders/${orderId}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...api.getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to add product");
  return data;
}

async function searchBcProduct(query: string, userId: number) {
  return api.agentBigCommerceSearch(query, userId);
}

async function fetchPriceHistoryForCustomer(customerId: number, productBcId: number, variantId?: number) {
  const params = new URLSearchParams({ product_id: String(productBcId) });
  if (variantId) params.set("variant_id", String(variantId));
  const res = await fetch(`/api/orders/customer/${customerId}/price-history?${params}`, { headers: api.getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.priceHistory || []) as api.PriceHistoryEntry[];
}

// ─── PriceControls ────────────────────────────────────────────────────────────

function PriceControls({
  lineItem,
  orderId,
  customerId,
  onSaved,
  onDeleted,
}: {
  lineItem: BcLineItem;
  orderId: number;
  customerId: number;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const fmt = useTimeService();
  const [qty, setQty] = useState(lineItem.quantity);
  const [price, setPrice] = useState(parseFloat(lineItem.price_inc_tax || lineItem.base_price).toFixed(2));
  const [discPct, setDiscPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<api.PriceHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const basePrice = parseFloat(lineItem.base_price || lineItem.price_inc_tax);

  const computedPrice = () => {
    if (discPct !== "") {
      const pct = parseFloat(discPct);
      if (!isNaN(pct) && pct >= 0 && pct <= 100) return (basePrice * (1 - pct / 100)).toFixed(2);
    }
    return price;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateLineItem(orderId, lineItem.id, qty, parseFloat(computedPrice()));
      toast({ title: "Line item updated" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteLineItem(orderId, lineItem.id);
      toast({ title: "Line item removed" });
      onDeleted();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const handleLastPrice = async () => {
    if (!customerId) return;
    setLoadingHistory(true);
    try {
      const hist = await fetchPriceHistoryForCustomer(customerId, lineItem.product_id, lineItem.variant_id);
      if (hist.length === 0) { toast({ title: "No price history found" }); return; }
      setPrice(parseFloat(hist[0].price).toFixed(2));
      setDiscPct("");
    } catch {
      toast({ title: "Could not load history", variant: "destructive" });
    } finally { setLoadingHistory(false); }
  };

  const handleOpenHistory = async () => {
    if (historyOpen) { setHistoryOpen(false); return; }
    if (history.length === 0) {
      setLoadingHistory(true);
      try {
        const hist = await fetchPriceHistoryForCustomer(customerId, lineItem.product_id, lineItem.variant_id);
        setHistory(hist);
      } catch {} finally { setLoadingHistory(false); }
    }
    setHistoryOpen(true);
  };

  const displayPrice = parseFloat(computedPrice());
  const isDiscounted = displayPrice < basePrice;

  return (
    <div className="mt-2 space-y-2">
      {/* row 1: qty + price display */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Qty */}
        <div className="flex items-center gap-1 border rounded-md px-1 py-0.5 bg-slate-50">
          <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 disabled:opacity-40"
            onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>
            <Minus className="h-3 w-3" />
          </button>
          <Input type="number" min="1" className="w-12 h-6 text-center text-xs font-bold bg-white px-0.5"
            value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
          <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200"
            onClick={() => setQty(qty + 1)}>
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Price display */}
        <div className="text-sm font-bold ml-1">
          <span className={isDiscounted ? "text-red-600" : "text-slate-900"}>${displayPrice.toFixed(2)}</span>
          {isDiscounted && <span className="text-xs text-slate-400 line-through ml-1">${basePrice.toFixed(2)}</span>}
        </div>

        {/* Last $ */}
        {customerId > 0 && (
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={loadingHistory} onClick={handleLastPrice}>
            {loadingHistory ? <Loader2 className="h-3 w-3 animate-spin" /> : "Last $"}
          </Button>
        )}

        {/* History */}
        {customerId > 0 && (
          <div className="relative">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" disabled={loadingHistory} onClick={handleOpenHistory}>
              <History className="h-3 w-3" /> History
              <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", historyOpen && "rotate-180")} />
            </Button>
            {historyOpen && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-white border rounded-md shadow-lg z-50 py-1 max-h-48 overflow-auto"
                onMouseDown={(e) => e.preventDefault()}>
                {history.length === 0
                  ? <p className="px-3 py-2 text-xs text-slate-500">No history found</p>
                  : history.map((h, i) => (
                    <button key={i} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 border-b last:border-0"
                      onClick={() => { setPrice(parseFloat(h.price).toFixed(2)); setDiscPct(""); setHistoryOpen(false); }}>
                      <p className="text-sm font-bold text-green-600">${parseFloat(h.price).toFixed(2)}</p>
                      <p className="text-xs text-slate-400">
                        {h.date ? fmt.date(h.date) : ""}
                        {h.orderId ? ` · #${h.orderId}` : ""}
                      </p>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* row 2: disc % + price override */}
      <div className="flex items-center gap-2">
        <Input type="number" min="0" max="100" placeholder="Disc (%)"
          className="w-20 h-7 text-xs"
          value={discPct}
          onChange={(e) => { setDiscPct(e.target.value); }}
        />
        <Input type="number" min="0" step="0.01" placeholder="Price ($)"
          className="w-24 h-7 text-xs"
          value={discPct !== "" ? "" : price}
          onChange={(e) => { setPrice(e.target.value); setDiscPct(""); }}
        />
      </div>

      {/* row 3: save + delete */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 text-xs px-3" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={handleDelete} disabled={deleting}>
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 mr-1" />Remove</>}
        </Button>
      </div>
    </div>
  );
}

// ─── AddProductSearch ─────────────────────────────────────────────────────────

function AddProductSearch({ orderId, onAdded }: { orderId: number; onAdded: () => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<api.Product | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addPrice, setAddPrice] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // We pull userId from localStorage since we don't have store here
  const getUserId = () => {
    try { return JSON.parse(localStorage.getItem("vansales_user") || "{}").id || 0; } catch { return 0; }
  };

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResult(null); return; }
    setSearching(true);
    try {
      const res = await searchBcProduct(q.trim(), getUserId());
      setResult(res);
      if (res.resultType === "variant") {
        setSelectedProduct(res.product);
        setSelectedVariant(res.variant);
        setAddPrice(parseFloat(res.variant.price || res.product.price).toFixed(2));
        setAddQty(1);
      } else {
        setSelectedProduct(null);
        setSelectedVariant(null);
      }
    } catch {
      setResult(null);
    } finally { setSearching(false); }
  }, []);

  const handleChange = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  const handleSelectProduct = (product: api.Product) => {
    const variants = Array.isArray(product.variants)
      ? product.variants
      : (() => { try { return JSON.parse(product.variants as any); } catch { return []; } })();
    setSelectedProduct(product);
    if (variants.length === 1) {
      setSelectedVariant(variants[0]);
      setAddPrice(parseFloat(variants[0].price || product.price).toFixed(2));
    } else {
      setSelectedVariant(null);
      setAddPrice(parseFloat(product.price).toFixed(2));
    }
    setAddQty(1);
  };

  const handleSelectVariant = (v: any) => {
    setSelectedVariant(v);
    setAddPrice(parseFloat(v.price || selectedProduct?.price || "0").toFixed(2));
  };

  const handleAdd = async () => {
    if (!selectedProduct) return;
    const price = parseFloat(addPrice) || parseFloat(selectedProduct.price);
    setAdding(true);
    try {
      await addLineItem(orderId, {
        product_id: selectedProduct.bigcommerce_id,
        variant_id: selectedVariant?.id || undefined,
        quantity: addQty,
        price_inc_tax: price,
        price_ex_tax: price,
        name: selectedProduct.name,
        sku: selectedVariant?.sku || selectedProduct.sku,
      });
      toast({ title: "Product added to order" });
      setQuery(""); setResult(null); setSelectedProduct(null); setSelectedVariant(null);
      setAddQty(1); setAddPrice("");
      inputRef.current?.focus();
      onAdded();
    } catch (e: any) {
      toast({ title: "Add failed", description: e.message, variant: "destructive" });
    } finally { setAdding(false); }
  };

  const variants = selectedProduct ? (
    Array.isArray(selectedProduct.variants) ? selectedProduct.variants
    : (() => { try { return JSON.parse((selectedProduct as any).variants); } catch { return []; } })()
  ) : [];

  return (
    <div className="border rounded-lg bg-white p-3 space-y-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
        <Plus className="h-3 w-3" /> Add Product
      </p>

      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search by SKU, UPC, barcode or title…"
          className="pl-8 h-8 text-sm"
          data-testid="input-bc-add-search"
        />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>

      {/* Search results: product list */}
      {result?.resultType === "products" && result.products.length > 0 && !selectedProduct && (
        <div className="border rounded-md overflow-hidden max-h-52 overflow-y-auto">
          {result.products.map((p: api.Product) => (
            <button key={p.id}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 border-b last:border-0 text-left"
              onClick={() => handleSelectProduct(p)}
              data-testid={`search-result-${p.id}`}
            >
              {p.image
                ? <img src={p.image} alt={p.name} className="w-8 h-8 object-cover rounded border shrink-0" />
                : <div className="w-8 h-8 bg-slate-100 rounded border flex items-center justify-center shrink-0"><Package className="h-4 w-4 text-slate-300" /></div>}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-400">{p.sku} · ${parseFloat(p.price).toFixed(2)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Variant picker when product selected */}
      {selectedProduct && variants.length > 1 && !selectedVariant && (
        <div>
          <p className="text-xs text-slate-500 mb-1.5 font-medium">{selectedProduct.name} — choose a variant:</p>
          <div className="border rounded-md overflow-hidden max-h-44 overflow-y-auto">
            {variants.map((v: any) => (
              <button key={v.id}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 border-b last:border-0 text-left"
                onClick={() => handleSelectVariant(v)}
                data-testid={`variant-option-${v.id}`}
              >
                <div>
                  <p className="text-xs font-medium text-slate-800">
                    {(v.option_values || []).map((ov: any) => ov.label).join(" / ") || v.sku}
                  </p>
                  <p className="text-xs text-slate-400">SKU: {v.sku}</p>
                </div>
                <p className="text-sm font-bold text-slate-800 shrink-0 ml-3">${parseFloat(v.price).toFixed(2)}</p>
              </button>
            ))}
          </div>
          <button className="text-xs text-slate-400 mt-1 hover:underline" onClick={() => setSelectedProduct(null)}>← Back</button>
        </div>
      )}

      {/* Add form: when variant is chosen (or single/no-variant product) */}
      {selectedProduct && (variants.length <= 1 || selectedVariant) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 rounded p-2">
            {selectedProduct.image
              ? <img src={selectedProduct.image} className="w-8 h-8 object-cover rounded border" alt="" />
              : <Package className="h-5 w-5 text-slate-300" />}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{selectedProduct.name}</p>
              {selectedVariant && (
                <p className="text-slate-400">
                  {(selectedVariant.option_values || []).map((ov: any) => ov.label).join(" / ") || selectedVariant.sku}
                </p>
              )}
            </div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => { setSelectedProduct(null); setSelectedVariant(null); }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 w-8">Qty</label>
            <div className="flex items-center gap-1 border rounded px-1 py-0.5 bg-slate-50">
              <button className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 rounded disabled:opacity-40"
                onClick={() => setAddQty(Math.max(1, addQty - 1))} disabled={addQty <= 1}>
                <Minus className="h-3 w-3" />
              </button>
              <Input type="number" min="1" className="w-12 h-6 text-center text-xs font-bold bg-white px-0.5"
                value={addQty} onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value) || 1))} />
              <button className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 rounded"
                onClick={() => setAddQty(addQty + 1)}>
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <label className="text-xs text-slate-500">Price $</label>
            <Input type="number" min="0" step="0.01" className="w-24 h-7 text-xs"
              value={addPrice} onChange={(e) => setAddPrice(e.target.value)} />
          </div>
          <Button size="sm" className="w-full h-8 text-xs" onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Add to Order
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── BCOrderDetail Modal ──────────────────────────────────────────────────────

function BCOrderDetailModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fmt = useTimeService();
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["bc-order-detail", orderId],
    queryFn: () => fetchBcOrderDetail(orderId),
    staleTime: 30_000,
  });

  const order = data?.order;
  const products = data?.products ?? [];
  const customerId = order?.customer_id ?? 0;

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["bc-order-detail", orderId] });
    queryClient.invalidateQueries({ queryKey: ["bc-orders"] });
    refetch();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="w-[98vw] max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="dialog-bc-order-detail"
      >
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">
              BC Order #{orderId}
              {order && (
                <span className={cn("ml-2 text-[11px] text-white px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[order.status_id] || "bg-slate-400")}>
                  {order.status}
                </span>
              )}
            </DialogTitle>
          </div>
          {order && (
            <p className="text-xs text-slate-500 mt-1">
              {order.billing_address?.first_name} {order.billing_address?.last_name}
              {order.billing_address?.email && ` · ${order.billing_address.email}`}
              {order.date_created && ` · ${fmt.date(order.date_created)}`}
              {" · "}<span className="font-semibold text-slate-800">${parseFloat(order.total_inc_tax || "0").toFixed(2)}</span>
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading order…
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{(error as Error).message}</p>}

          {/* Line items */}
          {!isLoading && products.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <p className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b bg-slate-50">
                Line Items ({products.length})
              </p>
              {products.map((item) => (
                <div key={item.id} className="border-b last:border-0" data-testid={`bc-line-${item.id}`}>
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedLine(expandedLine === item.id ? null : item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        SKU: {item.sku}
                        {item.product_options && item.product_options.length > 0 && (
                          <span className="ml-2">{item.product_options.map((o: any) => o.display_value).join(", ")}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-900">×{item.quantity}</p>
                      <p className="text-xs text-slate-500">${parseFloat(item.price_inc_tax).toFixed(2)}/ea</p>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0 transition-transform", expandedLine === item.id && "rotate-180")} />
                  </button>

                  {expandedLine === item.id && (
                    <div className="px-3 pb-3 bg-slate-50 border-t">
                      <PriceControls
                        lineItem={item}
                        orderId={orderId}
                        customerId={customerId}
                        onSaved={handleSaved}
                        onDeleted={handleSaved}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add product */}
          {!isLoading && <AddProductSearch orderId={orderId} onAdded={handleSaved} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusDot({ statusId }: { statusId: number }) {
  return <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", STATUS_COLORS[statusId] || "bg-slate-400")} />;
}

// ─── BCOrders Page ────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  ...Object.entries(BC_STATUSES).map(([id, name]) => ({ value: id, label: name })),
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function BCOrders() {
  const fmt = useTimeService();
  const [filter, setFilter] = useState("newest");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [orderSearch, setOrderSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["bc-orders", page, limit, filter],
    queryFn: () => fetchBcOrders(page, limit, filter),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const orders = data?.orders ?? [];
  const hasMore = data?.hasMore ?? false;

  // Client-side search by BC order number
  const filtered = orderSearch.trim()
    ? orders.filter((o) => String(o.id).includes(orderSearch.trim()))
    : orders;

  const handleSearch = () => { setOrderSearch(searchInput.trim()); setPage(1); };
  const handleFilterChange = (v: string) => { setFilter(v); setPage(1); };
  const handleLimitChange = (v: string) => { setLimit(Number(v)); setPage(1); };

  return (
    <div className="bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0 flex-wrap gap-y-2">
        <ShoppingCart className="h-5 w-5 text-slate-600 shrink-0" />
        <h1 className="text-base font-bold text-slate-800">BC Orders</h1>

        {/* Sort/filter dropdown */}
        <div className="ml-auto">
          <Select value={filter} onValueChange={handleFilterChange}>
            <SelectTrigger className="h-8 text-xs w-48" data-testid="bc-orders-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Search bar */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by BC order #…"
            className="pl-8 h-8 text-sm"
            data-testid="input-bc-order-search"
          />
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSearch}>Search</Button>
        {orderSearch && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setOrderSearch(""); setSearchInput(""); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* List */}
      <div className="px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading orders…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-red-400 text-sm">
            {(error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No orders found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setSelectedOrderId(order.id)}
                data-testid={`bc-order-row-${order.id}`}
              >
                <StatusDot statusId={order.status_id} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    #{order.id}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {order.billing_address.first_name} {order.billing_address.last_name}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {order.date_created && fmt.dateTime(order.date_created)}
                    <span className="ml-2">{BC_STATUSES[order.status_id] ?? order.status}</span>
                    {order.items_total > 0 && <span className="ml-2">{order.items_total} item{order.items_total !== 1 ? "s" : ""}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/invoice/${order.id}`, "_blank");
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                    title="Print Invoice"
                    data-testid={`btn-invoice-bc-${order.id}`}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-sm font-bold text-slate-900">${parseFloat(order.total_inc_tax).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: per-page + pagination */}
      <div className="bg-white border-t px-4 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Show</span>
          <Select value={String(limit)} onValueChange={handleLimitChange}>
            <SelectTrigger className="h-7 text-xs w-16" data-testid="bc-orders-per-page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-500">per page</span>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="bc-orders-prev">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-slate-600 min-w-[3rem] text-center">Page {page}</span>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)} data-testid="bc-orders-next">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Order detail modal */}
      {selectedOrderId !== null && (
        <BCOrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </div>
  );
}
