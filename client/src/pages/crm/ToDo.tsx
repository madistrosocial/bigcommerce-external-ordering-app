import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTimeService } from "@/hooks/useTimeService";
import {
  CheckSquare, Plus, Clock, AlertTriangle, Calendar, User,
  Trash2, Pencil, Building2, ChevronDown, ChevronRight, X,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low:    "bg-slate-100 text-slate-600 border-slate-200",
};

function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border capitalize ${PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium}`}>
      {priority}
    </span>
  );
}

// ─── Customer Search ──────────────────────────────────────────────────────────

function CustomerSearchInput({ value, onChange }: { value: { id: number; label: string } | null; onChange: (v: { id: number; label: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["crm", "customers", "search", q],
    queryFn: async () => {
      if (!q.trim()) return { customers: [] };
      const r = await fetch(`/api/crm/customers?search=${encodeURIComponent(q)}&limit=10&status=both`, { headers: getAuthHeaders() });
      if (!r.ok) return { customers: [] };
      return r.json() as Promise<{ customers: any[] }>;
    },
    enabled: q.length >= 1,
    staleTime: 5_000,
  });

  const results = data?.customers ?? [];

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center gap-1.5 h-8 px-3 border rounded-md bg-slate-50 text-sm">
          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="flex-1 truncate text-slate-700">{value.label}</span>
          <button onClick={() => { onChange(null); setQ(""); }} className="text-slate-400 hover:text-red-500 ml-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search customer (optional)…"
            className="h-8 text-xs pr-8"
          />
          {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
          {open && results.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-44 overflow-y-auto">
              {results.map((c: any) => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    onChange({ id: c.id, label: c.company || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || `ID ${c.id}` });
                    setQ(""); setOpen(false);
                  }}
                >
                  <span className="font-medium text-slate-800">{c.company || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}</span>
                  {c.email && <span className="text-slate-400 text-xs ml-1.5">{c.email}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── To Do Form Modal ─────────────────────────────────────────────────────────

interface TodoFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
  initial?: any;
  users: { id: number; name: string }[];
  currentUserId: number;
  title: string;
}

function TodoForm({ open, onClose, onSave, saving, initial, users, currentUserId, title }: TodoFormProps) {
  const [todoTitle, setTodoTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(initial?.due_date ? new Date(initial.due_date).toISOString().split("T")[0] : "");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to_user_id ? String(initial.assigned_to_user_id) : String(currentUserId));
  const [customer, setCustomer] = useState<{ id: number; label: string } | null>(
    initial?.customer_id ? { id: initial.customer_id, label: initial.customer_company || initial.customer_first_name || `ID ${initial.customer_id}` } : null
  );

  const handleClose = () => {
    setTodoTitle(initial?.title ?? "");
    setNote(initial?.note ?? "");
    setPriority(initial?.priority ?? "medium");
    setDueDate(initial?.due_date ? new Date(initial.due_date).toISOString().split("T")[0] : "");
    setAssignedTo(initial?.assigned_to_user_id ? String(initial.assigned_to_user_id) : String(currentUserId));
    setCustomer(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">Title *</Label>
            <Input value={todoTitle} onChange={e => setTodoTitle(e.target.value)} placeholder="What needs to be done?" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Customer (optional)</Label>
            <CustomerSearchInput value={customer} onChange={setCustomer} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Description</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional details…" rows={2} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs mb-1.5 block">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
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
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={() => onSave({ title: todoTitle, note, priority, due_date: dueDate || null, assigned_to_user_id: parseInt(assignedTo) || null, customer_id: customer?.id ?? null })}
            disabled={!todoTitle.trim() || saving}
          >
            {saving ? "Saving…" : "Save To Do"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Todo Card ────────────────────────────────────────────────────────────────

function TodoCard({ todo, onToggle, onEdit, onDelete, fmt, canManage }: {
  todo: any; onToggle: () => void; onEdit: () => void; onDelete: () => void;
  fmt: ReturnType<typeof useTimeService>; canManage: boolean;
}) {
  const [, setLocation] = useLocation();
  const isCompleted = !!todo.completed_at;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isCompleted ? "bg-slate-50 opacity-60" : "bg-white hover:bg-slate-50"}`}>
      <button
        onClick={onToggle}
        className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
          isCompleted ? "bg-green-500 border-green-500 text-white" : "border-slate-300 hover:border-blue-500"
        }`}
        title={isCompleted ? "Mark pending" : "Mark complete"}
      >
        {isCompleted && <span className="text-white text-[10px] font-bold">✓</span>}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-sm font-medium ${isCompleted ? "line-through text-slate-400" : "text-slate-800"}`}>
            {todo.title}
          </span>
          <PriorityBadge priority={todo.priority} />
        </div>
        {todo.note && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{todo.note}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-400">
          {(todo.customer_company || todo.customer_first_name) && (
            <button
              className="flex items-center gap-1 hover:text-blue-600 transition-colors"
              onClick={() => todo.customer_id && setLocation(`/crm/customers/${todo.customer_id}`)}
            >
              <Building2 className="h-3 w-3" />
              {todo.customer_company || `${todo.customer_first_name ?? ""} ${todo.customer_last_name ?? ""}`.trim()}
            </button>
          )}
          {todo.due_date && (
            <span className={`flex items-center gap-1 ${todo.is_overdue && !isCompleted ? "text-red-500 font-medium" : ""}`}>
              <Calendar className="h-3 w-3" />
              Due {fmt.date(todo.due_date)}
              {todo.is_overdue && !isCompleted && " (overdue)"}
            </span>
          )}
          {todo.assigned_to_name && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />{todo.assigned_to_name}
            </span>
          )}
          {todo.completed_at && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Done {fmt.relative(todo.completed_at)}</span>}
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Group Section ────────────────────────────────────────────────────────────

function TodoGroup({ label, todos, emptyText, ...rest }: {
  label: string; todos: any[]; emptyText?: string;
  onToggle: (t: any) => void; onEdit: (t: any) => void; onDelete: (t: any) => void;
  fmt: ReturnType<typeof useTimeService>; canManage: boolean;
}) {
  const [collapsed, setCollapsed] = useState(label === "Completed");
  if (todos.length === 0) return null;
  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 mb-2 w-full text-left group"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
        <span className="text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{todos.length}</span>
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {todos.map(t => (
            <TodoCard
              key={t.id}
              todo={t}
              onToggle={() => rest.onToggle(t)}
              onEdit={() => rest.onEdit(t)}
              onDelete={() => rest.onDelete(t)}
              fmt={rest.fmt}
              canManage={rest.canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function CRMToDo() {
  const fmt = useTimeService();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const currentUser = useStore(s => s.currentUser);
  const currentUserId = currentUser?.id ?? 0;
  const isAdmin = currentUser?.role === "admin";
  const canViewAll = isAdmin || hasPermission("crm", "view_all_todos");
  const canManage = isAdmin || hasPermission("crm", "manage_todos") || hasPermission("crm", "add_note");

  const [allUsers, setAllUsers] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const qKey = ["crm", "todos", allUsers];

  const { data: todos = [], isLoading } = useQuery<any[]>({
    queryKey: qKey,
    queryFn: async () => {
      const params = new URLSearchParams({ status: "all" });
      if (allUsers) params.set("allUsers", "true");
      const r = await fetch(`/api/crm/todos?${params}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load todos");
      return r.json();
    },
    staleTime: 10_000,
  });

  const { data: users = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["crm", "users"],
    queryFn: async () => {
      const r = await fetch("/api/crm/users", { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load users");
      return r.json();
    },
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crm", "todos"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/crm/todos", {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to create");
      return r.json();
    },
    onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "To Do created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/crm/todos/${id}`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to update");
      return r.json();
    },
    onSuccess: () => { invalidate(); setEditingTodo(null); toast({ title: "To Do updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/crm/todos/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => { invalidate(); setDeletingId(null); toast({ title: "To Do deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleToggle = (todo: any) => {
    const completed = !todo.completed_at;
    updateMutation.mutate({ id: todo.id, data: { completed } });
  };

  // Group todos
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);

  const pending = todos.filter(t => !t.completed_at);
  const completed = todos.filter(t => !!t.completed_at);

  const overdue  = pending.filter(t => t.due_date && new Date(t.due_date) < today);
  const dueToday = pending.filter(t => t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) < tomorrow);
  const upcoming = pending.filter(t => !t.due_date || new Date(t.due_date) >= tomorrow);

  const groupProps = {
    onToggle: handleToggle,
    onEdit: setEditingTodo,
    onDelete: (t: any) => setDeletingId(t.id),
    fmt,
    canManage,
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="border-b bg-white px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-blue-500" />To Do
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {pending.length} pending · {completed.length} completed
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canViewAll && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <Checkbox
                  checked={allUsers}
                  onCheckedChange={v => setAllUsers(!!v)}
                />
                All users
              </label>
            )}
            {canManage && (
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setShowForm(true)}>
                <Plus className="h-3.5 w-3.5" />New To Do
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
        ) : todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <CheckSquare className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">No to dos yet</p>
            {canManage && <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={() => setShowForm(true)}>Create first To Do</Button>}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {overdue.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Overdue</span>
                  <span className="text-[11px] text-red-400 bg-red-50 px-1.5 py-0.5 rounded-full">{overdue.length}</span>
                </div>
                <div className="space-y-2">
                  {overdue.map(t => (
                    <TodoCard key={t.id} todo={t} onToggle={() => handleToggle(t)} onEdit={() => setEditingTodo(t)} onDelete={() => setDeletingId(t.id)} fmt={fmt} canManage={canManage} />
                  ))}
                </div>
              </div>
            )}

            <TodoGroup label="Today" todos={dueToday} {...groupProps} />
            <TodoGroup label="Upcoming" todos={upcoming} {...groupProps} />
            <TodoGroup label="Completed" todos={completed} {...groupProps} />
          </div>
        )}
      </div>

      {/* ── Create Form ───────────────────────────────────────────────────────── */}
      <TodoForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSave={(data) => createMutation.mutate(data)}
        saving={createMutation.isPending}
        users={users}
        currentUserId={currentUserId}
        title="New To Do"
      />

      {/* ── Edit Form ─────────────────────────────────────────────────────────── */}
      {editingTodo && (
        <TodoForm
          open={!!editingTodo}
          onClose={() => setEditingTodo(null)}
          onSave={(data) => updateMutation.mutate({ id: editingTodo.id, data })}
          saving={updateMutation.isPending}
          initial={editingTodo}
          users={users}
          currentUserId={currentUserId}
          title="Edit To Do"
        />
      )}

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <Dialog open={deletingId !== null} onOpenChange={v => { if (!v) setDeletingId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete To Do</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This will permanently delete the to do. Are you sure?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && deleteMutation.mutate(deletingId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
