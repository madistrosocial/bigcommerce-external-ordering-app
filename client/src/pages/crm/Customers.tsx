import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileText, FileSpreadsheet, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, User, Settings2, X, Users, AlertTriangle, TrendingUp, HeartPulse } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type SortField =
  | "company" | "first_name" | "state" | "customer_group_name"
  | "last_order_date" | "days_since_order" | "lifetime_orders" | "lifetime_revenue";

const ALL_COLUMNS = [
  { key: "company",         label: "Company",        required: true  },
  { key: "customer_name",   label: "Customer Name",  required: true  },
  { key: "email",           label: "Email",          required: false },
  { key: "phone",           label: "Phone",          required: false },
  { key: "state",           label: "State",          required: false },
  { key: "customer_group",  label: "Customer Group", required: false },
  { key: "last_order",      label: "Last Order",     required: false },
  { key: "days_since",      label: "Days Since",     required: false },
  { key: "orders",          label: "Orders",         required: false },
  { key: "revenue",         label: "Revenue",        required: false },
  { key: "sales_rep",       label: "Sales Rep",      required: false },
] as const;

type ColKey = typeof ALL_COLUMNS[number]["key"];
const DEFAULT_VISIBLE = new Set<ColKey>(ALL_COLUMNS.map(c => c.key));

const PAGE_SIZE = 50;

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}
function fmtCurrency(v: string | number | null): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

export default function CRMCustomers() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentUser } = useStore();

  const colKey = `crm_cols_v2_${currentUser?.id ?? "guest"}`;

  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem(colKey);
      if (saved) return new Set(JSON.parse(saved) as ColKey[]);
    } catch {}
    return DEFAULT_VISIBLE;
  });

  const toggleCol = (key: ColKey, required: boolean) => {
    if (required) return;
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key); else next.add(key);
    setVisibleCols(next);
    localStorage.setItem(colKey, JSON.stringify([...next]));
  };
  const vis = (key: ColKey) => visibleCols.has(key);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [group, setGroup] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("last_order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [showColMenu, setShowColMenu] = useState(false);

  const debounce = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((window as any).__crmSearchTimer);
    (window as any).__crmSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
    setPage(1);
  };

  const setGroupFilter = (v: string) => { setGroup(v); setPage(1); };
  const setStateFilterVal = (v: string) => { setStateFilter(v); setPage(1); };

  const { data: filterOpts } = useQuery({
    queryKey: ["crm", "filters"],
    queryFn: async () => {
      const r = await fetch("/api/crm/filters", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load filters");
      return r.json() as Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }>;
    },
    staleTime: 60_000,
  });

  const { data: metrics } = useQuery({
    queryKey: ["crm", "metrics", debouncedSearch, group, stateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch });
      if (group) params.set("group", group);
      if (stateFilter) params.set("state", stateFilter);
      const r = await fetch(`/api/crm/metrics?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load metrics");
      return r.json() as Promise<{ total: number; healthy: number; watch: number; at_risk: number; lost: number; needs_follow_up: number }>;
    },
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "customers", debouncedSearch, group, stateFilter, sortBy, sortDir, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        sortBy,
        sortDir,
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (group) params.set("group", group);
      if (stateFilter) params.set("state", stateFilter);
      const r = await fetch(`/api/crm/customers?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load customers");
      return r.json() as Promise<{ customers: any[]; total: number }>;
    },
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      const params = new URLSearchParams({ search: debouncedSearch, sortBy, sortDir, format });
      if (group) params.set("group", group);
      if (stateFilter) params.set("state", stateFilter);
      const r = await fetch(`/api/crm/customers/export?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crm-customers-${new Date().toISOString().split("T")[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Export Failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const thClass = "px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap";
  const sortTh = (field: SortField, label: string) => (
    <th
      className={`${thClass} cursor-pointer hover:text-slate-700 select-none`}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-0.5">
        {label}
        {sortBy === field
          ? sortDir === "asc"
            ? <ArrowUp className="h-3 w-3 text-blue-500 ml-1" />
            : <ArrowDown className="h-3 w-3 text-blue-500 ml-1" />
          : <ArrowUpDown className="h-3 w-3 text-slate-400 ml-1" />}
      </span>
    </th>
  );

  const activeFilterCount = [group, stateFilter].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      {/* ── Metrics Cards ──────────────────────────────────────────── */}
      {metrics && (
        <div className="border-b bg-white px-4 py-3 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2 bg-slate-50" data-testid="metric-total">
              <Users className="h-4 w-4 text-slate-400 shrink-0" />
              <div><p className="text-[11px] text-slate-400">Total</p><p className="text-base font-bold text-slate-800">{(metrics.total ?? 0).toLocaleString()}</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2 bg-green-50 border-green-200" data-testid="metric-healthy">
              <HeartPulse className="h-4 w-4 text-green-500 shrink-0" />
              <div><p className="text-[11px] text-green-600">Healthy</p><p className="text-base font-bold text-green-700">{(metrics.healthy ?? 0).toLocaleString()}</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2 bg-yellow-50 border-yellow-200" data-testid="metric-watch">
              <TrendingUp className="h-4 w-4 text-yellow-500 shrink-0" />
              <div><p className="text-[11px] text-yellow-600">Watch</p><p className="text-base font-bold text-yellow-700">{(metrics.watch ?? 0).toLocaleString()}</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2 bg-orange-50 border-orange-200" data-testid="metric-at-risk">
              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
              <div><p className="text-[11px] text-orange-600">At Risk</p><p className="text-base font-bold text-orange-700">{(metrics.at_risk ?? 0).toLocaleString()}</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2 bg-red-50 border-red-200" data-testid="metric-lost">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <div><p className="text-[11px] text-red-600">Lost</p><p className="text-base font-bold text-red-700">{(metrics.lost ?? 0).toLocaleString()}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-4 py-3 shrink-0 space-y-2">

        {/* Row 1: title + action buttons */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-800">CRM Customers</h1>
            <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString()} customers from local mirror</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Column visibility */}
            <Popover open={showColMenu} onOpenChange={setShowColMenu}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid="btn-columns">
                  <Settings2 className="h-3.5 w-3.5" /> Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-3">
                <p className="text-xs font-semibold text-slate-700 mb-2.5">Show / Hide Columns</p>
                <div className="space-y-2">
                  {ALL_COLUMNS.map(col => (
                    <label
                      key={col.key}
                      className={`flex items-center gap-2 text-sm ${col.required ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <Checkbox
                        checked={visibleCols.has(col.key)}
                        onCheckedChange={() => toggleCol(col.key, col.required)}
                        disabled={col.required}
                      />
                      <span>{col.label}</span>
                      {col.required && <span className="text-[10px] text-slate-400 ml-auto">required</span>}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => handleExport("csv")} disabled={exporting === "csv"} data-testid="btn-export-csv">
              <FileText className="h-3.5 w-3.5" />
              {exporting === "csv" ? "Exporting…" : "Export CSV"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => handleExport("xlsx")} disabled={exporting === "xlsx"} data-testid="btn-export-xlsx">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
            </Button>
          </div>
        </div>

        {/* Row 2: filters */}
        <div className="flex gap-2 flex-wrap items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              data-testid="input-crm-search"
              value={search}
              onChange={e => debounce(e.target.value)}
              placeholder="Search company, name, email, phone…"
              className="pl-8 h-8 text-sm w-64"
            />
          </div>

          {/* Customer Group filter */}
          <Select value={group || "__all__"} onValueChange={v => setGroupFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm w-48" data-testid="select-group-filter">
              <SelectValue placeholder="All Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Groups</SelectItem>
              {(filterOpts?.groups ?? []).map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* State filter */}
          <Select value={stateFilter || "__all__"} onValueChange={v => setStateFilterVal(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm w-36" data-testid="select-state-filter">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All States</SelectItem>
              <SelectItem value="Unknown">Unknown / Intl</SelectItem>
              {(filterOpts?.states ?? []).map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear active filters */}
          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-slate-500 gap-1"
              onClick={() => { setGroupFilter(""); setStateFilterVal(""); }}
              data-testid="btn-clear-filters"
            >
              <X className="h-3 w-3" />
              Clear filters ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading customers…</div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <User className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No customers found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead className="sticky top-0 bg-slate-50 border-b z-10">
              <tr>
                {vis("company")        && sortTh("company",            "Company")}
                {vis("customer_name")  && sortTh("first_name",         "Customer Name")}
                {vis("email")          && <th className={thClass}>Email</th>}
                {vis("phone")          && <th className={thClass}>Phone</th>}
                {vis("state")          && sortTh("state",              "State")}
                {vis("customer_group") && sortTh("customer_group_name","Customer Group")}
                {vis("last_order")     && sortTh("last_order_date",    "Last Order")}
                {vis("days_since")     && sortTh("days_since_order",   "Days Since")}
                {vis("orders")         && sortTh("lifetime_orders",    "Orders")}
                {vis("revenue")        && sortTh("lifetime_revenue",   "Revenue")}
                {vis("sales_rep")      && <th className={thClass}>Sales Rep</th>}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const days = daysSince(c.last_order_date);
                const daysColor = days == null
                  ? "text-slate-400"
                  : days > 90 ? "text-red-500 font-semibold"
                  : days > 30 ? "text-amber-500"
                  : "text-green-600";
                const stateVal = (c.shipping_address as any)?.state
                  || (c.billing_address as any)?.state
                  || null;
                return (
                  <tr
                    key={c.id}
                    data-testid={`row-customer-${c.id}`}
                    className="border-b hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/crm/customers/${c.id}`)}
                  >
                    {vis("company")        && <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[180px] truncate">{c.company || "—"}</td>}
                    {vis("customer_name")  && <td className="px-3 py-2.5 text-slate-700">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>}
                    {vis("email")          && <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate">{c.email || "—"}</td>}
                    {vis("phone")          && <td className="px-3 py-2.5 text-slate-600">{c.phone || "—"}</td>}
                    {vis("state")          && <td className="px-3 py-2.5 text-slate-700 font-medium">{stateVal || <span className="text-slate-400">—</span>}</td>}
                    {vis("customer_group") && <td className="px-3 py-2.5 text-slate-600 max-w-[160px] truncate">{c.customer_group_name || <span className="text-slate-400">—</span>}</td>}
                    {vis("last_order")     && (
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                        {c.last_order_date ? formatDistanceToNow(new Date(c.last_order_date), { addSuffix: true }) : "—"}
                      </td>
                    )}
                    {vis("days_since")     && <td className={`px-3 py-2.5 whitespace-nowrap ${daysColor}`}>{days != null ? `${days}d` : "—"}</td>}
                    {vis("orders")         && <td className="px-3 py-2.5 text-right text-slate-700">{(c.lifetime_orders ?? 0).toLocaleString()}</td>}
                    {vis("revenue")        && <td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtCurrency(c.lifetime_revenue)}</td>}
                    {vis("sales_rep")      && (
                      <td className="px-3 py-2.5 text-slate-500 text-xs">
                        {c.sales_rep_name ? <Badge variant="secondary" className="text-xs">{c.sales_rep_name}</Badge> : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="border-t bg-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} total
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="btn-prev-page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid="btn-next-page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
