import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileText, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, AlertTriangle, X, User } from "lucide-react";
import { useTimeService } from "@/hooks/useTimeService";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 50;

type SortField = "last_order_date" | "company" | "first_name" | "lifetime_orders" | "lifetime_revenue";

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function fmtCurrency(v: string | number | null): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}


const HEALTH_COLORS: Record<string, string> = {
  "At Risk":  "bg-orange-100 text-orange-700 border-orange-200",
  "Lost":     "bg-red-100 text-red-700 border-red-200",
  "Watch":    "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Healthy":  "bg-green-100 text-green-700 border-green-200",
};

function HealthBadge({ health }: { health: string | null }) {
  if (!health) return <span className="text-slate-400">—</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${HEALTH_COLORS[health] ?? "bg-slate-100 text-slate-600"}`}>
      {health}
    </span>
  );
}

export default function CRMReactivation() {
  const [, setLocation] = useLocation();
  const fmt = useTimeService();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [group, setGroup] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [health, setHealth] = useState("");
  const [rep, setRep] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("last_order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const debounce = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((window as any).__reactTimer);
    (window as any).__reactTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
    setPage(1);
  };

  const { data: filterOpts } = useQuery({
    queryKey: ["crm", "filters"],
    queryFn: async () => {
      const r = await fetch("/api/crm/filters", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load filters");
      return r.json() as Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }>;
    },
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "reactivation", debouncedSearch, group, stateFilter, health, rep, sortBy, sortDir, page],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch, sortBy, sortDir, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      if (group) params.set("group", group);
      if (stateFilter) params.set("state", stateFilter);
      if (health) params.set("health", health);
      if (rep) params.set("rep", rep);
      const r = await fetch(`/api/crm/reactivation?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load");
      return r.json() as Promise<{ customers: any[]; total: number }>;
    },
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeFilters = [group, stateFilter, health, rep].filter(Boolean).length;

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ search: debouncedSearch, sortBy, sortDir, format: "csv", limit: "5000", offset: "0" });
      if (group) params.set("group", group);
      if (stateFilter) params.set("state", stateFilter);
      if (health) params.set("health", health);
      if (rep) params.set("rep", rep);
      const r = await fetch(`/api/crm/reactivation?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Export failed");
      const json = await r.json();
      const rows = json.customers ?? [];
      const header = ["Company", "First Name", "Last Name", "Email", "Phone", "State", "Customer Group", "Last Order Date", "Days Since Last Order", "Lifetime Orders", "Lifetime Revenue", "Assigned Rep", "Account Health"];
      const csvRows = rows.map((c: any) => {
        const state = (c.shipping_address as any)?.state || (c.billing_address as any)?.state || "";
        const days = daysSince(c.last_order_date);
        return [
          c.company ?? "", c.first_name ?? "", c.last_name ?? "", c.email ?? "", c.phone ?? "",
          state, c.customer_group_name ?? "",
          c.last_order_date ? fmt.date(c.last_order_date) : "",
          days != null ? String(days) : "",
          c.lifetime_orders ?? 0,
          c.lifetime_revenue ?? "0",
          c.sales_rep_name ?? "",
          c.account_health ?? "",
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      });
      const csv = [header.join(","), ...csvRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `reactivation-${new Date().toISOString().split("T")[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Export Failed", description: e.message, variant: "destructive" });
    } finally { setExporting(false); }
  };

  const thClass = "px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap";
  const sortTh = (field: SortField, label: string) => (
    <th className={`${thClass} cursor-pointer hover:text-slate-700 select-none`} onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-0.5">
        {label}
        {sortBy === field
          ? sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-500 ml-1" /> : <ArrowDown className="h-3 w-3 text-blue-500 ml-1" />
          : <ArrowUpDown className="h-3 w-3 text-slate-400 ml-1" />}
      </span>
    </th>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-4 py-3 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Reactivation Opportunities
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString()} customers needing attention</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleExport} disabled={exporting} data-testid="btn-export-reactivation">
            <FileText className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input data-testid="input-reactivation-search" value={search} onChange={e => debounce(e.target.value)} placeholder="Search company, name, email…" className="pl-8 h-8 text-sm w-56" />
          </div>

          <Select value={health || "__all__"} onValueChange={v => { setHealth(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 text-sm w-36" data-testid="select-health-filter">
              <SelectValue placeholder="All Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Health</SelectItem>
              <SelectItem value="At Risk">At Risk</SelectItem>
              <SelectItem value="Lost">Lost</SelectItem>
            </SelectContent>
          </Select>

          <Select value={group || "__all__"} onValueChange={v => { setGroup(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 text-sm w-44" data-testid="select-group-filter-react">
              <SelectValue placeholder="All Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Groups</SelectItem>
              {(filterOpts?.groups ?? []).map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={stateFilter || "__all__"} onValueChange={v => { setStateFilter(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 text-sm w-32" data-testid="select-state-filter-react">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All States</SelectItem>
              <SelectItem value="Unknown">Unknown / Intl</SelectItem>
              {(filterOpts?.states ?? []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {(filterOpts?.reps ?? []).length > 0 && (
            <Select value={rep || "__all__"} onValueChange={v => { setRep(v === "__all__" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-8 text-sm w-40" data-testid="select-rep-filter">
                <SelectValue placeholder="All Reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Reps</SelectItem>
                {(filterOpts?.reps ?? []).map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-500 gap-1" onClick={() => { setGroup(""); setStateFilter(""); setHealth(""); setRep(""); setPage(1); }} data-testid="btn-clear-filters">
              <X className="h-3 w-3" /> Clear ({activeFilters})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <AlertTriangle className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No customers found</p>
            <p className="text-xs mt-1">Try adjusting your filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead className="sticky top-0 bg-slate-50 border-b z-10">
              <tr>
                {sortTh("company", "Company")}
                {sortTh("first_name", "Customer")}
                <th className={thClass}>State</th>
                <th className={thClass}>Customer Group</th>
                {sortTh("last_order_date", "Last Order")}
                <th className={thClass}>Days Since</th>
                {sortTh("lifetime_orders", "Orders")}
                {sortTh("lifetime_revenue", "Revenue")}
                <th className={thClass}>Assigned Rep</th>
                <th className={thClass}>Health</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const days = daysSince(c.last_order_date);
                const daysColor = days == null ? "text-slate-400" : days > 90 ? "text-red-500 font-semibold" : "text-amber-500";
                const stateVal = (c.shipping_address as any)?.state || (c.billing_address as any)?.state || null;
                return (
                  <tr key={c.id} data-testid={`row-reactivation-${c.id}`} className="border-b hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => setLocation(`/crm/customers/${c.id}`)}>
                    <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[160px] truncate">{c.company || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{stateVal || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-[150px] truncate">{c.customer_group_name || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{c.last_order_date ? fmt.relative(c.last_order_date) : "—"}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap ${daysColor}`}>{days != null ? `${days}d` : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{(c.lifetime_orders ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtCurrency(c.lifetime_revenue)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {c.sales_rep_name ? <Badge variant="secondary" className="text-xs">{c.sales_rep_name}</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5"><HealthBadge health={c.account_health} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t bg-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500">Page {page} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} total</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="btn-prev-page-react">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid="btn-next-page-react">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
