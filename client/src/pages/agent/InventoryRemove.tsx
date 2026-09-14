import { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Minus, Plus, Search, X, Loader2, CheckSquare, Square, PackageMinus, AlertTriangle } from "lucide-react";

function getVariants(product: api.Product): any[] {
  if (!product.variants) return [];
  if (Array.isArray(product.variants)) return product.variants;
  try { return JSON.parse(product.variants as unknown as string); } catch { return []; }
}

function variantLabel(variant: any): string {
  if (!variant) return "";
  if (variant.option_values?.length > 0) return variant.option_values.map((ov: any) => ov.label).join(" / ");
  return variant.sku || "";
}

function friendlySkuVaultError(message: string): string {
  if (message === "Authentication required") {
    return "Your Sales App session has expired. Sign in again, then reopen Remove Inventory.";
  }
  if (/SKUVault credentials not configured/i.test(message)) {
    return "SKUVault credentials are not configured. An administrator must configure them in Admin → SKUVault.";
  }
  if (/SKUVault .*HTTP 401|SKUVault .*Authentication required/i.test(message)) {
    return "SKUVault rejected the connection. Check the credentials in Admin → SKUVault.";
  }
  return message;
}

export default function InventoryRemovePage() {
  const { toast } = useToast();
  const { currentUser } = useStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<api.Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<api.Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [reason, setReason] = useState("Internal Purchase");
  const [removeFromBigCommerce, setRemoveFromBigCommerce] = useState(true);
  const [removeFromSkuvault, setRemoveFromSkuvault] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [svLocation, setSvLocation] = useState<{ locationCode: string | null; currentQty: number | null; source: string; error?: string } | null>(null);
  const [svLocationLoading, setSvLocationLoading] = useState(false);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    setSvLocation(null);
    if (!removeFromSkuvault || !selectedVariant) return;
    const sku = selectedVariant.sku || selectedProduct?.sku;
    if (!sku) return;
    setSvLocationLoading(true);
    api.resolveSkuVaultLocation(sku)
      .then(setSvLocation)
      .catch((error) => setSvLocation({ locationCode: null, currentQty: null, source: "error", error: friendlySkuVaultError(error.message) }))
      .finally(() => setSvLocationLoading(false));
  }, [selectedVariant, removeFromSkuvault, selectedProduct?.sku]);

  const selectProduct = useCallback((product: api.Product, autoVariant?: any) => {
    setSelectedProduct(product);
    const variants = getVariants(product);
    setSelectedVariant(autoVariant || (variants.length === 1 ? variants[0] : null));
    setSearch("");
    setResults([]);
    setShowConfirm(false);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (!value.trim()) { setResults([]); return; }
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (!currentUser?.id) return;
        const result = await api.agentBigCommerceSearch(value, currentUser.id);
        if (result.resultType === "variant") selectProduct(result.product, result.variant);
        else setResults((result.products || []).slice(0, 20));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, [currentUser?.id, selectProduct]);

  const quantity = parseInt(quantityInput, 10) || 0;
  const variants = selectedProduct ? getVariants(selectedProduct) : [];
  const stock = Number(selectedVariant?.stock_level ?? 0);
  const tooManyForBigCommerce = removeFromBigCommerce && quantity > stock;
  const hasDestination = removeFromBigCommerce || removeFromSkuvault;
  const canSubmit = !!selectedProduct && !!selectedVariant && quantity > 0 && !!reason.trim() && hasDestination && !tooManyForBigCommerce;
  const destination = [removeFromBigCommerce && "BigCommerce", removeFromSkuvault && "SKUVault"].filter(Boolean).join(" + ") || "…";

  const handleSubmit = async () => {
    if (!selectedProduct || !selectedVariant || !canSubmit) return;
    setIsSubmitting(true);
    try {
      const result = await api.removeInventory({
        product_id: selectedProduct.bigcommerce_id,
        variant_id: selectedVariant.id,
        sku: selectedVariant.sku || selectedProduct.sku,
        quantity_removed: quantity,
        reason,
        product_name: selectedProduct.name,
        variant_name: variantLabel(selectedVariant) || selectedVariant.sku || "",
        remove_from_bigcommerce: removeFromBigCommerce,
        remove_from_skuvault: removeFromSkuvault,
      });
      toast({
        title: "Inventory Removed",
        description: result.skuvault_warning
          ? `${selectedVariant.sku || selectedProduct.sku}: removed ${quantity} unit${quantity === 1 ? "" : "s"}. SKUVault confirmation is temporarily rate-limited.`
          : `${selectedVariant.sku || selectedProduct.sku}: removed ${quantity} unit${quantity === 1 ? "" : "s"}`,
      });
      setSelectedProduct(null);
      setSelectedVariant(null);
      setQuantityInput("1");
      setShowConfirm(false);
      setSvLocation(null);
      setTimeout(() => searchRef.current?.focus(), 80);
    } catch (error: any) {
      toast({ title: "Failed to remove inventory", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <PackageMinus className="h-5 w-5 text-red-600" /> Remove Inventory
        </h2>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input ref={searchRef} placeholder="Search by name, SKU, or UPC…" value={search} onChange={(e) => handleSearch(e.target.value)} className="pl-9 pr-9" data-testid="input-remove-inv-search" />
            {isSearching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}
            {search && !isSearching && <button className="absolute right-3 top-3 text-slate-400 hover:text-slate-600" onClick={() => { setSearch(""); setResults([]); }}><X className="h-4 w-4" /></button>}
          </div>

          {results.length > 0 && !selectedProduct && (
            <div className="border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{results.length} result{results.length !== 1 ? "s" : ""} — click to select</p></div>
              <div className="divide-y max-h-[50vh] overflow-y-auto">
                {results.map((product) => (
                  <button key={product.id} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors" onClick={() => selectProduct(product)} data-testid={`remove-inv-result-${product.id}`}>
                    {product.image && <img src={product.image} alt="" className="w-10 h-10 object-cover rounded border shrink-0 bg-slate-50" />}
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate text-slate-800">{product.name}</p><p className="text-xs text-slate-400">SKU: {product.sku}{getVariants(product).length > 1 && <span className="ml-2">· {getVariants(product).length} variants</span>}</p></div>
                    <PackageMinus className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {search && !isSearching && results.length === 0 && !selectedProduct && <p className="text-sm text-slate-400 text-center py-4">No products found for "{search}"</p>}

          {selectedProduct && (
            <>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                {selectedProduct.image && <img src={selectedProduct.image} alt="" className="w-12 h-12 object-cover rounded border shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{selectedProduct.name}</p>
                  <p className="text-xs text-slate-500">SKU: {selectedProduct.sku}</p>
                  {selectedVariant && <p className="text-xs text-red-600 font-medium mt-0.5">{variantLabel(selectedVariant) || selectedVariant.sku} · Stock: {stock}</p>}
                </div>
                <button onClick={() => { setSelectedProduct(null); setSelectedVariant(null); setShowConfirm(false); }} className="text-slate-400 hover:text-slate-600 shrink-0" data-testid="button-remove-inv-change-product"><X className="h-5 w-5" /></button>
              </div>

              {variants.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">Select Variant</label>
                  <div className="border rounded-lg overflow-hidden"><div className="max-h-[40vh] overflow-y-auto divide-y">
                    {variants.map((variant: any) => (
                      <button key={variant.id} className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${selectedVariant?.id === variant.id ? "bg-red-50 font-semibold text-red-700" : ""}`} onClick={() => setSelectedVariant(variant)} data-testid={`remove-inv-variant-${variant.id}`}>
                        <span>{variantLabel(variant) || variant.sku}</span><span className="flex items-center gap-3 text-xs"><span className="text-slate-400 font-mono">{variant.sku}</span><span className={variant.stock_level <= 0 ? "text-red-500" : "text-slate-400"}>Stock: {variant.stock_level ?? 0}</span>{selectedVariant?.id === variant.id && <span className="text-red-600">✓</span>}</span>
                      </button>
                    ))}
                  </div></div>
                </div>
              )}

              {selectedVariant && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">Quantity to Remove</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setQuantityInput(String(Math.max(1, quantity - 1)))} className="border rounded-lg p-2.5 hover:bg-slate-100" data-testid="button-remove-inv-minus"><Minus className="h-4 w-4" /></button>
                      <Input type="number" min="1" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} className="text-center w-28 font-bold text-xl h-12" data-testid="input-remove-inv-quantity" />
                      <button onClick={() => setQuantityInput(String(quantity + 1))} className="border rounded-lg p-2.5 hover:bg-slate-100" data-testid="button-remove-inv-plus"><Plus className="h-4 w-4" /></button>
                      <div className="text-sm text-slate-500 ml-2"><p>{stock} <span className="text-slate-400">current</span></p><p className="font-semibold text-slate-800">→ {Math.max(0, stock - quantity)} <span className="text-slate-400 font-normal">after</span></p></div>
                    </div>
                    {tooManyForBigCommerce && <p className="text-xs text-red-600 mt-2">Quantity cannot exceed the current BigCommerce stock.</p>}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">SKUVault Transaction Reason (required)</label>
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Internal Purchase" data-testid="input-remove-inv-reason" />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">Remove From</label>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: "BigCommerce", value: removeFromBigCommerce, set: setRemoveFromBigCommerce },
                        { label: "SKUVault", value: removeFromSkuvault, set: setRemoveFromSkuvault },
                      ].map(({ label, value, set }) => <button key={label} type="button" onClick={() => set((current) => !current)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium text-left" style={{ background: value ? "#fef2f2" : undefined, borderColor: value ? "#fca5a5" : undefined, color: value ? "#b91c1c" : "#475569" }}>{value ? <CheckSquare className="h-4 w-4 text-red-500 shrink-0" /> : <Square className="h-4 w-4 text-slate-400 shrink-0" />}{label}</button>)}
                    </div>
                    {!hasDestination && <p className="text-xs text-red-500 mt-1.5">Select at least one destination.</p>}
                  </div>

                  {removeFromSkuvault && <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"><span className="font-semibold text-slate-600 uppercase tracking-wide">SKUVault Bin: </span>{svLocationLoading ? <span className="text-slate-400 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Looking up bin…</span> : svLocation?.locationCode ? <><span className="font-mono text-purple-700 font-semibold">{svLocation.locationCode}</span>{svLocation.currentQty !== null && <span className="text-slate-400 ml-2">(current: {svLocation.currentQty})</span>}</> : <span className="text-red-600">{svLocation?.error ?? "No bin found — configure a fallback location if needed."}</span>}</div>}

                  {!showConfirm ? <Button className="w-full h-12 text-base font-semibold bg-red-600 hover:bg-red-700" disabled={!canSubmit} onClick={() => setShowConfirm(true)} data-testid="button-remove-inv-confirm-open"><PackageMinus className="h-4 w-4 mr-2" />Remove {quantity} Unit{quantity !== 1 ? "s" : ""}</Button> : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Confirm Inventory Removal</p>
                      <p className="text-sm text-amber-700">Remove <strong>{quantity}</strong> unit{quantity !== 1 ? "s" : ""} of <strong>{variantLabel(selectedVariant) || selectedVariant.sku}</strong> from <strong>{destination}</strong>.<br />BigCommerce stock: <strong>{stock}</strong> → <strong>{Math.max(0, stock - quantity)}</strong><br />Reason: <em>{reason}</em></p>
                      <div className="flex gap-2"><Button variant="outline" onClick={() => setShowConfirm(false)} data-testid="button-remove-inv-cancel">Cancel</Button><Button className="bg-red-600 hover:bg-red-700" disabled={isSubmitting} onClick={handleSubmit} data-testid="button-remove-inv-submit">{isSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Removing…</> : "Confirm Removal"}</Button></div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}