import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as api from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, Loader2 } from "lucide-react";

export default function InventoryPushLogs() {
  const [, navigate] = useLocation();
  const fmt = useTimeService();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["inventory-push-logs"],
    queryFn: api.getInventoryPushLogs,
  });

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
          <h1 className="text-base font-bold text-slate-800">
            Manual Inventory Push Logs
          </h1>
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {logs.length} record{logs.length !== 1 ? "s" : ""}
        </span>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No inventory pushes recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
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
      </div>
    </div>
  );
}
