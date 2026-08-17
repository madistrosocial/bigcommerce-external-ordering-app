import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  ClipboardCheck, Search, RefreshCw, Filter, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle2, Clock, Package, X,
} from "lucide-react";
import { useTimeService } from "@/hooks/useTimeService";

// ─── Constants ────────────────────────────────────────────────────────────────
const AUDIT_REASONS = [
  "Inventory Audit - SalesApp",
  "Stock reconciliation - manual inventory push",
  "Physical count correction",
  "Damaged inventory",
  "Missing inventory",
  "Receiving correction",
  "Other",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function VarianceBadge({ v }: { v: number }) {
  if (v === 0) return <span className="text-xs font-mono text-slate-500">0</span>;
  const cls = v > 0 ? "text-green-600" : "text-red-600";
  return <span className={`text-xs font-mono font-semibold ${cls}`}>{v > 0 ? `+${v}` : v}</span>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Completed</Badge>;
  if (status === "failed") return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Failed</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Pending</Badge>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, iconBg }: { label: string; value: string; sub?: string; icon: React.ElementType; iconBg: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-3 sm:p-4 flex items-start gap-3">
        <div className={`rounded-lg p-2 shrink-0 ${iconBg}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide font-medium leading-tight">{label}</p>
          <p className="text-base sm:text-2xl font-bold text-slate-900 leading-tight">{value}</p>
          {sub && <p className="text-[10px] text-slate-400 leading-tight">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Audit Dialog / Sheet ─────────────────────────────────────────────────────
interface AuditItem {
  id: number;
  sku: string;
  product_name: string;
  variant_name: string;
  system_qty: number | null;
  physical_qty_input: string;
}

function AuditPanel({
  open, onClose, tasks, title,
}: {
  open: boolean;
  onClose: () => void;
  tasks: api.InventoryAuditTask[];
  title: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<AuditItem[]>([]);
  const [reason, setReason] = useState(AUDIT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState<{ id: number; sku: string; success: boolean; error?: string }[] | null>(null);

  // Reset when opened
  const handleOpen = () => {
    setItems(tasks.map((t) => ({
      id: t.id,
      sku: t.sku,
      product_name: t.product_name,
      variant_name: t.variant_name,
      system_qty: t.system_qty,
      physical_qty_input: String(t.system_qty ?? ""),
    })));
    setReason(AUDIT_REASONS[0]);
    setCustomReason("");
    setNotes("");
    setResults(null);
  };

  // Keep items in sync with tasks when dialog opens
  useState(() => { if (open && tasks.length > 0) handleOpen(); });

  const mutation = useMutation({
    mutationFn: async () => {
      const finalReason = reason === "Other" ? (customReason.trim() || "Other") : reason;
      const payload = items.map((item) => ({
        id: item.id,
        physical_qty: Math.max(0, parseInt(item.physical_qty_input) || 0),
        variance: (parseInt(item.physical_qty_input) || 0) - (item.system_qty ?? 0),
      }));
      const res = await api.batchCompleteAuditTasks(payload, finalReason, notes || undefined);
      return res;
    },
    onSuccess: (data) => {
      setResults(data.results);
      const failed = data.results.filter((r) => !r.success).length;
      const succeeded = data.results.filter((r) => r.success).length;
      queryClient.invalidateQueries({ queryKey: ["audit-queue"] });
      queryClient.invalidateQueries({ queryKey: ["audit-kpis"] });
      if (failed === 0) {
        toast({ title: `Audit complete — ${succeeded} SKU${succeeded !== 1 ? "s" : ""} updated in SKUVault` });
        onClose();
      } else {
        toast({
          title: `Partial success: ${succeeded} updated, ${failed} failed`,
          description: "See details below. Failed SKUs remain pending.",
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => {
      toast({ title: "Audit failed", description: e.message, variant: "destructive" });
    },
  });

  const updateQty = (id: number, val: string) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, physical_qty_input: val } : i));
  };

  const isValid = items.length > 0 && (reason !== "Other" || customReason.trim().length > 0);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  const Content = (
    <div className="flex flex-col gap-4 px-1">
      {/* Info banner */}
      <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Enter the actual physical count for each SKU. This will set SKUVault inventory to the audited quantity.
        </p>
      </div>

      {/* SKU table */}
      <div className="border rounded-lg overflow-hidden">
        {/* Header — desktop only */}
        <div className="hidden sm:grid grid-cols-[1fr_80px_80px_80px] gap-2 px-3 py-2 bg-slate-50 border-b text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>SKU / Variant</span>
          <span className="text-center">System Qty</span>
          <span className="text-center">Physical Count</span>
          <span className="text-center">Variance</span>
        </div>
        <div className="divide-y">
          {items.map((item) => {
            const physical = parseInt(item.physical_qty_input) || 0;
            const variance = physical - (item.system_qty ?? 0);
            return (
              <div key={item.id} className="px-3 py-2.5 sm:grid sm:grid-cols-[1fr_80px_80px_80px] sm:gap-2 sm:items-center space-y-1.5 sm:space-y-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.variant_name || item.product_name}</p>
                  <p className="text-xs font-mono text-slate-400">{item.sku}</p>
                </div>
                <div className="flex sm:flex-col items-center justify-between sm:justify-center gap-2 sm:gap-0">
                  <span className="text-xs text-slate-500 sm:hidden">System:</span>
                  <span className="text-sm font-medium text-slate-700 sm:text-center">{item.system_qty ?? "—"}</span>
                </div>
                <div className="flex sm:flex-col items-center justify-between sm:justify-center gap-2">
                  <span className="text-xs text-slate-500 sm:hidden">Physical:</span>
                  <Input
                    type="number"
                    min="0"
                    value={item.physical_qty_input}
                    onChange={(e) => updateQty(item.id, e.target.value)}
                    className="w-20 h-8 text-center text-sm font-bold"
                  />
                </div>
                <div className="flex sm:flex-col items-center justify-between sm:justify-center gap-2">
                  <span className="text-xs text-slate-500 sm:hidden">Variance:</span>
                  <VarianceBadge v={variance} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reason */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase text-slate-600">Audit Reason (required)</label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        {reason === "Other" && (
          <Input placeholder="Describe the reason…" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase text-slate-600">Notes (optional)</label>
        <Input placeholder="Add any additional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {/* Partial failure results */}
      {results && results.some((r) => !r.success) && (
        <div className="border border-red-200 rounded-lg overflow-hidden">
          <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Failed SKUs — please retry</div>
          <div className="divide-y">
            {results.filter((r) => !r.success).map((r) => (
              <div key={r.id} className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-700">{r.sku}</span>
                <span className="text-xs text-red-600">{r.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <Button
        className="w-full h-11 font-semibold text-base"
        disabled={!isValid || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating SKUVault…</>
        ) : (
          `Complete Audit (${items.length} SKU${items.length !== 1 ? "s" : ""})`
        )}
      </Button>
    </div>
  );

  // Mobile: Sheet, Desktop: Dialog
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen(); }}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto flex flex-col gap-0 px-4 pt-4 pb-6">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
              {title}
            </SheetTitle>
          </SheetHeader>
          {Content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {Content}
      </DialogContent>
    </Dialog>
  );
}

// ─── Product Group Row (expandable) ──────────────────────────────────────────
function ProductGroupRow({ group, statusFilter }: { group: api.AuditProductGroup; statusFilter: string }) {
  const [expanded, setExpanded] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fmt = useTimeService();

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<api.InventoryAuditTask[]>({
    queryKey: ["audit-tasks-product", group.product_id, statusFilter],
    queryFn: () => api.getAuditTasksForProduct(group.product_id, statusFilter),
    enabled: expanded,
  });

  const toggleId = (id: number) =>
    setSelectedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAll = () => setSelectedIds(new Set(tasks.map((t) => t.id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectedTasks = tasks.filter((t) => selectedIds.has(t.id));
  const auditTitle = `Audit Selected SKUs (${selectedTasks.length})`;

  return (
    <>
      {/* Group header — MOBILE card style */}
      <div className="sm:hidden bg-white border rounded-xl shadow-sm overflow-hidden mb-3">
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm leading-tight">{group.product_name}</p>
              {group.sku_group && <p className="text-xs text-slate-400 mt-0.5">SKU Group: {group.sku_group}</p>}
            </div>
            <StatusBadge status={group.status} />
          </div>
          <div className="grid grid-cols-3 text-xs text-slate-500 mb-3">
            <div><p className="font-bold text-slate-800 text-base">{group.sku_count}</p><p>SKUs</p></div>
            <div><p className="font-bold text-slate-800 text-base">{group.total_push_qty}</p><p>Units</p></div>
            <div><p className="text-[11px] text-slate-600">{group.last_push_at ? fmt.dateTime(group.last_push_at) : "—"}</p><p>Last Push</p></div>
          </div>
          <button
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 border rounded-lg py-2 hover:bg-slate-50"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? "Collapse" : `Show ${group.sku_count} SKU${group.sku_count !== 1 ? "s" : ""}`}
          </button>
        </div>

        {expanded && (
          <div className="border-t">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-4 text-slate-400"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
            ) : (
              <>
                <div className="flex gap-2 p-3 bg-slate-50 border-b">
                  <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={selectedIds.size === tasks.length ? clearAll : selectAll}>
                    {selectedIds.size === tasks.length ? "Deselect All" : `Select All (${tasks.length})`}
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1" disabled={selectedTasks.length === 0} onClick={() => setAuditOpen(true)}>
                    Audit Selected ({selectedTasks.length})
                  </Button>
                </div>
                <div className="divide-y">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-3 flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={() => toggleId(task.id)}
                        className="h-5 w-5 rounded accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{task.variant_name || task.product_name}</p>
                        <p className="text-xs font-mono text-slate-400">{task.sku}</p>
                        <p className="text-xs text-slate-500">System Qty: {task.system_qty ?? "?"}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                        onClick={() => { setSelectedIds(new Set([task.id])); setAuditOpen(true); }}>
                        Audit
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Group header — DESKTOP table row */}
      <tr className="hidden sm:table-row border-b hover:bg-slate-50/50 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              className="text-slate-400 hover:text-slate-700 shrink-0"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate max-w-xs">{group.product_name}</p>
              {group.sku_group && <p className="text-xs text-slate-400">SKU Group: {group.sku_group}</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700">{group.sku_count}</td>
        <td className="px-4 py-3 text-center text-sm text-slate-600">{group.total_push_qty}</td>
        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
          {group.last_push_at ? fmt.dateTime(group.last_push_at) : "—"}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">{group.source === "manual_push" ? "Manual Push" : group.source}</td>
        <td className="px-4 py-3"><StatusBadge status={group.status} /></td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => { setExpanded(true); setTimeout(() => { selectAll(); setAuditOpen(true); }, 200); }}>
              Audit All
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setExpanded((v) => !v)}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </td>
      </tr>

      {/* Desktop expanded rows */}
      {expanded && !tasksLoading && tasks.length > 0 && (
        <>
          <tr className="hidden sm:table-row bg-slate-50 border-b">
            <td colSpan={7} className="px-6 py-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs"
                  onClick={selectedIds.size === tasks.length ? clearAll : selectAll}>
                  {selectedIds.size === tasks.length ? "Deselect All" : `Select All (${tasks.length})`}
                </Button>
                {selectedTasks.length > 0 && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => setAuditOpen(true)}>
                    Audit Selected ({selectedTasks.length})
                  </Button>
                )}
              </div>
            </td>
          </tr>
          {tasks.map((task) => (
            <tr key={task.id} className="hidden sm:table-row border-b bg-slate-50/50 hover:bg-slate-100/50">
              <td className="pl-12 pr-4 py-2.5">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(task.id)}
                    onChange={() => toggleId(task.id)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{task.variant_name || task.product_name}</p>
                    <p className="text-xs font-mono text-slate-400">{task.sku}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2.5 text-center text-xs text-slate-500">1</td>
              <td className="px-4 py-2.5 text-center text-sm font-medium text-slate-700">{task.total_push_qty}</td>
              <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {task.last_push_at ? fmt.dateTime(task.last_push_at) : "—"}
              </td>
              <td className="px-4 py-2.5 text-xs text-slate-500">
                <div>Sys: {task.system_qty ?? "?"}</div>
                {task.skuvault_location && (
                  <div className="mt-0.5">
                    <span className="font-mono text-xs bg-purple-50 text-purple-700 rounded px-1 py-0.5">{task.skuvault_location}</span>
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5"><StatusBadge status={task.status} /></td>
              <td className="px-4 py-2.5">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setSelectedIds(new Set([task.id])); setAuditOpen(true); }}>
                  Audit
                </Button>
              </td>
            </tr>
          ))}
        </>
      )}
      {expanded && tasksLoading && (
        <tr className="hidden sm:table-row">
          <td colSpan={7} className="px-4 py-3 text-sm text-slate-400 text-center">
            <Loader2 className="h-4 w-4 animate-spin inline mr-1" />Loading SKUs…
          </td>
        </tr>
      )}

      {/* Audit dialog/sheet */}
      {auditOpen && selectedTasks.length > 0 && (
        <AuditPanel
          open={auditOpen}
          onClose={() => { setAuditOpen(false); setSelectedIds(new Set()); }}
          tasks={selectedTasks}
          title={auditTitle}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InventoryAuditPage() {
  const fmt = useTimeService();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const LIMIT = 10;

  const applySearch = useCallback(() => { setAppliedSearch(search); setPage(0); }, [search]);

  const { data: kpis, isLoading: kpisLoading } = useQuery<api.AuditKPIs>({
    queryKey: ["audit-kpis"],
    queryFn: api.getAuditKPIs,
    refetchInterval: 60000,
  });

  const { data: queue, isLoading: queueLoading, refetch } = useQuery<{ groups: api.AuditProductGroup[]; total: number }>({
    queryKey: ["audit-queue", page, appliedSearch, statusFilter, sourceFilter, dateFrom, dateTo],
    queryFn: () => api.getAuditQueue({ page, limit: LIMIT, search: appliedSearch || undefined, status: statusFilter || undefined, source: sourceFilter || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    placeholderData: (prev) => prev,
  });

  const groups = queue?.groups ?? [];
  const total = queue?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["audit-kpis"] });
    queryClient.invalidateQueries({ queryKey: ["audit-queue"] });
    refetch();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-4 py-3 sm:px-6 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              Inventory Audit Queue
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
              Review and audit inventory for SKUs manually pushed to BigCommerce and SKUVault.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={queueLoading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${queueLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 sm:px-6 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <KpiCard
            label="Total Pending Tasks"
            value={kpisLoading ? "…" : String(kpis?.totalPendingTasks ?? 0)}
            sub="Products / SKUs"
            icon={Package}
            iconBg="bg-amber-100 text-amber-600"
          />
          <KpiCard
            label="SKUs to Audit"
            value={kpisLoading ? "…" : String(kpis?.skusToAudit ?? 0)}
            sub="Individual SKUs"
            icon={ClipboardCheck}
            iconBg="bg-blue-100 text-blue-600"
          />
          <KpiCard
            label="Total Pending Qty"
            value={kpisLoading ? "…" : (kpis?.totalPendingQty ?? 0).toLocaleString()}
            sub="Units"
            icon={AlertCircle}
            iconBg="bg-purple-100 text-purple-600"
          />
          <KpiCard
            label="Last Audit Completed"
            value={kpisLoading ? "…" : kpis?.lastAuditAt ? fmt.dateTime(kpis.lastAuditAt) : "—"}
            sub={kpis?.lastAuditBy ? `By ${kpis.lastAuditBy}` : undefined}
            icon={CheckCircle2}
            iconBg="bg-green-100 text-green-600"
          />
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-4 py-2.5 sm:px-6 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              className="pl-7 h-8 text-sm"
              placeholder="Search product or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              onBlur={applySearch}
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => { setSearch(""); setAppliedSearch(""); setPage(0); }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status filter — desktop */}
          <div className="hidden sm:flex items-center gap-2">
            <Select value={statusFilter || "pending"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="h-8 text-sm w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>

            <Input type="date" className="h-8 text-sm w-36" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              placeholder="From" />
            <Input type="date" className="h-8 text-sm w-36" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              placeholder="To" />
          </div>

          {/* Mobile filter toggle */}
          <Button variant="outline" size="sm" className="h-8 sm:hidden gap-1.5" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-3.5 w-3.5" />
            Filter
          </Button>
        </div>

        {/* Mobile filter drawer */}
        {showFilters && (
          <div className="sm:hidden mt-2 space-y-2 pt-2 border-t">
            <Select value={statusFilter || "pending"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="date" className="h-9 text-sm flex-1" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
              <Input type="date" className="h-9 text-sm flex-1" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-3 sm:px-6 space-y-2">
        {/* Section header */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-600">
            Audit Queue — Grouped by Product
            {total > 0 && <span className="text-slate-400 font-normal ml-1">({total} product{total !== 1 ? "s" : ""})</span>}
          </p>
        </div>

        {queueLoading && !queue ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
            <ClipboardCheck className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No audit tasks found</p>
            <p className="text-xs mt-1">Push inventory to SKUVault to generate audit tasks.</p>
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden">
              {groups.map((group) => (
                <ProductGroupRow key={group.product_id} group={group} statusFilter={statusFilter || "pending"} />
              ))}
            </div>

            {/* Desktop: table */}
            <div className={`hidden sm:block bg-white rounded-lg border shadow-sm overflow-hidden transition-opacity ${queueLoading ? "opacity-60" : ""}`}>
              <div className="px-4 py-2.5 bg-slate-50 border-b text-xs font-semibold uppercase text-slate-500 tracking-wide">
                Audit Queue (Grouped by Product)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-white border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Product / Variants</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Pending SKUs</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Pending Qty</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Last Push</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Source</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <ProductGroupRow key={group.product_id} group={group} statusFilter={statusFilter || "pending"} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="flex items-center justify-between px-1 py-2">
                <p className="text-xs text-slate-500">
                  Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()} product{total !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Prev</Button>
                  <span className="text-xs text-slate-500 px-2">Page {page + 1} / {Math.max(1, totalPages)}</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
