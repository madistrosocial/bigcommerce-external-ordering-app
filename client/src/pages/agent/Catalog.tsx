import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, Plus, Minus, ChevronDown, ChevronUp, Globe, Loader2 } from "lucide-react";
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
  const [searchBigCommerce, setSearchBigCommerce] = useState(false);
  const [bcSearchQuery, setBcSearchQuery] = useState("");
  const [bcSearchResults, setBcSearchResults] = useState<api.Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [discounts, setDiscounts] = useState<Record<string, DiscountState>>({});
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  
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
    if (showInventoryCounts) {
      return `Stock: ${stockLevel}`;
    }
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

  const displayProducts = searchBigCommerce ? bcSearchResults : pinnedProducts;

  const handleBcSearch = async () => {
    if (!bcSearchQuery.trim() || !currentUser) return;
    
    setIsSearching(true);
    try {
      const results = await api.agentBigCommerceSearch(bcSearchQuery.trim(), currentUser.id);
      setBcSearchResults(results);
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive"
      });
      setBcSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQtyChange = (key: string, val: string, maxQty: number) => {
    const n = parseInt(val);
    const clampedQty = isNaN(n) ? 0 : Math.min(Math.max(0, n), maxQty);
    setQuantities(prev => ({ ...prev, [key]: clampedQty }));
  };

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
    if (val === '') {
      setDiscountInputs(prev => ({ ...prev, [key]: '' }));
      return;
    }
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      setDiscountInputs(prev => ({ ...prev, [key]: val }));
    }
  };

  const handleDiscountBlur = (key: string, originalPrice: number) => {
    const inputVal = discountInputs[key];
    if (!inputVal || inputVal === '') {
      setDiscounts(prev => {
        if (prev[key]?.type === 'percent') {
          const { [key]: _, ...rest } = prev;
          return rest;
        }
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

  const handleAdd = (product: api.Product, variant?: any) => {
    const qtyKey = variant ? `${product.id}-${variant.id}` : `${product.id}`;
    const qty = quantities[qtyKey] || 1;
    const stockLevel = variant?.stock_level ?? product.stock_level;
    const maxQty = getMaxQuantity(stockLevel, product.id, variant?.id);
    const originalPrice = parseFloat(variant?.price || product.price);
    const discount = discounts[qtyKey];
    const priceAtSale = discount ? discount.finalPrice : originalPrice;
    
    if (stockLevel <= 0) {
      toast({
        title: "Out of stock",
        description: "This item is currently out of stock.",
        variant: "destructive"
      });
      return;
    }

    if (qty > maxQty) {
      toast({
        title: "Exceeds inventory",
        description: `Only ${maxQty} available (${stockLevel} in stock, some in cart).`,
        variant: "destructive"
      });
      return;
    }
    
    addToCart(product, qty, variant, priceAtSale, originalPrice, discount?.type ?? null, discount?.value ?? null);
    clearDiscountForKey(qtyKey);
    setQuantities(prev => {
      const next = { ...prev };
      delete next[qtyKey];
      return next;
    });
    
    toast({
      title: "Added to cart",
      description: `${qty}x ${product.name} ${variant ? `(${variant.sku})` : ''} added.`,
      duration: 1000,
    });
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
          } else if (qty > 0) {
            hasError = true;
          }
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
        } else {
          hasError = true;
        }
      }
    }

    if (hasError) {
      toast({
        title: "Some items skipped",
        description: "Some quantities exceeded available inventory.",
        variant: "destructive"
      });
    }

    if (addedCount > 0) {
      setQuantities(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (key.startsWith(`${product.id}-`) || key === `${product.id}`) {
            delete next[key];
          }
        });
        return next;
      });

      toast({
        title: "Added to cart",
        description: `Multiple items from ${product.name} added.`,
        duration: 1000,
      });
    }
  };

  const renderDiscountControls = (qtyKey: string, originalPrice: number, isOutOfStock: boolean) => {
    const discount = discounts[qtyKey];
    const isFree = discount?.type === 'free';
    const displayPrice = discount ? discount.finalPrice : originalPrice;
    const isDiscounted = !!discount;

    return (
      <div className="mt-1 space-y-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`font-bold text-sm ${isDiscounted ? 'text-red-600' : 'text-primary'}`}>
            ${displayPrice.toFixed(2)}
          </span>
          {isDiscounted && (
            <span className="text-xs text-slate-400 line-through">${originalPrice.toFixed(2)}</span>
          )}
          {isFree && (
            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">FREE</Badge>
          )}
          {discount?.type === 'percent' && (
            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">-{discount.value}%</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={isFree ? 'destructive' : 'outline'}
            size="sm"
            className="h-6 px-2 text-[11px] font-bold"
            disabled={isOutOfStock}
            onClick={(e) => { e.stopPropagation(); handleFreeItem(qtyKey, originalPrice); }}
            data-testid={`button-free-${qtyKey}`}
          >
            FREE ITEM
          </Button>
          <Input
            type="number"
            min="0"
            max="100"
            placeholder="%"
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

  return (
    <MobileShell title="Catalog">
      <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-4 pt-1 space-y-3">
        {canSearchBigCommerce && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <Globe className="h-4 w-4 text-blue-600" />
            <Label htmlFor="bc-toggle" className="text-sm text-blue-700 flex-1">
              Search BigCommerce Inventory
            </Label>
            <Switch 
              id="bc-toggle"
              checked={searchBigCommerce}
              onCheckedChange={(checked) => {
                setSearchBigCommerce(checked);
                if (!checked) {
                  setBcSearchResults([]);
                  setBcSearchQuery("");
                }
              }}
              data-testid="toggle-bigcommerce-search"
            />
          </div>
        )}
        
        {searchBigCommerce ? (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
              <Input 
                placeholder="Search BigCommerce catalog..." 
                className="pl-10 bg-white dark:bg-slate-800"
                value={bcSearchQuery}
                onChange={(e) => setBcSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBcSearch()}
                data-testid="input-bc-search"
              />
            </div>
            <Button 
              onClick={handleBcSearch}
              disabled={isSearching || !bcSearchQuery.trim()}
              data-testid="button-bc-search"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            <Input 
              placeholder="Search pinned products..." 
              className="pl-10 bg-white dark:bg-slate-800"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
        )}
      </div>

      <div className="space-y-4 pb-20">
        {searchBigCommerce && bcSearchResults.length === 0 && !isSearching && bcSearchQuery && (
          <div className="text-center text-slate-500 py-8">
            No products found. Try a different search term.
          </div>
        )}
        
        {displayProducts.map((product) => {
          const productKey = searchBigCommerce ? `bc-${product.bigcommerce_id}` : `${product.id}`;
          
          return (
            <Card key={productKey} className="overflow-hidden" data-testid={`card-product-${product.id}`}>
              <div 
                className="flex p-4 gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
              >
                <img 
                  src={product.image || undefined} 
                  className="h-20 w-20 object-cover rounded" 
                  alt={product.name} 
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">Base Price: ${parseFloat(product.price).toFixed(2)}</p>
                  {searchBigCommerce && !product.is_pinned && (
                    <Badge variant="outline" className="mt-1 text-xs">BigCommerce</Badge>
                  )}
                  <div className="mt-2 flex items-center text-xs font-medium text-primary">
                    {(() => {
                      const variants = typeof product.variants === 'string' ? JSON.parse(product.variants) : product.variants;
                      const hasVariants = (variants && Array.isArray(variants) && variants.length > 0);
                      if (hasVariants) {
                        return (
                          <>
                            {variants.length} Variants Available 
                            {expandedProduct === product.id ? <ChevronUp className="ml-1 h-3 w-3"/> : <ChevronDown className="ml-1 h-3 w-3"/>}
                          </>
                        );
                      }
                      return <span>Click to add</span>;
                    })()}
                  </div>
                </div>
              </div>

              {expandedProduct === product.id && (
                <div className="bg-slate-50 p-4 border-t space-y-4">
                  {(() => {
                    const variants = typeof product.variants === 'string' ? JSON.parse(product.variants) : product.variants;
                    const hasVariants = (variants && Array.isArray(variants) && variants.length > 0);
                    
                    if (hasVariants) {
                      return (
                        <>
                          {(variants || []).map((v: any) => {
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
                                    <Button 
                                      variant="outline" 
                                      size="icon" 
                                      className="h-8 w-8"
                                      disabled={isOutOfStock}
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleQtyChange(qtyKey, String(Math.max(0, (quantities[qtyKey] || 0) - 1)), maxQty); 
                                      }}
                                      data-testid={`button-minus-${v.id}`}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <Input 
                                      type="number" 
                                      min="0"
                                      max={maxQty}
                                      placeholder="0"
                                      className="w-14 h-8 bg-white text-center"
                                      value={quantities[qtyKey] || ""}
                                      disabled={isOutOfStock}
                                      onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`input-qty-${v.id}`}
                                    />
                                    <Button 
                                      variant="outline" 
                                      size="icon" 
                                      className="h-8 w-8"
                                      disabled={isOutOfStock || (quantities[qtyKey] || 0) >= maxQty}
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleQtyChange(qtyKey, String(Math.min((quantities[qtyKey] || 0) + 1, maxQty)), maxQty); 
                                      }}
                                      data-testid={`button-plus-${v.id}`}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex justify-end pt-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleAddAll(product)}
                              disabled={!Object.keys(quantities).some(k => k.startsWith(`${product.id}-`) && quantities[k] > 0)}
                              data-testid={`button-add-all-${product.id}`}
                            >
                              Add to Cart
                            </Button>
                          </div>
                        </>
                      );
                    }
                    
                    const qtyKey = `${product.id}`;
                    const maxQty = getMaxQuantity(product.stock_level, product.id);
                    const isOutOfStock = product.stock_level <= 0;
                    const originalPrice = parseFloat(product.price);
                    
                    return (
                      <div className={`${isOutOfStock ? 'opacity-50' : ''}`}>
                        <div className="text-xs text-slate-500 mb-2">SKU: {product.sku} • {formatStock(product.stock_level)}</div>
                        {renderDiscountControls(qtyKey, originalPrice, isOutOfStock)}
                        <div className="flex items-center gap-1 mt-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8"
                            disabled={isOutOfStock}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleQtyChange(qtyKey, String(Math.max(0, (quantities[qtyKey] || 0) - 1)), maxQty); 
                            }}
                            data-testid={`button-minus-${product.id}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input 
                            type="number" 
                            min="0"
                            max={maxQty}
                            placeholder="0"
                            className="w-14 h-8 bg-white text-center"
                            value={quantities[qtyKey] || ""}
                            disabled={isOutOfStock}
                            onChange={(e) => handleQtyChange(qtyKey, e.target.value, maxQty)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`input-qty-${product.id}`}
                          />
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8"
                            disabled={isOutOfStock || (quantities[qtyKey] || 0) >= maxQty}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleQtyChange(qtyKey, String(Math.min((quantities[qtyKey] || 0) + 1, maxQty)), maxQty); 
                            }}
                            data-testid={`button-plus-${product.id}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => handleAdd(product)}
                            disabled={isOutOfStock || !(quantities[qtyKey] > 0)}
                            data-testid={`button-add-${product.id}`}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </MobileShell>
  );
}
