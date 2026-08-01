import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Building2, User, Mail, Phone, Hash, TrendingUp, ShoppingBag,
  Calendar, DollarSign, Users, Plus, Pencil, Trash2, MessageSquare,
  UserCheck, UserMinus, AlertTriangle, Clock, ChevronLeft, ChevronRight,
  FileText, CreditCard, Edit3, RefreshCw, BookOpen, Save, CheckSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTimeService } from "@/hooks/useTimeService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBcAddress(addr: any): string {
  if (!addr) return "";
  const parts = [
    addr.address1 || addr.street_1 || addr.street1 || "",
    addr.address2 || addr.street_2 || addr.street2 || "",
    addr.city || "",
    [addr.state_or_province || addr.state || "", addr.postal_code || addr.zip || ""].filter(Boolean).join(" "),
    addr.country || "",
  ].filter(Boolean);
  return parts.join(", ");
}

function fmtCurrency(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/**
 * Resolve display name for who performed an action.
 * - name known          → name
 * - name missing + no id → "System" (auto-generated)
 * - name missing + id   → "Unknown" (user record deleted)
 */
function createdBy(name: string | null | undefined, actorId: number | null | undefined): string {
  if (name) return name;
  if (!actorId) return "System";
  return "Unknown";
}

function statusColor(s: string | null): "default" | "destructive" | "secondary" | "outline" {
  if (!s) return "secondary";
  const l = s.toLowerCase();
  if (l.includes("complete") || l.includes("shipped")) return "default";
  if (l.includes("cancel") || l.includes("refund")) return "destructive";
  return "secondary";
}

const HEALTH_COLORS: Record<string, string> = {
  Healthy:    "bg-green-100 text-green-700 border-green-200",
  Watch:      "bg-yellow-100 text-yellow-700 border-yellow-200",
  "At Risk":  "bg-orange-100 text-orange-700 border-orange-200",
  Lost:       "bg-red-100 text-red-700 border-red-200",
};

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

const NOTE_TYPES = ["General","Follow Up","Sales","Issue","Credit","Replacement","Visit","Internal","Order Note"];
const ACTION_MODE_NOTE = "note";
const ACTION_MODE_TODO = "todo";

function HealthBadge({ health }: { health: string | null | undefined }) {
  if (!health) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${HEALTH_COLORS[health] ?? "bg-slate-100 text-slate-600"}`}>
      <AlertTriangle className="h-3 w-3" />{health}
    </span>
  );
}
function NoteTypePill({ type }: { type: string }) {
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${NOTE_TYPE_COLORS[type] ?? "bg-slate-100 text-slate-600"}`}>{type}</span>;
}

// ─── Timeline helpers ─────────────────────────────────────────────────────────

function TimelineIconBg(type: string, action?: string) {
  if (type === "order")  return "bg-blue-100";
  if (type === "note")   return "bg-purple-100";
  if (type === "audit") {
    if (action === "note_deleted") return "bg-red-100";
    if (action === "bc_notes_updated") return "bg-teal-100";
    if (action?.includes("rep")) return "bg-green-100";
    if (action?.includes("note")) return "bg-purple-100";
    if (action?.includes("staff_note") || action?.includes("customer_note")) return "bg-amber-100";
  }
  return "bg-slate-100";
}
function TimelineIconEl({ type, action }: { type: string; action?: string }) {
  if (type === "order")  return <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />;
  if (type === "note")   return <MessageSquare className="h-3.5 w-3.5 text-purple-600" />;
  if (type === "audit") {
    if (action === "note_deleted")                                         return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
    if (action === "note_edited")                                          return <Pencil className="h-3.5 w-3.5 text-purple-600" />;
    if (action === "note_created" || action === "order_note_created")      return <MessageSquare className="h-3.5 w-3.5 text-purple-600" />;
    if (action === "bc_notes_updated")                                     return <BookOpen className="h-3.5 w-3.5 text-teal-600" />;
    if (action === "staff_note_updated" || action === "customer_note_updated") return <Edit3 className="h-3.5 w-3.5 text-amber-600" />;
    if (action?.includes("rep"))                                           return <UserCheck className="h-3.5 w-3.5 text-green-600" />;
  }
  return <FileText className="h-3.5 w-3.5 text-slate-400" />;
}
function TimelineDescription({ entry }: { entry: any }) {
  if (entry.type === "order") {
    return (
      <p className="text-sm text-slate-700">
        <span className="font-medium">Order #{entry.order_number ?? entry.bc_order_id}</span>
        {" — "}{fmtCurrency(entry.order_total)}
        {entry.status && <span className="ml-1 text-xs text-slate-400">({entry.status})</span>}
      </p>
    );
  }
  if (entry.type === "note") {
    return (
      <div>
        <p className="text-sm text-slate-700 flex items-center gap-1.5">
          <NoteTypePill type={entry.note_type ?? "General"} />
          {entry.order_id && <span className="text-xs text-indigo-500 font-medium">Order #{entry.order_id}</span>}
          <span className="text-xs text-slate-500">by {createdBy(entry.created_by_name, entry.created_by)}</span>
        </p>
        {entry.note_content && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{entry.note_content}</p>}
      </div>
    );
  }
  if (entry.type === "audit") {
    const who = createdBy(entry.user_name, entry.user_id);
    const d = entry.detail as any ?? {};
    switch (entry.action) {
      case "note_created":
        return <p className="text-sm text-slate-700"><span className="font-medium">{who}</span> created a <NoteTypePill type={d.note_type ?? "General"} /> note.</p>;
      case "order_note_created":
        return <p className="text-sm text-slate-700"><span className="font-medium">{who}</span> created an Order Note{d.order_id ? ` for Order #${d.order_id}` : ""}.</p>;
      case "note_edited":
        return <p className="text-sm text-slate-700"><span className="font-medium">{who}</span> updated a <NoteTypePill type={d.note_type ?? "General"} /> note.</p>;
      case "note_deleted":
        return <p className="text-sm text-red-700"><span className="font-medium">{who}</span> deleted a <NoteTypePill type={d.note_type ?? "General"} /> note.</p>;
      case "staff_note_updated":
        return <p className="text-sm text-slate-700"><span className="font-medium">{who}</span> updated Staff Note{d.bc_order_id ? ` for Order #${d.bc_order_id}` : ""}.</p>;
      case "customer_note_updated":
        return <p className="text-sm text-slate-700"><span className="font-medium">{who}</span> updated Customer Note{d.bc_order_id ? ` for Order #${d.bc_order_id}` : ""}.</p>;
      case "bc_notes_updated":
        return <p className="text-sm text-slate-700"><span className="font-medium">{who}</span> updated <span className="font-medium text-teal-700">Customer General Notes</span>{d.source === "crm_note_created" ? <span className="text-xs text-slate-400 ml-1">(auto-synced from CRM note)</span> : ""}.</p>;
      case "sales_rep_assigned":
        return <p className="text-sm text-slate-700"><span className="font-medium">Rep assigned:</span> {d.rep_name ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "sales_rep_reassigned":
        return <p className="text-sm text-slate-700"><span className="font-medium">Rep changed</span> to {d.rep_name ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "sales_rep_removed":
        return <p className="text-sm text-slate-700"><span className="font-medium">Rep removed</span> <span className="text-xs text-slate-400">by {who}</span></p>;
      case "primary_rep_assigned":
        return <p className="text-sm text-slate-700"><span className="font-medium">Primary Rep assigned:</span> {d.new_value ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "primary_rep_changed":
        return <p className="text-sm text-slate-700"><span className="font-medium">Primary Rep changed:</span> {d.old_value ?? "—"} → {d.new_value ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "primary_rep_removed":
        return <p className="text-sm text-slate-700"><span className="font-medium">Primary Rep removed:</span> {d.old_value ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "secondary_rep_assigned":
        return <p className="text-sm text-slate-700"><span className="font-medium">Secondary Rep assigned:</span> {d.new_value ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "secondary_rep_changed":
        return <p className="text-sm text-slate-700"><span className="font-medium">Secondary Rep changed:</span> {d.old_value ?? "—"} → {d.new_value ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "secondary_rep_removed":
        return <p className="text-sm text-slate-700"><span className="font-medium">Secondary Rep removed:</span> {d.old_value ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "customer_type_changed":
        return <p className="text-sm text-slate-700"><span className="font-medium">Customer Type changed:</span> {d.old_value ?? "—"} → {d.new_value ?? "—"} <span className="text-xs text-slate-400">by {who}</span></p>;
      case "address_type_updated":
        return <p className="text-sm text-slate-700"><span className="font-medium">Address Type updated:</span> {d.old_value ?? "—"} → {d.new_value ?? "—"} <span className="text-xs text-slate-400 ml-1">(Source: BigCommerce)</span></p>;
    }
  }
  return <p className="text-sm text-slate-500">Activity recorded</p>;
}

// ─── Note Modal ───────────────────────────────────────────────────────────────

interface NoteModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { note: string; note_type: string; order_id?: number | null; bc_target: string }) => void;
  onSaveTodo?: (data: { title: string; note: string; priority: string; due_date: string | null; assigned_to_user_id?: number | null }) => void;
  saving: boolean;
  initial?: { note: string; note_type: string; order_id?: number | null };
  title: string;
  orders?: any[];
  users?: { id: number; name: string }[];
  currentUserId?: number | null;
}
function NoteModal({ open, onClose, onSave, onSaveTodo, saving, initial, title, orders = [], users = [], currentUserId }: NoteModalProps) {
  const [actionMode, setActionMode] = useState<"note" | "todo">(ACTION_MODE_NOTE);
  const [note, setNote]         = useState(initial?.note ?? "");
  const [noteType, setNoteType] = useState(initial?.note_type ?? "General");
  const [orderId, setOrderId]   = useState<string>(String(initial?.order_id ?? ""));
  const [bcStaff, setBcStaff]   = useState(false);
  const [bcCustomer, setBcCustomer] = useState(false);
  // Todo fields
  const [todoTitle, setTodoTitle]       = useState("");
  const [todoNote, setTodoNote]         = useState("");
  const [todoPriority, setTodoPriority] = useState("medium");
  const [todoDueDate, setTodoDueDate]   = useState("");
  const [todoAssigned, setTodoAssigned] = useState(currentUserId ? String(currentUserId) : "");

  const handleClose = () => {
    setActionMode(ACTION_MODE_NOTE);
    setNote(initial?.note ?? ""); setNoteType(initial?.note_type ?? "General");
    setOrderId(String(initial?.order_id ?? "")); setBcStaff(false); setBcCustomer(false);
    setTodoTitle(""); setTodoNote(""); setTodoPriority("medium"); setTodoDueDate(""); setTodoAssigned(currentUserId ? String(currentUserId) : "");
    onClose();
  };

  const bcTarget    = bcStaff && bcCustomer ? "both" : bcStaff ? "staff" : bcCustomer ? "customer" : "crm";
  const isOrderNote = noteType === "Order Note";
  const effectiveOrderId = (orderId && orderId !== "__none__") ? orderId : "";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Top-level: Note or To Do */}
          <div>
            <Label className="text-xs mb-1.5 block">Action Type</Label>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setActionMode(ACTION_MODE_NOTE)}
                className={`flex-1 py-1.5 text-sm font-medium transition-colors ${actionMode === ACTION_MODE_NOTE ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                Note
              </button>
              <button
                type="button"
                onClick={() => setActionMode(ACTION_MODE_TODO)}
                className={`flex-1 py-1.5 text-sm font-medium transition-colors ${actionMode === ACTION_MODE_TODO ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                To Do
              </button>
            </div>
          </div>

          {actionMode === ACTION_MODE_NOTE ? (
            <>
              <div>
                <Label className="text-xs mb-1.5 block">Type</Label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger data-testid="select-note-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{NOTE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {isOrderNote && orders.length > 0 && (
                <div>
                  <Label className="text-xs mb-1.5 block">Associated Order</Label>
                  <Select value={orderId} onValueChange={setOrderId}>
                    <SelectTrigger data-testid="select-note-order"><SelectValue placeholder="Select order (optional)…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No specific order</SelectItem>
                      {orders.map((o: any) => (
                        <SelectItem key={o.bigcommerce_order_id} value={String(o.bigcommerce_order_id)}>
                          #{o.order_number ?? o.bigcommerce_order_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs mb-1.5 block">Note</Label>
                <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Enter note…" rows={4} data-testid="textarea-note" />
              </div>
              {isOrderNote && !!effectiveOrderId && (
                <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">BigCommerce Sync</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <Checkbox checked={bcStaff} onCheckedChange={v => setBcStaff(!!v)} id="bc-staff" data-testid="check-bc-staff" />
                    <span>Staff Note (BigCommerce)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <Checkbox checked={bcCustomer} onCheckedChange={v => setBcCustomer(!!v)} id="bc-customer" data-testid="check-bc-customer" />
                    <span>Customer Note (BigCommerce)</span>
                  </label>
                  <p className="text-[11px] text-slate-400">Leave unchecked to store in CRM only.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs mb-1.5 block">Title *</Label>
                <Input value={todoTitle} onChange={e => setTodoTitle(e.target.value)} placeholder="What needs to be done?" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Description</Label>
                <Textarea value={todoNote} onChange={e => setTodoNote(e.target.value)} placeholder="Optional details…" rows={2} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs mb-1.5 block">Priority</Label>
                  <Select value={todoPriority} onValueChange={setTodoPriority}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs mb-1.5 block">Due Date</Label>
                  <Input type="date" value={todoDueDate} onChange={e => setTodoDueDate(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              {users.length > 0 && (
                <div>
                  <Label className="text-xs mb-1.5 block">Assigned To</Label>
                  <Select value={todoAssigned} onValueChange={setTodoAssigned}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          {actionMode === ACTION_MODE_NOTE ? (
            <Button onClick={() => onSave({ note, note_type: noteType, order_id: effectiveOrderId ? parseInt(effectiveOrderId) : null, bc_target: bcTarget })} disabled={!note.trim() || saving} data-testid="btn-save-note">
              {saving ? "Saving…" : "Save Note"}
            </Button>
          ) : (
            <Button onClick={() => onSaveTodo?.({ title: todoTitle, note: todoNote, priority: todoPriority, due_date: todoDueDate || null, assigned_to_user_id: todoAssigned ? parseInt(todoAssigned) : null })} disabled={!todoTitle.trim() || saving}>
              {saving ? "Saving…" : "Create To Do"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order Notes Modal (editable) ─────────────────────────────────────────────

function OrderNotesModal({ order, customerId, onClose, onSaved }: { order: any; customerId: number; onClose: () => void; onSaved: () => void }) {
  const fmt = useTimeService();
  const { toast } = useToast();
  const [custNote, setCustNote]   = useState(order?.customer_order_notes ?? "");
  const [staffNote, setStaffNote] = useState(order?.staff_notes ?? "");
  const [saving, setSaving]       = useState(false);
  const isDirty = custNote !== (order?.customer_order_notes ?? "") || staffNote !== (order?.staff_notes ?? "");

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/crm/customers/${customerId}/orders/${order.bigcommerce_order_id}/notes`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ customer_note: custNote, staff_notes: staffNote }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to save");
      toast({ title: "Notes saved" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!order} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Order #{order?.order_number ?? order?.bigcommerce_order_id}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 text-sm text-slate-500 mb-3 shrink-0">
          {order?.order_date && <span>{fmt.dateTime(order.order_date)}</span>}
          {order?.status && <Badge variant={statusColor(order.status)} className="capitalize text-xs">{order.status}</Badge>}
          {order?.order_total && <span className="font-semibold text-slate-800">{fmtCurrency(order.order_total)}</span>}
        </div>
        <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col flex-1 min-h-0">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block shrink-0">Customer Order Note</Label>
            <Textarea value={custNote} onChange={e => setCustNote(e.target.value)} className="flex-1 resize-none min-h-0" placeholder="No customer note…" data-testid="textarea-customer-note" />
          </div>
          <div className="flex flex-col flex-1 min-h-0">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block shrink-0">Staff Note</Label>
            <Textarea value={staffNote} onChange={e => setStaffNote(e.target.value)} className="flex-1 resize-none min-h-0" placeholder="No staff note…" data-testid="textarea-staff-note" />
          </div>
        </div>
        <DialogFooter className="shrink-0 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!isDirty || saving} data-testid="btn-save-order-notes">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Orders Table ─────────────────────────────────────────────────────────────

function OrdersTable({ orders, onRowClick }: { orders: any[]; onRowClick: (o: any) => void }) {
  const fmt = useTimeService();
  if (orders.length === 0) {
    return <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No orders found.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Order #</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Date & Time</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Status</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Customer Note</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Staff Note</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any) => {
            const hasNotes = !!(o.staff_notes || o.customer_order_notes);
            return (
              <tr
                key={o.id}
                data-testid={`row-order-${o.bigcommerce_order_id}`}
                className="border-b last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => onRowClick(o)}
              >
                <td className="px-3 py-2.5 font-mono text-xs text-blue-600 whitespace-nowrap w-24">
                  #{o.order_number ?? o.bigcommerce_order_id}
                  {(o.staff_notes || o.customer_order_notes) && <span className="ml-1 text-amber-500 text-[10px]">📝</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs w-32">{fmt.dateTime(o.order_date)}</td>
                <td className="px-3 py-2.5 w-24">
                  <Badge variant={statusColor(o.status)} className="text-xs capitalize">{o.status ?? "—"}</Badge>
                </td>
                <td className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap w-24">{fmtCurrency(o.order_total)}</td>
                <td className="px-3 py-2.5">
                  {o.customer_order_notes
                    ? <span className="block truncate text-xs text-slate-500 max-w-xs">{o.customer_order_notes}</span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {o.staff_notes
                    ? <span className="block truncate text-xs text-slate-500 max-w-xs">{o.staff_notes}</span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "orders" | "notes" | "timeline";

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function CustomerProfile() {
  const fmt = useTimeService();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params.id);

  const currentUser      = useStore((s) => s.currentUser);
  const currentUserId    = currentUser?.id ?? null;
  const isAdmin          = currentUser?.role === "admin";
  const canCreateNote    = hasPermission("crm", "add_note");
  const canEditNote      = hasPermission("crm", "notes_edit");
  const canDeleteNote    = hasPermission("crm", "notes_delete");
  const canAssignRep     = hasPermission("crm", "assign_rep");
  const canEditBcNotes   = hasPermission("crm", "edit_customer_notes");
  const canManageTodos   = isAdmin || hasPermission("crm", "manage_todos") || hasPermission("crm", "add_note");
  const canManageAccountType = isAdmin || hasPermission("crm", "manage_account_classification");
  const canManageInactive    = isAdmin || hasPermission("crm", "manage_inactive_accounts");

  const [activeTab, setActiveTab]           = useState<Tab>("overview");
  const [showAddNote, setShowAddNote]       = useState(false);
  const [showAddTodo, setShowAddTodo]       = useState(false);
  const [editingTodo, setEditingTodo]       = useState<any | null>(null);
  const [deletingTodoId, setDeletingTodoId] = useState<number | null>(null);
  const [todoTitle, setTodoTitle]           = useState("");
  const [todoNote, setTodoNote]             = useState("");
  const [todoPriority, setTodoPriority]     = useState("medium");
  const [todoDueDate, setTodoDueDate]       = useState("");
  const [todoAssignedTo, setTodoAssignedTo] = useState("");
  const [editingNote, setEditingNote]       = useState<any | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [showAssignRep, setShowAssignRep]   = useState(false);
  const [repAssignMode, setRepAssignMode]   = useState<"primary" | "secondary">("primary");
  const [selectedRep, setSelectedRep]       = useState("");
  const [assignSaving, setAssignSaving]     = useState(false);
  const [orderModal, setOrderModal]         = useState<any | null>(null);
  const [generalNotesEdit, setGeneralNotesEdit] = useState<string | null>(null); // null = not loaded yet
  const [savingBcNotes, setSavingBcNotes]   = useState(false);
  const [selectedAddressIdx, setSelectedAddressIdx] = useState(0);

  // Orders tab pagination
  const [ordersPage, setOrdersPage]         = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(25);

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

  const { data: addressBook = [], isLoading: loadingAddresses } = useQuery<any[]>({
    queryKey: ["crm", "customer", id, "addresses"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}/addresses`, { headers: getAuthHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["crm", "customer", id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}/orders`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json();
    },
    enabled: !!id,
    staleTime: 0,
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

  const { data: todos = [], isLoading: loadingTodos } = useQuery<any[]>({
    queryKey: ["crm", "customer", id, "todos"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/todos?customerId=${id}&status=all&allUsers=true`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load todos");
      return r.json();
    },
    enabled: !!id,
  });

  const { data: bcNotesData, isLoading: loadingBcNotes, refetch: refetchBcNotes } = useQuery({
    queryKey: ["crm", "customer", id, "bc-notes"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}/bc-notes`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load BC notes");
      return r.json() as Promise<{ generalNotes: string; crmHistory: string; raw: string }>;
    },
    enabled: activeTab === "notes",
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

  const invalidateTodos = () => {
    queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "todos"] });
    queryClient.invalidateQueries({ queryKey: ["crm", "todos"] });
  };

  const createTodoMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/crm/todos", {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, customer_id: id }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to create to do");
      return r.json();
    },
    onSuccess: () => {
      invalidateTodos();
      setShowAddTodo(false);
      setTodoTitle(""); setTodoNote(""); setTodoPriority("medium"); setTodoDueDate(""); setTodoAssignedTo("");
      toast({ title: "To Do created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateTodoMutation = useMutation({
    mutationFn: async ({ todoId, data }: { todoId: number; data: any }) => {
      const r = await fetch(`/api/crm/todos/${todoId}`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to update to do");
      return r.json();
    },
    onSuccess: () => { invalidateTodos(); setEditingTodo(null); toast({ title: "To Do updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTodoMutation = useMutation({
    mutationFn: async (todoId: number) => {
      const r = await fetch(`/api/crm/todos/${todoId}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to delete to do");
    },
    onSuccess: () => { invalidateTodos(); setDeletingTodoId(null); toast({ title: "To Do deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { note: string; note_type: string; order_id?: number | null; bc_target?: string }) => {
      const r = await fetch(`/api/crm/customers/${id}/notes`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to create note");
      return r.json();
    },
    onSuccess: () => { invalidateNotes(); setShowAddNote(false); toast({ title: "Note added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: number; data: { note: string; note_type: string; order_id?: number | null } }) => {
      const r = await fetch(`/api/crm/customers/${id}/notes/${noteId}`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to update note");
      return r.json();
    },
    onSuccess: () => { invalidateNotes(); setEditingNote(null); toast({ title: "Note updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      const r = await fetch(`/api/crm/customers/${id}/notes/${noteId}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to delete note");
    },
    onSuccess: () => { invalidateNotes(); setDeletingNoteId(null); toast({ title: "Note deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleAssignRep = async () => {
    if (!selectedRep) return;
    setAssignSaving(true);
    try {
      const field = repAssignMode === "primary" ? "primary_rep_id" : "secondary_rep_id";
      const r = await fetch(`/api/crm/customers/${id}`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: parseInt(selectedRep) }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to assign rep");
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "timeline"] });
      toast({ title: repAssignMode === "primary" ? "Primary rep assigned" : "Secondary rep assigned" });
      setShowAssignRep(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAssignSaving(false); }
  };

  const handleRemoveRep = async (mode: "primary" | "secondary") => {
    try {
      const field = mode === "primary" ? "primary_rep_id" : "secondary_rep_id";
      const r = await fetch(`/api/crm/customers/${id}`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: null }),
      });
      if (!r.ok) throw new Error("Failed to remove rep");
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "timeline"] });
      toast({ title: mode === "primary" ? "Primary rep removed" : "Secondary rep removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleMasterFieldChange = async (field: string, value: string) => {
    try {
      const r = await fetch(`/api/crm/customers/${id}`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to update");
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── BC notes edit buffer sync (hooks must be before any early returns) ────────

  // Sync edit buffer when bc-notes data arrives or tab opens
  useEffect(() => {
    if (bcNotesData && generalNotesEdit === null) {
      setGeneralNotesEdit(bcNotesData.generalNotes ?? "");
    }
  }, [bcNotesData]);

  // Reset edit buffer when tab changes away from notes
  useEffect(() => {
    if (activeTab !== "notes") setGeneralNotesEdit(null);
  }, [activeTab]);

  // ── Loading / Error ───────────────────────────────────────────────────────────

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

  // Overview: latest 5 notes, latest 10 timeline, latest 20 orders
  const recentNotes    = (notes as any[]).slice(0, 5);
  const recentTimeline = (timeline as any[]).slice(0, 10);
  const recentOrders   = (orders as any[]).slice(0, 20);

  // Orders tab pagination
  const allOrders      = orders as any[];
  const pageSize       = ordersPageSize === -1 ? allOrders.length : ordersPageSize;
  const totalOrderPages = ordersPageSize === -1 ? 1 : Math.max(1, Math.ceil(allOrders.length / ordersPageSize));
  const pagedOrders    = ordersPageSize === -1
    ? allOrders
    : allOrders.slice((ordersPage - 1) * pageSize, ordersPage * pageSize);

  const handlePageSizeChange = (val: string) => {
    setOrdersPageSize(val === "all" ? -1 : parseInt(val));
    setOrdersPage(1);
  };

  // ── Tab nav ────────────────────────────────────────────────────────────────

  const handleSaveBcNotes = async () => {
    if (generalNotesEdit === null) return;
    setSavingBcNotes(true);
    try {
      const r = await fetch(`/api/crm/customers/${id}/bc-notes`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ generalNotes: generalNotesEdit }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to save");
      toast({ title: "General notes saved to BigCommerce" });
      refetchBcNotes();
      queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "timeline"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSavingBcNotes(false); }
  };

  // Next follow-up: nearest pending todo with a due_date
  const nextFollowUp = (todos as any[])
    .filter((t: any) => !t.completed_at && t.due_date)
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0] ?? null;

  const pendingTodos  = (todos as any[]).filter((t: any) => !t.completed_at);
  const totalActions  = (notes as any[]).length + (todos as any[]).length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "overview",  label: "Overview",  icon: <User className="h-3.5 w-3.5" /> },
    { id: "orders",    label: "Orders",    icon: <ShoppingBag className="h-3.5 w-3.5" />, count: allOrders.length || undefined },
    { id: "notes",     label: "Actions",   icon: <MessageSquare className="h-3.5 w-3.5" />, count: totalActions || undefined },
    { id: "timeline",  label: "Timeline",  icon: <Clock className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-col min-h-full bg-slate-50">

      {/* ══════════════════════════════════════════════════════════════════════
          BACK NAV
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b px-4 md:px-6 py-2">
        <Button variant="ghost" size="sm" className="-ml-1 text-slate-500 hover:text-slate-800" onClick={() => setLocation("/crm/customers")} data-testid="btn-back-customers">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> CRM Customers
        </Button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER CARD (full bordered card)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 md:px-6 pt-4">
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">

            {/* Avatar + info */}
            <div className="flex gap-4 flex-1 min-w-0">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                {customer.company && (
                  <div className="flex items-center gap-1.5 text-slate-500 text-sm mb-0.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-semibold text-slate-700 truncate">{customer.company}</span>
                  </div>
                )}
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <h1 className="text-xl font-bold text-slate-900">
                    {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}
                  </h1>
                  <HealthBadge health={customer.account_health} />
                </div>
                {/* Contact */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mb-2">
                  {customer.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" />{customer.email}</span>}
                  {customer.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{customer.phone}</span>}
                  <span className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 shrink-0" />BC ID: {customer.bigcommerce_customer_id}</span>
                  {customer.created_date && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 shrink-0" />Joined {fmt.date(customer.created_date)}</span>}
                  {customer.customer_group_name && (
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {customer.customer_group_name}
                      {customer.customer_group_id && <span className="text-slate-400 ml-0.5">({customer.customer_group_id})</span>}
                    </span>
                  )}
                </div>
                {/* Primary Rep / Secondary Rep */}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-1">
                  {/* Primary Rep */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium shrink-0">Primary Rep:</span>
                    {customer.primary_rep_name
                      ? <Badge variant="secondary" className="text-xs gap-1"><UserCheck className="h-3 w-3" />{customer.primary_rep_name}</Badge>
                      : <span className="text-xs text-slate-400">Unassigned</span>}
                    {canAssignRep && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" data-testid="btn-assign-primary-rep"
                          onClick={() => { setRepAssignMode("primary"); setSelectedRep(customer.primary_rep_id ? String(customer.primary_rep_id) : ""); setShowAssignRep(true); }}>
                          {customer.primary_rep_name ? "Change" : "Assign"}
                        </Button>
                        {customer.primary_rep_name && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-500 hover:text-red-700" data-testid="btn-remove-primary-rep"
                            onClick={() => handleRemoveRep("primary")}>
                            <UserMinus className="h-3 w-3 mr-1" />Remove
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {/* Secondary Rep */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium shrink-0">Secondary Rep:</span>
                    {customer.secondary_rep_name
                      ? <Badge variant="secondary" className="text-xs gap-1"><UserCheck className="h-3 w-3" />{customer.secondary_rep_name}</Badge>
                      : <span className="text-xs text-slate-400">Unassigned</span>}
                    {canAssignRep && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" data-testid="btn-assign-secondary-rep"
                          onClick={() => { setRepAssignMode("secondary"); setSelectedRep(customer.secondary_rep_id ? String(customer.secondary_rep_id) : ""); setShowAssignRep(true); }}>
                          {customer.secondary_rep_name ? "Change" : "Assign"}
                        </Button>
                        {customer.secondary_rep_name && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-500 hover:text-red-700" data-testid="btn-remove-secondary-rep"
                            onClick={() => handleRemoveRep("secondary")}>
                            <UserMinus className="h-3 w-3 mr-1" />Remove
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {/* Address Book Dropdown */}
                <div className="flex items-center gap-2 mt-1.5 min-w-0">
                  <span className="text-xs text-slate-500 font-medium shrink-0">Address:</span>
                  {loadingAddresses ? (
                    <span className="text-xs text-slate-400">Loading…</span>
                  ) : addressBook.length > 0 ? (
                    <Select
                      value={String(Math.min(selectedAddressIdx, addressBook.length - 1))}
                      onValueChange={v => setSelectedAddressIdx(parseInt(v))}
                    >
                      <SelectTrigger className="h-6 text-xs flex-1 min-w-0 max-w-lg border border-slate-200 rounded-md px-2 gap-1 focus:ring-1 focus:ring-blue-400" data-testid="select-address-book">
                        <SelectValue>
                          <span className="truncate">{formatBcAddress(addressBook[Math.min(selectedAddressIdx, addressBook.length - 1)])}</span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-w-lg">
                        {addressBook.map((addr: any, i: number) => (
                          <SelectItem key={i} value={String(i)}>
                            <div className="py-0.5">
                              {addr.company && <div className="font-medium text-xs text-slate-800">{addr.company}</div>}
                              <div className="text-xs text-slate-600">{formatBcAddress(addr)}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-slate-400">No addresses on file</span>
                  )}
                </div>

                {/* Next Follow Up */}
                {nextFollowUp && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-xs text-slate-500 font-medium shrink-0">Next Follow Up:</span>
                    <span className={`text-xs font-medium flex items-center gap-1 ${nextFollowUp.is_overdue ? "text-red-600" : "text-blue-600"}`}>
                      <Calendar className="h-3 w-3" />
                      {fmt.date(nextFollowUp.due_date)} — {nextFollowUp.title}
                      {nextFollowUp.is_overdue && <span className="text-[10px] font-normal text-red-400">(overdue)</span>}
                    </span>
                  </div>
                )}

                {/* Customer Type / Address Type */}
                <div className="flex items-center flex-wrap gap-x-5 gap-y-1 mt-1.5">
                  {/* Account Type (SalesCore ERP field) */}
                  {canManageAccountType ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-medium">Account:</span>
                      <Select value={customer.account_type ?? "customer"} onValueChange={v => handleMasterFieldChange("account_type", v)}>
                        <SelectTrigger className="h-6 text-xs w-auto border border-slate-200 rounded-md px-2 gap-1 focus:ring-1 focus:ring-blue-400">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="internal">Internal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : customer.account_type && customer.account_type !== "customer" ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-medium">Account:</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 capitalize">{customer.account_type}</span>
                    </div>
                  ) : null}
                  {/* Inactive state */}
                  {customer.inactive_at ? (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">Inactive</span>
                      {customer.inactive_reason && <span className="text-xs text-slate-400 capitalize">{customer.inactive_reason.replace(/_/g, " ")}</span>}
                      {canManageInactive && (
                        <Button size="sm" variant="outline" className="h-5 text-[10px] px-2 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={async () => {
                            try {
                              await fetch(`/api/crm/customers/${id}`, {
                                method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                body: JSON.stringify({ restore_active: true }),
                              });
                              queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
                              toast({ title: "Customer restored to active" });
                            } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                          }}>
                          Restore
                        </Button>
                      )}
                    </div>
                  ) : canManageInactive ? (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 text-slate-400 hover:text-red-600"
                        onClick={async () => {
                          const reason = window.prompt("Mark inactive? Enter reason (optional):", "") ?? null;
                          if (reason === null) return; // cancelled
                          try {
                            await fetch(`/api/crm/customers/${id}`, {
                              method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                              body: JSON.stringify({ mark_inactive: true, inactive_reason: reason || null }),
                            });
                            queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
                            toast({ title: "Customer marked inactive" });
                          } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                        }}>
                        Mark Inactive
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-medium">Type:</span>
                    <Select value={customer.customer_type ?? "Store"} onValueChange={v => handleMasterFieldChange("customer_type", v)}>
                      <SelectTrigger className="h-6 text-xs w-auto border border-slate-200 rounded-md px-2 gap-1 focus:ring-1 focus:ring-blue-400" data-testid="select-customer-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Store">Store</SelectItem>
                        <SelectItem value="Distributor">Distributor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-medium">Address Type:</span>
                    <span className="text-xs text-slate-700 font-medium" data-testid="text-address-type">
                      {customer.address_type === "Commercial"
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700">Commercial</span>
                        : customer.address_type === "Residential"
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-orange-100 text-orange-700">Residential</span>
                        : <span className="text-slate-400 text-xs">Unknown</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Days since last order — far right */}
            {daysSince != null && (
              <div className="shrink-0 text-right sm:border-l sm:pl-5 border-t sm:border-t-0 pt-3 sm:pt-0">
                <p className={`text-4xl font-extrabold leading-none ${daysSince > 90 ? "text-red-500" : daysSince > 30 ? "text-amber-500" : "text-green-600"}`}>
                  {daysSince}d
                </p>
                <p className="text-xs text-slate-400 mt-1">since last order</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SUMMARY CARDS ROW
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 md:px-6 pt-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard icon={<DollarSign className="h-4 w-4 text-green-500" />} label="Lifetime Revenue" value={fmtCurrency(customer.lifetime_revenue)} testId="text-lifetime-revenue" />
          <SummaryCard icon={<ShoppingBag className="h-4 w-4 text-blue-500" />} label="Lifetime Orders" value={lifetimeOrders.toLocaleString()} testId="text-lifetime-orders" />
          <SummaryCard icon={<TrendingUp className="h-4 w-4 text-purple-500" />} label="Avg Order Value" value={fmtCurrency(avgOrderValue)} />
          <SummaryCard icon={<Calendar className="h-4 w-4 text-amber-500" />} label="Last Order" value={customer.last_order_date ? fmt.date(customer.last_order_date) : "—"} testId="text-last-order-date" />
          <StoreCreditCard
            value={fmtCurrency(customer.store_credit_balance ?? 0)}
            updatedAt={customer.updated_at}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] })}
            isRefreshing={loadingCustomer}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB NAV
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 md:px-6 pt-3">
        <div className="bg-white border rounded-t-xl overflow-x-auto">
          <div className="flex gap-0 min-w-max px-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                {tab.icon}{tab.label}
                {tab.count != null && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    activeTab === tab.id ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB CONTENT
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 md:px-6 pb-6">
        <div className="bg-white border border-t-0 rounded-b-xl overflow-hidden">

          {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="p-5 space-y-5">

              {/* Recent Notes + Recent Activity columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Recent Notes */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-slate-400" />Recent Notes
                    </h2>
                    <div className="flex items-center gap-2">
                      {canCreateNote && (
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={() => setShowAddNote(true)} data-testid="btn-add-note">
                          <Plus className="h-3 w-3" />Add
                        </Button>
                      )}
                      {(notes as any[]).length > 5 && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-blue-600" onClick={() => setActiveTab("notes")}>
                          View all ({(notes as any[]).length})
                        </Button>
                      )}
                    </div>
                  </div>
                  {loadingNotes ? (
                    <div className="flex items-center justify-center h-20 text-slate-400 text-sm">Loading…</div>
                  ) : recentNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-20 text-slate-400 text-xs">
                      <MessageSquare className="h-5 w-5 mb-1 opacity-30" />No notes yet
                    </div>
                  ) : (
                    <div className="divide-y">
                      {recentNotes.map((note: any) => (
                        <div key={note.id} className="px-4 py-3">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <NoteTypePill type={note.note_type} />
                          </div>
                          <p className="text-xs font-semibold text-slate-700 mb-0.5">{createdBy(note.created_by_name, note.created_by)}</p>
                          <p className="text-[11px] text-slate-400 mb-1">{fmt.dateTime(note.created_at)}</p>
                          <p className="text-xs text-slate-600 line-clamp-2">{note.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-400" />Recent Activity
                    </h2>
                    {(timeline as any[]).length > 10 && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-blue-600" onClick={() => setActiveTab("timeline")}>
                        View all
                      </Button>
                    )}
                  </div>
                  {loadingTimeline ? (
                    <div className="flex items-center justify-center h-20 text-slate-400 text-sm">Loading…</div>
                  ) : recentTimeline.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-20 text-slate-400 text-xs">No activity yet</div>
                  ) : (
                    <div className="px-4 py-3 space-y-0">
                      {recentTimeline.map((entry: any, i: number) => {
                        const isLast = i === recentTimeline.length - 1;
                        return (
                          <div key={entry.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${TimelineIconBg(entry.type, entry.action)}`}>
                                <TimelineIconEl type={entry.type} action={entry.action} />
                              </div>
                              {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
                            </div>
                            <div className={`pb-3 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
                              <p className="text-[10px] text-slate-400 mb-0.5">{fmt.relative(entry.date)}</p>
                              <TimelineDescription entry={entry} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Order History (latest 20) — replaces Customer Summary panel */}
              <div className="border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4 text-slate-400" />Order History (Latest 20)
                  </h2>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-blue-600" onClick={() => setActiveTab("orders")} data-testid="btn-view-all-orders">
                    View All Orders →
                  </Button>
                </div>
                {loadingOrders ? (
                  <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Loading orders…</div>
                ) : (
                  <OrdersTable orders={recentOrders} onRowClick={setOrderModal} />
                )}
              </div>
            </div>
          )}

          {/* ── ORDERS TAB ────────────────────────────────────────────────── */}
          {activeTab === "orders" && (
            <div>
              {/* Controls row */}
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-slate-700">
                  Order History
                  {allOrders.length > 0 && <span className="ml-1.5 text-xs font-normal text-slate-400">({allOrders.length} total)</span>}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Rows per page</span>
                  <Select value={ordersPageSize === -1 ? "all" : String(ordersPageSize)} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="h-7 text-xs w-20" data-testid="select-orders-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loadingOrders ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading orders…</div>
              ) : (
                <OrdersTable orders={pagedOrders} onRowClick={setOrderModal} />
              )}

              {/* Pagination */}
              {ordersPageSize !== -1 && totalOrderPages > 1 && (
                <div className="px-4 py-3 border-t flex items-center justify-between bg-slate-50">
                  <p className="text-xs text-slate-500">
                    Page {ordersPage} of {totalOrderPages} &nbsp;·&nbsp; {allOrders.length} orders
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setOrdersPage(1)} disabled={ordersPage === 1} data-testid="btn-orders-first">
                      «
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setOrdersPage(p => Math.max(1, p - 1))} disabled={ordersPage === 1} data-testid="btn-orders-prev">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {/* Page numbers */}
                    {Array.from({ length: Math.min(5, totalOrderPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(ordersPage - 2, totalOrderPages - 4));
                      const pg = start + i;
                      if (pg > totalOrderPages) return null;
                      return (
                        <Button key={pg} variant={pg === ordersPage ? "default" : "outline"} size="sm" className="h-7 min-w-[28px] px-2 text-xs" onClick={() => setOrdersPage(pg)}>
                          {pg}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setOrdersPage(p => Math.min(totalOrderPages, p + 1))} disabled={ordersPage === totalOrderPages} data-testid="btn-orders-next">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setOrdersPage(totalOrderPages)} disabled={ordersPage === totalOrderPages} data-testid="btn-orders-last">
                      »
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NOTES TAB ─────────────────────────────────────────────────── */}
          {activeTab === "notes" && (
            <div>

              {/* ── SECTION 1: Customer Account Notes (BigCommerce) ────────── */}
              <div className="border-b">
                <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-3 flex-wrap border-b">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-slate-400" />
                      Customer Account Notes
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Permanent account-level notes synced with BigCommerce.
                    </p>
                  </div>
                  {canEditBcNotes && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5 shrink-0"
                      onClick={handleSaveBcNotes}
                      disabled={savingBcNotes || loadingBcNotes || generalNotesEdit === null || generalNotesEdit === (bcNotesData?.generalNotes ?? "")}
                      data-testid="btn-save-bc-notes"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {savingBcNotes ? "Saving…" : "Save To BigCommerce"}
                    </Button>
                  )}
                </div>
                {loadingBcNotes ? (
                  <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Loading from BigCommerce…</div>
                ) : (
                  <div className="p-4">
                    <Textarea
                      data-testid="textarea-general-notes"
                      value={generalNotesEdit ?? ""}
                      onChange={e => canEditBcNotes && setGeneralNotesEdit(e.target.value)}
                      readOnly={!canEditBcNotes}
                      placeholder={canEditBcNotes ? "Enter general account notes here…" : "No account notes."}
                      className={`min-h-[140px] text-sm font-mono resize-y w-full ${!canEditBcNotes ? "bg-slate-50 cursor-default" : ""}`}
                    />
                  </div>
                )}
              </div>

              {/* ── SECTION 2: CRM Notes ───────────────────────────────────── */}
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-slate-400" />
                  CRM Notes {(notes as any[]).length > 0 && <span className="text-xs font-normal text-slate-400">({(notes as any[]).length})</span>}
                </h2>
                {canCreateNote && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddNote(true)} data-testid="btn-add-note-tab">
                    <Plus className="h-3.5 w-3.5" />Add Note
                  </Button>
                )}
              </div>
              {loadingNotes ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
              ) : (notes as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">No notes yet</p>
                  {canCreateNote && <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={() => setShowAddNote(true)}>Add first note</Button>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Date & Time</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Order #</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Note</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Created By</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(notes as any[]).map((note: any) => (
                        <tr key={note.id} data-testid={`note-row-${note.id}`} className="border-b last:border-0 hover:bg-slate-50 align-top">
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt.dateTime(note.created_at)}</td>
                          <td className="px-4 py-3"><NoteTypePill type={note.note_type} /></td>
                          <td className="px-4 py-3 text-xs text-indigo-600 font-mono whitespace-nowrap">
                            {note.order_id ? `#${note.order_id}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 max-w-[320px]">
                            <p className="whitespace-pre-wrap break-words">{note.note}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap font-medium">
                            {createdBy(note.created_by_name, note.created_by)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {canEditNote && (isAdmin || note.created_by === currentUserId) && (
                                <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600" onClick={() => setEditingNote(note)} data-testid={`btn-edit-note-${note.id}`} title="Edit note">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDeleteNote && (
                                <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600" onClick={() => setDeletingNoteId(note.id)} data-testid={`btn-delete-note-${note.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── SECTION 3: To Dos ──────────────────────────────────────────── */}
              <div className="px-4 py-3 border-t border-b bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4 text-slate-400" />
                  To Dos {pendingTodos.length > 0 && <span className="text-xs font-normal text-slate-400">({pendingTodos.length} pending)</span>}
                </h2>
                {canManageTodos && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddTodo(true)}>
                    <Plus className="h-3.5 w-3.5" />New To Do
                  </Button>
                )}
              </div>
              {loadingTodos ? (
                <div className="flex items-center justify-center h-20 text-slate-400 text-sm">Loading…</div>
              ) : (todos as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 text-slate-400">
                  <p className="text-sm">No to dos</p>
                  {canManageTodos && <Button size="sm" variant="outline" className="mt-1.5 text-xs" onClick={() => setShowAddTodo(true)}>Create first to do</Button>}
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {(todos as any[])
                    .sort((a, b) => {
                      if (!!a.completed_at !== !!b.completed_at) return a.completed_at ? 1 : -1;
                      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                      if (a.due_date) return -1;
                      if (b.due_date) return 1;
                      return 0;
                    })
                    .map((todo: any) => {
                      const isDone = !!todo.completed_at;
                      const isOverdue = todo.is_overdue && !isDone;
                      const PRIORITY_COLORS: Record<string, string> = { high: "bg-red-100 text-red-700 border-red-200", medium: "bg-amber-100 text-amber-700 border-amber-200", low: "bg-slate-100 text-slate-500 border-slate-200" };
                      return (
                        <div key={todo.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isDone ? "bg-slate-50 opacity-60" : "bg-white"}`}>
                          <button
                            onClick={() => updateTodoMutation.mutate({ todoId: todo.id, data: { completed: !isDone } })}
                            className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isDone ? "bg-green-500 border-green-500 text-white" : "border-slate-300 hover:border-blue-500"}`}
                          >
                            {isDone && <span className="text-white text-[10px] font-bold">✓</span>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>{todo.title}</span>
                              {todo.priority && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border capitalize ${PRIORITY_COLORS[todo.priority] ?? PRIORITY_COLORS.medium}`}>{todo.priority}</span>}
                            </div>
                            {todo.note && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{todo.note}</p>}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
                              {todo.due_date && <span className={`flex items-center gap-1 ${isOverdue ? "text-red-500 font-medium" : ""}`}><Calendar className="h-3 w-3" />Due {fmt.date(todo.due_date)}{isOverdue && " (overdue)"}</span>}
                              {todo.assigned_to_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{todo.assigned_to_name}</span>}
                              {todo.completed_at && <span><Clock className="h-3 w-3 inline mr-0.5" />Done {fmt.relative(todo.completed_at)}</span>}
                            </div>
                          </div>
                          {canManageTodos && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => setEditingTodo(todo)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setDeletingTodoId(todo.id)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── TIMELINE TAB ──────────────────────────────────────────────── */}
          {activeTab === "timeline" && (
            <div>
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />Activity Timeline
                </h2>
              </div>
              {loadingTimeline ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
              ) : (timeline as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-sm">No activity recorded.</div>
              ) : (
                <div className="p-5 space-y-0">
                  {(timeline as any[]).map((entry: any, i: number) => {
                    const isLast = i === (timeline as any[]).length - 1;
                    const actor = entry.type === "note"
                      ? createdBy(entry.created_by_name, entry.created_by)
                      : entry.type === "audit"
                      ? createdBy(entry.user_name, entry.user_id)
                      : "System";
                    return (
                      <div key={entry.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${TimelineIconBg(entry.type, entry.action)}`}>
                            <TimelineIconEl type={entry.type} action={entry.action} />
                          </div>
                          {!isLast && <div className="w-px flex-1 bg-slate-200 my-1 min-h-[12px]" />}
                        </div>
                        <div className={`pb-5 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
                          <TimelineDescription entry={entry} />
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <span className="font-medium text-slate-500">{actor}</span>
                            {" · "}{fmt.relative(entry.date)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      <NoteModal
        open={showAddNote} title="Add Action"
        onClose={() => setShowAddNote(false)}
        onSave={data => createNoteMutation.mutate(data)}
        onSaveTodo={data => createTodoMutation.mutate(data)}
        saving={createNoteMutation.isPending || createTodoMutation.isPending}
        orders={orders as any[]}
        users={crmUsers as { id: number; name: string }[]}
        currentUserId={currentUserId}
      />
      {editingNote && (
        <NoteModal
          open={!!editingNote} title="Edit Note"
          initial={{ note: editingNote.note, note_type: editingNote.note_type, order_id: editingNote.order_id }}
          onClose={() => setEditingNote(null)}
          onSave={data => updateNoteMutation.mutate({ noteId: editingNote.id, data })}
          saving={updateNoteMutation.isPending}
          orders={orders as any[]}
        />
      )}
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
      <Dialog open={showAssignRep} onOpenChange={v => { if (!v) setShowAssignRep(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{repAssignMode === "primary" ? "Assign Primary Rep" : "Assign Secondary Rep"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Select Rep</Label>
            <Select value={selectedRep} onValueChange={setSelectedRep}>
              <SelectTrigger data-testid="select-assign-rep"><SelectValue placeholder="Choose a rep…" /></SelectTrigger>
              <SelectContent>
                {(crmUsers as { id: number; name: string }[])
                  .filter(u => {
                    if (repAssignMode === "primary" && customer?.secondary_rep_id) return String(u.id) !== String(customer.secondary_rep_id);
                    if (repAssignMode === "secondary" && customer?.primary_rep_id) return String(u.id) !== String(customer.primary_rep_id);
                    return true;
                  })
                  .map(u => (
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

      {orderModal && (
        <OrderNotesModal
          order={orderModal}
          customerId={id}
          onClose={() => setOrderModal(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "orders"] });
            queryClient.invalidateQueries({ queryKey: ["crm", "customer", id, "timeline"] });
          }}
        />
      )}

      {/* ── Add To Do Modal ──────────────────────────────────────────────────── */}
      <Dialog open={showAddTodo} onOpenChange={v => { if (!v) { setShowAddTodo(false); setTodoTitle(""); setTodoNote(""); setTodoPriority("medium"); setTodoDueDate(""); setTodoAssignedTo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New To Do</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1.5 block">Title *</Label>
              <Input value={todoTitle} onChange={e => setTodoTitle(e.target.value)} placeholder="What needs to be done?" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Description</Label>
              <Textarea value={todoNote} onChange={e => setTodoNote(e.target.value)} placeholder="Optional details…" rows={2} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs mb-1.5 block">Priority</Label>
                <Select value={todoPriority} onValueChange={setTodoPriority}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs mb-1.5 block">Due Date</Label>
                <Input type="date" value={todoDueDate} onChange={e => setTodoDueDate(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddTodo(false); setTodoTitle(""); setTodoNote(""); setTodoPriority("medium"); setTodoDueDate(""); }}>Cancel</Button>
            <Button
              onClick={() => createTodoMutation.mutate({ title: todoTitle, note: todoNote, priority: todoPriority, due_date: todoDueDate || null })}
              disabled={!todoTitle.trim() || createTodoMutation.isPending}
            >
              {createTodoMutation.isPending ? "Saving…" : "Create To Do"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit To Do Modal ─────────────────────────────────────────────────── */}
      {editingTodo && (
        <Dialog open={!!editingTodo} onOpenChange={v => { if (!v) setEditingTodo(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit To Do</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1.5 block">Title *</Label>
                <Input value={editingTodo.title ?? ""} onChange={e => setEditingTodo((t: any) => ({ ...t, title: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Description</Label>
                <Textarea value={editingTodo.note ?? ""} onChange={e => setEditingTodo((t: any) => ({ ...t, note: e.target.value }))} rows={2} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs mb-1.5 block">Priority</Label>
                  <Select value={editingTodo.priority ?? "medium"} onValueChange={v => setEditingTodo((t: any) => ({ ...t, priority: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs mb-1.5 block">Due Date</Label>
                  <Input
                    type="date"
                    value={editingTodo.due_date ? new Date(editingTodo.due_date).toISOString().split("T")[0] : ""}
                    onChange={e => setEditingTodo((t: any) => ({ ...t, due_date: e.target.value || null }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTodo(null)}>Cancel</Button>
              <Button
                onClick={() => updateTodoMutation.mutate({ todoId: editingTodo.id, data: { title: editingTodo.title, note: editingTodo.note, priority: editingTodo.priority, due_date: editingTodo.due_date || null } })}
                disabled={!editingTodo.title?.trim() || updateTodoMutation.isPending}
              >
                {updateTodoMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete To Do Confirm ─────────────────────────────────────────────── */}
      <Dialog open={deletingTodoId !== null} onOpenChange={v => { if (!v) setDeletingTodoId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete To Do</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This to do will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTodoId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingTodoId && deleteTodoMutation.mutate(deletingTodoId)} disabled={deleteTodoMutation.isPending}>
              {deleteTodoMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-xs text-slate-500">{label}</span></div>
      <p className="text-lg font-bold text-slate-900" data-testid={testId}>{value}</p>
    </div>
  );
}

function StoreCreditCard({ value, updatedAt, onRefresh, isRefreshing }: {
  value: string;
  updatedAt: string | Date | null | undefined;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const fmt = useTimeService();
  return (
    <div className="rounded-xl border px-3 py-2.5 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-4 w-4 text-teal-500" />
          <span className="text-xs text-slate-500">Store Credit</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          data-testid="btn-refresh-store-credit"
          className="text-slate-400 hover:text-teal-600 transition-colors disabled:opacity-40"
          title="Refresh store credit from BigCommerce"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="text-lg font-bold text-slate-900" data-testid="text-store-credit">{value}</p>
      {updatedAt && (
        <p className="text-[10px] text-slate-400 mt-0.5">Updated {fmt.relative(updatedAt)}</p>
      )}
    </div>
  );
}
