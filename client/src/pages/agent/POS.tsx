import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/toaster";
import {
  Search, Loader2, X, Plus, Minus, Trash2, User,
  ShoppingCart, AlertCircle, CheckCircle2, CreditCard, Package,
  ChevronDown, Wifi, WifiOff, LogOut, Package as PackageIcon, Monitor, FileText, RotateCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import type { CartItem } from "@/lib/store";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVariants(product: api.Product): any[] {
  if (!product.variants) return [];
  if (Array.isArray(product.variants)) return product.variants;
  try { return JSON.parse(product.variants as unknown as string); } catch { return []; }
}

function variantLabel(variant: any): string {
  if (!variant) return "";
  if (variant.option_values?.length > 0) {
    return variant.option_values.map((ov: any) => ov.label).join(" / ");
  }
  return variant.sku || "";
}

// ─── Suggestion types ─────────────────────────────────────────────────────────

type SuggestionVariant = { kind: "variant"; product: api.Product; variant: any };
type SuggestionProduct = { kind: "product"; product: api.Product };
type Suggestion = SuggestionVariant | SuggestionProduct;

// ─── Variant Popup Dialog ─────────────────────────────────────────────────────

interface VariantPopupProps {
  product: api.Product;
  onClose: () => void;
  allowOverselling: boolean;
  onAdd: (
    product: api.Product,
    variant: any,
    qty: number,
    originalPrice: number,
    finalPrice: number,
    discountType: "free" | "percent" | null,
    discountValue: number | null,
  ) => void;
}

function VariantPopupDialog({ product, onClose, onAdd, allowOverselling }: VariantPopupProps) {
  const { toast } = useToast();
  const variants = getVariants(product);
  const rows = variants.length > 0 ? variants : [null];

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [isFree, setIsFree] = useState<Record<string, boolean>>({});
  const [pctInputs, setPctInputs] = useState<Record<string, string>>({});
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  const key = (v: any) => String(v?.id ?? "0");
  const getQty = (v: any) => qtys[key(v)] ?? 1;
  const getStock = (v: any): number => v?.stock_level ?? (product as any).stock_level ?? 0;
  const setQty = (v: any, q: number) => {
    const max = allowOverselling ? Infinity : getStock(v);
    const clamped = max > 0 ? Math.min(q, max) : q;
    setQtys((p) => ({ ...p, [key(v)]: Math.max(1, clamped) }));
  };
  const getBasePrice = (v: any) => parseFloat(v?.price || product.price) || 0;

  const computePrice = (v: any): { finalPrice: number; discountType: "free" | "percent" | null; discountValue: number | null } => {
    const base = getBasePrice(v);
    const k = key(v);
    if (isFree[k]) return { finalPrice: 0, discountType: "free", discountValue: null };
    const manualRaw = priceInputs[k];
    if (manualRaw && manualRaw !== "") {
      const p = parseFloat(manualRaw);
      if (!isNaN(p) && p >= 0) return { finalPrice: p, discountType: null, discountValue: null };
    }
    const pctRaw = pctInputs[k];
    if (pctRaw && pctRaw !== "") {
      const pct = parseFloat(pctRaw);
      if (!isNaN(pct) && pct >= 0 && pct <= 100) {
        return { finalPrice: Math.max(0, base * (1 - pct / 100)), discountType: "percent", discountValue: pct };
      }
    }
    return { finalPrice: base, discountType: null, discountValue: null };
  };

  // Add to cart but keep popup open
  const handleAdd = (v: any) => {
    if (!allowOverselling) {
      const stock = getStock(v);
      if (stock <= 0) {
        toast({ title: "Out of stock", description: `${v?.sku || product.sku} has no available inventory.`, variant: "destructive" });
        return;
      }
      const qty = getQty(v);
      if (qty > stock) {
        toast({ title: "Exceeds inventory", description: `Only ${stock} available.`, variant: "destructive" });
        return;
      }
    }
    const base = getBasePrice(v);
    const { finalPrice, discountType, discountValue } = computePrice(v);
    onAdd(product, v, getQty(v), base, finalPrice, discountType, discountValue);
    // Reset just this variant's controls after adding
    const k = key(v);
    setQtys((p) => ({ ...p, [k]: 1 }));
    setIsFree((p) => ({ ...p, [k]: false }));
    setPctInputs((p) => { const n = { ...p }; delete n[k]; return n; });
    setPriceInputs((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="w-[65vw] max-w-[65vw] max-h-[85vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="dialog-variant-picker"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-start gap-3">
            {product.image && (
              <img src={product.image} alt={product.name} className="w-12 h-12 object-cover rounded border shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base leading-snug">{product.name}</DialogTitle>
              {product.sku && <p className="text-xs text-slate-500 mt-0.5">SKU: {product.sku}</p>}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto divide-y">
          {rows.map((v) => {
            const k = key(v);
            const base = getBasePrice(v);
            const { finalPrice } = computePrice(v);
            const isDiscounted = finalPrice < base;
            const qty = getQty(v);

            return (
              <div key={k} className="px-5 py-3" data-testid={`popup-variant-row-${k}`}>
                {/* Variant name + price (header row) */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    {v && <p className="text-sm font-semibold text-slate-900">{variantLabel(v) || v.sku}</p>}
                    <p className="text-xs text-slate-500">
                      SKU: {v?.sku || product.sku}
                      <span className={`ml-2 font-medium ${getStock(v) <= 0 ? "text-red-500" : "text-slate-400"}`}>
                        · Stock: {getStock(v)}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-bold ${isDiscounted ? "text-red-600" : "text-slate-900"}`}>
                      ${finalPrice.toFixed(2)}
                    </p>
                    {isDiscounted && <p className="text-xs text-slate-400 line-through">${base.toFixed(2)}</p>}
                  </div>
                </div>

                {/* Single inline control row: [- qty +] [FREE] [Disc (%)] [Price ($)]  [Add] */}
                <div className="flex items-center gap-2 flex-nowrap">
                  {/* Qty controls */}
                  <div className="flex items-center gap-1 border rounded-md px-1 py-0.5 bg-slate-50 shrink-0">
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 disabled:opacity-40"
                      onClick={() => setQty(v, qty - 1)}
                      disabled={qty <= 1}
                      data-testid={`popup-minus-${k}`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <Input
                      type="number" min="1"
                      className="w-12 h-7 text-center text-sm font-bold bg-white px-0.5"
                      defaultValue={qty}
                      key={`popup-qty-${k}-${qty}`}
                      onBlur={(e) => {
                        const newQty = parseInt(e.target.value, 10);
                        if (!isNaN(newQty) && newQty >= 1) setQty(v, newQty);
                      }}
                      data-testid={`popup-qty-${k}`}
                    />
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 disabled:opacity-40"
                      onClick={() => setQty(v, qty + 1)}
                      disabled={!allowOverselling && qty >= getStock(v)}
                      data-testid={`popup-plus-${k}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {/* FREE */}
                  <Button
                    variant={isFree[k] ? "destructive" : "outline"}
                    size="sm"
                    className="h-8 px-3 text-xs font-bold shrink-0"
                    onClick={() => {
                      setIsFree((p) => ({ ...p, [k]: !p[k] }));
                      if (!isFree[k]) {
                        setPctInputs((p) => { const n = { ...p }; delete n[k]; return n; });
                        setPriceInputs((p) => { const n = { ...p }; delete n[k]; return n; });
                      }
                    }}
                    data-testid={`popup-free-${k}`}
                  >
                    FREE
                  </Button>

                  {/* Disc (%) */}
                  <Input
                    type="number" min="0" max="100"
                    placeholder="Disc (%)"
                    className="w-24 h-8 text-xs bg-white"
                    value={pctInputs[k] ?? ""}
                    onChange={(e) => {
                      setPctInputs((p) => ({ ...p, [k]: e.target.value }));
                      setIsFree((p) => ({ ...p, [k]: false }));
                      setPriceInputs((p) => { const n = { ...p }; delete n[k]; return n; });
                    }}
                    data-testid={`popup-pct-${k}`}
                  />

                  {/* Price ($) */}
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="Price ($)"
                    className="w-24 h-8 text-xs bg-white"
                    value={priceInputs[k] ?? ""}
                    onChange={(e) => {
                      setPriceInputs((p) => ({ ...p, [k]: e.target.value }));
                      setIsFree((p) => ({ ...p, [k]: false }));
                      setPctInputs((p) => { const n = { ...p }; delete n[k]; return n; });
                    }}
                    data-testid={`popup-price-${k}`}
                  />

                  {/* Add button — far right, stays open */}
                  <Button
                    size="sm"
                    className="h-8 px-4 ml-auto shrink-0 font-semibold"
                    onClick={() => handleAdd(v)}
                    data-testid={`popup-add-${k}`}
                  >
                    Add — ${(finalPrice * qty).toFixed(2)}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Done button — centered, closes popup only */}
        <div className="px-5 py-3 border-t shrink-0 flex justify-center">
          <Button variant="outline" className="w-32" onClick={onClose} data-testid="popup-done">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pinned Product Row ───────────────────────────────────────────────────────

const PinnedProductRow = memo(function PinnedProductRow({
  product,
  onClick,
}: {
  product: api.Product;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left border-b last:border-0"
      onClick={onClick}
      data-testid={`pinned-row-${product.id}`}
    >
      {product.image ? (
        <img src={product.image} alt={product.name} className="w-9 h-9 object-cover rounded border shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded border bg-slate-100 flex items-center justify-center shrink-0">
          <Package className="h-4 w-4 text-slate-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 leading-snug">{product.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">SKU: {product.sku} · ${parseFloat(product.price).toFixed(2)}</p>
      </div>
      <span className="text-xs text-slate-400 shrink-0 font-medium">
        {getVariants(product).length > 1 ? `${getVariants(product).length} variants` : ""}
      </span>
    </button>
  );
});

// ─── Main POS Page ────────────────────────────────────────────────────────────

export default function POSPage() {
  const {
    currentUser, cart, addToCart,
    removeFromCartAtIndex, updateCartQuantityAtIndex, updateCartItemAtIndex,
    clearCart, getCartTotal, isOfflineMode, setOfflineMode, toggleOfflineMode, logout,
  } = useStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const canSearchBC = currentUser?.allow_bigcommerce_search ?? false;

  // ── Allow Overselling ─────────────────────────────────────────────────────
  const [allowOverselling, setAllowOverselling] = useState<boolean>(
    () => localStorage.getItem("pos_allow_overselling") === "true"
  );
  const toggleAllowOverselling = () => setAllowOverselling((v) => {
    const next = !v;
    localStorage.setItem("pos_allow_overselling", String(next));
    return next;
  });

  // Always load pinned products (shown as rows in left panel for all agents)
  const { data: pinnedProducts = [] } = useQuery({
    queryKey: ["products", "pinned"],
    queryFn: api.getPinnedProducts,
  });

  // ── Search ────────────────────────────────────────────────────────────────
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionLimit, setSuggestionLimit] = useState(50);
  const searchSeqRef = useRef(0); // for race condition prevention
  const bcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Popup ────────────────────────────────────────────────────────────────
  const [popupProduct, setPopupProduct] = useState<api.Product | null>(null);

  // ── Cart / active item ────────────────────────────────────────────────────
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});

  // ── Customer ──────────────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<api.BigCommerceCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<api.BigCommerceCustomer | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<api.BigCommerceAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<api.BigCommerceAddress | null>(null);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [isCustomerSearching, setIsCustomerSearching] = useState(false);
  const customerDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orderNote, setOrderNote] = useState("");
  const [paymentType, setPaymentType] = useState("Cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [navTarget, setNavTarget] = useState<string | null>(null);

  // ── Error / inventory dialogs ─────────────────────────────────────────────
  const [inventoryErrorIds, setInventoryErrorIds] = useState<Set<string>>(new Set());
  const [freshStockByLineId, setFreshStockByLineId] = useState<Map<string, number>>(new Map());
  const [isRefreshingInventory, setIsRefreshingInventory] = useState(false);
  const [showInventoryDialog, setShowInventoryDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogMsg, setErrorDialogMsg] = useState("");

  const isInventoryErr = (msg: string) => /409|stock|inventory|quantity|available/i.test(msg);

  // ── Refresh live stock from BigCommerce ───────────────────────────────────
  const refreshStockAndHighlight = useCallback(async (highlightAfter = false) => {
    if (cart.length === 0) return;
    setIsRefreshingInventory(true);
    try {
      const bcIds = [...new Set(cart.map(i => i.product.bigcommerce_id).filter(Boolean))];
      if (bcIds.length === 0) {
        if (highlightAfter) setInventoryErrorIds(new Set(cart.map(i => i.lineId)));
        return;
      }
      const stockData = await api.refreshProductStock(bcIds);
      const stockMap = new Map<number, api.StockInfo>(stockData.map(s => [s.bigcommerce_id, s]));

      const newFresh = new Map<string, number>();
      const affected = new Set<string>();

      cart.forEach(item => {
        const info = stockMap.get(item.product.bigcommerce_id);
        if (!info) return;
        const stock = item.variant?.id
          ? (info.variants.find(v => v.id === item.variant.id)?.stock_level ?? info.stock_level)
          : info.stock_level;
        newFresh.set(item.lineId, stock);
        if (highlightAfter && stock < item.quantity) affected.add(item.lineId);
      });

      setFreshStockByLineId(newFresh);
      if (highlightAfter) {
        setInventoryErrorIds(affected.size > 0 ? affected : new Set(cart.map(i => i.lineId)));
      }
    } catch {
      if (highlightAfter) setInventoryErrorIds(new Set(cart.map(i => i.lineId)));
    } finally {
      setIsRefreshingInventory(false);
    }
  }, [cart]);

  // Auto-refresh inventory when POS loads or cart items change
  useEffect(() => {
    if (cart.length > 0) refreshStockAndHighlight(false);
  }, [cart.length]);

  // Restore draft customer on mount
  useEffect(() => {
    const raw = localStorage.getItem('vansales_restore_customer');
    if (!raw) return;
    localStorage.removeItem('vansales_restore_customer');
    try {
      const { bcId } = JSON.parse(raw) as { bcId: number };
      if (!bcId) return;
      api.getCustomerByBcId(bcId).then(async (customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch(`${customer.first_name} ${customer.last_name}`);
        try {
          const addresses = await api.getCustomerAddresses(customer.id);
          setCustomerAddresses(addresses);
          if (addresses.length > 0) setSelectedAddress(addresses[0]);
        } catch {}
      }).catch(() => {});
    } catch {}
  }, []);

  // Guarded navigation: prompts if cart has items
  const guardedNavigate = useCallback((path: string) => {
    if (cart.length > 0) { setNavTarget(path); } else { navigate(path); }
  }, [cart.length, navigate]);

  const confirmNavigation = () => {
    if (navTarget) {
      if (navTarget === "/logout") { logout(); navigate("/"); }
      else { navigate(navTarget); }
      setNavTarget(null);
    }
  };

  // ── Build structured checkout note at submit time ─────────────────────────
  const buildCheckoutNote = (userNote: string) => {
    const discount = cart.reduce((sum, item) =>
      sum + (item.original_price - item.price_at_sale) * item.quantity, 0);
    const groupId = (selectedCustomer as any)?.customer_group_id;
    const tierLabel = !selectedCustomer ? "Default" : (groupId && groupId !== 0 ? `Group #${groupId}` : "Default");
    return [
      "Sales App Checkout",
      `Checkout by : ${currentUser?.name || ""}`,
      `Payment Type : ${paymentType}`,
      `Total Discount Applied : $${discount.toFixed(2)}`,
      `Price Tier : ${tierLabel}`,
      "Notes:",
      userNote,
    ].join("\n");
  };

  // ── Navigation guard: refresh / tab close ─────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = "You have an active order in progress. Leaving will discard unsaved items.";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [cart.length]);

  // ── Online/offline ────────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setOfflineMode(false);
    const off = () => setOfflineMode(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [setOfflineMode]);

  // ── Focus ─────────────────────────────────────────────────────────────────
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

  // ── Auto-add helper ───────────────────────────────────────────────────────
  const autoAddVariant = useCallback((product: api.Product, variant: any, qty = 1) => {
    if (!allowOverselling) {
      const stock: number = variant?.stock_level ?? product.stock_level ?? 0;
      if (stock <= 0) {
        toast({ title: "Out of stock", description: `${variant?.sku || product.sku} has no available inventory.`, variant: "destructive" });
        return;
      }
    }
    const price = parseFloat(variant?.price || product.price);
    const beforeIds = new Set(useStore.getState().cart.map((i) => i.lineId));
    addToCart(product, qty, variant ?? undefined, price, price, null, null);
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
    toast({ title: "Added to cart", description: `${variant?.sku || product.sku} × ${qty}`, duration: 1500 });
  }, [addToCart, toast, allowOverselling]);

  // Popup "Add to Cart" with custom pricing
  const handlePopupAdd = useCallback((
    product: api.Product,
    variant: any,
    qty: number,
    originalPrice: number,
    finalPrice: number,
    discountType: "free" | "percent" | null,
    discountValue: number | null,
  ) => {
    const beforeIds = new Set(useStore.getState().cart.map((i) => i.lineId));
    addToCart(product, qty, variant ?? undefined, finalPrice, originalPrice, discountType, discountValue);
    setTimeout(() => {
      const after = useStore.getState().cart;
      const newLine = after.find((i) => !beforeIds.has(i.lineId));
      if (newLine) setActiveLineId(newLine.lineId);
      else {
        const merged = after.find(
          (i) => i.product.id === product.id && (!variant || i.variant?.id === variant?.id)
        );
        if (merged) setActiveLineId(merged.lineId);
      }
    }, 0);
    toast({ title: "Added to cart", description: `${variant?.sku || product.sku} × ${qty}`, duration: 1500 });
    // Popup stays open — user closes it with Done
  }, [addToCart, toast]);

  // ── Build suggestions from BC products ──────────────────────────────────────
  const buildSuggestions = useCallback((products: api.Product[]): Suggestion[] => {
    const variantItems: SuggestionVariant[] = [];
    const productItems: SuggestionProduct[] = [];

    for (const p of products) {
      const variants = getVariants(p);
      if (variants.length > 0) {
        for (const v of variants) {
          variantItems.push({ kind: "variant", product: p, variant: v });
        }
      }
    }
    for (const p of products) {
      productItems.push({ kind: "product", product: p });
    }

    // >50 total results → mother products first (easier to pick); ≤50 → variants first
    const totalResults = variantItems.length + productItems.length;
    return totalResults > 50
      ? [...productItems, ...variantItems]
      : [...variantItems, ...productItems];
  }, []);

  // ── Search handler ────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((q: string) => {
    setSearch(q);
    setSuggestionLimit(50);

    if (!q.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      if (bcDebounceRef.current) clearTimeout(bcDebounceRef.current);
      return;
    }

    const lower = q.toLowerCase().trim();

    // Instant local filtering of pinned products
    const localMatches = pinnedProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.sku.toLowerCase().includes(lower)
    );
    const localSuggestions = buildSuggestions(localMatches);

    if (!canSearchBC) {
      setSuggestions(localSuggestions);
      setShowSuggestions(localSuggestions.length > 0);
      return;
    }

    // For BC agents: show local results immediately, then enrich with BC results
    setSuggestions(localSuggestions);
    if (localSuggestions.length > 0) setShowSuggestions(true);

    // BC API call with 150ms delay to avoid hammering
    const seq = ++searchSeqRef.current;
    if (bcDebounceRef.current) clearTimeout(bcDebounceRef.current);
    setIsSearching(true);
    bcDebounceRef.current = setTimeout(async () => {
      if (seq !== searchSeqRef.current) return; // stale
      try {
        const result = await api.agentBigCommerceSearch(q.trim(), currentUser!.id);
        if (seq !== searchSeqRef.current) return; // stale response

        if (result.resultType === "variant") {
          // Exact SKU/UPC match — auto-add immediately
          autoAddVariant(result.product, result.variant);
          setSearch("");
          setSuggestions([]);
          setShowSuggestions(false);
          focusSearch();
        } else {
          const bcSuggestions = buildSuggestions(result.products);
          setSuggestions(bcSuggestions);
          setShowSuggestions(bcSuggestions.length > 0);
        }
      } catch {
        // Keep showing local suggestions on BC error
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 150);
  }, [canSearchBC, currentUser, pinnedProducts, buildSuggestions, autoAddVariant, focusSearch]);

  // Dismiss suggestions on Escape
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Suggestion dropdown infinite scroll
  const handleDropdownScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 60) {
      setSuggestionLimit((prev) => prev + 15);
    }
  };

  // ── Customer search ───────────────────────────────────────────────────────
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

  // ── Cart pricing helpers ──────────────────────────────────────────────────
  const applyFree = (item: CartItem, index: number) => {
    if (item.discount_type === "free") {
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

  // ── Checkout ──────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!selectedCustomer || !selectedAddress) {
      toast({ title: "Customer required", description: "Search and select a customer before checkout.", variant: "destructive" });
      return;
    }
    if (cart.length === 0) { toast({ title: "Cart is empty", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      const billing = {
        first_name: selectedAddress.first_name, last_name: selectedAddress.last_name,
        company: selectedAddress.company, street_1: selectedAddress.street_1,
        street_2: selectedAddress.street_2, city: selectedAddress.city,
        state: selectedAddress.state, zip: selectedAddress.zip,
        country: selectedAddress.country, country_iso2: selectedAddress.country_iso2,
        email: selectedCustomer.email, phone: selectedAddress.phone || selectedCustomer.phone,
      };
      const response = await api.createOrder({
        customer_name: `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
        customer_email: selectedCustomer.email,
        status: "pending_sync",
        bigcommerce_customer_id: selectedCustomer.id,
        billing_address: billing,
        order_note: buildCheckoutNote(orderNote),
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
        clearCart(); setActiveLineId(null); setDiscountInputs({}); setManualPriceInputs({});
        setInventoryErrorIds(new Set()); setFreshStockByLineId(new Map());
        setSelectedCustomer(null); setSelectedAddress(null); setCustomerAddresses([]);
        setCustomerSearch(""); setOrderNote(""); focusSearch();
      } else {
        const errMsg = response.bigcommerce?.error || "Sync failed";
        if (isInventoryErr(errMsg)) {
          await refreshStockAndHighlight(true);
          setShowInventoryDialog(true);
        } else {
          setErrorDialogMsg(errMsg);
          setShowErrorDialog(true);
        }
      }
    } catch (e: any) {
      const msg = e.message || "";
      if (isInventoryErr(msg)) {
        await refreshStockAndHighlight(true);
        setShowInventoryDialog(true);
      } else {
        setErrorDialogMsg(msg);
        setShowErrorDialog(true);
      }
    } finally { setIsSubmitting(false); }
  };

  // ── Save as Draft (POS) ───────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (cart.length === 0) { toast({ title: "Cart is empty", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      await api.createDraftOrder({
        customer_name: selectedCustomer
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : "Unknown",
        customer_email: selectedCustomer?.email,
        bigcommerce_customer_id: selectedCustomer?.id,
        status: "draft",
        order_note: buildCheckoutNote(orderNote),
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
      toast({ title: "Draft Saved", duration: 1500 });
      clearCart(); setActiveLineId(null); setDiscountInputs({}); setManualPriceInputs({});
      setInventoryErrorIds(new Set());
      setSelectedCustomer(null); setSelectedAddress(null); setCustomerAddresses([]);
      setCustomerSearch(""); setOrderNote(""); focusSearch();
    } catch (e: any) {
      toast({ title: "Failed to save draft", description: e.message, variant: "destructive" });
    } finally { setIsSubmitting(false); }
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const finalTotal = getCartTotal();
  const originalTotal = cart.reduce((s, i) => s + i.original_price * i.quantity, 0);
  const totalDiscount = Math.max(0, originalTotal - finalTotal);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const visibleSuggestions = suggestions.slice(0, suggestionLimit);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden flex flex-col bg-slate-100" onClick={handlePageClick}>

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 h-14 bg-white border-b shadow-sm shrink-0 z-20">
        <span className="font-bold text-base uppercase tracking-widest text-slate-800 shrink-0">POS</span>
        {isOfflineMode && <Badge variant="destructive" className="text-[10px] shrink-0">Offline</Badge>}

        {/* Customer search */}
        <div className="flex-1 relative max-w-sm" onClick={(e) => e.stopPropagation()} data-nofocus>
          <User className="absolute left-2.5 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
          {isCustomerSearching && <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-slate-400 pointer-events-none" />}
          {selectedCustomer && !isCustomerSearching && <CheckCircle2 className="absolute right-2.5 top-2 h-4 w-4 text-green-500 pointer-events-none" />}
          <Input
            placeholder="Search customer…"
            className="pl-8 h-8 text-sm bg-white pr-8"
            value={customerSearch}
            onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); setSelectedAddress(null); }}
            onFocus={() => { if (customerResults.length > 0) setShowCustomerDrop(true); }}
            data-testid="input-pos-customer"
          />
          {showCustomerDrop && customerResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded-md shadow-xl z-50 max-h-52 overflow-y-auto mt-1">
              {customerResults.map((c) => (
                <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0" onClick={() => handleSelectCustomer(c)} data-testid={`option-customer-${c.id}`}>
                  <p className="text-sm font-medium">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-slate-500">{c.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tier indicator */}
        {selectedCustomer && (
          <span className="text-xs text-slate-500 shrink-0 whitespace-nowrap" data-testid="text-price-tier">
            Tier:{" "}
            <span className="font-semibold text-slate-700">
              {(selectedCustomer as any).customer_group_id
                ? `Group #${(selectedCustomer as any).customer_group_id}`
                : "Default"}
            </span>
          </span>
        )}

        {selectedCustomer && customerAddresses.length > 1 && (
          <select
            className="h-8 text-xs border rounded px-2 bg-white min-w-[220px] max-w-[280px] shrink-0"
            value={selectedAddress?.id ?? ""}
            onChange={(e) => { const a = customerAddresses.find((x) => String(x.id) === e.target.value); if (a) setSelectedAddress(a); }}
            onClick={(e) => e.stopPropagation()}
            data-testid="select-pos-address"
          >
            {customerAddresses.map((a) => <option key={a.id} value={a.id}>{a.street_1}, {a.city}</option>)}
          </select>
        )}

        {/* User dropdown — same as catalog view */}
        <div className="ml-auto shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2" data-testid="button-pos-user-menu">
                <User className="h-5 w-5" />
                <span className="text-sm font-medium max-w-[100px] truncate">{currentUser?.name}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-950 shadow-lg border z-50">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{currentUser?.name}</span>
                  <span className="text-xs font-normal text-slate-500">{currentUser?.role}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => guardedNavigate("/catalog")} data-testid="pos-menu-catalog">
                <Package className="mr-2 h-4 w-4" />
                Product Catalog
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => guardedNavigate("/orders")} data-testid="pos-menu-orders">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Order History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => guardedNavigate("/pos")} data-testid="pos-menu-pos">
                <Monitor className="mr-2 h-4 w-4" />
                POS Mode
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleOfflineMode} data-testid="pos-menu-offline">
                {isOfflineMode ? <WifiOff className="mr-2 h-4 w-4" /> : <Wifi className="mr-2 h-4 w-4" />}
                Offline Mode: {isOfflineMode ? "ON" : "OFF"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleAllowOverselling} data-testid="pos-menu-oversell">
                <AlertCircle className="mr-2 h-4 w-4" />
                Allow Overselling: {allowOverselling ? "ON" : "OFF"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => guardedNavigate("/logout")}
                data-testid="pos-menu-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Search + Pinned Products ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Search input */}
          <div className="px-4 pt-4 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400 pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Scan barcode, SKU, UPC, or product name…"
                className="pl-10 h-12 text-base bg-white shadow-sm font-medium"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                data-testid="input-pos-search"
              />
              {isSearching && <Loader2 className="absolute right-10 top-3.5 h-5 w-5 animate-spin text-slate-400 pointer-events-none" />}
              {search && (
                <button
                  className="absolute right-3 top-3.5"
                  onClick={() => { handleSearchChange(""); focusSearch(); }}
                  data-testid="button-pos-clear-search"
                >
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5 ml-1">
              {canSearchBC ? "BigCommerce search active — scan SKU/UPC or type name" : "Searching pinned products"}
            </p>
            {allowOverselling && (
              <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700" data-testid="pos-oversell-warning">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Overselling enabled — inventory limits are not enforced
              </div>
            )}
          </div>

          {/* Suggestion dropdown */}
          {showSuggestions && visibleSuggestions.length > 0 && (() => {
            // Derive rendering order from the sorted suggestions array:
            // if first item is a product → large result set → products section first
            const productsFirst = suggestions.length > 0 && suggestions[0].kind === "product";

            const variantRows = visibleSuggestions.filter((s): s is SuggestionVariant => s.kind === "variant");
            const productRows = visibleSuggestions.filter((s): s is SuggestionProduct => s.kind === "product");

            const variantsSection = variantRows.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-slate-50 border-b">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Variants</p>
                </div>
                {variantRows.map((s, i) => (
                  <button
                    key={`v-${s.product.id}-${s.variant?.id ?? i}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
                    onClick={() => {
                      autoAddVariant(s.product, s.variant);
                      setSearch("");
                      setSuggestions([]);
                      setShowSuggestions(false);
                      focusSearch();
                    }}
                    data-testid={`suggestion-variant-${s.variant?.id ?? i}`}
                  >
                    {s.product.image && (
                      <img src={s.product.image} alt="" className="w-8 h-8 object-cover rounded border shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 truncate">{s.product.name}</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">{variantLabel(s.variant) || s.variant?.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">${parseFloat(s.variant?.price || s.product.price).toFixed(2)}</p>
                      <p className={`text-[10px] ${(s.variant?.stock_level ?? s.product.stock_level) <= 0 ? "text-red-500 font-medium" : "text-slate-400"}`}>
                        Stock: {s.variant?.stock_level ?? s.product.stock_level ?? 0}
                      </p>
                    </div>
                  </button>
                ))}
              </>
            );

            const productsSection = productRows.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-slate-50 border-b">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Products</p>
                </div>
                {productRows.map((s) => (
                  <button
                    key={`p-${s.product.id}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                    onClick={() => {
                      setPopupProduct(s.product);
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    data-testid={`suggestion-product-${s.product.id}`}
                  >
                    {s.product.image && (
                      <img src={s.product.image} alt="" className="w-8 h-8 object-cover rounded border shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.product.name}</p>
                      <p className="text-xs text-slate-500">SKU: {s.product.sku}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">Select variant →</span>
                  </button>
                ))}
              </>
            );

            return (
              <div
                className="mx-4 mb-2 bg-white border rounded-lg shadow-lg z-30 overflow-y-auto max-h-[calc(100vh-200px)] divide-y"
                onScroll={handleDropdownScroll}
                onClick={(e) => e.stopPropagation()}
                data-testid="pos-suggestions-dropdown"
              >
                {productsFirst ? (
                  <>{productsSection}{variantsSection}</>
                ) : (
                  <>{variantsSection}{productsSection}</>
                )}
                {suggestions.length > suggestionLimit && (
                  <div className="px-4 py-2 text-center text-xs text-slate-400">Scroll for more results</div>
                )}
              </div>
            );
          })()}

          {/* No suggestions / default: Pinned products rows */}
          {!showSuggestions && (
            <div className="flex-1 overflow-y-auto">
              {pinnedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 py-12 pointer-events-none">
                  <ShoppingCart className="h-16 w-16 mb-3 opacity-30" />
                  <p className="text-base font-medium text-slate-400">Ready to scan</p>
                  <p className="text-sm mt-1 text-slate-400">Scan a barcode or type to search</p>
                </div>
              ) : (
                <div className="bg-white mx-4 my-2 rounded-lg border shadow-sm overflow-hidden">
                  <div className="px-4 py-2 border-b bg-slate-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pinned Products</p>
                  </div>
                  {pinnedProducts.map((p) => (
                    <PinnedProductRow
                      key={p.id}
                      product={p}
                      onClick={() => setPopupProduct(p)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Cart Panel (38%) ── */}
        <div
          className="flex-none w-[38%] min-w-[340px] max-w-[520px] flex flex-col bg-white border-l shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 shrink-0">
            <span className="font-bold text-sm text-slate-700 uppercase tracking-wide">Cart</span>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium disabled:opacity-40"
                  onClick={() => refreshStockAndHighlight(false)}
                  disabled={isRefreshingInventory}
                  data-testid="button-pos-reload-inventory"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${isRefreshingInventory ? "animate-spin" : ""}`} />
                  Reload Inventory
                </button>
              )}
              {cart.length > 0 && (
                <button
                  className="text-xs text-red-400 hover:text-red-600 font-medium"
                  onClick={() => { clearCart(); setActiveLineId(null); setDiscountInputs({}); setManualPriceInputs({}); setFreshStockByLineId(new Map()); setInventoryErrorIds(new Set()); focusSearch(); }}
                  data-testid="button-pos-clear-cart"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto divide-y">
            {cart.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No items yet</div>
            ) : (
              cart.map((item, index) => {
                const isActive = item.lineId === activeLineId;
                const isFree = item.discount_type === "free";
                const hasPct = item.discount_type === "percent";
                const isDiscounted = item.price_at_sale < item.original_price;
                const discountInput = discountInputs[item.lineId] ?? (hasPct ? String(item.discount_value ?? "") : "");
                const manualInput = manualPriceInputs[item.lineId] ?? "";

                if (!isActive) {
                  return (
                    <div
                      key={item.lineId}
                      className={`flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors ${inventoryErrorIds.has(item.lineId) ? "bg-red-50" : ""}`}
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
                        {isFree && <span className="text-[9px] font-bold text-red-500">FREE</span>}
                        {hasPct && <span className="text-[9px] text-red-500">-{item.discount_value}%</span>}
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

                // ── Active item ──
                return (
                  <div key={item.lineId} className={`${inventoryErrorIds.has(item.lineId) ? "bg-red-50 border-l-4 border-red-400" : "bg-blue-50 border-l-4 border-blue-500"} px-3 py-3 space-y-2.5`} data-testid={`pos-item-active-${item.lineId}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-900 leading-snug">{item.product.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          SKU: {item.variant?.sku || item.product.sku}
                          {item.variant?.option_values?.length > 0 && (
                            <span className="ml-1 font-medium text-slate-600">· {item.variant.option_values.map((ov: any) => ov.label).join(" / ")}</span>
                          )}
                          {(() => {
                            const stock = freshStockByLineId.has(item.lineId)
                              ? freshStockByLineId.get(item.lineId)!
                              : (item.variant?.stock_level ?? item.product.stock_level ?? 0);
                            return (
                              <span className={`ml-2 font-medium ${stock <= 0 ? "text-red-500" : "text-slate-400"}`}>
                                · Stock: {stock}
                              </span>
                            );
                          })()}
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

                    {/* Qty */}
                    {(() => {
                      const itemStock = freshStockByLineId.has(item.lineId)
                        ? freshStockByLineId.get(item.lineId)!
                        : (item.variant?.stock_level ?? item.product.stock_level ?? 0);
                      const atMax = !allowOverselling && item.quantity >= itemStock;
                      return (
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={item.quantity <= 1}
                            onClick={() => { updateCartQuantityAtIndex(index, -1); focusSearch(); }}
                            data-testid={`button-pos-minus-${item.lineId}`}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Input
                            type="number" min="1"
                            className="w-16 h-9 text-center text-base font-bold text-slate-900 bg-white px-1"
                            defaultValue={item.quantity}
                            key={`qty-${item.lineId}-${item.quantity}`}
                            onBlur={(e) => {
                              let newQty = parseInt(e.target.value, 10);
                              if (!isNaN(newQty) && newQty >= 1) {
                                if (!allowOverselling && itemStock > 0) newQty = Math.min(newQty, itemStock);
                                const delta = newQty - item.quantity;
                                if (delta !== 0) updateCartQuantityAtIndex(index, delta);
                              }
                              focusSearch();
                            }}
                            data-testid={`input-pos-qty-${item.lineId}`}
                          />
                          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                            disabled={atMax}
                            onClick={() => { updateCartQuantityAtIndex(index, 1); focusSearch(); }}
                            data-testid={`button-pos-plus-${item.lineId}`}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-xs text-slate-500 ml-1">qty</span>
                        </div>
                      );
                    })()}

                    {/* Price display */}
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-xl font-bold ${isDiscounted || isFree ? "text-red-600" : "text-slate-900"}`}>
                        ${item.price_at_sale.toFixed(2)}
                      </span>
                      {(isDiscounted || isFree) && <span className="text-xs text-slate-400 line-through">${item.original_price.toFixed(2)}</span>}
                      {isFree && <Badge variant="destructive" className="text-[10px] h-4 px-1">FREE</Badge>}
                      {hasPct && <Badge variant="destructive" className="text-[10px] h-4 px-1">-{item.discount_value}%</Badge>}
                    </div>

                    {/* Discount controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant={isFree ? "destructive" : "outline"}
                        size="sm" className="h-8 px-3 text-xs font-bold"
                        onClick={() => { applyFree(item, index); focusSearch(); }}
                        data-testid={`button-pos-free-${item.lineId}`}
                      >FREE</Button>
                      <Input
                        type="number" min="0" max="100"
                        placeholder="Disc (%)"
                        className="w-28 h-8 text-xs bg-white"
                        value={discountInput}
                        onChange={(e) => setDiscountInputs((p) => ({ ...p, [item.lineId]: e.target.value }))}
                        onBlur={(e) => {
                          const pct = parseFloat(e.target.value);
                          if (!isNaN(pct) && pct >= 0 && pct <= 100) applyPercent(item, index, pct);
                          else if (!e.target.value && hasPct) clearLineDiscount(item, index);
                          focusSearch();
                        }}
                        data-testid={`input-pos-discount-${item.lineId}`}
                      />
                      <Input
                        type="number" min="0" step="0.01"
                        placeholder="Price ($)"
                        className="w-32 h-8 text-xs bg-white"
                        value={manualInput}
                        onChange={(e) => setManualPriceInputs((p) => ({ ...p, [item.lineId]: e.target.value }))}
                        onBlur={(e) => { if (e.target.value) applyManualPrice(item, index, e.target.value); focusSearch(); }}
                        data-testid={`input-pos-price-${item.lineId}`}
                      />
                      {(isDiscounted || isFree || manualInput) && (
                        <button className="text-xs text-slate-400 hover:text-slate-700 underline"
                          onClick={() => { clearLineDiscount(item, index); focusSearch(); }}>
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex justify-between text-xs text-slate-600 pt-0.5">
                      <span>Line total</span>
                      <span className="font-bold text-slate-900 text-sm">${(item.price_at_sale * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Payment type + Order note */}
          {cart.length > 0 && (
            <div className="px-3 py-2 border-t shrink-0 space-y-2">
              <select
                className="w-full h-8 border rounded px-2 text-xs bg-slate-50"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                data-testid="select-pos-payment-type"
              >
                <option>Cash</option>
                <option>Check</option>
                <option>Card on File</option>
                <option>Via Bigcommerce</option>
              </select>
              <Textarea
                placeholder="Order note (optional)…"
                className="text-xs bg-slate-50 min-h-[60px] resize-none"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                data-testid="input-pos-order-note"
              />
            </div>
          )}

          {/* Cart footer: totals + checkout */}
          <div className="border-t px-4 py-3 bg-slate-50 shrink-0 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">{totalQty} item{totalQty !== 1 ? "s" : ""}</span>
              {totalDiscount > 0 && (
                <span className="text-sm text-red-500 font-medium" data-testid="text-pos-discount">
                  Discount: -${totalDiscount.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold text-slate-700">Total</span>
              <span className="text-2xl font-bold text-slate-900" data-testid="text-pos-total">
                ${finalTotal.toFixed(2)}
              </span>
            </div>

            {cart.length > 0 && !selectedCustomer && (
              <div className="flex items-center gap-1.5 pt-1 text-amber-600 text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Select a customer to enable checkout
              </div>
            )}
            {cart.length > 0 && selectedCustomer && !selectedAddress && (
              <div className="flex items-center gap-1.5 pt-1 text-amber-600 text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                No address found for this customer
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={cart.length === 0 || isSubmitting}
                onClick={handleSaveDraft}
                data-testid="button-pos-save-draft"
              >
                <FileText className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button
                className="flex-1"
                size="lg"
                disabled={cart.length === 0 || !selectedCustomer || !selectedAddress || isSubmitting}
                onClick={handleCheckout}
                data-testid="button-pos-checkout"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                {isSubmitting ? "Processing…" : "Checkout"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Inventory error dialog ── */}
      <AlertDialog open={showInventoryDialog} onOpenChange={setShowInventoryDialog}>
        <AlertDialogContent data-testid="dialog-inventory-error">
          <AlertDialogHeader>
            <AlertDialogTitle>Inventory Updated</AlertDialogTitle>
            <AlertDialogDescription>
              The inventory has been updated. Modify your cart before checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowInventoryDialog(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Generic error dialog ── */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent data-testid="dialog-checkout-error">
          <AlertDialogHeader>
            <AlertDialogTitle>Something went wrong</AlertDialogTitle>
            <AlertDialogDescription>
              {errorDialogMsg || "An unexpected error occurred."} Contact IT support if the issue persists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowErrorDialog(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Navigation guard ── */}
      <AlertDialog open={!!navTarget} onOpenChange={(open) => { if (!open) setNavTarget(null); }}>
        <AlertDialogContent data-testid="dialog-nav-guard">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave POS Mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Your cart has {cart.length} {cart.length === 1 ? "item" : "items"}.
              If you leave now your cart will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="nav-guard-stay">Stay</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmNavigation}
              data-testid="nav-guard-leave"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Variant Popup Dialog ── */}
      {popupProduct && (
        <VariantPopupDialog
          product={popupProduct}
          onClose={() => { setPopupProduct(null); focusSearch(); }}
          onAdd={handlePopupAdd}
          allowOverselling={allowOverselling}
        />
      )}

      <Toaster />
    </div>
  );
}
