import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTimeService } from "@/hooks/useTimeService";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Wallet, Loader2 } from "lucide-react";

export default function StoreCreditUsageReportPage() {
  const [, navigate] = useLocation();
  const fmt = useTimeService();
  const [orderSearch, setOrderSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: usersData } = useQuery({
    queryKey: ["admin-users-lookup"],
    queryFn: api.getAdminUsers,
  });
  const userMap = new Map((usersData || []).map((u) => [u.id, u.name || u.username]));

  const { data, isLoading } = useQuery({
    queryKey: ["store-credit-usage-report", orderSearch, dateFrom, dateTo, page],
    queryFn: () =>
      api.getStoreCreditUsageReport({
        orderSearch: orderSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset: page * limit,
      }),
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalUsed = rows.reduce((sum, r) => sum + Number(r.credit_used), 0);

  return (
    <div className="bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/pos")} data-testid="button-back-pos">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-600" />
          <h1 className="text-base font-bold text-slate-800">Store Credit Usage</h1>
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {total} record{total !== 1 ? "s" : ""}
        </span>
      </header>

      <div className="bg-white border-b px-4 py-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Order #</label>
          <Input
            value={orderSearch}
            onChange={(e) => { setOrderSearch(e.target.value); setPage(0); }}
            placeholder="Search order"
            className="w-40 h-8 text-sm"
            data-testid="input-filter-order"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="h-8 text-sm"
            data-testid="input-filter-date-from"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="h-8 text-sm"
            data-testid="input-filter-date-to"
          />
        </div>
        <div className="ml-auto text-sm text-slate-600" data-testid="text-total-credit-used">
          Total credit used (this page): <span className="font-bold text-emerald-600">${totalUsed.toFixed(2)}</span>
        </div>
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Wallet className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No store credit usage recorded.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <table className="w-full text-sm" data-testid="table-store-credit-usage">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Cashier</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Customer</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Before</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Used</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Remaining</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Order Total Before</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Final Total</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Order</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-credit-usage-${row.id}`}>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">
                      {fmt.dateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{userMap.get(row.cashier_id) || `User #${row.cashier_id}`}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.customer_name || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">${Number(row.credit_before).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-600">-${Number(row.credit_used).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">${Number(row.credit_remaining).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">${Number(row.order_total_before).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">${Number(row.final_order_total).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {row.bigcommerce_order_id ? `#${row.bigcommerce_order_id}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > limit && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} data-testid="button-prev-page">
              Previous
            </Button>
            <span className="text-xs text-slate-500">
              Page {page + 1} of {Math.ceil(total / limit)}
            </span>
            <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
