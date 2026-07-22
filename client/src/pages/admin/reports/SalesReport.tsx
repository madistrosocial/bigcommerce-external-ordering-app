import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, ChevronDown, ChevronUp, Download, Search, X,
  Loader2, FileSpreadsheet, FileText, BarChart3, Settings2,
  Package, ChevronRight, CheckSquare, Square, AlertCircle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getAuthHeaders } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brand { id: number; name: string; }
interface Category { id: number; name: string; parent_id?: number; }
interface ProductOption { id: number; bigcommerce_id: number; name: string; sku: string; brand_name?: string; }
interface TreeNode extends Category { children: TreeNode[]; }

// ─── Category tree helpers ─────────────────────────────────────────────────

function buildCategoryTree(cats: Category[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  cats.forEach(c => map.set(c.id, { ...c, children: [] }));
  const roots: TreeNode[] = [];
  cats.forEach(c => {
    const node = map.get(c.id)!;
    if (c.parent_id && c.parent_id !== 0 && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sort = (ns: TreeNode[]) => { ns.sort((a, b) => a.name.localeCompare(b.name)); ns.forEach(n => sort(n.children)); };
  sort(roots);
  return roots;
}

function getAllDescendantIds(node: TreeNode): number[] {
  return [node.id, ...node.children.flatMap(getAllDescendantIds)];
}

// ─── CategoryTreePicker ────────────────────────────────────────────────────

function CategoryTreePicker({ categories, selectedIds, onChange }: {
  categories: Category[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const sel = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const isAll = (node: TreeNode) => getAllDescendantIds(node).every(id => sel.has(id));
  const isSome = (node: TreeNode) => {
    if (!node.children.length) return false;
    const ids = getAllDescendantIds(node);
    return ids.some(id => sel.has(id)) && !ids.every(id => sel.has(id));
  };

  const toggle = (node: TreeNode) => {
    const ids = getAllDescendantIds(node);
    if (isAll(node)) onChange(selectedIds.filter(id => !ids.includes(id)));
    else onChange([...new Set([...selectedIds, ...ids])]);
  };

  const toggleExp = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const label = selectedIds.length === 0
    ? "All Categories"
    : selectedIds.length === 1
      ? (categories.find(c => c.id === selectedIds[0])?.name ?? "1 selected")
      : `${selectedIds.length} categories`;

  const CheckBox = ({ checked, partial }: { checked: boolean; partial?: boolean }) => (
    <div className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? "bg-blue-600 border-blue-600" : partial ? "bg-blue-50 border-blue-400" : "border-slate-300 bg-white"}`}>
      {checked && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {!checked && partial && <div className="w-2 h-0.5 bg-blue-500 rounded" />}
    </div>
  );

  const renderNode = (node: TreeNode, depth = 0): React.ReactNode => {
    const allSel = isAll(node);
    const someSel = isSome(node);
    const isOpen = expanded.has(node.id);
    const hasKids = node.children.length > 0;
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1.5 py-1.5 pr-2 hover:bg-slate-50 cursor-pointer rounded-sm select-none"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => toggle(node)}
        >
          <button
            className={`shrink-0 text-slate-400 hover:text-slate-700 transition-colors w-4 h-4 flex items-center justify-center ${!hasKids ? "invisible" : ""}`}
            onClick={e => toggleExp(node.id, e)}
          >
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          <CheckBox checked={allSel} partial={someSel} />
          <span className="text-sm text-slate-700 truncate flex-1">{node.name}</span>
          {hasKids && <span className="text-xs text-slate-400 shrink-0 ml-1">({node.children.length})</span>}
        </div>
        {isOpen && hasKids && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div ref={ref} className="relative" onMouseDown={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm bg-white hover:border-slate-300 transition-colors min-w-[160px] max-w-[200px] focus:outline-none ${selectedIds.length > 0 ? "border-blue-400 text-blue-700" : "border-slate-200 text-slate-700"}`}
        data-testid="button-category-picker"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto py-1">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none border-b border-slate-100 mb-1"
            onClick={() => onChange([])}
          >
            <div className="w-4 h-4 shrink-0" />
            <CheckBox checked={selectedIds.length === 0} />
            <span className="text-sm text-slate-700 font-medium">All Categories</span>
          </div>
          {tree.map(node => renderNode(node))}
        </div>
      )}
    </div>
  );
}

interface VariantRow {
  bc_product_id: number;
  product_name: string;
  brand_name: string;
  variant_id: number | null;
  variant_label: string | null;
  sku: string;
  qty_sold: number;
  current_stock: number;
}

interface ProductGroup {
  bc_product_id: number;
  product_name: string;
  brand_name: string;
  total_qty: number;
  total_stock: number;
  variants: VariantRow[];
}

interface DetailRow {
  bc_product_id: number;
  product_name: string;
  brand_name: string;
  variant_label: string | null;
  sku: string;
  order_number: number | null;
  display_order_number: string | null;
  customer_name: string | null;
  quantity: number;
  unit_price: string;
  order_date: string | null;
}

interface ReportParams {
  dateFrom: string;
  dateTo: string;
  brandId: string;
  categoryIds: number[];
  bcProductIds: number[];
  selectAll: boolean;
}

interface ReportStats {
  totalProducts: number;
  totalVariants: number;
  totalQtySold: number;
  totalCurrentStock: number;
  dateFrom?: string;
  dateTo?: string;
}

interface ExportLog {
  id: number;
  report_name: string;
  view_name: string;
  export_type: string;
  row_count: number;
  user_name: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return String(d); }
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(d); }
}

function toDisplayDate(iso: string): string {
  if (!iso) return "";
  const [y, m, day] = iso.split("-");
  return `${m}/${day}/${y}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy: string; sortDir: string }) {
  if (sortBy !== col) return <ChevronDown className="h-3.5 w-3.5 text-slate-300 inline ml-1" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-blue-500 inline ml-1" />
    : <ChevronDown className="h-3.5 w-3.5 text-blue-500 inline ml-1" />;
}

function EmptyState({ hasParams, noData }: { hasParams: boolean; noData?: boolean }) {
  if (!hasParams) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <BarChart3 className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-slate-500 font-medium">Configure your report filters above</p>
        <p className="text-slate-400 text-sm mt-1">Select a date range and products, then click Generate Report</p>
      </div>
    );
  }
  if (noData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <RefreshCw className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-slate-500 font-medium">No line items data — run Sync Order Line Items from CRM Settings first.</p>
        <p className="text-slate-400 text-sm mt-1">Go to Admin → CRM Settings → Sync Order Line Items and click Full Sync.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <Package className="h-12 w-12 text-slate-300 mb-4" />
      <p className="text-slate-500 font-medium">No data found</p>
      <p className="text-slate-400 text-sm mt-1">No orders matched the selected filters. Try expanding your date range.</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SalesReport() {
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Filter state (live editing) ──────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date(); d.setDate(0);
    return d.toISOString().slice(0, 10);
  });
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // ── Confirmed params (only update on "Generate Report") ────────────────
  const [reportParams, setReportParams] = useState<ReportParams | null>(null);
  const [generatingKey, setGeneratingKey] = useState(0);

  // ── Table state ──────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<"summary" | "details">("summary");
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState("qty_sold");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const close = () => { setShowSearchDropdown(false); setShowExportMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["report-bc-brands"],
    queryFn: async () => {
      const r = await fetch("/api/reports/bc-brands", { headers: getAuthHeaders() });
      return r.ok ? r.json() : [];
    },
    staleTime: 3600_000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["report-bc-categories"],
    queryFn: async () => {
      const r = await fetch("/api/reports/bc-categories", { headers: getAuthHeaders() });
      return r.ok ? r.json() : [];
    },
    staleTime: 3600_000,
  });

  const { data: searchResults = [] } = useQuery<ProductOption[]>({
    queryKey: ["report-product-search", productSearch],
    queryFn: async () => {
      if (!productSearch) return [];
      const r = await fetch(`/api/reports/product-search?q=${encodeURIComponent(productSearch)}`, { headers: getAuthHeaders() });
      return r.ok ? r.json() : [];
    },
    enabled: productSearch.length >= 1,
  });

  const buildQs = (extra: Record<string, string> = {}) => {
    if (!reportParams) return "";
    const p: Record<string, string> = { dateFrom: reportParams.dateFrom, dateTo: reportParams.dateTo, ...extra };
    if (reportParams.brandId) p.brandId = reportParams.brandId;
    if (reportParams.categoryIds.length > 0) p.categoryIds = reportParams.categoryIds.join(",");
    if (reportParams.bcProductIds.length > 0) p.bcProductIds = reportParams.bcProductIds.join(",");
    if (reportParams.selectAll) p.selectAll = "true";
    return new URLSearchParams(p).toString();
  };

  const { data: reportData, isLoading: loadingReport, isFetching, error: reportError } = useQuery<{ rows: any[]; total: number; noData?: boolean }>({
    queryKey: ["sales-report", reportParams, activeView, page, limit, sortBy, sortDir, generatingKey],
    queryFn: async () => {
      const qs = buildQs({ view: activeView, page: String(page), limit: String(limit), sortBy, sortDir });
      const r = await fetch(`/api/reports/sales?${qs}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: reportParams !== null,
    placeholderData: (prev) => prev,
  });

  const { data: stats, isLoading: loadingStats } = useQuery<ReportStats>({
    queryKey: ["sales-report-stats", reportParams, generatingKey],
    queryFn: async () => {
      const r = await fetch(`/api/reports/sales/stats?${buildQs()}`, { headers: getAuthHeaders() });
      return r.ok ? r.json() : null;
    },
    enabled: reportParams !== null,
  });

  const { data: recentExports = [], refetch: refetchExports } = useQuery<ExportLog[]>({
    queryKey: ["recent-report-exports"],
    queryFn: async () => {
      const r = await fetch("/api/reports/recent-exports?limit=5", { headers: getAuthHeaders() });
      return r.ok ? r.json() : [];
    },
    refetchInterval: 30_000,
  });

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleGenerate = () => {
    setReportParams({ dateFrom, dateTo, brandId: selectedBrandId, categoryIds: selectedCategoryIds, bcProductIds: selectedProducts.map(p => p.bigcommerce_id), selectAll });
    setPage(0);
    setExpandedProducts(new Set());
    setGeneratingKey(k => k + 1);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
    setPage(0);
  };

  const toggleExpanded = (id: number) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addProduct = (p: ProductOption) => {
    if (!selectedProducts.find(x => x.bigcommerce_id === p.bigcommerce_id)) setSelectedProducts(prev => [...prev, p]);
    setProductSearch("");
    setShowSearchDropdown(false);
  };

  const handleExport = async (type: "csv" | "excel") => {
    if (!reportParams) return;
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const qs = buildQs({ view: activeView, page: "0", limit: "10000", sortBy, sortDir });
      const r = await fetch(`/api/reports/sales?${qs}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Export failed");
      const data = await r.json();
      const rows: Record<string, unknown>[] = data.rows ?? [];

      const hdrs = activeView === "summary"
        ? ["Product", "Brand", "Variant", "SKU", "Qty Sold", "Current Stock"]
        : ["Product", "Brand", "Variant", "SKU", "Order #", "Customer", "Qty", "Unit Price", "Date"];
      const csvRows = activeView === "summary"
        ? rows.map(r => [r.product_name, r.brand_name, r.variant_label ?? "", r.sku, r.qty_sold, r.current_stock])
        : rows.map(r => [r.product_name, r.brand_name, r.variant_label ?? "", r.sku, r.display_order_number ?? r.order_number, r.customer_name, r.quantity, r.unit_price, fmtDate(String(r.order_date ?? ""))]);
      const csv = [hdrs, ...csvRows].map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sales-report-${activeView}-${reportParams.dateFrom}-${reportParams.dateTo}.${type === "excel" ? "xlsx" : "csv"}`;
      a.click();

      const user = JSON.parse(localStorage.getItem("user") || "{}");
      await fetch("/api/reports/export-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ user_id: user?.id ?? null, user_name: user?.name ?? user?.username ?? "", report_name: "Sales Report", view_name: activeView === "summary" ? "Summary" : "Order Details", filters: { dateFrom: reportParams.dateFrom, dateTo: reportParams.dateTo }, export_type: type === "excel" ? "excel" : "csv", row_count: rows.length }),
      });
      refetchExports();
    } catch (e) { console.error("Export error", e); }
    finally { setIsExporting(false); }
  };

  // ─── Derived ─────────────────────────────────────────────────────────────

  const summaryGroups = useMemo<ProductGroup[]>(() => {
    if (activeView !== "summary") return [];
    const rows = (reportData?.rows ?? []) as VariantRow[];
    const map = new Map<number, ProductGroup>();
    for (const row of rows) {
      let g = map.get(row.bc_product_id);
      if (!g) { g = { bc_product_id: row.bc_product_id, product_name: row.product_name, brand_name: row.brand_name, total_qty: 0, total_stock: 0, variants: [] }; map.set(row.bc_product_id, g); }
      g.total_qty += Number(row.qty_sold) || 0;
      g.total_stock += Number(row.current_stock) || 0;
      g.variants.push(row);
    }
    return Array.from(map.values());
  }, [reportData?.rows, activeView]);

  const detailRows = useMemo<DetailRow[]>(() => activeView !== "details" ? [] : (reportData?.rows ?? []) as DetailRow[], [reportData?.rows, activeView]);
  const total = reportData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const isLoading = loadingReport || isFetching;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-slate-50">

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Reports &rsaquo; Sales Report</p>
            <h1 className="text-2xl font-bold text-slate-800">Sales Report</h1>
            <p className="text-sm text-slate-500 mt-0.5">View product sales performance across all orders</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-slate-600">
            <Settings2 className="h-4 w-4" />
            Report Engine
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 gap-4 p-4 sm:p-6 min-h-0">

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex flex-wrap items-end gap-3">

              {/* Date Range */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Date Range</label>
                <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2.5 py-1.5 bg-white hover:border-slate-300 transition-colors">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border-0 p-0 text-sm text-slate-700 focus:ring-0 focus:outline-none bg-transparent w-28" data-testid="input-date-from" />
                  <span className="text-slate-400 text-sm">–</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border-0 p-0 text-sm text-slate-700 focus:ring-0 focus:outline-none bg-transparent w-28" data-testid="input-date-to" />
                </div>
              </div>

              {/* Brand */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Brand</label>
                <div className="relative">
                  <select value={selectedBrandId} onChange={e => setSelectedBrandId(e.target.value)} className="appearance-none border border-slate-200 rounded-md px-3 py-1.5 pr-8 text-sm text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer min-w-[140px]" data-testid="select-brand">
                    <option value="">All Brands</option>
                    {brands.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Category</label>
                <CategoryTreePicker
                  categories={categories}
                  selectedIds={selectedCategoryIds}
                  onChange={setSelectedCategoryIds}
                />
              </div>

              {/* Product Search */}
              <div className="flex flex-col gap-1 relative" onMouseDown={e => e.stopPropagation()}>
                <label className="text-xs font-medium text-slate-500">Product Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input ref={searchRef} value={productSearch} onChange={e => { setProductSearch(e.target.value); setShowSearchDropdown(true); }} onFocus={() => setShowSearchDropdown(true)} placeholder="Search products..." className="pl-8 h-8 text-sm w-44 border-slate-200" data-testid="input-product-search" />
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {searchResults.map(p => (
                        <button key={p.bigcommerce_id} onMouseDown={e => { e.preventDefault(); addProduct(p); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex flex-col border-b border-slate-100 last:border-0" data-testid={`option-product-${p.bigcommerce_id}`}>
                          <span className="font-medium text-slate-800 truncate">{p.name}</span>
                          <span className="text-xs text-slate-400">{p.sku}{p.brand_name ? ` · ${p.brand_name}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showSearchDropdown && productSearch.length >= 1 && searchResults.length === 0 && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 px-3 py-2 text-sm text-slate-400">No products found</div>
                  )}
                </div>
              </div>

              {/* Select All */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Products</label>
                <button onClick={() => { setSelectAll(s => !s); if (!selectAll) setSelectedProducts([]); }} className={`flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-sm transition-colors ${selectAll ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`} data-testid="button-select-all">
                  {selectAll ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  {selectAll ? "All Products" : "Select All"}
                </button>
              </div>

              <div className="flex-1" />

              {/* Export dropdown */}
              <div className="flex flex-col gap-1 relative" onMouseDown={e => e.stopPropagation()}>
                <label className="text-xs font-medium text-slate-500 invisible">Export</label>
                <Button variant="outline" size="sm" onClick={() => setShowExportMenu(v => !v)} disabled={!reportParams || isExporting} className="gap-1.5 h-8 border-slate-300 text-slate-700 hover:bg-slate-50" data-testid="button-export">
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Export
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>
                {showExportMenu && (
                  <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                    <button onMouseDown={e => { e.preventDefault(); handleExport("excel"); }} className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-slate-50 text-sm text-slate-700 border-b border-slate-100" data-testid="button-export-excel">
                      <FileSpreadsheet className="h-4 w-4 text-green-600" /> Export to Excel
                    </button>
                    <button onMouseDown={e => { e.preventDefault(); handleExport("csv"); }} className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-slate-50 text-sm text-slate-700" data-testid="button-export-csv">
                      <FileText className="h-4 w-4 text-green-600" /> Export to CSV
                    </button>
                  </div>
                )}
              </div>

              {/* Generate Report */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 invisible">Generate</label>
                <Button onClick={handleGenerate} disabled={isLoading} size="sm" className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-generate-report">
                  {isLoading && reportParams ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Generate Report
                </Button>
              </div>
            </div>

            {/* Product chips */}
            {selectedProducts.length > 0 && !selectAll && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-500 self-center">Selected:</span>
                {selectedProducts.map(p => (
                  <span key={p.bigcommerce_id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-100" data-testid={`chip-product-${p.bigcommerce_id}`}>
                    <span className="font-medium truncate max-w-[180px]">{p.name}</span>
                    <button onClick={() => setSelectedProducts(prev => prev.filter(x => x.bigcommerce_id !== p.bigcommerce_id))} className="hover:text-blue-900" data-testid={`remove-product-${p.bigcommerce_id}`}><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
                <button onClick={() => setSelectedProducts([])} className="text-xs text-slate-400 hover:text-slate-600 ml-1" data-testid="button-clear-products">Clear all</button>
              </div>
            )}
          </div>

          {/* Info bar */}
          {reportParams && !isLoading && stats && !loadingStats && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 flex items-center justify-between text-sm">
              <span className="text-blue-600">Showing {activeView === "summary" ? "summary by Product and Variant" : "order details by line item"}</span>
              <span className="text-blue-700 font-medium">{fmtNum(stats.totalProducts)} Products &bull; {fmtNum(stats.totalVariants)} Variants</span>
            </div>
          )}

          {/* Table card */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">

            {/* Tabs */}
            <div className="border-b border-slate-200 px-4">
              <div className="flex">
                {(["summary", "details"] as const).map(v => (
                  <button key={v} onClick={() => { setActiveView(v); setPage(0); }} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${activeView === v ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`} data-testid={`tab-${v}`}>
                    {v === "summary" ? "Summary" : "Order Details"}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Generating report…</span>
              </div>
            ) : reportError ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-red-500">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Error loading report.</span>
                </div>
                {reportError instanceof Error && reportError.message && (
                  <p className="text-xs text-red-400 max-w-lg text-center font-mono bg-red-50 rounded p-2 border border-red-200">
                    {reportError.message}
                  </p>
                )}
              </div>
            ) : activeView === "summary" ? (
              summaryGroups.length === 0 ? <EmptyState hasParams={!!reportParams} noData={reportData?.noData} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 font-medium text-slate-600 w-1/3"><button onClick={() => handleSort("product_name")} className="flex items-center hover:text-slate-800">Product <SortIcon col="product_name" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("variant_label")} className="flex items-center hover:text-slate-800">Variant <SortIcon col="variant_label" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("sku")} className="flex items-center hover:text-slate-800">SKU <SortIcon col="sku" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-right px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("qty_sold")} className="flex items-center justify-end ml-auto hover:text-slate-800">Qty Sold <SortIcon col="qty_sold" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-right px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("current_stock")} className="flex items-center justify-end ml-auto hover:text-slate-800">Current Stock <SortIcon col="current_stock" sortBy={sortBy} sortDir={sortDir} /></button></th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryGroups.map(group => {
                        const isExpanded = !expandedProducts.has(group.bc_product_id);
                        return (
                          <>
                            <tr key={`g-${group.bc_product_id}`} className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50 cursor-pointer" onClick={() => toggleExpanded(group.bc_product_id)} data-testid={`row-product-${group.bc_product_id}`}>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                                  <div>
                                    <span className="font-semibold text-blue-600">{group.product_name}</span>
                                    {group.brand_name && <p className="text-xs text-slate-400 mt-0.5">Brand: {group.brand_name}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5" />
                              <td className="px-4 py-2.5" />
                              <td className="px-4 py-2.5 text-right"><span className="font-bold text-blue-600">{fmtNum(group.total_qty)}</span></td>
                              <td className="px-4 py-2.5 text-right"><span className="font-bold text-emerald-600">{fmtNum(group.total_stock)}</span></td>
                            </tr>
                            {isExpanded && group.variants.map((v, vi) => (
                              <tr key={`v-${group.bc_product_id}-${vi}`} className="border-b border-slate-100 hover:bg-slate-50/50" data-testid={`row-variant-${group.bc_product_id}-${vi}`}>
                                <td className="px-4 py-2" />
                                <td className="px-4 py-2 text-slate-700">{v.variant_label ?? "—"}</td>
                                <td className="px-4 py-2 text-slate-500 font-mono text-xs">{v.sku || "—"}</td>
                                <td className="px-4 py-2 text-right text-blue-600 font-medium">{fmtNum(v.qty_sold)}</td>
                                <td className="px-4 py-2 text-right text-emerald-600 font-medium">{fmtNum(v.current_stock)}</td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              detailRows.length === 0 ? <EmptyState hasParams={!!reportParams} noData={reportData?.noData} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("product_name")} className="flex items-center hover:text-slate-800">Product <SortIcon col="product_name" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Variant</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">SKU</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("order_number")} className="flex items-center hover:text-slate-800">Order # <SortIcon col="order_number" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("customer_name")} className="flex items-center hover:text-slate-800">Customer <SortIcon col="customer_name" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-right px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("qty")} className="flex items-center justify-end ml-auto hover:text-slate-800">Qty <SortIcon col="qty" sortBy={sortBy} sortDir={sortDir} /></button></th>
                        <th className="text-right px-4 py-3 font-medium text-slate-600">Unit Price</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600"><button onClick={() => handleSort("order_date")} className="flex items-center hover:text-slate-800">Date <SortIcon col="order_date" sortBy={sortBy} sortDir={sortDir} /></button></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((r, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50" data-testid={`row-detail-${i}`}>
                          <td className="px-4 py-2.5"><span className="font-medium text-blue-600">{r.product_name}</span>{r.brand_name && <p className="text-xs text-slate-400">{r.brand_name}</p>}</td>
                          <td className="px-4 py-2.5 text-slate-600">{r.variant_label ?? "—"}</td>
                          <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.sku || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-700">#{r.display_order_number ?? r.order_number ?? "—"}</td>
                          <td className="px-4 py-2.5 text-slate-700">{r.customer_name ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right text-blue-600 font-medium">{fmtNum(r.quantity)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">${Number(r.unit_price || 0).toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(r.order_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Pagination */}
            {reportParams && !isLoading && total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
                <span className="text-xs text-slate-500">
                  Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {fmtNum(total)} {activeView === "summary" ? "variants" : "line items"}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs" data-testid="btn-prev-page">‹</button>
                  {(() => {
                    const pages: (number | "…")[] = [];
                    if (totalPages <= 7) { for (let i = 0; i < totalPages; i++) pages.push(i); }
                    else {
                      pages.push(0, 1, 2);
                      if (page > 3) pages.push("…");
                      if (page > 2 && page < totalPages - 3) pages.push(page);
                      if (page < totalPages - 4) pages.push("…");
                      pages.push(totalPages - 1);
                    }
                    return pages.map((pg, i) =>
                      pg === "…" ? <span key={`ell-${i}`} className="text-slate-400 text-xs px-1">…</span> : (
                        <button key={pg} onClick={() => setPage(pg)} className={`h-7 w-7 flex items-center justify-center rounded border text-xs transition-colors ${page === pg ? "bg-blue-600 border-blue-600 text-white font-medium" : "border-slate-200 text-slate-600 hover:bg-white"}`} data-testid={`btn-page-${pg + 1}`}>{pg + 1}</button>
                      )
                    );
                  })()}
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs" data-testid="btn-next-page">›</button>
                  <div className="ml-2 relative">
                    <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(0); }} className="appearance-none border border-slate-200 rounded px-2 py-0.5 pr-6 text-xs text-slate-600 bg-white hover:border-slate-300 focus:outline-none" data-testid="select-page-size">
                      {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 px-1">All times shown in Eastern Standard Time (EST)</p>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-72 shrink-0 space-y-4">

          {/* Report Summary */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-800 text-sm mb-3">Report Summary</h3>
            {!reportParams ? (
              <p className="text-xs text-slate-400 italic">Generate a report to see summary stats.</p>
            ) : loadingStats ? (
              <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : stats ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Date Range</p>
                  <p className="text-sm text-slate-700 mt-0.5">{toDisplayDate(reportParams.dateFrom)} – {toDisplayDate(reportParams.dateTo)}</p>
                </div>
                {([
                  { label: "Total Products", value: fmtNum(stats.totalProducts) },
                  { label: "Total Variants", value: fmtNum(stats.totalVariants) },
                  { label: "Total Qty Sold", value: fmtNum(stats.totalQtySold) },
                  { label: "Total Current Stock", value: fmtNum(stats.totalCurrentStock) },
                ] as const).map(row => (
                  <div key={row.label}>
                    <p className="text-xs text-slate-400 font-medium">{row.label}</p>
                    <p className="text-lg font-bold text-slate-800">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No stats available.</p>
            )}
          </div>

          {/* Recent Exports */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">Recent Exports</h3>
              <button className="text-xs text-blue-600 hover:underline" data-testid="link-view-all-exports">View all</button>
            </div>
            {recentExports.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No exports yet.</p>
            ) : (
              <div className="space-y-3">
                {recentExports.map(ex => (
                  <div key={ex.id} className="flex items-start justify-between gap-2" data-testid={`export-log-${ex.id}`}>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{ex.report_name}{ex.view_name ? ` – ${ex.view_name}` : ""}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(ex.created_at)}</p>
                      <p className="text-xs text-slate-400">by {ex.user_name}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0.5 font-semibold uppercase ${ex.export_type === "excel" ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                      {ex.export_type === "excel" ? "XLSX" : "CSV"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
