import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ClipboardList, Search, RefreshCw, CheckCircle2,
  AlertTriangle, XCircle, ArrowLeftRight, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductLinkLog {
  id: number;
  main_product_id: number;
  main_product_name: string;
  linked_product_id: number;
  linked_product_name: string;
  bidirectional: boolean;
  created_by_user_id: number;
  created_by_name: string;
  status: string;
  results: { productId: number; direction: string; success: boolean; error?: string }[];
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-[11px]">
      <CheckCircle2 className="h-3 w-3" /> Success
    </Badge>
  );
  if (status === "partial") return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-[11px]">
      <AlertTriangle className="h-3 w-3" /> Partial
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-[11px]">
      <XCircle className="h-3 w-3" /> Failed
    </Badge>
  );
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

async function fetchLogs(): Promise<ProductLinkLog[]> {
  const res = await fetch("/api/tools/bc/product-link-logs", { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to load logs");
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BCProductLinkLogs() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: logs = [], isLoading, error, refetch, isFetching } = useQuery<ProductLinkLog[]>({
    queryKey: ["product-link-logs"],
    queryFn: fetchLogs,
  });

  const filtered = logs.filter((log) => {
    const q = search.toLowerCase();
    return (
      log.main_product_name.toLowerCase().includes(q) ||
      log.linked_product_name.toLowerCase().includes(q) ||
      log.created_by_name.toLowerCase().includes(q) ||
      log.status.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => setLocation("/tools/bc-product-link")}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
          data-testid="btn-back-link"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <ClipboardList className="h-5 w-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">Product Link Logs</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
          data-testid="btn-refresh-logs"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
      </header>

      {/* Search bar */}
      <div className="px-4 py-3 bg-white border-b">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, users, status…"
            className="pl-9 text-sm h-9"
            data-testid="input-log-search"
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 py-2 border-b bg-white flex items-center gap-4 text-xs text-slate-500">
        <span><strong className="text-slate-700">{filtered.length}</strong> {filtered.length === 1 ? "entry" : "entries"}</span>
        <span className="text-emerald-600 font-medium">{filtered.filter(l => l.status === "success").length} success</span>
        <span className="text-amber-600 font-medium">{filtered.filter(l => l.status === "partial").length} partial</span>
        <span className="text-red-600 font-medium">{filtered.filter(l => l.status === "failed").length} failed</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading logs…
          </div>
        )}

        {error && (
          <div className="m-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-2">
            <ClipboardList className="h-10 w-10 opacity-30" />
            <p className="text-sm">{search ? "No results match your search" : "No product links have been created yet"}</p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="divide-y">
            {filtered.map((log) => {
              const expanded = expandedId === log.id;
              return (
                <div key={log.id} className="bg-white" data-testid={`log-row-${log.id}`}>
                  {/* Main row */}
                  <button
                    className="w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Direction icon */}
                      <div className="mt-0.5 shrink-0 text-slate-400">
                        {log.bidirectional
                          ? <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                          : <ArrowRight className="h-4 w-4 text-slate-400" />}
                      </div>

                      {/* Product names */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                          <span className="text-[13px] font-semibold text-slate-800 truncate">{log.main_product_name}</span>
                          <span className="text-slate-400 text-xs">→</span>
                          <span className="text-[13px] text-slate-700 truncate">{log.linked_product_name}</span>
                          {log.bidirectional && (
                            <Badge className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 py-0">Both ways</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11px] text-slate-500">by <strong>{log.created_by_name}</strong></span>
                          <span className="text-[11px] text-slate-400">{formatDate(log.created_at)}</span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="shrink-0">
                        <StatusBadge status={log.status} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="px-4 pb-4 bg-slate-50 border-t">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide pt-3 pb-2">API Results</p>
                      <div className="space-y-1.5">
                        {log.results.length === 0 && (
                          <p className="text-xs text-slate-400 italic">No result details recorded.</p>
                        )}
                        {log.results.map((r, i) => (
                          <div key={i} className={cn(
                            "rounded-md px-3 py-2 text-xs flex items-start gap-2",
                            r.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
                          )}>
                            {r.success
                              ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                              : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />}
                            <span>
                              <strong>BC Product {r.productId}</strong> — {r.direction}
                              {r.error && <span className="block text-[11px] opacity-80 mt-0.5">{r.error}</span>}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-600">
                        <div><span className="text-slate-400">Main Product ID:</span> {log.main_product_id}</div>
                        <div><span className="text-slate-400">Linked Product ID:</span> {log.linked_product_id}</div>
                        <div><span className="text-slate-400">Direction:</span> {log.bidirectional ? "Bidirectional" : "One-way"}</div>
                        <div><span className="text-slate-400">Created by:</span> {log.created_by_name}</div>
                        <div className="col-span-2"><span className="text-slate-400">Date:</span> {formatDate(log.created_at)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
