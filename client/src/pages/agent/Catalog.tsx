import { useStore } from "@/lib/store";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Search,
  Plus,
  Minus,
  ChevronDown,
  Loader2,
  Package,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Card } from "@/components/ui/card";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscountState {
  type: "free" | "percent";
  finalPrice: number;
  value: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVariants(product: api.Product): any[] {
  if (!product.variants) return [];
  if (Array.isArray(product.variants)) return product.variants;
  try {
    return JSON.parse(product.variants as unknown as string);
  } catch {
    return [];
  }
}

const PAGE_SIZE_OPTIONS_4COL = [12, 16, 20, 24, 32, 48];
const PAGE_SIZE_OPTIONS_5COL = [10, 15, 20, 25, 30, 50];

// ── Pagination helper ─────────────────────────────────────────────────────────

function PaginationBar({
  page,
  totalPages,
  onPageChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  pageSize: number;
  pageSizeOptions: number[];
  onPageSizeChange: (n: number) => void;
}) {
  const pages: (number | "…")[] = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    .reduce<(number | "…")[]>((acc, p, i, arr) => {
      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 border-t pt-4">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0"
          disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}
          data-testid="btn-prev-page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ell-${i}`} className="px-1 text-slate-400 text-sm">…</span>
          ) : (
            <Button key={p} variant={page === p ? "default" : "outline"} size="sm"
              className="h-8 w-8 p-0 text-xs"
              onClick={() => onPageChange(p as number)}
              data-testid={`btn-page-${p}`}>
              {p}
            </Button>
          )
        )}
        <Button variant="outline" size="sm" className="h-8 w-8 p-0"
          disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          data-testid="btn-next-page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 shrink-0">Per page:</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-20 text-xs" data-testid="select-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Catalog() {
  // ── Search state ──
  const [search, setSearch] = useState("");
  const [bcResult, setBcResult] = useState<api.AgentSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Discount / qty state ──
  const [discounts, setDiscounts] = useState<Record<string, DiscountState>>({});
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // ── Category browse state ──
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selectedSubCatId, setSelectedSubCatId] = useState<number | null>(null);
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [catPage, setCatPage] = useState(1);
  const [listPage, setListPage] = useState(1);
  const [columns, setColumns] = useState<4 | 5>(4);
  const [pageSize, setPageSize] = useState(12);
  const [variantModalProduct, setVariantModalProduct] = useState<api.Product | null>(null);
  const catDropRef = useRef<HTMLDivElement>(null);

  const { currentUser, addToCart, cart } = useStore();
  const { toast } = useToast();
  const canSearchBigCommerce = currentUser?.allow_bigcommerce_search || false;

  // ── Queries ──
  const { data: allProducts = [] } = useQuery({
    queryKey: ["products", "pinned"],
    queryFn: api.getPinnedProducts,
  });

  const { data: inventorySetting } = useQuery({
    queryKey: ["settings", "show_inventory_counts"],
    queryFn: () => api.getSetting("show_inventory_counts"),
  });

  const { data: allCategories = [], isLoading: catsLoading } = useQuery({
    queryKey: ["bc-categories"],
    queryFn: api.getBcCategories,
    staleTime: 5 * 60 * 1000,
  });

  const activeCatId = selectedSubCatId ?? selectedCatId;

  const { data: catData, isLoading: catLoading, isFetching: catFetching } = useQuery({
    queryKey: ["cat-products", activeCatId, catPage, pageSize],
    queryFn: () => api.getBcCategoryProducts(activeCatId!, catPage, pageSize),
    enabled: activeCatId != null,
    placeholderData: (prev: any) => prev,
  });

  const showInventoryCounts =
    inventorySetting?.value !== false && inventorySetting?.value !== "false";

  // ── Category computed values ──
  const topLevelCats = useMemo(
    () =>
      allCategories
        .filter((c) => c.parent_id === 0)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [allCategories],
  );

  const subCats = useMemo(
    () =>
      selectedCatId
        ? allCategories
            .filter((c) => c.parent_id === selectedCatId)
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        : [],
    [allCategories, selectedCatId],
  );

  const selectedCat = allCategories.find((c) => c.id === selectedCatId);
  const selectedSubCat = allCategories.find((c) => c.id === selectedSubCatId);

  const catProducts = catData?.products ?? [];
  const catTotalPages = catData?.total_pages ?? 1;
  const catTotal = catData?.total ?? 0;

  // ── List mode (pinned / BC search results) ──
  const isCategoryMode = selectedCatId != null;

  const pinnedFiltered = useMemo(
    () =>
      allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase()),
      ),
    [allProducts, search],
  );

  const showingBcVariant =
    !isCategoryMode &&
    canSearchBigCommerce &&
    !!search.trim() &&
    bcResult?.resultType === "variant";

  const showingBcProducts =
    !isCategoryMode &&
    canSearchBigCommerce &&
    !!search.trim() &&
    bcResult?.resultType === "products";

  const showingPinned = !isCategoryMode && (!canSearchBigCommerce || !search.trim());

  const allListProducts: api.Product[] = showingBcProducts
    ? (bcResult as api.ProductListResult).products
    : showingPinned
      ? pinnedFiltered
      : [];

  const listTotalPages = Math.max(1, Math.ceil(allListProducts.length / pageSize));
  const paginatedListProducts = allListProducts.slice(
    (listPage - 1) * pageSize,
    listPage * pageSize,
  );

  const pageSizeOptions = columns === 4 ? PAGE_SIZE_OPTIONS_4COL : PAGE_SIZE_OPTIONS_5COL;
  const gridColClass = columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5";

  // ── Effects ──
  useEffect(() => {
    const defaultSize = columns === 4 ? 12 : 20;
    setPageSize(defaultSize);
    setCatPage(1);
    setListPage(1);
  }, [columns]);

  useEffect(() => {
    setCatPage(1);
  }, [selectedCatId, selectedSubCatId]);

  useEffect(() => {
    setListPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catDropRef.current && !catDropRef.current.contains(e.target as Node)) {
        setCatDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // BC search debounce
  useEffect(() => {
    if (!canSearchBigCommerce || !currentUser) return;
    if (!search.trim()) { setBcResult(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await api.agentBigCommerceSearch(search.trim(), currentUser.id);
        setBcResult(result);
      } catch (error: any) {
        toast({ title: "Search failed", description: error.message, variant: "destructive" });
        setBcResult(null);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, canSearchBigCommerce, currentUser?.id]);

  useEffect(() => {
    if (bcResult?.resultType === "variant") {
      const r = bcResult as api.DirectVariantResult;
      const qtyKey = `direct-${r.product.id}-${r.variant.id}`;
      setQuantities((prev) => ({ ...prev, [qtyKey]: prev[qtyKey] ?? 1 }));
    }
  }, [bcResult]);

  // ── Discount / qty helpers ──
  const formatStock = (stockLevel: number) => {
    if (showInventoryCounts) return `Stock: ${stockLevel}`;
    return stockLevel > 0 ? "Available" : "Out of stock";
  };

  const getMaxQuantity = (stockLevel: number, productId: number, variantId?: number) => {
    const cartItem = cart.find(
      (item) => item.product.id === productId && (!variantId || item.variant?.id === variantId),
    );
    return Math.max(0, stockLevel - (cartItem?.quantity || 0));
  };

  const handleQtyChange = (key: string, val: string, maxQty: number) => {
    const n = parseInt(val);
    setQuantities((prev) => ({ ...prev, [key]: isNaN(n) ? 0 : Math.min(Math.max(0, n), maxQty) }));
  };

  const handleFreeItem = (key: string, originalPrice: number) => {
    setDiscounts((prev) => {
      if (prev[key]?.type === "free") { const { [key]: _, ...rest } = prev; return rest; }
      return { ...prev, [key]: { type: "free", finalPrice: 0, value: null } };
    });
    setDiscountInputs((prev) => ({ ...prev, [key]: "" }));
  };

  const handleDiscountInputChange = (key: string, val: string) => {
    if (val === "") { setDiscountInputs((prev) => ({ ...prev, [key]: "" })); return; }
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= 100)
      setDiscountInputs((prev) => ({ ...prev, [key]: val }));
  };

  const handleDiscountBlur = (key: string, originalPrice: number) => {
    const inputVal = discountInputs[key];
    if (!inputVal) {
      setDiscounts((prev) => {
        if (prev[key]?.type === "percent") { const { [key]: _, ...rest } = prev; return rest; }
        return prev;
      });
      return;
    }
    const pct = parseFloat(inputVal);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    const finalPrice = Math.max(0, originalPrice * (1 - pct / 100));
    setDiscounts((prev) => ({ ...prev, [key]: { type: "percent", finalPrice, value: pct } }));
  };

  const clearDiscountForKey = (key: string) => {
    setDiscounts((prev) => { const { [key]: _, ...rest } = prev; return rest; });
    setDiscountInputs((prev) => { const { [key]: _, ...rest } = prev; return rest; });
  };

  const stockCheck = (stockLevel: number, qty: number, maxQty: number) => {
    if (stockLevel <= 0) { toast({ title: "Out of stock", variant: "destructive" }); return false; }
    if (qty > maxQty) { toast({ title: "Exceeds inventory", description: `Only ${maxQty} available.`, variant: "destructive" }); return false; }
    return true;
  };

  const handleAdd = (product: api.Product, variant?: any, overrideQtyKey?: string) => {
    const qtyKey = overrideQtyKey ?? (variant ? `${product.id}-${variant.id}` : `${product.id}`);
    const qty = quantities[qtyKey] || 1;
    const stockLevel = variant?.stock_level ?? product.stock_level;
    const maxQty = getMaxQuantity(stockLevel, product.id, variant?.id);
    const originalPrice = parseFloat(variant?.price || product.price);
    const discount = discounts[qtyKey];
    const priceAtSale = discount ? discount.finalPrice : originalPrice;
    if (!stockCheck(stockLevel, qty, maxQty)) return;
    addToCart(product, qty, variant, priceAtSale, originalPrice, discount?.type ?? null, discount?.value ?? null);
    clearDiscountForKey(qtyKey);
    setQuantities((prev) => { const next = { ...prev }; delete next[qtyKey]; return next; });
    toast({ title: "Added to cart", description: `${qty}x ${product.name}${variant ? ` (${variant.sku})` : ""} added.`, duration: 1000 });
  };

  const handleAddAll = (product: api.Product) => {
    const variants = getVariants(product);
    let addedCount = 0;
    let hasError = false;
    variants.forEach((v: any) => {
      const qtyKey = `${product.id}-${v.id}`;
      const qty = quantities[qtyKey];
      if (qty > 0) {
        const maxQty = getMaxQuantity(v.stock_level, product.id, v.id);
        if (qty <= maxQty && v.stock_level > 0) {
          const originalPrice = parseFloat(v.price);
          const discount = discounts[qtyKey];
          const priceAtSale = discount ? discount.finalPrice : originalPrice;
          addToCart(product, qty, v, priceAtSale, originalPrice, discount?.type ?? null, discount?.value ?? null);
          clearDiscountForKey(qtyKey);
          addedCount += qty;
        } else if (qty > 0) hasError = true;
      }
    });
    if (hasError) toast({ title: "Some items skipped", description: "Some quantities exceeded available inventory.", variant: "destructive" });
    if (addedCount > 0) {
      setQuantities((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => { if (key.startsWith(`${product.id}-`)) delete next[key]; });
        return next;
      });
      toast({ title: "Added to cart", description: `Multiple items from ${product.name} added.`, duration: 1000 });
    }
  };

  // ── Grid card (used for both category and pinned/search modes) ──
  const renderGridCard = (product: api.Product) => {
    const variants = getVariants(product);
    const hasVariants = variants.length > 0;
    const qtyKey = `grid-${product.id}`;
    const isOutOfStock = product.stock_level <= 0 && !hasVariants;
    const maxQty = hasVariants ? 999 : getMaxQuantity(product.stock_level, product.id);
    const originalPrice = parseFloat(product.price);
    const discount = discounts[qtyKey];
    const displayPrice = discount ? discount.finalPrice : originalPrice;
    const isDiscounted = !!discount;
    const qty = quantities[qtyKey] || 1;

    return (
      <div
        key={product.id}
        className={`bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-md transition-shadow flex flex-col ${isOutOfStock ? "opacity-60" : ""}`}
        data-testid={`card-grid-product-${product.id}`}
      >
        {/* Square image */}
        <div className="aspect-square bg-slate-100 overflow-hidden">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-slate-300" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 flex-1 flex flex-col gap-1">
          <p className="text-xs font-light leading-tight line-clamp-3 text-slate-800 flex-1 min-h-[2.5rem]">
            {product.name}
          </p>

          <div className="flex items-center gap-1">
            <span className={`text-sm font-bold ${isDiscounted ? "text-red-600" : "text-slate-900"}`}>
              ${displayPrice.toFixed(2)}
            </span>
            {isDiscounted && (
              <span className="text-xs text-slate-400 line-through">${originalPrice.toFixed(2)}</span>
            )}
            {hasVariants ? (
              <span className="text-[10px] text-slate-400 ml-auto">{variants.length} opts</span>
            ) : (
              <span className={`text-[10px] ml-auto ${product.stock_level > 0 ? "text-green-600" : "text-red-500"}`}>
                {showInventoryCounts ? `${product.stock_level}` : (product.stock_level > 0 ? "✓" : "✗")}
              </span>
            )}
          </div>

          {hasVariants ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full h-7 text-xs mt-0.5"
              onClick={() => setVariantModalProduct(product)}
              data-testid={`button-options-${product.id}`}
            >
              Select Options
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Button
                  variant={discount?.type === "free" ? "destructive" : "outline"}
                  size="sm"
                  className="h-6 px-1.5 text-[10px] font-bold shrink-0"
                  disabled={isOutOfStock}
                  onClick={() => handleFreeItem(qtyKey, originalPrice)}
                  data-testid={`button-free-${qtyKey}`}
                >FREE</Button>
                <Input
                  type="number" min="0" max="100" placeholder="%"
                  className="w-14 h-6 text-[10px] text-center bg-white shrink-0"
                  value={discountInputs[qtyKey] || ""}
                  disabled={isOutOfStock}
                  onChange={(e) => handleDiscountInputChange(qtyKey, e.target.value)}
                  onBlur={() => handleDiscountBlur(qtyKey, originalPrice)}
                  data-testid={`input-pct-${qtyKey}`}
                />
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Button variant="destructive" size="icon" className="h-7 w-7 shrink-0"
                  disabled={isOutOfStock || qty <= 1}
                  onClick={() => handleQtyChange(qtyKey, String(Math.max(1, qty - 1)), maxQty)}
                  data-testid={`button-minus-grid-${product.id}`}
                ><Minus className="h-3 w-3" /></Button>
                <Input
                  type="number" min="1" max={maxQty}
                  className="h-7 text-xs text-center w-10 shrink-0"
                  value={quantities[qtyKey] || ""}
                  placeholder="1"
                  disabled={isOutOfStock}
                  onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
                  data-testid={`input-qty-grid-${product.id}`}
                />
                <Button variant="destructive" size="icon" className="h-7 w-7 shrink-0"
                  disabled={isOutOfStock || qty >= maxQty}
                  onClick={() => handleQtyChange(qtyKey, String(Math.min(qty + 1, maxQty)), maxQty)}
                  data-testid={`button-plus-grid-${product.id}`}
                ><Plus className="h-3 w-3" /></Button>
                <Button size="sm" className="h-7 px-4 text-xs shrink-0"
                  disabled={isOutOfStock}
                  onClick={() => handleAdd(product, undefined, qtyKey)}
                  data-testid={`button-add-grid-${product.id}`}
                >Add</Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Direct variant card (BC exact match — SKU / UPC) ──
  const renderDirectVariantCard = (product: api.Product, variant: any) => {
    const qtyKey = `direct-${product.id}-${variant.id}`;
    const maxQty = getMaxQuantity(variant.stock_level, product.id, variant.id);
    const isOutOfStock = variant.stock_level <= 0;
    const originalPrice = parseFloat(variant.price);
    const discount = discounts[qtyKey];
    const isFree = discount?.type === "free";
    const displayPrice = discount ? discount.finalPrice : originalPrice;
    const isDiscounted = !!discount;
    const currentQty = quantities[qtyKey] ?? 1;

    const doAddToCart = () => {
      const qty = quantities[qtyKey] ?? 1;
      const priceAtSale = discount ? discount.finalPrice : originalPrice;
      if (stockCheck(variant.stock_level, qty, maxQty)) {
        addToCart(product, qty, variant, priceAtSale, originalPrice, discount?.type ?? null, discount?.value ?? null);
        clearDiscountForKey(qtyKey);
        setQuantities((prev) => { const next = { ...prev }; delete next[qtyKey]; return next; });
        toast({ title: "Added to cart", description: `${qty}x ${variant.sku} added.`, duration: 1000 });
      }
    };

    return (
      <Card key={qtyKey} className="bg-white rounded-2xl shadow-sm overflow-hidden" data-testid={`card-direct-variant-${variant.id}`}>
        <div className={`flex flex-col items-center text-center gap-4 px-6 py-7 sm:px-10 sm:py-9 ${isOutOfStock ? "opacity-50" : ""}`}>
          <h2 className="font-bold text-lg sm:text-xl leading-snug text-slate-900 w-full">{product.name}</h2>
          <div className="text-sm text-slate-500 space-y-0.5 leading-relaxed">
            {variant.option_values && variant.option_values.length > 0 && (
              <p className="font-semibold text-slate-700 text-base">
                {variant.option_values.map((ov: any) => ov.label).join(" / ")}
              </p>
            )}
            <p>SKU: {variant.sku} &bull; {formatStock(variant.stock_level)}</p>
            {variant.upc && <p className="text-xs text-slate-400">UPC: {variant.upc}</p>}
          </div>
          {product.image && <img src={product.image} alt={product.name} className="h-28 w-28 sm:h-36 sm:w-36 object-cover rounded-xl shadow-sm" />}
          <div className="flex items-baseline gap-2 flex-wrap justify-center">
            <span className={`font-bold text-3xl sm:text-4xl tabular-nums ${isDiscounted ? "text-red-600" : "text-primary"}`}>${displayPrice.toFixed(2)}</span>
            {isDiscounted && <span className="text-lg text-slate-400 line-through">${originalPrice.toFixed(2)}</span>}
            {isFree && <Badge variant="destructive" className="text-sm px-2 py-0.5">FREE</Badge>}
            {discount?.type === "percent" && <Badge variant="destructive" className="text-sm px-2 py-0.5">-{discount.value}%</Badge>}
          </div>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <Button variant={isFree ? "destructive" : "outline"} size="sm" className="h-8 px-3 text-xs font-bold"
              disabled={isOutOfStock}
              onClick={(e) => { e.stopPropagation(); handleFreeItem(qtyKey, originalPrice); }}
              data-testid={`button-free-${qtyKey}`}
            >FREE ITEM</Button>
            <Input type="number" min="0" max="100" placeholder="% off"
              className="w-20 h-8 text-sm text-center bg-white"
              value={discountInputs[qtyKey] || ""}
              disabled={isOutOfStock}
              onChange={(e) => handleDiscountInputChange(qtyKey, e.target.value)}
              onBlur={() => handleDiscountBlur(qtyKey, originalPrice)}
              onClick={(e) => e.stopPropagation()}
              data-testid={`input-discount-${qtyKey}`}
            />
            {isDiscounted && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-slate-400 hover:text-slate-700"
                onClick={() => clearDiscountForKey(qtyKey)}>Clear</Button>
            )}
          </div>
          <div className="flex items-center gap-3 justify-center">
            <Button variant="destructive" size="icon" className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl"
              disabled={isOutOfStock || currentQty <= 1}
              onClick={() => handleQtyChange(qtyKey, String(Math.max(1, currentQty - 1)), maxQty)}
              data-testid={`button-minus-direct-${variant.id}`}
            ><Minus className="h-4 w-4" /></Button>
            <Input type="number" min="1" max={maxQty}
              className="w-16 h-11 sm:h-12 bg-white text-center text-lg font-semibold rounded-xl"
              value={currentQty} disabled={isOutOfStock}
              onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
              data-testid={`input-qty-direct-${variant.id}`}
            />
            <Button variant="destructive" size="icon" className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl"
              disabled={isOutOfStock || currentQty >= maxQty}
              onClick={() => handleQtyChange(qtyKey, String(Math.min(currentQty + 1, maxQty)), maxQty)}
              data-testid={`button-plus-direct-${variant.id}`}
            ><Plus className="h-4 w-4" /></Button>
          </div>
          <Button size="lg" className="w-48 sm:w-56 rounded-xl text-base font-semibold"
            disabled={isOutOfStock} onClick={doAddToCart}
            data-testid={`button-add-direct-${variant.id}`}>
            {isOutOfStock ? "Out of Stock" : "Add to Cart"}
          </Button>
        </div>
      </Card>
    );
  };

  // ── Variant dialog ──
  const renderVariantDialog = () => {
    if (!variantModalProduct) return null;
    const variants = getVariants(variantModalProduct);
    return (
      <Dialog open={true} onOpenChange={() => setVariantModalProduct(null)}>
        <DialogContent
          className="w-[95vw] max-w-[95vw] flex flex-col p-0 gap-0"
          style={{
            height: "calc(var(--app-height, 100dvh) * 0.95)",
            maxHeight: "calc(var(--app-height, 100dvh) * 0.95)",
          }}
        >
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b">
            <DialogTitle className="text-base leading-snug pr-8">{variantModalProduct.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {variantModalProduct.image && (
              <img
                src={variantModalProduct.image}
                alt={variantModalProduct.name}
                className="w-full h-36 object-contain rounded-lg bg-slate-50 mb-4"
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {variants.map((v: any) => {
                const qtyKey = `${variantModalProduct.id}-${v.id}`;
                const maxQty = getMaxQuantity(v.stock_level, variantModalProduct.id, v.id);
                const isOutOfStock = v.stock_level <= 0;
                const originalPrice = parseFloat(v.price);
                const discount = discounts[qtyKey];
                const isFree = discount?.type === "free";
                const displayPrice = discount ? discount.finalPrice : originalPrice;
                const isDiscounted = !!discount;
                const qty = quantities[qtyKey] || 0;
                const variantLabel =
                  v.option_values?.length > 0
                    ? v.option_values.map((ov: any) => ov.label).join(" / ")
                    : v.sku;
                return (
                  <div key={v.id} className={`border rounded-xl p-3 flex flex-col gap-2 ${isOutOfStock ? "opacity-50 bg-slate-50" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">{variantLabel}</p>
                        <p className="text-xs text-slate-500 mt-0.5">SKU: {v.sku}</p>
                        <p className="text-xs text-slate-500">{formatStock(v.stock_level)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`font-bold text-sm ${isDiscounted ? "text-red-600" : "text-slate-900"}`}>
                          ${displayPrice.toFixed(2)}
                        </span>
                        {isDiscounted && (
                          <div className="text-xs text-slate-400 line-through">${originalPrice.toFixed(2)}</div>
                        )}
                        {isFree && <Badge variant="destructive" className="text-[10px]">FREE</Badge>}
                        {discount?.type === "percent" && <Badge variant="destructive" className="text-[10px]">-{discount.value}%</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        variant={isFree ? "destructive" : "outline"} size="sm"
                        className="h-7 px-2 text-[11px] font-bold"
                        disabled={isOutOfStock}
                        onClick={() => handleFreeItem(qtyKey, originalPrice)}
                      >FREE</Button>
                      <Input
                        type="number" min="0" max="100" placeholder="% off"
                        className="w-16 h-7 text-xs text-center bg-white"
                        value={discountInputs[qtyKey] || ""}
                        disabled={isOutOfStock}
                        onChange={(e) => handleDiscountInputChange(qtyKey, e.target.value)}
                        onBlur={() => handleDiscountBlur(qtyKey, originalPrice)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7 shrink-0"
                        disabled={isOutOfStock || qty <= 0}
                        onClick={() => handleQtyChange(qtyKey, String(Math.max(0, qty - 1)), maxQty)}
                      ><Minus className="h-3 w-3" /></Button>
                      <Input
                        type="number" min="0" max={maxQty} placeholder="0"
                        className="h-7 flex-1 bg-white text-center text-xs"
                        value={quantities[qtyKey] || ""}
                        disabled={isOutOfStock}
                        onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
                      />
                      <Button variant="outline" size="icon" className="h-7 w-7 shrink-0"
                        disabled={isOutOfStock || qty >= maxQty}
                        onClick={() => handleQtyChange(qtyKey, String(Math.min(qty + 1, maxQty)), maxQty)}
                      ><Plus className="h-3 w-3" /></Button>
                      <Button size="sm" className="h-7 px-3 text-xs shrink-0"
                        disabled={isOutOfStock || qty <= 0}
                        onClick={() => handleAdd(variantModalProduct, v, qtyKey)}
                      >Add</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 border-t px-4 py-3">
            <Button
              className="w-full"
              size="sm"
              disabled={!Object.keys(quantities).some(
                (k) => k.startsWith(`${variantModalProduct.id}-`) && quantities[k] > 0,
              )}
              onClick={() => { handleAddAll(variantModalProduct); setVariantModalProduct(null); }}
            >
              Add All to Cart
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  // ── Shared grid section renderer ──
  const renderGridSection = (
    products: api.Product[],
    loading: boolean,
    fetching: boolean,
    page: number,
    totalPages: number,
    total: number,
    onPageChange: (p: number) => void,
    showCount?: boolean,
    countLabel?: string,
  ) => (
    <div className="pb-6">
      {showCount && total > 0 && (
        <p className="text-[11px] text-slate-400 mb-3 ml-0.5">
          {total} product{total !== 1 ? "s" : ""}
          {countLabel ? ` in ${countLabel}` : ""}
        </p>
      )}

      {loading && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          <p className="text-sm">Loading products…</p>
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Package className="h-12 w-12 mb-3 text-slate-300" />
          <p className="text-sm font-medium">No products found</p>
        </div>
      )}

      {products.length > 0 && (
        <div
          className={`grid grid-cols-2 md:grid-cols-3 ${gridColClass} gap-3 ${fetching && !loading ? "opacity-70 pointer-events-none transition-opacity" : ""}`}
          data-testid="grid-products"
        >
          {products.map(renderGridCard)}
        </div>
      )}

      {totalPages > 1 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          onPageSizeChange={(n) => { setPageSize(n); onPageChange(1); }}
        />
      )}

      {totalPages <= 1 && products.length > 0 && (
        <div className="flex items-center justify-end gap-2 mt-4 border-t pt-3">
          <span className="text-xs text-slate-500">Per page:</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); onPageChange(1); }}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  // ── Render ──
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-10 bg-slate-50 pb-3 pt-1">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            <Input
              placeholder={canSearchBigCommerce ? "Search by name, SKU, or scan barcode…" : "Search pinned products…"}
              className="pl-10 bg-white"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value) { setSelectedCatId(null); setSelectedSubCatId(null); }
              }}
              data-testid="input-search"
            />
            {isSearching && <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-slate-400" />}
          </div>

          {/* Category dropdown */}
          <div className="relative shrink-0" ref={catDropRef}>
            <Button
              variant="outline"
              className="h-10 gap-1.5 text-sm font-medium bg-white min-w-[130px] justify-between"
              onClick={() => setCatDropOpen((o) => !o)}
              data-testid="btn-category-dropdown"
            >
              <span className="truncate max-w-[110px] uppercase tracking-wide text-xs">
                {catsLoading ? "Loading…" : selectedCat ? selectedCat.name : "All Categories"}
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${catDropOpen ? "rotate-180" : ""}`} />
            </Button>
            {selectedCatId && (
              <button
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 z-10"
                onClick={(e) => { e.stopPropagation(); setSelectedCatId(null); setSelectedSubCatId(null); }}
                data-testid="btn-clear-category"
                title="Clear category"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
            {catDropOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto">
                <button
                  className="w-full text-left px-3 py-2 text-xs uppercase tracking-wide hover:bg-slate-50 border-b text-slate-400 italic"
                  onClick={() => { setSelectedCatId(null); setSelectedSubCatId(null); setCatDropOpen(false); }}
                >
                  — Pinned Products —
                </button>
                {topLevelCats.length === 0 && !catsLoading && (
                  <p className="px-3 py-4 text-sm text-slate-400 text-center">No categories found</p>
                )}
                {topLevelCats.map((cat) => (
                  <button
                    key={cat.id}
                    className={`w-full text-left px-3 py-2.5 text-xs uppercase tracking-wide hover:bg-slate-50 border-b last:border-0 font-medium ${selectedCatId === cat.id ? "bg-primary/5 text-primary" : "text-slate-700"}`}
                    onClick={() => { setSelectedCatId(cat.id); setSelectedSubCatId(null); setCatDropOpen(false); setSearch(""); }}
                    data-testid={`option-cat-${cat.id}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Column toggle */}
          <div className="hidden sm:flex items-center gap-1 bg-white border rounded-lg p-1 shrink-0">
            <button
              className={`h-7 w-7 flex items-center justify-center rounded text-xs font-bold transition-colors ${columns === 4 ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              onClick={() => setColumns(4)}
              title="4 columns"
              data-testid="btn-4-col"
            >4</button>
            <button
              className={`h-7 w-7 flex items-center justify-center rounded text-xs font-bold transition-colors ${columns === 5 ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              onClick={() => setColumns(5)}
              title="5 columns"
              data-testid="btn-5-col"
            >5</button>
          </div>
        </div>

        {canSearchBigCommerce && !isCategoryMode && (
          <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
            BigCommerce search active — type a name, SKU, or UPC/barcode
          </p>
        )}

        {/* Sub-category pill buttons */}
        {isCategoryMode && subCats.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            <button
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors uppercase tracking-wide ${selectedSubCatId === null ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
              onClick={() => setSelectedSubCatId(null)}
              data-testid="btn-subcat-all"
            >
              All {selectedCat?.name}
            </button>
            {subCats.map((sc) => (
              <button
                key={sc.id}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors uppercase tracking-wide ${selectedSubCatId === sc.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
                onClick={() => setSelectedSubCatId(selectedSubCatId === sc.id ? null : sc.id)}
                data-testid={`btn-subcat-${sc.id}`}
              >
                {sc.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Category browse grid ── */}
      {isCategoryMode && renderGridSection(
        catProducts,
        catLoading,
        catFetching,
        catPage,
        catTotalPages,
        catTotal,
        setCatPage,
        true,
        selectedSubCat?.name ?? selectedCat?.name,
      )}

      {/* ── BC exact match (SKU / UPC) ── */}
      {showingBcVariant && (
        <div className="space-y-4 pb-20">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Exact Match</p>
          {(() => {
            const r = bcResult as api.DirectVariantResult;
            return renderDirectVariantCard(r.product, r.variant);
          })()}
        </div>
      )}

      {/* ── Pinned / keyword results grid ── */}
      {!isCategoryMode && !showingBcVariant && (
        <>
          {search.trim() && !isSearching && allListProducts.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No products found.</div>
          ) : (
            renderGridSection(
              paginatedListProducts,
              false,
              isSearching,
              listPage,
              listTotalPages,
              allListProducts.length,
              setListPage,
              false,
            )
          )}
        </>
      )}

      {/* Variant modal */}
      {renderVariantDialog()}
    </div>
  );
}
