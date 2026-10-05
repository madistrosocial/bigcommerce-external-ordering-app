import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Lightbulb,
  ListFilter,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProduct360Detail,
  getProduct360Overview,
  getProduct360Products,
  type Product360Detail,
  type Product360Overview,
  getAuthHeaders,
} from "@/lib/api";

import { useTimeService } from "@/hooks/useTimeService";
import { dateOnlyInTimeZone } from "@shared/timezone";

const COLORS = ["#2563eb", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];

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
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>{status}</span>;
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
  categoryOptions = [],
  onChange,
  onBrandChange,
  onCategoryChange,
  onExport,
}: {
  from: string;
  to: string;
  brand?: string;
  category?: string;
  brandOptions?: string[];
  categoryOptions?: string[];
  onChange: (from: string, to: string) => void;
  onBrandChange?: (value: string) => void;
  onCategoryChange?: (value: string) => void;
  onExport?: () => void;
}) {
  const fmt = useTimeService();
  const today = fmt.dateOnly();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
      <Input type="date" className="h-9 w-[135px] bg-white text-xs" value={from} onChange={(e) => onChange(e.target.value, to)} />
      <span className="text-xs text-slate-400">to</span>
      <Input type="date" className="h-9 w-[135px] bg-white text-xs" value={to} onChange={(e) => onChange(from, e.target.value)} />
      <select className="h-9 max-w-[150px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm" value={brand} onChange={(event) => onBrandChange?.(event.target.value)}>
        <option value="">All Brands</option>
        {brandOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <select className="h-9 max-w-[150px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm" value={category} onChange={(event) => onCategoryChange?.(event.target.value)}>
        <option value="">All Categories</option>
        {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-white text-xs" onClick={onExport}><Download className="h-3.5 w-3.5" /> Export</Button>
    </div>
  );
}

function exportProduct360Overview(data: Product360Overview, from: string, to: string, brand: string, category: string) {
  const rows: string[][] = [
    ["Product 360 Overview", ""],
    ["Date range", `${from} to ${to}`],
    ["Brand", brand || "All Brands"],
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
      <div className="mx-auto max-w-[1700px]">
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

function DashboardOverviewContent({ data, focus }: { data: Product360Overview; focus?: string }) {
  const fmt = useTimeService();
  const [categoryMetric, setCategoryMetric] = useState<"units" | "revenue">("revenue");
  const [, setLocation] = useLocation();
  const metrics = data.metrics || {};
  const trend = data.trend.map((row) => ({ ...row, units: Number(row.units || 0), revenue: Number(row.revenue || 0), gross_profit: Number(row.gross_profit || 0) }));
  const categoryData = data.categoryPerformance
    .map((row) => ({ ...row, units: Number(row.units || 0), revenue: Number(row.revenue || 0) }))
    .filter((row) => Number(row[categoryMetric]) > 0);
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
  const keyInsight = restockNeeded > 0
    ? `You have ${number(restockNeeded)} products that need restocking based on current sales velocity. Focus on high-demand products with less than 7 days of stock.`
    : "Your current product inventory is covered based on the selected sales range.";
  const priorityColors: Record<string, string> = { Urgent: "#ef4444", "Restock Soon": "#f3a51c", Monitor: "#3b82f6", Healthy: "#2bb673", "No Action": "#94a3b8" };
  const priorityMax = Math.max(...priorityData.map((item) => item.products), 1);

  return (
    <>
      {focus && focus !== "overview" && <Card className="mb-3 border-blue-100 bg-blue-50/50 p-3"><p className="text-xs font-semibold text-blue-900">{focus === "sales" ? "Sales Performance" : focus === "profitability" ? "Profitability" : focus === "inventory" ? "Inventory Intelligence" : focus === "replenishment" ? "Replenishment" : focus === "customers" ? "Product Customers" : "Product History"}</p><p className="mt-1 text-[10px] text-blue-700">This view is powered by the same Product 360 data, with the overview below providing the portfolio context.</p></Card>}
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
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
        <DashboardPanel title="Sales & Revenue Trend" subtitle="Units, revenue, and gross profit over the selected range" action={<BarChart3 className="h-3.5 w-3.5 text-slate-400" />}>
          {trend.length === 0 ? <div className="flex h-[190px] items-center justify-center text-xs text-slate-400">No sales data for this period.</div> : <div className="h-[190px] px-1 pb-2 pt-3"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="product360RevenueDashboard" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.24} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf1" /><XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis yAxisId="left" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number, name: string) => [name === "revenue" || name === "gross_profit" ? money(value) : number(value), name === "gross_profit" ? "Gross profit" : name === "revenue" ? "Revenue" : "Units"]} /><Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#product360RevenueDashboard)" strokeWidth={2} /><Area yAxisId="right" type="monotone" dataKey="gross_profit" stroke="#18b981" fill="none" strokeWidth={2} /><Area yAxisId="left" type="monotone" dataKey="units" stroke="#f2aa24" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>}
        </DashboardPanel>
        <DashboardPanel title={categoryMetric === "revenue" ? "Top Categories by Revenue" : "Top Categories by Units"} subtitle="Main category contribution" action={<div className="flex rounded border border-slate-200 bg-slate-50 p-0.5">{(["revenue", "units"] as const).map((metric) => <button key={metric} type="button" onClick={() => setCategoryMetric(metric)} className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${categoryMetric === metric ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{metric === "revenue" ? "$" : "Qty"}</button>)}</div>}>
          {categoryData.length === 0 ? <div className="flex h-[190px] items-center justify-center text-xs text-slate-400">No category sales data.</div> : <div className="flex h-[190px] items-center gap-2 px-2 py-2"><div className="relative h-[150px] w-[52%] shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey={categoryMetric} nameKey="label" cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={2}>{categoryData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value: number) => [categoryMetric === "revenue" ? money(value) : `${number(value)} units`, categoryMetric === "revenue" ? "Revenue" : "Units sold"]} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-sm font-bold text-slate-800">{categoryMetric === "revenue" ? money(categoryTotal) : number(categoryTotal)}</span><span className="text-[9px] text-slate-400">{categoryMetric === "revenue" ? "Total Revenue" : "Total Units"}</span></div></div><div className="min-w-0 flex-1 space-y-1.5">{categoryData.slice(0, 6).map((row, index) => <div key={String(row.label)} className="flex items-center justify-between gap-2 text-[9px]"><span className="flex min-w-0 items-center gap-1.5 text-slate-600"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} /><span className="truncate">{String(row.label)}</span></span><span className="font-semibold text-slate-500">{categoryTotal ? `${Math.round((Number(row[categoryMetric]) / categoryTotal) * 100)}%` : "0%"}</span></div>)}</div></div>}
        </DashboardPanel>
        <DashboardPanel title="Units Sold by Brand" subtitle="Top brands by units sold">
          {brandData.length === 0 ? <div className="flex h-[190px] items-center justify-center text-xs text-slate-400">No brand sales data.</div> : <div className="h-[190px] px-1 py-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={brandData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5eaf1" /><XAxis type="number" hide /><YAxis type="category" dataKey="label" width={62} tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => [number(value), "Units sold"]} /><Bar dataKey="units" fill="#347be5" radius={[0, 3, 3, 0]} barSize={10} /></BarChart></ResponsiveContainer></div>}
        </DashboardPanel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <DashboardTable title="Fastest Selling Products" rows={data.fastSellers} kind="sales" onViewAll={() => setLocation("/product-360/products")} />
        <DashboardTable title="Top Profit Drivers" rows={data.profitDrivers} kind="profit" onViewAll={() => setLocation("/product-360/profitability")} />
        <DashboardTable title="Restock Alerts" rows={data.restockAlerts} kind="restock" onViewAll={() => setLocation("/product-360/replenishment")} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr_1.25fr]">
        <DashboardPanel title="Inventory Status" subtitle={`${number(inventoryTotal)} products`}>
          {inventoryData.length === 0 ? <div className="flex h-[180px] items-center justify-center text-xs text-slate-400">No inventory data.</div> : <div className="flex h-[180px] items-center gap-3 px-3"><div className="relative h-[145px] w-[50%] shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={inventoryData} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={39} outerRadius={61} paddingAngle={2}>{inventoryData.map((row) => <Cell key={row.label} fill={row.color} />)}</Pie><Tooltip formatter={(value: number, name: string) => [number(value), name]} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-slate-800">{number(inventoryTotal)}</span><span className="text-[9px] text-slate-400">Products</span></div></div><div className="min-w-0 flex-1 space-y-2">{inventoryData.map((row) => <div key={row.label} className="flex items-center justify-between gap-2 text-[9px]"><span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />{row.label}</span><span className="font-semibold text-slate-500">{inventoryTotal ? `${((row.value / inventoryTotal) * 100).toFixed(1)}%` : "0.0%"} <span className="font-normal">({number(row.value)})</span></span></div>)}</div></div>}
        </DashboardPanel>
        <DashboardPanel title="Products by Sales Velocity" subtitle="Products grouped by units per day">
          {velocityData.length === 0 ? <div className="flex h-[180px] items-center justify-center text-xs text-slate-400">No velocity data.</div> : <div className="h-[180px] px-2 py-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={velocityData} margin={{ top: 10, right: 4, left: -12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf1" /><XAxis dataKey="label" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => [number(value), "Products"]} /><Bar dataKey="products" fill="#2bb673" radius={[3, 3, 0, 0]} barSize={28} /></BarChart></ResponsiveContainer></div>}
        </DashboardPanel>
        <DashboardTable title="Slow Movers (High Inventory, Low Sales)" rows={data.slowMovers} kind="slow" onViewAll={() => setLocation("/product-360/inventory")} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_0.9fr_1.2fr]">
        <DashboardPanel title="Recent Product Activity" subtitle="Latest inventory events">
          {data.recentActivity.length === 0 ? <div className="p-4 text-xs text-slate-400">No recent activity.</div> : <div className="divide-y divide-slate-100">{data.recentActivity.map((row, index) => <div key={`${String(row.event_date)}-${index}`} className="flex items-center gap-2 px-3 py-2"><span className="rounded-full bg-blue-50 p-1.5 text-blue-600"><Activity className="h-3 w-3" /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-slate-700">{String(row.event)}</p><p className="truncate text-[9px] text-slate-400">{String(row.product_name)} · {String(row.detail)}</p></div><span className="whitespace-nowrap text-[9px] text-slate-400">{dateLabel(row.event_date, fmt)}</span></div>)}</div>}
        </DashboardPanel>
        <DashboardPanel title="Replenishment Priority" subtitle="Products by action needed">
          <div className="space-y-2 px-3 py-3">{priorityData.map((row) => <div key={String(row.label)} className="flex items-center gap-2 text-[9px]"><span className="w-[68px] shrink-0 text-slate-500">{String(row.label)}</span><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(row.products / priorityMax) * 100}%`, backgroundColor: priorityColors[String(row.label)] || "#94a3b8" }} /></div><span className="w-8 text-right font-semibold text-slate-600">{number(row.products)}</span></div>)}</div>
        </DashboardPanel>
        <Card className="border-blue-200 bg-blue-50/70 p-3 shadow-sm"><div className="flex items-start gap-2"><span className="rounded-full bg-white p-2 text-blue-600 shadow-sm"><Lightbulb className="h-4 w-4" /></span><div><h3 className="text-xs font-bold text-blue-900">Key Insight</h3><p className="mt-2 text-[11px] leading-5 text-blue-800">{keyInsight}</p><Button size="sm" className="mt-3 h-7 bg-blue-600 px-3 text-[10px] hover:bg-blue-700" onClick={() => setLocation("/product-360/replenishment")}>View Replenishment <ChevronRight className="ml-1 h-3 w-3" /></Button></div></div></Card>
      </div>
    </>
  );
}

export function Product360OverviewPage() {
  const fmt = useTimeService();
  const [location] = useLocation();
  const [from, setFrom] = useState(() => isoDaysAgo(29, fmt.tz));
  const [to, setTo] = useState(() => fmt.dateOnly());
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const focus = location.split("/")[2] || "overview";
  const query = useQuery({ queryKey: ["product-360-overview", from, to, brand, category], queryFn: () => getProduct360Overview({ dateFrom: from, dateTo: to, brand, category }) });
  const brandOptions = query.data?.brandOptions || [];
  const categoryOptions = query.data?.categoryOptions || ["Disposables", "E-Liquid", "Hardware", "Smoke Shop"];
  return (
    <PageFrame title="Product 360" description="Complete product intelligence for better decisions" actions={<DateRangeControls from={from} to={to} brand={brand} category={category} brandOptions={brandOptions} categoryOptions={categoryOptions} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} onBrandChange={setBrand} onCategoryChange={setCategory} onExport={() => query.data && exportProduct360Overview(query.data, from, to, brand, category)} />}>
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.data ? <DashboardOverviewContent data={query.data} focus={focus} /> : <EmptyState message="No Product 360 data is available." />}
    </PageFrame>
  );
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

function ProductTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [, setLocation] = useLocation();
  return <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-3 py-3">Brand</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Gross profit</th><th className="px-3 py-3 text-right">Stock</th><th className="px-3 py-3 text-right">Velocity</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={String(row.id)} className="cursor-pointer hover:bg-slate-50" onClick={() => setLocation(`/product-360/products/${row.id}`)}><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="h-9 w-9 overflow-hidden rounded-md bg-slate-100">{row.image ? <img src={String(row.image)} className="h-full w-full object-cover" alt="" /> : <PackageSearch className="m-2 h-5 w-5 text-slate-400" />}</div><div><p className="max-w-[280px] truncate font-semibold text-slate-800">{String(row.name || "Unnamed")}</p><p className="text-[11px] text-slate-400">{String(row.sku || "No SKU")} · BC {String(row.bigcommerce_id || "")}</p></div></div></td><td className="px-3 py-3 text-slate-600">{String(row.brand_name || "—")}</td><td className="px-3 py-3 text-right font-medium">{number(row.units_sold)}</td><td className="px-3 py-3 text-right">{money(row.revenue)}</td><td className="px-3 py-3 text-right">{row.gross_profit == null ? <span className="text-xs text-slate-400">No cost data</span> : money(row.gross_profit)}</td><td className="px-3 py-3 text-right">{number(row.current_stock)}</td><td className="px-3 py-3 text-right">{number(row.sales_velocity, 1)}/day</td><td className="px-3 py-3"><StatusBadge status={getStatus(row)} /></td><td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-300" /></td></tr>)}</tbody></table></div>;
}

export function Product360ProductsPage() {
  const fmt = useTimeService();
  const [from, setFrom] = useState(() => isoDaysAgo(29, fmt.tz));
  const [to, setTo] = useState(() => fmt.dateOnly());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("units_sold");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [stockStatus, setStockStatus] = useState("");
  const [replenishmentStatus, setReplenishmentStatus] = useState("");
  const query = useQuery({ queryKey: ["product-360-products", from, to, search, page, sortBy, sortDir, stockStatus, replenishmentStatus], queryFn: () => getProduct360Products({ dateFrom: from, dateTo: to, search, page, limit: 25, sortBy, sortDir, stockStatus, replenishmentStatus }) });
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
        filters: { dateFrom: from, dateTo: to, search, stockStatus, replenishmentStatus, page },
        exportType: "csv",
        rowCount: rows.length,
      }),
    }).catch(() => {});
  }
  return (
    <PageFrame title="Products workspace" description="A server-paginated product intelligence view across sales, profitability, stock coverage, and replenishment." actions={<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="mr-2 h-4 w-4" /> Export current page</Button><DateRangeControls from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); setPage(0); }} /></div>}>
      <Card className="mb-5 border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Search product, SKU, brand, variant, or BigCommerce ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={stockStatus} onChange={(e) => { setStockStatus(e.target.value); setPage(0); }}><option value="">All stock</option><option value="low">Low stock</option><option value="healthy">Healthy stock</option></select><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={replenishmentStatus} onChange={(e) => { setReplenishmentStatus(e.target.value); setPage(0); }}><option value="">All replenishment</option><option value="urgent">Urgent</option><option value="soon">Restock soon</option><option value="overstock">Overstock</option></select><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={`${sortBy}|${sortDir}`} onChange={(e) => { const [s, d] = e.target.value.split("|"); setSortBy(s); setSortDir(d as "asc" | "desc"); setPage(0); }}><option value="units_sold|desc">Sort: units sold</option><option value="revenue|desc">Sort: revenue</option><option value="gross_profit|desc">Sort: gross profit</option><option value="sales_velocity|desc">Sort: velocity</option><option value="current_stock|asc">Sort: stock low to high</option><option value="name|asc">Sort: name</option></select></div></Card>
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : rows.length ? <ProductTable rows={rows} /> : <EmptyState message="No products match these filters. Try a wider date range or clear the search." />}<div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{query.data?.total ? `${page * 25 + 1}–${Math.min((page + 1) * 25, query.data.total)} of ${query.data.total}` : "0 products"}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div></Card>
    </PageFrame>
  );
}

function DetailTabs({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  const tabs = [["overview", "Overview"], ["variants", "Variants"], ["sales", "Sales"], ["profitability", "Profitability"], ["inventory", "Inventory"], ["replenishment", "Replenishment"], ["customers", "Customers"], ["history", "History"]];
  return <div className="flex gap-1 overflow-x-auto border-b border-slate-200">{tabs.map(([value, label]) => <button key={value} onClick={() => onChange(value)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold ${active === value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{label}</button>)}</div>;
}

function DetailBody({ data, tab }: { data: Product360Detail; tab: string }) {
  const fmt = useTimeService();
  const product = data.product || {};
  const trend = data.trend.map((row) => ({ ...row, revenue: Number(row.revenue || 0), units: Number(row.units || 0), gross_profit: Number(row.gross_profit || 0) }));
  const rows = data.variants || [];
  if (tab === "customers") return <Card className="mt-5 overflow-hidden border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold">Customers who bought this product</h3><p className="text-xs text-slate-400">Customer relationship analytics from the order-line mirror</p></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Units</th><th className="px-4 py-3 text-right">Revenue</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3">Last purchase</th></tr></thead><tbody className="divide-y divide-slate-100">{data.customers.map((row, i) => <tr key={`${row.customer_id}-${i}`}><td className="px-4 py-3 font-medium">{String(row.customer || "Unknown customer")}</td><td className="px-4 py-3 text-right">{number(row.units_purchased)}</td><td className="px-4 py-3 text-right">{money(row.revenue)}</td><td className="px-4 py-3 text-right">{number(row.orders)}</td><td className="px-4 py-3 text-slate-500">{dateLabel(row.last_purchase, fmt)}</td></tr>)}</tbody></table></div></Card>;
  if (tab === "history") return <Card className="mt-5 border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold">Product activity</h3><p className="text-xs text-slate-400">Append-only inventory activity available from existing audit logs</p></div>{data.history.length ? <div className="divide-y divide-slate-100">{data.history.map((row, i) => <div key={i} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-800">{String(row.event)}</p><p className="text-xs text-slate-400">{String(row.source)} · {String(row.user_name || "System")}</p></div><div className="text-left sm:text-right"><p className="text-xs text-slate-500">{String(row.previous_value || "—")} → {String(row.new_value || "—")}</p><p className="text-[11px] text-slate-400">{dateLabel(row.event_date, fmt)}</p></div></div>)}</div> : <div className="p-6 text-sm text-slate-400">No product history is recorded for this product.</div>}</Card>;
  return <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Units sold" value={number(product.units_sold)} detail={`${number(product.orders)} orders`} icon={ShoppingCart} /><MetricCard label="Revenue" value={money(product.revenue)} detail={`ASP ${money(Number(product.units_sold) ? Number(product.revenue) / Number(product.units_sold) : 0)}`} icon={CircleDollarSign} tone="emerald" /><MetricCard label="Gross profit" value={product.gross_profit == null ? "No cost data" : money(product.gross_profit)} detail={product.gross_profit == null ? "Cost is not available" : `${Number(product.revenue) ? ((Number(product.gross_profit) / Number(product.revenue)) * 100).toFixed(1) : "0.0"}% margin`} icon={BarChart3} tone="violet" /><MetricCard label="Stock coverage" value={product.days_of_stock == null ? "No sales data" : `${number(product.days_of_stock, 1)} days`} detail={`${number(product.current_stock)} units on hand`} icon={PackageCheck} tone="amber" /></div>{tab === "overview" || tab === "sales" || tab === "profitability" ? <Card className="border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-slate-800">{tab === "profitability" ? "Revenue vs gross profit" : "Sales trend"}</h3><div className="mt-3 h-[280px]">{trend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number, name: string) => [name === "units" ? number(value) : money(value), name === "gross_profit" ? "Gross profit" : name === "revenue" ? "Revenue" : "Units"]} /><Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} /><Area type="monotone" dataKey="gross_profit" stroke="#14b8a6" fill="none" strokeWidth={2} /><Area type="monotone" dataKey="units" stroke="#f59e0b" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-400">No sales data for this period.</div>}</div></Card> : null}{(tab === "variants" || tab === "inventory" || tab === "replenishment") && <Card className="overflow-hidden border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold">{tab === "replenishment" ? "Variant replenishment" : "Variant intelligence"}</h3><p className="text-xs text-slate-400">Missing costs are shown as unavailable, not treated as zero.</p></div>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Variant</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3 text-right">Cost</th><th className="px-3 py-3 text-right">Stock</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Velocity</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, i) => <tr key={`${row.variant_id}-${i}`}><td className="px-4 py-3 font-medium">{displayVariantLabel(row.label)}</td><td className="px-3 py-3 text-slate-500">{String(row.sku || "—")}</td><td className="px-3 py-3 text-right">{money(row.price)}</td><td className="px-3 py-3 text-right">{row.cost_price == null ? <span className="text-xs text-slate-400">No cost data</span> : money(row.cost_price)}</td><td className="px-3 py-3 text-right">{number(row.current_stock)}</td><td className="px-3 py-3 text-right">{number(row.units_sold)}</td><td className="px-3 py-3 text-right">{number(row.sales_velocity, 1)}/day</td><td className="px-3 py-3"><StatusBadge status={getStatus(row)} /></td></tr>)}</tbody></table></div> : <div className="p-6 text-sm text-slate-400">This product has no normalized variant records.</div>}</Card>}</div>;
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
    <PageFrame title={String(product.name || "Product workspace")} description="The central Product 360 workspace for product performance, variants, profitability, inventory, customers, and history." actions={<DateRangeControls from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />}>
      <button onClick={() => setLocation("/product-360/products")} className="mb-4 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> Back to products</button>
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.data ? <><Card className="border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">{product.image ? <img src={String(product.image)} alt="" className="h-full w-full object-cover" /> : <PackageSearch className="m-6 h-8 w-8 text-slate-400" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-900">{String(product.name)}</h2><StatusBadge status={getStatus(product)} /></div><p className="mt-1 text-sm text-slate-500">{String(product.sku || "No base SKU")} · BigCommerce {String(product.bigcommerce_id)} · {number(product.variants_count)} variants</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Brand: {String(product.brand_name || "—")}</span><span>Stock: {number(product.current_stock)}</span><span>Last sold: {dateLabel(product.last_sold, fmt)}</span></div></div><Button variant="outline" size="sm" onClick={() => setLocation("/catalog")}><PackageSearch className="mr-2 h-4 w-4" /> View catalog</Button></div><div className="mt-5"><DetailTabs active={tab} onChange={setTab} /></div></Card><DetailBody data={query.data} tab={tab} /></> : <EmptyState message="Product not found." />}
    </PageFrame>
  );
}