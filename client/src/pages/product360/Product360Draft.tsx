import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Plus, Save, UploadCloud, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import RichTextEditor from "@/components/editor/RichTextEditor";
import { createProduct360Draft, getProduct360CreateOptions, getProduct360Draft, saveProduct360Draft, syncProduct360Draft, type Product360Draft } from "@/lib/api";

const emptyProduct = {
  name: "", skuPrefix: "", description: "", type: "physical", price: "", cost_price: "", retail_price: "", sale_price: "",
  brand_id: "", brand_name: "", categories: [], is_visible: true, availability: "available", condition: "New", warranty: "",
  weight: "", width: "", height: "", depth: "", sort_order: "0", search_keywords: "", custom_url: "",
  page_title: "", meta_description: "", meta_keywords: "", image_url: "",
  variants: [] as Array<Record<string, string>>,
};
const productFields: Array<[string, string, string?]> = [
  ["name","Name"],["skuPrefix","Base SKU"],["type","Type"],["price","Price"],["cost_price","Cost"],["retail_price","Retail"],["sale_price","Sale"],
  ["brand_id","Brand"],["categories","Categories"],["availability","Availability"],["condition","Condition"],["is_visible","Visible"],
  ["weight","Weight"],["width","Width"],["height","Height"],["depth","Depth"],["sort_order","Sort order"],["warranty","Warranty"],
  ["search_keywords","Search keywords"],["custom_url","Custom URL"],["page_title","Page title"],["meta_description","Meta description"],["meta_keywords","Meta keywords"],["image_url","Primary image URL"],
  ["description","Description"],
];

export default function Product360DraftPage() {
  const [, params] = useRoute("/product-360/products/drafts/:draftId");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isNew = params?.draftId === "new";
  const id = Number(params?.draftId);
  const query = useQuery({ queryKey: ["product-360-draft", id], queryFn: () => getProduct360Draft(id), enabled: !isNew && Number.isSafeInteger(id) && id > 0 });
  const options = useQuery({ queryKey: ["product-360-create-options"], queryFn: getProduct360CreateOptions });
  const [data, setData] = useState<any>(emptyProduct);
  const [error, setError] = useState("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<number>>(new Set());
  const categories = options.data?.categories || [];
  const brandInputValue = data.brand_name || options.data?.brands.find((brand) => String(brand.id) === String(data.brand_id))?.name || "";
  const categoryChildren = useMemo(() => {
    const children = new Map<number, typeof categories>();
    for (const category of categories) children.set(category.parent_id || 0, [...(children.get(category.parent_id || 0) || []), category]);
    return children;
  }, [categories]);
  const matchingCategoryIds = useMemo(() => {
    const search = categorySearch.trim().toLowerCase();
    if (!search) return null;
    const visible = new Set<number>();
    for (const category of categories) {
      if (!category.name.toLowerCase().includes(search)) continue;
      let current: typeof category | undefined = category;
      while (current && !visible.has(current.id)) {
        visible.add(current.id);
        current = categories.find((item) => item.id === current?.parent_id);
      }
    }
    return visible;
  }, [categories, categorySearch]);
  useEffect(() => { if (query.data?.data) setData({ ...emptyProduct, ...query.data.data, variants: query.data.data.variants || [] }); }, [query.data]);
  useEffect(() => {
    if (!categories.length) return;
    const expanded = new Set(openCategoryIds);
    for (const selectedId of (data.categories || []).map(Number)) {
      let current = categories.find((category) => category.id === selectedId);
      while (current?.parent_id) {
        expanded.add(current.parent_id);
        current = categories.find((category) => category.id === current?.parent_id);
      }
    }
    setOpenCategoryIds(expanded);
  }, [categories, data.categories]);
  const save = useMutation({
    mutationFn: () => isNew ? createProduct360Draft(data) : saveProduct360Draft(id, data),
    onSuccess: async (draft: Product360Draft) => {
      await queryClient.invalidateQueries({ queryKey: ["product-360-drafts"] });
      if (isNew) setLocation(`/product-360/products/drafts/${draft.id}`);
      else await queryClient.invalidateQueries({ queryKey: ["product-360-draft", id] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const sync = useMutation({
    mutationFn: async () => { if (isNew) { const draft = await createProduct360Draft(data); setLocation(`/product-360/products/drafts/${draft.id}`); return syncProduct360Draft(draft.id); } return syncProduct360Draft(id); },
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["product-360-drafts"] }); await queryClient.invalidateQueries({ queryKey: ["product-360-products"] }); setLocation(`/product-360/products`); },
    onError: (e: Error) => setError(e.message),
  });
  const setField = (key: string, value: unknown) => { setData((d: any) => ({ ...d, [key]: value })); setError(""); };
  const addVariant = () => setField("variants", [...data.variants, { name: "", shorthand: "", price: "", cost_price: "", inventory_level: "0", weight: "", width: "", height: "", depth: "", upc: "" }]);
  const updateVariant = (index: number, key: string, value: string) => setField("variants", data.variants.map((v: any, i: number) => i === index ? { ...v, [key]: value } : v));
  const categoryNode = (category: typeof categories[number], depth = 0): React.ReactNode => {
    if (matchingCategoryIds && !matchingCategoryIds.has(category.id)) return null;
    const children = (categoryChildren.get(category.id) || []).filter((item) => !matchingCategoryIds || matchingCategoryIds.has(item.id));
    const expanded = !!matchingCategoryIds || openCategoryIds.has(category.id);
    const selectedIds = (data.categories || []).map(Number);
    return <div key={category.id}>
      <div className="flex items-center gap-1 rounded py-1.5 pr-2 hover:bg-slate-50" style={{ paddingLeft: 8 + depth * 18 }}>
        {children.length ? <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${category.name}`} onClick={() => setOpenCategoryIds((current) => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })} className="rounded p-0.5 text-slate-400 hover:bg-slate-200"><ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} /></button> : <span className="w-5" />}
        <Checkbox checked={selectedIds.includes(category.id)} onCheckedChange={(checked) => setField("categories", checked ? [...new Set([...selectedIds, category.id])] : selectedIds.filter((id: number) => id !== category.id))} />
        <span className="text-xs text-slate-700">{category.name}</span>
      </div>
      {expanded && children.map((child) => categoryNode(child, depth + 1))}
    </div>;
  };
  if (!isNew && query.isLoading) return <div className="p-6 text-sm text-slate-500">Loading product draft…</div>;
  if (!isNew && query.isError) return <div className="p-6 text-sm text-red-700">{query.error.message}</div>;
  if (!isNew && query.data?.status === "synced") return <div className="p-6 text-sm">This product is already synced. <button className="text-blue-700 underline" onClick={() => setLocation("/product-360/products")}>Return to Products</button></div>;
  const gridFields = productFields.filter(([key]) => key !== "description");
  const requiredComplete = !!data.name.trim() && !!data.skuPrefix.trim() && data.price !== "";
  return <div className="w-full min-w-0 space-y-4 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><button onClick={() => setLocation("/product-360/products")} className="mb-2 flex items-center gap-1 text-xs text-slate-500"><ArrowLeft className="h-4 w-4" /> Products workspace</button><h1 className="text-xl font-bold text-slate-900">Create BigCommerce product</h1></div><div className="flex gap-2"><Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-2 h-4 w-4" />Save draft</Button><Button onClick={() => { setError(""); sync.mutate(); }} disabled={!requiredComplete || sync.isPending}><UploadCloud className="mr-2 h-4 w-4" />{sync.isPending ? "Syncing…" : "Sync to BigCommerce"}</Button></div></div>
    {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</Card>}
    {query.data?.error && <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Previous sync attempt: {query.data.error}</Card>}
     <Card className="overflow-hidden border-slate-200 bg-white p-4"><h2 className="mb-2 text-sm font-semibold">Product details</h2><div className="overflow-x-auto"><table className="border-collapse text-left text-xs"><thead><tr>{gridFields.map(([key,label])=><th key={key} className="min-w-36 border bg-slate-50 p-2 font-semibold text-slate-600">{label}</th>)}</tr></thead><tbody><tr>{gridFields.map(([key,label])=><td key={key} className="border p-1">{key==="type" ? <select aria-label={label} className="h-9 w-full rounded border px-2" value={data[key]} onChange={e=>setField(key,e.target.value)}><option value="physical">Physical</option><option value="digital">Digital</option></select> : key==="availability" ? <select aria-label={label} className="h-9 w-full rounded border px-2" value={data[key]} onChange={e=>setField(key,e.target.value)}><option value="available">Available</option><option value="disabled">Disabled</option><option value="preorder">Preorder</option></select> : key==="brand_id" ? <><Input aria-label={label} className="h-9 min-w-40" list="product-360-brand-options" placeholder="No brand or enter a brand" value={brandInputValue} onChange={(event) => { const brandName = event.target.value; const existing = options.data?.brands.find((brand) => brand.name.trim().toLocaleLowerCase() === brandName.trim().toLocaleLowerCase()); setData((current: any) => ({ ...current, brand_name: brandName, brand_id: existing ? String(existing.id) : "" })); setError(""); }} /><datalist id="product-360-brand-options"><option value="">No brand</option>{(options.data?.brands || []).map((brand) => <option key={brand.id} value={brand.name} />)}</datalist></> : key==="categories" ? <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" aria-label="Categories" className="h-9 w-full min-w-48 justify-between text-xs font-normal"><span className="truncate">{(data.categories||[]).length ? `${(data.categories||[]).length} selected` : "Select categories"}</span><ChevronRight className="ml-2 h-3.5 w-3.5 rotate-90 shrink-0 text-slate-400" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-800">Assigned categories</h3><p className="mt-1 text-xs text-slate-500">{(data.categories||[]).length} selected</p></div><Input className="h-8 w-full sm:max-w-[190px]" placeholder="Search categories" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} /></div><p className="mt-2 text-[10px] text-slate-500">Expand a category to browse its subcategories.</p><div className="mt-2 max-h-[min(24rem,60vh)] overflow-y-auto rounded-md border border-slate-200 py-2">{categories.filter((category) => !categories.some((parent) => parent.id === category.parent_id)).map((category) => categoryNode(category))}</div></PopoverContent></Popover> : key==="is_visible" ? <input aria-label={label} type="checkbox" checked={!!data[key]} onChange={e=>setField(key,e.target.checked)} /> : <Input aria-label={label} className="h-9 min-w-36 text-xs" value={Array.isArray(data[key])?data[key].join(","):data[key] ?? ""} onChange={e=>setField(key,e.target.value)} />}</td>)}</tr></tbody></table></div></Card>
     <Card className="border-slate-200 bg-white p-4"><label className="mb-2 block text-sm font-semibold" htmlFor="new-product-description-editor">Description</label><RichTextEditor id="new-product-description-editor" value={String(data.description || "")} onChange={(html) => setField("description", html)} minHeight={180} /></Card>
    <Card className="overflow-hidden border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Variants</h2><Button size="sm" variant="outline" onClick={addVariant}><Plus className="mr-1 h-4 w-4" />Add variant row</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-xs"><thead><tr>{["Variant name","SKU shorthand","Generated SKU","Price","Cost","Stock","Weight","Width","Height","Depth","UPC",""].map(x=><th key={x} className="border bg-slate-50 p-2 text-left">{x}</th>)}</tr></thead><tbody>{data.variants.map((v:any,i:number)=><tr key={i}>{["name","shorthand"].map(k=><td key={k} className="border p-1"><Input className="h-8 text-xs" value={v[k]} onChange={e=>updateVariant(i,k,e.target.value)} /></td>)}<td className="border bg-slate-50 p-2 font-mono">{data.skuPrefix && v.shorthand ? `${data.skuPrefix}-${v.shorthand}`.toUpperCase() : "—"}</td>{["price","cost_price","inventory_level","weight","width","height","depth","upc"].map(k=><td key={k} className="border p-1"><Input className="h-8 min-w-20 text-xs" value={k==="price"?(v.price==null||v.price===""?data.price:v.price):k==="cost_price"?(v.cost_price==null||v.cost_price===""?data.cost_price:v.cost_price):v[k]||""} onChange={e=>updateVariant(i,k,e.target.value)} /></td>)}<td className="border p-1"><button aria-label="Remove variant" onClick={()=>setField("variants",data.variants.filter((_:any,j:number)=>j!==i))} className="text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div></Card>
  </div>;
}
