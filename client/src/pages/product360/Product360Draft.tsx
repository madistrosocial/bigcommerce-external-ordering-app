import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, UploadCloud, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createProduct360Draft, getProduct360CreateOptions, getProduct360Draft, saveProduct360Draft, syncProduct360Draft, type Product360Draft } from "@/lib/api";

const emptyProduct = {
  name: "", skuPrefix: "", description: "", type: "physical", price: "", cost_price: "", retail_price: "", sale_price: "",
  brand_id: "", categories: [], is_visible: true, availability: "available", condition: "New", warranty: "",
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
  useEffect(() => { if (query.data?.data) setData({ ...emptyProduct, ...query.data.data, variants: query.data.data.variants || [] }); }, [query.data]);
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
  if (!isNew && query.isLoading) return <div className="p-6 text-sm text-slate-500">Loading product draft…</div>;
  if (!isNew && query.isError) return <div className="p-6 text-sm text-red-700">{query.error.message}</div>;
  if (!isNew && query.data?.status === "synced") return <div className="p-6 text-sm">This product is already synced. <button className="text-blue-700 underline" onClick={() => setLocation("/product-360/products")}>Return to Products</button></div>;
  const gridFields = productFields;
  const requiredComplete = !!data.name.trim() && !!data.skuPrefix.trim() && data.price !== "";
  return <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><button onClick={() => setLocation("/product-360/products")} className="mb-2 flex items-center gap-1 text-xs text-slate-500"><ArrowLeft className="h-4 w-4" /> Products workspace</button><h1 className="text-xl font-bold text-slate-900">Create BigCommerce product</h1><p className="text-xs text-slate-500">Enter product details in one row, then add variant rows. Save a draft before syncing.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-2 h-4 w-4" />Save draft</Button><Button onClick={() => { setError(""); sync.mutate(); }} disabled={!requiredComplete || sync.isPending}><UploadCloud className="mr-2 h-4 w-4" />{sync.isPending ? "Syncing…" : "Sync to BigCommerce"}</Button></div></div>
    {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</Card>}
    {query.data?.error && <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Previous sync attempt: {query.data.error}</Card>}
    <Card className="overflow-hidden border-slate-200 bg-white p-4"><h2 className="mb-2 text-sm font-semibold">Product details — one spreadsheet row</h2><p className="mb-3 text-xs text-slate-500">Scroll horizontally to reach every field. Name, Base SKU, and Price are required to sync.</p><div className="overflow-x-auto"><table className="border-collapse text-left text-xs"><thead><tr>{gridFields.map(([key,label])=><th key={key} className="min-w-36 border bg-slate-50 p-2 font-semibold text-slate-600">{label}</th>)}</tr></thead><tbody><tr>{gridFields.map(([key,label])=><td key={key} className="border p-1">{key==="type" ? <select aria-label={label} className="h-9 w-full rounded border px-2" value={data[key]} onChange={e=>setField(key,e.target.value)}><option value="physical">Physical</option><option value="digital">Digital</option></select> : key==="availability" ? <select aria-label={label} className="h-9 w-full rounded border px-2" value={data[key]} onChange={e=>setField(key,e.target.value)}><option value="available">Available</option><option value="disabled">Disabled</option><option value="preorder">Preorder</option></select> : key==="brand_id" ? <select aria-label={label} className="h-9 min-w-40 rounded border px-2" value={data[key]} onChange={e=>setField(key,e.target.value)}><option value="">No brand</option>{(options.data?.brands||[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select> : key==="categories" ? <select aria-label={label} multiple size={3} className="min-w-48 rounded border p-1" value={(data.categories||[]).map(String)} onChange={e=>setField(key,Array.from(e.target.selectedOptions).map(o=>o.value))}>{(options.data?.categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select> : key==="is_visible" ? <input aria-label={label} type="checkbox" checked={!!data[key]} onChange={e=>setField(key,e.target.checked)} /> : <Input aria-label={label} className="h-9 min-w-36 text-xs" value={Array.isArray(data[key])?data[key].join(","):data[key] ?? ""} onChange={e=>setField(key,e.target.value)} />}</td>)}</tr></tbody></table></div></Card>
    <Card className="overflow-hidden border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Variants</h2><p className="text-xs text-slate-500">Enter a matching shorthand for each variant. SKU is generated as BASE-SHORTNAME. Price and cost inherit from the product unless overridden.</p></div><Button size="sm" variant="outline" onClick={addVariant}><Plus className="mr-1 h-4 w-4" />Add variant row</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-xs"><thead><tr>{["Variant name","SKU shorthand","Generated SKU","Price","Cost","Stock","Weight","Width","Height","Depth","UPC",""].map(x=><th key={x} className="border bg-slate-50 p-2 text-left">{x}</th>)}</tr></thead><tbody>{data.variants.map((v:any,i:number)=><tr key={i}>{["name","shorthand"].map(k=><td key={k} className="border p-1"><Input className="h-8 text-xs" value={v[k]} onChange={e=>updateVariant(i,k,e.target.value)} /></td>)}<td className="border bg-slate-50 p-2 font-mono">{data.skuPrefix && v.shorthand ? `${data.skuPrefix}-${v.shorthand}`.toUpperCase() : "—"}</td>{["price","cost_price","inventory_level","weight","width","height","depth","upc"].map(k=><td key={k} className="border p-1"><Input className="h-8 min-w-20 text-xs" value={k==="price"?(v.price==null||v.price===""?data.price:v.price):k==="cost_price"?(v.cost_price==null||v.cost_price===""?data.cost_price:v.cost_price):v[k]||""} onChange={e=>updateVariant(i,k,e.target.value)} /></td>)}<td className="border p-1"><button aria-label="Remove variant" onClick={()=>setField("variants",data.variants.filter((_:any,j:number)=>j!==i))} className="text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div></Card>
  </div>;
}
