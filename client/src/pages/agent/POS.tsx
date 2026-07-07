import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/toaster";
import {
  Search,
  Loader2,
  X,
  Plus,
  Minus,
  Trash2,
  User,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Package,
  ChevronDown,
  Wifi,
  WifiOff,
  LogOut,
  Package as PackageIcon,
  Monitor,
  FileText,
  RotateCw,
  Tag,
  Wallet,
  Percent,
  DollarSign,
  Maximize2,
  Minimize2,
  Columns2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import type { CartItem } from "@/lib/store";
import {
  getPriceListCacheBatch,
  setPriceListCacheBatch,
  getLocalPriceHistory,
  saveLocalPriceHistoryBatch,
} from "@/lib/db";
import { usePriceHistorySync } from "@/lib/usePriceHistorySync";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvPushItem {
  lineId: string;
  sku: string;
  productName: string;
  variantName?: string;
  cartQty: number;
  bcStock: number;
  pushQty: number;
  reason: string;
  variantId?: number;
  bcProductId?: number;
  productDbId?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVariants(product: api.Product): any[] {
  if (!product.variants) return [];
  if (Array.isArray(product.variants)) return product.variants;
  try {
    return JSON.parse(product.variants as unknown as string);
  } catch {
    return [];
  }
}

function variantLabel(variant: any): string {
  if (!variant) return "";
  if (variant.option_values?.length > 0) {
    return variant.option_values.map((ov: any) => ov.label).join(" / ");
  }
  return variant.sku || "";
}

// ─── Price formatter (comma-separated) ────────────────────────────────────────
const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Suggestion types ─────────────────────────────────────────────────────────

type SuggestionVariant = {
  kind: "variant";
  product: api.Product;
  variant: any;
};
type SuggestionProduct = { kind: "product"; product: api.Product };
type Suggestion = SuggestionVariant | SuggestionProduct;

// ─── Variant Popup Dialog ─────────────────────────────────────────────────────

interface VariantPopupProps {
  product: api.Product;
  onClose: () => void;
  allowOverselling: boolean;
  selectedCustomer: api.BigCommerceCustomer | null;
  onFetchPriceHistory: (variantId?: number) => Promise<api.PriceHistoryEntry[]>;
  freshVariantStock?: Map<number, number>;
  priceListPrices: Record<number, string>;
  matchedTier: api.PriceTier | null;
  onAdd: (
    product: api.Product,
    variant: any,
    qty: number,
    originalPrice: number,
    finalPrice: number,
    discountType: "free" | "percent" | null,
    discountValue: number | null,
    priceSource: CartItem["price_source"],
    tierLabel?: string,
    tierColor?: string,
  ) => void;
}

function VariantPopupDialog({
  product,
  onClose,
  onAdd,
  allowOverselling,
  selectedCustomer,
  onFetchPriceHistory,
  freshVariantStock,
  priceListPrices,
  matchedTier,
}: VariantPopupProps) {
  const { toast } = useToast();
  const variants = getVariants(product);
  const rows = variants.length > 0 ? variants : [null];

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [isFree, setIsFree] = useState<Record<string, boolean>>({});
  const [pctInputs, setPctInputs] = useState<Record<string, string>>({});
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [loadingHistoryKey, setLoadingHistoryKey] = useState<string | null>(
    null,
  );
  const [historyData, setHistoryData] = useState<
    Record<string, api.PriceHistoryEntry[]>
  >({});
  const [openHistoryKey, setOpenHistoryKey] = useState<string | null>(null);
  const [historicalKeys, setHistoricalKeys] = useState<Set<string>>(new Set());
  const [belowCostReview, setBelowCostReview] = useState<
    Array<{ v: any; k: string; price: number; cost: number }> | null
  >(null);

  const key = (v: any) => String(v?.id ?? "0");
  // Default qty is 0 (not 1)
  const getQty = (v: any) => qtys[key(v)] ?? 0;
  const getStock = (v: any): number => {
    if (freshVariantStock) {
      const id = v?.id ?? 0;
      if (freshVariantStock.has(id)) return freshVariantStock.get(id)!;
    }
    return v?.stock_level ?? (product as any).stock_level ?? 0;
  };
  const setQty = (v: any, q: number) => {
    const stock = getStock(v);
    const max = allowOverselling ? Infinity : stock > 0 ? stock : 0;
    const clamped = allowOverselling ? q : Math.min(q, max);
    // min is 0
    setQtys((p) => ({ ...p, [key(v)]: Math.max(0, clamped) }));
  };
  const getBasePrice = (v: any) => {
    const plPrice = v?.id !== undefined ? priceListPrices[v.id] : undefined;
    if (plPrice !== undefined) return parseFloat(plPrice) || 0;
    return parseFloat(v?.price || product.price) || 0;
  };

  const computePrice = (
    v: any,
  ): {
    finalPrice: number;
    discountType: "free" | "percent" | null;
    discountValue: number | null;
  } => {
    const base = getBasePrice(v);
    const k = key(v);
    if (isFree[k])
      return { finalPrice: 0, discountType: "free", discountValue: null };
    const manualRaw = priceInputs[k];
    if (manualRaw && manualRaw !== "") {
      const p = parseFloat(manualRaw);
      if (!isNaN(p) && p >= 0)
        return { finalPrice: p, discountType: null, discountValue: null };
    }
    const pctRaw = pctInputs[k];
    if (pctRaw && pctRaw !== "") {
      const pct = parseFloat(pctRaw);
      if (!isNaN(pct) && pct >= 0 && pct <= 100) {
        return {
          finalPrice: Math.max(0, base * (1 - pct / 100)),
          discountType: "percent",
          discountValue: pct,
        };
      }
    }
    return { finalPrice: base, discountType: null, discountValue: null };
  };

  const buildAddArgs = (v: any) => {
    const k = key(v);
    const base = getBasePrice(v);
    const { finalPrice, discountType, discountValue } = computePrice(v);
    const hasPL = v?.id !== undefined && priceListPrices[v.id] !== undefined;
    const hasManualPrice = !!(priceInputs[k] && priceInputs[k] !== "");
    const hasPct = !!(pctInputs[k] && pctInputs[k] !== "");
    const isHistorical = historicalKeys.has(k);
    let priceSource: CartItem["price_source"] = "default";
    if (isFree[k]) {
      priceSource = "custom";
    } else if (hasManualPrice || hasPct) {
      priceSource = isHistorical ? "historical" : "custom";
    } else if (hasPL) {
      priceSource = "price_list";
    } else {
      const varSale = parseFloat(v?.sale_price ?? "0");
      const varDefault = parseFloat(v?.price || product.price);
      if (varSale > 0 && varSale < varDefault) priceSource = "sale";
    }
    const tierLabel =
      priceSource === "price_list" ? matchedTier?.label || "TIER" : undefined;
    const tierColor =
      priceSource === "price_list"
        ? matchedTier?.color || "#6366f1"
        : undefined;
    return {
      base,
      finalPrice,
      discountType,
      discountValue,
      priceSource,
      tierLabel,
      tierColor,
    };
  };

  const resetVariant = (k: string) => {
    setQtys((p) => ({ ...p, [k]: 0 }));
    setIsFree((p) => ({ ...p, [k]: false }));
    setPctInputs((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
    setPriceInputs((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
    setHistoricalKeys((prev) => {
      const n = new Set(prev);
      n.delete(k);
      return n;
    });
  };

  // Warn about max purchase quantity (non-blocking) — fires whenever limit > 0
  const warnIfMaxExists = (v: any) => {
    const maxQty: number | null =
      v?.max_purchase_quantity ?? product?.max_purchase_quantity ?? null;
    if (maxQty != null && maxQty > 0) {
      toast({
        title: "Purchase limit detected",
        description: `This item has a maximum purchase limit of ${maxQty}. You can override at checkout.`,
        duration: 3500,
      });
    }
  };

  // Bulk add all variants with qty > 0
  const handleBulkAdd = () => {
    const cost = parseFloat(String(product.cost_price ?? ""));
    if (!isNaN(cost) && cost > 0) {
      const flagged: Array<{ v: any; k: string; price: number; cost: number }> =
        [];
      for (const v of rows) {
        const qty = getQty(v);
        if (qty <= 0) continue;
        const { finalPrice } = buildAddArgs(v);
        if (finalPrice < cost) {
          flagged.push({ v, k: key(v), price: finalPrice, cost });
        }
      }
      if (flagged.length > 0) {
        setBelowCostReview(flagged);
        return;
      }
    }
    performBulkAdd(false);
  };

  const performBulkAdd = (confirmedBelowCost: boolean) => {
    let addedCount = 0;
    for (const v of rows) {
      const qty = getQty(v);
      if (qty <= 0) continue;
      const stock = getStock(v);
      if (!allowOverselling && stock <= 0) {
        toast({
          title: `${v?.sku || product.sku} is out of stock — skipped`,
          variant: "destructive",
          duration: 2000,
        });
        continue;
      }
      warnIfMaxExists(v);
      const {
        base,
        finalPrice,
        discountType,
        discountValue,
        priceSource,
        tierLabel,
        tierColor,
      } = buildAddArgs(v);
      onAdd(
        product,
        v,
        qty,
        base,
        finalPrice,
        discountType,
        discountValue,
        priceSource,
        tierLabel,
        tierColor,
      );
      if (confirmedBelowCost) {
        const cost = parseFloat(String(product.cost_price ?? ""));
        if (!isNaN(cost) && cost > 0 && finalPrice < cost) {
          api
            .createPriceOverrideAudit({
              customer_id: selectedCustomer?.id ?? null,
              customer_name: selectedCustomer
                ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
                : null,
              product_id: product.id,
              product_name: product.name,
              sku: v?.sku || product.sku,
              product_cost: cost,
              selling_price: finalPrice,
            })
            .catch(() => {});
        }
      }
      resetVariant(key(v));
      addedCount++;
    }
    if (addedCount === 0) {
      toast({
        title: "No items selected",
        description: "Set a quantity > 0 to add variants.",
        duration: 2000,
      });
    }
    setBelowCostReview(null);
  };

  const cancelBelowCostReview = () => {
    if (belowCostReview) {
      setPriceInputs((p) => {
        const n = { ...p };
        for (const item of belowCostReview) delete n[item.k];
        return n;
      });
    }
    setBelowCostReview(null);
  };

  const selectedCount = rows.reduce((n, v) => n + (getQty(v) > 0 ? 1 : 0), 0);
  const selectedTotal = rows.reduce((sum, v) => {
    const qty = getQty(v);
    if (qty <= 0) return sum;
    return sum + computePrice(v).finalPrice * qty;
  }, 0);

  return (
    <>
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="dialog-variant-picker"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-start gap-3">
            {product.image && (
              <img
                src={product.image}
                alt={product.name}
                className="w-12 h-12 object-cover rounded border shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base leading-snug">
                {product.name}
              </DialogTitle>
              {product.sku && (
                <p className="text-xs text-slate-500 mt-0.5">
                  SKU: {product.sku}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:gap-px sm:bg-slate-200">
            {rows.map((v) => {
              const k = key(v);
              const base = getBasePrice(v);
              const { finalPrice } = computePrice(v);
              const isDiscounted = finalPrice < base;
              const qty = getQty(v);
              const stock = getStock(v);
              const outOfStock = !allowOverselling && stock <= 0;

              return (
                <div
                  key={k}
                  className={`px-4 py-3 bg-white ${outOfStock ? "opacity-60" : ""}`}
                  data-testid={`popup-variant-row-${k}`}
                >
                  {/* Variant name + price */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      {v && (
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {variantLabel(v) || v.sku}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        SKU: {v?.sku || product.sku}
                        <span
                          className={`ml-2 font-medium ${stock <= 0 ? "text-red-500" : "text-slate-400"}`}
                        >
                          · Stock: {stock}
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="flex items-center gap-1.5 justify-end">
                        {v?.id !== undefined &&
                          priceListPrices[v.id] !== undefined &&
                          matchedTier && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white leading-none"
                              style={{ backgroundColor: matchedTier.color }}
                              data-testid={`badge-tier-popup-${k}`}
                            >
                              {matchedTier.label || "TIER"}
                            </span>
                          )}
                        <p
                          className={`text-base font-bold ${isDiscounted ? "text-red-600" : "text-slate-900"}`}
                        >
                          ${fmtPrice(finalPrice)}
                        </p>
                      </div>
                      {isDiscounted && (
                        <p className="text-xs text-slate-400 line-through">
                          ${fmtPrice(base)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Controls row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Qty stepper — default 0, disabled if out of stock */}
                    <div className="flex items-center gap-1 border rounded-md px-1 py-0.5 bg-slate-50 shrink-0">
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-40"
                        onClick={() => setQty(v, qty - 1)}
                        disabled={qty <= 0}
                        data-testid={`popup-minus-${k}`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <Input
                        type="number"
                        min="0"
                        className="w-12 h-7 text-center text-sm font-bold bg-white px-0.5"
                        defaultValue={qty}
                        key={`popup-qty-${k}-${qty}`}
                        onBlur={(e) => {
                          const newQty = parseInt(e.target.value, 10);
                          if (!isNaN(newQty) && newQty >= 0) setQty(v, newQty);
                        }}
                        data-testid={`popup-qty-${k}`}
                      />
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-40"
                        onClick={() => setQty(v, qty + 1)}
                        disabled={outOfStock}
                        data-testid={`popup-plus-${k}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {(() => {
                      const maxQty =
                        v?.max_purchase_quantity ??
                        product?.max_purchase_quantity ??
                        null;

                      return maxQty != null && maxQty > 0 ? (
                        <div className="text-[10px] text-amber-600 mt-1">
                          Maximum Purchase: {maxQty}
                        </div>
                      ) : null;
                    })()}

                    {/* Last $ button */}
                    {selectedCustomer && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs shrink-0"
                        disabled={loadingHistoryKey === k}
                        onClick={async () => {
                          setLoadingHistoryKey(k);
                          try {
                            const hist = await onFetchPriceHistory(v?.id);
                            if (hist.length === 0) {
                              toast({
                                title: "No price history",
                                variant: "destructive",
                                duration: 2000,
                              });
                              return;
                            }
                            setHistoryData((prev) => ({ ...prev, [k]: hist }));
                            setPriceInputs((p) => ({
                              ...p,
                              [k]: hist[0].price,
                            }));
                            setIsFree((p) => ({ ...p, [k]: false }));
                            setPctInputs((p) => {
                              const n = { ...p };
                              delete n[k];
                              return n;
                            });
                            setHistoricalKeys((prev) => new Set(prev).add(k));
                          } finally {
                            setLoadingHistoryKey(null);
                          }
                        }}
                        data-testid={`popup-last-price-${k}`}
                      >
                        {loadingHistoryKey === k ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Last $"
                        )}
                      </Button>
                    )}

                    {/* History dropdown */}
                    {selectedCustomer && (
                      <div className="relative shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          disabled={loadingHistoryKey === k}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (openHistoryKey === k) {
                              setOpenHistoryKey(null);
                              return;
                            }
                            setLoadingHistoryKey(k);
                            try {
                              const hist = await onFetchPriceHistory(v?.id);
                              setHistoryData((prev) => ({
                                ...prev,
                                [k]: hist,
                              }));
                            } finally {
                              setLoadingHistoryKey(null);
                            }
                            setOpenHistoryKey(k);
                          }}
                          data-testid={`popup-history-${k}`}
                        >
                          History ▾
                        </Button>
                        {openHistoryKey === k && (
                          <div
                            className="absolute left-0 top-full mt-1 w-56 bg-white border rounded-md shadow-lg z-50 py-1"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {(historyData[k] ?? []).length === 0 ? (
                              <p className="px-3 py-2 text-xs text-slate-500">
                                No history
                              </p>
                            ) : (
                              (historyData[k] ?? []).map((h, hi) => (
                                <button
                                  key={hi}
                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 border-b last:border-0"
                                  onClick={() => {
                                    setPriceInputs((p) => ({
                                      ...p,
                                      [k]: h.price,
                                    }));
                                    setIsFree((p) => ({ ...p, [k]: false }));
                                    setPctInputs((p) => {
                                      const n = { ...p };
                                      delete n[k];
                                      return n;
                                    });
                                    setHistoricalKeys((prev) =>
                                      new Set(prev).add(k),
                                    );
                                    setOpenHistoryKey(null);
                                  }}
                                  data-testid={`popup-history-option-${k}-${hi}`}
                                >
                                  <p className="text-sm font-bold text-green-600">
                                    ${fmtPrice(parseFloat(h.price))}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {h.date
                                      ? new Date(h.date).toLocaleDateString(
                                          "en-US",
                                          {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                          },
                                        )
                                      : ""}
                                    {h.orderId ? ` | #${h.orderId}` : ""}
                                  </p>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Disc (%) */}
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Disc (%)"
                      className="w-28 h-8 text-xs bg-white"
                      value={pctInputs[k] ?? ""}
                      onChange={(e) => {
                        setPctInputs((p) => ({ ...p, [k]: e.target.value }));
                        setIsFree((p) => ({ ...p, [k]: false }));
                        setPriceInputs((p) => {
                          const n = { ...p };
                          delete n[k];
                          return n;
                        });
                        setHistoricalKeys((prev) => {
                          const n = new Set(prev);
                          n.delete(k);
                          return n;
                        });
                      }}
                      data-testid={`popup-pct-${k}`}
                    />

                    {/* Price ($) */}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price ($)"
                      className="w-28 h-8 text-xs bg-white"
                      value={priceInputs[k] ?? ""}
                      onChange={(e) => {
                        setPriceInputs((p) => ({ ...p, [k]: e.target.value }));
                        setIsFree((p) => ({ ...p, [k]: false }));
                        setPctInputs((p) => {
                          const n = { ...p };
                          delete n[k];
                          return n;
                        });
                        setHistoricalKeys((prev) => {
                          const n = new Set(prev);
                          n.delete(k);
                          return n;
                        });
                      }}
                      data-testid={`popup-price-${k}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: Add Selected + Done */}
        <div className="px-5 py-3 border-t shrink-0 flex items-center justify-center gap-3">
          <Button
            className="font-semibold px-6"
            onClick={handleBulkAdd}
            disabled={selectedCount === 0}
            data-testid="popup-bulk-add"
          >
            {selectedCount > 0
              ? `Add ${selectedCount} variant${selectedCount !== 1 ? "s" : ""} — $${fmtPrice(selectedTotal)}`
              : "Add Selected to Cart"}
          </Button>
          <Button
            variant="outline"
            className="w-24"
            onClick={onClose}
            data-testid="popup-done"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={!!belowCostReview}
      onOpenChange={(open) => {
        if (!open) cancelBelowCostReview();
      }}
    >
      <AlertDialogContent
        data-testid="dialog-below-cost-popup"
        className="w-[95vw] sm:max-w-xl"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-600 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Price Below Cost
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                {belowCostReview && belowCostReview.length > 1
                  ? "The following variants are priced below their cost:"
                  : "This variant is priced below its cost:"}
              </p>
              <div className="space-y-2">
                {belowCostReview?.map((f) => (
                  <div
                    key={f.k}
                    className="border rounded p-2 bg-slate-50"
                    data-testid={`below-cost-row-${f.k}`}
                  >
                    <div className="flex justify-between">
                      <span className="text-slate-500">SKU</span>
                      <span className="font-medium text-slate-800">
                        {f.v?.sku || product.sku}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cost</span>
                      <span className="font-medium text-slate-800">
                        ${fmtPrice(f.cost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Selling Price</span>
                      <span className="font-bold text-red-600">
                        ${fmtPrice(f.price)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p>Do you want to continue selling below cost?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-below-cost-popup-no">
            No
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            data-testid="button-below-cost-popup-yes"
            onClick={() => performBulkAdd(true)}
          >
            Yes, Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Collapsible Textarea ─────────────────────────────────────────────────────

function CollapsibleTextarea({
  label,
  placeholder,
  value,
  onChange,
  testId,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded bg-slate-50">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}{value ? ` · ${value.slice(0, 30)}${value.length > 30 ? "…" : ""}` : ""}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <Textarea
          placeholder={placeholder}
          className="text-xs bg-white border-t rounded-none rounded-b min-h-[60px] resize-none focus:ring-0 focus-visible:ring-0 border-x-0 border-b-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          autoFocus
        />
      )}
    </div>
  );
}

// ─── Pinned Product Row (compact single-column) ───────────────────────────────

const PinnedProductRow = memo(function PinnedProductRow({
  product,
  onOpen,
  onDirectAdd,
}: {
  product: api.Product;
  onOpen: () => void;
  onDirectAdd: () => void;
}) {
  const variants = getVariants(product);
  const totalStock =
    variants.reduce((s: number, v: any) => s + (v.stock_level ?? 0), 0) ||
    product.stock_level ||
    0;
  const isMultiVariant = variants.length > 1;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 bg-white hover:bg-slate-50 transition-colors border-b last:border-b-0"
      data-testid={`pinned-row-${product.id}`}
    >
      {/* Thumbnail + info — opens popup */}
      <button
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
        onClick={onOpen}
        data-testid={`pinned-row-open-${product.id}`}
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-10 h-10 object-cover rounded border shrink-0 bg-slate-50"
          />
        ) : (
          <div className="w-10 h-10 rounded border bg-slate-100 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-slate-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate leading-snug">
            {product.name}
          </p>
          <p className="text-xs text-slate-400">
            ${fmtPrice(parseFloat(product.price))}
            <span
              className={`ml-2 ${totalStock <= 0 ? "text-red-500" : "text-slate-400"}`}
            >
              · {totalStock <= 0 ? "Out of stock" : `Stock: ${totalStock}`}
            </span>
          </p>
        </div>
      </button>
      {/* Variant count badge */}
      <button
        className="shrink-0 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
        onClick={onOpen}
        data-testid={`pinned-row-variants-${product.id}`}
      >
        {variants.length === 0 ? "1 variant" : `${variants.length} variant${variants.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
});

// ─── Product Tab Helpers ──────────────────────────────────────────────────────

function ProductTabSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-4 my-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1 flex items-center gap-1.5">
        <RotateCw className="h-3 w-3 animate-spin" /> {label}
      </p>
      <div className="border rounded-lg overflow-hidden divide-y">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white">
            <div className="w-10 h-10 rounded border bg-slate-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-2.5 bg-slate-100 rounded animate-pulse w-1/3" />
            </div>
            <div className="h-7 w-16 bg-slate-100 rounded animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductTabEmpty({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-300 py-12 pointer-events-none">
      <ShoppingCart className="h-16 w-16 mb-3 opacity-30" />
      <p className="text-base font-medium text-slate-400">{message}</p>
      <p className="text-sm mt-1 text-slate-400 text-center px-6">{sub}</p>
    </div>
  );
}

function ProductTabList({
  label,
  labelColor = "slate",
  products,
  onOpen,
  onDirectAdd,
}: {
  label: string;
  labelColor?: "slate" | "orange";
  products: api.Product[];
  onOpen: (p: api.Product) => void;
  onDirectAdd: (p: api.Product) => void;
}) {
  return (
    <div className="mx-4 my-2">
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 px-1 ${labelColor === "orange" ? "text-orange-500" : "text-slate-400"}`}>
        {label}
      </p>
      <div className="border rounded-lg overflow-hidden">
        {products.map((p) => (
          <PinnedProductRow
            key={p.id}
            product={p}
            onOpen={() => onOpen(p)}
            onDirectAdd={() => onDirectAdd(p)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main POS Page ────────────────────────────────────────────────────────────

export default function POSPage() {
  const {
    currentUser,
    cart,
    addToCart,
    removeFromCartAtIndex,
    updateCartQuantityAtIndex,
    updateCartItemAtIndex,
    clearCart,
    getCartTotal,
    isOfflineMode,
    setOfflineMode,
    toggleOfflineMode,
    logout,
  } = useStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const canSearchBC = currentUser?.allow_bigcommerce_search ?? false;

  // ── Price history sync (login + manual only) ──────────────────────────────
  const { isSyncing, lastSyncTime, syncPriceHistory } = usePriceHistorySync();
  useEffect(() => {
    if (currentUser) syncPriceHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // ── Sync status text ──────────────────────────────────────────────────────
  const syncStatusText = isOfflineMode
    ? "Offline mode"
    : isSyncing
      ? "Syncing price history..."
      : lastSyncTime
        ? (() => {
            const diffMs = Date.now() - lastSyncTime;
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 1) return "Synced just now";
            return `Last sync: ${diffMin}m ago`;
          })()
        : "No sync yet";

  // ── Allow Overselling ─────────────────────────────────────────────────────
  const [allowOverselling, setAllowOverselling] = useState<boolean>(
    () => localStorage.getItem("pos_allow_overselling") === "true",
  );
  const toggleAllowOverselling = () =>
    setAllowOverselling((v) => {
      const next = !v;
      localStorage.setItem("pos_allow_overselling", String(next));
      return next;
    });

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // ── Wholesale Mode ───────────────────────────────────────────────────────────
  const [wholesaleMode, setWholesaleMode] = useState(
    () => localStorage.getItem("pos_wholesale_mode") === "true",
  );
  const toggleWholesaleMode = () =>
    setWholesaleMode((v) => {
      const next = !v;
      localStorage.setItem("pos_wholesale_mode", String(next));
      return next;
    });

  // Always load pinned products — fetched live from BigCommerce on every page load
  const { data: pinnedProducts = [], isLoading: pinnedLoading } = useQuery({
    queryKey: ["products", "pinned", "fresh"],
    queryFn: api.getFreshPinnedProducts,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  // Sale tab — fetched live from BC "Promotions" category on every page load
  const { data: saleProducts = [], isLoading: saleLoading, error: saleError } = useQuery({
    queryKey: ["products", "sale-category"],
    queryFn: api.getBCSaleProducts,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Tab preference — persisted in localStorage
  const [activeProductTab, setActiveProductTab] = useState<"favorites" | "sale">(() => {
    const stored = localStorage.getItem("pos_product_tab");
    return stored === "sale" ? "sale" : "favorites";
  });

  const switchProductTab = (tab: "favorites" | "sale") => {
    setActiveProductTab(tab);
    localStorage.setItem("pos_product_tab", tab);
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionLimit, setSuggestionLimit] = useState(50);
  const searchSeqRef = useRef(0); // for race condition prevention
  const bcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Price Tier System ─────────────────────────────────────────────────────
  const [tierConfig, setTierConfigState] = useState<api.PriceTierConfig>(
    api.DEFAULT_TIER_CONFIG,
  );
  const [matchedTier, setMatchedTier] = useState<api.PriceTier | null>(null);
  const [popupPriceListPrices, setPopupPriceListPrices] = useState<
    Record<number, string>
  >({});

  // ── Popup ────────────────────────────────────────────────────────────────
  const [popupProduct, setPopupProduct] = useState<api.Product | null>(null);
  const [popupFreshVariantStock, setPopupFreshVariantStock] = useState<
    Map<number, number>
  >(new Map());

  // ── Cart / active item ────────────────────────────────────────────────────
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>(
    {},
  );
  const [manualPriceInputs, setManualPriceInputs] = useState<
    Record<string, string>
  >({});

  // ── Customer ──────────────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<
    api.BigCommerceCustomer[]
  >([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<api.BigCommerceCustomer | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<
    api.BigCommerceAddress[]
  >([]);
  const [selectedAddress, setSelectedAddress] =
    useState<api.BigCommerceAddress | null>(null);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [showAddressDrop, setShowAddressDrop] = useState(false);
  const [isCustomerSearching, setIsCustomerSearching] = useState(false);
  const customerDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orderNote, setOrderNote] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [cartDiscount, setCartDiscount] = useState<{
    type: "store_credit" | "percent" | "dollar";
    value: number;
  } | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountTabInput, setDiscountTabInput] = useState("");
  const [activeDiscountTab, setActiveDiscountTab] = useState<
    "store_credit" | "percent" | "dollar"
  >("store_credit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

  // ── Max purchase quantity override ────────────────  �───────────────────────
  const [showMaxOverrideModal, setShowMaxOverrideModal] = useState(false);
  const [showOverrideLog, setShowOverrideLog] = useState(false);
  const [maxOverrideItems, setMaxOverrideItems] = useState<CartItem[]>([]);
  const [isOverriding, setIsOverriding] = useState(false);

  // ── Store Credit (live, same source as CRM) ──────────────────────────────
  const [liveStoreCredit, setLiveStoreCredit] = useState<number>(0);
  const [isLoadingStoreCredit, setIsLoadingStoreCredit] = useState(false);

  const refreshStoreCredit = useCallback(async (bcCustomerId: number | undefined | null) => {
    if (!bcCustomerId) { setLiveStoreCredit(0); return; }
    setIsLoadingStoreCredit(true);
    try {
      const credit = await api.getCustomerStoreCredit(bcCustomerId);
      setLiveStoreCredit(credit);
    } catch {
      setLiveStoreCredit(0);
    } finally {
      setIsLoadingStoreCredit(false);
    }
  }, []);

  useEffect(() => {
    refreshStoreCredit(selectedCustomer?.id);
  }, [selectedCustomer?.id, refreshStoreCredit]);

  // ── Below-cost price protection ──────────────────────────────────────────
  const [belowCostConfirm, setBelowCostConfirm] = useState<{
    item: CartItem;
    index: number;
    price: number;
    priceSource: CartItem["price_source"];
    cost: number;
    prevPriceInput: string | undefined;
  } | null>(null);

  // ── Push inventory modal ───────────────────────────────────────────────────
  const [showPushInventoryModal, setShowPushInventoryModal] = useState(false);

  // ── Invoice ───────────────────────────────────────────────────────────────

  // ── Price history ─────────────────────────────────────────────────────────
  const [priceHistoryCache, setPriceHistoryCache] = useState<
    Map<string, api.PriceHistoryEntry[]>
  >(new Map());
  const [openHistoryLineId, setOpenHistoryLineId] = useState<string | null>(
    null,
  );
  const [wsHistoryRect, setWsHistoryRect] = useState<{ top: number; left: number } | null>(null);
  const [loadingHistoryLineId, setLoadingHistoryLineId] = useState<
    string | null
  >(null);

  // ── Error / inventory dialogs ─────────────────────────────────────────────
  const [inventoryErrorIds, setInventoryErrorIds] = useState<Set<string>>(
    new Set(),
  );
  const [freshStockByLineId, setFreshStockByLineId] = useState<
    Map<string, number>
  >(new Map());
  const [isRefreshingInventory, setIsRefreshingInventory] = useState(false);
  const [showInventoryDialog, setShowInventoryDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogMsg, setErrorDialogMsg] = useState("");

  // ── Inventory Shortfall Push Dialog state ─────────────────────────────────
  const [showInvPushDialog, setShowInvPushDialog] = useState(false);
  const [invPushItems, setInvPushItems] = useState<InvPushItem[]>([]);
  const [invPushPendingOrders, setInvPushPendingOrders] = useState<Record<string, api.PendingOrderEntry[]>>({});
  const [invPushLoadingOrders, setInvPushLoadingOrders] = useState(false);
  const [invPushingIds, setInvPushingIds] = useState<Set<string>>(new Set());
  const [invPushedIds, setInvPushedIds] = useState<Set<string>>(new Set());

  const isInventoryErr = (msg: string) =>
    /409|stock|inventory|quantity|available/i.test(msg);

  // ── Refresh live stock from BigCommerce ───────────────────────────────────
  const refreshStockAndHighlight = useCallback(
    async (highlightAfter = false) => {
      if (cart.length === 0) return;
      setIsRefreshingInventory(true);
      try {
        const bcIds = [
          ...new Set(cart.map((i) => i.product.bigcommerce_id).filter(Boolean)),
        ];
        if (bcIds.length === 0) {
          if (highlightAfter)
            setInventoryErrorIds(new Set(cart.map((i) => i.lineId)));
          return;
        }
        const stockData = await api.refreshProductStock(bcIds);
        const stockMap = new Map<number, api.StockInfo>(
          stockData.map((s) => [s.bigcommerce_id, s]),
        );

        const newFresh = new Map<string, number>();
        const affected = new Set<string>();

        cart.forEach((item) => {
          const info = stockMap.get(item.product.bigcommerce_id);
          if (!info) return;
          const stock = item.variant?.id
            ? (info.variants.find((v) => v.id === item.variant.id)
                ?.stock_level ?? info.stock_level)
            : info.stock_level;
          newFresh.set(item.lineId, stock);
          if (highlightAfter && stock < item.quantity)
            affected.add(item.lineId);
        });

        setFreshStockByLineId(newFresh);
        if (highlightAfter) {
          setInventoryErrorIds(
            affected.size > 0 ? affected : new Set(cart.map((i) => i.lineId)),
          );
        }
      } catch {
        if (highlightAfter)
          setInventoryErrorIds(new Set(cart.map((i) => i.lineId)));
      } finally {
        setIsRefreshingInventory(false);
      }
    },
    [cart],
  );

  // Auto-refresh inventory when POS loads or cart items change
  useEffect(() => {
    if (cart.length > 0) refreshStockAndHighlight(false);
  }, [cart.length]);

  // Load tier config on mount
  useEffect(() => {
    api
      .getSetting("price_tier_config")
      .then((s) => {
        if (s?.value) setTierConfigState(s.value as api.PriceTierConfig);
      })
      .catch(() => {});
  }, []);

  // Derive matched tier when customer or tier config changes
  useEffect(() => {
    if (!tierConfig.enabled || !selectedCustomer) {
      setMatchedTier(null);
      return;
    }
    const groupId = (selectedCustomer as any).customer_group_id;
    if (!groupId) {
      setMatchedTier(null);
      return;
    }

    // "app" mode: match by app-defined tier config
    if (tierConfig.scopeMode !== "all") {
      const tier =
        tierConfig.tiers.find(
          (t) => t.enabled && t.customerGroupId === groupId,
        ) ?? null;
      setMatchedTier(tier);
      setPopupPriceListPrices({});
      return;
    }

    // "all" mode: first try app-defined tiers, then fall back to BC price list assignment
    const appTier =
      tierConfig.tiers.find(
        (t) => t.enabled && t.customerGroupId === groupId,
      ) ?? null;
    if (appTier) {
      setMatchedTier(appTier);
      setPopupPriceListPrices({});
      return;
    }
    // Fetch full BC customer to get price_list_id assigned to their group
    api
      .getCustomerByBcId(selectedCustomer.id)
      .then((fullCustomer) => {
        const bcPriceListId = fullCustomer?.price_list_id;
        //console.log("BC CUSTOMER price_list_id for all mode:", bcPriceListId);
        if (bcPriceListId) {
          // Synthetic tier from BC price list assignment
          setMatchedTier({
            id: `bc-${groupId}`,
            label: "WHOLESALE",
            customerGroupId: groupId,
            priceListId: bcPriceListId,
            color: "#374151",
            enabled: true,
          });
        } else {
          setMatchedTier(null);
        }
        setPopupPriceListPrices({});
      })
      .catch(() => {
        setMatchedTier(null);
        setPopupPriceListPrices({});
      });
  }, [selectedCustomer, tierConfig]);

  // Restore draft customer on mount
  useEffect(() => {
    const raw = localStorage.getItem("vansales_restore_customer");
    if (!raw) return;
    localStorage.removeItem("vansales_restore_customer");
    try {
      const { bcId } = JSON.parse(raw) as { bcId: number };
      if (!bcId) return;
      api
        .getCustomerByBcId(bcId)
        .then(async (customer) => {
          setSelectedCustomer(customer);
          setCustomerSearch(`${customer.first_name} ${customer.last_name}`);
          try {
            const addresses = await api.getCustomerAddresses(customer.id);
            setCustomerAddresses(addresses);
            if (addresses.length > 0) setSelectedAddress(addresses[0]);
          } catch {}
        })
        .catch(() => {});
    } catch {}
  }, []);

  // Guarded navigation: prompts if cart has items
  const guardedNavigate = useCallback(
    (path: string) => {
      if (path === "/logout") {
        if (cart.length > 0) {
          setNavTarget(path);
          return;
        }
        logout();
        navigate("/");
        return;
      }
      if (cart.length > 0) {
        setNavTarget(path);
      } else {
        navigate(path);
      }
    },
    [cart.length, navigate],
  );

  const confirmNavigation = () => {
    if (navTarget) {
      if (navTarget === "/logout") {
        logout();
        navigate("/");
      } else {
        navigate(navTarget);
      }
      setNavTarget(null);
    }
  };

  // ── Price history helpers ─────────────────────────────────────────────────
  const historyKey = (item: CartItem) =>
    `${selectedCustomer?.id ?? 0}-${item.product.bigcommerce_id}-${item.variant?.id ?? 0}`;

  const fetchPriceHistory = useCallback(
    async (item: CartItem): Promise<api.PriceHistoryEntry[]> => {
      if (!selectedCustomer) return [];
      const key = `${selectedCustomer.id}-${item.product.bigcommerce_id}-${item.variant?.id ?? 0}`;
      if (priceHistoryCache.has(key)) return priceHistoryCache.get(key)!;
      // Server handles the full priority logic:
      //   BC (post-cutoff, up to 5) → if 5 found, return 5 only
      //   Otherwise supplement from Postgres cache + app orders up to 10
      // Dexie local DB is the offline fallback (no date restriction).
      try {
        const history = await api.getCustomerPriceHistory(
          selectedCustomer.id,
          item.product.bigcommerce_id,
          item.variant?.id,
        );
        // Always persist server results to Dexie for offline use
        if (history.length > 0) {
          saveLocalPriceHistoryBatch(
            history.map((h) => ({
              customer_id: selectedCustomer.id,
              product_id: item.product.bigcommerce_id,
              variant_id: item.variant?.id ?? null,
              price: h.price,
              order_id: h.orderId ?? 0,
              order_date: h.date || null,
              sku: null,
            })),
          ).catch(() => {});
        }
        setPriceHistoryCache((prev) => new Map(prev).set(key, history));
        return history;
      } catch {
        // Offline fallback — local Dexie, no date restriction, up to 10 entries
        const local = await getLocalPriceHistory(
          selectedCustomer.id,
          item.product.bigcommerce_id,
          10,
        );
        const mapped: api.PriceHistoryEntry[] = local.map((e) => ({
          price: e.price,
          date: e.order_date || "",
          orderId: e.order_id,
        }));
        setPriceHistoryCache((prev) => new Map(prev).set(key, mapped));
        return mapped;
      }
    },
    [selectedCustomer, priceHistoryCache],
  );

  // Clear history cache when customer changes
  useEffect(() => {
    setPriceHistoryCache(new Map());
    setOpenHistoryLineId(null);
  }, [selectedCustomer?.id]);

  // ── Popup price history callback (scoped to current product) ─────────────
  const fetchPopupPriceHistory = useCallback(
    async (variantId?: number): Promise<api.PriceHistoryEntry[]> => {
      if (!selectedCustomer || !popupProduct) return [];
      const cacheKey = `${selectedCustomer.id}-${popupProduct.bigcommerce_id ?? 0}-${variantId ?? 0}`;
      if (priceHistoryCache.has(cacheKey))
        return priceHistoryCache.get(cacheKey)!;
      // Server handles the full priority logic:
      //   BC (post-cutoff, up to 5) → if 5 found, return 5 only
      //   Otherwise supplement from Postgres cache + app orders up to 10
      // Dexie local DB is the offline fallback (no date restriction).
      const productId = popupProduct.bigcommerce_id ?? 0;
      try {
        const history = await api.getCustomerPriceHistory(
          selectedCustomer.id,
          productId,
          variantId,
        );
        if (history.length > 0) {
          saveLocalPriceHistoryBatch(
            history.map((h) => ({
              customer_id: selectedCustomer.id,
              product_id: productId,
              variant_id: variantId ?? null,
              price: h.price,
              order_id: h.orderId ?? 0,
              order_date: h.date || null,
              sku: null,
            })),
          ).catch(() => {});
        }
        setPriceHistoryCache((prev) => new Map(prev).set(cacheKey, history));
        return history;
      } catch {
        // Offline fallback — local Dexie, no date restriction, up to 10 entries
        const local = await getLocalPriceHistory(selectedCustomer.id, productId, 10);
        const mapped: api.PriceHistoryEntry[] = local.map((e) => ({
          price: e.price,
          date: e.order_date || "",
          orderId: e.order_id,
        }));
        setPriceHistoryCache((prev) => new Map(prev).set(cacheKey, mapped));
        return mapped;
      }
    },
    [selectedCustomer, popupProduct, priceHistoryCache],
  );

  // ── Open popup with live inventory refresh ────────────────────────────────
  const openPopupWithFreshStock = useCallback(
    async (product: api.Product, tier: api.PriceTier | null = null) => {
      setPopupFreshVariantStock(new Map());
      setPopupPriceListPrices({});
      setPopupProduct(product);
      // Fetch fresh stock
      if (product.bigcommerce_id) {
        try {
          const stockData = await api.refreshProductStock([
            product.bigcommerce_id,
          ]);
          if (stockData.length > 0) {
            const info = stockData[0];
            const map = new Map<number, number>();
            info.variants.forEach((v) => map.set(v.id, v.stock_level));
            if (info.variants.length === 0) map.set(0, info.stock_level);
            setPopupFreshVariantStock(map);
            // Fetch price list prices from matched tier (with Dexie cache)
            if (tier && tier.priceListId) {
              const variantIds = info.variants
                .map((v: any) => v.id)
                .filter(
                  (id: any) => typeof id === "number" && id > 0,
                ) as number[];
              //console.log("PRICE LIST LOOKUP:", { priceListId: tier.priceListId, variantIds, tier: tier.label });
              if (variantIds.length > 0) {
                try {
                  const cached = await getPriceListCacheBatch(
                    tier.priceListId,
                    variantIds,
                  );
                  const result: Record<number, string> = { ...cached };
                  const uncached = variantIds.filter((id) => !(id in cached));
                  if (uncached.length > 0) {
                    const fetched = await api.getPriceListRecords(
                      tier.priceListId,
                      uncached,
                    );
                    //console.log("PRICE LIST RESPONSE:", fetched);
                    Object.assign(result, fetched);
                    if (Object.keys(fetched).length > 0) {
                      await setPriceListCacheBatch(tier.priceListId, fetched);
                    }
                  } else {
                    console.log(
                      "PRICE LIST RESPONSE: (all from cache)",
                      cached,
                    );
                  }
                  setPopupPriceListPrices(result);
                } catch (err) {
                  //console.error("PRICE LIST ERROR:", err);
                  setPopupPriceListPrices({});
                }
              } else {
                //console.warn("PRICE LIST LOOKUP: no valid variant IDs found for product", product.name);
              }
            }
          }
        } catch {}
      }
    },
    [],
  );

  // ── Cart-level discount helper ─────────────────────────────────────────────
  const computeDiscountAmount = (subtotal: number): number => {
    if (!cartDiscount) return 0;
    const credit = liveStoreCredit;
    if (cartDiscount.type === "store_credit") return Math.min(credit, subtotal);
    if (cartDiscount.type === "percent")
      return Math.max(0, subtotal * (cartDiscount.value / 100));
    return Math.min(cartDiscount.value, subtotal);
  };

  // ── Build structured checkout note at submit time ─────────────────────────
  const buildCheckoutNote = (note: string) => {
    const subtotal = getCartTotal();
    const discAmt = computeDiscountAmount(subtotal);
    const lines = [
      `Checkout by: ${currentUser?.name || ""}`,
      `Notes: ${note}`,
    ];
    if (cartDiscount && discAmt > 0) {
      if (cartDiscount.type === "store_credit") {
        lines.push(`Store Credit Applied: $${discAmt.toFixed(2)}`);
      } else if (cartDiscount.type === "percent") {
        lines.push(`Discount Applied: ${cartDiscount.value}%`);
      } else {
        lines.push(`Discount Applied: $${discAmt.toFixed(2)}`);
      }
    }
    return lines.join("\n");
  };

  // ── Navigation guard: refresh / tab close ─────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue =
          "You have an active order in progress. Leaving will discard unsaved items.";
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
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOfflineMode]);

  // ── Focus ─────────────────────────────────────────────────────────────────
  const focusSearch = useCallback(() => {
    setTimeout(() => searchRef.current?.focus(), 60);
  }, []);

  useEffect(() => {
    focusSearch();
  }, []);

  const handlePageClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest("[data-nofocus]")) setShowAddressDrop(false);
    if (
      !t.closest(
        "input, textarea, button, [role='dialog'], select, [data-nofocus]",
      )
    ) {
      focusSearch();
    }
  };

  // ── Auto-add helper ───────────────────────────────────────────────────────
  const autoAddVariant = useCallback(
    (product: api.Product, variant: any, qty = 1) => {
      if (!selectedCustomer) {
        toast({
          title: "Select customer first",
          variant: "destructive",
          duration: 2000,
        });
        return;
      }
      const stock: number = variant?.stock_level ?? product.stock_level ?? 0;
      const minQty: number = variant?.min_purchase_quantity ?? 1;
      const maxQty: number | null =
        variant?.max_purchase_quantity ??
        product?.max_purchase_quantity ??
        null;

      console.log("FULL PRODUCT:", product);
      console.log("FULL VARIANT:", variant);

      console.log("MAX DEBUG:", {
        variantMax: variant?.max_purchase_quantity,
        productMax: product?.max_purchase_quantity,
      });

      if (!allowOverselling) {
        if (stock <= 0) {
          toast({
            title: "Out of stock",
            description: `${variant?.sku || product.sku} has no available inventory.`,
            variant: "destructive",
          });
          return;
        }
        if (minQty > stock) {
          toast({
            title: "Cannot add item",
            description: `Minimum order (${minQty}) exceeds available stock (${stock}).`,
            variant: "destructive",
          });
          return;
        }
      }

      // Auto-adjust qty to minimum if below min
      let finalQty = Math.max(qty, minQty);

      // Warn (non-blocking) whenever a max purchase limit > 0 exists
      if (maxQty != null && maxQty > 0) {
        toast({
          title: "Purchase limit detected",
          description: `This item has a maximum purchase limit of ${maxQty}. You can override at checkout.`,
          duration: 3500,
        });
      }

      const price = parseFloat(variant?.price || product.price);
      const beforeIds = new Set(useStore.getState().cart.map((i) => i.lineId));
      addToCart(
        product,
        finalQty,
        variant ?? undefined,
        price,
        price,
        null,
        null,
      );
      setTimeout(() => {
        const after = useStore.getState().cart;
        const newLine = after.find((i) => !beforeIds.has(i.lineId));
        if (newLine) {
          setActiveLineId(newLine.lineId);
        } else {
          const merged = after.find(
            (i) =>
              i.product.id === product.id &&
              (!variant || i.variant?.id === variant?.id),
          );
          if (merged) setActiveLineId(merged.lineId);
        }
      }, 0);
      toast({
        title: "Added to cart",
        description: `${variant?.sku || product.sku} × ${finalQty}`,
        duration: 1500,
      });
    },
    [addToCart, toast, allowOverselling, selectedCustomer],
  );

  // Popup "Add to Cart" with custom pricing
  const handlePopupAdd = useCallback(
    (
      product: api.Product,
      variant: any,
      qty: number,
      originalPrice: number,
      finalPrice: number,
      discountType: "free" | "percent" | null,
      discountValue: number | null,
      priceSource: CartItem["price_source"] = "default",
      tierLabel?: string,
      tierColor?: string,
    ) => {
      if (!selectedCustomer) {
        toast({
          title: "Select customer first",
          variant: "destructive",
          duration: 2000,
        });
        return;
      }
      // Warn (non-blocking) if max purchase limit exists
      const maxQty: number | null =
        variant?.max_purchase_quantity ??
        product?.max_purchase_quantity ??
        null;
      if (maxQty != null) {
        toast({
          title: "Purchase limit detected",
          description: `This item has a maximum purchase limit of ${maxQty}. You can override at checkout.`,
          duration: 3500,
        });
      }
      const beforeIds = new Set(useStore.getState().cart.map((i) => i.lineId));
      addToCart(
        product,
        qty,
        variant ?? undefined,
        finalPrice,
        originalPrice,
        discountType,
        discountValue,
        priceSource,
        tierLabel,
        tierColor,
      );
      setTimeout(() => {
        const after = useStore.getState().cart;
        const newLine = after.find((i) => !beforeIds.has(i.lineId));
        if (newLine) setActiveLineId(newLine.lineId);
        else {
          const merged = after.find(
            (i) =>
              i.product.id === product.id &&
              (!variant || i.variant?.id === variant?.id),
          );
          if (merged) setActiveLineId(merged.lineId);
        }
      }, 0);
      toast({
        title: "Added to cart",
        description: `${variant?.sku || product.sku} × ${qty}`,
        duration: 1500,
      });
      // Popup stays open — user closes it with Done
    },
    [addToCart, toast, selectedCustomer],
  );

  // ── Direct add from pinned card (fetches fresh stock for min/max) ──────────
  const handleDirectAddPinned = useCallback(
    async (product: api.Product) => {
      const variants = getVariants(product);
      if (variants.length > 1) {
        openPopupWithFreshStock(product, matchedTier);
        return;
      }
      // Single variant or no variant — auto-add with fresh stock check
      try {
        const stockData = await api.refreshProductStock([
          product.bigcommerce_id,
        ]);
        if (stockData.length > 0) {
          const info = stockData[0];
          if (variants.length === 1) {
            const freshVariant = {
              ...variants[0],
              stock_level:
                info.variants.find((v) => v.id === variants[0].id)
                  ?.stock_level ?? info.stock_level,
              min_purchase_quantity:
                info.variants.find((v) => v.id === variants[0].id)
                  ?.min_purchase_quantity ?? info.min_purchase_quantity,
              max_purchase_quantity:
                info.variants.find((v) => v.id === variants[0].id)
                  ?.max_purchase_quantity ?? info.max_purchase_quantity,
            };
            autoAddVariant(product, freshVariant);
          } else {
            // No variants — product-level
            const freshProduct = {
              ...product,
              stock_level: info.stock_level,
              min_purchase_quantity: info.min_purchase_quantity ?? product.min_purchase_quantity,
              max_purchase_quantity: info.max_purchase_quantity ?? product.max_purchase_quantity,
            };
            autoAddVariant(freshProduct, null);
          }
          return;
        }
      } catch {}
      // Fallback: add with cached data
      if (variants.length === 1) {
        autoAddVariant(product, variants[0]);
      } else {
        autoAddVariant(product, null);
      }
    },
    [autoAddVariant, openPopupWithFreshStock, matchedTier],
  );

  // ── Build suggestions from BC products ──────────────────────────────────────
  const buildSuggestions = useCallback(
    (products: api.Product[]): Suggestion[] => {
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

      // Sort product items: zero-inventory products go to the bottom
      productItems.sort((a, b) => {
        const aStock =
          getVariants(a.product).reduce(
            (sum: number, v: any) => sum + (v.stock_level ?? 0),
            0,
          ) ||
          a.product.stock_level ||
          0;
        const bStock =
          getVariants(b.product).reduce(
            (sum: number, v: any) => sum + (v.stock_level ?? 0),
            0,
          ) ||
          b.product.stock_level ||
          0;
        if (aStock <= 0 && bStock > 0) return 1;
        if (bStock <= 0 && aStock > 0) return -1;
        return 0;
      });

      // >50 total results → mother products first (easier to pick); ≤50 → variants first
      const totalResults = variantItems.length + productItems.length;
      return totalResults > 50
        ? [...productItems, ...variantItems]
        : [...variantItems, ...productItems];
    },
    [],
  );

  // ── Search handler ────────────────────────────────────────────────────────
  const handleSearchChange = useCallback(
    (q: string) => {
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
          p.sku.toLowerCase().includes(lower),
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
          const result = await api.agentBigCommerceSearch(
            q.trim(),
            currentUser!.id,
          );
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
    },
    [
      canSearchBC,
      currentUser,
      pinnedProducts,
      buildSuggestions,
      autoAddVariant,
      focusSearch,
    ],
  );

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
      if (customerSearch.length < 2) {
        setCustomerResults([]);
        return;
      }
      setIsCustomerSearching(true);
      try {
        const r = await api.searchBigCommerceCustomers(customerSearch);
        setCustomerResults(r);
        setShowCustomerDrop(r.length > 0);
        if (r.length === 0) {
          toast({ title: "No customers found", description: "Try a different name or email." });
        }
      } catch (e: any) {
        setCustomerResults([]);
        toast({ title: "Customer search failed", description: e.message || "Could not reach the customer directory.", variant: "destructive" });
      } finally {
        setIsCustomerSearching(false);
      }
    }, 300);
    return () => {
      if (customerDebRef.current) clearTimeout(customerDebRef.current);
    };
  }, [customerSearch, isOfflineMode, selectedCustomer]);

  const handleSelectCustomer = async (c: api.BigCommerceCustomer) => {
    setSelectedCustomer(c);
    setCustomerSearch(`${c.first_name} ${c.last_name}`);
    setShowCustomerDrop(false);
    setCustomerResults([]);
    setCartDiscount(null);
    setDiscountTabInput("");
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
      updateCartItemAtIndex(index, {
        price_at_sale: item.original_price,
        discount_type: null,
        discount_value: null,
      });
    } else {
      setManualPriceInputs((p) => {
        const n = { ...p };
        delete n[item.lineId];
        return n;
      });
      setDiscountInputs((p) => {
        const n = { ...p };
        delete n[item.lineId];
        return n;
      });
      updateCartItemAtIndex(index, {
        price_at_sale: 0,
        discount_type: "free",
        discount_value: null,
      });
    }
  };

  const applyPercent = (item: CartItem, index: number, pct: number) => {
    const final = Math.max(0, item.original_price * (1 - pct / 100));
    setManualPriceInputs((p) => {
      const n = { ...p };
      delete n[item.lineId];
      return n;
    });
    updateCartItemAtIndex(index, {
      price_at_sale: final,
      discount_type: "percent",
      discount_value: pct,
      price_source: "custom",
      price_tier_label: undefined,
      price_tier_color: undefined,
    });
  };

  const commitManualPrice = (
    item: CartItem,
    index: number,
    price: number,
    priceSource: CartItem["price_source"] = "custom",
  ) => {
    setDiscountInputs((p) => {
      const n = { ...p };
      delete n[item.lineId];
      return n;
    });
    updateCartItemAtIndex(index, {
      price_at_sale: price,
      discount_type: null,
      discount_value: null,
      price_source: priceSource,
      price_tier_label: undefined,
      price_tier_color: undefined,
    });
  };

  const applyManualPrice = (
    item: CartItem,
    index: number,
    raw: string,
    priceSource: CartItem["price_source"] = "custom",
  ) => {
    const price = parseFloat(raw);
    if (isNaN(price) || price < 0) return;
    const cost = parseFloat(String(item.product.cost_price ?? ""));
    if (!isNaN(cost) && cost > 0 && price < cost) {
      setBelowCostConfirm({
        item,
        index,
        price,
        priceSource,
        cost,
        prevPriceInput: manualPriceInputs[item.lineId],
      });
      return;
    }
    commitManualPrice(item, index, price, priceSource);
  };

  const clearLineDiscount = (item: CartItem, index: number) => {
    setDiscountInputs((p) => {
      const n = { ...p };
      delete n[item.lineId];
      return n;
    });
    setManualPriceInputs((p) => {
      const n = { ...p };
      delete n[item.lineId];
      return n;
    });
    updateCartItemAtIndex(index, {
      price_at_sale: item.original_price,
      discount_type: null,
      discount_value: null,
      price_source:
        item.price_source === "price_list" ? "price_list" : "default",
      price_tier_label:
        item.price_source === "price_list" ? item.price_tier_label : undefined,
      price_tier_color:
        item.price_source === "price_list" ? item.price_tier_color : undefined,
    });
  };

  // ── Checkout – step 2: check max-purchase limits then show confirm ───────────
  const proceedToCheckoutConfirm = useCallback(() => {
    const withMax = cart.filter((item) => {
      const maxQty =
        item.variant?.max_purchase_quantity ??
        item.product.max_purchase_quantity ??
        null;
      return maxQty != null && maxQty > 0;
    });
    if (withMax.length > 0) {
      setMaxOverrideItems(withMax);
      setShowMaxOverrideModal(true);
    } else {
      setShowCheckoutConfirm(true);
    }
  }, [cart]);

  // ── Checkout – step 1: pre-flight inventory shortfall check ─────────────────
  const handleCheckoutClick = useCallback(async () => {
    const bcIds = [...new Set(cart.map((i) => i.product.bigcommerce_id).filter(Boolean))];
    if (bcIds.length > 0) {
      let stockData: api.StockInfo[] = [];
      try {
        stockData = await api.refreshProductStock(bcIds);
      } catch {}

      if (stockData.length > 0) {
        const stockMap = new Map<number, api.StockInfo>(stockData.map((s) => [s.bigcommerce_id, s]));

        // Update freshStockByLineId so highlights stay current
        const newFresh = new Map<string, number>();
        cart.forEach((item) => {
          const info = stockMap.get(item.product.bigcommerce_id);
          if (!info) return;
          const stock = item.variant?.id
            ? (info.variants.find((v) => v.id === item.variant.id)?.stock_level ?? info.stock_level)
            : info.stock_level;
          newFresh.set(item.lineId, stock);
        });
        setFreshStockByLineId(newFresh);

        // Collect items where cart qty exceeds current BC stock
        const shortfallItems: InvPushItem[] = [];
        for (const item of cart) {
          const info = stockMap.get(item.product.bigcommerce_id);
          if (!info) continue;
          const stock = item.variant?.id
            ? (info.variants.find((v) => v.id === item.variant.id)?.stock_level ?? info.stock_level)
            : info.stock_level;
          if (stock < item.quantity) {
            const sku = item.variant?.sku || item.product.sku;
            const variantLabel = item.variant?.option_values
              ?.map((ov: any) => ov.label)
              .filter(Boolean)
              .join(" / ") || item.variant?.sku;
            shortfallItems.push({
              lineId: item.lineId,
              sku,
              productName: item.product.name,
              variantName: variantLabel || undefined,
              cartQty: item.quantity,
              bcStock: stock,
              pushQty: item.quantity - stock,
              reason: `CNC Order for ${selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : ""}`,
              variantId: item.variant?.id,
              bcProductId: item.product.bigcommerce_id,
              productDbId: item.product.id,
            });
          }
        }

        if (shortfallItems.length > 0) {
          setInvPushItems(shortfallItems);
          setInvPushingIds(new Set());
          setInvPushedIds(new Set());
          setInvPushPendingOrders({});
          setShowInvPushDialog(true);
          // Fetch pending BC orders for affected SKUs in background
          const skus = [...new Set(shortfallItems.map((i) => i.sku))];
          setInvPushLoadingOrders(true);
          api.getPendingOrdersBySku(skus)
            .then((result) => setInvPushPendingOrders(result))
            .catch(() => setInvPushPendingOrders({}))
            .finally(() => setInvPushLoadingOrders(false));
          return;
        }
      }
    }
    // No shortfall — proceed directly to max-qty check and confirm
    proceedToCheckoutConfirm();
  }, [cart, selectedCustomer, proceedToCheckoutConfirm]);

  // ── Checkout with max override (variant-aware, deduplicated) ─────────────────
  const handleCheckoutWithOverride = async () => {
    if (isOverriding) return;
    setIsOverriding(true);
    setShowMaxOverrideModal(false);

    // Separate variant-level limits from product-level limits
    const variantLimitMap = new Map<string, { product_id: number; variant_id: number; originalMax: number | null }>();
    const productLimitMap = new Map<number, number | null>();
    for (const item of maxOverrideItems) {
      const pid = item.product.bigcommerce_id;
      if (!pid) continue;
      const vMax = item.variant?.max_purchase_quantity ?? null;
      if (item.variant?.id != null && vMax != null && vMax > 0) {
        const key = `${pid}-${item.variant.id}`;
        if (!variantLimitMap.has(key))
          variantLimitMap.set(key, { product_id: pid, variant_id: item.variant.id, originalMax: vMax });
      } else {
        const maxQty = item.variant?.max_purchase_quantity ?? item.product.max_purchase_quantity ?? null;
        if (maxQty != null && !productLimitMap.has(pid))
          productLimitMap.set(pid, maxQty);
      }
    }
    const variantList = Array.from(variantLimitMap.values());
    const productList = Array.from(productLimitMap.entries()).map(([product_id, originalMax]) => ({ product_id, originalMax }));

    try {
      // Step 1: Remove limits (variant-level then product-level)
      if (variantList.length > 0)
        await api.setVariantMaxQty(variantList.map(({ product_id, variant_id }) => ({ product_id, variant_id, max_purchase_quantity: 0 })));
      if (productList.length > 0)
        await api.setProductMaxQty(productList.map(({ product_id }) => ({ product_id, max_purchase_quantity: 0 })));
      // Step 2: Proceed with checkout
      await handleCheckout();
    } finally {
      // Step 3: ALWAYS restore limits (success or fail)
      if (variantList.length > 0)
        await api.setVariantMaxQty(variantList.map(({ product_id, variant_id, originalMax }) => ({ product_id, variant_id, max_purchase_quantity: originalMax })))
          .catch((err) => console.error("Failed to restore variant max qty limits:", err));
      if (productList.length > 0)
        await api.setProductMaxQty(productList.map(({ product_id, originalMax }) => ({ product_id, max_purchase_quantity: originalMax })))
          .catch((err) => console.error("Failed to restore product max qty limits:", err));
      setIsOverriding(false);
      setMaxOverrideItems([]);
    }
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!selectedCustomer || !selectedAddress) {
      toast({
        title: "Customer required",
        description: "Search and select a customer before checkout.",
        variant: "destructive",
      });
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
        order_note: buildCheckoutNote(staffNote),
        customer_note: orderNote || undefined,
        items: cart.map((item) => ({
          product_id: item.product.id,
          bigcommerce_product_id: item.product.bigcommerce_id,
          variant_id: item.variant?.id,
          variant_option_values: item.variant?.option_values,
          quantity: item.quantity,
          price_at_sale: String(item.price_at_sale),
          name: item.variant
            ? `${item.product.name} (${item.variant.sku})`
            : item.product.name,
          sku: item.variant?.sku || item.product.sku,
          image: item.product.image,
        })),
        total: Math.max(
          0,
          getCartTotal() - computeDiscountAmount(getCartTotal()),
        ).toFixed(2),
        created_by_user_id: currentUser?.id || 0,
        ...(cartDiscountAmount > 0
          ? cartDiscount?.type === "store_credit"
            ? { store_credit_amount: cartDiscountAmount.toFixed(4) }
            : { cart_discount_amount: cartDiscountAmount.toFixed(4) }
          : {}),
      } as any);
      if (response.bigcommerce?.success) {
        toast({
          title: "Order Created",
          description: `BigCommerce Order #${response.bigcommerce.order_id}`,
        });
        // Apply store credit usage (deducts in BC, logs usage, creates CRM note) — separate from Discount
        if (cartDiscount?.type === "store_credit" && cartDiscountAmount > 0) {
          try {
            await api.applyStoreCreditUsage({
              bigcommerce_customer_id: selectedCustomer.id,
              customer_name: `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
              order_id: response.order?.id,
              bigcommerce_order_id: response.bigcommerce.order_id,
              credit_used: cartDiscountAmount,
              order_total_before: finalTotal,
              final_order_total: adjustedTotal,
            });
          } catch (creditErr: any) {
            toast({
              title: "Store credit not recorded",
              description: creditErr.message || "The order was created, but store credit usage could not be logged.",
              variant: "destructive",
            });
          }
        }
        clearCart();
        setActiveLineId(null);
        setDiscountInputs({});
        setManualPriceInputs({});
        setInventoryErrorIds(new Set());
        setFreshStockByLineId(new Map());
        setSelectedCustomer(null);
        setSelectedAddress(null);
        setCustomerAddresses([]);
        setCustomerSearch("");
        setOrderNote("");
        setStaffNote("");
        setCartDiscount(null);
        setDiscountTabInput("");
        setDiscountOpen(false);
        setLiveStoreCredit(0);
        focusSearch();
        if (response.bigcommerce.order_id) {
          window.open(`/invoice/${response.bigcommerce.order_id}`, "_blank");
        }
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
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Save as Draft (POS) ───────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const saved = await api.createDraftOrder({
        customer_name: selectedCustomer
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : "Unknown",
        customer_email: selectedCustomer?.email,
        bigcommerce_customer_id: selectedCustomer?.id,
        status: "draft",
        order_note: buildCheckoutNote(staffNote),
        customer_note: orderNote || undefined,
        items: cart.map((item) => ({
          product_id: item.product.id,
          bigcommerce_product_id: item.product.bigcommerce_id,
          variant_id: item.variant?.id,
          variant_option_values: item.variant?.option_values,
          quantity: item.quantity,
          price_at_sale: String(item.price_at_sale),
          name: item.variant
            ? `${item.product.name} (${item.variant.sku})`
            : item.product.name,
          sku: item.variant?.sku || item.product.sku,
          image: item.product.image,
        })),
        total: Math.max(
          0,
          getCartTotal() - computeDiscountAmount(getCartTotal()),
        ).toFixed(2),
        created_by_user_id: currentUser?.id || 0,
      });
      // Mark this draft as originating from POS
      if (saved?.id) {
        try {
          const existing = JSON.parse(
            localStorage.getItem("vansales_pos_draft_ids") || "[]",
          ) as number[];
          localStorage.setItem(
            "vansales_pos_draft_ids",
            JSON.stringify([...existing, saved.id]),
          );
        } catch {}
      }
      toast({ title: "Draft Saved", description: "Cart preserved — continue editing.", duration: 3000 });
      focusSearch();
    } catch (e: any) {
      toast({
        title: "Failed to save draft",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const finalTotal = getCartTotal();
  const originalTotal = cart.reduce(
    (s, i) => s + i.original_price * i.quantity,
    0,
  );
  const totalDiscount = Math.max(0, originalTotal - finalTotal);
  const cartDiscountAmount = computeDiscountAmount(finalTotal);
  const adjustedTotal = Math.max(0, finalTotal - cartDiscountAmount);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const visibleSuggestions = suggestions.slice(0, suggestionLimit);

  const notesSectionContent = (
    <>
      <CollapsibleTextarea
        label="Customer Note"
        placeholder="Visible to customer on order…"
        value={orderNote}
        onChange={setOrderNote}
        testId="input-pos-order-note"
      />
      <CollapsibleTextarea
        label="Staff Note"
        placeholder="Internal staff note (not shared with customer)…"
        value={staffNote}
        onChange={setStaffNote}
        testId="input-pos-staff-note"
      />

      {/* ── Discount section ── */}
      <div className="border rounded-md overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          onClick={() => setDiscountOpen((o) => !o)}
          data-testid="btn-discount-toggle"
        >
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-slate-400" />
            Discount
            {cartDiscount && (
              <span className="text-[11px] font-bold text-red-500 ml-0.5">
                •{" "}
                {cartDiscount.type === "store_credit"
                  ? "Credit"
                  : cartDiscount.type === "percent"
                    ? `${cartDiscount.value}%`
                    : `$${fmtPrice(cartDiscount.value)}`}
              </span>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${discountOpen ? "rotate-180" : ""}`}
          />
        </button>

        {discountOpen && (
          <div className="px-3 py-2 border-t space-y-2 bg-slate-50">
            {/* Tab row */}
            <div className="flex rounded border overflow-hidden text-xs font-semibold">
              {(
                [
                  {
                    key: "store_credit" as const,
                    label: "Store Credit",
                    Icon: Wallet,
                  },
                  {
                    key: "percent" as const,
                    label: "%",
                    Icon: Percent,
                  },
                  {
                    key: "dollar" as const,
                    label: "$",
                    Icon: DollarSign,
                  },
                ]
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors border-x first:border-l-0 last:border-r-0 ${
                    activeDiscountTab === key
                      ? "bg-slate-800 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    setActiveDiscountTab(key);
                    setDiscountTabInput("");
                  }}
                  data-testid={`btn-discount-tab-${key}`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Store Credit panel */}
            {activeDiscountTab === "store_credit" &&
              (() => {
                const credit = liveStoreCredit;
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-500">
                      Available:{" "}
                      <span
                        className={`font-bold ${credit > 0 ? "text-green-600" : "text-slate-400"}`}
                      >
                        ${fmtPrice(credit)}
                      </span>
                      {!selectedCustomer && (
                        <span className="text-amber-500 ml-1">
                          — select a customer first
                        </span>
                      )}
                    </p>
                    {selectedCustomer && credit > 0 ? (
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs"
                        variant={
                          cartDiscount?.type === "store_credit"
                            ? "destructive"
                            : "default"
                        }
                        onClick={() =>
                          setCartDiscount(
                            cartDiscount?.type === "store_credit"
                              ? null
                              : { type: "store_credit", value: credit },
                          )
                        }
                        data-testid="btn-apply-store-credit"
                      >
                        {cartDiscount?.type === "store_credit"
                          ? "Remove Store Credit"
                          : "Apply Store Credit"}
                      </Button>
                    ) : selectedCustomer && credit === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No store credit available for this customer
                      </p>
                    ) : null}
                  </div>
                );
              })()}

            {/* % panel */}
            {activeDiscountTab === "percent" && (
              <div className="flex gap-1.5 items-center">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0 – 100"
                  value={discountTabInput}
                  onChange={(e) => setDiscountTabInput(e.target.value)}
                  className="h-7 text-xs flex-1"
                  data-testid="input-discount-pct"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => {
                    const v = parseFloat(discountTabInput);
                    if (!isNaN(v) && v >= 0 && v <= 100) {
                      setCartDiscount({ type: "percent", value: v });
                    }
                  }}
                  data-testid="btn-apply-pct"
                >
                  Apply
                </Button>
                {cartDiscount?.type === "percent" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0 px-2"
                    onClick={() => {
                      setCartDiscount(null);
                      setDiscountTabInput("");
                    }}
                    data-testid="btn-remove-pct"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}

            {/* $ panel */}
            {activeDiscountTab === "dollar" && (
              <div className="flex gap-1.5 items-center">
                <Input
                  type="number"
                  min="0"
                  placeholder="Amount"
                  value={discountTabInput}
                  onChange={(e) => setDiscountTabInput(e.target.value)}
                  className="h-7 text-xs flex-1"
                  data-testid="input-discount-dollar"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => {
                    const v = parseFloat(discountTabInput);
                    if (!isNaN(v) && v >= 0) {
                      setCartDiscount({ type: "dollar", value: v });
                    }
                  }}
                  data-testid="btn-apply-dollar"
                >
                  Apply
                </Button>
                {cartDiscount?.type === "dollar" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0 px-2"
                    onClick={() => {
                      setCartDiscount(null);
                      setDiscountTabInput("");
                    }}
                    data-testid="btn-remove-dollar"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}

            {/* Applied discount summary */}
            {cartDiscount && cartDiscountAmount > 0 && (
              <p
                className="text-xs font-semibold text-red-600"
                data-testid="text-discount-applied"
              >
                Applied: -${fmtPrice(cartDiscountAmount)}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="h-full overflow-hidden flex flex-col bg-slate-100"
      onClick={handlePageClick}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center gap-3 px-4 h-14 bg-white border-b shadow-sm shrink-0 z-20"
      >
        <span className="font-bold text-base uppercase tracking-widest text-slate-800 shrink-0">
          POS
        </span>
        {isOfflineMode && (
          <Badge variant="destructive" className="text-[10px] shrink-0">
            Offline
          </Badge>
        )}

        {/* Customer search */}
        <div
          className="flex-1 relative max-w-sm"
          onClick={(e) => e.stopPropagation()}
          data-nofocus
        >
          <User className="absolute left-2.5 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
          {isCustomerSearching && (
            <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-slate-400 pointer-events-none" />
          )}
          {selectedCustomer && !isCustomerSearching && (
            <button
              className="absolute right-2 top-1.5 h-5 w-5 flex items-center justify-center text-slate-400 hover:text-red-500 rounded"
              onClick={() => {
                setSelectedCustomer(null);
                setSelectedAddress(null);
                setCustomerAddresses([]);
                setCustomerSearch("");
                setCustomerResults([]);
                setShowCustomerDrop(false);
                setCartDiscount(null);
                setDiscountTabInput("");
              }}
              data-testid="button-pos-clear-customer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Input
            placeholder="Search customer…"
            className="pl-8 h-8 text-sm bg-white pr-8"
            value={customerSearch}
            readOnly={!!selectedCustomer}
            onChange={(e) => {
              if (!selectedCustomer) {
                setCustomerSearch(e.target.value);
              }
            }}
            onFocus={() => {
              if (customerResults.length > 0 && !selectedCustomer)
                setShowCustomerDrop(true);
            }}
            data-testid="input-pos-customer"
          />
          {showCustomerDrop && customerResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded-md shadow-xl z-50 max-h-52 overflow-y-auto mt-1">
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0"
                  onClick={() => handleSelectCustomer(c)}
                  data-testid={`option-customer-${c.id}`}
                >
                  <p className="text-sm font-medium">
                    {c.first_name} {c.last_name}
                    {c.company ? (
                      <span className="text-slate-500 font-normal">
                        {" "}
                        | {c.company}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">{c.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedCustomer && customerAddresses.length > 1 && (
          <div
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
            data-nofocus
          >
            <button
              className="h-8 text-xs border rounded px-2 bg-white min-w-[200px] max-w-[260px] flex items-center justify-between gap-1"
              onClick={() => setShowAddressDrop((p) => !p)}
              data-testid="select-pos-address"
            >
              <span className="truncate text-left">
                {selectedAddress
                  ? `${selectedAddress.first_name || ""} ${selectedAddress.last_name || ""}`.trim() ||
                    `${selectedAddress.street_1}, ${selectedAddress.city}`
                  : "Select address"}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
            {showAddressDrop && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded-md shadow-xl z-50 min-w-[240px] max-h-52 overflow-y-auto">
                {customerAddresses.map((a) => (
                  <button
                    key={a.id}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0 ${selectedAddress?.id === a.id ? "bg-primary/5" : ""}`}
                    onClick={() => {
                      setSelectedAddress(a);
                      setShowAddressDrop(false);
                    }}
                    data-testid={`option-pos-address-${a.id}`}
                  >
                    {(a.first_name || a.last_name) && (
                      <p className="text-sm font-bold text-slate-800">
                        {`${a.first_name || ""} ${a.last_name || ""}`.trim()}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      {a.street_1}
                      {a.street_2 ? `, ${a.street_2}` : ""}, {a.city}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Fullscreen + Wholesale mode toggles ── */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Store credit badge */}
          {selectedCustomer &&
            (() => {
              const credit = liveStoreCredit;
              if (credit <= 0) return null;
              return (
                <div
                  className="flex items-center gap-1.5 shrink-0 bg-green-50 border border-green-200 rounded px-2 py-1"
                  data-testid="badge-store-credit"
                >
                  <Wallet className="h-4 w-4 text-green-600" />
                  <span
                    className="font-bold text-green-700"
                    style={{ fontSize: "16px" }}
                  >
                    ${fmtPrice(credit)}
                  </span>
                </div>
              );
            })()}
          <button
            onClick={toggleWholesaleMode}
            className={`h-8 w-8 flex items-center justify-center rounded border text-xs transition-colors ${wholesaleMode ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
            title="Wholesale Mode"
            data-testid="button-pos-wholesale-mode"
          >
            <Columns2 className="h-4 w-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="h-8 w-8 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:border-slate-300 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            data-testid="button-pos-fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

      </header>

      {/* ── Body ── */}
      <div className={`flex-1 flex overflow-hidden ${wholesaleMode ? "flex-col" : ""}`}>
        {/* ── LEFT: Search + Pinned Products ── */}
        <div className={wholesaleMode ? "shrink-0 bg-white border-b" : "flex-1 flex flex-col overflow-hidden min-w-0"}>
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
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                data-testid="input-pos-search"
              />
              {isSearching && (
                <Loader2 className="absolute right-10 top-3.5 h-5 w-5 animate-spin text-slate-400 pointer-events-none" />
              )}
              {search && (
                <button
                  className="absolute right-3 top-3.5"
                  onClick={() => {
                    handleSearchChange("");
                    focusSearch();
                  }}
                  data-testid="button-pos-clear-search"
                >
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5 ml-1">
              {canSearchBC
                ? "BigCommerce search active — scan SKU/UPC or type name"
                : "Searching pinned products"}
            </p>
            {allowOverselling && (
              <div
                className="mt-2 flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700"
                data-testid="pos-oversell-warning"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Overselling enabled — inventory limits are not enforced
              </div>
            )}
          </div>

          {/* Suggestion dropdown */}
          {showSuggestions &&
            visibleSuggestions.length > 0 &&
            (() => {
              // Derive rendering order from the sorted suggestions array:
              // if first item is a product → large result set → products section first
              const productsFirst =
                suggestions.length > 0 && suggestions[0].kind === "product";

              const variantRows = visibleSuggestions.filter(
                (s): s is SuggestionVariant => s.kind === "variant",
              );
              const productRows = visibleSuggestions.filter(
                (s): s is SuggestionProduct => s.kind === "product",
              );

              const variantsSection = variantRows.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-slate-50 border-b">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Variants
                    </p>
                  </div>
                  {variantRows.map((s, i) => (
                    <button
                      key={`v-${s.product.id}-${s.variant?.id ?? i}`}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
                      onClick={() => {
                        autoAddVariant(s.product, s.variant);
                        setShowSuggestions(false);
                        focusSearch();
                      }}
                      data-testid={`suggestion-variant-${s.variant?.id ?? i}`}
                    >
                      {s.product.image && (
                        <img
                          src={s.product.image}
                          alt=""
                          className="w-8 h-8 object-cover rounded border shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500 truncate">
                          {s.product.name}
                        </p>
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {variantLabel(s.variant) || s.variant?.sku}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-900">
                          $
                          {fmtPrice(parseFloat(
                            s.variant?.price || s.product.price,
                          ))}
                        </p>
                        <p
                          className={`text-[10px] ${(s.variant?.stock_level ?? s.product.stock_level) <= 0 ? "text-red-500 font-medium" : "text-slate-400"}`}
                        >
                          Stock:{" "}
                          {s.variant?.stock_level ?? s.product.stock_level ?? 0}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              );

              const productsSection = productRows.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-slate-50 border-b">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Products
                    </p>
                  </div>
                  {productRows.map((s) => (
                    <button
                      key={`p-${s.product.id}`}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                      onClick={() => {
                        openPopupWithFreshStock(s.product, matchedTier);
                        setShowSuggestions(false);
                      }}
                      data-testid={`suggestion-product-${s.product.id}`}
                    >
                      {s.product.image && (
                        <img
                          src={s.product.image}
                          alt=""
                          className="w-8 h-8 object-cover rounded border shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {s.product.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          SKU: {s.product.sku}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {(() => {
                          const totalStock =
                            getVariants(s.product).reduce(
                              (sum: number, v: any) =>
                                sum + (v.stock_level ?? 0),
                              0,
                            ) ||
                            s.product.stock_level ||
                            0;
                          return (
                            <p
                              className={`text-[10px] font-medium ${totalStock <= 0 ? "text-red-500" : "text-slate-400"}`}
                            >
                              Stock: {totalStock}
                            </p>
                          );
                        })()}
                        <span className="text-xs text-slate-400">
                          Select variant →
                        </span>
                      </div>
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
                    <>
                      {productsSection}
                      {variantsSection}
                    </>
                  ) : (
                    <>
                      {variantsSection}
                      {productsSection}
                    </>
                  )}
                  {suggestions.length > suggestionLimit && (
                    <div className="px-4 py-2 text-center text-xs text-slate-400">
                      Scroll for more results
                    </div>
                  )}
                </div>
              );
            })()}

          {/* No suggestions / default: Favorites / Sale tabs */}
          {!showSuggestions && !wholesaleMode && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tab bar */}
              <div className="flex shrink-0 border-b bg-slate-50">
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors border-b-2 ${
                    activeProductTab === "favorites"
                      ? "border-blue-600 text-blue-700 bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => switchProductTab("favorites")}
                  data-testid="pos-tab-favorites"
                >
                  <Package className="h-3.5 w-3.5" />
                  Favorites
                  {pinnedProducts.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-blue-100 text-blue-700 px-1.5 py-0 text-[10px] font-bold">
                      {pinnedProducts.length}
                    </span>
                  )}
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors border-b-2 ${
                    activeProductTab === "sale"
                      ? "border-orange-500 text-orange-700 bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => switchProductTab("sale")}
                  data-testid="pos-tab-sale"
                >
                  <Tag className="h-3.5 w-3.5" />
                  Sale
                  {saleProducts.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-orange-100 text-orange-700 px-1.5 py-0 text-[10px] font-bold">
                      {saleProducts.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                {activeProductTab === "favorites" ? (
                  pinnedLoading ? (
                    <ProductTabSkeleton label="Loading Favorites from BigCommerce…" />
                  ) : pinnedProducts.length === 0 ? (
                    <ProductTabEmpty message="No favorites yet" sub="Ask your admin to pin products for quick access." />
                  ) : (
                    <ProductTabList
                      label="Favorites"
                      products={[...pinnedProducts].sort((a, b) => a.name.localeCompare(b.name))}
                      onOpen={(p) => openPopupWithFreshStock(p, matchedTier)}
                      onDirectAdd={(p) => handleDirectAddPinned(p)}
                    />
                  )
                ) : (
                  saleLoading ? (
                    <ProductTabSkeleton label="Loading Sale items from BigCommerce…" />
                  ) : saleError ? (
                    <ProductTabEmpty
                      message="Sale products unavailable"
                      sub={(saleError as Error).message ?? "Could not load the Promotions category from BigCommerce."}
                    />
                  ) : saleProducts.length === 0 ? (
                    <ProductTabEmpty message="No sale items right now" sub="Products in your BigCommerce 'Promotions' category will appear here." />
                  ) : (
                    <ProductTabList
                      label="Sale"
                      labelColor="orange"
                      products={[...saleProducts].sort((a, b) => a.name.localeCompare(b.name))}
                      onOpen={(p) => openPopupWithFreshStock(p, matchedTier)}
                      onDirectAdd={(p) => handleDirectAddPinned(p)}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Cart Panel (38%) ── */}
        <div
          className={wholesaleMode ? "flex-1 flex flex-col bg-white overflow-hidden" : "flex-none w-[38%] min-w-[340px] max-w-[520px] flex flex-col bg-white border-l shadow-md"}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 shrink-0">
            <span className="font-bold text-sm text-slate-700 uppercase tracking-wide">
              Cart
            </span>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium disabled:opacity-40"
                  onClick={() => refreshStockAndHighlight(false)}
                  disabled={isRefreshingInventory}
                  data-testid="button-pos-reload-inventory"
                >
                  <RotateCw
                    className={`h-3.5 w-3.5 ${isRefreshingInventory ? "animate-spin" : ""}`}
                  />
                  Reload Inventory
                </button>
              )}
              {cart.length > 0 && (
                <button
                  className="text-xs text-red-400 hover:text-red-600 font-medium"
                  onClick={() => {
                    clearCart();
                    setActiveLineId(null);
                    setDiscountInputs({});
                    setManualPriceInputs({});
                    setFreshStockByLineId(new Map());
                    setInventoryErrorIds(new Set());
                    focusSearch();
                  }}
                  data-testid="button-pos-clear-cart"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className={`flex-1 overflow-y-auto ${wholesaleMode ? "" : "divide-y"}`}>
            {/* ── Wholesale Mode: spreadsheet-style table ── */}
            {wholesaleMode && (
              cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <ShoppingCart className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">No items in cart yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[820px]">
                    <thead>
                      <tr className="border-b bg-slate-50 sticky top-0 z-10">
                        <th className="px-2 py-2 w-12"></th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Product</th>
                        <th className="px-3 py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-16">Stock</th>
                        <th className="px-3 py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-32">Qty</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-24">Unit $</th>
                        <th className="px-3 py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-24">Disc %</th>
                        <th className="px-3 py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28">Price $</th>
                        {selectedCustomer && <th className="px-2 py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28">History</th>}
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-24">Total</th>
                        <th className="px-2 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cart.map((item, index) => {
                        const isFree = item.discount_type === "free";
                        const hasPct = item.discount_type === "percent";
                        const isDiscounted = item.price_at_sale < item.original_price;
                        const wsDiscountInput = discountInputs[item.lineId] ?? (hasPct ? String(item.discount_value ?? "") : "");
                        const wsManualInput = manualPriceInputs[item.lineId] ?? "";
                        const wsStock = freshStockByLineId.has(item.lineId)
                          ? freshStockByLineId.get(item.lineId)!
                          : (item.variant?.stock_level ?? item.product.stock_level ?? 0);
                        const wsAtMax = !allowOverselling && item.quantity >= wsStock;
                        return (
                          <tr key={item.lineId} className={`hover:bg-slate-50/50 transition-colors ${inventoryErrorIds.has(item.lineId) ? "bg-red-50" : ""}`} data-testid={`ws-row-${item.lineId}`}>
                            <td className="px-2 py-1.5">
                              {item.product.image ? (
                                <img src={item.product.image} alt="" className="w-9 h-9 object-cover rounded border shrink-0" />
                              ) : (
                                <div className="w-9 h-9 bg-slate-100 rounded border flex items-center justify-center">
                                  <Package className="h-4 w-4 text-slate-300" />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1.5 min-w-0 max-w-[180px]">
                              <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{item.product.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {item.variant?.sku || item.product.sku}
                                {item.variant?.option_values?.length > 0 && ` · ${item.variant.option_values.map((ov: any) => ov.label).join(" / ")}`}
                              </p>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${wsStock <= 0 ? "text-red-600 bg-red-50" : wsStock < 5 ? "text-amber-700 bg-amber-50" : "text-slate-600 bg-slate-100"}`}>{wsStock}</span>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1 justify-center">
                                <button className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-400 disabled:opacity-40 transition-colors" disabled={item.quantity <= 1} onClick={() => updateCartQuantityAtIndex(index, -1)} data-testid={`button-ws-minus-${item.lineId}`}><Minus className="h-3 w-3" /></button>
                                <input type="number" min="1" className="w-12 h-7 text-center text-sm font-bold border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" defaultValue={item.quantity} key={`ws-qty-${item.lineId}-${item.quantity}`}
                                  onBlur={(e) => {
                                    let newQty = parseInt(e.target.value, 10);
                                    if (!isNaN(newQty) && newQty >= 1) {
                                      if (!allowOverselling && wsStock > 0) newQty = Math.min(newQty, wsStock);
                                      const delta = newQty - item.quantity;
                                      if (delta !== 0) updateCartQuantityAtIndex(index, delta);
                                    }
                                  }}
                                  data-testid={`input-ws-qty-${item.lineId}`}
                                />
                                <button className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-400 disabled:opacity-40 transition-colors" disabled={wsAtMax} onClick={() => updateCartQuantityAtIndex(index, 1)} data-testid={`button-ws-plus-${item.lineId}`}><Plus className="h-3 w-3" /></button>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className={`text-sm font-bold ${isDiscounted || isFree ? "text-red-600" : "text-slate-900"}`}>${fmtPrice(item.price_at_sale)}</span>
                                {(isDiscounted || isFree || wsManualInput) && (
                                  <button
                                    className="text-slate-400 hover:text-slate-700 transition-colors"
                                    title="Reset to default price"
                                    onClick={() => clearLineDiscount(item, index)}
                                    data-testid={`button-ws-reset-price-${item.lineId}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {(isDiscounted || isFree) && <p className="text-[10px] text-slate-400 line-through">${fmtPrice(item.original_price)}</p>}
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min="0" max="100" placeholder="0" className="w-20 h-7 text-center text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" value={wsDiscountInput}
                                onChange={(e) => setDiscountInputs(p => ({ ...p, [item.lineId]: e.target.value }))}
                                onBlur={(e) => {
                                  const pct = parseFloat(e.target.value);
                                  if (!isNaN(pct) && pct >= 0 && pct <= 100) applyPercent(item, index, pct);
                                  else if (!e.target.value && hasPct) clearLineDiscount(item, index);
                                }}
                                data-testid={`input-ws-discount-${item.lineId}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min="0" step="0.01" placeholder="—" className="w-24 h-7 text-center text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" value={wsManualInput}
                                onChange={(e) => setManualPriceInputs(p => ({ ...p, [item.lineId]: e.target.value }))}
                                onBlur={(e) => { if (e.target.value) applyManualPrice(item, index, e.target.value); }}
                                data-testid={`input-ws-price-${item.lineId}`}
                              />
                            </td>
                            {selectedCustomer && (
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  {/* Last $ */}
                                  <button
                                    className="h-7 px-2 text-[11px] font-semibold border border-slate-200 rounded bg-white hover:border-slate-400 disabled:opacity-40 transition-colors whitespace-nowrap"
                                    disabled={loadingHistoryLineId === item.lineId}
                                    onClick={async () => {
                                      setLoadingHistoryLineId(item.lineId);
                                      try {
                                        const hist = await fetchPriceHistory(item);
                                        if (hist.length === 0) {
                                          toast({ title: "No price history", variant: "destructive", duration: 2000 });
                                          return;
                                        }
                                        applyManualPrice(item, index, hist[0].price, "historical");
                                      } finally {
                                        setLoadingHistoryLineId(null);
                                      }
                                    }}
                                    data-testid={`button-ws-last-price-${item.lineId}`}
                                  >
                                    {loadingHistoryLineId === item.lineId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Last $"}
                                  </button>
                                  {/* History dropdown */}
                                  {(() => {
                                    const hkey = historyKey(item);
                                    const hist = priceHistoryCache.get(hkey) ?? [];
                                    const isOpen = openHistoryLineId === item.lineId;
                                    return (
                                      <div className="relative">
                                        <button
                                          className="h-7 px-2 text-[11px] font-semibold border border-slate-200 rounded bg-white hover:border-slate-400 disabled:opacity-40 transition-colors whitespace-nowrap"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (isOpen) { setOpenHistoryLineId(null); setWsHistoryRect(null); return; }
                                            const r = e.currentTarget.getBoundingClientRect();
                                            setWsHistoryRect({ top: r.bottom + 4, left: r.left });
                                            setLoadingHistoryLineId(item.lineId);
                                            try { await fetchPriceHistory(item); } finally { setLoadingHistoryLineId(null); }
                                            setOpenHistoryLineId(item.lineId);
                                          }}
                                          data-testid={`button-ws-history-${item.lineId}`}
                                        >
                                          Hist ▾
                                        </button>
                                        {isOpen && wsHistoryRect && (
                                          <div style={{ position: "fixed", top: wsHistoryRect.top, left: wsHistoryRect.left, zIndex: 9999 }} className="w-52 bg-white border rounded-md shadow-lg py-1" onMouseDown={(e) => e.preventDefault()}>
                                            {hist.length === 0 ? (
                                              <p className="px-3 py-2 text-xs text-slate-500">No history</p>
                                            ) : (
                                              hist.map((h, hi) => (
                                                <button key={hi} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 border-b last:border-0"
                                                  onClick={() => { applyManualPrice(item, index, h.price, "historical"); setOpenHistoryLineId(null); }}
                                                  data-testid={`option-ws-history-${item.lineId}-${hi}`}
                                                >
                                                  <p className="text-sm font-bold text-green-600">${fmtPrice(parseFloat(h.price))}</p>
                                                  <p className="text-xs text-slate-400">
                                                    {h.date ? new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                                                    {h.orderId ? ` | #${h.orderId}` : ""}
                                                  </p>
                                                </button>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-1.5 text-right">
                              <span className="text-sm font-bold text-slate-900">${fmtPrice(item.price_at_sale * item.quantity)}</span>
                              {isFree && <p className="text-[10px] text-red-500 font-bold">FREE</p>}
                              {hasPct && <p className="text-[10px] text-red-500">-{item.discount_value}%</p>}
                            </td>
                            <td className="px-2 py-1.5">
                              <button className="text-slate-300 hover:text-red-500 transition-colors" onClick={() => { removeFromCartAtIndex(index); if (activeLineId === item.lineId) setActiveLineId(null); }} data-testid={`button-ws-remove-${item.lineId}`}><X className="h-4 w-4" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
            {wholesaleMode && cart.length > 0 && (
              <div className="px-3 py-3 border-t space-y-2 bg-white">
                {notesSectionContent}
              </div>
            )}
            {/* ── Normal Mode: expandable card items ── */}
            {!wholesaleMode && (cart.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
                No items yet
              </div>
            ) : (
              cart.map((item, index) => {
                const isActive = item.lineId === activeLineId;
                const isFree = item.discount_type === "free";
                const hasPct = item.discount_type === "percent";
                const isDiscounted = item.price_at_sale < item.original_price;
                const discountInput =
                  discountInputs[item.lineId] ??
                  (hasPct ? String(item.discount_value ?? "") : "");
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
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.variant?.sku || item.product.sku}
                          {item.variant?.option_values?.length > 0 &&
                            ` · ${item.variant.option_values.map((ov: any) => ov.label).join("/")} `}
                          · ×{item.quantity}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-sm font-bold ${isDiscounted || isFree ? "text-red-600" : "text-slate-900"}`}
                        >
                          ${fmtPrice(item.price_at_sale * item.quantity)}
                        </p>
                        {isFree && (
                          <span className="text-[9px] font-bold text-red-500">
                            FREE
                          </span>
                        )}
                        {hasPct && (
                          <span className="text-[9px] text-red-500">
                            -{item.discount_value}%
                          </span>
                        )}
                        {item.price_source === "price_list" &&
                          item.price_tier_label && (
                            <span
                              className="text-[9px] px-1 py-0.5 rounded font-bold text-white leading-none"
                              style={{
                                backgroundColor:
                                  item.price_tier_color || "#6366f1",
                              }}
                              data-testid={`badge-tier-compact-${item.lineId}`}
                            >
                              {item.price_tier_label}
                            </span>
                          )}
                        {item.price_source === "historical" && (
                          <span className="text-[9px] text-purple-500 font-bold">
                            HIST
                          </span>
                        )}
                      </div>
                      <button
                        className="text-slate-300 hover:text-red-500 ml-1 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromCartAtIndex(index);
                          if (activeLineId === item.lineId)
                            setActiveLineId(null);
                        }}
                        data-testid={`button-pos-remove-${item.lineId}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }

                // ── Active item ──
                return (
                  <div
                    key={item.lineId}
                    className={`${inventoryErrorIds.has(item.lineId) ? "bg-red-50 border-l-4 border-red-400" : "bg-blue-50 border-l-4 border-blue-500"} px-3 py-3 space-y-2.5`}
                    data-testid={`pos-item-active-${item.lineId}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-900 leading-snug">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          SKU: {item.variant?.sku || item.product.sku}
                          {item.variant?.option_values?.length > 0 && (
                            <span className="ml-1 font-medium text-slate-600">
                              ·{" "}
                              {item.variant.option_values
                                .map((ov: any) => ov.label)
                                .join(" / ")}
                            </span>
                          )}
                          {(() => {
                            const stock = freshStockByLineId.has(item.lineId)
                              ? freshStockByLineId.get(item.lineId)!
                              : (item.variant?.stock_level ??
                                item.product.stock_level ??
                                0);
                            return (
                              <span
                                className={`ml-2 font-medium ${stock <= 0 ? "text-red-500" : "text-slate-400"}`}
                              >
                                · Stock: {stock}
                              </span>
                            );
                          })()}
                        </p>
                      </div>
                      <button
                        className="text-slate-300 hover:text-red-500 shrink-0"
                        onClick={() => {
                          removeFromCartAtIndex(index);
                          setActiveLineId(null);
                          focusSearch();
                        }}
                        data-testid={`button-pos-remove-active-${item.lineId}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Qty */}
                    {(() => {
                      const itemStock = freshStockByLineId.has(item.lineId)
                        ? freshStockByLineId.get(item.lineId)!
                        : (item.variant?.stock_level ??
                          item.product.stock_level ??
                          0);
                      const atMax =
                        !allowOverselling && item.quantity >= itemStock;
                      const maxPurchase =
                        item.variant?.max_purchase_quantity ??
                        item.product.max_purchase_quantity ??
                        null;
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={item.quantity <= 1}
                            onClick={() => {
                              updateCartQuantityAtIndex(index, -1);
                              focusSearch();
                            }}
                            data-testid={`button-pos-minus-${item.lineId}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            className="w-16 h-9 text-center text-base font-bold text-slate-900 bg-white px-1"
                            defaultValue={item.quantity}
                            key={`qty-${item.lineId}-${item.quantity}`}
                            onBlur={(e) => {
                              let newQty = parseInt(e.target.value, 10);
                              if (!isNaN(newQty) && newQty >= 1) {
                                if (!allowOverselling && itemStock > 0)
                                  newQty = Math.min(newQty, itemStock);
                                const delta = newQty - item.quantity;
                                if (delta !== 0)
                                  updateCartQuantityAtIndex(index, delta);
                              }
                              focusSearch();
                            }}
                            data-testid={`input-pos-qty-${item.lineId}`}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={atMax}
                            onClick={() => {
                              updateCartQuantityAtIndex(index, 1);
                              focusSearch();
                            }}
                            data-testid={`button-pos-plus-${item.lineId}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-xs text-slate-500 ml-1">
                            qty
                          </span>
                        </div>
                      );
                    })()}

                    {/* Max purchase quantity warning note */}
                    {(() => {
                      const maxPurchase =
                        item.variant?.max_purchase_quantity ??
                        item.product.max_purchase_quantity ??
                        null;
                      return maxPurchase != null && maxPurchase > 0 ? (
                        <div
                          className="flex items-start gap-1.5 mt-1.5 bg-amber-50 border border-amber-300 rounded px-2 py-1.5 text-xs text-amber-800"
                          data-testid={`warning-max-purchase-${item.lineId}`}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px text-amber-500" />
                          <span>
                            <strong>BC Max Purchase Limit: {maxPurchase}</strong> — limit will be automatically removed at checkout and restored after.
                          </span>
                        </div>
                      ) : null;
                    })()}

                    {/* Price display */}
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span
                        className={`text-xl font-bold ${isDiscounted || isFree ? "text-red-600" : "text-slate-900"}`}
                      >
                        ${fmtPrice(item.price_at_sale)}
                      </span>
                      {(isDiscounted || isFree) && (
                        <span className="text-xs text-slate-400 line-through">
                          ${fmtPrice(item.original_price)}
                        </span>
                      )}
                      {isFree && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] h-4 px-1"
                        >
                          FREE
                        </Badge>
                      )}
                      {hasPct && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] h-4 px-1"
                        >
                          -{item.discount_value}%
                        </Badge>
                      )}
                      {item.price_source === "price_list" &&
                        item.price_tier_label && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white leading-none self-center"
                            style={{
                              backgroundColor:
                                item.price_tier_color || "#6366f1",
                            }}
                            data-testid={`badge-tier-active-${item.lineId}`}
                          >
                            {item.price_tier_label}
                          </span>
                        )}
                      {item.price_source === "historical" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold text-purple-600 bg-purple-50 leading-none self-center"
                          data-testid={`badge-hist-active-${item.lineId}`}
                        >
                          HIST
                        </span>
                      )}
                      {item.price_source === "custom" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold text-amber-700 bg-amber-50 leading-none self-center"
                          data-testid={`badge-custom-active-${item.lineId}`}
                        >
                          CUSTOM
                        </span>
                      )}
                    </div>

                    {/* Discount controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Last $ button */}
                      {selectedCustomer && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          disabled={loadingHistoryLineId === item.lineId}
                          onClick={async () => {
                            setLoadingHistoryLineId(item.lineId);
                            try {
                              const hist = await fetchPriceHistory(item);
                              if (hist.length === 0) {
                                toast({
                                  title: "No price history",
                                  variant: "destructive",
                                  duration: 2000,
                                });
                                return;
                              }
                              applyManualPrice(
                                item,
                                index,
                                hist[0].price,
                                "historical",
                              );
                            } finally {
                              setLoadingHistoryLineId(null);
                              focusSearch();
                            }
                          }}
                          data-testid={`button-pos-last-price-${item.lineId}`}
                        >
                          {loadingHistoryLineId === item.lineId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Last $"
                          )}
                        </Button>
                      )}
                      {/* History dropdown */}
                      {selectedCustomer &&
                        (() => {
                          const hkey = historyKey(item);
                          const hist = priceHistoryCache.get(hkey) ?? [];
                          const isOpen = openHistoryLineId === item.lineId;
                          return (
                            <div className="relative">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (isOpen) {
                                    setOpenHistoryLineId(null);
                                    return;
                                  }
                                  setLoadingHistoryLineId(item.lineId);
                                  try {
                                    await fetchPriceHistory(item);
                                  } finally {
                                    setLoadingHistoryLineId(null);
                                  }
                                  setOpenHistoryLineId(item.lineId);
                                  focusSearch();
                                }}
                                data-testid={`button-pos-history-${item.lineId}`}
                              >
                                History ▾
                              </Button>
                              {isOpen && (
                                <div
                                  className="absolute left-0 top-full mt-1 w-56 bg-white border rounded-md shadow-lg z-50 py-1"
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  {hist.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-slate-500">
                                      No history
                                    </p>
                                  ) : (
                                    hist.map((h, hi) => (
                                      <button
                                        key={hi}
                                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 border-b last:border-0"
                                        onClick={() => {
                                          applyManualPrice(
                                            item,
                                            index,
                                            h.price,
                                            "historical",
                                          );
                                          setOpenHistoryLineId(null);
                                          focusSearch();
                                        }}
                                        data-testid={`option-history-${item.lineId}-${hi}`}
                                      >
                                        <p className="text-sm font-bold text-green-600">
                                          ${fmtPrice(parseFloat(h.price))}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                          {h.date
                                            ? new Date(
                                                h.date,
                                              ).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                              })
                                            : ""}
                                          {h.orderId ? ` | #${h.orderId}` : ""}
                                        </p>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Disc (%)"
                        className="w-28 h-8 text-xs bg-white"
                        value={discountInput}
                        onChange={(e) =>
                          setDiscountInputs((p) => ({
                            ...p,
                            [item.lineId]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          const pct = parseFloat(e.target.value);
                          if (!isNaN(pct) && pct >= 0 && pct <= 100)
                            applyPercent(item, index, pct);
                          else if (!e.target.value && hasPct)
                            clearLineDiscount(item, index);
                          focusSearch();
                        }}
                        data-testid={`input-pos-discount-${item.lineId}`}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price ($)"
                        className="w-32 h-8 text-xs bg-white"
                        value={manualInput}
                        onChange={(e) =>
                          setManualPriceInputs((p) => ({
                            ...p,
                            [item.lineId]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          if (e.target.value)
                            applyManualPrice(item, index, e.target.value);
                          focusSearch();
                        }}
                        data-testid={`input-pos-price-${item.lineId}`}
                      />
                      {(isDiscounted || isFree || manualInput) && (
                        <button
                          className="text-xs text-slate-400 hover:text-slate-700 underline"
                          onClick={() => {
                            clearLineDiscount(item, index);
                            focusSearch();
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex justify-between text-xs text-slate-600 pt-0.5">
                      <span>Line total</span>
                      <span className="font-bold text-slate-900 text-sm">
                        ${fmtPrice(item.price_at_sale * item.quantity)}
                      </span>
                    </div>
                  </div>
                );
              })
            ))}
          </div>

          {/* Notes section */}
          {!wholesaleMode && cart.length > 0 && (
            <div className="px-3 py-2 border-t shrink-0 space-y-2">
              {notesSectionContent}
            </div>
          )}

          {!wholesaleMode && (
          <div className="border-t px-4 py-3 bg-slate-50 shrink-0 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">
                {totalQty} item{totalQty !== 1 ? "s" : ""}
              </span>
              {totalDiscount > 0 && (
                <span
                  className="text-sm text-red-500 font-medium"
                  data-testid="text-pos-discount"
                >
                  Item Discount: -${fmtPrice(totalDiscount)}
                </span>
              )}
            </div>
            {cartDiscountAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">
                  {cartDiscount?.type === "store_credit"
                    ? "Store Credit"
                    : "Discount"}
                </span>
                <span
                  className="text-sm font-semibold text-red-500"
                  data-testid="text-pos-cart-discount"
                >
                  -${fmtPrice(cartDiscountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold text-slate-700">
                Total
              </span>
              <span
                className="text-2xl font-bold text-slate-900"
                data-testid="text-pos-total"
              >
                ${fmtPrice(adjustedTotal)}
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

            {/* Max qty override log — collapsible summary */}
            {(() => {
              const limitedItems = cart.filter(item => {
                const m = item.variant?.max_purchase_quantity ?? item.product.max_purchase_quantity ?? null;
                return m != null && m > 0;
              });
              if (limitedItems.length === 0) return null;
              return (
                <div className="mt-2 bg-amber-50 border border-amber-300 rounded" data-testid="max-qty-override-log">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-100 rounded transition-colors"
                    onClick={() => setShowOverrideLog(v => !v)}
                    data-testid="button-toggle-override-log"
                  >
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      Max Qty Override — {limitedItems.length} item{limitedItems.length !== 1 ? "s" : ""} · Limits removed before checkout
                    </span>
                    <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showOverrideLog ? "rotate-180" : ""}`} />
                  </button>
                  {showOverrideLog && (
                    <div className="px-2 pb-2 space-y-1 border-t border-amber-200">
                      <div className="pt-1 space-y-0.5">
                        {limitedItems.map(item => {
                          const maxQty = item.variant?.max_purchase_quantity ?? item.product.max_purchase_quantity;
                          return (
                            <div key={item.lineId} className="flex justify-between text-[11px] text-amber-800" data-testid={`log-entry-${item.lineId}`}>
                              <span className="truncate mr-2">{item.product.name}{item.variant ? ` (${item.variant.sku})` : ""}</span>
                              <span className="shrink-0 font-semibold">Max: {maxQty}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-amber-600 pt-0.5 border-t border-amber-200">Limits removed before checkout · restored after</p>
                    </div>
                  )}
                </div>
              );
            })()}

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
                disabled={
                  cart.length === 0 ||
                  !selectedCustomer ||
                  !selectedAddress ||
                  isSubmitting
                }
                onClick={handleCheckoutClick}
                data-testid="button-pos-checkout"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                {isSubmitting ? "Processing…" : "Checkout"}
              </Button>
            </div>

            {/* ── Inline sync row ── */}
            <div
              className="flex items-center gap-2 pt-1.5 border-t mt-2"
              data-testid="pos-sync-footer"
            >
              <button
                onClick={syncPriceHistory}
                disabled={isSyncing}
                className="text-blue-600 font-medium text-xs disabled:opacity-50 shrink-0"
                data-testid="button-sync-prices"
              >
                {isSyncing ? "Syncing..." : "Sync"}
              </button>
              <span
                className="text-gray-400 text-xs truncate"
                data-testid="text-sync-status"
              >
                {syncStatusText}
              </span>
            </div>
          </div>
          )}
          {/* ── Wholesale sticky footer ── */}
          {wholesaleMode && (
            <div className="shrink-0 border-t bg-white px-4 py-3 shadow-inner">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-slate-900">${fmtPrice(adjustedTotal)}</span>
                  <span className="text-sm text-slate-500 ml-1">{totalQty} item{totalQty !== 1 ? "s" : ""}</span>
                  {totalDiscount > 0 && <span className="text-sm text-red-500 font-medium ml-1">· -{fmtPrice(totalDiscount)}</span>}
                  {cartDiscountAmount > 0 && <span className="text-sm text-red-500 font-medium ml-1">· -{fmtPrice(cartDiscountAmount)}</span>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={cart.length === 0 || isSubmitting} onClick={handleSaveDraft} data-testid="button-ws-save-draft">
                    <FileText className="h-4 w-4 mr-1.5" />Save Draft
                  </Button>
                  <Button disabled={cart.length === 0 || !selectedCustomer || !selectedAddress || isSubmitting} onClick={handleCheckoutClick} data-testid="button-ws-checkout">
                    {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1.5" />}
                    {isSubmitting ? "Processing…" : "Checkout"}
                  </Button>
                </div>
              </div>
              {cart.length > 0 && !selectedCustomer && (
                <div className="flex items-center gap-1.5 mt-2 text-amber-600 text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Select a customer to enable checkout
                </div>
              )}
              {cart.length > 0 && selectedCustomer && !selectedAddress && (
                <div className="flex items-center gap-1.5 mt-2 text-amber-600 text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  No address found for this customer
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Checkout confirmation ── */}
      <AlertDialog
        open={showCheckoutConfirm}
        onOpenChange={setShowCheckoutConfirm}
      >
        <AlertDialogContent data-testid="dialog-checkout-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Checkout</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCustomer
                ? `Submit order for ${selectedCustomer.first_name} ${selectedCustomer.last_name}?`
                : "Submit this order?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-checkout"
              onClick={() => {
                setShowCheckoutConfirm(false);
                handleCheckout();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Inventory Shortfall Push Dialog ── */}
      <Dialog open={showInvPushDialog} onOpenChange={setShowInvPushDialog}>
        <DialogContent
          className="w-[95%] max-w-[95%] flex flex-col p-0 gap-0"
          style={{
            maxHeight: "calc(var(--app-height, 100dvh) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 2rem)",
            marginTop: "env(safe-area-inset-top)",
          }}
          data-testid="dialog-inv-shortfall"
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-amber-700 text-base">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              Inventory Shortfall Detected
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              The items below have less stock in BigCommerce than the quantity in your cart.
              Push inventory for each item as needed, then continue to checkout.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {invPushItems.map((item, idx) => {
              const pendingForSku = invPushPendingOrders[(item.sku || "").toLowerCase()] || [];
              const isPushing = invPushingIds.has(item.lineId);
              const isPushed = invPushedIds.has(item.lineId);

              return (
                <div
                  key={item.lineId}
                  className={`border rounded-lg p-3 space-y-2.5 ${isPushed ? "border-green-300 bg-green-50" : "border-amber-200 bg-amber-50/60"}`}
                  data-testid={`inv-shortfall-item-${item.lineId}`}
                >
                  {/* Product header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 leading-tight truncate">{item.productName}</p>
                      {item.variantName && (
                        <p className="text-xs text-slate-500 truncate">{item.variantName}</p>
                      )}
                      <p className="text-xs font-mono text-slate-500 mt-0.5">SKU: {item.sku}</p>
                    </div>
                    {isPushed && (
                      <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Pushed
                      </Badge>
                    )}
                  </div>

                  {/* Stock summary */}
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-white rounded p-1.5 border">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cart Qty</p>
                      <p className="font-bold text-slate-800 text-sm">{item.cartQty}</p>
                    </div>
                    <div className="bg-white rounded p-1.5 border">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">In Stock</p>
                      <p className={`font-bold text-sm ${item.bcStock < item.cartQty ? "text-red-600" : "text-slate-800"}`}>{item.bcStock}</p>
                    </div>
                    <div className="bg-white rounded p-1.5 border border-amber-300">
                      <p className="text-[10px] text-amber-600 uppercase tracking-wide">Shortfall</p>
                      <p className="font-bold text-amber-700 text-sm">{item.cartQty - item.bcStock}</p>
                    </div>
                  </div>

                  {/* Push quantity (editable) */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 shrink-0 w-20">Push Qty</label>
                    <Input
                      type="number"
                      min={1}
                      value={item.pushQty}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        setInvPushItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, pushQty: val } : it))
                        );
                      }}
                      className="h-8 w-24 text-sm"
                      disabled={isPushing || isPushed}
                      data-testid={`input-inv-push-qty-${item.lineId}`}
                    />
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="text-xs text-slate-600 block mb-1">Reason</label>
                    <Input
                      value={item.reason}
                      onChange={(e) =>
                        setInvPushItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, reason: e.target.value } : it))
                        )
                      }
                      className="h-8 text-sm"
                      placeholder="Reason for pushing inventory"
                      disabled={isPushing || isPushed}
                      data-testid={`input-inv-push-reason-${item.lineId}`}
                    />
                  </div>

                  {/* Pending unfulfilled BC orders for this SKU */}
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">
                      Pending Fulfillment Orders
                      {!invPushLoadingOrders && pendingForSku.length > 0 && (
                        <span className="ml-1 text-amber-600">({pendingForSku.length})</span>
                      )}
                    </p>
                    {invPushLoadingOrders ? (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading…
                      </div>
                    ) : pendingForSku.length > 0 ? (
                      <div className="max-h-28 overflow-y-auto space-y-1 rounded border bg-white p-1">
                        {pendingForSku.map((po) => (
                          <div
                            key={po.order_id}
                            className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-slate-50"
                          >
                            <span className="font-semibold text-slate-700">#{po.order_id}</span>
                            <span className="text-slate-500 truncate max-w-[90px] mx-1">{po.customer}</span>
                            <span className="text-slate-600 shrink-0">×{po.quantity}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 ml-1">{po.status}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No pending orders found for this SKU</p>
                    )}
                  </div>

                  {/* Per-item push button */}
                  <Button
                    size="sm"
                    disabled={isPushing || isPushed}
                    className={`w-full ${isPushed ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={async () => {
                      setInvPushingIds((prev) => new Set(prev).add(item.lineId));
                      try {
                        await api.pushInventory({
                          product_id: item.productDbId ?? 0,
                          variant_id: item.variantId ?? 0,
                          sku: item.sku,
                          quantity_added: item.pushQty,
                          reason: item.reason || undefined,
                          product_name: item.productName,
                          variant_name: item.variantName,
                        });
                        setInvPushedIds((prev) => new Set(prev).add(item.lineId));
                        toast({
                          title: `Inventory pushed for ${item.sku}`,
                          description: `+${item.pushQty} unit${item.pushQty !== 1 ? "s" : ""} added to BigCommerce`,
                        });
                      } catch (err: any) {
                        toast({
                          title: "Push failed",
                          description: err.message,
                          variant: "destructive",
                        });
                      } finally {
                        setInvPushingIds((prev) => {
                          const n = new Set(prev);
                          n.delete(item.lineId);
                          return n;
                        });
                      }
                    }}
                    data-testid={`button-inv-push-${item.lineId}`}
                  >
                    {isPushing ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Pushing…</>
                    ) : isPushed ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1.5" />Pushed</>
                    ) : (
                      `Push +${item.pushQty} unit${item.pushQty !== 1 ? "s" : ""}`
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t shrink-0 flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowInvPushDialog(false)}
              data-testid="button-inv-shortfall-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowInvPushDialog(false);
                proceedToCheckoutConfirm();
              }}
              data-testid="button-inv-shortfall-continue"
            >
              Continue to Checkout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Inventory error dialog ── */}
      <AlertDialog
        open={showInventoryDialog}
        onOpenChange={setShowInventoryDialog}
      >
        <AlertDialogContent data-testid="dialog-inventory-error">
          <AlertDialogHeader>
            <AlertDialogTitle>Inventory Updated</AlertDialogTitle>
            <AlertDialogDescription>
              The inventory has been updated. Modify your cart before checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowInventoryDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Generic error dialog ── */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent data-testid="dialog-checkout-error">
          <AlertDialogHeader>
            <AlertDialogTitle>Something went wrong</AlertDialogTitle>
            <AlertDialogDescription>
              {errorDialogMsg || "An unexpected error occurred."} Contact IT
              support if the issue persists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowErrorDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Navigation guard ── */}
      <AlertDialog
        open={!!navTarget}
        onOpenChange={(open) => {
          if (!open) setNavTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-nav-guard">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave POS Mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Your cart has {cart.length} {cart.length === 1 ? "item" : "items"}
              . If you leave now your cart will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="nav-guard-stay">
              Stay
            </AlertDialogCancel>
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
          onClose={() => {
            setPopupProduct(null);
            setPopupFreshVariantStock(new Map());
            setPopupPriceListPrices({});
            focusSearch();
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onAdd={handlePopupAdd}
          allowOverselling={allowOverselling}
          selectedCustomer={selectedCustomer}
          onFetchPriceHistory={fetchPopupPriceHistory}
          freshVariantStock={popupFreshVariantStock}
          priceListPrices={popupPriceListPrices}
          matchedTier={matchedTier}
        />
      )}

      {/* ── Max Purchase Qty Override Modal ── */}
      <AlertDialog
        open={showMaxOverrideModal}
        onOpenChange={setShowMaxOverrideModal}
      >
        <AlertDialogContent data-testid="dialog-max-override" className="w-[95vw] max-w-[95vw]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Maximum Purchase Limits Detected
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Some items in your cart have maximum purchase limits.
                  Temporarily disable limits to proceed with checkout?
                </p>
                <ul className="text-xs bg-amber-50 border border-amber-200 rounded p-2 space-y-1 mt-2 max-h-48 overflow-y-auto">
                  {maxOverrideItems.map((item) => {
                    const maxQty =
                      item.variant?.max_purchase_quantity ??
                      item.product.max_purchase_quantity;
                    return (
                      <li key={item.lineId} className="flex justify-between">
                        <span className="truncate mr-2">
                          {item.product.name ||
                            item.variant?.sku ||
                            item.product.sku}
                        </span>
                        <span className="shrink-0 font-medium text-amber-700">
                          Qty {item.quantity} · Max {maxQty}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-slate-500 mt-1">
                  Limits are removed at the product level and restored
                  automatically after checkout.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-max-override-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isOverriding}
              onClick={handleCheckoutWithOverride}
              data-testid="button-max-override-confirm"
            >
              {isOverriding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Overriding…
                </>
              ) : (
                "Proceed"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Below-Cost Price Protection Modal ── */}
      <AlertDialog
        open={!!belowCostConfirm}
        onOpenChange={(open) => {
          if (!open) {
            if (belowCostConfirm) {
              setManualPriceInputs((p) => {
                const n = { ...p };
                if (belowCostConfirm.prevPriceInput) n[belowCostConfirm.item.lineId] = belowCostConfirm.prevPriceInput;
                else delete n[belowCostConfirm.item.lineId];
                return n;
              });
              setBelowCostConfirm(null);
              focusSearch();
            }
          }
        }}
      >
        <AlertDialogContent
          data-testid="dialog-below-cost"
          className="w-[95vw] sm:max-w-xl"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>⚠ Price Below Product Cost</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {belowCostConfirm && (
                <div className="space-y-2">
                  <div className="text-sm bg-red-50 border border-red-200 rounded p-2 space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 shrink-0">Product</span>
                      <span className="font-medium text-slate-800 text-right break-words">{belowCostConfirm.item.product.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SKU</span>
                      <span className="font-medium text-slate-800">{belowCostConfirm.item.variant?.sku || belowCostConfirm.item.product.sku}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Product Cost</span>
                      <span className="font-medium text-slate-800">${fmtPrice(belowCostConfirm.cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Entered Price</span>
                      <span className="font-bold text-red-600">${fmtPrice(belowCostConfirm.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Difference</span>
                      <span className="font-bold text-red-600">-${fmtPrice(belowCostConfirm.cost - belowCostConfirm.price)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">This sale will generate a loss. Do you want to continue?</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-below-cost-no">No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-below-cost-yes"
              onClick={async () => {
                if (!belowCostConfirm) return;
                const { item, index, price, priceSource, cost } = belowCostConfirm;
                commitManualPrice(item, index, price, priceSource);
                setBelowCostConfirm(null);
                try {
                  await api.createPriceOverrideAudit({
                    customer_id: selectedCustomer?.id ?? null,
                    customer_name: selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : null,
                    product_id: item.product.id,
                    product_name: item.product.name,
                    sku: item.variant?.sku || item.product.sku,
                    product_cost: cost,
                    selling_price: price,
                  });
                } catch {
                  /* audit log failure should not block the sale */
                }
                focusSearch();
              }}
            >
              Yes, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Push Inventory Modal ── */}
      {showPushInventoryModal && (
        <PushInventoryModal onClose={() => setShowPushInventoryModal(false)} />
      )}

      <Toaster />
    </div>
  );
}

// ─── Push Inventory Modal ─────────────────────────────────────────────────────

function PushInventoryModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { currentUser } = useStore();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<api.Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<api.Product | null>(
    null,
  );
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [reason, setReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  const selectProduct = useCallback((p: api.Product, autoVariant?: any) => {
    setSelectedProduct(p);
    if (autoVariant) {
      setSelectedVariant(autoVariant);
    } else {
      const variants = getVariants(p);
      setSelectedVariant(variants.length === 1 ? variants[0] : null);
    }
    setSearch("");
    setResults([]);
  }, []);

  // Always search full BigCommerce catalog via agent route (SKU, UPC, keyword)
  const handleSearch = useCallback(
    (q: string) => {
      setSearch(q);
      if (!q.trim()) {
        setResults([]);
        return;
      }
      if (debRef.current) clearTimeout(debRef.current);
      debRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const userId = currentUser?.id;
          if (!userId) {
            setResults([]);
            return;
          }
          const result = await api.agentBigCommerceSearch(q, userId);
          if (result.resultType === "variant") {
            // Direct SKU/UPC hit — auto-select product + variant immediately
            // Merge min/max onto the variant from search result
            selectProduct(result.product, result.variant);
          } else {
            // Keyword results — show product list for user to pick from
            setResults((result.products || []).slice(0, 20));
          }
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 350);
    },
    [currentUser?.id, selectProduct],
  );

  const quantity = parseInt(quantityInput) || 0;

  const handleSubmit = async () => {
    if (!selectedProduct || !selectedVariant || quantity <= 0) return;
    setIsSubmitting(true);
    try {
      const result = await api.pushInventory({
        product_id: selectedProduct.bigcommerce_id,
        variant_id: selectedVariant.id,
        sku: selectedVariant.sku || selectedProduct.sku,
        quantity_added: quantity,
        reason: reason || undefined,
        product_name: selectedProduct.name,
        variant_name:
          variantLabel(selectedVariant) || selectedVariant.sku || "",
      });
      toast({
        title: "Inventory Updated",
        description: `${selectedVariant.sku || selectedProduct.sku}: ${result.previous_inventory} → ${result.new_inventory}`,
      });
      setSelectedProduct(null);
      setSelectedVariant(null);
      setQuantityInput("1");
      setReason("");
      setShowConfirm(false);
      // Refocus search for next push
      setTimeout(() => searchRef.current?.focus(), 80);
    } catch (e: any) {
      toast({
        title: "Failed to push inventory",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const variants = selectedProduct ? getVariants(selectedProduct) : [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0"
        data-testid="dialog-push-inventory"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5" /> Push Inventory
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Search the full catalog by product name, SKU, or UPC to manually
            increment stock.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Search bar — always visible */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search by name, SKU, or UPC…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 pr-9"
              data-testid="input-push-inv-search"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />
            )}
            {search && !isSearching && (
              <button
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                onClick={() => {
                  setSearch("");
                  setResults([]);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search results — mother titles */}
          {results.length > 0 && !selectedProduct && (
            <div className="border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {results.length} result{results.length !== 1 ? "s" : ""} —
                  click to select
                </p>
              </div>
              <div className="divide-y max-h-[40vh] overflow-y-auto">
                {results.map((p) => {
                  const pvariants = getVariants(p);
                  return (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
                      onClick={() => selectProduct(p)}
                      data-testid={`push-inv-result-${p.id}`}
                    >
                      {p.image && (
                        <img
                          src={p.image}
                          alt=""
                          className="w-10 h-10 object-cover rounded border shrink-0 bg-slate-50"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-slate-800">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          SKU: {p.sku}
                          {pvariants.length > 1 && (
                            <span className="ml-2 text-slate-400">
                              · {pvariants.length} variants
                            </span>
                          )}
                        </p>
                      </div>
                      <Plus className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {search &&
            !isSearching &&
            results.length === 0 &&
            !selectedProduct && (
              <p className="text-sm text-slate-400 text-center py-4">
                No products found for "{search}"
              </p>
            )}

          {/* Selected product + variant + quantity */}
          {selectedProduct && (
            <>
              {/* Product header */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                {selectedProduct.image && (
                  <img
                    src={selectedProduct.image}
                    alt=""
                    className="w-12 h-12 object-cover rounded border shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {selectedProduct.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    SKU: {selectedProduct.sku}
                  </p>
                  {selectedVariant && (
                    <p className="text-xs text-blue-600 font-medium mt-0.5">
                      {variantLabel(selectedVariant) || selectedVariant.sku} ·
                      Stock: {selectedVariant.stock_level ?? 0}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setSelectedVariant(null);
                    setShowConfirm(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                  data-testid="button-push-inv-change-product"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Variant selection if multiple */}
              {variants.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                    Select Variant
                  </label>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[30vh] overflow-y-auto divide-y">
                      {variants.map((v: any) => (
                        <button
                          key={v.id}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${selectedVariant?.id === v.id ? "bg-blue-50 font-semibold text-blue-700" : ""}`}
                          onClick={() => setSelectedVariant(v)}
                          data-testid={`push-inv-variant-${v.id}`}
                        >
                          <span>{variantLabel(v) || v.sku}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-slate-400 font-mono">
                              {v.sku}
                            </span>
                            <span
                              className={
                                v.stock_level <= 0
                                  ? "text-red-500"
                                  : "text-slate-400"
                              }
                            >
                              Stock: {v.stock_level ?? 0}
                            </span>
                            {selectedVariant?.id === v.id && (
                              <span className="text-blue-600">✓</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quantity + reason */}
              {selectedVariant && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                      Quantity to Add
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setQuantityInput(String(Math.max(1, quantity - 1)))
                        }
                        className="border rounded-lg p-2.5 hover:bg-slate-100 transition-colors"
                        data-testid="button-push-inv-minus"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <Input
                        type="number"
                        min="1"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        className="text-center w-28 font-bold text-xl h-12"
                        data-testid="input-push-inv-quantity"
                      />
                      <button
                        onClick={() => setQuantityInput(String(quantity + 1))}
                        className="border rounded-lg p-2.5 hover:bg-slate-100 transition-colors"
                        data-testid="button-push-inv-plus"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="text-sm text-slate-500 ml-2">
                        <p>
                          {selectedVariant.stock_level ?? 0}{" "}
                          <span className="text-slate-400">current</span>
                        </p>
                        <p className="font-semibold text-slate-800">
                          → {(selectedVariant.stock_level ?? 0) + quantity}{" "}
                          <span className="text-slate-400 font-normal">
                            after
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                      Reason (Optional)
                    </label>
                    <Input
                      placeholder="e.g. Received shipment, Stock correction…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      data-testid="input-push-inv-reason"
                    />
                  </div>

                  {!showConfirm ? (
                    <Button
                      className="w-full h-12 text-base font-semibold"
                      disabled={quantity <= 0}
                      onClick={() => setShowConfirm(true)}
                      data-testid="button-push-inv-confirm-open"
                    >
                      <Package className="h-4 w-4 mr-2" />
                      Push {quantity} Unit{quantity !== 1 ? "s" : ""} to
                      BigCommerce
                    </Button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-amber-800">
                        Confirm Inventory Push
                      </p>
                      <p className="text-sm text-amber-700">
                        Add <strong>{quantity}</strong> unit
                        {quantity !== 1 ? "s" : ""} to{" "}
                        <strong>
                          {variantLabel(selectedVariant) || selectedVariant.sku}
                        </strong>{" "}
                        on BigCommerce.
                        <br />
                        Stock:{" "}
                        <strong>
                          {selectedVariant.stock_level ?? 0}
                        </strong> →{" "}
                        <strong>
                          {(selectedVariant.stock_level ?? 0) + quantity}
                        </strong>
                        {reason && (
                          <>
                            <br />
                            Reason: <em>{reason}</em>
                          </>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowConfirm(false)}
                          data-testid="button-push-inv-cancel"
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={isSubmitting}
                          onClick={handleSubmit}
                          data-testid="button-push-inv-submit"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Pushing…
                            </>
                          ) : (
                            "Confirm Push"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
