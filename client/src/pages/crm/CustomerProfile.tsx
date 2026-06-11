import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Building2, User, Mail, Phone, Hash, TrendingUp, ShoppingBag,
  Calendar, DollarSign, Users, Plus, Pencil, Trash2, MessageSquare,
  UserCheck, UserMinus, ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: string | number | null): string {
  if (v == null || v === "") return "$0.00";
  const n = Number(v);
  if (isNaN(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; }
}
function statusColor(status: string | null): "default" | "destructive" | "secondary" | "outline" {
  if (!status) return "secondary";
  const s = status.toLowerCase();
  if (s.includes("complete") || s.includes("shipped")) return "default";
  if (s.includes("cancel") || s.includes("refund")) return "destructive";
  return "secondary";
}

const NOTE_TYPES = ["General", "Follow Up", "Sales", "Issue", "Credit", "Replacement", "Visit", "Internal"];

const NOTE_TYPE_COLORS: Record<string, string> = {
  "General":     "bg-slate-100 text-slate-700",
  "Follow Up":   "bg-blue-100 text-blue-700",
  "Sales":       "bg-green-100 text-green-700",
  "Issue":       "bg-red-100 text-red-700",
  "Credit":      "bg-orange-100 text-orange-700",
  "Replacement": "bg-purple-100 text-purple-700",
  "Visit":       "bg-cyan-100 text-cyan-700",
  "Internal":    "bg-yellow-100 text-yellow-700",
};

const HEALTH_COLORS: Record<string, string> = {
  "Healthy": "bg-green-100 text-green-700",
  "Watch":   "bg-yellow-100 text-yellow-700",
  "At Risk": "bg-orange-100 text-orange-700",
  "Lost":    "bg-red-100 text-red-700",
};

function HealthBadge({ health }: { health: string | null }) {
  if (!health) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${HEALTH_COLORS[health] ?? "bg-slate-100 text-slate-600"}`}>
      <AlertTriangle className="h-3 w-3" />
      {health}
    </span>
  );
}

function NoteTypeBadge({ type }: { type: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${NOTE_TYPE_COLORS[type] ?? "bg-slate-100 text-slate-600"}`}>{type}</span>;
}

// ─── Note Modal ───────────────────────────────────────────────────────────────

interface NoteModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { note: string; note_type: string }) => void;
  saving: boolean;
  initial?: { note: string; note_type: string };
  title: string;
}

function NoteModal({ open, onClose, onSave, saving, initial, title }: NoteModalProps) {
  const [note, setNote] = useState(initial?.note ?? "");
  const [noteType, setNoteType] = useState(initial?.note_type ?? "General");

  const reset = () => { setNote(initial?.note ?? ""); setNoteType(initial?.note_type ?? "General"); };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">Type</Label>
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger data-testid="select-note-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Note</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Enter note…"
              rows={4}
              data-testid="textarea-note"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => onSave({ note, note_type: noteType })} disabled={!note.trim() || saving} data-testid="btn-save-note">
            {saving ? "Saving…" : "Save Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomerProfile() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params.id);

  const canCreateNote = hasPermission("crm", "notes_create");
  const canEditNote   = hasPermission("crm", "notes_edit");
  const canDeleteNote = hasPermission("crm", "notes_delete");
  const canAssignRep  = hasPermission("crm", "customer_assignment");

  const [showAddNote, setShowAddNote]       = useState(false);
  const [editingNote, setEditingNote]       = useState<any | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [showAssignRep, setShowAssignRep]   = useState(false);
  const [selectedRep, setSelectedRep]       = useState("");
  const [assignSaving, setAssignSaving]     = useState(false);
  const [expandedOrder, setExpandedOrder]   = useState<number | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ["crm", "customer", id],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Customer not found");
      return r.json();
    },
    enabled: !!id,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["crm", "customer", id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}/orders`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json();
    },
    enabled: !!id,
  });

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ["crm", "customer", id, "notes"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}/notes`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load notes");
      return r.json();
    },
    enabled: !!id,
  });

  const { data: timeline = [], isLoading: loadingTimeline } = useQuery({
    queryKey: ["crm", "customer", id, "timeline"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}/timeline`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load timeline");
      return r.json();
    },
    enabled: !!id,
  });

  const { data: crmUsers = [] } = useQuery({
    queryKey: ["crm", "users"],
    queryFn: async () => {
      const r = await fetch("/api/crm/users", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load users");
      return r.json() as Promise<{ id: number; name: string }[]>;
    },
    enabled: canAssignRep,
    staleTime: 60_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const invalidateNotes = () => {
    queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "notes"] });
    queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "timeline"] });
  };

  const createNoteMutation = useMutation({
    mutationFn: async (data: { note: string; note_type: string }) => {
      const r = await fetch(`/api/crm/customers/${id}/notes`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to create note");
      return r.json();
    },
    onSuccess: () => { invalidateNotes(); setShowAddNote(false); toast({ title: "Note added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: number; data: { note: string; note_type: string } }) => {
      const r = await fetch(`/api/crm/customers/${id}/notes/${noteId}`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to update note");
      return r.json();
    },
    onSuccess: () => { invalidateNotes(); setEditingNote(null); toast({ title: "Note updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      const r = await fetch(`/api/crm/customers/${id}/notes/${noteId}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error("Failed to delete note");
    },
    onSuccess: () => { invalidateNotes(); setDeletingNoteId(null); toast({ title: "Note deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleAssignRep = async () => {
    if (!selectedRep) return;
    setAssignSaving(true);
    try {
      const r = await fetch(`/api/crm/customers/${id}/sales-rep`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_user_id: parseInt(selectedRep) }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to assign rep");
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "timeline"] });
      toast({ title: "Sales rep assigned" });
      setShowAssignRep(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAssignSaving(false); }
  };

  const handleRemoveRep = async () => {
    try {
      const r = await fetch(`/api/crm/customers/${id}/sales-rep`, { method: "DELETE", headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to remove rep");
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "timeline"] });
      toast({ title: "Sales rep removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Loading / Error states ────────────────────────────────────────────────────

  if (loadingCustomer) {
    return <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading customer…</div>;
  }
  if (!customer) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Customer not found.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLocation("/crm/customers")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
      </div>
    );
  }

  const lifetimeOrders  = Number(customer.lifetime_orders ?? 0);
  const lifetimeRevenue = Number(customer.lifetime_revenue ?? 0);
  const avgOrderValue   = lifetimeOrders > 0 ? lifetimeRevenue / lifetimeOrders : 0;
  const daysSince       = customer.last_order_date
    ? Math.floor((Date.now() - new Date(customer.last_order_date).getTime()) / 86_400_000)
    : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Back */}
      <Button variant="ghost" size="sm" className="-ml-1" onClick={() => setLocation("/crm/customers")} data-testid="btn-back-customers">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> All Customers
      </Button>

      {/* ── Header Card ─────────────────────────────────────────────────────────── */}
      <div className="border rounded-xl p-5 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <User className="h-7 w-7 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            {customer.company && (
              <div className="flex items-center gap-1.5 text-slate-500 text-sm mb-0.5">
                <Building2 className="h-3.5 w-3.5" />
                <span className="font-medium text-slate-700">{customer.company}</span>
              </div>
            )}
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}
              </h1>
              <HealthBadge health={customer.account_health} />
            </div>

            {/* Contact row */}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
              {customer.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.email}</span>}
              {customer.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>}
              <span className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" />BC ID: {customer.bigcommerce_customer_id}</span>
            </div>

            {/* Meta row */}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
              {customer.created_date && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Joined {fmtDate(customer.created_date)}
                </span>
              )}
              {(customer.customer_group_id || customer.customer_group_name) && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  {customer.customer_group_name
                    ? `${customer.customer_group_name} (ID: ${customer.customer_group_id})`
                    : `Group ID: ${customer.customer_group_id}`}
                </span>
              )}
            </div>

            {/* Sales Rep row */}
            <div className="mt-3 flex items-center flex-wrap gap-2">
              {customer.sales_rep_name
                ? <Badge variant="secondary" className="text-xs"><UserCheck className="h-3 w-3 mr-1" />Rep: {customer.sales_rep_name}</Badge>
                : <span className="text-xs text-slate-400">No rep assigned</span>
              }
              {canAssignRep && (
                <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => { setSelectedRep(""); setShowAssignRep(true); }} data-testid="btn-assign-rep">
                  {customer.sales_rep_name ? "Change Rep" : "Assign Rep"}
                </Button>
              )}
              {canAssignRep && customer.sales_rep_name && (
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-500 hover:text-red-700" onClick={handleRemoveRep} data-testid="btn-remove-rep">
                  <UserMinus className="h-3 w-3 mr-1" />Remove
                </Button>
              )}
            </div>
          </div>

          {daysSince != null && (
            <div className={`text-right text-sm shrink-0 ${daysSince > 90 ? "text-red-500" : daysSince > 30 ? "text-amber-500" : "text-green-600"}`}>
              <p className="text-2xl font-bold">{daysSince}d</p>
              <p className="text-xs">since last order</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-xs text-slate-500">Lifetime Revenue</span>
            </div>
            <p className="text-xl font-bold text-slate-900" data-testid="text-lifetime-revenue">{fmtCurrency(customer.lifetime_revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-slate-500">Lifetime Orders</span>
            </div>
            <p className="text-xl font-bold text-slate-900" data-testid="text-lifetime-orders">{lifetimeOrders.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-slate-500">Avg Order Value</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{fmtCurrency(avgOrderValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-slate-500">Last Order</span>
            </div>
            <p className="text-sm font-bold text-slate-900" data-testid="text-last-order-date">
              {customer.last_order_date ? fmtDate(customer.last_order_date) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Notes + Timeline Grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Notes Section */}
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-slate-400" />
              Notes {notes.length > 0 && <span className="text-xs font-normal text-slate-400">({notes.length})</span>}
            </h2>
            {canCreateNote && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddNote(true)} data-testid="btn-add-note">
                <Plus className="h-3.5 w-3.5" /> Add Note
              </Button>
            )}
          </div>
          <div className="overflow-y-auto max-h-[380px]">
            {loadingNotes ? (
              <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-slate-400 text-xs">
                <MessageSquare className="h-6 w-6 mb-1.5 opacity-30" />
                No notes yet
              </div>
            ) : (
              <div className="divide-y">
                {(notes as any[]).map((note: any) => (
                  <div key={note.id} className="px-4 py-3" data-testid={`note-${note.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <NoteTypeBadge type={note.note_type} />
                        <span className="text-[11px] text-slate-400">{note.created_by_name ?? "Unknown"}</span>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] text-slate-400">{fmtDate(note.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canEditNote && (
                          <button
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"
                            onClick={() => setEditingNote(note)}
                            data-testid={`btn-edit-note-${note.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDeleteNote && (
                          <button
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600"
                            onClick={() => setDeletingNoteId(note.id)}
                            data-testid={`btn-delete-note-${note.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{note.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Timeline Section */}
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-700 text-sm">Activity Timeline</h2>
          </div>
          <div className="overflow-y-auto max-h-[380px] p-4">
            {loadingTimeline ? (
              <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Loading…</div>
            ) : timeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-slate-400 text-xs">No activity yet</div>
            ) : (
              <div className="space-y-0">
                {(timeline as any[]).map((entry: any, i: number) => {
                  const isLast = i === timeline.length - 1;
                  return (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                          entry.type === "order" ? "bg-blue-100" :
                          entry.type === "note"  ? "bg-purple-100" : "bg-green-100"
                        }`}>
                          {entry.type === "order"      && <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />}
                          {entry.type === "note"       && <MessageSquare className="h-3.5 w-3.5 text-purple-600" />}
                          {entry.type === "assignment" && <UserCheck className="h-3.5 w-3.5 text-green-600" />}
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1 mb-1" />}
                      </div>
                      <div className={`pb-3 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
                        <p className="text-[11px] text-slate-400 mb-0.5">
                          {entry.date ? formatDistanceToNow(new Date(entry.date), { addSuffix: true }) : "—"}
                        </p>
                        {entry.type === "order" && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Order #{entry.order_number ?? entry.bc_order_id}</span>
                            {" — "}{fmtCurrency(entry.order_total)}
                            {entry.status && <span className="ml-1.5 text-xs text-slate-500">({entry.status})</span>}
                            {(entry.staff_notes || entry.customer_order_notes) && (
                              <span className="ml-1.5 text-[11px] text-amber-600" title="Has notes">📝</span>
                            )}
                          </p>
                        )}
                        {entry.type === "note" && (
                          <>
                            <p className="text-sm font-medium text-slate-700">
                              <NoteTypeBadge type={entry.note_type} />
                              {entry.created_by_name && <span className="ml-1.5 text-xs font-normal text-slate-500">by {entry.created_by_name}</span>}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{entry.note_content}</p>
                          </>
                        )}
                        {entry.type === "assignment" && (
                          <p className="text-sm text-slate-700">
                            {entry.action === "sales_rep_assigned"
                              ? <><span className="font-medium">Rep assigned:</span> {(entry.detail as any)?.rep_name ?? "—"}</>
                              : <span className="font-medium">Rep removed</span>
                            }
                            {entry.user_name && <span className="ml-1.5 text-xs text-slate-500">by {entry.user_name}</span>}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Orders ───────────────────────────────────────────────────────── */}
      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-700 text-sm">Recent Orders (last 20)</h2>
        </div>
        {loadingOrders ? (
          <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No orders found in mirror.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-6"></th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Order #</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {(orders as any[]).map((o: any) => {
                  const hasNotes = !!(o.staff_notes || o.customer_order_notes);
                  const isExpanded = expandedOrder === o.id;
                  return (
                    <>
                      <tr
                        key={o.id}
                        data-testid={`row-order-${o.bigcommerce_order_id}`}
                        className={`border-b last:border-0 hover:bg-slate-50 ${hasNotes ? "cursor-pointer" : ""}`}
                        onClick={() => hasNotes && setExpandedOrder(isExpanded ? null : o.id)}
                      >
                        <td className="px-4 py-2.5 text-center">
                          {hasNotes && (
                            isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                              : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-blue-600">
                          #{o.order_number ?? o.bigcommerce_order_id}
                          {hasNotes && <span className="ml-1.5 text-[10px] text-amber-500">📝</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{fmtDate(o.order_date)}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={statusColor(o.status)} className="text-xs capitalize">{o.status ?? "—"}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtCurrency(o.order_total)}</td>
                      </tr>
                      {isExpanded && hasNotes && (
                        <tr key={`${o.id}-notes`} className="bg-amber-50 border-b">
                          <td colSpan={5} className="px-6 py-3 text-sm space-y-2">
                            {o.staff_notes && (
                              <div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Staff Notes</p>
                                <p className="text-slate-700">{o.staff_notes}</p>
                              </div>
                            )}
                            {o.customer_order_notes && (
                              <div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Customer Note</p>
                                <p className="text-slate-700">{o.customer_order_notes}</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────────── */}

      {/* Add Note */}
      <NoteModal
        open={showAddNote}
        title="Add Note"
        onClose={() => setShowAddNote(false)}
        onSave={data => createNoteMutation.mutate(data)}
        saving={createNoteMutation.isPending}
      />

      {/* Edit Note */}
      {editingNote && (
        <NoteModal
          open={!!editingNote}
          title="Edit Note"
          initial={{ note: editingNote.note, note_type: editingNote.note_type }}
          onClose={() => setEditingNote(null)}
          onSave={data => updateNoteMutation.mutate({ noteId: editingNote.id, data })}
          saving={updateNoteMutation.isPending}
        />
      )}

      {/* Delete Note Confirmation */}
      <Dialog open={deletingNoteId !== null} onOpenChange={v => { if (!v) setDeletingNoteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Note?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This note will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingNoteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingNoteId && deleteNoteMutation.mutate(deletingNoteId)} disabled={deleteNoteMutation.isPending} data-testid="btn-confirm-delete-note">
              {deleteNoteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Rep Modal */}
      <Dialog open={showAssignRep} onOpenChange={v => { if (!v) setShowAssignRep(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign Sales Rep</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Select Rep</Label>
            <Select value={selectedRep} onValueChange={setSelectedRep}>
              <SelectTrigger data-testid="select-assign-rep">
                <SelectValue placeholder="Choose a rep…" />
              </SelectTrigger>
              <SelectContent>
                {(crmUsers as { id: number; name: string }[]).map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignRep(false)}>Cancel</Button>
            <Button onClick={handleAssignRep} disabled={!selectedRep || assignSaving} data-testid="btn-confirm-assign-rep">
              {assignSaving ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
