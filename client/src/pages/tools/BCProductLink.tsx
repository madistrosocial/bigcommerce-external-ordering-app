import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Link2, Search, Plus, X, Loader2, RefreshCw, CheckCircle2, AlertCircle,
  ChevronRight, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BCProduct {
  id: number;
  name: string;
  slug: string;
}

interface BCCustomField {
  id: number;
  name: string;
  value: string;
}

interface LinkedRow {
  rowId: string;
  product: BCProduct | null;
  displayName: string;
  bidirectional: boolean;
}

interface LinkResult {
  productId: number;
  direction: string;
  success: boolean;
  error?: string;
}

// ─── Product search dropdown ──────────────────────────────────────────────────

function ProductSearchBox({
  placeholder,
  selected,
  onSelect,
  onClear,
  disabled,
  testId,
}: {
  placeholder?: string;
  selected: BCProduct | null;
  onSelect: (p: BCProduct) => void;
  onClear: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BCProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/tools/bc/product-search?q=${encodeURIComponent(q.trim())}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) { setResults(await res.json()); setOpen(true); }
      } catch {}
      setSearching(false);
    }, 350);
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm min-w-0">
        <span className="truncate flex-1 text-slate-800 font-medium">{selected.name}</span>
        {!disabled && (
          <button onClick={onClear} className="shrink-0 text-slate-400 hover:text-slate-700" data-testid={`${testId}-clear`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full" data-testid={testId}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <Input
          className="pl-8 pr-8 text-sm"
          placeholder={placeholder ?? "Search products…"}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          data-testid={`${testId}-input`}
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 border-b border-slate-50 last:border-0"
              onMouseDown={(e) => { e.preventDefault(); onSelect(p); setOpen(false); setQuery(""); setResults([]); }}
              data-testid={`${testId}-result-${p.id}`}
            >
              <span className="text-slate-800">{p.name}</span>
              <span className="ml-2 text-[10px] text-slate-400 font-mono">{p.slug}</span>
            </button>
          ))}
        </div>
      )}
      {open && !searching && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg px-3 py-3 text-sm text-slate-400">
          No products found
        </div>
      )}
    </div>
  );
}

// ─── Existing custom fields panel ─────────────────────────────────────────────

function ExistingLinkedProducts({ productId }: { productId: number }) {
  const { data: fields = [], isLoading } = useQuery<BCCustomField[]>({
    queryKey: ["bc-custom-fields", productId],
    queryFn: async () => {
      const res = await fetch(`/api/tools/bc/product-custom-fields/${productId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const linkFields = fields.filter((f) => f.value.includes("Available Here"));

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading existing links…
      </div>
    );
  }

  if (linkFields.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-slate-400 italic">No existing product links found on this product.</p>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
        <Tag className="h-3 w-3" /> Already linked ({linkFields.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {linkFields.map((f) => (
          <Badge
            key={f.id}
            className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 font-normal"
          >
            {f.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

let rowCounter = 0;
function newRow(): LinkedRow {
  return { rowId: String(++rowCounter), product: null, displayName: "", bidirectional: false };
}

export default function BCProductLinkPage() {
  const { toast } = useToast();
  const [mainProduct, setMainProduct] = useState<BCProduct | null>(null);
  const [rows, setRows] = useState<LinkedRow[]>([newRow()]);
  const [linking, setLinking] = useState(false);
  const [linkResults, setLinkResults] = useState<LinkResult[] | null>(null);

  const updateRow = useCallback((rowId: string, patch: Partial<LinkedRow>) => {
    setRows((prev) => prev.map((r) => r.rowId === rowId ? { ...r, ...patch } : r));
  }, []);

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const canLink = mainProduct !== null && rows.some((r) => r.product !== null);

  const handleLink = async () => {
    if (!mainProduct || !canLink) return;
    setLinking(true);
    setLinkResults(null);
    const validRows = rows.filter((r) => r.product !== null);
    try {
      const res = await fetch("/api/tools/bc/product-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          mainProductId: mainProduct.id,
          links: validRows.map((r) => ({
            linkedProductId: r.product!.id,
            linkedProductName: r.product!.name,
            linkedDisplayName: r.displayName.trim() || r.product!.name,
            linkedProductSlug: r.product!.slug,
            mainProductName: mainProduct.name,
            mainProductSlug: mainProduct.slug,
            bidirectional: r.bidirectional,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Link failed");
      setLinkResults(data.results ?? []);
      const allOk = (data.results ?? []).every((r: LinkResult) => r.success);
      toast({
        title: allOk ? "Products linked successfully" : "Partial success",
        description: allOk
          ? `${validRows.length} link(s) added to "${mainProduct.name}".`
          : "Some links may have failed — check the results below.",
        variant: allOk ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleReset = () => {
    setMainProduct(null);
    setRows([newRow()]);
    setLinkResults(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-bold text-slate-800">BC Product Link</h2>
      </div>
      <p className="text-sm text-slate-500 -mt-3">
        Link products together by adding cross-reference custom fields in BigCommerce.
      </p>

      {/* Step 1 — Main Product */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">1</span>
            <CardTitle className="text-sm">Select Main Product</CardTitle>
          </div>
          <CardDescription className="text-xs">
            This is the product that will receive the custom field links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductSearchBox
            placeholder="Search BigCommerce products…"
            selected={mainProduct}
            onSelect={(p) => { setMainProduct(p); setLinkResults(null); }}
            onClear={() => { setMainProduct(null); setLinkResults(null); }}
            testId="main-product"
          />
          {mainProduct && (
            <>
              <p className="mt-2 text-[11px] text-slate-400">
                Custom fields will be added to: <span className="font-medium text-slate-600">{mainProduct.name}</span>
              </p>
              <ExistingLinkedProducts productId={mainProduct.id} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Linked Products */}
      {mainProduct && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">2</span>
              <CardTitle className="text-sm">Select Products to Link</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Each selected product will be added as a custom field on the main product.
              Enable <RefreshCw className="inline h-3 w-3 mx-0.5" /> to also link the main product back.
              Edit the display name to shorten long product names in BC.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.map((row, idx) => (
              <div key={row.rowId} className="flex items-start gap-2">
                {/* Row number */}
                <span className="mt-2.5 text-[11px] text-slate-400 w-4 shrink-0 text-right">{idx + 1}.</span>

                {/* Product selector + display name */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <ProductSearchBox
                    placeholder="Search linked product…"
                    selected={row.product}
                    onSelect={(p) => updateRow(row.rowId, { product: p, displayName: p.name })}
                    onClear={() => updateRow(row.rowId, { product: null, displayName: "" })}
                    testId={`linked-product-${row.rowId}`}
                  />
                  {/* Display name field — shown once product is selected */}
                  {row.product && (
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <Input
                        value={row.displayName}
                        onChange={(e) => updateRow(row.rowId, { displayName: e.target.value })}
                        placeholder="Custom field name (display name)…"
                        className="h-8 text-xs"
                        data-testid={`display-name-${row.rowId}`}
                      />
                    </div>
                  )}
                </div>

                {/* Bidirectional toggle */}
                <div
                  className={cn(
                    "mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer",
                    row.bidirectional
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-slate-300 text-slate-400 hover:border-blue-400",
                  )}
                  title={row.bidirectional ? "Reverse link ON" : "Enable reverse link"}
                  data-testid={`bidir-${row.rowId}`}
                  onClick={() => updateRow(row.rowId, { bidirectional: !row.bidirectional })}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </div>

                {/* Remove row */}
                {rows.length > 1 && (
                  <button
                    className="mt-2 text-slate-300 hover:text-red-400 transition-colors"
                    onClick={() => removeRow(row.rowId)}
                    data-testid={`remove-row-${row.rowId}`}
                    title="Remove row"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> = Also add reverse link on the linked product
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              className="w-full border-dashed text-slate-500 hover:text-slate-700"
              data-testid="btn-add-row"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Another Product
            </Button>

            <Button
              className="w-full"
              disabled={!canLink || linking}
              onClick={handleLink}
              data-testid="btn-link-products"
            >
              {linking ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Linking…</>
              ) : (
                <><Link2 className="h-4 w-4 mr-2" /> Link Products</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {mainProduct && rows.some((r) => r.product !== null) && !linkResults && (
        <Card className="shadow-sm bg-slate-50">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 uppercase tracking-wide">Preview — Custom Fields to be Added</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {rows.filter((r) => r.product).map((row) => {
              const fieldName = row.displayName.trim() || row.product!.name;
              return (
                <div key={row.rowId} className="space-y-1.5">
                  <div className="rounded border border-slate-200 bg-white p-2.5 space-y-1">
                    <div className="text-[10px] text-blue-600 font-semibold uppercase">On: {mainProduct.name}</div>
                    <div className="flex gap-1">
                      <ChevronRight className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-700">Name:</span>{" "}
                        <span className="text-slate-600">{fieldName}</span>
                        {fieldName !== row.product!.name && (
                          <span className="ml-1.5 text-[10px] text-slate-400">(custom display name)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <ChevronRight className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-700">Value:</span>{" "}
                        <span className="font-mono text-slate-500 break-all">{`<a href="[storefrontUrl]${row.product!.slug}">Available Here</a>`}</span>
                      </div>
                    </div>
                  </div>
                  {row.bidirectional && (
                    <div className="rounded border border-blue-100 bg-blue-50 p-2.5 space-y-1">
                      <div className="text-[10px] text-blue-600 font-semibold uppercase flex items-center gap-1">
                        <RefreshCw className="h-2.5 w-2.5" /> Reverse — On: {row.product!.name}
                      </div>
                      <div className="flex gap-1">
                        <ChevronRight className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-semibold text-slate-700">Name:</span>{" "}
                          <span className="text-slate-600">{mainProduct.name}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <ChevronRight className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-semibold text-slate-700">Value:</span>{" "}
                          <span className="font-mono text-slate-500 break-all">{`<a href="[storefrontUrl]${mainProduct.slug}">Available Here</a>`}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {linkResults && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Link Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linkResults.map((r, i) => (
              <div key={i} className={cn("flex items-center gap-2 rounded p-2 text-sm",
                r.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
                {r.success
                  ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  : <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span>
                  Product ID {r.productId} ({r.direction === "main->linked" ? "main → linked" : "linked → main"}):
                  {r.success ? " Custom field added" : ` Failed — ${r.error}`}
                </span>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleReset} data-testid="btn-reset">
              Link Another Product
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
