import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wallet, Search, Download } from "lucide-react";

interface LedgerRow {
  id: number;
  customer_id: number | null;
  bigcommerce_customer_id: number | null;
  bigcommerce_order_id: number | null;
  order_id: number | null;
  type: string;
  amount: string;
  tax: string;
  reason: string | null;
  products: any[] | null;
  issued_by: number | null;
  issued_by_name: string | null;
  created_at: string;
}

function fmtCurrency(v: string | number | null) {
  const n = parseFloat(String(v ?? "0"));
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const DEFAULT_TEMPLATE = `Hello {customerName},

Thank you for your most recent order with Mid Atlantic Distribution.  We apologize for any inconvenience, but due to an inventory error, there is an item that we are unable to fulfill in your order.  This item has been removed from your order and store credit has been issued to your account.

Missing Items: {missingItems}

Store Credit Applied: {creditAmount}


You will be able to apply this credit at the point of checkout on future orders.  Please feel free to reach back out with any questions or concerns. Again, we thank you for your patience and understanding while we worked to resolve this matter as quickly and effectively as possible.
We greatly appreciate your order with MA Distro and look forward to future business.



Thank you,

Mid Atlantic Distribution
1000 Parliament Court, Suite #300
Durham, North Carolina 27703
Office 1(866)818-9598 Ext 0
sales@midatlanticdistribution.com`;

export default function StoreCreditLedger() {
  const fmt = useTimeService();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery<{ rows: LedgerRow[]; total: number }>({
    queryKey: ["store-credit-ledger", search, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit), offset: String(page * limit),
        ...(search ? { search } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      });
      const r = await fetch(`/api/store-credit/ledger?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  const exportCsv = () => {
    if (!rows.length) return;
    const headers = ["Date", "Order #", "Type", "Amount", "Tax", "Total", "Reason", "Products", "Issued By"];
    const csvRows = rows.map(r => {
      const products = (r.products ?? []).map((p: any) => `${p.qty}x ${p.name}`).join("; ");
      const total = (parseFloat(r.amount ?? "0") + parseFloat(r.tax ?? "0")).toFixed(2);
      return [
        new Date(r.created_at).toLocaleDateString(),
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
    const a = document.createElement("a"); a.href = url; a.download = "store-credit-ledger.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">Store Credit Ledger</h1>
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
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search order, customer, user…"
            className="pl-8 text-sm h-8"
          />
        </div>
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
        {(search || dateFrom || dateTo) && (
          <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setPage(0); }}>
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
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Order #</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Reason</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Products</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tax</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Issued By</th>
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
                          {orderNum ? <span className="text-[13px] font-mono text-slate-700">#{orderNum}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            row.type === "issued" ? "bg-green-50 text-green-700" :
                            row.type === "redeemed" ? "bg-blue-50 text-blue-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>
                            {row.type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[13px] text-slate-600">{row.reason || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px]">
                          {products.length > 0 ? (
                            <div className="space-y-0.5">
                              {products.map((p: any, i: number) => (
                                <p key={i} className="text-[11px] text-slate-600 truncate">
                                  {p.qty}× {p.name}
                                </p>
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
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
