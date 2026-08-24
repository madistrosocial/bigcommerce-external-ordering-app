import { useState, useEffect, useCallback } from "react";
import { useTimeService } from "@/hooks/useTimeService";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tag, Plus, RefreshCw, Search, Pencil, Trash2, Package, AlertTriangle,
  CheckCircle, XCircle, Filter,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/api";

const authHeaders = () => {
  return { "Content-Type": "application/json", ...getAuthHeaders() };
};

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`/api/promo-skus${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers as Record<string, string> ?? {}) },
  });
  return res.json();
}

type SkuEntry = {
  id: number;
  sku: string;
  product_id: number;
  variant_id: number | null;
  product_name: string;
  variant_name: string | null;
  promo_note: string | null;
  created_at: string;
  // live data
  inventory?: number | null;
  last_refreshed?: string;
};

type Thresholds = { red: number; yellow: number };

type StatusFilter = "all" | "low" | "warning" | "healthy";

function getStatus(inv: number | null | undefined, t: Thresholds): "low" | "warning" | "healthy" | "unknown" {
  if (inv == null) return "unknown";
  if (inv <= t.red) return "low";
  if (inv <= t.yellow) return "warning";
  return "healthy";
}

function StatusBadge({ inv, t }: { inv: number | null | undefined; t: Thresholds }) {
  const s = getStatus(inv, t);
  if (s === "unknown") return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] h-5">NO DATA</Badge>;
  if (s === "low") return <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] h-5 gap-1"><XCircle className="h-3 w-3" />LOW STOCK</Badge>;
  if (s === "warning") return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px] h-5 gap-1"><AlertTriangle className="h-3 w-3" />WARNING</Badge>;
  return <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] h-5 gap-1"><CheckCircle className="h-3 w-3" />HEALTHY</Badge>;
}

function InvNumber({ inv, t }: { inv: number | null | undefined; t: Thresholds }) {
  const s = getStatus(inv, t);
  const cls = s === "low" ? "text-red-600" : s === "warning" ? "text-yellow-600" : s === "healthy" ? "text-green-700" : "text-slate-400";
  return <span className={`text-3xl font-bold tabular-nums ${cls}`}>{inv == null ? "—" : inv.toLocaleString()}</span>;
}

export default function PromoSkuTracker() {
  const fmt = useTimeService();
  const { toast } = useToast();

  const [skus, setSkus] = useState<SkuEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [thresholds, setThresholds] = useState<Thresholds>({ red: 2, yellow: 5 });
  const [showThresholds, setShowThresholds] = useState(false);
  const [thresholdRed, setThresholdRed] = useState("2");
  const [thresholdYellow, setThresholdYellow] = useState("5");
  const [thresholdSaving, setThresholdSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Add / Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SkuEntry | null>(null);
  const [dialogSku, setDialogSku] = useState("");
  const [dialogNote, setDialogNote] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<SkuEntry | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Load SKUs + inventory ─────────────────────────────────────────────────
  const loadSkusAndInventory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [skuData, invData, tData] = await Promise.all([
        apiFetch(""),
        apiFetch("/inventory"),
        apiFetch("/thresholds"),
      ]);
      const invMap: Record<number, number | null> = {};
      if (Array.isArray(invData)) {
        invData.forEach((i: any) => { invMap[i.id] = i.inventory; });
      }
      if (tData && !tData.error) {
        setThresholds({ red: tData.red ?? 2, yellow: tData.yellow ?? 5 });
        setThresholdRed(String(tData.red ?? 2));
        setThresholdYellow(String(tData.yellow ?? 5));
      }
      const entries: SkuEntry[] = (Array.isArray(skuData) ? skuData : []).map((s: any) => ({
        ...s,
        inventory: invMap[s.id] ?? null,
        last_refreshed: fmt.time(new Date()),
      }));
      setSkus(entries);
      setLastRefreshed(new Date());
    } catch (e: any) {
      if (!silent) toast({ title: "Load failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { loadSkusAndInventory(); }, []);

  // ── Filter & sort ─────────────────────────────────────────────────────────
  const filtered = skus
    .filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.sku.toLowerCase().includes(q) || s.product_name.toLowerCase().includes(q);
      const st = getStatus(s.inventory, thresholds);
      const matchFilter =
        statusFilter === "all" ||
        (statusFilter === "low" && st === "low") ||
        (statusFilter === "warning" && st === "warning") ||
        (statusFilter === "healthy" && st === "healthy");
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      const ai = a.inventory ?? Infinity;
      const bi = b.inventory ?? Infinity;
      if (ai !== bi) return ai - bi;
      return a.product_name.localeCompare(b.product_name);
    });

  // ── Summary counts ────────────────────────────────────────────────────────
  const counts = skus.reduce(
    (acc, s) => {
      const st = getStatus(s.inventory, thresholds);
      if (st === "low") acc.low++;
      else if (st === "warning") acc.warning++;
      else if (st === "healthy") acc.healthy++;
      return acc;
    },
    { low: 0, warning: 0, healthy: 0 }
  );

  // ── Open add dialog ───────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setDialogSku("");
    setDialogNote("");
    setShowDialog(true);
  };

  const openEdit = (s: SkuEntry) => {
    setEditing(s);
    setDialogSku(s.sku);
    setDialogNote(s.promo_note ?? "");
    setShowDialog(true);
  };

  // ── Save (add or update) ──────────────────────────────────────────────────
  const saveDialog = async () => {
    if (!dialogSku.trim()) return;
    setDialogLoading(true);
    try {
      if (editing) {
        const d = await apiFetch(`/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ promo_note: dialogNote }),
        });
        if (d.error) throw new Error(d.error);
        toast({ title: "Updated" });
      } else {
        const d = await apiFetch("", {
          method: "POST",
          body: JSON.stringify({ sku: dialogSku.trim().toUpperCase(), promo_note: dialogNote }),
        });
        if (d.error) throw new Error(d.error);
        toast({ title: "SKU added", description: `${d.product_name} added to tracker` });
      }
      setShowDialog(false);
      await loadSkusAndInventory(true);
    } catch (e: any) {
      toast({ title: editing ? "Update failed" : "Add failed", description: e.message, variant: "destructive" });
    } finally {
      setDialogLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/${deleteTarget.id}`, { method: "DELETE" });
      toast({ title: "SKU removed" });
      setDeleteTarget(null);
      await loadSkusAndInventory(true);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Save thresholds ───────────────────────────────────────────────────────
  const saveThresholds = async () => {
    const red = parseInt(thresholdRed);
    const yellow = parseInt(thresholdYellow);
    if (isNaN(red) || isNaN(yellow) || red < 0 || yellow <= red) {
      toast({ title: "Invalid thresholds", description: "Yellow must be greater than Red", variant: "destructive" });
      return;
    }
    setThresholdSaving(true);
    try {
      await apiFetch("/thresholds", { method: "POST", body: JSON.stringify({ red, yellow }) });
      setThresholds({ red, yellow });
      setShowThresholds(false);
      toast({ title: "Thresholds saved" });
    } finally {
      setThresholdSaving(false);
    }
  };

  const FILTER_BTNS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "low", label: "Low Stock" },
    { id: "warning", label: "Warning" },
    { id: "healthy", label: "Healthy" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Promo SKU Tracker</h1>
            <p className="text-xs text-slate-500">Monitor free-gift SKU inventory levels</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastRefreshed && (
            <span className="text-[11px] text-slate-400">
              Refreshed {fmt.time(lastRefreshed)}
            </span>
          )}
          <Button data-testid="button-refresh" size="sm" variant="outline" onClick={() => loadSkusAndInventory(true)} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button data-testid="button-thresholds" size="sm" variant="outline" onClick={() => setShowThresholds(true)}>
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Thresholds
          </Button>
          <Button data-testid="button-add-sku" size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add SKU
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Monitored", value: skus.length, color: "bg-blue-50 text-blue-700 border-blue-200" },
          { label: "Low Stock", value: counts.low, color: "bg-red-50 text-red-700 border-red-200" },
          { label: "Warning", value: counts.warning, color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
          { label: "Healthy", value: counts.healthy, color: "bg-green-50 text-green-700 border-green-200" },
        ].map((c) => (
          <div key={c.label} data-testid={`stat-${c.label.toLowerCase().replace(" ", "-")}`}
            className={`rounded-xl border p-3 ${c.color}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{c.label}</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            data-testid="input-search"
            placeholder="Search by SKU or product name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {FILTER_BTNS.map((f) => (
            <button
              key={f.id}
              data-testid={`filter-${f.id}`}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f.id
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {skus.length === 0 ? "No SKUs monitored yet" : "No results match your search"}
          </p>
          {skus.length === 0 && (
            <Button size="sm" className="mt-4" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add your first promo SKU
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => {
            const st = getStatus(s.inventory, thresholds);
            const borderCls =
              st === "low" ? "border-red-300 bg-red-50/40" :
              st === "warning" ? "border-yellow-300 bg-yellow-50/40" :
              st === "healthy" ? "border-green-300 bg-green-50/20" :
              "border-slate-200 bg-white";
            return (
              <div
                key={s.id}
                data-testid={`card-promo-sku-${s.id}`}
                className={`rounded-xl border p-4 space-y-3 ${borderCls}`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p data-testid={`text-sku-${s.id}`} className="text-xs font-mono font-bold text-slate-700 truncate">{s.sku}</p>
                    <p data-testid={`text-product-name-${s.id}`} className="text-sm font-semibold text-slate-900 leading-tight mt-0.5 line-clamp-2">{s.product_name}</p>
                    {s.variant_name && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{s.variant_name}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      data-testid={`button-edit-${s.id}`}
                      onClick={() => openEdit(s)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-colors"
                      title="Edit note"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      data-testid={`button-delete-${s.id}`}
                      onClick={() => setDeleteTarget(s)}
                      className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-white/80 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inventory */}
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">In Stock</p>
                    <InvNumber inv={s.inventory} t={thresholds} />
                  </div>
                  <StatusBadge inv={s.inventory} t={thresholds} />
                </div>

                {/* Promo note */}
                {s.promo_note && (
                  <div className="bg-white/70 rounded-lg px-2.5 py-1.5">
                    <p className="text-[11px] text-slate-600 italic">"{s.promo_note}"</p>
                  </div>
                )}
                {!s.promo_note && (
                  <button
                    onClick={() => openEdit(s)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 italic"
                  >
                    + Add promo note
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit dialog ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Promo SKU" : "Add Promo SKU"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">SKU</Label>
              <Input
                data-testid="input-dialog-sku"
                value={dialogSku}
                onChange={(e) => setDialogSku(e.target.value.toUpperCase())}
                placeholder="e.g. GB-PULSE-BR"
                className="h-8 text-sm font-mono"
                disabled={!!editing}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && !editing) saveDialog(); }}
              />
              {!editing && <p className="text-[11px] text-slate-400">The SKU will be validated against BigCommerce.</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Promo Note <span className="text-slate-400">(optional)</span></Label>
              <Input
                data-testid="input-dialog-note"
                value={dialogNote}
                onChange={(e) => setDialogNote(e.target.value)}
                placeholder='e.g. "Buy 10 Geek Bars Get 1 Free"'
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") saveDialog(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button data-testid="button-dialog-save" size="sm" onClick={saveDialog} disabled={dialogLoading || !dialogSku.trim()}>
              {dialogLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              {editing ? "Save" : "Add SKU"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Thresholds dialog ── */}
      <Dialog open={showThresholds} onOpenChange={setShowThresholds}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Inventory Thresholds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-red-500 shrink-0" />
              <div className="flex-1">
                <Label className="text-xs">Low Stock (Red) — inventory ≤</Label>
                <Input
                  data-testid="input-threshold-red"
                  type="number" min="0" value={thresholdRed}
                  onChange={(e) => setThresholdRed(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-yellow-400 shrink-0" />
              <div className="flex-1">
                <Label className="text-xs">Warning (Yellow) — inventory ≤</Label>
                <Input
                  data-testid="input-threshold-yellow"
                  type="number" min="1" value={thresholdYellow}
                  onChange={(e) => setThresholdYellow(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500 shrink-0" />
              <p className="text-xs text-slate-600">Healthy (Green) — inventory &gt; {thresholdYellow || thresholds.yellow}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowThresholds(false)}>Cancel</Button>
            <Button data-testid="button-save-thresholds" size="sm" onClick={saveThresholds} disabled={thresholdSaving}>
              {thresholdSaving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save Thresholds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove SKU from tracker?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono font-bold">{deleteTarget?.sku}</span> — {deleteTarget?.product_name} will be removed from the monitoring list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              onClick={confirmDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
