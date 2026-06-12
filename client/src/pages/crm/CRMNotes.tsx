import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, ChevronLeft, ChevronRight, Search, X, Filter } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return Number.isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  try { return format(new Date(v), "MM/dd/yy h:mm a"); }
  catch { return "—"; }
}

// ─── Types/Constants ──────────────────────────────────────────────────────────

const NOTE_TYPES = ["General", "Follow Up", "Sales", "Issue", "Credit", "Replacement", "Visit", "Internal", "Order Note"];

const NOTE_TYPE_COLORS: Record<string, string> = {
  "General":     "bg-slate-100 text-slate-700",
  "Follow Up":   "bg-blue-100 text-blue-700",
  "Sales":       "bg-green-100 text-green-700",
  "Issue":       "bg-red-100 text-red-700",
  "Credit":      "bg-orange-100 text-orange-700",
  "Replacement": "bg-purple-100 text-purple-700",
  "Visit":       "bg-cyan-100 text-cyan-700",
  "Internal":    "bg-yellow-100 text-yellow-700",
  "Order Note":  "bg-indigo-100 text-indigo-700",
};

function NoteTypePill({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${NOTE_TYPE_COLORS[type] ?? "bg-slate-100 text-slate-600"}`}>
      {type}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border px-4 py-3 bg-white shadow-sm flex flex-col gap-1">
      <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</span>
    </div>
  );
}

// ─── Note Expand Modal ────────────────────────────────────────────────────────

function NoteExpandModal({ note, onClose }: { note: any; onClose: () => void }) {
  const [, setLocation] = useLocation();
  if (!note) return null;
  return (
    <Dialog open={!!note} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NoteTypePill type={note.note_type} />
            {note.customer_name && <span className="text-sm font-normal text-slate-500">{note.customer_name}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            <span>{fmtDateTime(note.created_at)}</span>
            {note.created_by_name && <span>by <span className="text-slate-600 font-medium">{note.created_by_name}</span></span>}
            {note.order_id && <span className="text-indigo-500 font-medium">Order #{note.order_id}</span>}
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{note.note}</p>
        </div>
        <DialogFooter>
          {note.customer_id && (
            <Button variant="outline" size="sm" onClick={() => { onClose(); setLocation(`/crm/customers/${note.customer_id}`); }}>
              View Customer Profile
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function CRMNotes() {
  const [expandedNote, setExpandedNote] = useState<any | null>(null);
  const [page, setPage]                 = useState(1);
  const LIMIT = 50;

  // Filters
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("");
  const [createdBy, setCreatedBy]     = useState("");
  const [orderIdInput, setOrderIdInput] = useState("");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const hasFilter = !!(search || typeFilter || createdBy || orderIdInput || dateFrom || dateTo || groupFilter || stateFilter);

  const clearFilters = () => {
    setSearch(""); setTypeFilter(""); setCreatedBy(""); setOrderIdInput("");
    setDateFrom(""); setDateTo(""); setGroupFilter(""); setStateFilter("");
    setPage(1);
  };

  const queryParams = new URLSearchParams({
    search, type: typeFilter, createdBy, orderId: orderIdInput,
    dateFrom, dateTo, customerGroup: groupFilter, state: stateFilter,
    limit: String(LIMIT), offset: String((page - 1) * LIMIT),
  }).toString();

  const { data: kpis } = useQuery({
    queryKey: ["crm", "notes", "kpis"],
    queryFn: async () => {
      const r = await fetch("/api/crm/notes/kpis", { headers: getAuthHeaders() });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: notesData, isLoading } = useQuery({
    queryKey: ["crm", "notes", "list", queryParams],
    queryFn: async () => {
      const r = await fetch(`/api/crm/notes?${queryParams}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load notes");
      return r.json() as Promise<{ notes: any[]; total: number }>;
    },
    staleTime: 0,
  });

  const { data: crmUsers = [] } = useQuery({
    queryKey: ["crm", "users"],
    queryFn: async () => {
      const r = await fetch("/api/crm/users", { headers: getAuthHeaders() });
      if (!r.ok) return [];
      return r.json() as Promise<{ id: number; name: string }[]>;
    },
    staleTime: 60_000,
  });

  const { data: filterOpts } = useQuery({
    queryKey: ["crm", "filter-opts"],
    queryFn: async () => {
      const r = await fetch("/api/crm/customers/filter-opts", { headers: getAuthHeaders() });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 120_000,
  });

  const notes     = notesData?.notes ?? [];
  const total     = notesData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const gotoPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)));

  return (
    <div className="flex flex-col min-h-full bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-slate-400" />
            <h1 className="text-lg font-bold text-slate-900">CRM Notes</h1>
            {total > 0 && <span className="text-xs text-slate-400 font-normal">({total.toLocaleString()} total)</span>}
          </div>
          <Button
            size="sm"
            variant={showFilters ? "default" : "outline"}
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowFilters(v => !v)}
            data-testid="btn-toggle-filters"
          >
            <Filter className="h-3.5 w-3.5" />Filters{hasFilter && <span className="ml-0.5 h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">●</span>}
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      {kpis && (
        <div className="px-4 md:px-6 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Notes Today"    value={kpis.today ?? 0}     color="text-slate-800" />
            <KpiCard label="Follow Ups"     value={kpis.follow_up ?? 0} color="text-blue-600" />
            <KpiCard label="Sales Calls"    value={kpis.sales ?? 0}     color="text-green-600" />
            <KpiCard label="Issues"         value={kpis.issue ?? 0}     color="text-red-600" />
            <KpiCard label="Internal"       value={kpis.internal ?? 0}  color="text-yellow-600" />
          </div>
        </div>
      )}

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="px-4 md:px-6 pt-3">
          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">Customer / Note Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search…"
                    className="pl-8 h-8 text-sm"
                    data-testid="input-notes-search"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">Type</Label>
                <Select value={typeFilter || "__all__"} onValueChange={v => { setTypeFilter(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-note-type-filter">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Types</SelectItem>
                    {NOTE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Created By */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">Created By</Label>
                <Select value={createdBy || "__all__"} onValueChange={v => { setCreatedBy(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-created-by-filter">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Users</SelectItem>
                    {(crmUsers as { id: number; name: string }[]).map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Order # */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">Order #</Label>
                <Input
                  value={orderIdInput}
                  onChange={e => { setOrderIdInput(e.target.value.replace(/\D/g, "")); setPage(1); }}
                  placeholder="Order ID…"
                  className="h-8 text-sm"
                  data-testid="input-order-id-filter"
                />
              </div>

              {/* Date From */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">Date From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="h-8 text-sm"
                  data-testid="input-date-from"
                />
              </div>

              {/* Date To */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">Date To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className="h-8 text-sm"
                  data-testid="input-date-to"
                />
              </div>

              {/* Customer Group */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">Customer Group</Label>
                <Select value={groupFilter || "__all__"} onValueChange={v => { setGroupFilter(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-group-filter">
                    <SelectValue placeholder="All Groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Groups</SelectItem>
                    {(filterOpts?.groups ?? []).map((g: string) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* State */}
              <div>
                <Label className="text-xs mb-1.5 block text-slate-500">State</Label>
                <Select value={stateFilter || "__all__"} onValueChange={v => { setStateFilter(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-state-filter">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All States</SelectItem>
                    {(filterOpts?.states ?? []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hasFilter && (
              <div className="mt-3 pt-3 border-t flex justify-end">
                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 gap-1" onClick={clearFilters} data-testid="btn-clear-filters">
                  <X className="h-3.5 w-3.5" />Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-3 pb-6">
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading notes…</div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm">{hasFilter ? "No notes match the current filters." : "No notes yet."}</p>
              {hasFilter && (
                <Button size="sm" variant="ghost" className="mt-2 text-xs text-blue-600" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Date & Time</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Customer</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Order #</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Note</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Created By</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((note: any) => {
                      const isLong = (note.note?.length ?? 0) > 120;
                      return (
                        <tr
                          key={note.id}
                          data-testid={`note-row-${note.id}`}
                          className="border-b last:border-0 hover:bg-slate-50 transition-colors align-top"
                        >
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(note.created_at)}</td>
                          <td className="px-4 py-3"><NoteTypePill type={note.note_type} /></td>
                          <td className="px-4 py-3">
                            {note.customer_name
                              ? <span className="text-xs font-medium text-blue-600">{note.customer_name}</span>
                              : <span className="text-slate-300 text-xs">—</span>}
                            {note.customer_company && (
                              <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{note.customer_company}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-indigo-600 font-mono whitespace-nowrap">
                            {note.order_id ? `#${note.order_id}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">
                            <p className={`${isLong ? "line-clamp-2" : ""} whitespace-pre-wrap break-words leading-relaxed`}>
                              {note.note}
                            </p>
                            {isLong && (
                              <button
                                className="text-[11px] text-blue-500 hover:underline mt-0.5"
                                onClick={() => setExpandedNote(note)}
                                data-testid={`btn-expand-note-${note.id}`}
                              >
                                Show more
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap font-medium">
                            {note.created_by_name || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className="text-[11px] text-blue-500 hover:underline"
                              onClick={() => setExpandedNote(note)}
                              data-testid={`btn-view-note-${note.id}`}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t flex items-center justify-between bg-slate-50">
                  <p className="text-xs text-slate-500">
                    Page {page} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} notes
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => gotoPage(1)} disabled={page === 1} data-testid="btn-notes-first">«</Button>
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => gotoPage(page - 1)} disabled={page === 1} data-testid="btn-notes-prev">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                      const pg = start + i;
                      if (pg > totalPages) return null;
                      return (
                        <Button key={pg} variant={pg === page ? "default" : "outline"} size="sm" className="h-7 min-w-[28px] px-2 text-xs" onClick={() => gotoPage(pg)}>
                          {pg}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => gotoPage(page + 1)} disabled={page === totalPages} data-testid="btn-notes-next">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => gotoPage(totalPages)} disabled={page === totalPages} data-testid="btn-notes-last">»</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Note Expand Modal ──────────────────────────────────────────────── */}
      {expandedNote && <NoteExpandModal note={expandedNote} onClose={() => setExpandedNote(null)} />}
    </div>
  );
}
