import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Loader2, Mail, Package, User } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getMarketingDeliveryLog, getMarketingDeliveryLogs } from "@/lib/api";
import { PageShell } from "./Marketing";

type DeliveryType = "all" | "campaign" | "order_form";

function readLogFilters(location: string) {
  const query = new URLSearchParams(location.split("?")[1] || "");
  const rawType = query.get("type");
  return {
    type: rawType === "campaign" || rawType === "order_form" ? rawType as DeliveryType : "all" as DeliveryType,
    campaignId: Number(query.get("campaignId")) || undefined,
  };
}

export default function MarketingLog({ detailId }: { detailId?: number }) {
  const [location, setLocation] = useLocation();
  const initial = readLogFilters(location);
  const [type, setType] = useState<DeliveryType>(initial.type);
  const [campaignId, setCampaignId] = useState<number | undefined>(initial.campaignId);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    const next = readLogFilters(location);
    setType(next.type);
    setCampaignId(next.campaignId);
    setOffset(0);
  }, [location]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["marketing-delivery-logs", "page", type, campaignId, offset],
    queryFn: () => getMarketingDeliveryLogs({ type, campaignId, limit, offset }),
    enabled: !detailId,
  });
  const { data: detail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["marketing-delivery-log", detailId],
    queryFn: () => getMarketingDeliveryLog(detailId!),
    enabled: Boolean(detailId),
  });

  if (detailId) {
    return <PageShell title="Marketing Log Detail" subtitle={detail?.delivery_type === "order_form" ? "Order Form delivery details" : "Campaign delivery details"} action={<Button variant="outline" onClick={() => setLocation("/marketing/log")}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Log</Button>}>
      {detailLoading ? <div className="flex min-h-64 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading log detail…</div> :
        !detail ? <p className="rounded-xl border bg-white p-10 text-center text-sm text-slate-400">Marketing log not found.</p> :
        <DeliveryLogDetail log={detail} />}
    </PageShell>;
  }

  const rows = data?.rows ?? [];
  const total = Number(data?.total ?? 0);
  const updateFilters = (nextType: DeliveryType) => {
    setOffset(0);
    setType(nextType);
    setLocation(`/marketing/log?type=${nextType}`);
  };
  return <PageShell title="Log" subtitle="Detailed recipient history for Campaigns and Order Forms" action={<Button variant="outline" onClick={() => setLocation("/marketing")}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>}>
    <section className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-slate-800">Delivery history</p><p className="mt-1 text-xs text-slate-500">Every successful recipient delivery gets its own log ID and CRM activity link.</p></div>
      <label className="text-xs font-medium text-slate-600">Show
        <select className="mt-1 block h-9 min-w-44 rounded-md border border-slate-200 bg-white px-3 text-sm" value={type} onChange={event => updateFilters(event.target.value as DeliveryType)}>
          <option value="all">Campaigns and Order Forms</option>
          <option value="campaign">Campaigns only</option>
          <option value="order_form">Order Forms only</option>
        </select>
      </label>
    </section>
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="hidden grid-cols-[70px_120px_1fr_1.4fr_150px_150px] gap-3 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid"><span>ID</span><span>Type</span><span>Receiver</span><span>Products sent</span><span>Date sent</span><span>Initiated by</span></div>
      {isLoading ? <div className="flex items-center justify-center p-12 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading log…</div> :
        rows.length ? <div className="divide-y">{rows.map((row: any) => <button key={row.id} type="button" onClick={() => setLocation(`/marketing/log/${row.id}`)} className="grid w-full gap-2 px-5 py-4 text-left hover:bg-slate-50 md:grid-cols-[70px_120px_1fr_1.4fr_150px_150px] md:items-center md:gap-3">
          <span className="text-xs font-semibold text-blue-600">#{row.id}</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">{row.delivery_type === "campaign" ? <Mail className="h-3.5 w-3.5 text-blue-500" /> : <FileText className="h-3.5 w-3.5 text-violet-500" />}{row.delivery_type === "campaign" ? "Campaign" : "Order Form"}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{row.customer_name || row.recipient_email}</span><span className="block truncate text-xs text-slate-500">{row.customer_email || row.recipient_email}</span></span>
          <span className="min-w-0 truncate text-xs text-slate-600">{Array.isArray(row.product_titles) && row.product_titles.length ? row.product_titles.join(" · ") : "No product titles recorded"}</span>
          <span className="text-xs text-slate-500">{row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}</span>
          <span className="truncate text-xs text-slate-500">{row.initiated_by_name || "Unknown user"}</span>
        </button>)}</div> :
        <p className="p-12 text-center text-sm text-slate-400">No sent delivery logs match this filter.</p>}
      <div className="flex items-center justify-between border-t bg-slate-50 px-5 py-3">
        <span className="text-xs text-slate-500">{total ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total}` : "0 records"}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - limit))}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button><Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(value => value + limit)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button></div>
      </div>
    </section>
  </PageShell>;
}

export function MarketingLogRoute() {
  const [match, params] = useRoute("/marketing/log/:id");
  return <MarketingLog detailId={match && params?.id ? Number(params.id) : undefined} />;
}

function DeliveryLogDetail({ log }: { log: any }) {
  return <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><span className="rounded-lg bg-blue-50 p-3 text-blue-600">{log.delivery_type === "campaign" ? <Mail className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Log #{log.id}</p><h2 className="text-lg font-semibold text-slate-900">{log.delivery_type === "campaign" ? "Campaign delivery" : "Order Form delivery"}</h2></div></div>
      <dl className="mt-6 space-y-4 text-sm">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Receiver</dt><dd className="mt-1 font-medium text-slate-800">{log.customer_name || log.recipient_email}</dd><dd className="text-xs text-slate-500">{log.customer_email || log.recipient_email}</dd></div>
        {log.campaign_name && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Campaign</dt><dd className="mt-1 text-slate-800">{log.campaign_name}</dd></div>}
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date sent</dt><dd className="mt-1 text-slate-800">{log.sent_at ? new Date(log.sent_at).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Initiated by</dt><dd className="mt-1 flex items-center gap-1.5 text-slate-800"><User className="h-3.5 w-3.5 text-slate-400" />{log.initiated_by_name || "Unknown user"}</dd></div>
      </dl>
    </section>
    <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Package className="h-4 w-4 text-blue-500" /> Products sent</h2><p className="mt-1 text-xs text-slate-500">Product titles only; variants are intentionally not included in the marketing log.</p>{Array.isArray(log.product_titles) && log.product_titles.length ? <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">{log.product_titles.map((title: string, index: number) => <li key={`${title}-${index}`}>{title}</li>)}</ol> : <p className="mt-4 rounded-lg border border-dashed p-6 text-sm text-slate-400">No product titles were recorded for this delivery.</p>}</section>
  </div>;
}