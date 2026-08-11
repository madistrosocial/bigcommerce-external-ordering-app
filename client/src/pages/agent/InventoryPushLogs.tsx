import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as api from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Package, Loader2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

const PAGE_SIZE = 25;

export default function InventoryPushLogs() {
  const [, navigate] = useLocation();
  const fmt = useTimeService();

  // Filter state
  const [search, setSearch] = useState("");
  const [username, setUsername] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  // Applied filters (committed on Enter / blur for search, immediate for others)
  const [appliedSearch, setAppliedSearch] = useState("");

  const applySearch = useCallback(() => {
    setAppliedSearch(search);
    setPage(0);
  }, [search]);

  const clearFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setUsername("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  const hasFilters = appliedSearch || username || dateFrom || dateTo;

  // Usernames for dropdown
  const { data: usernames = [] } = useQuery<string[]>({
    queryKey: ["inventory-push-log-usernames"],
    queryFn: api.getInventoryPushLogUsernames,
  });

  // Log data
  const { data, isLoading } = useQuery<{ rows: api.InventoryPushLog[]; total: number }>({
    queryKey: ["inventory-push-logs", page, appliedSearch, username, dateFrom, dateTo],
    queryFn: () =>
      api.getInventoryPushLogs({
        page,
        limit: PAGE_SIZE,
        search: appliedSearch || undefined,
        username: username || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const logs = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/pos")}
          data-testid="button-back-pos"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to POS
        </Button>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-slate-600" />
          <h1 className="text-base font-bold text-slate-800">Manual Inventory Push Logs</h1>
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {isLoading ? "Loading…" : `${total.toLocaleString()} record${total !== 1 ? "s" : ""}`}
        </span>
      </header>

      {/* Filter bar */}
      <div className="bg-white border-b px-4 py-3 flex flex-wrap items-center gap-2 shrink-0">
        {/* Product / SKU search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input
            className="pl-7 h-8 text-sm"
            placeholder="Product name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            onBlur={applySearch}
          />
        </div>

        {/* Date from */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 whitespace-nowrap">From</span>
          <Input
            type="date"
            className="h-8 text-sm w-36"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
          />
        </div>

        {/* Date to */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 whitespace-nowrap">To</span>
          <Input
            type="date"
            className="h-8 text-sm w-36"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
          />
        </div>

        {/* User dropdown */}
        {usernames.length > 0 && (
          <Select
            value={username || "all"}
            onValueChange={(v) => { setUsername(v === "all" ? "" : v); setPage(0); }}
          >
            <SelectTrigger className="h-8 text-sm w-40">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {usernames.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-3">
        {isLoading && !data ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">{hasFilters ? "No logs match the current filters." : "No inventory pushes recorded yet."}</p>
          </div>
        ) : (
          <div className={`bg-white rounded-lg border shadow-sm overflow-hidden transition-opacity ${isLoading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm" data-testid="table-push-logs">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Product</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Variant</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">SKU</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Before</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Added</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">After</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50" data-testid={`log-row-${log.id}`}>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">
                      {fmt.dateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {log.username || `User #${log.user_id}`}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-[200px] truncate">
                      {log.product_name || `Product #${log.product_id}`}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {log.variant_name || `Variant #${log.variant_id}`}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                      {log.sku}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {log.previous_inventory}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">
                      +{log.quantity_added}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                      {log.new_inventory}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs italic max-w-[160px] truncate">
                      {log.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-500">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} result{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={page === 0 || isLoading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="ml-1 text-xs">Previous</span>
              </Button>
              <span className="text-xs text-slate-500 px-2">
                Page {page + 1} of {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                disabled={page >= totalPages - 1 || isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                <span className="mr-1 text-xs">Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
