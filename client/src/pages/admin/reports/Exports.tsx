import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Filter, Loader2, Package, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAuthHeaders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTimeService } from "@/hooks/useTimeService";

interface CatalogOption {
  id: number;
  name: string;
  parent_id?: number;
}

interface ExportRow {
  product_id: number;
  product_title: string;
  brand: string;
  categories: string;
  variant: string;
  sku: string;
  quantity: number | null;
  cost: number | null;
  price: number | null;
}

interface ExportOptionsResponse {
  brands: CatalogOption[];
  categories: CatalogOption[];
}

interface ExportProductsResponse {
  rows: ExportRow[];
  fetchedAt: string;
}

function csvValue(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "" : value.toFixed(2);
}

function MultiCheckboxPicker({
  label,
  options,
  selected,
  onChange,
  testId,
}: {
  label: string;
  options: CatalogOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? options.filter((option) => option.name.toLowerCase().includes(query)) : options;
  }, [options, search]);

  const toggle = (id: number) => {
    onChange(selectedSet.has(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  };

  const selectVisible = () => {
    onChange([...new Set([...selected, ...filtered.map((option) => option.id)])]);
  };

  const clear = () => onChange([]);
  const buttonLabel = selected.length === 0
    ? `All ${label}`
    : selected.length === 1
      ? options.find((option) => option.id === selected[0])?.name ?? `1 ${label.toLowerCase()}`
      : `${selected.length} ${label.toLowerCase()} selected`;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 min-w-[190px] justify-between gap-2 bg-white text-left text-sm font-normal"
            data-testid={testId}
          >
            <span className="truncate">{buttonLabel}</span>
            <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                data-testid={`${testId}-search`}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <button type="button" className="font-medium text-blue-600 hover:text-blue-700" onClick={selectVisible}>
                Select visible
              </button>
              <button type="button" className="text-slate-500 hover:text-slate-700" onClick={clear}>
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-5 text-center text-xs text-slate-400">No matches found.</p>
            ) : (
              filtered.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <Checkbox
                    checked={selectedSet.has(option.id)}
                    onCheckedChange={() => toggle(option.id)}
                    data-testid={`${testId}-option-${option.id}`}
                  />
                  <span className="truncate">{option.name}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function ExportsPage() {
  const fmt = useTimeService();
  const { toast } = useToast();
  const [selectedBrandIds, setSelectedBrandIds] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [requestKey, setRequestKey] = useState(0);

  const optionsQuery = useQuery<ExportOptionsResponse>({
    queryKey: ["report-exports-options"],
    queryFn: async () => {
      const response = await fetch("/api/reports/exports/options", { headers: getAuthHeaders() });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not load BigCommerce filters");
      return response.json();
    },
    staleTime: 0,
  });

  const productsQuery = useQuery<ExportProductsResponse>({
    queryKey: ["report-exports-products", selectedBrandIds, selectedCategoryIds, requestKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBrandIds.length) params.set("brandIds", selectedBrandIds.join(","));
      if (selectedCategoryIds.length) params.set("categoryIds", selectedCategoryIds.join(","));
      const response = await fetch(`/api/reports/exports/products?${params.toString()}`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not load BigCommerce products");
      return response.json();
    },
    enabled: requestKey > 0,
  });

  const options = optionsQuery.data ?? { brands: [], categories: [] };
  const rows = productsQuery.data?.rows ?? [];

  const clearFilters = () => {
    setSelectedBrandIds([]);
    setSelectedCategoryIds([]);
    setRequestKey(0);
  };

  const handleExport = (format: "csv" | "xls") => {
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "Load products before exporting.", variant: "destructive" });
      return;
    }

    const headers = ["Product Title", "Brand", "Categories", "Variant", "SKU", "Quantity / Stock Available", "Cost", "Price"];
    const values = rows.map((row) => [
      row.product_title,
      row.brand,
      row.categories,
      row.variant,
      row.sku,
      row.quantity ?? "",
      formatMoney(row.cost),
      formatMoney(row.price),
    ]);
    const filename = `bigcommerce-product-export-${fmt.dateOnly()}`;
    let blob: Blob;
    if (format === "csv") {
      const csv = [headers, ...values].map((row) => row.map(csvValue).join(",")).join("\r\n");
      blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    } else {
      const table = [
        "<table><thead><tr>",
        headers.map((header) => `<th>${escapeHtml(header)}</th>`).join(""),
        "</tr></thead><tbody>",
        values.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join(""),
        "</tbody></table>",
      ].join("");
      blob = new Blob([`<html><head><meta charset="utf-8"></head><body>${table}</body></html>`], { type: "application/vnd.ms-excel" });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filterCount = selectedBrandIds.length + selectedCategoryIds.length;

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-0.5 text-xs text-slate-400">Reporting › Exports</p>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
              <Package className="h-5 w-5 text-blue-600" />
              Product Exports
            </h1>
          </div>
          {rows.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleExport("csv")} data-testid="button-export-csv">
                <FileText className="h-4 w-4" /> CSV
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => handleExport("xls")} data-testid="button-export-excel">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Choose products</h2>
            </div>
            {filterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-slate-500" onClick={clearFilters} data-testid="button-clear-export-filters">
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <MultiCheckboxPicker label="Categories" options={options.categories} selected={selectedCategoryIds} onChange={setSelectedCategoryIds} testId="select-export-categories" />
            <MultiCheckboxPicker label="Brands" options={options.brands} selected={selectedBrandIds} onChange={setSelectedBrandIds} testId="select-export-brands" />
            <Button className="h-9 gap-1.5" onClick={() => setRequestKey((value) => value + 1)} disabled={optionsQuery.isLoading || productsQuery.isFetching} data-testid="button-load-export-products">
              {productsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {productsQuery.isFetching ? "Loading live products…" : "Load live products"}
            </Button>
          </div>
          {optionsQuery.isLoading && <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live categories and brands…</p>}
          {optionsQuery.isError && <p className="mt-3 text-sm text-red-600">{(optionsQuery.error as Error).message}</p>}
        </section>

        {productsQuery.isError && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {(productsQuery.error as Error).message}
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Export preview</h2>
              {requestKey !== 0 && <p className="text-xs text-slate-500">
                {`${rows.length.toLocaleString()} variant row${rows.length === 1 ? "" : "s"} loaded`}
                {productsQuery.data?.fetchedAt ? ` · Updated ${fmt.time(productsQuery.data.fetchedAt)}` : ""}
              </p>}
            </div>
            {rows.length > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Ready to export</span>}
          </div>
          {productsQuery.isFetching ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Fetching live BigCommerce catalog…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <Download className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No products loaded</p>
              <p className="mt-1 max-w-md text-xs text-slate-400">Use the filters above and load products to preview the export rows.</p>
            </div>
          ) : (
            <div className="max-h-[calc(100vh-360px)] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Product Title", "Brand", "Categories", "Variant", "SKU", "Quantity / Stock", "Cost", "Price"].map((header) => <th key={header} className="whitespace-nowrap px-4 py-3 font-semibold">{header}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, index) => (
                    <tr key={`${row.product_id}-${row.sku}-${index}`} className="hover:bg-slate-50">
                      <td className="max-w-[240px] px-4 py-3 font-medium text-slate-800">{row.product_title}</td>
                      <td className="px-4 py-3 text-slate-600">{row.brand || "—"}</td>
                      <td className="max-w-[220px] px-4 py-3 text-slate-500">{row.categories || "—"}</td>
                      <td className="max-w-[220px] px-4 py-3 text-slate-600">{row.variant || "Default"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.sku || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.quantity ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatMoney(row.cost) || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{formatMoney(row.price) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}