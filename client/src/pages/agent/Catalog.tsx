import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Search, Plus, Minus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Card } from "@/components/ui/card";

interface DiscountState {
  type: 'free' | 'percent';
  finalPrice: number;
  value: number | null;
}

export default function Catalog() {
  const [search, setSearch] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [bcResult, setBcResult] = useState<api.AgentSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [discounts, setDiscounts] = useState<Record<string, DiscountState>>({});
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const { currentUser, addToCart, cart } = useStore();
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const canSearchBigCommerce = currentUser?.allow_bigcommerce_search || false;

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products', 'pinned'],
    queryFn: api.getPinnedProducts
  });

  const { data: inventorySetting } = useQuery({
    queryKey: ['settings', 'show_inventory_counts'],
    queryFn: () => api.getSetting('show_inventory_counts')
  });

  const showInventoryCounts = inventorySetting?.value !== false && inventorySetting?.value !== 'false';

  const formatStock = (stockLevel: number) => {
    if (showInventoryCounts) return `Stock: ${stockLevel}`;
    return stockLevel > 0 ? 'Available' : 'Out of stock';
  };

  const getMaxQuantity = (stockLevel: number, productId: number, variantId?: number) => {
    const cartItem = cart.find(item =>
      item.product.id === productId &&
      (!variantId || item.variant?.id === variantId)
    );
    const inCart = cartItem?.quantity || 0;
    return Math.max(0, stockLevel - inCart);
  };

  const pinnedProducts = useMemo(() =>
    allProducts.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    ), [allProducts, search]
  );

  // Auto-search BigCommerce when permitted and user types
  useEffect(() => {
    if (!canSearchBigCommerce || !currentUser) return;

    if (!search.trim()) {
      setBcResult(null);
      return;
    }

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

  // When a direct variant result arrives, pre-fill quantity = 1 so Add to Cart is ready instantly
  useEffect(() => {
    if (bcResult?.resultType === 'variant') {
      const r = bcResult as api.DirectVariantResult;
      const qtyKey = `direct-${r.product.id}-${r.variant.id}`;
      setQuantities(prev => ({ ...prev, [qtyKey]: prev[qtyKey] ?? 1 }));
    }
  }, [bcResult]);

  // ── Discount helpers ──
  const handleFreeItem = (key: string, originalPrice: number) => {
    setDiscounts(prev => {
      if (prev[key]?.type === 'free') {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { type: 'free', finalPrice: 0, value: null } };
    });
    setDiscountInputs(prev => ({ ...prev, [key]: '' }));
  };

  const handleDiscountInputChange = (key: string, val: string) => {
    if (val === '') { setDiscountInputs(prev => ({ ...prev, [key]: '' })); return; }
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      setDiscountInputs(prev => ({ ...prev, [key]: val }));
    }
  };

  const handleDiscountBlur = (key: string, originalPrice: number) => {
    const inputVal = discountInputs[key];
    if (!inputVal) {
      setDiscounts(prev => {
        if (prev[key]?.type === 'percent') { const { [key]: _, ...rest } = prev; return rest; }
        return prev;
      });
      return;
    }
    const pct = parseFloat(inputVal);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    const finalPrice = Math.max(0, originalPrice * (1 - pct / 100));
    setDiscounts(prev => ({ ...prev, [key]: { type: 'percent', finalPrice, value: pct } }));
  };

  const clearDiscountForKey = (key: string) => {
    setDiscounts(prev => { const { [key]: _, ...rest } = prev; return rest; });
    setDiscountInputs(prev => { const { [key]: _, ...rest } = prev; return rest; });
  };

  const handleQtyChange = (key: string, val: string, maxQty: number) => {
    const n = parseInt(val);
    setQuantities(prev => ({ ...prev, [key]: isNaN(n) ? 0 : Math.min(Math.max(0, n), maxQty) }));
  };

  const handleAdd = (product: api.Product, variant?: any) => {
    const qtyKey = variant ? `${product.id}-${variant.id}` : `${product.id}`;
    const qty = quantities[qtyKey] || 1;
    const stockLevel = variant?.stock_level ?? product.stock_level;
    const maxQty = getMaxQuantity(stockLevel, product.id, variant?.id);
    const originalPrice = parseFloat(variant?.price || product.price);
    const discount = discounts[qtyKey];
    const priceAtSale = discount ? discount.finalPrice : originalPrice;

    if (stockLevel <= 0) {
      toast({ title: "Out of stock", description: "This item is currently out of stock.", variant: "destructive" });
      return;
    }
    if (qty > maxQty) {
      toast({ title: "Exceeds inventory", description: `Only ${maxQty} available.`, variant: "destructive" });
      return;
    }

    addToCart(product, qty, variant, priceAtSale, originalPrice, discount?.type ?? null, discount?.value ?? null);
    clearDiscountForKey(qtyKey);
    setQuantities(prev => { const next = { ...prev }; delete next[qtyKey]; return next; });
    toast({ title: "Added to cart", description: `${qty}x ${product.name}${variant ? ` (${variant.sku})` : ''} added.`, duration: 1000 });
  };

  const handleAddAll = (product: api.Product) => {
    const variants = typeof product.variants === 'string' ? JSON.parse(product.variants) : product.variants;
    let addedCount = 0;
    let hasError = false;

    if (variants && Array.isArray(variants) && variants.length > 0) {
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
          } else if (qty > 0) { hasError = true; }
        }
      });
    } else {
      const qtyKey = `${product.id}`;
      const qty = quantities[qtyKey];
      if (qty > 0) {
        const maxQty = getMaxQuantity(product.stock_level, product.id);
        if (qty <= maxQty && product.stock_level > 0) {
          const originalPrice = parseFloat(product.price);
          const discount = discounts[qtyKey];
          const priceAtSale = discount ? discount.finalPrice : originalPrice;
          addToCart(product, qty, undefined, priceAtSale, originalPrice, discount?.type ?? null, discount?.value ?? null);
          clearDiscountForKey(qtyKey);
          addedCount += qty;
        } else { hasError = true; }
      }
    }

    if (hasError) toast({ title: "Some items skipped", description: "Some quantities exceeded available inventory.", variant: "destructive" });
    if (addedCount > 0) {
      setQuantities(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => { if (key.startsWith(`${product.id}-`) || key === `${product.id}`) delete next[key]; });
        return next;
      });
      toast({ title: "Added to cart", description: `Multiple items from ${product.name} added.`, duration: 1000 });
    }
  };

  // ── Reusable: discount controls for any variant row ──
  const renderDiscountControls = (qtyKey: string, originalPrice: number, isOutOfStock: boolean) => {
    const discount = discounts[qtyKey];
    const isFree = discount?.type === 'free';
    const displayPrice = discount ? discount.finalPrice : originalPrice;
    const isDiscounted = !!discount;
    return (
      <div className="mt-1 space-y-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`font-bold text-sm ${isDiscounted ? 'text-red-600' : 'text-primary'}`}>${displayPrice.toFixed(2)}</span>
          {isDiscounted && <span className="text-xs text-slate-400 line-through">${originalPrice.toFixed(2)}</span>}
          {isFree && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">FREE</Badge>}
          {discount?.type === 'percent' && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">-{discount.value}%</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={isFree ? 'destructive' : 'outline'}
            size="sm"
            className="h-6 px-2 text-[11px] font-bold"
            disabled={isOutOfStock}
            onClick={(e) => { e.stopPropagation(); handleFreeItem(qtyKey, originalPrice); }}
            data-testid={`button-free-${qtyKey}`}
          >FREE ITEM</Button>
          <Input
            type="number" min="0" max="100" placeholder="%"
            className="w-14 h-6 text-xs text-center bg-white"
            value={discountInputs[qtyKey] || ''}
            disabled={isOutOfStock}
            onChange={(e) => handleDiscountInputChange(qtyKey, e.target.value)}
            onBlur={() => handleDiscountBlur(qtyKey, originalPrice)}
            onClick={(e) => e.stopPropagation()}
            data-testid={`input-discount-${qtyKey}`}
          />
        </div>
      </div>
    );
  };

  // ── Direct variant card (SKU/UPC match) ──
  const renderDirectVariantCard = (product: api.Product, variant: any) => {
    const qtyKey = `direct-${product.id}-${variant.id}`;
    const maxQty = getMaxQuantity(variant.stock_level, product.id, variant.id);
    const isOutOfStock = variant.stock_level <= 0;
    const originalPrice = parseFloat(variant.price);

    return (
      <Card key={qtyKey} className="overflow-hidden" data-testid={`card-direct-variant-${variant.id}`}>
        <div className="flex p-4 gap-4">
          <img src={product.image || undefined} className="h-16 w-16 object-cover rounded shrink-0" alt={product.name} />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</h3>
            {variant.option_values && variant.option_values.length > 0 && (
              <p className="text-xs font-medium text-slate-700 mt-0.5">
                {variant.option_values.map((ov: any) => ov.label).join(' / ')}
              </p>
            )}
            <p className="text-xs text-slate-500">SKU: {variant.sku} • {formatStock(variant.stock_level)}</p>
            {variant.upc && <p className="text-xs text-slate-400">UPC: {variant.upc}</p>}
          </div>
        </div>
        <div className={`px-4 pb-4 ${isOutOfStock ? 'opacity-50' : ''}`}>
          {renderDiscountControls(qtyKey, originalPrice, isOutOfStock)}
          <div className="flex items-center gap-1 mt-2">
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={isOutOfStock || (quantities[qtyKey] ?? 1) <= 1}
              onClick={() => handleQtyChange(qtyKey, String(Math.max(1, (quantities[qtyKey] ?? 1) - 1)), maxQty)}
              data-testid={`button-minus-direct-${variant.id}`}
            ><Minus className="h-3 w-3" /></Button>
            <Input
              type="number" min="1" max={maxQty} placeholder="1"
              className="w-14 h-8 bg-white text-center"
              value={quantities[qtyKey] ?? 1}
              disabled={isOutOfStock}
              onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
              data-testid={`input-qty-direct-${variant.id}`}
            />
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={isOutOfStock || (quantities[qtyKey] ?? 1) >= maxQty}
              onClick={() => handleQtyChange(qtyKey, String(Math.min((quantities[qtyKey] ?? 1) + 1, maxQty)), maxQty)}
              data-testid={`button-plus-direct-${variant.id}`}
            ><Plus className="h-3 w-3" /></Button>
            <Button
              size="sm"
              disabled={isOutOfStock}
              onClick={() => {
                const qty = quantities[qtyKey] ?? 1;
                const discount = discounts[qtyKey];
                const priceAtSale = discount ? discount.finalPrice : originalPrice;
                if (stockCheck(variant.stock_level, qty, maxQty)) {
                  addToCart(product, qty, variant, priceAtSale, originalPrice, discount?.type ?? null, discount?.value ?? null);
                  clearDiscountForKey(qtyKey);
                  setQuantities(prev => { const next = { ...prev }; delete next[qtyKey]; return next; });
                  toast({ title: "Added to cart", description: `${qty}x ${variant.sku} added.`, duration: 1000 });
                }
              }}
              data-testid={`button-add-direct-${variant.id}`}
            >Add to Cart</Button>
          </div>
        </div>
      </Card>
    );
  };

  const stockCheck = (stockLevel: number, qty: number, maxQty: number) => {
    if (stockLevel <= 0) { toast({ title: "Out of stock", variant: "destructive" }); return false; }
    if (qty > maxQty) { toast({ title: "Exceeds inventory", description: `Only ${maxQty} available.`, variant: "destructive" }); return false; }
    return true;
  };

  // ── Product card (expandable, for keyword results and pinned products) ──
  const renderProductCard = (product: api.Product) => {
    const productKey = `${product.id}`;
    const variants = typeof product.variants === 'string' ? JSON.parse(product.variants) : product.variants;
    const hasVariants = variants && Array.isArray(variants) && variants.length > 0;

    return (
      <Card key={productKey} className="overflow-hidden" data-testid={`card-product-${product.id}`}>
        <div
          className="flex p-4 gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
        >
          <img src={product.image || undefined} className="h-20 w-20 object-cover rounded" alt={product.name} />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</h3>
            <p className="text-xs text-slate-500 mt-1">Base Price: ${parseFloat(product.price).toFixed(2)}</p>
            {canSearchBigCommerce && !product.is_pinned && (
              <Badge variant="outline" className="mt-1 text-xs">BigCommerce</Badge>
            )}
            <div className="mt-2 flex items-center text-xs font-medium text-primary">
              {hasVariants ? (
                <>{variants.length} Variants Available {expandedProduct === product.id ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}</>
              ) : (
                <span>Click to add</span>
              )}
            </div>
          </div>
        </div>

        {expandedProduct === product.id && (
          <div className="bg-slate-50 p-4 border-t space-y-4">
            {hasVariants ? (
              <>
                {variants.map((v: any) => {
                  const qtyKey = `${product.id}-${v.id}`;
                  const maxQty = getMaxQuantity(v.stock_level, product.id, v.id);
                  const isOutOfStock = v.stock_level <= 0;
                  const originalPrice = parseFloat(v.price);
                  return (
                    <div key={v.id} className={`border-b border-slate-200 pb-3 last:border-0 last:pb-0 ${isOutOfStock ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm">
                            {v.option_values && v.option_values.length > 0
                              ? v.option_values.map((ov: any) => ov.label).join(' / ')
                              : (v.sku || `Variant ${v.id}`)}
                          </div>
                          <div className="text-xs text-slate-500">SKU: {v.sku} • {formatStock(v.stock_level)}</div>
                          {renderDiscountControls(qtyKey, originalPrice, isOutOfStock)}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="icon" className="h-8 w-8" disabled={isOutOfStock}
                            onClick={(e) => { e.stopPropagation(); handleQtyChange(qtyKey, String(Math.max(0, (quantities[qtyKey] || 0) - 1)), maxQty); }}
                            data-testid={`button-minus-${v.id}`}><Minus className="h-3 w-3" /></Button>
                          <Input type="number" min="0" max={maxQty} placeholder="0"
                            className="w-14 h-8 bg-white text-center"
                            value={quantities[qtyKey] || ""}
                            disabled={isOutOfStock}
                            onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`input-qty-${v.id}`} />
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            disabled={isOutOfStock || (quantities[qtyKey] || 0) >= maxQty}
                            onClick={(e) => { e.stopPropagation(); handleQtyChange(qtyKey, String(Math.min((quantities[qtyKey] || 0) + 1, maxQty)), maxQty); }}
                            data-testid={`button-plus-${v.id}`}><Plus className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-end pt-2">
                  <Button size="sm"
                    onClick={() => handleAddAll(product)}
                    disabled={!Object.keys(quantities).some(k => k.startsWith(`${product.id}-`) && quantities[k] > 0)}
                    data-testid={`button-add-all-${product.id}`}>Add to Cart</Button>
                </div>
              </>
            ) : (
              (() => {
                const qtyKey = `${product.id}`;
                const maxQty = getMaxQuantity(product.stock_level, product.id);
                const isOutOfStock = product.stock_level <= 0;
                const originalPrice = parseFloat(product.price);
                return (
                  <div className={isOutOfStock ? 'opacity-50' : ''}>
                    <div className="text-xs text-slate-500 mb-2">SKU: {product.sku} • {formatStock(product.stock_level)}</div>
                    {renderDiscountControls(qtyKey, originalPrice, isOutOfStock)}
                    <div className="flex items-center gap-1 mt-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={isOutOfStock}
                        onClick={(e) => { e.stopPropagation(); handleQtyChange(qtyKey, String(Math.max(0, (quantities[qtyKey] || 0) - 1)), maxQty); }}
                        data-testid={`button-minus-${product.id}`}><Minus className="h-3 w-3" /></Button>
                      <Input type="number" min="0" max={maxQty} placeholder="0"
                        className="w-14 h-8 bg-white text-center"
                        value={quantities[qtyKey] || ""}
                        disabled={isOutOfStock}
                        onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`input-qty-${product.id}`} />
                      <Button variant="outline" size="icon" className="h-8 w-8"
                        disabled={isOutOfStock || (quantities[qtyKey] || 0) >= maxQty}
                        onClick={(e) => { e.stopPropagation(); handleQtyChange(qtyKey, String(Math.min((quantities[qtyKey] || 0) + 1, maxQty)), maxQty); }}
                        data-testid={`button-plus-${product.id}`}><Plus className="h-3 w-3" /></Button>
                      <Button size="sm"
                        onClick={() => handleAdd(product)}
                        disabled={isOutOfStock || !(quantities[qtyKey] > 0)}
                        data-testid={`button-add-${product.id}`}>Add</Button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}
      </Card>
    );
  };

  // ── Determine what to show ──
  const showingBcVariant = canSearchBigCommerce && search.trim() && bcResult?.resultType === 'variant';
  const showingBcProducts = canSearchBigCommerce && search.trim() && bcResult?.resultType === 'products';
  const showingPinned = !canSearchBigCommerce || !search.trim();

  const displayProducts: api.Product[] = showingBcProducts
    ? (bcResult as api.ProductListResult).products
    : showingPinned
    ? pinnedProducts
    : [];

  return (
    <MobileShell title="Catalog">
      <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-4 pt-1">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input
            placeholder={canSearchBigCommerce ? "Search by name, SKU, or scan barcode…" : "Search pinned products…"}
            className="pl-10 bg-white dark:bg-slate-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-slate-400" />
          )}
        </div>
        {canSearchBigCommerce && (
          <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
            BigCommerce search active — type a name, SKU, or UPC/barcode
          </p>
        )}
      </div>

      <div className="space-y-4 pb-20">
        {/* Direct variant result (SKU or UPC match) */}
        {showingBcVariant && (() => {
          const r = bcResult as api.DirectVariantResult;
          return (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Exact Match</p>
              {renderDirectVariantCard(r.product, r.variant)}
            </div>
          );
        })()}

        {/* Keyword product results or pinned products */}
        {!showingBcVariant && displayProducts.length === 0 && search.trim() && !isSearching && (
          <div className="text-center text-slate-500 py-8">No products found.</div>
        )}

        {!showingBcVariant && displayProducts.map(renderProductCard)}
      </div>
    </MobileShell>
  );
}
