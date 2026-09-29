import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import * as api from "@/lib/api";
import { toPublicVendorMessage } from "@/lib/vendor-display";
import { getKoleExtendedCost } from "@shared/kole-pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Eye, Filter, Link2, Loader2, Package, Plus, RefreshCw, Search, Upload, X } from "lucide-react";

const PAGE_SIZE = 25;
const MAX_CSV_UPLOAD_BYTES = 50 * 1024 * 1024;

function formatCost(value: string | null | undefined) {
  if (!value) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : value;
}

function imageUrl(data: unknown[]) {
  const first = data?.[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    return String(record.url || record.src || record.href || "");
  }
  return "";
}

function inventoryLabel(product: api.DropshipProduct) {
  const raw = product.raw_data || {};
  if (typeof raw.inventoryProvided === "boolean") {
    return raw.inventoryProvided ? product.inventory.toLocaleString() : "Not provided";
  }
  if (Object.prototype.hasOwnProperty.call(raw, "inventory") && String(raw.inventory ?? "").trim() === "") {
    return "Not provided";
  }
  return product.inventory.toLocaleString();
}

function packLabel(product: api.DropshipProduct) {
  const raw = product.raw_data || {};
  const casePack = String(raw.case_pack ?? "").trim();
  const innerPack = String(raw["Inner Pack"] ?? "").trim();
  const minimumQty = String(raw.minimum_qty ?? "").trim();
  const pieces = [
    casePack ? `Case ${casePack}` : "",
    innerPack ? `Inner ${innerPack}` : "",
    minimumQty ? `Min ${minimumQty}` : "",
  ].filter(Boolean);
  if (pieces.length) return pieces.join(" · ");
  return product.tier_data?.length
    ? `${product.tier_data.length} tier${product.tier_data.length === 1 ? "" : "s"}`
    : "—";
}

function minimumQuantity(product: api.DropshipProduct): number | null {
  const raw = product.raw_data || {};
  const quantity = Number((raw as Record<string, unknown>).minimum_qty);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function extendedSupplierCost(product: api.DropshipProduct) {
  return getKoleExtendedCost(product.raw_data, product.cost);
}

function suggestedRetailPrice(product: api.DropshipProduct) {
  const cost = extendedSupplierCost(product);
  if (cost === null) return "";
  const price = Math.round((cost * 1.2 + Number.EPSILON) * 100) / 100;
  return price > 0 ? price.toFixed(2) : "";
}

function categoryPath(category: api.BcCategory, categories: api.BcCategory[]) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const names: string[] = [];
  const seen = new Set<number>();
  let current: api.BcCategory | undefined = category;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.push(current.name);
    current = byId.get(current.parent_id);
  }
  return names.reverse().join(" / ");
}

function statusLabel(status: string) {
  return status === "queued" ? "Import queued" : status === "mapped" ? "Mapped" : status === "unavailable" ? "Unavailable" : status === "error" ? "Error" : "Available";
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "queued" ? "bg-amber-100 text-amber-700" : status === "mapped" ? "bg-blue-100 text-blue-700" : status === "unavailable" ? "bg-slate-100 text-slate-600" : status === "error" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700";
  return <Badge className={`${cls} border-0 text-[11px]`}>{statusLabel(status)}</Badge>;
}

export default function DropshipCatalogPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManageDropshipping = hasPermission("dropshipping", "manage");
  const queryClient = useQueryClient();
  const { data: connection } = useQuery({ queryKey: ["dropship-connection"], queryFn: api.getKoleConnection });
  const { data: mappingBrandSetting } = useQuery({ queryKey: ["kole-mapping-brand"], queryFn: api.getKoleMappingBrand });
  const [mappingBrandName, setMappingBrandName] = useState<string | null>(null);
  const [mappingResult, setMappingResult] = useState<api.KoleProductMappingResult | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  const [closeoutOnly, setCloseoutOnly] = useState(false);
  const [importedOnly, setImportedOnly] = useState(false);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Map<number, api.DropshipProduct>>(new Map());
  const [detail, setDetail] = useState<api.DropshipProduct | null>(null);
  const [draftProducts, setDraftProducts] = useState<api.DropshipProduct[]>([]);
  const [draftPrices, setDraftPrices] = useState<Record<number, string>>({});
  const [draftCategoryIds, setDraftCategoryIds] = useState<Record<number, string>>({});
  const [bulkDraftCategoryId, setBulkDraftCategoryId] = useState("");
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draggingCsv, setDraggingCsv] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const displayName = connection?.displayName || "Vendor Catalog";

  const params = useMemo(() => ({ page, limit: PAGE_SIZE, search: appliedSearch, category, subcategory, inStock: stockOnly, closeout: closeoutOnly, imported: importedOnly, status }), [page, appliedSearch, category, subcategory, stockOnly, closeoutOnly, importedOnly, status]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["dropship-products", params],
    queryFn: () => api.getKoleProducts(params),
    placeholderData: (previousData) => previousData,
  });
  const {
    data: bcCategories = [],
    isLoading: isLoadingBcCategories,
    error: bcCategoriesError,
    refetch: refetchBcCategories,
  } = useQuery({
    queryKey: ["bigcommerce-categories"],
    queryFn: api.getBcCategories,
    enabled: draftDialogOpen,
  });
  const bcCategoryOptions = useMemo(
    () => bcCategories
      .map((item) => ({ id: item.id, label: categoryPath(item, bcCategories) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [bcCategories],
  );

  const sync = useMutation({
    mutationFn: api.syncKoleCatalog,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      queryClient.invalidateQueries({ queryKey: ["dropship-sync-logs"] });
      setSelected(new Set());
      setSelectedProducts(new Map());
      toast({ title: "Catalog sync completed", description: `${result.productsProcessed} products processed · ${result.productsCreated} new · ${result.productsUpdated} updated` });
    },
    onError: (mutationError: any) => toast({ title: "Catalog sync failed", description: toPublicVendorMessage(mutationError.message), variant: "destructive" }),
  });

  const uploadCsv = useMutation({
    mutationFn: api.uploadKoleCsv,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      queryClient.invalidateQueries({ queryKey: ["dropship-sync-logs"] });
      setSelected(new Set());
      setSelectedProducts(new Map());
      toast({
        title: "CSV imported into Vendor Catalog",
        description: `${result.productsProcessed} products processed · ${result.productsCreated} new · ${result.productsUpdated} updated. No BigCommerce products were created.`,
      });
    },
    onError: (mutationError: any) => toast({ title: "CSV upload failed", description: toPublicVendorMessage(mutationError.message), variant: "destructive" }),
  });

  const runSkuMapping = useMutation({
    mutationFn: api.mapExistingKoleProducts,
    onSuccess: (result) => {
      setMappingBrandName(result.brandName);
      setMappingResult(result);
      queryClient.setQueryData(["kole-mapping-brand"], { brandName: result.brandName });
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      queryClient.invalidateQueries({ queryKey: ["kole-product-sync-products"] });
      queryClient.invalidateQueries({ queryKey: ["kole-product-sync-image-history"] });
      toast({
        title: result.failed ? "SKU mapping finished with errors" : "SKU mapping completed",
        description: `${result.mapped} linked · ${result.remapped} remapped · ${result.alreadyMapped} already current · ${result.unmatched} unmatched · ${result.ambiguous} ambiguous · ${result.failed} failed · ${result.staleMappingsCleared} deleted listing links cleared${result.staleMappingChecksFailed ? ` · ${result.staleMappingChecksFailed} old links could not be checked` : ""}`,
        ...(result.failed || result.staleMappingChecksFailed ? { variant: "destructive" as const } : {}),
      });
    },
    onError: (mutationError: any) => toast({ title: "SKU mapping failed", description: toPublicVendorMessage(mutationError.message), variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, nextStatus }: { id: number; nextStatus: string }) => api.updateKoleProductStatus(id, nextStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      toast({ title: "Import status updated" });
    },
    onError: (mutationError: any) => toast({ title: "Status update failed", description: toPublicVendorMessage(mutationError.message), variant: "destructive" }),
  });

  const createDrafts = useMutation({
    mutationFn: api.createKoleDrafts,
    onSuccess: (result) => {
      const createdIds = new Set(result.results.filter((item) => item.status === "created").map((item) => item.id));
      setSelected((current) => {
        const next = new Set(current);
        for (const id of createdIds) next.delete(id);
        return next;
      });
      setSelectedProducts((current) => {
        const next = new Map(current);
        for (const id of createdIds) next.delete(id);
        return next;
      });
      setDraftDialogOpen(false);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      queryClient.invalidateQueries({ queryKey: ["dropship-sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["kole-product-sync-products"] });
      queryClient.invalidateQueries({ queryKey: ["kole-product-sync-image-history"] });
      const failure = result.results.find((item) => item.status === "failed");
      const warning = result.results.find((item) => item.status === "created" && item.message);
      const imageNote = result.created > 0
        ? " New drafts start without photos; add watermarked images from Product Sync > Image Sync after mapping."
        : "";
      toast({
        title: result.failed ? "Draft import finished with errors" : "BigCommerce draft import finished",
        description: `${result.created} created · ${result.skipped} existing SKU${result.skipped === 1 ? "" : "s"} skipped · ${result.failed} failed${failure?.message ? ` · ${toPublicVendorMessage(failure.message)}` : warning?.message ? ` · ${toPublicVendorMessage(warning.message)}` : ""}${imageNote}`,
        ...(result.failed ? { variant: "destructive" as const } : {}),
      });
    },
    onError: (mutationError: any) => toast({ title: "Draft creation failed", description: toPublicVendorMessage(mutationError.message), variant: "destructive" }),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setAppliedSearch(search.trim()); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const rows = data?.rows ?? [];
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / PAGE_SIZE), 1);
  const queueSelected = () => {
    for (const id of selected) updateStatus.mutate({ id, nextStatus: "queued" });
    setSelected(new Set());
    setSelectedProducts(new Map());
  };
  const toggleProductSelected = (product: api.DropshipProduct) => {
    if (!selected.has(product.id) && selected.size >= 25) {
      toast({ title: "Select up to 25 products", description: "Create drafts in batches of 25 or fewer.", variant: "destructive" });
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(product.id)) next.delete(product.id); else next.add(product.id);
      return next;
    });
    setSelectedProducts((current) => {
      const next = new Map(current);
      if (next.has(product.id)) next.delete(product.id); else next.set(product.id, product);
      return next;
    });
  };
  const openDraftDialog = (products: api.DropshipProduct[]) => {
    const eligible = products.filter((product) => !product.bigcommerce_product_id);
    if (!eligible.length) {
      toast({ title: "No products to create", description: "Selected products are already mapped to BigCommerce." });
      return;
    }
    if (eligible.length > 25) {
      toast({ title: "Select up to 25 products", description: "Create drafts in batches of 25 or fewer.", variant: "destructive" });
      return;
    }
    setDraftProducts(eligible);
    setDraftPrices(Object.fromEntries(eligible.map((product) => [product.id, suggestedRetailPrice(product)])));
    setDraftCategoryIds(Object.fromEntries(eligible.map((product) => [product.id, ""])));
    setBulkDraftCategoryId("");
    setDraftDialogOpen(true);
  };
  const submitDrafts = () => {
    createDrafts.mutate(draftProducts.map((product) => ({
      id: product.id,
      price: Number(draftPrices[product.id]),
      categoryId: Number(draftCategoryIds[product.id]),
    })));
  };
  const draftPricesValid = draftProducts.length > 0 && draftProducts.every((product) => {
    const price = Number(draftPrices[product.id]);
    return Number.isFinite(price) && price > 0;
  });
  const draftCategoriesValid = draftProducts.length > 0 && draftProducts.every((product) => {
    const categoryId = Number(draftCategoryIds[product.id]);
    return Number.isInteger(categoryId) && categoryId > 0;
  });
  const clearFilters = () => {
    setSearch(""); setAppliedSearch(""); setCategory(""); setSubcategory(""); setStockOnly(false); setCloseoutOnly(false); setImportedOnly(false); setStatus(""); setPage(1);
  };
  const startCsvUpload = (file?: File) => {
    if (!file) return;
    if (sync.isPending || uploadCsv.isPending) return;
    if (!file.size) {
      toast({ title: "CSV upload failed", description: "The selected file is empty.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_CSV_UPLOAD_BYTES) {
      toast({ title: "CSV upload failed", description: "Choose a CSV file no larger than 50 MB.", variant: "destructive" });
      return;
    }
    uploadCsv.mutate(file);
  };

  return (
    <div className="px-4 md:px-6 py-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package className="h-5 w-5 text-indigo-600" /> Product Catalog</h1>
        </div>
        <div className="flex gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv,text/plain,application/octet-stream"
            className="hidden"
            onChange={(event) => {
              startCsvUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {selected.size > 0 && <Button variant="outline" size="sm" onClick={queueSelected} disabled={updateStatus.isPending}><Plus className="h-4 w-4 mr-1.5" />Queue {selected.size}</Button>}
          {selected.size > 0 && <Button size="sm" onClick={() => openDraftDialog(Array.from(selectedProducts.values()))} disabled={createDrafts.isPending}><Plus className="h-4 w-4 mr-1.5" />Create {selected.size} Draft{selected.size === 1 ? "" : "s"}</Button>}
          <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} disabled={sync.isPending || uploadCsv.isPending}>
            {uploadCsv.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            {uploadCsv.isPending ? "Uploading CSV…" : "Upload CSV"}
          </Button>
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending || uploadCsv.isPending}><RefreshCw className={`h-4 w-4 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />Sync CSV Feed</Button>
        </div>
      </div>

      <Card className={`border-dashed transition-colors ${draggingCsv ? "border-indigo-500 bg-indigo-50/60" : "border-slate-300"}`}>
        <CardContent
          className="p-3 flex items-center gap-3"
          onDragEnter={(event) => { event.preventDefault(); setDraggingCsv(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingCsv(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDraggingCsv(false);
            startCsvUpload(event.dataTransfer.files?.[0]);
          }}
          aria-label="CSV upload drop area"
        >
          <Upload className={`h-5 w-5 shrink-0 ${draggingCsv ? "text-indigo-600" : "text-slate-400"}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Drop a downloaded vendor CSV feed here, or choose Upload CSV.</p>
            <p className="text-xs text-slate-500">Manual import · up to 50 MB · updates the Vendor Catalog only; it does not create BigCommerce products.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="kole-mapping-brand">BigCommerce brand name</Label>
              <Input
                id="kole-mapping-brand"
                value={mappingBrandName ?? mappingBrandSetting?.brandName ?? "KCDS"}
                onChange={(event) => setMappingBrandName(event.target.value)}
                maxLength={100}
                placeholder="KCDS"
              />
            </div>
            <Button
              onClick={() => runSkuMapping.mutate(mappingBrandName ?? mappingBrandSetting?.brandName ?? "KCDS")}
              disabled={
                runSkuMapping.isPending
                || !String(mappingBrandName ?? mappingBrandSetting?.brandName ?? "KCDS").trim()
                || sync.isPending
                || uploadCsv.isPending
                || createDrafts.isPending
              }
            >
              {runSkuMapping.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Link2 className="h-4 w-4 mr-1.5" />}
              {runSkuMapping.isPending ? "Scanning and mapping…" : "Run SKU mapping"}
            </Button>
          </div>
          {mappingResult && (
            <div className="rounded-md bg-slate-50 px-3 py-2.5 text-xs text-slate-600 space-y-1">
              <p className="font-medium text-slate-700">
                Last run: {mappingResult.brandName} · {mappingResult.scanned.toLocaleString()} BigCommerce products scanned · {mappingResult.matched.toLocaleString()} unique SKU matches
              </p>
              <p>
                {mappingResult.mapped.toLocaleString()} linked · {mappingResult.remapped.toLocaleString()} remapped · {mappingResult.alreadyMapped.toLocaleString()} already current · {mappingResult.unmatched.toLocaleString()} unmatched · {mappingResult.ambiguous.toLocaleString()} ambiguous · {mappingResult.failed.toLocaleString()} failed · {(mappingResult.staleMappingsCleared ?? 0).toLocaleString()} deleted links cleared{mappingResult.staleMappingChecksFailed ? ` · ${mappingResult.staleMappingChecksFailed} old links could not be verified` : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Catalog products</p><p className="text-xl font-bold text-slate-800">{data?.total ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Feed source</p><p className="text-xl font-bold text-slate-800">CSV</p><p className="text-[10px] text-slate-400">Vendor inventory feed</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Current page</p><p className="text-xl font-bold text-slate-800">{page} / {totalPages}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Selected</p><p className="text-xl font-bold text-indigo-600">{selected.size}</p></CardContent></Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, title, or UPC…" className="pl-8 h-9" />
            </div>
             <Select value={category || "__all__"} onValueChange={(value) => { setCategory(value === "__all__" ? "" : value); setSubcategory(""); setPage(1); }}>
              <SelectTrigger className="h-9 w-full lg:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">All categories</SelectItem>{(data?.categories ?? []).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={subcategory || "__all__"} onValueChange={(value) => { setSubcategory(value === "__all__" ? "" : value); setPage(1); }}>
              <SelectTrigger className="h-9 w-full lg:w-44"><SelectValue placeholder="Subcategory" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">All subcategories</SelectItem>{(data?.subcategories ?? []).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status || "__all__"} onValueChange={(value) => { setStatus(value === "__all__" ? "" : value); setPage(1); }}>
              <SelectTrigger className="h-9 w-full lg:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">All statuses</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="queued">Queued</SelectItem><SelectItem value="mapped">Mapped</SelectItem><SelectItem value="unavailable">Unavailable</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button type="button" variant={stockOnly ? "default" : "outline"} size="sm" className="h-8" onClick={() => { setStockOnly((value) => !value); setPage(1); }}><Filter className="h-3.5 w-3.5 mr-1" />In stock</Button>
            <Button type="button" variant={closeoutOnly ? "default" : "outline"} size="sm" className="h-8" onClick={() => { setCloseoutOnly((value) => !value); setPage(1); }}>Closeout</Button>
            <Button type="button" variant={importedOnly ? "default" : "outline"} size="sm" className="h-8" onClick={() => { setImportedOnly((value) => !value); setPage(1); }}>Imported</Button>
            {(search || category || subcategory || stockOnly || closeoutOnly || importedOnly || status) && <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-500" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" />Clear filters</Button>}
            {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400 ml-auto" />}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm overflow-hidden">
        {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : error ? <div className="p-6 text-sm text-red-600">Unable to load the catalog: {toPublicVendorMessage((error as Error).message)}</div> : rows.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">No vendor products match these filters. Run Sync CSV Feed or upload a downloaded CSV to populate the catalog.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                 <th className="px-3 py-3 w-10">Select</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">SKU / UPC</th><th className="px-3 py-3">Extended cost</th><th className="px-3 py-3">Pack / tier</th><th className="px-3 py-3">Inventory</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((product) => {
                  const image = imageUrl(product.image_data);
                  return <tr key={product.id} className="hover:bg-slate-50/80 align-top">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(product.id)} disabled={Boolean(product.bigcommerce_product_id)} onChange={() => toggleProductSelected(product)} aria-label={`Select ${product.title}`} /></td>
                    <td className="px-3 py-3 min-w-[240px]"><div className="flex gap-3">{image ? <img src={image} alt="" className="h-12 w-12 rounded border border-slate-200 object-contain bg-white" /> : <div className="h-12 w-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center"><Package className="h-5 w-5 text-slate-300" /></div>}<div className="min-w-0"><p className="font-medium text-slate-800 line-clamp-2">{product.title}</p><p className="text-xs text-slate-500 mt-1">{product.brand || "Unbranded"}{product.vendor_category ? ` · ${product.vendor_category}` : ""}</p>{product.is_closeout && <Badge className="mt-1 bg-orange-100 text-orange-700 border-0 text-[10px]">Closeout</Badge>}</div></div></td>
                    <td className="px-3 py-3 whitespace-nowrap"><p className="font-mono text-xs text-slate-700">{product.vendor_sku}</p><p className="text-xs text-slate-400 mt-1">{product.upc || "No UPC"}</p></td>
                    <td className="px-3 py-3 font-medium whitespace-nowrap">{formatCost(extendedSupplierCost(product)?.toFixed(2) ?? null)}</td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{packLabel(product)}</td>
                    <td className="px-3 py-3 font-medium whitespace-nowrap">{inventoryLabel(product)}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={product.status} /></td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDetail(product)}><Eye className="h-3.5 w-3.5 mr-1" />View Details</Button>{product.status !== "queued" && !product.bigcommerce_product_id && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => updateStatus.mutate({ id: product.id, nextStatus: "queued" })}><Plus className="h-3.5 w-3.5 mr-1" />Queue</Button>}</div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3 py-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>{data?.total ?? 0} product{data?.total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2"><Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button><span>Page {page} of {totalPages}</span><Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="h-4 w-4" /></Button></div>
        </div>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && <><DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-indigo-600" />{detail.title}</DialogTitle><DialogDescription>Vendor product details for SKU {detail.vendor_sku}. Creating a BigCommerce draft requires an entered retail price.</DialogDescription></DialogHeader><div className="space-y-5">
            <div className="flex flex-wrap gap-2"><StatusBadge status={detail.status} />{detail.is_closeout && <Badge className="bg-orange-100 text-orange-700 border-0">Closeout</Badge>}{detail.bigcommerce_product_id ? <><Badge className="bg-blue-100 text-blue-700 border-0">Mapped to BC #{detail.bigcommerce_product_id}</Badge>{detail.bigcommerce_variant_id != null && <Badge className="bg-indigo-100 text-indigo-700 border-0">Variant ID #{detail.bigcommerce_variant_id}</Badge>}</> : <Badge className="bg-slate-100 text-slate-600 border-0">Not mapped</Badge>}</div>
            {detail.image_data?.length > 0 && <div className="flex gap-2 overflow-x-auto">{detail.image_data.slice(0, 8).map((_, index) => { const src = imageUrl([detail.image_data[index]]); return src ? <img key={index} src={src} alt="" className="h-24 w-24 object-contain border rounded bg-white" /> : null; })}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"><div><p className="text-xs text-slate-500">SKU</p><p className="font-mono">{detail.vendor_sku}</p></div><div><p className="text-xs text-slate-500">UPC</p><p>{detail.upc || "—"}</p></div><div><p className="text-xs text-slate-500">Brand</p><p>{detail.brand || "—"}</p></div><div><p className="text-xs text-slate-500">Extended cost (MOQ included)</p><p>{formatCost(extendedSupplierCost(detail)?.toFixed(2) ?? null)}</p></div><div><p className="text-xs text-slate-500">Inventory</p><p>{inventoryLabel(detail)}</p></div><div><p className="text-xs text-slate-500">Pack / minimum</p><p>{packLabel(detail)}</p></div><div><p className="text-xs text-slate-500">Category</p><p>{detail.vendor_category || "—"}</p></div><div><p className="text-xs text-slate-500">Subcategory</p><p>{detail.vendor_subcategory || "—"}</p></div><div><p className="text-xs text-slate-500">Weight</p><p>{String((detail.raw_data as any)?.item_weight || (detail.raw_data as any)?.weight || "—")}</p></div></div>
            {detail.description && <div><p className="text-xs font-medium text-slate-500 mb-1">Description</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p></div>}
            <div className="flex flex-wrap gap-2">{!detail.bigcommerce_product_id && <Button onClick={() => openDraftDialog([detail])}><Plus className="h-4 w-4 mr-1.5" />Create BigCommerce Draft</Button>}<Button variant="outline" onClick={() => updateStatus.mutate({ id: detail.id, nextStatus: "queued" })} disabled={detail.status === "queued" || Boolean(detail.bigcommerce_product_id)}><Plus className="h-4 w-4 mr-1.5" />Add to Import Queue</Button><Button variant="ghost" onClick={() => setDetail(null)}>Close</Button></div>
          </div></>}
        </DialogContent>
      </Dialog>

      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create hidden BigCommerce drafts</DialogTitle>
            <DialogDescription>
              Drafts stay hidden and disabled. Photos are added later through Product Sync → Image Sync so the first upload is watermarked. The suggested price is the supplier ext_price × 1.20; ext_price already includes the minimum order quantity. You can edit the price. Choose an existing BigCommerce category for each item. Existing SKU matches are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <Label htmlFor="bulk-draft-category" className="text-xs">Apply one BigCommerce category to all selected products</Label>
              <Select
                value={bulkDraftCategoryId || "__choose__"}
                onValueChange={(value) => {
                  const nextCategoryId = value === "__choose__" ? "" : value;
                  setBulkDraftCategoryId(nextCategoryId);
                  setDraftCategoryIds(Object.fromEntries(draftProducts.map((product) => [product.id, nextCategoryId])));
                }}
                disabled={createDrafts.isPending || isLoadingBcCategories || Boolean(bcCategoriesError) || !bcCategoryOptions.length}
              >
                <SelectTrigger id="bulk-draft-category" className="h-9 bg-white">
                  <SelectValue placeholder="Choose a category for all selected items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__choose__">Choose a category for all items</SelectItem>
                  {bcCategoryOptions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {isLoadingBcCategories && <p className="text-xs text-slate-500">Loading BigCommerce categories…</p>}
              {bcCategoriesError && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-red-600">
                  <span>Could not load BigCommerce categories: {toPublicVendorMessage((bcCategoriesError as Error).message)}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => refetchBcCategories()} disabled={isLoadingBcCategories}>Retry</Button>
                </div>
              )}
              {!isLoadingBcCategories && !bcCategoriesError && !bcCategoryOptions.length && (
                <p className="text-xs text-red-600">No visible BigCommerce categories are available. Draft creation is disabled until categories can be loaded.</p>
              )}
              <p className="text-xs text-slate-500">You can override the category for individual products below.</p>
            </div>
            <div className="space-y-3">
              {draftProducts.map((product) => {
                const quantity = minimumQuantity(product);
                return (
                  <div key={product.id} className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-3 rounded-md border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 line-clamp-2">{product.title}</p>
                      <p className="text-xs font-mono text-slate-500 mt-1">{product.vendor_sku}</p>
                      <p className="text-xs text-slate-500 mt-1">Extended supplier cost (MOQ included): {formatCost(extendedSupplierCost(product)?.toFixed(2) ?? null)} · Minimum order quantity: {quantity === null ? "Not provided" : quantity.toLocaleString()}</p>
                      <p className="text-xs text-slate-500 mt-1">Inventory: {inventoryLabel(product)}</p>
                      {!suggestedRetailPrice(product) && <p className="text-xs text-amber-700 mt-1">A positive ext_price is needed for an automatic price; enter the price manually.</p>}
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`draft-category-${product.id}`} className="text-xs">BigCommerce category</Label>
                        <Select
                          value={draftCategoryIds[product.id] || "__choose__"}
                          onValueChange={(value) => {
                            setDraftCategoryIds((current) => ({ ...current, [product.id]: value === "__choose__" ? "" : value }));
                            setBulkDraftCategoryId("");
                          }}
                          disabled={createDrafts.isPending || isLoadingBcCategories || Boolean(bcCategoriesError) || !bcCategoryOptions.length}
                        >
                          <SelectTrigger id={`draft-category-${product.id}`} className="h-9">
                            <SelectValue placeholder="Choose category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__choose__">Choose category</SelectItem>
                            {bcCategoryOptions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`draft-price-${product.id}`} className="text-xs">Selling price</Label>
                        <Input
                          id={`draft-price-${product.id}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          value={draftPrices[product.id] ?? ""}
                          onChange={(event) => setDraftPrices((current) => ({ ...current, [product.id]: event.target.value }))}
                          placeholder="Enter price"
                          disabled={createDrafts.isPending}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDraftDialogOpen(false)} disabled={createDrafts.isPending}>Cancel</Button>
            <Button onClick={submitDrafts} disabled={createDrafts.isPending || !draftPricesValid || !draftCategoriesValid || !bcCategoryOptions.length}>
              {createDrafts.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create {draftProducts.length} Draft{draftProducts.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}