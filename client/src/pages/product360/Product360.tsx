import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  History,
  ImagePlus,
  ListFilter,
  PackageCheck,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RichTextEditor from "@/components/editor/RichTextEditor";
import {
  getProduct360Detail,
  getProduct360Overview,
  getProduct360BrandOptions,
  getProduct360TopCustomers,
  getProduct360DashboardList,
  getProduct360Products,
  getProduct360CatalogDetails,
  getProduct360Drafts,
  type Product360Draft,
  saveProduct360CatalogDetails,
  uploadProduct360VariantImage,
  syncProduct360Catalog,
  type Product360Detail,
  type Product360Overview,
  getAuthHeaders,
} from "@/lib/api";

import { useTimeService } from "@/hooks/useTimeService";
import { dateOnlyInTimeZone } from "@shared/timezone";
import { useStore } from "@/lib/store";

const COLORS = ["#2563eb", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];
const MAIN_CATEGORY_LABELS = ["Disposables", "E-Liquid", "Hardware", "Smoke Shop"];
const SUBCATEGORY_COLORS = ["#2563eb", "#14b8a6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#10b981", "#a855f7", "#0ea5e9"];

function productCategoryColor(label: unknown, fallbackIndex = 0): string {
  const name = String(label ?? "");
  const index = MAIN_CATEGORY_LABELS.indexOf(name);
  if (index >= 0) return COLORS[index];
  if (name === "Other / Uncategorized" || name === "Directly assigned / Other") return COLORS[5];
  if (fallbackIndex < SUBCATEGORY_COLORS.length) return SUBCATEGORY_COLORS[Math.max(0, fallbackIndex)];
  return `hsl(${Math.round((fallbackIndex * 137.508) % 360)} 68% 46%)`;
}

function isoDaysAgo(days: number, timezone: string) {
  const [year, month, day] = dateOnlyInTimeZone(new Date(), timezone).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days, 12)).toISOString().slice(0, 10);
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount)
    : "—";
}

function number(value: unknown, digits = 0) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(amount)
    : "—";
}

function dateLabel(value: unknown, fmt: ReturnType<typeof useTimeService>) {
  if (!value) return "No recent sale";
  return fmt.date(String(value));
}

function displayVariantLabel(value: unknown) {
  if (value == null || value === "") return "Base product";
  const text = String(value);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const labels = parsed
        .map((item) => typeof item === "string" ? item : item?.label || item?.value || "")
        .filter(Boolean);
      if (labels.length) return labels.join(" / ");
    }
    if (parsed && typeof parsed === "object") {
      return parsed.label || parsed.value || text;
    }
  } catch {
    // The API normally returns a normalized label; keep non-JSON labels unchanged.
  }
  return text;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Urgent: "bg-red-50 text-red-700 border-red-200",
    "Restock Soon": "bg-amber-50 text-amber-700 border-amber-200",
    Healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Overstock: "bg-violet-50 text-violet-700 border-violet-200",
    "No Sales Data": "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={`inline-flex max-w-full whitespace-normal items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>{status}</span>;
}

function getStatus(row: Record<string, unknown>) {
  const days = Number(row.days_of_stock);
  const velocity = Number(row.sales_velocity);
  const stock = Number(row.current_stock);
  if (!velocity) return stock > 0 ? "No Sales Data" : "No Sales Data";
  if (days <= 7) return "Urgent";
  if (days <= 14) return "Restock Soon";
  if (days >= 90) return "Overstock";
  return "Healthy";
}

function DateRangeControls({
  from,
  to,
  brand = "",
  category = "",
  brandOptions = [],
  brandOptionsLoading = false,
  brandOptionsError = false,
  categoryOptions = [],
  onChange,
  rangePreset,
  onRangePresetChange,
  onBrandChange,
  onCategoryChange,
  state = "",
  stateOptions = [],
  onStateChange,
  dashboardFilters = false,
  onExport,
  mobileOpen,
  onMobileOpenChange,
  showMobileToggle = true,
}: {
  from: string;
  to: string;
  brand?: string;
  category?: string;
  brandOptions?: string[];
  brandOptionsLoading?: boolean;
  brandOptionsError?: boolean;
  categoryOptions?: string[];
  onChange: (from: string, to: string) => void;
  rangePreset?: "7" | "30" | "90" | "365" | "all" | "custom";
  onRangePresetChange?: (preset: "7" | "30" | "90" | "365" | "all" | "custom") => void;
  onBrandChange?: (value: string) => void;
  onCategoryChange?: (value: string) => void;
  state?: string;
  stateOptions?: string[];
  onStateChange?: (value: string) => void;
  dashboardFilters?: boolean;
  onExport?: () => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  showMobileToggle?: boolean;
}) {
  const fmt = useTimeService();
  const today = fmt.dateOnly();
  const [localMobileOpen, setLocalMobileOpen] = useState(false);
  const filtersOpen = mobileOpen ?? localMobileOpen;
  const setFiltersOpen = onMobileOpenChange ?? setLocalMobileOpen;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {showMobileToggle && <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-white text-xs sm:hidden" aria-label="Toggle filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><ListFilter className="h-4 w-4" /><span>Filters</span></Button>}
      <div className={`${filtersOpen ? "flex" : "hidden"} w-full flex-col items-stretch gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center`}>
      {dashboardFilters ? <>
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm"
          value={rangePreset || "custom"}
          onChange={(event) => onRangePresetChange?.(event.target.value as "7" | "30" | "90" | "365" | "all" | "custom")}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
          <option value="all">All Time</option>
          <option value="custom">Custom Range</option>
        </select>
        {rangePreset === "custom" && <>
          <Input type="date" className="h-9 w-full bg-white text-xs sm:w-[135px]" value={from} onChange={(e) => onChange(e.target.value, to)} />
          <span className="hidden text-xs text-slate-400 sm:inline">to</span>
          <Input type="date" className="h-9 w-full bg-white text-xs sm:w-[135px]" value={to} onChange={(e) => onChange(from, e.target.value)} />
        </>}
      </> : <>
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm"
          value={`${from}|${to}`}
          onChange={(event) => {
            const [nextFrom, nextTo] = event.target.value.split("|");
            onChange(nextFrom, nextTo);
          }}
        >
          <option value={`${isoDaysAgo(6, fmt.tz)}|${today}`}>Last 7 days</option>
          <option value={`${isoDaysAgo(29, fmt.tz)}|${today}`}>Last 30 days</option>
          <option value={`${isoDaysAgo(89, fmt.tz)}|${today}`}>Last 90 days</option>
          <option value={`${isoDaysAgo(364, fmt.tz)}|${today}`}>Last 12 months</option>
          <option value={`${from}|${to}`}>Custom range</option>
        </select>
        <Input type="date" className="h-9 w-full bg-white text-xs sm:w-[135px]" value={from} onChange={(e) => onChange(e.target.value, to)} />
        <span className="hidden text-xs text-slate-400 sm:inline">to</span>
        <Input type="date" className="h-9 w-full bg-white text-xs sm:w-[135px]" value={to} onChange={(e) => onChange(from, e.target.value)} />
      </>}
      <select className="h-9 max-w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm sm:max-w-[150px]" value={brand} onChange={(event) => onBrandChange?.(event.target.value)} disabled={brandOptionsLoading || brandOptionsError} title={brandOptionsError ? "Could not load BigCommerce brands" : undefined}>
        <option value="">All Brands</option>
        {brandOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {brandOptionsError && <span className="text-[10px] text-red-600">Run Sync to load brands</span>}
      {onStateChange && <select className="h-9 max-w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm sm:max-w-[150px]" value={state} onChange={(event) => onStateChange(event.target.value)}>
        <option value="">All States</option>
        {stateOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>}
      <select className="h-9 max-w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm sm:max-w-[150px]" value={category} onChange={(event) => onCategoryChange?.(event.target.value)}>
        <option value="">All Categories</option>
        {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {onExport && <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-white text-xs" onClick={onExport}><Download className="h-3.5 w-3.5" /> Export</Button>}
      </div>
    </div>
  );
}

function exportProduct360Overview(data: Product360Overview, from: string, to: string, brand: string, state: string, category: string) {
  const rows: string[][] = [
    ["Product 360 Overview", ""],
    ["Date range", `${from} to ${to}`],
    ["Brand", brand || "All Brands"],
    ["State", state || "All States"],
    ["Category", category || "All Categories"],
    [],
    ["Metric", "Value"],
    ...Object.entries(data.metrics || {}).map(([label, value]) => [label, String(value ?? "")]),
    [],
    ["Category", "Units", "Revenue"],
    ...data.categoryPerformance.map((row) => [String(row.label || ""), String(row.units || 0), String(row.revenue || 0)]),
    [],
    ["Brand", "Units", "Revenue"],
    ...data.brandPerformance.map((row) => [String(row.label || ""), String(row.units || 0), String(row.revenue || 0)]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `product-360-${from}-to-${to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadProduct360Csv(filename: string, headers: string[], rows: unknown[][]) {
  const escapeCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function Product360Nav() {
  const [location, setLocation] = useLocation();
  const links = [
    ["Overview", "/product-360"],
    ["Products", "/product-360/products"],
    ["Sales Performance", "/product-360/sales"],
    ["Profitability", "/product-360/profitability"],
    ["Inventory Intelligence", "/product-360/inventory"],
    ["Replenishment", "/product-360/replenishment"],
    ["Customers", "/product-360/customers"],
    ["History", "/product-360/history"],
  ];
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {links.map(([label, path]) => {
        const active = location === path || (path !== "/product-360" && location.startsWith(path));
        return (
          <button key={path} onClick={() => setLocation(path)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PageFrame({ title, description, actions, children }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[#f3f6fb] px-4 py-4 sm:px-5 lg:px-6">
      <div className="w-full min-w-0">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            {title && <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>}
            {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone = "blue" }: { label: string; value: string; detail?: string; icon: React.ElementType; tone?: string }) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <Card className="border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="truncate text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{value}</p>{detail && <p className="mt-1 truncate text-[9px] text-slate-400">{detail}</p>}</div>
        <span className={`rounded-lg p-1.5 ${tones[tone] || tones.blue}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
    </Card>
  );
}

function InsightTable({ title, icon: Icon, rows, kind }: { title: string; icon: React.ElementType; rows: Record<string, unknown>[]; kind: "sales" | "profit" | "restock" | "slow" }) {
  const [, setLocation] = useLocation();
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-800">{title}</h3></div><span className="text-[11px] text-slate-400">Top 8</span></div>
      {rows.length === 0 ? <div className="p-6 text-sm text-slate-400">No data for this period.</div> : (
        <div className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <button key={`${String(row.id)}-${index}`} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50" onClick={() => row.id && setLocation(`/product-360/products/${row.id}`)}>
              <span className="w-5 text-xs font-semibold text-slate-400">{index + 1}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{String(row.name || row.label || "Unnamed")}</p><p className="truncate text-[11px] text-slate-400">{String(row.sku || "")}</p></div>
              <div className="text-right">
                {kind === "profit" ? <><p className="text-sm font-semibold text-slate-800">{money(row.gross_profit)}</p><p className="text-[11px] text-slate-400">{money(row.revenue)} revenue</p></> :
                  kind === "restock" ? <><p className="text-sm font-semibold text-red-600">{number(row.days_of_stock, 1)} days</p><p className="text-[11px] text-slate-400">{number(row.current_stock)} in stock</p></> :
                    kind === "slow" ? <><p className="text-sm font-semibold text-slate-700">{number(row.current_stock)} stock</p><p className="text-[11px] text-slate-400">{number(row.sales_velocity, 1)}/day</p></> :
                      <><p className="text-sm font-semibold text-slate-800">{number(row.units_sold)} units</p><p className="text-[11px] text-slate-400">{money(row.revenue)}</p></>}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function DashboardPanel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`overflow-hidden border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
        <div className="min-w-0"><h3 className="truncate text-xs font-bold text-slate-800">{title}</h3>{subtitle && <p className="mt-0.5 truncate text-[10px] text-slate-400">{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function DashboardTable({ title, rows, kind, onViewAll }: { title: string; rows: Record<string, unknown>[]; kind: "sales" | "profit" | "restock" | "slow"; onViewAll: () => void }) {
  const columns = kind === "sales"
    ? ["Product", "Units sold", "Revenue", "Velocity"]
    : kind === "profit"
      ? ["Product", "Gross profit", "Margin"]
      : kind === "restock"
        ? ["Product / Variant", "Current stock", "Days of stock", "Status"]
        : ["Product", "Units sold", "Current stock", "Days of stock"];
  return (
    <DashboardPanel title={title} action={<button type="button" onClick={onViewAll} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800">View All <ChevronRight className="h-3 w-3" /></button>}>
      {rows.length === 0 ? <div className="p-4 text-xs text-slate-400">No data for this period.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-[10px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-400">
              <tr>{columns.map((column) => <th key={column} className="px-3 py-2 font-semibold">{column}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 5).map((row, index) => {
                const margin = Number(row.revenue) > 0 ? (Number(row.gross_profit || 0) / Number(row.revenue)) * 100 : 0;
                return (
                  <tr key={`${String(row.id || row.name || row.label)}-${index}`} className="cursor-pointer transition-colors hover:bg-slate-50">
                    <td className="max-w-[150px] px-3 py-2 font-semibold text-slate-700" onClick={() => row.id && (window.location.href = `/product-360/products/${row.id}`)}><span className="block truncate">{String(row.name || row.label || "Unnamed")}</span>{kind === "sales" && <span className="block truncate text-[9px] font-normal text-slate-400">{String(row.sku || "")}</span>}</td>
                    {kind === "sales" && <><td className="whitespace-nowrap px-3 py-2 text-slate-600">{number(row.units_sold)}</td><td className="whitespace-nowrap px-3 py-2 text-slate-600">{money(row.revenue)}</td><td className="whitespace-nowrap px-3 py-2 text-slate-500">{number(row.sales_velocity, 0)}/day</td></>}
                    {kind === "profit" && <><td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{money(row.gross_profit)}</td><td className="whitespace-nowrap px-3 py-2 text-slate-500">{margin.toFixed(1)}%</td></>}
                    {kind === "restock" && <><td className="whitespace-nowrap px-3 py-2 text-slate-600">{number(row.current_stock)}</td><td className="whitespace-nowrap px-3 py-2 text-slate-600">{number(row.days_of_stock, 1)}</td><td className="whitespace-nowrap px-3 py-2"><StatusBadge status={getStatus(row)} /></td></>}
                    {kind === "slow" && <><td className="whitespace-nowrap px-3 py-2 text-slate-600">{number(row.units_sold)}</td><td className="whitespace-nowrap px-3 py-2 text-slate-600">{number(row.current_stock)}</td><td className="whitespace-nowrap px-3 py-2 text-slate-500">{number(row.days_of_stock, 1)}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardPanel>
  );
}

function DashboardListDialog({
  kind,
  open,
  onOpenChange,
  filters,
}: {
  kind: "sales" | "profit" | "restock" | "slow";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: { dateFrom: string; dateTo: string; brand: string; state: string; category: string; categoryId?: number };
}) {
  const fmt = useTimeService();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const titles = {
    sales: "Fastest Selling Products",
    profit: "Top Profit Drivers",
    restock: "Restock Alerts",
    slow: "Slow Movers (High Inventory, Low Sales)",
  };
  const query = useQuery({
    queryKey: ["product-360-dashboard-list", kind, filters.dateFrom, filters.dateTo, filters.brand, filters.state, filters.category, filters.categoryId, page],
    queryFn: () => getProduct360DashboardList({ kind, ...filters, page, limit: 25 }),
    enabled: open,
    placeholderData: (previous) => previous,
  });
  useEffect(() => setPage(0), [kind, filters.dateFrom, filters.dateTo, filters.brand, filters.state, filters.category, filters.categoryId]);

  const exportAll = async () => {
    setExporting(true);
    setExportError("");
    try {
      const firstPage = await getProduct360DashboardList({ kind, ...filters, page: 0, limit: 100 });
      const rows = [...firstPage.rows];
      for (let nextPage = 1; nextPage * firstPage.limit < firstPage.total; nextPage += 1) {
        const result = await getProduct360DashboardList({ kind, ...filters, page: nextPage, limit: 100 });
        rows.push(...result.rows);
      }
      const headers = kind === "sales"
        ? ["Product", "SKU", "Units sold", "Revenue", "Sales velocity (per day)"]
        : kind === "profit"
          ? ["Product", "SKU", "Gross profit", "Revenue", "Margin (%)"]
          : kind === "restock"
            ? ["Product", "SKU", "Current stock", "Days of stock", "Status"]
            : ["Product", "SKU", "Units sold", "Current stock", "Days of stock"];
      const csvRows = rows.map((row) => {
        if (kind === "sales") return [row.name, row.sku, row.units_sold, row.revenue, row.sales_velocity];
        if (kind === "profit") {
          const revenue = Number(row.revenue);
          const margin = revenue > 0 ? Number(row.gross_profit || 0) / revenue * 100 : 0;
          return [row.name, row.sku, row.gross_profit, row.revenue, margin.toFixed(1)];
        }
        if (kind === "restock") return [row.name, row.sku, row.current_stock, row.days_of_stock, getStatus(row)];
        return [row.name, row.sku, row.units_sold, row.current_stock, row.days_of_stock];
      });
      downloadProduct360Csv(`product-360-${fileSlug(titles[kind])}-${filters.dateFrom}-to-${filters.dateTo}.csv`, headers, csvRows);
    } catch {
      setExportError("Could not export this list. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>{titles[kind]}</DialogTitle></DialogHeader>
        <DialogDescription className="-mt-3 text-sm text-slate-500">
          All matching products · {filters.dateFrom} to {filters.dateTo}{query.data ? ` · ${number(query.data.total)} products` : ""}
        </DialogDescription>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-red-600" role="status">{exportError}</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportAll} disabled={exporting || query.isLoading || !query.data?.total}>
            <Download className="h-3.5 w-3.5" />{exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
        {query.isLoading ? <div className="py-12 text-center text-sm text-slate-500">Loading products…</div>
          : query.isError ? <div className="py-12 text-center text-sm text-red-600">Could not load this list. Close and try again.</div>
            : query.data?.rows.length ? <>
              <div className="max-h-[58vh] overflow-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Product</th>
                      {kind === "sales" && <><th className="px-3 py-2.5 text-right">Units sold</th><th className="px-3 py-2.5 text-right">Revenue</th><th className="px-3 py-2.5 text-right">Velocity</th></>}
                      {kind === "profit" && <><th className="px-3 py-2.5 text-right">Gross profit</th><th className="px-3 py-2.5 text-right">Revenue</th><th className="px-3 py-2.5 text-right">Margin</th></>}
                      {kind === "restock" && <><th className="px-3 py-2.5 text-right">Current stock</th><th className="px-3 py-2.5 text-right">Days of stock</th><th className="px-3 py-2.5">Status</th></>}
                      {kind === "slow" && <><th className="px-3 py-2.5 text-right">Units sold</th><th className="px-3 py-2.5 text-right">Current stock</th><th className="px-3 py-2.5 text-right">Days of stock</th></>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {query.data.rows.map((row, index) => {
                      const margin = Number(row.revenue) > 0 ? Number(row.gross_profit || 0) / Number(row.revenue) * 100 : 0;
                      return <tr key={`${String(row.id)}-${index}`} className="hover:bg-slate-50">
                        <td className="max-w-[280px] px-3 py-2.5">
                          <button type="button" className="block max-w-full truncate text-left font-medium text-blue-700 hover:underline" onClick={() => row.id && setLocation(`/product-360/products/${row.id}`)}>{String(row.name || "Unnamed product")}</button>
                          <span className="block truncate text-xs text-slate-400">{String(row.sku || "")}</span>
                        </td>
                        {kind === "sales" && <><td className="px-3 py-2.5 text-right">{number(row.units_sold)}</td><td className="px-3 py-2.5 text-right">{money(row.revenue)}</td><td className="px-3 py-2.5 text-right">{number(row.sales_velocity, 1)}/day</td></>}
                        {kind === "profit" && <><td className="px-3 py-2.5 text-right">{money(row.gross_profit)}</td><td className="px-3 py-2.5 text-right">{money(row.revenue)}</td><td className="px-3 py-2.5 text-right">{margin.toFixed(1)}%</td></>}
                        {kind === "restock" && <><td className="px-3 py-2.5 text-right">{number(row.current_stock)}</td><td className="px-3 py-2.5 text-right">{number(row.days_of_stock, 1)}</td><td className="px-3 py-2.5"><StatusBadge status={getStatus(row)} /></td></>}
                        {kind === "slow" && <><td className="px-3 py-2.5 text-right">{number(row.units_sold)}</td><td className="px-3 py-2.5 text-right">{number(row.current_stock)}</td><td className="px-3 py-2.5 text-right">{number(row.days_of_stock, 1)}</td></>}
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Page {page + 1} of {Math.max(1, Math.ceil(query.data.total / query.data.limit))}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
                  <Button type="button" variant="outline" size="sm" disabled={(page + 1) * query.data.limit >= query.data.total} onClick={() => setPage((current) => current + 1)}>Next</Button>
                </div>
              </div>
            </> : <div className="py-12 text-center text-sm text-slate-500">No products match this list.</div>}
      </DialogContent>
    </Dialog>
  );
}

function OverviewContent({ data, focus }: { data: Product360Overview; focus?: string }) {
  const [categoryMetric, setCategoryMetric] = useState<"units" | "revenue">("units");
  const metrics = data.metrics || {};
  const trend = data.trend.map((row) => ({ ...row, units: Number(row.units || 0), revenue: Number(row.revenue || 0), gross_profit: Number(row.gross_profit || 0) }));
  const categoryData = data.categoryPerformance
    .map((row) => ({ ...row, units: Number(row.units || 0), revenue: Number(row.revenue || 0) }))
    .filter((row) => row[categoryMetric] > 0);
  return (
    <>
      {focus && focus !== "overview" && <Card className="mb-5 border-blue-100 bg-blue-50/50 p-4"><p className="text-sm font-semibold text-blue-900">{focus === "sales" ? "Sales Performance" : focus === "profitability" ? "Profitability" : focus === "inventory" ? "Inventory Intelligence" : focus === "replenishment" ? "Replenishment" : focus === "customers" ? "Product Customers" : "Product History"}</p><p className="mt-1 text-xs text-blue-700">This view is powered by the same server-side Product 360 data, with the overview below providing the portfolio context.</p></Card>}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <MetricCard label="Total products" value={number(metrics.total_products)} detail="Product Master records" icon={Boxes} />
        <MetricCard label="Active products" value={number(metrics.active_products)} detail="With current stock" icon={PackageCheck} tone="emerald" />
        <MetricCard label="Fast sellers" value={number(metrics.fast_sellers)} detail="Over 5 units per day" icon={ArrowUpRight} tone="blue" />
        <MetricCard label="Restock needed" value={number(metrics.restock_needed)} detail="Seven days of stock or less" icon={AlertTriangle} tone="red" />
        <MetricCard label="Low stock" value={number(metrics.low_stock)} detail="Ten units or fewer" icon={PackageSearch} tone="amber" />
        <MetricCard label="Profit drivers" value={number(metrics.profit_drivers)} detail="Positive gross profit with cost data" icon={CircleDollarSign} tone="emerald" />
        <MetricCard label="Slow movers" value={number(metrics.slow_movers)} detail="Under 1 unit per day" icon={ArrowDownRight} tone="violet" />
        <MetricCard label="Overstock" value={number(metrics.overstock)} detail="90+ days or no sales" icon={RefreshCw} tone="slate" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card className="border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-800">Sales and profit trend</h3><p className="text-xs text-slate-400">Units, revenue, and gross profit over the selected range</p></div><BarChart3 className="h-4 w-4 text-slate-400" /></div>
          {trend.length === 0 ? <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">No sales data for this period.</div> : <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="product360Revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.26} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number, name: string) => [name === "revenue" || name === "gross_profit" ? money(value) : number(value), name === "gross_profit" ? "Gross profit" : name === "revenue" ? "Revenue" : "Units"]} /><Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#product360Revenue)" strokeWidth={2} /><Area yAxisId="right" type="monotone" dataKey="gross_profit" stroke="#14b8a6" fill="none" strokeWidth={2} /><Area yAxisId="left" type="monotone" dataKey="units" stroke="#f59e0b" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>}
        </Card>
        <Card className="border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Category mix</h3>
              <p className="text-xs text-slate-400">{categoryMetric === "units" ? "Units sold by main category" : "Revenue by main category"}</p>
              {data.categoryWarning && <p className="mt-1 text-[11px] text-amber-600">{data.categoryWarning}</p>}
            </div>
            <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {(["units", "revenue"] as const).map((metric) => <button key={metric} type="button" onClick={() => setCategoryMetric(metric)} className={`rounded px-2 py-1 text-[11px] font-semibold ${categoryMetric === metric ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{metric === "units" ? "Units" : "Revenue"}</button>)}
            </div>
          </div>
          {categoryData.length === 0 ? <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">No category sales data for this period.</div> : <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey={categoryMetric} nameKey="label" cx="50%" cy="46%" innerRadius={54} outerRadius={88} paddingAngle={2}>{categoryData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value: number) => [categoryMetric === "units" ? `${number(value)} units` : money(value), categoryMetric === "units" ? "Units sold" : "Revenue"]} /></PieChart></ResponsiveContainer></div>}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <InsightTable title="Fast sellers" icon={ArrowUpRight} rows={data.fastSellers} kind="sales" />
        <InsightTable title="Profit drivers" icon={CircleDollarSign} rows={data.profitDrivers} kind="profit" />
        <InsightTable title="Restock alerts" icon={AlertTriangle} rows={data.restockAlerts} kind="restock" />
        <InsightTable title="Slow movers and overstock" icon={ArrowDownRight} rows={data.slowMovers} kind="slow" />
      </div>
    </>
  );
}

function DashboardOverviewContent({ data, focus, selectedCategory, categoryPath, brand, state, onCategorySelect, onCategoryPathChange }: {
  data: Product360Overview;
  focus?: string;
  selectedCategory: string;
  categoryPath: { id: number; name: string }[];
  brand: string;
  state: string;
  onCategorySelect: (category: { id: number; name: string }) => void;
  onCategoryPathChange: (path: { id: number; name: string }[]) => void;
}) {
  const fmt = useTimeService();
  const [categoryMetric, setCategoryMetric] = useState<"units" | "revenue">("revenue");
  const [customersDialogOpen, setCustomersDialogOpen] = useState(false);
  const [customerPage, setCustomerPage] = useState(0);
  const [exportingCustomers, setExportingCustomers] = useState(false);
  const [customerExportError, setCustomerExportError] = useState("");
  const [dashboardListKind, setDashboardListKind] = useState<"sales" | "profit" | "restock" | "slow" | null>(null);
  const [, setLocation] = useLocation();
  const drillCategoryId = categoryPath.at(-1)?.id;
  const categoryDisplayName = categoryPath.at(-1)?.name || selectedCategory;
  const customersQuery = useQuery({
    queryKey: ["product-360-top-customers", data.range.dateFrom, data.range.dateTo, brand, state, selectedCategory, drillCategoryId, customerPage],
    queryFn: () => getProduct360TopCustomers({
      dateFrom: data.range.dateFrom,
      dateTo: data.range.dateTo,
      brand,
      state,
      category: selectedCategory,
      categoryId: drillCategoryId,
      page: customerPage,
      limit: 25,
    }),
    enabled: customersDialogOpen,
    placeholderData: (previous) => previous,
  });
  const exportAllCustomers = async () => {
    setExportingCustomers(true);
    setCustomerExportError("");
    try {
      const customerFilters = {
        dateFrom: data.range.dateFrom,
        dateTo: data.range.dateTo,
        brand,
        state,
        category: selectedCategory,
        categoryId: drillCategoryId,
      };
      const firstPage = await getProduct360TopCustomers({ ...customerFilters, page: 0, limit: 100 });
      const rows = [...firstPage.rows];
      for (let nextPage = 1; nextPage * firstPage.limit < firstPage.total; nextPage += 1) {
        const result = await getProduct360TopCustomers({ ...customerFilters, page: nextPage, limit: 100 });
        rows.push(...result.rows);
      }
      downloadProduct360Csv(
        `product-360-top-customers-${data.range.dateFrom}-to-${data.range.dateTo}.csv`,
        ["Customer", "Revenue", "Units purchased", "Orders", "Last purchase"],
        rows.map((row) => [row.customer, row.revenue, row.units_purchased, row.orders, row.last_purchase]),
      );
    } catch {
      setCustomerExportError("Could not export customers. Please try again.");
    } finally {
      setExportingCustomers(false);
    }
  };
  const metrics = data.metrics || {};
  const trend = data.trend.map((row) => ({ ...row, units: Number(row.units || 0), revenue: Number(row.revenue || 0), gross_profit: Number(row.gross_profit || 0) }));
  const categoryRows: Record<string, unknown>[] = data.categoryPerformance
    .map((row) => ({ ...row, units: Number(row.units || 0), revenue: Number(row.revenue || 0) }));
  const categoryData = categoryRows.filter((row) => Number(row[categoryMetric]) > 0);
  const categoryLegendData = categoryRows
    .filter((row) => (Number(row.id) > 0 && Number(row[categoryMetric]) > 0) || MAIN_CATEGORY_LABELS.includes(String(row.label)))
    .sort((a, b) => Number(b[categoryMetric] || 0) - Number(a[categoryMetric] || 0));
  const categoryColors = new Map(categoryRows.map((row, index) => [
    String(row.id ?? row.label),
    productCategoryColor(row.label, index),
  ]));
  const categoryColor = (row: Record<string, unknown>) =>
    categoryColors.get(String(row.id ?? row.label)) || productCategoryColor(row.label);
  const brandData = data.brandPerformance.map((row) => ({ ...row, units: Number(row.units || 0), revenue: Number(row.revenue || 0) }));
  const inventory = data.inventoryStatus[0] || {};
  const inventoryData = [
    { label: "Healthy", value: Number(inventory.healthy || 0), color: "#20b47a" },
    { label: "Low Stock", value: Number(inventory.low_stock || 0), color: "#f5b82e" },
    { label: "Overstock", value: Number(inventory.overstock || 0), color: "#7c5ce6" },
    { label: "No Sales", value: Number(inventory.no_sales || 0), color: "#f06b8b" },
    { label: "Out of Stock", value: Number(inventory.out_of_stock || 0), color: "#ef4444" },
  ].filter((row) => row.value > 0);
  const inventoryTotal = inventoryData.reduce((sum, row) => sum + row.value, 0);
  const velocityData = data.salesVelocity.map((row) => ({ ...row, products: Number(row.products || 0) }));
  const priorityData = data.replenishmentPriority.map((row) => ({ ...row, products: Number(row.products || 0) }));
  const totalProducts = Number(metrics.total_products || 0);
  const activeProducts = Number(metrics.active_products || 0);
  const restockNeeded = Number(metrics.restock_needed || 0);
  const categoryTotal = categoryData.reduce((sum, row) => sum + Number(row[categoryMetric]), 0);
  const priorityColors: Record<string, string> = { Urgent: "#ef4444", "Restock Soon": "#f3a51c", Monitor: "#3b82f6", Healthy: "#2bb673", "No Action": "#94a3b8" };
  const priorityMax = Math.max(...priorityData.map((item) => item.products), 1);

  return (
    <>
      {focus && focus !== "overview" && <Card className="mb-3 border-blue-100 bg-blue-50/50 p-3"><p className="text-xs font-semibold text-blue-900">{focus === "sales" ? "Sales Performance" : focus === "profitability" ? "Profitability" : focus === "inventory" ? "Inventory Intelligence" : focus === "replenishment" ? "Replenishment" : focus === "customers" ? "Product Customers" : "Product History"}</p><p className="mt-1 text-[10px] text-blue-700">This view is powered by the same Product 360 data, with the overview below providing the portfolio context.</p></Card>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Total Products" value={number(metrics.total_products)} detail="Product Master records" icon={Boxes} />
        <MetricCard label="Active Products" value={number(metrics.active_products)} detail={`${totalProducts ? Math.round((activeProducts / totalProducts) * 100) : 0}% of total`} icon={CheckCircle2} tone="emerald" />
        <MetricCard label="Fast Sellers" value={number(metrics.fast_sellers)} detail="Over 5 units per day" icon={TrendingUp} tone="blue" />
        <MetricCard label="Restock Needed" value={number(metrics.restock_needed)} detail="Seven days or less" icon={AlertTriangle} tone="red" />
        <MetricCard label="Low Stock" value={number(metrics.low_stock)} detail="Ten units or fewer" icon={PackageSearch} tone="amber" />
        <MetricCard label="Overstock" value={number(metrics.overstock)} detail="90+ days or no sales" icon={RefreshCw} tone="violet" />
        <MetricCard label="Profit Drivers" value={number(metrics.profit_drivers)} detail="Positive gross profit" icon={CircleDollarSign} tone="emerald" />
        <MetricCard label="Slow Movers" value={number(metrics.slow_movers)} detail="Under 1 unit per day" icon={ArrowDownRight} tone="red" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.25fr_0.95fr_1.2fr]">
        <DashboardPanel className="order-2" title="Sales & Revenue Trend" subtitle="Units, revenue, and gross profit over the selected range" action={<BarChart3 className="h-3.5 w-3.5 text-slate-400" />}>
          {trend.length === 0 ? <div className="flex h-[190px] items-center justify-center text-xs text-slate-400">No sales data for this period.</div> : <div className="h-[190px] px-1 pb-2 pt-3"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="product360RevenueDashboard" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.24} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf1" /><XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis yAxisId="left" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number, name: string) => [name === "revenue" || name === "gross_profit" ? money(value) : number(value), name === "gross_profit" ? "Gross profit" : name === "revenue" ? "Revenue" : "Units"]} /><Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#product360RevenueDashboard)" strokeWidth={2} /><Area yAxisId="right" type="monotone" dataKey="gross_profit" stroke="#18b981" fill="none" strokeWidth={2} /><Area yAxisId="left" type="monotone" dataKey="units" stroke="#f2aa24" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>}
        </DashboardPanel>
        <DashboardPanel className="order-1" title={categoryMetric === "revenue" ? "Top Categories by Revenue" : "Top Categories by Units"} subtitle={categoryDisplayName ? `Filtered to ${categoryPath.map((item) => item.name).join(" › ") || categoryDisplayName}` : "Main category contribution"} action={<div className="flex rounded border border-slate-200 bg-slate-50 p-0.5">{(["revenue", "units"] as const).map((metric) => <button key={metric} type="button" onClick={() => setCategoryMetric(metric)} className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${categoryMetric === metric ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{metric === "revenue" ? "$" : "Qty"}</button>)}</div>}>
          <div className="flex flex-wrap items-center gap-1 px-2 pt-1">
            <button type="button" className="text-[9px] font-semibold text-blue-700 hover:underline" onClick={() => onCategoryPathChange([])}>All categories</button>
            {categoryPath.map((item, index) => <span key={item.id} className="text-[9px] text-slate-400">› <button type="button" className={`font-semibold hover:underline ${index === categoryPath.length - 1 ? "text-slate-700" : "text-blue-700"}`} onClick={() => onCategoryPathChange(categoryPath.slice(0, index + 1))}>{item.name}</button></span>)}
          </div>
          {categoryData.length === 0
            ? <div className="flex h-[160px] items-center justify-center text-center text-xs text-slate-400">{drillCategoryId && !data.categoryHasChildren ? `No more sub-categories under ${categoryDisplayName}. Dashboard data is filtered to this category.` : "No category sales data."}</div>
            : <div className="flex h-[160px] items-center gap-2 px-2 py-1"><div className="relative h-[140px] w-[52%] shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey={categoryMetric} nameKey="label" cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2}>{categoryData.map((row, index) => { const label = String(row.label); const canDrill = Number(row.id) > 0; return <Cell key={String(row.id ?? label) + index} fill={categoryColor(row)} cursor={canDrill ? "pointer" : "default"} onClick={canDrill ? () => onCategorySelect({ id: Number(row.id), name: label }) : undefined} />; })}</Pie><Tooltip formatter={(value: number) => [categoryMetric === "revenue" ? money(value) : `${number(value)} units`, categoryMetric === "revenue" ? "Revenue" : "Units sold"]} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-sm font-bold text-slate-800">{categoryMetric === "revenue" ? money(categoryTotal) : number(categoryTotal)}</span><span className="text-[9px] text-slate-400">{categoryMetric === "revenue" ? "Total Revenue" : "Total Units"}</span></div></div><div className="min-w-0 flex-1 space-y-1.5">{categoryLegendData.map((row, index) => { const label = String(row.label); const canDrill = Number(row.id) > 0; return <button key={String(row.id ?? label) + index} type="button" disabled={!canDrill} onClick={() => { if (canDrill) onCategorySelect({ id: Number(row.id), name: label }); }} className={`flex w-full items-center justify-between gap-2 rounded px-1 text-left text-[9px] ${canDrill ? "cursor-pointer hover:bg-blue-50" : "cursor-default"} text-slate-600`}><span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(row) }} /><span className="truncate">{label}</span></span><span className="font-semibold text-slate-500">{categoryTotal ? `${Math.round((Number(row[categoryMetric]) / categoryTotal) * 100)}%` : "0%"}</span></button>; })}</div></div>}
        </DashboardPanel>
        <DashboardPanel className="order-3" title="Units Sold by Brand" subtitle="Top brands by units sold">
          {brandData.length === 0 ? <div className="flex h-[190px] items-center justify-center text-xs text-slate-400">No brand sales data.</div> : <div className="h-[190px] px-1 py-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={brandData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5eaf1" /><XAxis type="number" hide /><YAxis type="category" dataKey="label" width={62} tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => [number(value), "Units sold"]} /><Bar dataKey="units" fill="#347be5" radius={[0, 3, 3, 0]} barSize={10} /></BarChart></ResponsiveContainer></div>}
        </DashboardPanel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <DashboardTable title="Fastest Selling Products" rows={data.fastSellers} kind="sales" onViewAll={() => setDashboardListKind("sales")} />
        <DashboardTable title="Top Profit Drivers" rows={data.profitDrivers} kind="profit" onViewAll={() => setDashboardListKind("profit")} />
        <DashboardTable title="Restock Alerts" rows={data.restockAlerts} kind="restock" onViewAll={() => setDashboardListKind("restock")} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr_1.25fr]">
        <DashboardPanel title="Inventory Status" subtitle={`${number(inventoryTotal)} products`}>
          {inventoryData.length === 0 ? <div className="flex h-[180px] items-center justify-center text-xs text-slate-400">No inventory data.</div> : <div className="flex h-[180px] items-center gap-3 px-3"><div className="relative h-[145px] w-[50%] shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={inventoryData} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={39} outerRadius={61} paddingAngle={2}>{inventoryData.map((row) => <Cell key={row.label} fill={row.color} />)}</Pie><Tooltip formatter={(value: number, name: string) => [number(value), name]} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-slate-800">{number(inventoryTotal)}</span><span className="text-[9px] text-slate-400">Products</span></div></div><div className="min-w-0 flex-1 space-y-2">{inventoryData.map((row) => <div key={row.label} className="flex items-center justify-between gap-2 text-[9px]"><span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />{row.label}</span><span className="font-semibold text-slate-500">{inventoryTotal ? `${((row.value / inventoryTotal) * 100).toFixed(1)}%` : "0.0%"} <span className="font-normal">({number(row.value)})</span></span></div>)}</div></div>}
        </DashboardPanel>
        <DashboardPanel title="Products by Sales Velocity" subtitle="Products grouped by units per day">
          {velocityData.length === 0 ? <div className="flex h-[180px] items-center justify-center text-xs text-slate-400">No velocity data.</div> : <div className="h-[180px] px-2 py-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={velocityData} margin={{ top: 10, right: 4, left: -12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf1" /><XAxis dataKey="label" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => [number(value), "Products"]} /><Bar dataKey="products" fill="#2bb673" radius={[3, 3, 0, 0]} barSize={28} /></BarChart></ResponsiveContainer></div>}
        </DashboardPanel>
        <DashboardTable title="Slow Movers (High Inventory, Low Sales)" rows={data.slowMovers} kind="slow" onViewAll={() => setDashboardListKind("slow")} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_0.9fr_1.2fr]">
        <DashboardPanel title="Recent Product Activity" subtitle="Latest inventory events">
          {data.recentActivity.length === 0 ? <div className="p-4 text-xs text-slate-400">No recent activity.</div> : <div className="divide-y divide-slate-100">{data.recentActivity.map((row, index) => <div key={`${String(row.event_date)}-${index}`} className="flex items-center gap-2 px-3 py-2"><span className="rounded-full bg-blue-50 p-1.5 text-blue-600"><Activity className="h-3 w-3" /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-slate-700">{String(row.event)}</p><p className="truncate text-[9px] text-slate-400">{String(row.product_name)} · {String(row.detail)}</p></div><span className="whitespace-nowrap text-[9px] text-slate-400">{dateLabel(row.event_date, fmt)}</span></div>)}</div>}
        </DashboardPanel>
        <DashboardPanel title="Replenishment Priority" subtitle="Products by action needed">
          <div className="space-y-2 px-3 py-3">{priorityData.map((row) => <div key={String(row.label)} className="flex items-center gap-2 text-[9px]"><span className="w-[68px] shrink-0 text-slate-500">{String(row.label)}</span><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(row.products / priorityMax) * 100}%`, backgroundColor: priorityColors[String(row.label)] || "#94a3b8" }} /></div><span className="w-8 text-right font-semibold text-slate-600">{number(row.products)}</span></div>)}</div>
        </DashboardPanel>
        <DashboardPanel
          title="Top Customers"
          subtitle={categoryDisplayName ? `Highest revenue · ${categoryDisplayName}` : "Highest revenue in the selected range"}
          action={<Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[9px] text-blue-700" onClick={() => { setCustomerPage(0); setCustomersDialogOpen(true); }}>View all <ChevronRight className="ml-0.5 h-3 w-3" /></Button>}
        >
          {data.topCustomers.length === 0
            ? <div className="flex h-[150px] items-center justify-center text-xs text-slate-400">No customer sales for this period.</div>
            : <div className="divide-y divide-slate-100">
              {data.topCustomers.slice(0, 5).map((row, index) => <div key={`${String(row.customer_id)}-${index}`} className="flex items-center gap-2 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-700">{String(row.customer || "Unknown customer")}</span>
                <span className="shrink-0 text-[10px] font-bold text-slate-800">{money(row.revenue)}</span>
              </div>)}
            </div>}
        </DashboardPanel>
      </div>
      <Dialog open={customersDialogOpen} onOpenChange={setCustomersDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Top Customers{categoryDisplayName ? ` · ${categoryDisplayName}` : ""}</DialogTitle>
          </DialogHeader>
      <DialogDescription className="-mt-3 text-sm text-slate-500">
            Customer revenue from {data.range.dateFrom} to {data.range.dateTo}. {customersQuery.data ? `${number(customersQuery.data.total)} customers` : ""}
          </DialogDescription>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-red-600" role="status">{customerExportError}</span>
            <Button type="button" variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportAllCustomers} disabled={exportingCustomers || customersQuery.isLoading || !customersQuery.data?.total}>
              <Download className="h-3.5 w-3.5" />{exportingCustomers ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
          {customersQuery.isLoading ? <div className="py-12 text-center text-sm text-slate-500">Loading customers…</div>
            : customersQuery.isError ? <div className="py-12 text-center text-sm text-red-600">Could not load customers. Close and try again.</div>
              : customersQuery.data?.rows.length ? <>
                <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5 text-right">Revenue</th><th className="px-3 py-2.5 text-right">Units</th><th className="px-3 py-2.5 text-right">Orders</th><th className="px-3 py-2.5">Last purchase</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{customersQuery.data.rows.map((row, index) => <tr key={`${String(row.customer_id)}-${index}`}><td className="max-w-[240px] truncate px-3 py-2.5 font-medium">{String(row.customer || "Unknown customer")}</td><td className="px-3 py-2.5 text-right">{money(row.revenue)}</td><td className="px-3 py-2.5 text-right">{number(row.units_purchased)}</td><td className="px-3 py-2.5 text-right">{number(row.orders)}</td><td className="px-3 py-2.5 text-slate-500">{dateLabel(row.last_purchase, fmt)}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>Page {customerPage + 1} of {Math.max(1, Math.ceil(customersQuery.data.total / customersQuery.data.limit))}</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={customerPage === 0} onClick={() => setCustomerPage((page) => Math.max(0, page - 1))}>Previous</Button>
                    <Button type="button" variant="outline" size="sm" disabled={(customerPage + 1) * customersQuery.data.limit >= customersQuery.data.total} onClick={() => setCustomerPage((page) => page + 1)}>Next</Button>
                  </div>
                </div>
              </> : <div className="py-12 text-center text-sm text-slate-500">No customer sales for this period.</div>}
        </DialogContent>
      </Dialog>
      {dashboardListKind && <DashboardListDialog
        kind={dashboardListKind}
        open
        onOpenChange={(open) => { if (!open) setDashboardListKind(null); }}
        filters={{
          dateFrom: data.range.dateFrom,
          dateTo: data.range.dateTo,
          brand,
          state,
          category: selectedCategory,
          categoryId: drillCategoryId,
        }}
      />}
    </>
  );
}

export function Product360OverviewPage() {
  const fmt = useTimeService();
  const [location] = useLocation();
  const currentUser = useStore((state) => state.currentUser);
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => isoDaysAgo(29, fmt.tz));
  const [to, setTo] = useState(() => fmt.dateOnly());
  const [rangePreset, setRangePreset] = useState<"7" | "30" | "90" | "365" | "all" | "custom">("30");
  const [brand, setBrand] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [categoryPath, setCategoryPath] = useState<{ id: number; name: string }[]>([]);
  const focus = location.split("/")[2] || "overview";
  const categoryId = categoryPath.at(-1)?.id;
  const query = useQuery({ queryKey: ["product-360-overview", from, to, brand, state, category, categoryId], queryFn: () => getProduct360Overview({ dateFrom: from, dateTo: to, brand, state, category, categoryId }) });
  const brandOptionsQuery = useQuery({ queryKey: ["product-360-bigcommerce-brands"], queryFn: getProduct360BrandOptions, staleTime: 60 * 60 * 1000 });
  const catalogSync = useMutation({
    mutationFn: syncProduct360Catalog,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product-360-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["product-360-products"] });
      await queryClient.invalidateQueries({ queryKey: ["product-360-bigcommerce-brands"] });
    },
  });
  const brandOptions = brandOptionsQuery.data || [];
  const stateOptions = query.data?.stateOptions || [];
  const categoryOptions = query.data?.categoryOptions || ["Disposables", "E-Liquid", "Hardware", "Smoke Shop"];
  return (
    <PageFrame title="Product 360" description="Complete product intelligence for better decisions" actions={<div className="flex flex-wrap items-center justify-end gap-2"><DateRangeControls from={from} to={to} rangePreset={rangePreset} dashboardFilters onRangePresetChange={(preset) => { setRangePreset(preset); if (preset !== "custom") { const today = fmt.dateOnly(); setTo(today); setFrom(preset === "all" ? "1900-01-01" : isoDaysAgo(Number(preset) - 1, fmt.tz)); } }} brand={brand} state={state} category={category} brandOptions={brandOptions} brandOptionsLoading={brandOptionsQuery.isLoading} brandOptionsError={brandOptionsQuery.isError} stateOptions={stateOptions} categoryOptions={categoryOptions} onChange={(nextFrom, nextTo) => { setRangePreset("custom"); setFrom(nextFrom); setTo(nextTo); }} onBrandChange={setBrand} onStateChange={setState} onCategoryChange={(nextCategory) => { setCategory(nextCategory); setCategoryPath([]); }} onExport={() => query.data && exportProduct360Overview(query.data, query.data.range.dateFrom, query.data.range.dateTo, brand, state, category)} />{currentUser?.role === "admin" && focus === "overview" && <Button variant="outline" size="sm" onClick={() => catalogSync.mutate()} disabled={catalogSync.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${catalogSync.isPending ? "animate-spin" : ""}`} />{catalogSync.isPending ? "Syncing…" : "Sync"}</Button>}</div>}>
      {catalogSync.data && <Card className="mb-4 border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><div className="font-semibold">Catalog sync complete</div><div className="mt-1">Fetched {catalogSync.data.productsFetched.toLocaleString()} products across {catalogSync.data.pagesCompleted} pages. {catalogSync.data.productsAdded.toLocaleString()} added; {catalogSync.data.productsUpdated.toLocaleString()} updated.</div><div className="mt-1">Products table storage: {formatStorage(catalogSync.data.storageAfterBytes)} total ({formatStorage(catalogSync.data.tableBytes)} table, {formatStorage(catalogSync.data.indexBytes)} indexes); change: {catalogSync.data.storageDeltaBytes >= 0 ? "+" : ""}{formatStorage(catalogSync.data.storageDeltaBytes)}.</div></Card>}
      {catalogSync.isError && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-800">Catalog sync failed: {catalogSync.error.message}</Card>}
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.data ? <DashboardOverviewContent
        data={query.data}
        focus={focus}
        selectedCategory={category}
        categoryPath={categoryPath}
        brand={brand}
        state={state}
        onCategorySelect={(selected) => {
          setCategory("");
          setCategoryPath((current) => [...current, selected]);
        }}
        onCategoryPathChange={setCategoryPath}
      /> : <EmptyState message="No Product 360 data is available." />}
    </PageFrame>
  );
}

function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes === 0) return "0 bytes";
  const sign = bytes < 0 ? "-" : "";
  bytes = Math.abs(bytes);
  const units = ["bytes", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${sign}${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

function LoadingState() {
  return <div className="grid gap-4 md:grid-cols-2"><Card className="h-32 animate-pulse bg-slate-100" /><Card className="h-32 animate-pulse bg-slate-100" /><Card className="h-80 animate-pulse bg-slate-100 md:col-span-2" /></div>;
}

function EmptyState({ message }: { message: string }) {
  return <Card className="flex min-h-[240px] items-center justify-center border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{message}</Card>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <Card className="flex min-h-[240px] flex-col items-center justify-center gap-3 border-red-100 bg-red-50 p-8 text-center"><AlertTriangle className="h-6 w-6 text-red-500" /><p className="text-sm text-red-700">Product 360 could not load this view.</p><Button variant="outline" size="sm" onClick={onRetry}>Try again</Button></Card>;
}

function ProductTable({ rows, drafts = [] }: { rows: Record<string, unknown>[]; drafts?: Product360Draft[] }) {
  const [, setLocation] = useLocation();
  return <div className="w-full min-w-0 overflow-x-auto"><table className="w-full min-w-[820px] table-fixed text-left text-sm lg:min-w-0"><colgroup><col style={{ width: "33%" }} /><col style={{ width: "12%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /><col style={{ width: "11%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /><col style={{ width: "11%" }} /><col style={{ width: "3%" }} /></colgroup><thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-normal text-slate-500"><tr><th className="px-3 py-3">Product</th><th className="px-2 py-3">Brand</th><th className="px-2 py-3 text-right">Units</th><th className="px-2 py-3 text-right">Revenue</th><th className="px-2 py-3 text-right">Gross profit</th><th className="px-2 py-3 text-right">Stock</th><th className="px-2 py-3 text-right">Velocity</th><th className="px-2 py-3">Status</th><th className="px-1 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">
     {drafts.map((draft) => <tr key={`draft-${draft.id}`} className="cursor-pointer bg-emerald-50 hover:bg-emerald-100" onClick={() => setLocation(`/product-360/products/drafts/${draft.id}`)}><td className="px-3 py-3"><div className="flex items-center gap-3"><div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-100">{draft.data.image_url ? <img src={String(draft.data.image_url)} className="h-full w-full object-cover" alt="" /> : <PackageSearch className="m-2 h-5 w-5 text-slate-400" />}</div><div className="min-w-0 flex-1"><p className="w-full whitespace-normal break-words text-[13px] font-semibold leading-4 text-slate-800">{String(draft.data.name || "Unnamed draft")}</p><p className="text-[11px] text-slate-400">{String(draft.data.skuPrefix || "No SKU")} · Not synced</p></div></div></td><td className="whitespace-normal break-words px-2 py-3 text-[13px] leading-4 text-slate-600">{String(draft.data.brand_name || "—")}</td><td className="whitespace-nowrap px-2 py-3 text-right font-medium">—</td><td className="whitespace-nowrap px-2 py-3 text-right">—</td><td className="whitespace-nowrap px-2 py-3 text-right"><span className="text-xs text-slate-400">No cost data</span></td><td className="whitespace-nowrap px-2 py-3 text-right">—</td><td className="whitespace-nowrap px-2 py-3 text-right">—</td><td className="px-1 py-3"><span className="inline-flex rounded-full border border-emerald-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{draft.status === "failed" ? "Sync failed" : "Draft"}</span></td><td className="px-1 py-3"><ChevronRight className="h-4 w-4 text-slate-300" /></td></tr>)}
     {rows.map((row) => <tr key={String(row.id)} className="cursor-pointer hover:bg-slate-50" onClick={() => setLocation(`/product-360/products/${row.id}`)}><td className="px-3 py-3"><div className="flex items-center gap-3"><div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-100">{row.image ? <img src={String(row.image)} className="h-full w-full object-cover" alt="" /> : <PackageSearch className="m-2 h-5 w-5 text-slate-400" />}</div><div className="min-w-0 flex-1"><p className="w-full whitespace-normal break-words text-[13px] font-semibold leading-4 text-slate-800">{String(row.name || "Unnamed")}</p><p className="text-[11px] text-slate-400">{String(row.sku || "No SKU")} · BC {String(row.bigcommerce_id || "")}</p></div></div></td><td className="whitespace-normal break-words px-2 py-3 text-[13px] leading-4 text-slate-600">{String(row.brand_name || "—")}</td><td className="whitespace-nowrap px-2 py-3 text-right font-medium">{number(row.units_sold)}</td><td className="whitespace-nowrap px-2 py-3 text-right">{money(row.revenue)}</td><td className="whitespace-nowrap px-2 py-3 text-right">{row.gross_profit == null ? <span className="text-xs text-slate-400">No cost data</span> : money(row.gross_profit)}</td><td className="whitespace-nowrap px-2 py-3 text-right">{number(row.current_stock)}</td><td className="whitespace-nowrap px-2 py-3 text-right">{number(row.sales_velocity, 1)}/day</td><td className="px-1 py-3"><StatusBadge status={getStatus(row)} /></td><td className="px-1 py-3"><ChevronRight className="h-4 w-4 text-slate-300" /></td></tr>)}
  </tbody></table></div>;
}

export function Product360ProductsPage() {
  const [, setLocation] = useLocation();
  const currentUser = useStore((state) => state.currentUser);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("bigcommerce_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [stockStatus, setStockStatus] = useState("");
  const [replenishmentStatus, setReplenishmentStatus] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const query = useQuery({ queryKey: ["product-360-products", search, page, sortBy, sortDir, stockStatus, replenishmentStatus], queryFn: () => getProduct360Products({ search, page, limit: 25, sortBy, sortDir, stockStatus, replenishmentStatus }) });
  const drafts = useQuery({ queryKey: ["product-360-drafts"], queryFn: getProduct360Drafts, enabled: currentUser?.role === "admin" });
  const rows = query.data?.rows || [];
  const totalPages = Math.max(1, Math.ceil((query.data?.total || 0) / 25));
  function exportCsv() {
    const headers = ["Product", "SKU", "Brand", "Units sold", "Revenue", "Gross profit", "Stock", "Velocity", "Days of stock", "Status"];
    const body = rows.map((row) => [row.name, row.sku, row.brand_name, row.units_sold, row.revenue, row.gross_profit ?? "No cost data", row.current_stock, row.sales_velocity, row.days_of_stock ?? "", getStatus(row)].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "product-360-performance.csv"; link.click(); URL.revokeObjectURL(link.href);
    void fetch("/api/reports/export-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        report: "product_360",
        view: "product-performance",
        filters: { search, stockStatus, replenishmentStatus, page },
        exportType: "csv",
        rowCount: rows.length,
      }),
    }).catch(() => {});
  }
  return (
    <PageFrame title="Products workspace" actions={<div className="flex flex-wrap gap-2">{currentUser?.role === "admin" && <Button size="sm" onClick={() => setLocation("/product-360/products/drafts/new")}><Plus className="mr-2 h-4 w-4" />Create BigCommerce product</Button>}<Button className="sm:hidden" variant="outline" size="sm" aria-label="Toggle filters" aria-expanded={mobileFiltersOpen} onClick={() => setMobileFiltersOpen((open) => !open)}><ListFilter className="mr-2 h-4 w-4" /> Filters</Button><Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="mr-2 h-4 w-4" /> Export current page</Button></div>}>
      <Card className={`${mobileFiltersOpen ? "block" : "hidden"} mb-5 border-slate-200 bg-white p-4 shadow-sm sm:block`}><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Search product, SKU, brand, variant, or BigCommerce ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={stockStatus} onChange={(e) => { setStockStatus(e.target.value); setPage(0); }}><option value="">All stock</option><option value="low">Low stock</option><option value="healthy">Healthy stock</option></select><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={replenishmentStatus} onChange={(e) => { setReplenishmentStatus(e.target.value); setPage(0); }}><option value="">All replenishment</option><option value="urgent">Urgent</option><option value="soon">Restock soon</option><option value="overstock">Overstock</option></select><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={`${sortBy}|${sortDir}`} onChange={(e) => { const [s, d] = e.target.value.split("|"); setSortBy(s); setSortDir(d as "asc" | "desc"); setPage(0); }}><option value="bigcommerce_id|desc">Sort: newest to oldest (BigCommerce)</option><option value="units_sold|desc">Sort: units sold</option><option value="revenue|desc">Sort: revenue</option><option value="gross_profit|desc">Sort: gross profit</option><option value="sales_velocity|desc">Sort: velocity</option><option value="current_stock|asc">Sort: stock low to high</option><option value="name|asc">Sort: name</option></select></div></Card>
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : rows.length || drafts.data?.length ? <ProductTable rows={rows} drafts={drafts.data || []} /> : <EmptyState message="No products match these filters. Clear the search or stock and replenishment filters." />}<div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{query.data?.total ? `${page * 25 + 1}–${Math.min((page + 1) * 25, query.data.total)} of ${query.data.total}` : "0 products"}{drafts.data?.length ? ` · ${drafts.data.length} drafts` : ""}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div></Card>
    </PageFrame>
  );
}

function DetailTabs({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  const tabs = [["overview", "Overview"], ["details", "Details"], ["variants", "Variants"], ["sales", "Sales"], ["profitability", "Profitability"], ["inventory", "Inventory"], ["replenishment", "Replenishment"], ["customers", "Customers"], ["history", "History"]];
  return <div className="flex gap-1 overflow-x-auto border-b border-slate-200">{tabs.map(([value, label]) => <button key={value} onClick={() => onChange(value)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold ${active === value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{label}</button>)}</div>;
}

function ProductDetailsTab({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const currentUser = useStore((state) => state.currentUser);
  const canEdit = currentUser?.role === "admin";
  const query = useQuery({ queryKey: ["product-360-catalog-details", id], queryFn: () => getProduct360CatalogDetails(id), enabled: id > 0 });
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [removedImages, setRemovedImages] = useState<number[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newImages, setNewImages] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [imageDescriptionDrafts, setImageDescriptionDrafts] = useState<Record<string, string>>({});
  const [primaryImageId, setPrimaryImageId] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [draggingPhotos, setDraggingPhotos] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<number>>(new Set());
  const numericValue = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
  const catalogDetails = query.data;
  const categories = catalogDetails?.categories || [];
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
  useEffect(() => {
    if (query.data?.product) {
      setDraft({ ...query.data.product, categories: Array.isArray(query.data.product.categories) ? query.data.product.categories.map(Number) : [] });
      setRemovedImages([]);
      setNewImages([]);
      setUploadedPhotos([]);
      setImageDescriptionDrafts({});
      setEditedFields(new Set());
      const primaryImage = Array.isArray(query.data.product.images)
        ? query.data.product.images.find((image: any) => image.is_thumbnail)
        : null;
      setPrimaryImageId(primaryImage ? Number(primaryImage.id) : null);
      const expanded = new Set<number>();
      for (const selectedId of Array.isArray(query.data.product.categories) ? query.data.product.categories.map(Number) : []) {
        let current = query.data.categories.find((category) => category.id === selectedId);
        while (current?.parent_id) {
          expanded.add(current.parent_id);
          current = query.data.categories.find((category) => category.id === current?.parent_id);
        }
      }
      setOpenCategoryIds(expanded);
    }
  }, [query.data]);
  const originalPrimaryImageId = Array.isArray(query.data?.product?.images)
    ? Number(query.data.product.images.find((image: any) => image.is_thumbnail)?.id || 0) || null
    : null;
  const save = useMutation({
    mutationFn: () => {
      const numericFields = new Set(["price", "cost_price", "retail_price", "sale_price", "weight", "width", "height", "depth", "brand_id", "sort_order"]);
      const changes = Object.fromEntries(Array.from(editedFields, (key) => [key, numericFields.has(key) ? numericValue(draft[key]) : draft[key]]));
      const imagesToUpdate = Object.entries(imageDescriptionDrafts).map(([imageId, description]) => ({ id: Number(imageId), description }));
      const selectedPrimaryImageId = primaryImageId !== originalPrimaryImageId && primaryImageId ? primaryImageId : undefined;
      return saveProduct360CatalogDetails(id, { ...changes, imagesToAdd: newImages, imagesToUpload: uploadedPhotos, imagesToUpdate, imagesToDelete: removedImages, primaryImageId: selectedPrimaryImageId });
    },
    onSuccess: async () => {
      setSaved(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product-360-catalog-details", id] }),
        queryClient.invalidateQueries({ queryKey: ["product-360-detail", id] }),
        queryClient.invalidateQueries({ queryKey: ["product-360-products"] }),
      ]);
    },
  });
  if (query.isLoading) return <Card className="mt-5 p-6 text-sm text-slate-500">Loading live BigCommerce product details…</Card>;
  if (query.isError) return <Card className="mt-5 border-red-200 bg-red-50 p-5 text-sm text-red-800">{query.error.message}</Card>;
  if (!catalogDetails?.product) return <Card className="mt-5 p-5 text-sm text-slate-500">BigCommerce product details are unavailable.</Card>;
  const product = catalogDetails.product;
  const images = (Array.isArray(product.images) ? product.images : []).filter((image: any) => !removedImages.includes(Number(image.id)));
  const update = (key: string, value: unknown) => { setSaved(false); setEditedFields((current) => new Set(current).add(key)); setDraft((current) => ({ ...current, [key]: value })); };
  const inputClass = "mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50";
  const labelClass = "text-xs font-semibold text-slate-600";
  const categoryNode = (category: typeof categories[number], depth = 0): React.ReactNode => {
    if (matchingCategoryIds && !matchingCategoryIds.has(category.id)) return null;
    const children = (categoryChildren.get(category.id) || []).filter((item) => !matchingCategoryIds || matchingCategoryIds.has(item.id));
    const expanded = !!matchingCategoryIds || openCategoryIds.has(category.id);
    return <div key={category.id}>
      <div className="flex items-center gap-1 rounded py-1.5 pr-2 hover:bg-slate-50" style={{ paddingLeft: 8 + depth * 18 }}>
        {children.length ? <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${category.name}`} onClick={() => setOpenCategoryIds((current) => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })} className="rounded p-0.5 text-slate-400 hover:bg-slate-200"><ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} /></button> : <span className="w-5" />}
        <input type="checkbox" disabled={!canEdit} checked={(draft.categories || []).includes(category.id)} onChange={(event) => update("categories", event.target.checked ? [...(draft.categories || []), category.id] : (draft.categories || []).filter((categoryId: number) => categoryId !== category.id))} />
        <span className="text-xs text-slate-700">{category.name}</span>
      </div>
      {expanded && children.map((child) => categoryNode(child, depth + 1))}
    </div>;
  };
  const handlePhotoFiles = async (files: FileList | File[]) => {
    setPhotoError("");
    const selected = Array.from(files);
    if (uploadedPhotos.length + selected.length > 3) return setPhotoError("Add up to 3 photos per save.");
    try {
      const converted: string[] = [];
      for (const file of selected) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error("Choose JPEG, PNG, or WebP photos under 20 MB.");
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not process this photo.")), "image/jpeg", 0.82));
        if (blob.size > 2 * 1024 * 1024) throw new Error("A photo is still over 2 MB after resizing.");
        converted.push(await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read this photo."));
          reader.readAsDataURL(blob);
        }));
      }
      setUploadedPhotos((current) => [...current, ...converted]);
      setSaved(false);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Could not process the selected photo.");
    }
  };
  return <div className="mt-5 space-y-4">
    <Card className="min-w-0 border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3"><h3 className="text-sm font-semibold text-slate-800">Product photos</h3><p className="mt-1 text-xs text-slate-500">Edit captions below each photo. Changes are saved with the product.</p></div>
      <div className="grid max-h-[570px] gap-3 overflow-y-auto pb-1" style={{ gridTemplateColumns: "repeat(auto-fill, 150px)" }}>
        {images.map((image: any) => <div key={image.id} className="w-[150px] overflow-hidden rounded-md border border-slate-200 bg-white">
          <img src={image.url_thumbnail || image.url_standard || image.image_url} alt={image.description || ""} className="h-[150px] w-[150px] object-contain" />
          <div className="w-[150px] border-t border-slate-100 p-1.5">
            {primaryImageId === Number(image.id) && <span className="mb-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">Primary photo</span>}
            <textarea aria-label={`Caption for photo ${image.id}`} maxLength={255} rows={3} disabled={!canEdit} placeholder="Add a photo caption…" value={imageDescriptionDrafts[String(image.id)] ?? image.description ?? ""} onChange={(event) => { setImageDescriptionDrafts((current) => ({ ...current, [String(image.id)]: event.target.value })); setSaved(false); }} className="block min-h-12 w-full resize-y rounded border border-slate-200 bg-white p-1 text-[9px] leading-3 text-slate-600 placeholder:text-slate-400 disabled:bg-slate-50" />
            {canEdit && primaryImageId !== Number(image.id) && <button type="button" className="mt-1 text-[9px] font-medium text-blue-700 hover:underline" onClick={() => { setPrimaryImageId(Number(image.id)); setSaved(false); }}>Set as primary</button>}
            {canEdit && primaryImageId === Number(image.id) && <span className="mt-1 block text-[9px] font-medium text-blue-700">Product thumbnail</span>}
            {canEdit && <button type="button" className="mt-1 text-[9px] font-medium text-red-600 hover:underline" onClick={() => { if (window.confirm("Remove this photo from BigCommerce?")) { const imageId = Number(image.id); setRemovedImages((current) => [...current, imageId]); if (primaryImageId === imageId) { const replacement = images.find((candidate: any) => Number(candidate.id) !== imageId); setPrimaryImageId(replacement ? Number(replacement.id) : null); } setSaved(false); } }}>Remove photo</button>}
          </div>
        </div>)}
        {uploadedPhotos.map((photo, index) => <div key={`pending-${index}`} className="w-[150px] overflow-hidden rounded-md border border-blue-200 bg-white">
          <img src={photo} alt="New photo preview" className="h-[150px] w-[150px] object-contain" />
          <button type="button" className="w-full p-1.5 text-left text-[9px] text-red-600 hover:underline" onClick={() => setUploadedPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>Remove before upload</button>
        </div>)}
        {canEdit && <label onDragOver={(event) => { event.preventDefault(); setDraggingPhotos(true); }} onDragLeave={() => setDraggingPhotos(false)} onDrop={(event) => { event.preventDefault(); setDraggingPhotos(false); void handlePhotoFiles(event.dataTransfer.files); }} className={`flex h-[150px] w-[150px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-2 text-center transition-colors ${draggingPhotos ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"}`}>
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files) void handlePhotoFiles(event.target.files); event.target.value = ""; }} />
          <ImagePlus className="h-5 w-5 text-slate-400" /><span className="mt-2 text-[10px] font-semibold leading-tight text-slate-700">Drop photos or browse</span><span className="mt-1 text-[9px] text-slate-500">JPEG, PNG, WebP</span>
        </label>}
      </div>
      {photoError && <p className="mt-2 text-xs text-red-700">{photoError}</p>}
      {canEdit && <div className="mt-3 flex gap-2"><Input className="h-8 min-w-0 flex-1 text-xs" placeholder="HTTPS photo URL" value={newImageUrl} onChange={(event) => setNewImageUrl(event.target.value)} /><Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { try { const url = new URL(newImageUrl); if (url.protocol !== "https:") return; setNewImages((current) => [...current, url.toString()]); setNewImageUrl(""); setSaved(false); } catch {} }}>Add URL</Button></div>}
      {!!newImages.length && <ul className="mt-2 space-y-1 text-[10px] text-slate-500">{newImages.map((url, index) => <li key={`${url}-${index}`} className="flex justify-between gap-2"><span className="truncate">{url}</span><button type="button" className="text-red-600" onClick={() => setNewImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></li>)}</ul>}
    </Card>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
      <div className="min-w-0 space-y-4">
      <Card className="border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-slate-800">BigCommerce product details</h3><p className="mt-1 text-xs text-slate-500">Loaded live from BigCommerce. Saving writes these changes to the product catalog.</p></div>
        {canEdit && <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || (!editedFields.size && !newImages.length && !uploadedPhotos.length && !Object.keys(imageDescriptionDrafts).length && !removedImages.length && primaryImageId === originalPrimaryImageId)}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Saving to BigCommerce…" : "Save changes"}</Button>}
      </div>
      {save.isError && <div className="mb-3 rounded-md bg-red-50 p-3 text-xs text-red-800">{save.error.message}</div>}
      {saved && <div className="mb-3 rounded-md bg-emerald-50 p-3 text-xs text-emerald-800">BigCommerce product updated.</div>}
      {!canEdit && <div className="mb-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">Only administrators can edit BigCommerce catalog details.</div>}
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Catalog details</h4>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className={labelClass}>Product name<input className={inputClass} disabled={!canEdit} value={draft.name ?? ""} onChange={(event) => update("name", event.target.value)} /></label>
        <label className={labelClass}>SKU<input className={inputClass} disabled={!canEdit} value={draft.sku ?? ""} onChange={(event) => update("sku", event.target.value)} /></label>
        <label className={labelClass}>Brand<select className={inputClass} disabled={!canEdit} value={draft.brand_id ?? ""} onChange={(event) => update("brand_id", event.target.value ? Number(event.target.value) : null)}><option value="">No brand</option>{catalogDetails.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
        <label className={labelClass}>Availability<select className={inputClass} disabled={!canEdit} value={draft.availability || "available"} onChange={(event) => update("availability", event.target.value)}><option value="available">Available</option><option value="disabled">Disabled</option><option value="preorder">Preorder</option></select></label>
        <label className={labelClass}>Sort order<input className={inputClass} type="number" disabled={!canEdit} value={draft.sort_order ?? 0} onChange={(event) => update("sort_order", event.target.value)} /></label>
        <label className={labelClass}>Custom URL path<input className={inputClass} disabled={!canEdit} value={draft.custom_url?.url || ""} onChange={(event) => update("custom_url", { ...(draft.custom_url || {}), url: event.target.value, is_customized: true })} /></label>
        <label className={`${labelClass} flex items-center gap-2 pt-5`}><input type="checkbox" disabled={!canEdit} checked={Boolean(draft.is_visible)} onChange={(event) => update("is_visible", event.target.checked)} /> Visible on storefront</label>
      </div>
      <div className={`${labelClass} mt-4`}><label className="mb-1.5 block" htmlFor="product-description-editor">Description</label><RichTextEditor id="product-description-editor" value={String(draft.description ?? "")} onChange={(value) => update("description", value)} minHeight={180} readOnly={!canEdit} /></div>
    </Card>
    <Card className="border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-slate-800">Pricing & cost</h3><p className="mt-1 text-xs text-slate-500">Product-level prices from BigCommerce.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(["price", "sale_price", "retail_price", "cost_price"] as const).map((key) => <label className={labelClass} key={key}>{({ price: "Price", sale_price: "Sale price", retail_price: "Retail price", cost_price: "Cost" })[key]}<input className={inputClass} type="number" step="any" min="0" disabled={!canEdit} value={draft[key] ?? ""} onChange={(event) => update(key, event.target.value)} /></label>)}</div></Card>
    <Card className="border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-slate-800">Product specifications</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className={labelClass}>Product type<select className={inputClass} disabled={!canEdit} value={draft.type || "physical"} onChange={(event) => update("type", event.target.value)}><option value="physical">Physical</option><option value="digital">Digital</option></select></label>
      <label className={labelClass}>Condition<select className={inputClass} disabled={!canEdit} value={draft.condition || "New"} onChange={(event) => update("condition", event.target.value)}><option>New</option><option>Used</option><option>Refurbished</option></select></label>
      {(["weight", "width", "height", "depth"] as const).map((key) => <label className={labelClass} key={key}>{({ weight: "Weight", width: "Width", height: "Height", depth: "Depth" })[key]}<input className={inputClass} type="number" step="any" min="0" disabled={!canEdit} value={draft[key] ?? ""} onChange={(event) => update(key, event.target.value)} /></label>)}
    </div></Card>
    <Card className="border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-slate-800">Storefront & search content</h3><div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={labelClass}>Warranty<textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm disabled:bg-slate-50" disabled={!canEdit} value={draft.warranty ?? ""} onChange={(event) => update("warranty", event.target.value)} /></label>
        <label className={labelClass}>Search keywords<textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm disabled:bg-slate-50" disabled={!canEdit} value={draft.search_keywords ?? ""} onChange={(event) => update("search_keywords", event.target.value)} /></label>
        <label className={labelClass}>Page title<input className={inputClass} disabled={!canEdit} value={draft.page_title ?? ""} onChange={(event) => update("page_title", event.target.value)} /></label>
        <label className={labelClass}>Meta keywords<input className={inputClass} disabled={!canEdit} value={draft.meta_keywords ?? ""} onChange={(event) => update("meta_keywords", event.target.value)} /></label>
        <label className={`${labelClass} md:col-span-2`}>Meta description<textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm disabled:bg-slate-50" disabled={!canEdit} value={draft.meta_description ?? ""} onChange={(event) => update("meta_description", event.target.value)} /></label>
      </div></Card>
      </div>
      <Card className="min-w-0 border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-800">Assigned categories</h3><p className="mt-1 text-xs text-slate-500">{(draft.categories || []).length} selected</p></div><Input className="h-8 w-full sm:max-w-[190px]" placeholder="Search categories" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} /></div>
        <p className="mt-2 text-[10px] text-slate-500">Expand a category to browse its subcategories.</p>
        <div className="mt-2 max-h-[490px] overflow-y-auto rounded-md border border-slate-200 py-2">{categories.filter((category) => !categories.some((parent) => parent.id === category.parent_id)).map((category) => categoryNode(category))}</div>
      </Card>
    </div>
  </div>;
}

async function prepareVariantImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error("Choose a JPEG, PNG, or WebP photo under 20 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.42, 0.82 - attempt * 0.06);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not process this photo.")), "image/jpeg", quality));
      if (blob.size <= 950 * 1024) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read this photo."));
          reader.readAsDataURL(blob);
        });
      }
      scale *= 0.82;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("This photo could not be resized below 1 MB.");
}

function DetailBody({ data, tab, id }: { data: Product360Detail; tab: string; id: number }) {
  const fmt = useTimeService();
  const queryClient = useQueryClient();
  const canUploadVariantImages = useStore((state) => state.currentUser?.role === "admin");
  const [uploadingVariantIds, setUploadingVariantIds] = useState<Set<number>>(new Set());
  const [draggingVariantId, setDraggingVariantId] = useState<number | null>(null);
  const [variantImageErrors, setVariantImageErrors] = useState<Record<number, string>>({});
  const product = data.product || {};
  const trend = data.trend.map((row) => ({ ...row, revenue: Number(row.revenue || 0), units: Number(row.units || 0), gross_profit: Number(row.gross_profit || 0) }));
  const rows = data.variants || [];
  const uploadVariantImage = async (variantId: number, file?: File) => {
    if (!file) return;
    setVariantImageErrors((current) => ({ ...current, [variantId]: "" }));
    setUploadingVariantIds((current) => new Set(current).add(variantId));
    try {
      const imageDataUrl = await prepareVariantImage(file);
      await uploadProduct360VariantImage(id, variantId, imageDataUrl);
      await queryClient.invalidateQueries({ queryKey: ["product-360-detail", id] });
    } catch (error) {
      setVariantImageErrors((current) => ({ ...current, [variantId]: error instanceof Error ? error.message : "Could not upload this variant photo." }));
    } finally {
      setUploadingVariantIds((current) => { const next = new Set(current); next.delete(variantId); return next; });
    }
  };
  if (tab === "customers") return <Card className="mt-5 overflow-hidden border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold">Customers who bought this product</h3><p className="text-xs text-slate-400">Customer relationship analytics from the order-line mirror</p></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Units</th><th className="px-4 py-3 text-right">Revenue</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3">Last purchase</th></tr></thead><tbody className="divide-y divide-slate-100">{data.customers.map((row, i) => <tr key={`${row.customer_id}-${i}`}><td className="px-4 py-3 font-medium">{String(row.customer || "Unknown customer")}</td><td className="px-4 py-3 text-right">{number(row.units_purchased)}</td><td className="px-4 py-3 text-right">{money(row.revenue)}</td><td className="px-4 py-3 text-right">{number(row.orders)}</td><td className="px-4 py-3 text-slate-500">{dateLabel(row.last_purchase, fmt)}</td></tr>)}</tbody></table></div></Card>;
  if (tab === "history") return <Card className="mt-5 border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold">Product activity</h3><p className="text-xs text-slate-400">Append-only inventory activity available from existing audit logs</p></div>{data.history.length ? <div className="divide-y divide-slate-100">{data.history.map((row, i) => <div key={i} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-800">{String(row.event)}</p><p className="text-xs text-slate-400">{String(row.source)} · {String(row.user_name || "System")}</p></div><div className="text-left sm:text-right"><p className="text-xs text-slate-500">{String(row.previous_value || "—")} → {String(row.new_value || "—")}</p><p className="text-[11px] text-slate-400">{dateLabel(row.event_date, fmt)}</p></div></div>)}</div> : <div className="p-6 text-sm text-slate-400">No product history is recorded for this product.</div>}</Card>;
  return <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Units sold" value={number(product.units_sold)} detail={`${number(product.orders)} orders`} icon={ShoppingCart} /><MetricCard label="Revenue" value={money(product.revenue)} detail={`ASP ${money(Number(product.units_sold) ? Number(product.revenue) / Number(product.units_sold) : 0)}`} icon={CircleDollarSign} tone="emerald" /><MetricCard label="Gross profit" value={product.gross_profit == null ? "No cost data" : money(product.gross_profit)} detail={product.gross_profit == null ? "Cost is not available" : `${Number(product.revenue) ? ((Number(product.gross_profit) / Number(product.revenue)) * 100).toFixed(1) : "0.0"}% margin`} icon={BarChart3} tone="violet" /><MetricCard label="Stock coverage" value={product.days_of_stock == null ? "No sales data" : `${number(product.days_of_stock, 1)} days`} detail={`${number(product.current_stock)} units on hand`} icon={PackageCheck} tone="amber" /></div>{tab === "overview" || tab === "sales" || tab === "profitability" ? <Card className="border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-slate-800">{tab === "profitability" ? "Revenue vs gross profit" : "Sales trend"}</h3><div className="mt-3 h-[280px]">{trend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number, name: string) => [name === "units" ? number(value) : money(value), name === "gross_profit" ? "Gross profit" : name === "revenue" ? "Revenue" : "Units"]} /><Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} /><Area type="monotone" dataKey="gross_profit" stroke="#14b8a6" fill="none" strokeWidth={2} /><Area type="monotone" dataKey="units" stroke="#f59e0b" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-400">No sales data for this period.</div>}</div></Card> : null}{(tab === "variants" || tab === "inventory" || tab === "replenishment") && <Card className="overflow-hidden border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold">{tab === "replenishment" ? "Variant replenishment" : "Variant intelligence"}</h3><p className="text-xs text-slate-400">Missing costs are shown as unavailable, not treated as zero.</p></div>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Variant</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3 text-right">Cost</th><th className="px-3 py-3 text-right">Stock</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Velocity</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, i) => <tr key={`${row.variant_id}-${i}`}><td className="px-4 py-3 font-medium"><div className="flex items-center gap-3">{tab === "variants" && (row.image_url ? <img src={String(row.image_url)} alt={`${displayVariantLabel(row.label)} thumbnail`} className="h-12 w-12 shrink-0 rounded border border-slate-200 bg-white object-contain" /> : canUploadVariantImages ? <div className="w-[76px] shrink-0">{variantImageErrors[Number(row.variant_id)] && <p className="mb-1 max-w-[76px] text-[9px] leading-tight text-red-600">{variantImageErrors[Number(row.variant_id)]}</p>}<label onDragOver={(event) => { event.preventDefault(); setDraggingVariantId(Number(row.variant_id)); }} onDragLeave={() => setDraggingVariantId(null)} onDrop={(event) => { event.preventDefault(); setDraggingVariantId(null); void uploadVariantImage(Number(row.variant_id), event.dataTransfer.files[0]); }} className={`flex h-12 w-14 cursor-pointer flex-col items-center justify-center rounded border border-dashed text-center transition-colors ${draggingVariantId === Number(row.variant_id) ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"} ${uploadingVariantIds.has(Number(row.variant_id)) ? "pointer-events-none opacity-60" : ""}`}><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingVariantIds.has(Number(row.variant_id))} aria-label={`Upload thumbnail for ${displayVariantLabel(row.label)}`} onChange={(event) => { if (event.target.files?.[0]) void uploadVariantImage(Number(row.variant_id), event.target.files[0]); event.target.value = ""; }} />{uploadingVariantIds.has(Number(row.variant_id)) ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" /> : <><ImagePlus className="h-3.5 w-3.5 text-slate-400" /><span className="mt-0.5 text-[8px] text-slate-500">Drop / add</span></>}</label></div> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50"><PackageSearch className="h-5 w-5 text-slate-400" /></div>)}<span>{displayVariantLabel(row.label)}</span></div></td><td className="px-3 py-3 text-slate-500">{String(row.sku || "—")}</td><td className="px-3 py-3 text-right">{money(row.price)}</td><td className="px-3 py-3 text-right">{row.cost_price == null ? <span className="text-xs text-slate-400">No cost data</span> : money(row.cost_price)}</td><td className="px-3 py-3 text-right">{number(row.current_stock)}</td><td className="px-3 py-3 text-right">{number(row.units_sold)}</td><td className="px-3 py-3 text-right">{number(row.sales_velocity, 1)}/day</td><td className="px-3 py-3"><StatusBadge status={getStatus(row)} /></td></tr>)}</tbody></table></div> : <div className="p-6 text-sm text-slate-400">This product has no normalized variant records.</div>}</Card>}</div>;
}

export function Product360DetailPage() {
  const fmt = useTimeService();
  const [, params] = useRoute("/product-360/products/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const [from, setFrom] = useState(() => isoDaysAgo(29, fmt.tz));
  const [to, setTo] = useState(() => fmt.dateOnly());
  const [tab, setTab] = useState("overview");
  const query = useQuery({ queryKey: ["product-360-detail", id, from, to], queryFn: () => getProduct360Detail(id, { dateFrom: from, dateTo: to }), enabled: Number.isFinite(id) && id > 0 });
  const product = query.data?.product || {};
  return (
    <PageFrame title="Products" actions={<DateRangeControls from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />}>
      <button onClick={() => setLocation("/product-360/products")} className="mb-4 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> Back to products</button>
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.data ? <><Card className="border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">{product.image ? <img src={String(product.image)} alt="" className="h-full w-full object-cover" /> : <PackageSearch className="m-6 h-8 w-8 text-slate-400" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-900">{String(product.name)}</h2><StatusBadge status={getStatus(product)} /></div><p className="mt-1 text-sm text-slate-500">{String(product.sku || "No base SKU")} · BigCommerce {String(product.bigcommerce_id)} · {number(product.variants_count)} variants</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Brand: {String(product.brand_name || "—")}</span><span>Stock: {number(product.current_stock)}</span><span>Last sold: {dateLabel(product.last_sold, fmt)}</span></div></div><Button variant="outline" size="sm" onClick={() => setLocation("/catalog")}><PackageSearch className="mr-2 h-4 w-4" /> View catalog</Button></div><div className="mt-5"><DetailTabs active={tab} onChange={setTab} /></div></Card>{tab === "details" ? <ProductDetailsTab id={id} /> : <DetailBody data={query.data} tab={tab} id={id} />}</> : <EmptyState message="Product not found." />}
    </PageFrame>
  );
}