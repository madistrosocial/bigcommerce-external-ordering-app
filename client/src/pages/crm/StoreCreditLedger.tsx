import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import * as api from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Search, Download } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LedgerRow {
  _source: "ledger" | "usage";
  id: string;                          // prefixed to avoid collisions
  customer_id: number | null;
  bigcommerce_customer_id: number | null;
  bigcommerce_order_id: number | null;
  order_id: number | null;
  type: string;                        // "issued" | "redeemed" | "usage"
  amount: string;
  tax: string;
  reason: string | null;
  products: any[] | null;
  issued_by: number | null;
  issued_by_name: string | null;
  created_at: string;
  customer_name: string | null;
  // usage-only extras
  credit_before?: string;
  credit_remaining?: string;
}

type TypeFilter = "all" | "issued" | "redeemed" | "usage";

function fmtCurrency(v: string | number | null) {
  const n = parseFloat(String(v ?? "0"));
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ── Type badge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const cfg =
    type === "issued"   ? { cls: "bg-green-50 text-green-700",   label: "Issued"   } :
    type === "redeemed" ? { cls: "bg-blue-50 text-blue-700",     label: "Redeemed" } :
    type === "usage"    ? { cls: "bg-amber-50 text-amber-700",   label: "Usage"    } :
                          { cls: "bg-slate-100 text-slate-600",  label: type       };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StoreCreditLedger() {
  const fmt = useTimeService();
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [page, setPage]           = useState(0);
  const limit = 50;

  // For ledger API: when type is "usage"-only we skip it; when "all" we use a big limit
  const ledgerType   = typeFilter === "usage" ? null : typeFilter; // null = skip
  const usageFetch   = typeFilter === "all" || typeFilter === "usage";
  const ledgerFetch  = typeFilter !== "usage";

  // User lookup for cashier names (usage rows)
  const { data: usersData } = useQuery({
    queryKey: ["admin-users-lookup"],
    queryFn: api.getAdminUsers,
    staleTime: 300_000,
  });
  const userMap = useMemo(
    () => new Map((usersData ?? []).map(u => [u.id, u.name || u.username])),
    [usersData],
  );

  // ── Ledger query ─────────────────────────────────────────────────────────
  // In "all" mode fetch a large batch for client-side merge; otherwise paginate.
  const ledgerLimit  = typeFilter === "all" ? 500 : limit;
  const ledgerOffset = typeFilter === "all" ? 0   : page * limit;

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery<{ rows: any[]; total: number }>({
    queryKey: ["store-credit-ledger", search, dateFrom, dateTo, ledgerType, ledgerLimit, ledgerOffset],
    enabled: ledgerFetch,
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(ledgerLimit), offset: String(ledgerOffset),
        ...(search    ? { search }               : {}),
        ...(dateFrom  ? { date_from: dateFrom }  : {}),
        ...(dateTo    ? { date_to: dateTo }       : {}),
        ...(ledgerType && ledgerType !== "all" ? { type: ledgerType } : {}),
      });
      const r = await fetch(`/api/store-credit/ledger?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  // ── Usage (POS) query ─────────────────────────────────────────────────────
  const usageLimit  = typeFilter === "all" ? 500 : limit;
  const usageOffset = typeFilter === "all" ? 0   : page * limit;

  const { data: usageData, isLoading: usageLoading } = useQuery<{ rows: any[]; total: number }>({
    queryKey: ["store-credit-usage", search, dateFrom, dateTo, usageLimit, usageOffset],
    enabled: usageFetch,
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(usageLimit), offset: String(usageOffset),
        ...(search   ? { orderSearch: search } : {}),
        ...(dateFrom ? { dateFrom }            : {}),
        ...(dateTo   ? { dateTo }              : {}),
      });
      const r = await fetch(`/api/pos/store-credit-usage?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  // ── Normalize & merge ─────────────────────────────────────────────────────
  const ledgerRows: LedgerRow[] = (ledgerData?.rows ?? []).map((r: any) => ({
    _source: "ledger" as const,
    id: `led-${r.id}`,
    customer_id: r.customer_id ?? null,
    bigcommerce_customer_id: r.bigcommerce_customer_id ?? null,
    bigcommerce_order_id: r.bigcommerce_order_id ?? null,
    order_id: r.order_id ?? null,
    type: r.type,
    amount: r.amount ?? "0",
    tax: r.tax ?? "0",
    reason: r.reason ?? null,
    products: r.products ?? null,
    issued_by: r.issued_by ?? null,
    issued_by_name: r.issued_by_name ?? null,
    created_at: r.created_at,
    customer_name: r.customer_name ?? null,
  }));

  const usageRows: LedgerRow[] = (usageData?.rows ?? []).map((r: any) => ({
    _source: "usage" as const,
    id: `use-${r.id}`,
    customer_id: null,
    bigcommerce_customer_id: r.bigcommerce_customer_id ?? null,
    bigcommerce_order_id: r.bigcommerce_order_id ?? null,
    order_id: null,
    type: "usage",
    amount: r.credit_used ?? "0",
    tax: "0",
    reason: null,
    products: null,
    issued_by: r.cashier_id ?? null,
    issued_by_name: r.cashier_id ? (userMap.get(r.cashier_id) ?? `User #${r.cashier_id}`) : null,
    created_at: r.created_at,
    customer_name: r.customer_name ?? null,
    credit_before: r.credit_before,
    credit_remaining: r.credit_remaining,
  }));

  // Merge and sort for "all" mode; otherwise use respective paginated data
  const { rows, total, isLoading } = useMemo(() => {
    if (typeFilter === "all") {
      const merged = [...ledgerRows, ...usageRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const start = page * limit;
      return {
        rows: merged.slice(start, start + limit),
        total: merged.length,
        isLoading: ledgerLoading || usageLoading,
      };
    }
    if (typeFilter === "usage") {
      return { rows: usageRows, total: usageData?.total ?? 0, isLoading: usageLoading };
    }
    // "issued" | "redeemed"
    return { rows: ledgerRows, total: ledgerData?.total ?? 0, isLoading: ledgerLoading };
  }, [typeFilter, ledgerRows, usageRows, page, limit, ledgerLoading, usageLoading, ledgerData, usageData]);

  const pages = Math.ceil(total / limit);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCsv = () => {
    if (!rows.length) return;
    const headers = ["Date", "Customer", "Order #", "Type", "Amount", "Tax", "Total", "Reason", "Products", "Issued By"];
    const csvRows = rows.map(r => {
      const products = (r.products ?? []).map((p: any) => `${p.qty}x ${p.name}`).join("; ");
      const total = (parseFloat(r.amount ?? "0") + parseFloat(r.tax ?? "0")).toFixed(2);
      return [
        new Date(r.created_at).toLocaleDateString(),
        r.customer_name ?? "",
        r.bigcommerce_order_id ?? r.order_id ?? "",
        r.type,
        parseFloat(r.amount ?? "0").toFixed(2),
        parseFloat(r.tax ?? "0").toFixed(2),
        total,
        r.reason ?? "",
        products,
        r.issued_by_name ?? "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "store-credit.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = !!(search || dateFrom || dateTo || typeFilter !== "all");

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">Store Credit</h1>
              <p className="text-[12px] text-slate-500 leading-tight">{total} entries</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 sm:px-6 bg-white border-b flex items-center gap-2 flex-wrap">
        {/* Type filter */}
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v as TypeFilter); setPage(0); }}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="redeemed">Redeemed</SelectItem>
            <SelectItem value="usage">Usage</SelectItem>
          </SelectContent>
        </Select>

        {/* Search (customer / order / user) */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search customer, order, user…"
            className="pl-8 text-sm h-8"
          />
        </div>

        {/* Date range */}
        <input
          type="date" value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(0); }}
          className="text-sm h-8 border rounded px-2 text-slate-700"
        />
        <span className="text-slate-400 text-sm">–</span>
        <input
          type="date" value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(0); }}
          className="text-sm h-8 border rounded px-2 text-slate-700"
        />

        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setTypeFilter("all"); setPage(0); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="px-4 py-4 sm:px-6">
        <div className="bg-white border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Wallet className="h-10 w-10 mx-auto mb-3 opacity-25" />
              <p className="text-sm">No store credit entries found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Order #</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Reason</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Products</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tax</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">By</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const totalAmt = parseFloat(row.amount ?? "0") + parseFloat(row.tax ?? "0");
                    const orderNum = row.bigcommerce_order_id ?? row.order_id;
                    const products = (row.products ?? []) as any[];
                    return (
                      <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <p className="text-[13px] text-slate-700">{fmt.date(row.created_at)}</p>
                          <p className="text-[11px] text-slate-400">{fmt.time ? fmt.time(row.created_at) : ""}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[13px] text-slate-700">{row.customer_name || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {orderNum
                            ? <span className="text-[13px] font-mono text-slate-700">#{orderNum}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <TypeBadge type={row.type} />
                          {row._source === "usage" && row.credit_before !== undefined && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              ${parseFloat(row.credit_before ?? "0").toFixed(2)} → ${parseFloat(row.credit_remaining ?? "0").toFixed(2)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[13px] text-slate-600">{row.reason || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          {products.length > 0 ? (
                            <div className="space-y-0.5">
                              {products.map((p: any, i: number) => (
                                <p key={i} className="text-[11px] text-slate-600 truncate">{p.qty}× {p.name}</p>
                              ))}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] text-slate-700 tabular-nums">
                          {fmtCurrency(row.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                          {parseFloat(row.tax ?? "0") > 0
                            ? <span className="text-slate-600">{fmtCurrency(row.tax)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                          {fmtCurrency(totalAmt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[13px] text-slate-600">{row.issued_by_name || "—"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-slate-500">
              <span>{total} entries · Page {page + 1} of {pages}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
