import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, FileText, FileSpreadsheet, ArrowUp, ArrowDown, ArrowUpDown,
  ChevronLeft, ChevronRight, User, Settings2, X, Users, AlertTriangle,
  TrendingUp, HeartPulse, Activity, Phone, Mail, Filter,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type SortField =
  | "company" | "first_name" | "state" | "customer_group_name"
  | "last_order_date" | "days_since_order" | "lifetime_orders" | "lifetime_revenue"
  | "primary_rep_name" | "secondary_rep_name" | "customer_type" | "address_type"
  | "city" | "last_follow_up";

type HealthFilter = "" | "Healthy" | "Watch" | "At Risk" | "Lost";

const ALL_COLUMNS = [
  { key: "company",         label: "Company",        required: true,  defaultW: 180 },
  { key: "customer_name",   label: "Customer Name",  required: true,  defaultW: 180 },
  { key: "email",           label: "Email",          required: false, defaultW: 220 },
  { key: "phone",           label: "Phone",          required: false, defaultW: 120 },
  { key: "city",            label: "City",           required: false, defaultW: 140 },
  { key: "state",           label: "State",          required: false, defaultW: 120 },
  { key: "customer_group",  label: "Customer Group", required: false, defaultW: 180 },
  { key: "customer_type",   label: "Cust. Type",     required: false, defaultW: 120 },
  { key: "address_type",    label: "Addr. Type",     required: false, defaultW: 110 },
  { key: "primary_rep",     label: "Primary Rep",    required: false, defaultW: 150 },
  { key: "secondary_rep",   label: "Secondary Rep",  required: false, defaultW: 150 },
  { key: "last_order",      label: "Last Order",     required: false, defaultW: 140 },
  { key: "days_since",      label: "Days Since",     required: false, defaultW: 110 },
  { key: "orders",          label: "Orders",         required: false, defaultW: 100 },
  { key: "revenue",         label: "Revenue",        required: false, defaultW: 120 },
  { key: "store_credit",    label: "Store Credit",   required: false, defaultW: 130 },
  { key: "last_follow_up",  label: "Last Follow-Up", required: false, defaultW: 160 },
] as const;

type ColKey = typeof ALL_COLUMNS[number]["key"];
const DEFAULT_VISIBLE = new Set<ColKey>(
  ALL_COLUMNS.filter(c => !["store_credit", "customer_type", "address_type", "primary_rep", "secondary_rep", "sales_rep", "city", "last_follow_up"].includes(c.key)).map(c => c.key)
);
const DEFAULT_WIDTHS: Record<ColKey, number> = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultW])) as Record<ColKey, number>;
const COL_MIN_WIDTHS: Record<ColKey, number> = {
  company: 180, customer_name: 180, email: 220, phone: 120,
  state: 120, customer_group: 180, customer_type: 100, address_type: 90,
  primary_rep: 120, secondary_rep: 120,
  last_order: 120, days_since: 80,
  orders: 80, revenue: 100, store_credit: 100,
  city: 100, last_follow_up: 130,
};

const PAGE_SIZE = 50;

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}
function fmtCurrency(v: string | number | null): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

const HEALTH_CARDS = [
  {
    key: "" as HealthFilter,
    label: "Total",
    icon: Users,
    metricKey: "total" as const,
    inactive: "bg-slate-50 border-slate-200 hover:bg-blue-50 hover:border-blue-300",
    active:   "bg-blue-100 border-blue-500 ring-2 ring-blue-400/40",
    iconCls:  "text-slate-400",
    labelCls: "text-slate-600",
    countCls: "text-slate-800",
    activeLabelCls: "text-blue-700",
    activeCountCls: "text-blue-800",
  },
  {
    key: "Healthy" as HealthFilter,
    label: "Healthy",
    icon: HeartPulse,
    metricKey: "healthy" as const,
    inactive: "bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-400",
    active:   "bg-green-100 border-green-500 ring-2 ring-green-400/40",
    iconCls:  "text-green-500",
    labelCls: "text-green-600",
    countCls: "text-green-700",
    activeLabelCls: "text-green-800",
    activeCountCls: "text-green-900",
  },
  {
    key: "Watch" as HealthFilter,
    label: "Watch",
    icon: Activity,
    metricKey: "watch" as const,
    inactive: "bg-yellow-50 border-yellow-200 hover:bg-yellow-100 hover:border-yellow-400",
    active:   "bg-yellow-100 border-yellow-500 ring-2 ring-yellow-400/40",
    iconCls:  "text-yellow-500",
    labelCls: "text-yellow-600",
    countCls: "text-yellow-700",
    activeLabelCls: "text-yellow-800",
    activeCountCls: "text-yellow-900",
  },
  {
    key: "At Risk" as HealthFilter,
    label: "At Risk",
    icon: TrendingUp,
    metricKey: "at_risk" as const,
    inactive: "bg-orange-50 border-orange-200 hover:bg-orange-100 hover:border-orange-400",
    active:   "bg-orange-100 border-orange-500 ring-2 ring-orange-400/40",
    iconCls:  "text-orange-500",
    labelCls: "text-orange-600",
    countCls: "text-orange-700",
    activeLabelCls: "text-orange-800",
    activeCountCls: "text-orange-900",
  },
  {
    key: "Lost" as HealthFilter,
    label: "Lost",
    icon: AlertTriangle,
    metricKey: "lost" as const,
    inactive: "bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-400",
    active:   "bg-red-100 border-red-500 ring-2 ring-red-400/40",
    iconCls:  "text-red-500",
    labelCls: "text-red-600",
    countCls: "text-red-700",
    activeLabelCls: "text-red-800",
    activeCountCls: "text-red-900",
  },
] as const;

export default function CRMCustomers() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentUser } = useStore();
  const { hasPermission } = usePermissions();
  const canExport = hasPermission("crm", "export");

  const colKey    = `crm_cols_v2_${currentUser?.id ?? "guest"}`;
  const widthKey  = `crm_col_widths_v1_${currentUser?.id ?? "guest"}`;
  const filterKey = `crm_customers_filters_${currentUser?.id ?? "guest"}`;

  // ── Column visibility ─────────────────────────────────────────────────────
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

  // ── Column widths (resizable) ─────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(() => {
    try {
      const saved = localStorage.getItem(widthKey);
      if (saved) return { ...DEFAULT_WIDTHS, ...JSON.parse(saved) };
    } catch {}
    return { ...DEFAULT_WIDTHS };
  });

  const dragRef = useRef<{ col: ColKey; startX: number; startW: number } | null>(null);

  const startResize = useCallback((col: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { col, startX: e.clientX, startW: colWidths[col] };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = me.clientX - dragRef.current.startX;
      const minW = COL_MIN_WIDTHS[dragRef.current.col] ?? 80;
      const newW = Math.max(minW, dragRef.current.startW + delta);
      setColWidths(prev => ({ ...prev, [dragRef.current!.col]: newW }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [colWidths]);

  const resetWidth = (col: ColKey) => {
    setColWidths(prev => ({ ...prev, [col]: DEFAULT_WIDTHS[col] }));
  };

  useEffect(() => {
    localStorage.setItem(widthKey, JSON.stringify(colWidths));
  }, [colWidths, widthKey]);

  // ── Filters / sort / pagination ───────────────────────────────────────────
  // Load persisted filter state from localStorage once on mount
  const savedFilters = (() => {
    try { const raw = localStorage.getItem(filterKey); if (raw) return JSON.parse(raw); } catch {}
    return {};
  })();

  const [showFilters, setShowFilters] = useState<boolean>(() => savedFilters.showFilters ?? false);
  const [search, setSearch] = useState<string>(() => savedFilters.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState<string>(() => savedFilters.search ?? "");
  const [group, setGroup] = useState<string>(() => savedFilters.group ?? "");
  const [stateFilter, setStateFilter] = useState<string>(() => savedFilters.state ?? "");
  const [primaryRepFilter, setPrimaryRepFilter]     = useState<string>(() => savedFilters.primaryRep ?? "");
  const [secondaryRepFilter, setSecondaryRepFilter] = useState<string>(() => savedFilters.secondaryRep ?? "");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>(() => savedFilters.customerType ?? "");
  const [addressTypeFilter, setAddressTypeFilter]   = useState<string>(() => savedFilters.addressType ?? "");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(() => savedFilters.healthFilter ?? "");
  const [sortBy, setSortBy] = useState<SortField>(() => savedFilters.sortBy ?? "last_order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => savedFilters.sortDir ?? "desc");
  const [page, setPage] = useState<number>(() => savedFilters.page ?? 1);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [showColMenu, setShowColMenu] = useState(false);

  // Persist filter state to localStorage whenever anything changes
  useEffect(() => {
    try {
      localStorage.setItem(filterKey, JSON.stringify({
        showFilters, search, group, state: stateFilter,
        primaryRep: primaryRepFilter, secondaryRep: secondaryRepFilter,
        customerType: customerTypeFilter, addressType: addressTypeFilter,
        healthFilter, sortBy, sortDir, page,
      }));
    } catch {}
  }, [showFilters, search, group, stateFilter, primaryRepFilter, secondaryRepFilter,
      customerTypeFilter, addressTypeFilter, healthFilter, sortBy, sortDir, page, filterKey]);

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

  const setGroupFilter          = (v: string) => { setGroup(v); setPage(1); };
  const setStateFilterVal       = (v: string) => { setStateFilter(v); setPage(1); };
  const setPrimaryRepFilterVal  = (v: string) => { setPrimaryRepFilter(v); setPage(1); };
  const setSecondaryRepFilterVal = (v: string) => { setSecondaryRepFilter(v); setPage(1); };
  const setCustomerTypeFilterVal = (v: string) => { setCustomerTypeFilter(v); setPage(1); };
  const setAddressTypeFilterVal  = (v: string) => { setAddressTypeFilter(v); setPage(1); };
  const toggleHealthFilter = (h: HealthFilter) => {
    setHealthFilter(prev => prev === h ? "" : h);
    setPage(1);
  };

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: filterOpts } = useQuery({
    queryKey: ["crm", "filters"],
    queryFn: async () => {
      const r = await fetch("/api/crm/filters", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load filters");
      return r.json() as Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }>;
    },
    staleTime: 60_000,
  });

  const { data: activeUsers = [] } = useQuery({
    queryKey: ["crm", "users"],
    queryFn: async () => {
      const r = await fetch("/api/crm/users", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load users");
      return r.json() as Promise<{ id: number; name: string }[]>;
    },
    staleTime: 120_000,
  });

  const { data: metrics } = useQuery({
    queryKey: ["crm", "metrics", debouncedSearch, group, stateFilter, primaryRepFilter, secondaryRepFilter, customerTypeFilter, addressTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch });
      if (group) params.set("group", group);
      if (stateFilter) params.set("state", stateFilter);
      if (primaryRepFilter) params.set("primaryRep", primaryRepFilter);
      if (secondaryRepFilter) params.set("secondaryRep", secondaryRepFilter);
      if (customerTypeFilter) params.set("customerType", customerTypeFilter);
      if (addressTypeFilter) params.set("addressType", addressTypeFilter);
      const r = await fetch(`/api/crm/metrics?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load metrics");
      return r.json() as Promise<{ total: number; healthy: number; watch: number; at_risk: number; lost: number; needs_follow_up: number }>;
    },
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "customers", debouncedSearch, group, stateFilter, primaryRepFilter, secondaryRepFilter, customerTypeFilter, addressTypeFilter, healthFilter, sortBy, sortDir, page],
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
      if (primaryRepFilter) params.set("primaryRep", primaryRepFilter);
      if (secondaryRepFilter) params.set("secondaryRep", secondaryRepFilter);
      if (customerTypeFilter) params.set("customerType", customerTypeFilter);
      if (addressTypeFilter) params.set("addressType", addressTypeFilter);
      if (healthFilter) params.set("health", healthFilter);
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
      if (primaryRepFilter) params.set("primaryRep", primaryRepFilter);
      if (secondaryRepFilter) params.set("secondaryRep", secondaryRepFilter);
      if (customerTypeFilter) params.set("customerType", customerTypeFilter);
      if (addressTypeFilter) params.set("addressType", addressTypeFilter);
      if (healthFilter) params.set("health", healthFilter);
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

  const activeFilterCount = [group, stateFilter, primaryRepFilter, secondaryRepFilter, customerTypeFilter, addressTypeFilter].filter(Boolean).length;
  const hasAnyFilter = activeFilterCount > 0 || !!healthFilter || !!debouncedSearch;

  const clearAllFilters = () => {
    setSearch("");
    clearTimeout((window as any).__crmSearchTimer);
    setDebouncedSearch("");
    setGroup("");
    setStateFilter("");
    setHealthFilter("");
    setPrimaryRepFilter("");
    setSecondaryRepFilter("");
    setCustomerTypeFilter("");
    setAddressTypeFilter("");
    setPage(1);
  };

  // ── Table helpers ─────────────────────────────────────────────────────────
  const thBase = "relative px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap select-none";
  const stickyTh = `${thBase} sticky left-0 z-20 bg-slate-50`;

  const ResizeHandle = ({ col }: { col: ColKey }) => (
    <div
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center group/rh z-10"
      onMouseDown={e => startResize(col, e)}
      onDoubleClick={() => resetWidth(col)}
    >
      <div className="w-px h-4 bg-slate-300 group-hover/rh:bg-blue-400 group-hover/rh:h-full transition-all" />
    </div>
  );

  const sortTh = (field: SortField, label: string, col: ColKey, sticky = false) => (
    <th
      className={sticky ? stickyTh : thBase}
      style={{ width: colWidths[col], minWidth: COL_MIN_WIDTHS[col] }}
    >
      <span
        className="flex items-center gap-0.5 cursor-pointer hover:text-slate-700 pr-2"
        onClick={() => toggleSort(field)}
      >
        {label}
        {sortBy === field
          ? sortDir === "asc"
            ? <ArrowUp className="h-3 w-3 text-blue-500 ml-1 shrink-0" />
            : <ArrowDown className="h-3 w-3 text-blue-500 ml-1 shrink-0" />
          : <ArrowUpDown className="h-3 w-3 text-slate-400 ml-1 shrink-0" />}
      </span>
      <ResizeHandle col={col} />
    </th>
  );

  const plainTh = (label: string, col: ColKey) => (
    <th
      className={thBase}
      style={{ width: colWidths[col], minWidth: COL_MIN_WIDTHS[col] }}
    >
      <span className="pr-2">{label}</span>
      <ResizeHandle col={col} />
    </th>
  );

  return (
    <div className="flex flex-col h-full">

      {/* ── Health Cards ─────────────────────────────────────────────────────── */}
      {metrics && (
        <div className="border-b bg-white px-3 sm:px-4 py-2 sm:py-3 shrink-0">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {HEALTH_CARDS.map(card => {
              const isActive = healthFilter === card.key;
              const count = metrics[card.metricKey] ?? 0;
              const Icon = card.icon;
              return (
                <button
                  key={card.key || "total"}
                  data-testid={`metric-${card.label.toLowerCase().replace(" ", "-")}`}
                  onClick={() => toggleHealthFilter(card.key)}
                  className={`flex flex-col sm:flex-row items-center sm:justify-between rounded-lg border px-1.5 py-1.5 sm:px-4 sm:py-3 text-left transition-all cursor-pointer w-full gap-0.5 sm:gap-0 ${isActive ? card.active : card.inactive}`}
                >
                  <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                    <Icon className={`h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 ${isActive ? card.activeLabelCls : card.iconCls}`} />
                    <span className={`text-[10px] sm:text-sm font-semibold leading-tight ${isActive ? card.activeLabelCls : card.labelCls}`}>
                      {card.label}
                    </span>
                  </div>
                  <span className={`text-base sm:text-3xl font-bold leading-none sm:ml-2 tabular-nums ${isActive ? card.activeCountCls : card.countCls}`}>
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-800">CRM Customers</h1>
            <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString()} customers from local mirror</p>
          </div>
          <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
            <Popover open={showColMenu} onOpenChange={setShowColMenu}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" data-testid="btn-columns">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-3">
                <p className="text-xs font-semibold text-slate-700 mb-2.5">Show / Hide Columns</p>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto overscroll-contain pr-0.5">
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

            {canExport && (
              <>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => handleExport("csv")} disabled={exporting === "csv"} data-testid="btn-export-csv">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{exporting === "csv" ? "Exporting…" : "Export"} </span>CSV
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => handleExport("xlsx")} disabled={exporting === "xlsx"} data-testid="btn-export-xlsx">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{exporting === "xlsx" ? "Exporting…" : "Export"} </span>Excel
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant={showFilters ? "default" : "outline"}
              className="h-8 text-xs gap-1 relative"
              onClick={() => setShowFilters(v => !v)}
              data-testid="btn-toggle-filters"
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {hasAnyFilter && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border border-white" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter drawer ─────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="border-b bg-white px-4 pb-3 pt-2 shrink-0">
          <div className="bg-slate-50 border rounded-xl p-3 space-y-2.5">

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                data-testid="input-crm-search"
                value={search}
                onChange={e => debounce(e.target.value)}
                placeholder="Search company, customer name, email, phone…"
                className="pl-8 h-8 text-sm w-full"
              />
            </div>

            {/* Filter dropdowns */}
            <div className="flex flex-wrap gap-2">
              <Select value={group || "__all__"} onValueChange={v => setGroupFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-44" data-testid="select-group-filter">
                  <SelectValue placeholder="All Groups" />
                </SelectTrigger>
                <SelectContent className="min-w-[min(280px,calc(100vw-2rem))]">
                  <SelectItem value="__all__">All Groups</SelectItem>
                  {(filterOpts?.groups ?? []).map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stateFilter || "__all__"} onValueChange={v => setStateFilterVal(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-state-filter">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent className="min-w-[min(280px,calc(100vw-2rem))] max-h-[300px]">
                  <SelectItem value="__all__">All States</SelectItem>
                  <SelectItem value="Unknown">Unknown / Intl</SelectItem>
                  {(() => {
                    const US_STATES = new Set([
                      "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
                      "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
                      "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
                      "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
                      "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
                      "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
                      "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
                      "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
                      "District of Columbia","Washington DC",
                      "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
                      "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
                      "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
                      "TX","UT","VT","VA","WA","WV","WI","WY","DC",
                    ]);
                    const allStates = filterOpts?.states ?? [];
                    const usStates = allStates.filter(s => US_STATES.has(s)).sort((a, b) => a.localeCompare(b));
                    const intlStates = allStates.filter(s => !US_STATES.has(s)).sort((a, b) => a.localeCompare(b));
                    return (
                      <>
                        {usStates.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[11px] text-slate-400 uppercase tracking-wide">United States</SelectLabel>
                            {usStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectGroup>
                        )}
                        {intlStates.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[11px] text-slate-400 uppercase tracking-wide">International</SelectLabel>
                            {intlStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectGroup>
                        )}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>

              <Select value={primaryRepFilter || "__all__"} onValueChange={v => setPrimaryRepFilterVal(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-primary-rep-filter">
                  <SelectValue placeholder="Primary Rep" />
                </SelectTrigger>
                <SelectContent className="min-w-[min(220px,calc(100vw-2rem))]">
                  <SelectItem value="__all__">All Primary Reps</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {activeUsers.map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={secondaryRepFilter || "__all__"} onValueChange={v => setSecondaryRepFilterVal(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-secondary-rep-filter">
                  <SelectValue placeholder="Secondary Rep" />
                </SelectTrigger>
                <SelectContent className="min-w-[min(220px,calc(100vw-2rem))]">
                  <SelectItem value="__all__">All Secondary Reps</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {activeUsers.map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={customerTypeFilter || "__all__"} onValueChange={v => setCustomerTypeFilterVal(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-32" data-testid="select-customer-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  <SelectItem value="Store">Store</SelectItem>
                  <SelectItem value="Distributor">Distributor</SelectItem>
                </SelectContent>
              </Select>

              <Select value={addressTypeFilter || "__all__"} onValueChange={v => setAddressTypeFilterVal(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-address-type-filter">
                  <SelectValue placeholder="All Addr. Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Addr. Types</SelectItem>
                  <SelectItem value="Commercial">Commercial</SelectItem>
                  <SelectItem value="Residential">Residential</SelectItem>
                  <SelectItem value="Unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasAnyFilter && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-500 gap-1"
                  onClick={clearAllFilters}
                  data-testid="btn-clear-filters"
                >
                  <X className="h-3 w-3" />Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
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
          <table className="text-sm border-collapse" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
            <colgroup>
              {vis("company")        && <col style={{ width: colWidths.company }} />}
              {vis("customer_name")  && <col style={{ width: colWidths.customer_name }} />}
              {vis("email")          && <col style={{ width: colWidths.email }} />}
              {vis("phone")          && <col style={{ width: colWidths.phone }} />}
              {vis("city")           && <col style={{ width: colWidths.city }} />}
              {vis("state")          && <col style={{ width: colWidths.state }} />}
              {vis("customer_group") && <col style={{ width: colWidths.customer_group }} />}
              {vis("customer_type")  && <col style={{ width: colWidths.customer_type }} />}
              {vis("address_type")   && <col style={{ width: colWidths.address_type }} />}
              {vis("primary_rep")    && <col style={{ width: colWidths.primary_rep }} />}
              {vis("secondary_rep")  && <col style={{ width: colWidths.secondary_rep }} />}
              {vis("last_order")     && <col style={{ width: colWidths.last_order }} />}
              {vis("days_since")     && <col style={{ width: colWidths.days_since }} />}
              {vis("orders")         && <col style={{ width: colWidths.orders }} />}
              {vis("revenue")        && <col style={{ width: colWidths.revenue }} />}
              {vis("store_credit")   && <col style={{ width: colWidths.store_credit }} />}
              {vis("last_follow_up") && <col style={{ width: colWidths.last_follow_up }} />}
            </colgroup>
            <thead className="sticky top-0 bg-slate-50 border-b z-10">
              <tr>
                {vis("company")        && sortTh("company",            "Company",        "company",        true)}
                {vis("customer_name")  && sortTh("first_name",         "Customer Name",  "customer_name")}
                {vis("email")          && plainTh("Email",                                "email")}
                {vis("phone")          && plainTh("Phone",                                "phone")}
                {vis("city")           && sortTh("city",                 "City",          "city")}
                {vis("state")          && sortTh("state",              "State",          "state")}
                {vis("customer_group") && sortTh("customer_group_name","Customer Group", "customer_group")}
                {vis("customer_type")  && sortTh("customer_type",       "Cust. Type",     "customer_type")}
                {vis("address_type")   && sortTh("address_type",        "Addr. Type",     "address_type")}
                {vis("primary_rep")    && sortTh("primary_rep_name",    "Primary Rep",    "primary_rep")}
                {vis("secondary_rep")  && sortTh("secondary_rep_name",  "Secondary Rep",  "secondary_rep")}
                {vis("last_order")     && sortTh("last_order_date",    "Last Order",     "last_order")}
                {vis("days_since")     && sortTh("days_since_order",   "Days Since",     "days_since")}
                {vis("orders")         && sortTh("lifetime_orders",    "Orders",         "orders")}
                {vis("revenue")        && sortTh("lifetime_revenue",   "Revenue",        "revenue")}
                {vis("store_credit")   && sortTh("store_credit_balance", "Store Credit", "store_credit")}
                {vis("last_follow_up") && sortTh("last_follow_up",       "Last Follow-Up","last_follow_up")}
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
                const cityVal = (c.shipping_address as any)?.city
                  || (c.billing_address as any)?.city
                  || null;
                const followUpDate = (c as any).last_follow_up_date ?? null;
                const followUpBy = (c as any).last_follow_up_by ?? null;
                return (
                  <tr
                    key={c.id}
                    data-testid={`row-customer-${c.id}`}
                    className="group border-b hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/crm/customers/${c.id}`)}
                  >
                    {vis("company") && (
                      <td
                        className="px-3 py-2.5 sticky left-0 z-10 bg-white group-hover:bg-blue-50 transition-colors border-r border-slate-100"
                        style={{ maxWidth: colWidths.company }}
                      >
                        <span className="font-bold text-slate-800 block truncate">{c.company || "—"}</span>
                      </td>
                    )}
                    {vis("customer_name")  && <td className="px-3 py-2.5 text-slate-700 truncate" style={{ maxWidth: colWidths.customer_name }}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>}
                    {vis("email") && (
                      <td className="px-3 py-2.5 truncate" style={{ maxWidth: colWidths.email }}>
                        {c.email
                          ? <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline">
                              <Mail className="h-3 w-3 shrink-0 opacity-60" />{c.email}
                            </a>
                          : <span className="text-slate-400">—</span>}
                      </td>
                    )}
                    {vis("phone") && (
                      <td className="px-3 py-2.5 truncate" style={{ maxWidth: colWidths.phone }}>
                        {c.phone
                          ? <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline">
                              <Phone className="h-3 w-3 shrink-0 opacity-60" />{c.phone}
                            </a>
                          : <span className="text-slate-400">—</span>}
                      </td>
                    )}
                    {vis("city") && (
                      <td className="px-3 py-2.5 text-slate-700 font-medium">{cityVal || <span className="text-slate-400">—</span>}</td>
                    )}
                    {vis("state")          && <td className="px-3 py-2.5 text-slate-700 font-medium">{stateVal || <span className="text-slate-400">—</span>}</td>}
                    {vis("customer_group") && <td className="px-3 py-2.5 text-slate-600 truncate" style={{ maxWidth: colWidths.customer_group }}>{c.customer_group_name || <span className="text-slate-400">—</span>}</td>}
                    {vis("customer_type") && (
                      <td className="px-3 py-2.5">
                        {c.customer_type === "Distributor"
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-700">Distributor</span>
                          : c.customer_type === "Store"
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700">Store</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                    )}
                    {vis("address_type") && (
                      <td className="px-3 py-2.5">
                        {c.address_type === "Commercial"
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700">Commercial</span>
                          : c.address_type === "Residential"
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-orange-100 text-orange-700">Residential</span>
                          : <span className="text-slate-400">Unknown</span>}
                      </td>
                    )}
                    {vis("primary_rep") && (
                      <td className="px-3 py-2.5 text-xs">
                        {c.primary_rep_name ? <Badge variant="secondary" className="text-xs">{c.primary_rep_name}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                    )}
                    {vis("secondary_rep") && (
                      <td className="px-3 py-2.5 text-xs">
                        {c.secondary_rep_name ? <Badge variant="secondary" className="text-xs">{c.secondary_rep_name}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                    )}
                    {vis("last_order")     && (
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                        {c.last_order_date ? formatDistanceToNow(new Date(c.last_order_date), { addSuffix: true }) : "—"}
                      </td>
                    )}
                    {vis("days_since")     && <td className={`px-3 py-2.5 whitespace-nowrap ${daysColor}`}>{days != null ? `${days}d` : "—"}</td>}
                    {vis("orders")         && <td className="px-3 py-2.5 text-right text-slate-700">{(c.lifetime_orders ?? 0).toLocaleString()}</td>}
                    {vis("revenue")        && <td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtCurrency(c.lifetime_revenue)}</td>}
                    {vis("store_credit")   && (
                      <td className="px-3 py-2.5 text-right font-medium text-teal-700">
                        {Number(c.store_credit_balance ?? 0) > 0 ? fmtCurrency(c.store_credit_balance) : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {vis("last_follow_up") && (
                      <td className="px-3 py-2.5">
                        {followUpDate ? (
                          <div>
                            <span className="text-slate-700 whitespace-nowrap text-xs font-medium">
                              {formatDistanceToNow(new Date(followUpDate), { addSuffix: true })}
                            </span>
                            {followUpBy && (
                              <div className="text-[11px] text-slate-400 truncate">{followUpBy}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">No Follow-Up</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────────── */}
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
