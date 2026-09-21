import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MarketingDeliveryLogPreview({
  rows,
  total,
  loading,
  title = "Recent sent history",
  onViewAll,
}: {
  rows: any[];
  total: number;
  loading?: boolean;
  title?: string;
  onViewAll: () => void;
}) {
  return <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
      <div><h2 className="font-semibold text-slate-900">{title}</h2><p className="text-xs text-slate-500">Latest recipient-level delivery records</p></div>
      <Button variant="ghost" size="sm" onClick={onViewAll}>View all logs <ChevronRight className="ml-1 h-4 w-4" /></Button>
    </div>
    {loading ? <div className="flex items-center justify-center p-8 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading log…</div> :
      rows.length ? <div className="divide-y">{rows.slice(0, 10).map((row: any) => <div key={row.id} className="flex min-w-0 items-start gap-3 px-5 py-3">
        <span className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-600"><FileText className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{row.customer_name || row.customer_email || row.recipient_email}</p>
          <p className="truncate text-xs text-slate-500">{row.customer_email || row.recipient_email} · {Array.isArray(row.product_titles) && row.product_titles.length ? row.product_titles.join(" · ") : "No product titles recorded"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Log #{row.id} · {row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"} · {row.initiated_by_name || "Unknown user"}</p>
        </div>
      </div>)}</div> :
      <p className="p-8 text-center text-sm text-slate-400">No sent history recorded yet.</p>}
    {total > 10 && <div className="border-t bg-slate-50 px-5 py-3 text-xs text-slate-500">{total - 10} more log record{total - 10 === 1 ? "" : "s"} available in Marketing → Log.</div>}
  </section>;
}