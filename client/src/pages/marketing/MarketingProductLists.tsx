import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  addMarketingProductListItems,
  createMarketingProductList,
  deleteMarketingProductList,
  removeMarketingProductListItem,
  getMarketingProductList,
  getMarketingProductLists,
  searchMarketingProducts,
  updateMarketingProductList,
} from "@/lib/api";
import { PageShell } from "./Marketing";

type ProductListSummary = {
  id: number;
  name: string;
  description?: string;
  item_count?: number;
};

type ProductListProduct = {
  id: number;
  name: string;
  sku?: string;
  price?: string;
  image?: string;
  stock_level?: number;
  variants?: any[];
};

export default function MarketingProductLists() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: lists = [], isLoading: listsLoading } = useQuery<ProductListSummary[]>({
    queryKey: ["marketing-product-lists", search],
    queryFn: () => getMarketingProductLists(search),
  });
  const { data: selectedList, isLoading: listLoading } = useQuery<any>({
    queryKey: ["marketing-product-list", selectedListId],
    queryFn: () => getMarketingProductList(selectedListId!),
    enabled: Boolean(selectedListId),
  });
  const { data: productResults = [], isFetching: productsLoading } = useQuery<ProductListProduct[]>({
    queryKey: ["marketing-product-list-search", productSearch],
    queryFn: () => searchMarketingProducts(productSearch.trim()),
    enabled: productSearch.trim().length >= 2,
  });

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ["marketing-product-lists"] });
    if (selectedListId) queryClient.invalidateQueries({ queryKey: ["marketing-product-list", selectedListId] });
  };
  const createMutation = useMutation({
    mutationFn: () => createMarketingProductList({ name, description }),
    onSuccess: (created: ProductListSummary) => {
      setCreateOpen(false);
      setName("");
      setDescription("");
      refreshLists();
      setSelectedListId(created.id);
      toast({ title: "Product list created" });
    },
    onError: (error: any) => toast({ title: "Unable to create product list", description: error.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) => updateMarketingProductList(selectedListId!, data),
    onSuccess: () => {
      refreshLists();
      toast({ title: "Product list updated" });
    },
    onError: (error: any) => toast({ title: "Unable to update product list", description: error.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteMarketingProductList(selectedListId!),
    onSuccess: () => {
      setSelectedListId(null);
      refreshLists();
      toast({ title: "Product list deleted" });
    },
    onError: (error: any) => toast({ title: "Unable to delete product list", description: error.message, variant: "destructive" }),
  });
  const addMutation = useMutation({
    mutationFn: (product: ProductListProduct) => addMarketingProductListItems(selectedListId!, [product]),
    onSuccess: () => {
      refreshLists();
      toast({ title: "Product added to list" });
    },
    onError: (error: any) => toast({ title: "Unable to add product", description: error.message, variant: "destructive" }),
  });
  const removeMutation = useMutation({
    mutationFn: (itemId: number) => removeMarketingProductListItem(selectedListId!, itemId),
    onSuccess: refreshLists,
    onError: (error: any) => toast({ title: "Unable to remove product", description: error.message, variant: "destructive" }),
  });

  return (
    <PageShell
      title="Product Lists"
      subtitle="Create reusable product collections for Campaigns and Order Forms."
      action={<Button variant="outline" onClick={() => setLocation("/marketing")}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>}
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="min-w-0 rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Package className="h-4 w-4 text-blue-500" /> Collections</h2>
            <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New</Button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search product lists…" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          {listsLoading ? <div className="flex items-center justify-center p-8 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading lists…</div> :
            lists.length ? <div className="space-y-1">{lists.map(list => <button key={list.id} type="button" onClick={() => setSelectedListId(list.id)} className={`w-full rounded-lg border p-3 text-left transition ${selectedListId === list.id ? "border-blue-300 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}>
              <span className="block truncate text-sm font-medium text-slate-800">{list.name}</span>
              <span className="mt-1 block text-xs text-slate-500">{list.item_count ?? 0} product{list.item_count === 1 ? "" : "s"}</span>
            </button>)}</div> :
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-400">No product lists yet.</p>}
        </section>

        <section className="min-w-0 rounded-xl border bg-white p-5 shadow-sm">
          {!selectedListId ? <div className="flex min-h-64 flex-col items-center justify-center text-center text-slate-400"><Package className="mb-3 h-9 w-9 text-slate-300" /><p className="text-sm">Select a product list to manage its products.</p></div> :
            listLoading || !selectedList ? <div className="flex min-h-64 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading product list…</div> :
            <ProductListEditor
              key={selectedList.id}
              list={selectedList}
              productSearch={productSearch}
              setProductSearch={setProductSearch}
              productResults={productResults}
              productsLoading={productsLoading}
              onAdd={product => addMutation.mutate(product)}
              onRemove={itemId => removeMutation.mutate(itemId)}
              adding={addMutation.isPending}
              removing={removeMutation.isPending}
              onSave={(data) => updateMutation.mutate(data)}
              saving={updateMutation.isPending}
              onDelete={() => { if (window.confirm(`Delete "${selectedList.name}"?`)) deleteMutation.mutate(); }}
              deleting={deleteMutation.isPending}
            />}
        </section>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New product list</DialogTitle><DialogDescription>Create a reusable collection that can be loaded into a Campaign or Order Form.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">List name<Input className="mt-1.5" value={name} onChange={event => setName(event.target.value)} placeholder="Non-Nicotine Vape 2026" /></label>
            <label className="block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span><textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" value={description} onChange={event => setDescription(event.target.value)} placeholder="Products to feature in the 2026 non-nicotine campaign." /></label>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>{createMutation.isPending ? "Creating…" : "Create list"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function ProductListEditor({
  list, productSearch, setProductSearch, productResults, productsLoading, onAdd, onRemove, adding, removing, onSave, saving, onDelete, deleting,
}: {
  list: any;
  productSearch: string;
  setProductSearch: (value: string) => void;
  productResults: ProductListProduct[];
  productsLoading: boolean;
  onAdd: (product: ProductListProduct) => void;
  onRemove: (itemId: number) => void;
  adding: boolean;
  removing: boolean;
  onSave: (data: { name?: string; description?: string }) => void;
  saving: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description || "");
  const existingIds = new Set((list.items || []).map((item: any) => Number(item.product_id)));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="truncate text-lg font-semibold text-slate-900">{list.name}</h2><p className="mt-1 text-sm text-slate-500">{list.items?.length ?? 0} product{list.items?.length === 1 ? "" : "s"}</p></div>
      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={onDelete} disabled={deleting}><Trash2 className="mr-1.5 h-4 w-4" /> Delete list</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="text-sm font-medium text-slate-700">Description<textarea className="mt-1.5 h-10 w-full rounded-md border border-slate-200 p-2 text-sm outline-none focus:border-blue-400" value={description} onChange={event => setDescription(event.target.value)} /></label>
    </div>
    <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => onSave({ name, description })} disabled={!name.trim() || saving}><Check className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save details"}</Button></div>
    <div className="border-t pt-5">
      <h3 className="font-semibold text-slate-900">Add products</h3>
      <p className="mt-1 text-xs text-slate-500">Search BigCommerce by product title or SKU, then add products to this reusable list.</p>
      <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search product title or SKU…" value={productSearch} onChange={event => setProductSearch(event.target.value)} /></div>
      {productSearch.trim().length >= 2 && <div className="mt-3 max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
        {productsLoading ? <div className="flex items-center justify-center p-6 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching products…</div> :
          productResults.length ? productResults.map(product => <button key={product.id} type="button" onClick={() => onAdd(product)} disabled={existingIds.has(Number(product.id)) || adding} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:opacity-60">
            {product.image ? <img src={product.image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"><Package className="h-4 w-4" /></span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{product.name}</span><span className="block truncate text-xs text-slate-500">{product.sku || "No SKU"}</span></span>
            {existingIds.has(Number(product.id)) ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <Plus className="h-4 w-4 shrink-0 text-blue-600" />}
          </button>) : <p className="p-5 text-center text-sm text-slate-400">No products found.</p>}
      </div>}
    </div>
    <div>
      <h3 className="mb-2 font-semibold text-slate-900">Products in this list</h3>
      {list.items?.length ? <div className="divide-y rounded-lg border">{list.items.map((item: any) => {
        const product = item.product_snapshot || {};
        return <div key={item.id} className="flex min-w-0 items-center gap-3 p-3">
          {product.image ? <img src={product.image} alt="" className="h-11 w-11 shrink-0 rounded object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"><Package className="h-5 w-5" /></span>}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{product.name || `Product ${item.product_id}`}</p><p className="truncate text-xs text-slate-500">{product.sku || "No SKU"}{product.price ? ` · $${Number(product.price).toFixed(2)}` : ""}</p></div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600" onClick={() => onRemove(item.id)} disabled={removing} aria-label={`Remove ${product.name || "product"}`}><X className="h-4 w-4" /></Button>
        </div>;
      })}</div> : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-400">No products in this list yet.</p>}
    </div>
  </div>;
}