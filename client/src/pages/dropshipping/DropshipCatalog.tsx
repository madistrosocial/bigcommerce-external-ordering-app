import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Filter, Loader2, Package, Plus, RefreshCw, Search, X } from "lucide-react";

const PAGE_SIZE = 25;

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

function statusLabel(status: string) {
  return status === "queued" ? "Import queued" : status === "mapped" ? "Mapped" : status === "unavailable" ? "Unavailable" : status === "error" ? "Error" : "Available";
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "queued" ? "bg-amber-100 text-amber-700" : status === "mapped" ? "bg-blue-100 text-blue-700" : status === "unavailable" ? "bg-slate-100 text-slate-600" : status === "error" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700";
  return <Badge className={`${cls} border-0 text-[11px]`}>{statusLabel(status)}</Badge>;
}

export default function DropshipCatalogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: connection } = useQuery({ queryKey: ["dropship-connection"], queryFn: api.getKoleConnection });
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
  const [detail, setDetail] = useState<api.DropshipProduct | null>(null);
  const displayName = connection?.displayName || "Vendor Catalog";

  const params = useMemo(() => ({ page, limit: PAGE_SIZE, search: appliedSearch, category, subcategory, inStock: stockOnly, closeout: closeoutOnly, imported: importedOnly, status }), [page, appliedSearch, category, subcategory, stockOnly, closeoutOnly, importedOnly, status]);
  const { data, isLoading, isFetching, error } = useQuery({ queryKey: ["dropship-products", params], queryFn: () => api.getKoleProducts(params) });

  const sync = useMutation({
    mutationFn: api.syncKoleCatalog,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      queryClient.invalidateQueries({ queryKey: ["dropship-sync-logs"] });
      toast({ title: "Catalog sync completed", description: `${result.productsProcessed} products processed · ${result.productsCreated} new · ${result.productsUpdated} updated` });
    },
    onError: (mutationError: any) => toast({ title: "Catalog sync failed", description: mutationError.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, nextStatus }: { id: number; nextStatus: string }) => api.updateKoleProductStatus(id, nextStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      toast({ title: "Import status updated" });
    },
    onError: (mutationError: any) => toast({ title: "Status update failed", description: mutationError.message, variant: "destructive" }),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setAppliedSearch(search.trim()); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const rows = data?.rows ?? [];
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / PAGE_SIZE), 1);
  const toggleSelected = (id: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const queueSelected = () => {
    for (const id of selected) updateStatus.mutate({ id, nextStatus: "queued" });
    setSelected(new Set());
  };
  const clearFilters = () => {
    setSearch(""); setAppliedSearch(""); setCategory(""); setSubcategory(""); setStockOnly(false); setCloseoutOnly(false); setImportedOnly(false); setStatus(""); setPage(1);
  };

  return (
    <div className="px-4 md:px-6 py-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package className="h-5 w-5 text-indigo-600" /> Product Catalog</h1>
          <p className="text-sm text-slate-500 mt-1">{displayName} products stored in SalesCore. Selecting or queueing a product does not create a BigCommerce product.</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && <Button variant="outline" size="sm" onClick={queueSelected} disabled={updateStatus.isPending}><Plus className="h-4 w-4 mr-1.5" />Queue {selected.size}</Button>}
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw className={`h-4 w-4 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />Sync Catalog</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Catalog products</p><p className="text-xl font-bold text-slate-800">{data?.total ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Page size</p><p className="text-xl font-bold text-slate-800">25</p><p className="text-[10px] text-slate-400">Vendor API limit</p></CardContent></Card>
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
            <Select value={category || "__all__"} onValueChange={(value) => { setCategory(value === "__all__" ? "" : value); setPage(1); }}>
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
        {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : error ? <div className="p-6 text-sm text-red-600">Unable to load the catalog: {(error as Error).message}</div> : rows.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">No vendor products match these filters. Run Sync Catalog after connecting {displayName}.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 w-10">Select</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">SKU / UPC</th><th className="px-3 py-3">Cost</th><th className="px-3 py-3">Pack / tier</th><th className="px-3 py-3">Inventory</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((product) => {
                  const image = imageUrl(product.image_data);
                  return <tr key={product.id} className="hover:bg-slate-50/80 align-top">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} aria-label={`Select ${product.title}`} /></td>
                    <td className="px-3 py-3 min-w-[240px]"><div className="flex gap-3">{image ? <img src={image} alt="" className="h-12 w-12 rounded border border-slate-200 object-contain bg-white" /> : <div className="h-12 w-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center"><Package className="h-5 w-5 text-slate-300" /></div>}<div className="min-w-0"><p className="font-medium text-slate-800 line-clamp-2">{product.title}</p><p className="text-xs text-slate-500 mt-1">{product.brand || "Unbranded"}{product.vendor_category ? ` · ${product.vendor_category}` : ""}</p>{product.is_closeout && <Badge className="mt-1 bg-orange-100 text-orange-700 border-0 text-[10px]">Closeout</Badge>}</div></div></td>
                    <td className="px-3 py-3 whitespace-nowrap"><p className="font-mono text-xs text-slate-700">{product.vendor_sku}</p><p className="text-xs text-slate-400 mt-1">{product.upc || "No UPC"}</p></td>
                    <td className="px-3 py-3 font-medium whitespace-nowrap">{formatCost(product.cost)}</td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{product.tier_data?.length ? `${product.tier_data.length} tier${product.tier_data.length === 1 ? "" : "s"}` : "—"}</td>
                    <td className="px-3 py-3 font-medium whitespace-nowrap">{product.inventory.toLocaleString()}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={product.status} /></td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDetail(product)}><Eye className="h-3.5 w-3.5 mr-1" />View Details</Button><Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDetail(product)}>Review Mapping</Button>{product.status !== "queued" && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => updateStatus.mutate({ id: product.id, nextStatus: "queued" })}><Plus className="h-3.5 w-3.5 mr-1" />Queue</Button>}</div></td>
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
          {detail && <><DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-indigo-600" />{detail.title}</DialogTitle></DialogHeader><div className="space-y-5">
            <div className="flex flex-wrap gap-2"><StatusBadge status={detail.status} />{detail.is_closeout && <Badge className="bg-orange-100 text-orange-700 border-0">Closeout</Badge>}{detail.bigcommerce_product_id ? <Badge className="bg-blue-100 text-blue-700 border-0">Mapped to BC #{detail.bigcommerce_product_id}</Badge> : <Badge className="bg-slate-100 text-slate-600 border-0">Not mapped</Badge>}</div>
            {detail.image_data?.length > 0 && <div className="flex gap-2 overflow-x-auto">{detail.image_data.slice(0, 8).map((_, index) => { const src = imageUrl([detail.image_data[index]]); return src ? <img key={index} src={src} alt="" className="h-24 w-24 object-contain border rounded bg-white" /> : null; })}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"><div><p className="text-xs text-slate-500">SKU</p><p className="font-mono">{detail.vendor_sku}</p></div><div><p className="text-xs text-slate-500">UPC</p><p>{detail.upc || "—"}</p></div><div><p className="text-xs text-slate-500">Brand</p><p>{detail.brand || "—"}</p></div><div><p className="text-xs text-slate-500">Cost</p><p>{formatCost(detail.cost)}</p></div><div><p className="text-xs text-slate-500">Inventory</p><p>{detail.inventory.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Category</p><p>{detail.vendor_category || "—"}</p></div><div><p className="text-xs text-slate-500">Subcategory</p><p>{detail.vendor_subcategory || "—"}</p></div><div><p className="text-xs text-slate-500">Weight</p><p>{String((detail.raw_data as any)?.weight || "—")}</p></div></div>
            {detail.description && <div><p className="text-xs font-medium text-slate-500 mb-1">Description</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p></div>}
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => updateStatus.mutate({ id: detail.id, nextStatus: "queued" })} disabled={detail.status === "queued"}><Plus className="h-4 w-4 mr-1.5" />Add to Import Queue</Button><Button variant="ghost" onClick={() => setDetail(null)}>Close</Button></div>
          </div></>}
        </DialogContent>
      </Dialog>
    </div>
  );
}