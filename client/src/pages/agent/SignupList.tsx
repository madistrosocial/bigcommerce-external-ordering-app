import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, Loader2, UsersRound } from "lucide-react";
import { getCustomerSignups } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTimeService } from "@/hooks/useTimeService";

const PAGE_SIZE = 50;

export default function SignupList() {
  const [page, setPage] = useState(1);
  const fmt = useTimeService();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customer-signups", page],
    queryFn: () => getCustomerSignups(page, PAGE_SIZE),
  });
  const signups = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-col gap-3 rounded-xl border bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-bold text-slate-800">Signup List</h1>
              <p className="text-xs text-slate-500">{data?.can_view_all ? "All customer signups across the team." : "Customer signups created by you."}</p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">{total.toLocaleString()} signup{total === 1 ? "" : "s"}</Badge>
        </header>

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading signups…</div>
          ) : isError ? (
            <div className="px-5 py-12 text-center text-sm text-red-600">{(error as Error).message}</div>
          ) : signups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <UsersRound className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">No customer signups found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="border-b bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Customer Group</th>
                    <th className="px-4 py-3">Signed up by</th>
                    <th className="px-4 py-3">Primary Rep</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {signups.map((signup) => (
                    <tr key={signup.id} className="text-sm text-slate-700">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{signup.first_name} {signup.last_name}</p>
                        <p className="text-xs text-slate-400">{signup.company || `BC #${signup.bigcommerce_customer_id}`}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{signup.email}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="font-normal">{signup.customer_group_name || "—"}</Badge></td>
                      <td className="px-4 py-3">{signup.signed_up_by_name}</td>
                      <td className="px-4 py-3">{signup.primary_rep_name || signup.signed_up_by_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmt.dateTime(signup.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}