import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Pencil, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { updateProduct360Variant } from "@/lib/api";

type VariantRow = Record<string, any>;
type VariantDraft = { label: string; sku: string; price: string; cost_price: string; stock: string };

type Props = {
  productId: number;
  rows: VariantRow[];
  tab: string;
  canEdit: boolean;
  inventoryTracking: string;
  imageErrors: Record<number, string>;
  deletingVariantIds: Set<number>;
  uploadingVariantIds: Set<number>;
  onDeleteImage: (variantId: number, label: string) => void;
  onUploadImage: (variantId: number, file?: File) => void;
};

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount)
    : "—";
}

function number(value: unknown, digits = 0) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(amount)
    : "—";
}

function variantStatus(row: VariantRow) {
  const days = Number(row.days_of_stock);
  const velocity = Number(row.sales_velocity);
  if (!velocity) return "No Sales Data";
  if (days <= 7) return "Urgent";
  if (days <= 14) return "Restock Soon";
  if (days >= 90) return "Overstock";
  return "Healthy";
}

function VariantStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Urgent: "bg-red-50 text-red-700 border-red-200",
    "Restock Soon": "bg-amber-50 text-amber-700 border-amber-200",
    Healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Overstock: "bg-violet-50 text-violet-700 border-violet-200",
    "No Sales Data": "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={`inline-flex max-w-full whitespace-normal items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>{status}</span>;
}

export default function Product360VariantTable({
  productId,
  rows,
  tab,
  canEdit,
  inventoryTracking,
  imageErrors,
  deletingVariantIds,
  uploadingVariantIds,
  onDeleteImage,
  onUploadImage,
}: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<VariantDraft | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [editErrors, setEditErrors] = useState<Record<number, string>>({});
  const canEditStock = inventoryTracking.toLowerCase() === "variant";
  const showingVariantTab = tab === "variants";

  const startEditing = (row: VariantRow) => {
    const variantId = Number(row.variant_id);
    setEditErrors((current) => ({ ...current, [variantId]: "" }));
    setEditingId(variantId);
    setDraft({
      label: String(row.label || ""),
      sku: String(row.sku || ""),
      price: String(row.price ?? ""),
      cost_price: row.cost_price == null ? "" : String(row.cost_price),
      stock: String(row.current_stock ?? 0),
    });
  };

  const stopEditing = () => {
    setEditingId(null);
    setDraft(null);
  };

  const save = async (row: VariantRow) => {
    if (!draft) return;
    const variantId = Number(row.variant_id);
    const changes: Record<string, string | number | null> = {};
    const currentLabel = String(row.label || "");
    const currentSku = String(row.sku || "");
    const currentPrice = Number(row.price);
    const currentCost = row.cost_price == null ? null : Number(row.cost_price);
    const currentStock = Number(row.current_stock ?? 0);
    const price = Number(draft.price);
    const stock = Number(draft.stock);
    const cost = draft.cost_price.trim() === "" ? null : Number(draft.cost_price);
    const label = draft.label.trim();
    const sku = draft.sku.trim();

    if (!label) return setEditErrors((current) => ({ ...current, [variantId]: "Variant name is required." }));
    if (!Number.isFinite(price) || price < 0) return setEditErrors((current) => ({ ...current, [variantId]: "Enter a valid price." }));
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return setEditErrors((current) => ({ ...current, [variantId]: "Enter a valid cost or leave it blank." }));
    if (!Number.isInteger(stock) || stock < 0) return setEditErrors((current) => ({ ...current, [variantId]: "Stock must be a whole number of zero or more." }));

    if (label !== currentLabel) {
      if (Number(row.option_value_count) !== 1) {
        return setEditErrors((current) => ({ ...current, [variantId]: "Only single-option variant names can be changed here." }));
      }
      changes.label = label;
    }
    if (sku !== currentSku) changes.sku = sku;
    if (!Number.isFinite(currentPrice) || Math.abs(price - currentPrice) > 0.000001) changes.price = price;
    if (cost !== currentCost) changes.cost_price = cost;
    if (canEditStock && stock !== currentStock) changes.inventory_level = stock;

    if (Object.keys(changes).length === 0) {
      stopEditing();
      return;
    }

    setSavingId(variantId);
    setEditErrors((current) => ({ ...current, [variantId]: "" }));
    try {
      await updateProduct360Variant(productId, variantId, changes);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product-360-detail", productId] }),
        queryClient.invalidateQueries({ queryKey: ["product-360-products"] }),
        queryClient.invalidateQueries({ queryKey: ["product-360-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["product-360-history", productId] }),
      ]);
      toast({ title: "Variant saved", description: "Changes were confirmed by BigCommerce." });
      stopEditing();
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: ["product-360-detail", productId] });
      const message = error instanceof Error ? error.message : "Could not save this variant.";
      setEditErrors((current) => ({ ...current, [variantId]: message }));
      toast({ title: "Could not save variant", description: message, variant: "destructive" });
      stopEditing();
    } finally {
      setSavingId(null);
    }
  };

  const editInput = (
    field: keyof VariantDraft,
    label: string,
    type: "text" | "number",
    className: string,
    options: { step?: string; min?: string; disabled?: boolean } = {},
  ) => (
    <Input
      aria-label={label}
      type={type}
      value={draft?.[field] ?? ""}
      onChange={(event) => setDraft((current) => current ? { ...current, [field]: event.target.value } : current)}
      onKeyDown={(event) => {
        if (event.key === "Escape") stopEditing();
        if (event.key === "Enter") {
          const row = rows.find((item) => Number(item.variant_id) === editingId);
          if (row) void save(row);
        }
      }}
      disabled={options.disabled || savingId === editingId}
      step={options.step}
      min={options.min}
      className={`h-8 ${className}`}
    />
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Variant</th>
            <th className="px-3 py-3">SKU</th>
            <th className="px-3 py-3 text-right">Price</th>
            <th className="px-3 py-3 text-right">Cost</th>
            <th className="px-3 py-3 text-right">Stock</th>
            <th className="px-3 py-3 text-right" title="Calculated from sales history; not stored as a product field">Units</th>
            <th className="px-3 py-3 text-right">Velocity</th>
            <th className="px-3 py-3">Status</th>
            {showingVariantTab && canEdit && <th className="px-3 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => {
            const variantId = Number(row.variant_id);
            const editing = editingId === variantId && draft !== null;
            const label = String(row.label || "Base product");
            const busy = savingId === variantId;
            return (
              <tr key={`${variantId}-${i}`}>
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-3">
                    {showingVariantTab && (
                      row.image_url ? canEdit ? (
                        <div className="w-[76px] shrink-0">
                          {imageErrors[variantId] && <p role="alert" className="mb-1 max-w-[76px] text-[9px] leading-tight text-red-600">{imageErrors[variantId]}</p>}
                          <div className="group relative h-12 w-12">
                            <img src={String(row.image_url)} alt={`${label} thumbnail`} className="h-12 w-12 rounded border border-slate-200 bg-white object-contain" />
                            <button
                              type="button"
                              disabled={deletingVariantIds.has(variantId) || uploadingVariantIds.has(variantId)}
                              aria-label={`Delete image for ${label}`}
                              title="Delete variant image"
                              onClick={(event) => { event.stopPropagation(); onDeleteImage(variantId, label); }}
                              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 opacity-0 shadow-sm transition-opacity hover:bg-red-50 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-wait disabled:opacity-60"
                            >
                              {deletingVariantIds.has(variantId) ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      ) : <img src={String(row.image_url)} alt={`${label} thumbnail`} className="h-12 w-12 shrink-0 rounded border border-slate-200 bg-white object-contain" />
                        : canEdit ? (
                          <div className="w-[76px] shrink-0">
                            {imageErrors[variantId] && <p role="alert" className="mb-1 max-w-[76px] text-[9px] leading-tight text-red-600">{imageErrors[variantId]}</p>}
                            <label
                              onDragOver={(event) => { event.preventDefault(); setDraggingId(variantId); }}
                              onDragLeave={() => setDraggingId(null)}
                              onDrop={(event) => { event.preventDefault(); setDraggingId(null); onUploadImage(variantId, event.dataTransfer.files[0]); }}
                              className={`flex h-12 w-14 cursor-pointer flex-col items-center justify-center rounded border border-dashed text-center transition-colors ${draggingId === variantId ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"} ${uploadingVariantIds.has(variantId) ? "pointer-events-none opacity-60" : ""}`}
                            >
                              <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingVariantIds.has(variantId)} aria-label={`Upload thumbnail for ${label}`} onChange={(event) => { if (event.target.files?.[0]) onUploadImage(variantId, event.target.files[0]); event.target.value = ""; }} />
                              {uploadingVariantIds.has(variantId) ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" /> : <><ImagePlus className="h-3.5 w-3.5 text-slate-400" /><span className="mt-0.5 text-[8px] text-slate-500">Drop / add</span></>}
                            </label>
                          </div>
                        ) : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50"><ImagePlus className="h-5 w-5 text-slate-400" /></div>
                    )}
                    <div className="min-w-[110px]">
                      {editing
                        ? editInput("label", `Name for ${label}`, "text", "min-w-[110px]", { disabled: Number(row.option_value_count) !== 1 })
                        : <span>{label}</span>}
                      {editing && Number(row.option_value_count) !== 1 && <p className="mt-1 text-[9px] font-normal text-slate-400">Multi-option names are read-only.</p>}
                      {editErrors[variantId] && <p role="alert" className="mt-1 max-w-56 text-[10px] font-normal leading-tight text-red-600">{editErrors[variantId]}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-500">{editing ? editInput("sku", `SKU for ${label}`, "text", "min-w-[110px]") : String(row.sku || "—")}</td>
                <td className="px-3 py-3 text-right">{editing ? editInput("price", `Price for ${label}`, "number", "ml-auto w-24 text-right", { min: "0", step: "0.01" }) : money(row.price)}</td>
                <td className="px-3 py-3 text-right">{editing ? editInput("cost_price", `Cost for ${label}`, "number", "ml-auto w-24 text-right", { min: "0", step: "0.01" }) : row.cost_price == null ? <span className="text-xs text-slate-400">No cost data</span> : money(row.cost_price)}</td>
                <td className="px-3 py-3 text-right">
                  {editing
                    ? <div title={canEditStock ? "" : "BigCommerce inventory is not tracked by variant"}>{editInput("stock", `Stock for ${label}`, "number", "ml-auto w-20 text-right", { min: "0", step: "1", disabled: !canEditStock })}</div>
                    : number(row.current_stock)}
                </td>
                <td className="px-3 py-3 text-right" title="Calculated from sales history; this cannot be edited or synced as a product field">{number(row.units_sold)}</td>
                <td className="px-3 py-3 text-right">{number(row.sales_velocity, 1)}/day</td>
                <td className="px-3 py-3"><VariantStatusBadge status={variantStatus(row)} /></td>
                {showingVariantTab && canEdit && (
                  <td className="px-3 py-3 text-right">
                    {editing ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" disabled={busy} onClick={() => void save(row)} aria-label={`Save ${label}`} title="Save to BigCommerce">
                          {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <><Save className="mr-1 h-3.5 w-3.5" />Save</>}
                        </Button>
                        <Button variant="outline" size="sm" disabled={busy} onClick={stopEditing} aria-label={`Cancel editing ${label}`}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" disabled={editingId !== null || savingId !== null} onClick={() => startEditing(row)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {showingVariantTab && canEdit && (
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          Variant names, SKU, price, cost, and variant-tracked stock save to BigCommerce. Units sold are calculated from sales history and are read-only.
          {!canEditStock && " Stock edits are unavailable because inventory is not tracked by variant."}
        </p>
      )}
    </div>
  );
}
