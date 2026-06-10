import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, FileText, FileSpreadsheet, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type SortField = "last_order_date" | "lifetime_revenue" | "lifetime_orders" | "days_since_order";

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function fmtCurrency(v: string | number | null): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: "asc" | "desc" }) {
  if (field !== current) return <ArrowUpDown className="h-3 w-3 text-slate-400 ml-1" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-500 ml-1" /> : <ArrowDown className="h-3 w-3 text-blue-500 ml-1" />;
}

const PAGE_SIZE = 50;

export default function CRMCustomers() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("last_order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

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
    else { setSortBy(field); setSortDir(field === "last_order_date" ? "desc" : "desc"); }
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "customers", debouncedSearch, sortBy, sortDir, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        sortBy,
        sortDir,
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
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
    <th className={`${thClass} cursor-pointer hover:text-slate-700 select-none`} onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-0.5">
        {label}<SortIcon field={field} current={sortBy} dir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-white px-4 py-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">CRM Customers</h1>
            <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString()} customers from local mirror</p>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
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
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => handleExport("csv")}
              disabled={exporting === "csv"}
              data-testid="btn-export-csv"
            >
              <FileText className="h-3.5 w-3.5" />
              {exporting === "csv" ? "Exporting…" : "Export CSV"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => handleExport("xlsx")}
              disabled={exporting === "xlsx"}
              data-testid="btn-export-xlsx"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading customers…</div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <User className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No customers found</p>
            <p className="text-xs mt-1">Try adjusting your search or sync customers from Admin → CRM Settings.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead className="sticky top-0 bg-slate-50 border-b">
              <tr>
                <th className={thClass}>Company</th>
                <th className={thClass}>Customer Name</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>Phone</th>
                {sortTh("last_order_date", "Last Order")}
                {sortTh("days_since_order", "Days Since")}
                {sortTh("lifetime_orders", "Orders")}
                {sortTh("lifetime_revenue", "Revenue")}
                <th className={thClass}>Sales Rep</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const days = daysSince(c.last_order_date);
                const daysColor = days == null ? "text-slate-400" : days > 90 ? "text-red-500 font-semibold" : days > 30 ? "text-amber-500" : "text-green-600";
                return (
                  <tr
                    key={c.id}
                    data-testid={`row-customer-${c.id}`}
                    className="border-b hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/crm/customers/${c.id}`)}
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[180px] truncate">{c.company || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate">{c.email || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.phone || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                      {c.last_order_date ? formatDistanceToNow(new Date(c.last_order_date), { addSuffix: true }) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap ${daysColor}`}>
                      {days != null ? `${days}d` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{(c.lifetime_orders ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtCurrency(c.lifetime_revenue)}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">
                      {c.sales_rep_name ? <Badge variant="secondary" className="text-xs">{c.sales_rep_name}</Badge> : "—"}
                    </td>
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
