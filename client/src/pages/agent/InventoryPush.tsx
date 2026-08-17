import { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Search, X, Plus, Minus, Loader2, CheckSquare, Square } from "lucide-react";

// ─── Helpers (same as POS.tsx) ────────────────────────────────────────────────

function getVariants(product: api.Product): any[] {
  if (!product.variants) return [];
  if (Array.isArray(product.variants)) return product.variants;
  try { return JSON.parse(product.variants as unknown as string); }
  catch { return []; }
}

function variantLabel(variant: any): string {
  if (!variant) return "";
  if (variant.option_values?.length > 0) {
    return variant.option_values.map((ov: any) => ov.label).join(" / ");
  }
  return variant.sku || "";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPushPage() {
  const { toast } = useToast();
  const { currentUser } = useStore();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<api.Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<api.Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [reason, setReason] = useState("Manual Inventory Push - SalesApp");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pushToBigcommerce, setPushToBigcommerce] = useState(true);
  const [pushToSkuvault, setPushToSkuvault] = useState(true);

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
      const vars = getVariants(p);
      setSelectedVariant(vars.length === 1 ? vars[0] : null);
    }
    setSearch("");
    setResults([]);
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const userId = currentUser?.id;
        if (!userId) { setResults([]); return; }
        const result = await api.agentBigCommerceSearch(q, userId);
        if (result.resultType === "variant") {
          selectProduct(result.product, result.variant);
        } else {
          setResults((result.products || []).slice(0, 20));
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, [currentUser?.id, selectProduct]);

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
        variant_name: variantLabel(selectedVariant) || selectedVariant.sku || "",
        push_to_bigcommerce: pushToBigcommerce,
        push_to_skuvault: pushToSkuvault,
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
      setTimeout(() => searchRef.current?.focus(), 80);
    } catch (e: any) {
      toast({ title: "Failed to push inventory", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const variants = selectedProduct ? getVariants(selectedProduct) : [];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="h-5 w-5" /> Push Inventory
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Search the full catalog by product name, SKU, or UPC to manually increment stock.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-4">
          {/* Search bar */}
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
                onClick={() => { setSearch(""); setResults([]); }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search results */}
          {results.length > 0 && !selectedProduct && (
            <div className="border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {results.length} result{results.length !== 1 ? "s" : ""} — click to select
                </p>
              </div>
              <div className="divide-y max-h-[50vh] overflow-y-auto">
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
                        <img src={p.image} alt="" className="w-10 h-10 object-cover rounded border shrink-0 bg-slate-50" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">
                          SKU: {p.sku}
                          {pvariants.length > 1 && <span className="ml-2">· {pvariants.length} variants</span>}
                        </p>
                      </div>
                      <Plus className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {search && !isSearching && results.length === 0 && !selectedProduct && (
            <p className="text-sm text-slate-400 text-center py-4">No products found for "{search}"</p>
          )}

          {/* Selected product */}
          {selectedProduct && (
            <>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                {selectedProduct.image && (
                  <img src={selectedProduct.image} alt="" className="w-12 h-12 object-cover rounded border shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{selectedProduct.name}</p>
                  <p className="text-xs text-slate-500">SKU: {selectedProduct.sku}</p>
                  {selectedVariant && (
                    <p className="text-xs text-blue-600 font-medium mt-0.5">
                      {variantLabel(selectedVariant) || selectedVariant.sku} · Stock: {selectedVariant.stock_level ?? 0}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedProduct(null); setSelectedVariant(null); setShowConfirm(false); }}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                  data-testid="button-push-inv-change-product"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Variant picker */}
              {variants.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                    Select Variant
                  </label>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[40vh] overflow-y-auto divide-y">
                      {variants.map((v: any) => (
                        <button
                          key={v.id}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${selectedVariant?.id === v.id ? "bg-blue-50 font-semibold text-blue-700" : ""}`}
                          onClick={() => setSelectedVariant(v)}
                          data-testid={`push-inv-variant-${v.id}`}
                        >
                          <span>{variantLabel(v) || v.sku}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-slate-400 font-mono">{v.sku}</span>
                            <span className={v.stock_level <= 0 ? "text-red-500" : "text-slate-400"}>
                              Stock: {v.stock_level ?? 0}
                            </span>
                            {selectedVariant?.id === v.id && <span className="text-blue-600">✓</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Qty + reason */}
              {selectedVariant && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                      Quantity to Add
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQuantityInput(String(Math.max(1, quantity - 1)))}
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
                        <p>{selectedVariant.stock_level ?? 0} <span className="text-slate-400">current</span></p>
                        <p className="font-semibold text-slate-800">
                          → {(selectedVariant.stock_level ?? 0) + quantity}{" "}
                          <span className="text-slate-400 font-normal">after</span>
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

                  {/* Destination selection */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                      Push Destination
                    </label>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: "BigCommerce", value: pushToBigcommerce, set: setPushToBigcommerce },
                        { label: "SKUVault", value: pushToSkuvault, set: setPushToSkuvault },
                      ].map(({ label, value, set }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => set((v) => !v)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors"
                          style={{ background: value ? "#eff6ff" : undefined, borderColor: value ? "#93c5fd" : undefined, color: value ? "#1d4ed8" : "#475569" }}
                        >
                          {value ? <CheckSquare className="h-4 w-4 text-blue-500 shrink-0" /> : <Square className="h-4 w-4 text-slate-400 shrink-0" />}
                          {label}
                        </button>
                      ))}
                    </div>
                    {!pushToBigcommerce && !pushToSkuvault && (
                      <p className="text-xs text-red-500 mt-1.5">Select at least one destination.</p>
                    )}
                  </div>

                  {(() => {
                    const dest = [pushToBigcommerce && "BigCommerce", pushToSkuvault && "SKUVault"].filter(Boolean).join(" + ") || "…";
                    const btnLabel = `Push ${quantity} Unit${quantity !== 1 ? "s" : ""} to ${dest}`;
                    return !showConfirm ? (
                      <Button
                        className="w-full h-12 text-base font-semibold"
                        disabled={quantity <= 0 || (!pushToBigcommerce && !pushToSkuvault)}
                        onClick={() => setShowConfirm(true)}
                        data-testid="button-push-inv-confirm-open"
                      >
                        <Package className="h-4 w-4 mr-2" />
                        {btnLabel}
                      </Button>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                        <p className="text-sm font-semibold text-amber-800">Confirm Inventory Push</p>
                        <p className="text-sm text-amber-700">
                          Add <strong>{quantity}</strong> unit{quantity !== 1 ? "s" : ""} to{" "}
                          <strong>{variantLabel(selectedVariant) || selectedVariant.sku}</strong> on <strong>{dest}</strong>.
                          <br />
                          Stock: <strong>{selectedVariant.stock_level ?? 0}</strong> →{" "}
                          <strong>{(selectedVariant.stock_level ?? 0) + quantity}</strong>
                          {reason && (<><br />Reason: <em>{reason}</em></>)}
                          {pushToSkuvault && <><br /><span className="text-amber-600 font-medium">An audit task will be created for warehouse verification.</span></>}
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => setShowConfirm(false)} data-testid="button-push-inv-cancel">
                            Cancel
                          </Button>
                          <Button disabled={isSubmitting} onClick={handleSubmit} data-testid="button-push-inv-submit">
                            {isSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Pushing…</> : "Confirm Push"}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
