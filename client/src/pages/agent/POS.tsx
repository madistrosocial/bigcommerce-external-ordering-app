import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/toaster";
import {
  Search, Loader2, X, Plus, Minus, Trash2, User,
  ShoppingCart, LogOut, AlertCircle, CheckCircle2, CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import type { CartItem } from "@/lib/store";

type VariantPicker =
  | { mode: "single"; product: api.Product; variants: any[] }
  | { mode: "multi"; products: api.Product[] };

function getVariants(product: api.Product): any[] {
  if (!product.variants) return [];
  if (Array.isArray(product.variants)) return product.variants;
  try { return JSON.parse(product.variants as unknown as string); } catch { return []; }
}

export default function POSPage() {
  const {
    currentUser, cart, addToCart,
    removeFromCartAtIndex, updateCartQuantityAtIndex, updateCartItemAtIndex,
    clearCart, getCartTotal, isOfflineMode, setOfflineMode,
  } = useStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const canSearchBC = currentUser?.allow_bigcommerce_search ?? false;

  const { data: pinnedProducts = [] } = useQuery({
    queryKey: ["products", "pinned"],
    queryFn: api.getPinnedProducts,
    enabled: !canSearchBC,
  });

  // ── Search ───────────────────────────────────────────────
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [variantPicker, setVariantPicker] = useState<VariantPicker | null>(null);

  // ── Cart / active item ────────────────────────────────────
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // Per-line UI state (discount inputs / manual price inputs — flushed to store on blur)
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});

  // ── Customer ─────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<api.BigCommerceCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<api.BigCommerceCustomer | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<api.BigCommerceAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<api.BigCommerceAddress | null>(null);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [isCustomerSearching, setIsCustomerSearching] = useState(false);
  const customerDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orderNote, setOrderNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Online/offline ────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => setOfflineMode(false);
    const onOffline = () => setOfflineMode(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [setOfflineMode]);

  // ── Focus helpers ─────────────────────────────────────────
  const focusSearch = useCallback(() => {
    setTimeout(() => searchRef.current?.focus(), 60);
  }, []);

  useEffect(() => { focusSearch(); }, []);

  const handlePageClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest("input, textarea, button, [role='dialog'], select, [data-nofocus]")) {
      focusSearch();
    }
  };

  // ── Auto-add helper ───────────────────────────────────────
  const autoAddVariant = useCallback((product: api.Product, variant: any) => {
    const price = parseFloat(variant?.price || product.price);
    const beforeIds = new Set(useStore.getState().cart.map((i) => i.lineId));
    addToCart(product, 1, variant ?? undefined, price, price, null, null);
    setTimeout(() => {
      const after = useStore.getState().cart;
      const newLine = after.find((i) => !beforeIds.has(i.lineId));
      if (newLine) {
        setActiveLineId(newLine.lineId);
      } else {
        const merged = after.find(
          (i) => i.product.id === product.id && (!variant || i.variant?.id === variant?.id)
        );
        if (merged) setActiveLineId(merged.lineId);
      }
    }, 0);
    toast({
      title: "Added to cart",
      description: `${variant?.sku || product.sku} × 1`,
      duration: 1500,
    });
  }, [addToCart, toast]);

  // ── Search logic ──────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setIsSearching(true);
    try {
      if (canSearchBC && currentUser) {
        const result = await api.agentBigCommerceSearch(trimmed, currentUser.id);
        if (result.resultType === "variant") {
          autoAddVariant(result.product, result.variant);
          setSearch("");
          focusSearch();
        } else {
          const { products } = result;
          if (products.length === 0) {
            toast({ title: "No results", description: `Nothing found for "${trimmed}"` });
            return;
          }
          if (products.length === 1) {
            const p = products[0];
            const variants = getVariants(p);
            if (variants.length <= 1) {
              autoAddVariant(p, variants[0] ?? null);
              setSearch("");
              focusSearch();
              return;
            }
            setVariantPicker({ mode: "single", product: p, variants });
          } else {
            setVariantPicker({ mode: "multi", products });
          }
        }
      } else {
        const lower = trimmed.toLowerCase();
        const matches = pinnedProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(lower) ||
            p.sku.toLowerCase().includes(lower)
        );
        if (matches.length === 0) {
          toast({ title: "No results", description: `Nothing found for "${trimmed}"` });
          return;
        }
        if (matches.length === 1) {
          const p = matches[0];
          const variants = getVariants(p);
          if (variants.length <= 1) {
            autoAddVariant(p, variants[0] ?? null);
            setSearch("");
            focusSearch();
            return;
          }
          setVariantPicker({ mode: "single", product: p, variants });
        } else {
          setVariantPicker({ mode: "multi", products: matches });
        }
      }
    } catch (e: any) {
      toast({ title: "Search error", description: e.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  }, [canSearchBC, currentUser, pinnedProducts, autoAddVariant, focusSearch, toast]);

  useEffect(() => {
    if (!search.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(search), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, doSearch]);

  // ── Customer search ───────────────────────────────────────
  useEffect(() => {
    if (isOfflineMode || !customerSearch || selectedCustomer) return;
    if (customerDebRef.current) clearTimeout(customerDebRef.current);
    customerDebRef.current = setTimeout(async () => {
      if (customerSearch.length < 2) { setCustomerResults([]); return; }
      setIsCustomerSearching(true);
      try {
        const r = await api.searchBigCommerceCustomers(customerSearch);
        setCustomerResults(r);
        setShowCustomerDrop(r.length > 0);
      } catch { setCustomerResults([]); }
      finally { setIsCustomerSearching(false); }
    }, 300);
    return () => { if (customerDebRef.current) clearTimeout(customerDebRef.current); };
  }, [customerSearch, isOfflineMode, selectedCustomer]);

  const handleSelectCustomer = async (c: api.BigCommerceCustomer) => {
    setSelectedCustomer(c);
    setCustomerSearch(`${c.first_name} ${c.last_name}`);
    setShowCustomerDrop(false);
    setCustomerResults([]);
    try {
      const addrs = await api.getCustomerAddresses(c.id);
      setCustomerAddresses(addrs);
      if (addrs.length > 0) setSelectedAddress(addrs[0]);
    } catch {}
    focusSearch();
  };

  // ── Pricing helpers ───────────────────────────────────────
  const applyFree = (item: CartItem, index: number) => {
    const isFree = item.discount_type === "free";
    if (isFree) {
      updateCartItemAtIndex(index, { price_at_sale: item.original_price, discount_type: null, discount_value: null });
    } else {
      setManualPriceInputs((p) => { const n = { ...p }; delete n[item.lineId]; return n; });
      setDiscountInputs((p) => { const n = { ...p }; delete n[item.lineId]; return n; });
      updateCartItemAtIndex(index, { price_at_sale: 0, discount_type: "free", discount_value: null });
    }
  };

  const applyPercent = (item: CartItem, index: number, pct: number) => {
    const final = Math.max(0, item.original_price * (1 - pct / 100));
    setManualPriceInputs((p) => { const n = { ...p }; delete n[item.lineId]; return n; });
    updateCartItemAtIndex(index, { price_at_sale: final, discount_type: "percent", discount_value: pct });
  };

  const applyManualPrice = (item: CartItem, index: number, raw: string) => {
    const price = parseFloat(raw);
    if (isNaN(price) || price < 0) return;
    setDiscountInputs((p) => { const n = { ...p }; delete n[item.lineId]; return n; });
    updateCartItemAtIndex(index, { price_at_sale: price, discount_type: null, discount_value: null });
  };

  const clearLineDiscount = (item: CartItem, index: number) => {
    setDiscountInputs((p) => { const n = { ...p }; delete n[item.lineId]; return n; });
    setManualPriceInputs((p) => { const n = { ...p }; delete n[item.lineId]; return n; });
    updateCartItemAtIndex(index, { price_at_sale: item.original_price, discount_type: null, discount_value: null });
  };

  // ── Checkout ──────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!selectedCustomer || !selectedAddress) {
      toast({ title: "Customer required", description: "Search and select a customer before checkout.", variant: "destructive" });
      return;
    }
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const billing = {
        first_name: selectedAddress.first_name,
        last_name: selectedAddress.last_name,
        company: selectedAddress.company,
        street_1: selectedAddress.street_1,
        street_2: selectedAddress.street_2,
        city: selectedAddress.city,
        state: selectedAddress.state,
        zip: selectedAddress.zip,
        country: selectedAddress.country,
        country_iso2: selectedAddress.country_iso2,
        email: selectedCustomer.email,
        phone: selectedAddress.phone || selectedCustomer.phone,
      };
      const response = await api.createOrder({
        customer_name: `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
        customer_email: selectedCustomer.email,
        status: "pending_sync",
        bigcommerce_customer_id: selectedCustomer.id,
        billing_address: billing,
        order_note: orderNote || undefined,
        items: cart.map((item) => ({
          product_id: item.product.id,
          bigcommerce_product_id: item.product.bigcommerce_id,
          variant_id: item.variant?.id,
          variant_option_values: item.variant?.option_values,
          quantity: item.quantity,
          price_at_sale: String(item.price_at_sale),
          name: item.variant ? `${item.product.name} (${item.variant.sku})` : item.product.name,
          sku: item.variant?.sku || item.product.sku,
          image: item.product.image,
        })),
        total: getCartTotal().toFixed(2),
        created_by_user_id: currentUser?.id || 0,
      });

      if (response.bigcommerce?.success) {
        toast({ title: "Order Created", description: `BigCommerce Order #${response.bigcommerce.order_id}` });
        clearCart();
        setActiveLineId(null);
        setDiscountInputs({});
        setManualPriceInputs({});
        setSelectedCustomer(null);
        setSelectedAddress(null);
        setCustomerAddresses([]);
        setCustomerSearch("");
        setOrderNote("");
        focusSearch();
      } else {
        toast({
          title: "Order Failed",
          description: response.bigcommerce?.error || "BigCommerce sync failed",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const total = getCartTotal();
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      className="h-screen overflow-hidden flex flex-col bg-slate-100 select-none"
      onClick={handlePageClick}
    >
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 h-14 bg-white border-b shadow-sm shrink-0 z-20">
        <span className="font-bold text-base uppercase tracking-widest text-slate-800 shrink-0">
          POS
        </span>
        {isOfflineMode && (
          <Badge variant="destructive" className="text-[10px] shrink-0">Offline</Badge>
        )}

        {/* Customer selector */}
        <div
          className="flex-1 relative max-w-sm"
          onClick={(e) => e.stopPropagation()}
          data-nofocus
        >
          <User className="absolute left-2.5 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
          {isCustomerSearching && (
            <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-slate-400 pointer-events-none" />
          )}
          <Input
            placeholder="Search customer…"
            className="pl-8 h-8 text-sm bg-white pr-8"
            value={customerSearch}
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              setSelectedCustomer(null);
              setSelectedAddress(null);
            }}
            onFocus={() => { if (customerResults.length > 0) setShowCustomerDrop(true); }}
            data-testid="input-pos-customer"
          />
          {selectedCustomer && (
            <CheckCircle2 className="absolute right-2.5 top-2 h-4 w-4 text-green-500 pointer-events-none" />
          )}
          {showCustomerDrop && customerResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded-md shadow-xl z-50 max-h-52 overflow-y-auto mt-1">
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0"
                  onClick={() => handleSelectCustomer(c)}
                  data-testid={`option-customer-${c.id}`}
                >
                  <p className="text-sm font-medium">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-slate-500">{c.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Address selector (if customer has multiple addresses) */}
        {selectedCustomer && customerAddresses.length > 1 && (
          <select
            className="h-8 text-xs border rounded px-2 bg-white max-w-[180px] shrink-0"
            value={selectedAddress?.id ?? ""}
            onChange={(e) => {
              const addr = customerAddresses.find((a) => String(a.id) === e.target.value);
              if (addr) setSelectedAddress(addr);
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid="select-pos-address"
          >
            {customerAddresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.street_1}, {a.city}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/catalog")}
            data-testid="button-exit-pos"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Exit POS
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Search Panel ── */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto min-w-0">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400 pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Scan barcode, enter SKU, or type product name…"
              className="pl-10 h-12 text-base bg-white shadow-sm font-medium"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  doSearch(search);
                }
              }}
              data-testid="input-pos-search"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-3.5 h-5 w-5 animate-spin text-slate-400 pointer-events-none" />
            )}
            {search && !isSearching && (
              <button
                className="absolute right-3 top-3.5"
                onClick={() => { setSearch(""); focusSearch(); }}
                data-testid="button-pos-clear-search"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            )}
          </div>

          <p className="text-xs text-slate-400 -mt-2 ml-1">
            {canSearchBC
              ? "BigCommerce search active — scan or type SKU, UPC, or product name"
              : "Searching pinned products only"}
          </p>

          {/* Empty prompt */}
          {cart.length === 0 && !isSearching && (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-300 py-20 pointer-events-none">
              <ShoppingCart className="h-20 w-20 mb-4 opacity-40" />
              <p className="text-xl font-semibold text-slate-400">Ready to scan</p>
              <p className="text-sm mt-1 text-slate-400">Scan a barcode or type a SKU / product name</p>
            </div>
          )}

          {/* Active item echo (left side preview when cart has items) */}
          {cart.length > 0 && (
            <div className="text-xs text-slate-500 mt-2 space-y-1">
              <p className="font-semibold uppercase tracking-wide text-slate-400">{cart.length} line{cart.length !== 1 ? "s" : ""} in cart</p>
              {cart.map((item) => (
                <div key={item.lineId} className={`flex gap-2 items-center rounded px-2 py-1 ${item.lineId === activeLineId ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-500"}`}>
                  <span className="truncate flex-1">{item.product.name} {item.variant?.sku ? `(${item.variant.sku})` : ""}</span>
                  <span className="shrink-0">×{item.quantity}</span>
                  <span className="shrink-0">${(item.price_at_sale * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Cart Panel ── */}
        <div
          className="w-[400px] xl:w-[460px] shrink-0 flex flex-col bg-white border-l shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <span className="font-bold text-sm text-slate-700 uppercase tracking-wide">Cart</span>
            {cart.length > 0 && (
              <button
                className="text-xs text-red-400 hover:text-red-600 font-medium"
                onClick={() => { clearCart(); setActiveLineId(null); setDiscountInputs({}); setManualPriceInputs({}); focusSearch(); }}
                data-testid="button-pos-clear-cart"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto divide-y">
            {cart.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
                No items yet
              </div>
            ) : (
              cart.map((item, index) => {
                const isActive = item.lineId === activeLineId;
                const isFree = item.discount_type === "free";
                const hasPctDiscount = item.discount_type === "percent";
                const isDiscounted = item.price_at_sale < item.original_price;
                const discountInput = discountInputs[item.lineId] ?? (hasPctDiscount ? String(item.discount_value ?? "") : "");
                const manualInput = manualPriceInputs[item.lineId] ?? "";

                if (!isActive) {
                  // ── Collapsed item ──
                  return (
                    <div
                      key={item.lineId}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setActiveLineId(item.lineId)}
                      data-testid={`pos-item-collapsed-${item.lineId}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{item.product.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.variant?.sku || item.product.sku}
                          {item.variant?.option_values?.length > 0 && ` · ${item.variant.option_values.map((ov: any) => ov.label).join("/")} `}
                          · ×{item.quantity}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${isDiscounted || isFree ? "text-red-600" : "text-slate-900"}`}>
                          ${(item.price_at_sale * item.quantity).toFixed(2)}
                        </p>
                        {isFree && <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1 rounded">FREE</span>}
                        {hasPctDiscount && <span className="text-[9px] text-red-500">-{item.discount_value}%</span>}
                      </div>
                      <button
                        className="text-slate-300 hover:text-red-500 ml-1 shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeFromCartAtIndex(index); if (activeLineId === item.lineId) setActiveLineId(null); }}
                        data-testid={`button-pos-remove-${item.lineId}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }

                // ── Active item (expanded) ──
                return (
                  <div
                    key={item.lineId}
                    className="bg-blue-50 border-l-4 border-blue-500 px-3 py-3 space-y-2.5"
                    data-testid={`pos-item-active-${item.lineId}`}
                  >
                    {/* Name + remove */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-900 leading-snug">{item.product.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          SKU: {item.variant?.sku || item.product.sku}
                          {item.variant?.option_values?.length > 0 && (
                            <span className="ml-1 font-medium text-slate-600">
                              · {item.variant.option_values.map((ov: any) => ov.label).join(" / ")}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        className="text-slate-300 hover:text-red-500 shrink-0"
                        onClick={() => { removeFromCartAtIndex(index); setActiveLineId(null); focusSearch(); }}
                        data-testid={`button-pos-remove-active-${item.lineId}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Quantity */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={item.quantity <= 1}
                        onClick={() => { updateCartQuantityAtIndex(index, -1); focusSearch(); }}
                        data-testid={`button-pos-minus-${item.lineId}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-10 text-center text-base font-bold text-slate-900" data-testid={`text-pos-qty-${item.lineId}`}>
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => { updateCartQuantityAtIndex(index, 1); focusSearch(); }}
                        data-testid={`button-pos-plus-${item.lineId}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs text-slate-500 ml-1">qty</span>
                    </div>

                    {/* Price display */}
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-xl font-bold ${isDiscounted || isFree ? "text-red-600" : "text-slate-900"}`}>
                        ${item.price_at_sale.toFixed(2)}
                      </span>
                      {(isDiscounted || isFree) && (
                        <span className="text-xs text-slate-400 line-through">${item.original_price.toFixed(2)}</span>
                      )}
                      {isFree && <Badge variant="destructive" className="text-[10px] h-4 px-1">FREE</Badge>}
                      {hasPctDiscount && <Badge variant="destructive" className="text-[10px] h-4 px-1">-{item.discount_value}%</Badge>}
                    </div>

                    {/* Discount controls */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        variant={isFree ? "destructive" : "outline"}
                        size="sm"
                        className="h-8 px-2.5 text-xs font-bold"
                        onClick={() => { applyFree(item, index); focusSearch(); }}
                        data-testid={`button-pos-free-${item.lineId}`}
                      >
                        FREE
                      </Button>

                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="% off"
                          className="w-16 h-8 text-xs text-center bg-white"
                          value={discountInput}
                          onChange={(e) => setDiscountInputs((p) => ({ ...p, [item.lineId]: e.target.value }))}
                          onBlur={(e) => {
                            const pct = parseFloat(e.target.value);
                            if (!isNaN(pct) && pct >= 0 && pct <= 100) {
                              applyPercent(item, index, pct);
                            } else if (!e.target.value) {
                              if (hasPctDiscount) clearLineDiscount(item, index);
                            }
                            focusSearch();
                          }}
                          data-testid={`input-pos-discount-${item.lineId}`}
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="price"
                          className="w-20 h-8 text-xs text-center bg-white"
                          value={manualInput}
                          onChange={(e) => setManualPriceInputs((p) => ({ ...p, [item.lineId]: e.target.value }))}
                          onBlur={(e) => {
                            if (e.target.value) applyManualPrice(item, index, e.target.value);
                            focusSearch();
                          }}
                          data-testid={`input-pos-price-${item.lineId}`}
                        />
                      </div>

                      {(isDiscounted || isFree || manualInput) && (
                        <button
                          className="text-xs text-slate-400 hover:text-slate-700 underline"
                          onClick={() => { clearLineDiscount(item, index); focusSearch(); }}
                          data-testid={`button-pos-clear-discount-${item.lineId}`}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Line total */}
                    <div className="flex justify-between items-center text-xs text-slate-600 pt-0.5">
                      <span>Line total</span>
                      <span className="font-bold text-slate-900 text-sm">
                        ${(item.price_at_sale * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Order note */}
          {cart.length > 0 && (
            <div className="px-3 py-2 border-t">
              <Input
                placeholder="Order note (optional)…"
                className="h-8 text-xs bg-slate-50"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                data-testid="input-pos-order-note"
              />
            </div>
          )}

          {/* Cart footer */}
          <div className="border-t px-4 py-3 bg-slate-50 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-500">
                {totalQty} item{totalQty !== 1 ? "s" : ""}
              </span>
              <span className="text-xl font-bold text-slate-900" data-testid="text-pos-total">
                ${total.toFixed(2)}
              </span>
            </div>

            {cart.length > 0 && !selectedCustomer && (
              <div className="flex items-center gap-1.5 mb-2 text-amber-600 text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Select a customer to enable checkout
              </div>
            )}
            {cart.length > 0 && selectedCustomer && !selectedAddress && (
              <div className="flex items-center gap-1.5 mb-2 text-amber-600 text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                No shipping address found for this customer
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0 || !selectedCustomer || !selectedAddress || isSubmitting}
              onClick={handleCheckout}
              data-testid="button-pos-checkout"
            >
              {isSubmitting
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <CreditCard className="h-4 w-4 mr-2" />}
              {isSubmitting ? "Processing…" : "Checkout"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Variant Picker Modal ── */}
      <Dialog
        open={!!variantPicker}
        onOpenChange={(open) => {
          if (!open) { setVariantPicker(null); focusSearch(); }
        }}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {variantPicker?.mode === "single"
                ? variantPicker.product.name
                : "Select a product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {variantPicker?.mode === "single" &&
              variantPicker.variants.map((v: any) => (
                <button
                  key={v.id}
                  className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border transition-colors"
                  onClick={() => {
                    autoAddVariant(variantPicker.product, v);
                    setVariantPicker(null);
                    setSearch("");
                    focusSearch();
                  }}
                  data-testid={`option-variant-${v.id}`}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {v.option_values?.map((ov: any) => ov.label).join(" / ") || v.sku}
                    </p>
                    <p className="text-xs text-slate-500">SKU: {v.sku} · Stock: {v.inventory_level ?? v.stock_level ?? "—"}</p>
                  </div>
                  <span className="text-sm font-bold shrink-0 ml-3">${parseFloat(v.price).toFixed(2)}</span>
                </button>
              ))}

            {variantPicker?.mode === "multi" &&
              variantPicker.products.map((p) => {
                const variants = getVariants(p);
                return (
                  <div key={p.id} className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 border-b">
                      <p className="font-semibold text-sm text-slate-800">{p.name}</p>
                    </div>
                    <div className="divide-y">
                      {variants.length === 0 ? (
                        <button
                          className="w-full text-left flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
                          onClick={() => {
                            autoAddVariant(p, null);
                            setVariantPicker(null);
                            setSearch("");
                            focusSearch();
                          }}
                          data-testid={`option-product-${p.id}`}
                        >
                          <span className="text-sm">SKU: {p.sku}</span>
                          <span className="text-sm font-bold">${parseFloat(p.price).toFixed(2)}</span>
                        </button>
                      ) : (
                        variants.map((v: any) => (
                          <button
                            key={v.id}
                            className="w-full text-left flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
                            onClick={() => {
                              autoAddVariant(p, v);
                              setVariantPicker(null);
                              setSearch("");
                              focusSearch();
                            }}
                            data-testid={`option-variant-${v.id}`}
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {v.option_values?.map((ov: any) => ov.label).join(" / ") || v.sku}
                              </p>
                              <p className="text-xs text-slate-500">SKU: {v.sku}</p>
                            </div>
                            <span className="text-sm font-bold shrink-0 ml-3">${parseFloat(v.price).toFixed(2)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
