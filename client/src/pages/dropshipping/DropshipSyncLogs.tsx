import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";

function statusClass(status: string) {
  return status === "completed" ? "bg-green-100 text-green-700" : status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
}

export default function DropshipSyncLogsPage() {
  const { data: connection } = useQuery({ queryKey: ["dropship-connection"], queryFn: api.getKoleConnection });
  const { data = [], isLoading, refetch, isFetching } = useQuery({ queryKey: ["dropship-sync-logs"], queryFn: api.getKoleSyncLogs });
  const displayName = connection?.displayName || "Vendor Catalog";
  return (
    <div className="px-4 md:px-6 py-5 space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-800">Sync Logs</h1><p className="text-sm text-slate-500 mt-1">{displayName} catalog ingestion history. No BigCommerce or SkuVault writes are performed by these syncs.</p></div><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button></div>
      <Card className="shadow-sm overflow-hidden">
        {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : data.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">No catalog syncs have run yet.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 border-b border-slate-200"><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Started</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Processed</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Errors</th><th className="px-4 py-3">Duration</th></tr></thead><tbody className="divide-y divide-slate-100">{data.map((log) => <tr key={log.id}><td className="px-4 py-3 whitespace-nowrap">{new Date(log.started_at).toLocaleString()}</td><td className="px-4 py-3"><Badge className={`${statusClass(log.status)} border-0`}>{log.status}</Badge>{log.error_summary && <p className="text-xs text-red-600 mt-1 max-w-sm">{log.error_summary}</p>}</td><td className="px-4 py-3">{log.products_processed.toLocaleString()}</td><td className="px-4 py-3">{log.products_created.toLocaleString()}</td><td className="px-4 py-3">{log.products_updated.toLocaleString()}</td><td className="px-4 py-3">{log.error_count.toLocaleString()}</td><td className="px-4 py-3">{log.duration_ms == null ? "—" : `${(log.duration_ms / 1000).toFixed(1)}s`}</td></tr>)}</tbody></table></div>}
      </Card>
    </div>
  );
}