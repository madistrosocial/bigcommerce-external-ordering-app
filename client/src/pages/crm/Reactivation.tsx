import { useEffect, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, ChevronLeft, ChevronRight,
  DollarSign, FileText, GripVertical, Kanban, List, Loader2, Mail, Pencil, Phone,
  Plus, Search, User, X,
} from "lucide-react";
import { useTimeService } from "@/hooks/useTimeService";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 50;
type SortField = "last_order_date" | "company" | "first_name" | "lifetime_orders" | "lifetime_revenue" | "next_action_date";
type ViewMode = "board" | "table";
type Stage = { id: number; name: string; color: string; position: number; is_active: boolean; is_default: boolean };
type Customer = any;

const HEALTH_COLORS: Record<string, string> = {
  "At Risk": "bg-orange-100 text-orange-700 border-orange-200",
  "Lost": "bg-red-100 text-red-700 border-red-200",
  "Watch": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Healthy": "bg-green-100 text-green-700 border-green-200",
};
const PLEDGE_LABELS: Record<string, string> = {
  not_started: "No pledge",
  discussing: "Discussing",
  promised: "Pledge made",
  ordered: "Order placed",
  declined: "Declined",
};

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}
function fmtCurrency(value: string | number | null): string {
  if (value == null || value === "") return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}
function inputDate(value: string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}
function displayDate(value: string | null | undefined, fmt: ReturnType<typeof useTimeService>): string {
  return value ? fmt.date(value) : "No date";
}
function customerName(customer: Customer): string {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email || "Unnamed customer";
}

function HealthBadge({ health }: { health: string | null }) {
  if (!health) return <span className="text-slate-400">—</span>;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${HEALTH_COLORS[health] ?? "bg-slate-100 text-slate-600"}`}>{health}</span>;
}

function CaseEditorDialog({
  customer, stages, users, open, canEdit, onClose, onSaved,
}: {
  customer: Customer | null; stages: Stage[]; users: { id: number; name: string }[]; open: boolean;
  canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    stage_id: "", owner_user_id: "", pledge_status: "not_started", pledge_notes: "",
    expected_order_date: "", expected_value: "", next_action_date: "", next_action_note: "",
  });
  useEffect(() => {
    if (!customer) return;
    setForm({
      stage_id: String(customer.reactivation_stage_id ?? stages.find(s => s.is_default)?.id ?? stages[0]?.id ?? ""),
      owner_user_id: customer.reactivation_owner_id ? String(customer.reactivation_owner_id) : "",
      pledge_status: customer.pledge_status ?? "not_started",
      pledge_notes: customer.pledge_notes ?? "",
      expected_order_date: inputDate(customer.expected_order_date),
      expected_value: customer.expected_value ?? "",
      next_action_date: inputDate(customer.next_action_date),
      next_action_note: customer.next_action_note ?? "",
    });
  }, [customer, stages]);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/crm/reactivation/${customer.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: Number(form.stage_id),
          owner_user_id: form.owner_user_id || null,
          pledge_status: form.pledge_status,
          pledge_notes: form.pledge_notes || null,
          expected_order_date: form.expected_order_date || null,
          expected_value: form.expected_value || null,
          next_action_date: form.next_action_date || null,
          next_action_note: form.next_action_note || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save reactivation case");
      return body;
    },
    onSuccess: () => {
      toast({ title: "Reactivation case saved" });
      onSaved();
    },
    onError: (error: any) => toast({ title: "Save failed", description: error.message, variant: "destructive" }),
  });

  if (!customer) return null;
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center"><User className="h-4 w-4" /></div>
            Reactivation plan for {customer.company || customerName(customer)}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-1">
          <div className="space-y-1.5">
            <Label>Pipeline stage</Label>
            <Select value={form.stage_id} onValueChange={value => setForm(prev => ({ ...prev, stage_id: value }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
              <SelectContent>{stages.map(stage => <SelectItem key={stage.id} value={String(stage.id)}>{stage.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reactivation owner</Label>
            <Select value={form.owner_user_id || "__unassigned__"} onValueChange={value => setForm(prev => ({ ...prev, owner_user_id: value === "__unassigned__" ? "" : value }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {users.map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pledge status</Label>
            <Select value={form.pledge_status} onValueChange={value => setForm(prev => ({ ...prev, pledge_status: value }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PLEDGE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Expected order value</Label>
            <div className="relative"><DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-8" type="number" min="0" step="0.01" value={form.expected_value} onChange={e => setForm(prev => ({ ...prev, expected_value: e.target.value }))} disabled={!canEdit} placeholder="0.00" /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Expected order date</Label>
            <Input type="date" value={form.expected_order_date} onChange={e => setForm(prev => ({ ...prev, expected_order_date: e.target.value }))} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Next action date</Label>
            <Input type="date" value={form.next_action_date} onChange={e => setForm(prev => ({ ...prev, next_action_date: e.target.value }))} disabled={!canEdit} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Pledge / buying commitment notes</Label>
            <Textarea value={form.pledge_notes} onChange={e => setForm(prev => ({ ...prev, pledge_notes: e.target.value }))} disabled={!canEdit} placeholder="What did the customer agree to or ask for?" rows={3} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Next action</Label>
            <Textarea value={form.next_action_note} onChange={e => setForm(prev => ({ ...prev, next_action_note: e.target.value }))} disabled={!canEdit} placeholder="Call, visit, quote, or other follow-up…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {canEdit && <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.stage_id}>{mutation.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : "Save plan"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerCard({ customer, stages, canEdit, onEdit, onOpen, onMoveStart }: { customer: Customer; stages: Stage[]; canEdit: boolean; onEdit: () => void; onOpen: () => void; onMoveStart: () => void }) {
  const fmt = useTimeService();
  const days = daysSince(customer.last_order_date);
  const overdue = customer.next_action_date && new Date(customer.next_action_date).getTime() < Date.now();
  const stageChange = async (value: string) => {
    const response = await fetch(`/api/crm/reactivation/${customer.id}`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ stage_id: Number(value) }),
    });
    if (!response.ok) throw new Error((await response.json()).error || "Unable to move customer");
    onMoveStart();
  };
  return (
    <div draggable={canEdit} onDragStart={e => { e.dataTransfer.setData("text/customer-id", String(customer.id)); e.dataTransfer.setData("text/stage-id", String(customer.reactivation_stage_id)); }} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
      <div className="flex items-start gap-2">
        {canEdit && <GripVertical className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" aria-label="Drag to move" />}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <p className="font-semibold text-sm text-slate-800 truncate">{customer.company || customerName(customer)}</p>
          {customer.company && <p className="text-xs text-slate-500 truncate">{customerName(customer)}</p>}
        </button>
        <button type="button" className="h-7 w-7 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center" onClick={onEdit} aria-label="Edit reactivation plan"><Pencil className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-2"><HealthBadge health={customer.account_health} /><Badge variant="secondary" className="text-[10px]">{PLEDGE_LABELS[customer.pledge_status] ?? "No pledge"}</Badge></div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-3 text-[11px] text-slate-500">
        <span>{days == null ? "No order date" : `${days}d since order`}</span><span className="text-right font-medium text-slate-700">{fmtCurrency(customer.expected_value || customer.lifetime_revenue)}</span>
        <span className="truncate">{customer.reactivation_owner_name || customer.sales_rep_name || "Unassigned"}</span>
        <span className={`text-right truncate ${overdue ? "text-red-600 font-semibold" : ""}`}>{customer.next_action_date ? `${overdue ? "Overdue · " : ""}${fmt.date(customer.next_action_date)}` : "No next action"}</span>
      </div>
      {canEdit && (
        <div className="mt-3 pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
          <Select value={String(customer.reactivation_stage_id)} onValueChange={value => { void stageChange(value).catch(error => onMoveStart()); }}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{stages.map(stage => <SelectItem key={stage.id} value={String(stage.id)}>{stage.name}</SelectItem>)}</SelectContent></Select>
        </div>
      )}
    </div>
  );
}

export default function CRMReactivation() {
  const [, setLocation] = useLocation();
  const fmt = useTimeService();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUser = useStore(s => s.currentUser);
  const { hasPermission } = usePermissions();
  const canEdit = currentUser?.role === "admin" || hasPermission("crm", "manage_reactivation");

  const [view, setView] = useState<ViewMode>("board");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [group, setGroup] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [health, setHealth] = useState("");
  const [rep, setRep] = useState("");
  const [source, setSource] = useState("at_risk");
  const [overdue, setOverdue] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("last_order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const debounce = useCallback((value: string) => {
    setSearch(value);
    clearTimeout((window as any).__reactTimer);
    (window as any).__reactTimer = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 350);
  }, []);
  const setFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  const toggleSort = (field: SortField) => { if (sortBy === field) setSortDir(dir => dir === "asc" ? "desc" : "asc"); else { setSortBy(field); setSortDir("asc"); } setPage(1); };

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ["crm", "reactivation", "stages"],
    queryFn: async () => { const response = await fetch("/api/crm/reactivation/stages", { headers: getAuthHeaders() }); if (!response.ok) throw new Error("Failed to load stages"); return response.json(); },
    staleTime: 60_000,
  });
  const { data: filterOpts } = useQuery({
    queryKey: ["crm", "filters"],
    queryFn: async () => { const response = await fetch("/api/crm/filters", { headers: getAuthHeaders() }); if (!response.ok) throw new Error("Failed to load filters"); return response.json() as Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }>; },
    staleTime: 60_000,
  });
  const { data: users = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["crm", "users"], queryFn: async () => { const response = await fetch("/api/crm/users", { headers: getAuthHeaders() }); if (!response.ok) throw new Error("Failed to load users"); return response.json(); }, staleTime: 120_000,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["crm", "reactivation", view, debouncedSearch, group, stateFilter, health, rep, source, overdue, sortBy, sortDir, page],
    queryFn: async () => {
      const limit = view === "board" ? 200 : PAGE_SIZE;
      const params = new URLSearchParams({ search: debouncedSearch, source, sortBy, sortDir, limit: String(limit), offset: String(view === "board" ? 0 : (page - 1) * PAGE_SIZE) });
      if (group) params.set("group", group); if (stateFilter) params.set("state", stateFilter); if (health) params.set("health", health); if (rep) params.set("rep", rep); if (overdue) params.set("overdue", "true");
      const response = await fetch(`/api/crm/reactivation?${params}`, { headers: getAuthHeaders() }); if (!response.ok) throw new Error("Failed to load reactivation pipeline"); return response.json() as Promise<{ customers: Customer[]; total: number; summary: { stage_id: number; count: number; expected_value: string; overdue: number }[] }>;
    },
  });
  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters = [group, stateFilter, health, rep, source !== "at_risk" ? source : "", overdue ? "overdue" : ""].filter(Boolean).length;

  const invalidatePipeline = () => { queryClient.invalidateQueries({ queryKey: ["crm", "reactivation"] }); queryClient.invalidateQueries({ queryKey: ["crm", "customer"] }); };
  const moveMutation = useMutation({
    mutationFn: async ({ customerId, stageId }: { customerId: number; stageId: number }) => {
      const response = await fetch(`/api/crm/reactivation/${customerId}`, { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ stage_id: stageId }) });
      if (!response.ok) throw new Error((await response.json()).error || "Unable to move customer");
      return response.json();
    },
    onSuccess: () => { setDraggingId(null); invalidatePipeline(); },
    onError: (error: any) => { setDraggingId(null); toast({ title: "Stage update failed", description: error.message, variant: "destructive" }); invalidatePipeline(); },
  });

  const handleDrop = (event: React.DragEvent, stageId: number) => {
    event.preventDefault();
    const customerId = Number(event.dataTransfer.getData("text/customer-id"));
    const oldStageId = Number(event.dataTransfer.getData("text/stage-id"));
    if (customerId && stageId !== oldStageId) { setDraggingId(customerId); moveMutation.mutate({ customerId, stageId }); }
  };
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ search: debouncedSearch, source, sortBy, sortDir, format: "csv", limit: "5000", offset: "0" });
      if (group) params.set("group", group); if (stateFilter) params.set("state", stateFilter); if (health) params.set("health", health); if (rep) params.set("rep", rep); if (overdue) params.set("overdue", "true");
      const response = await fetch(`/api/crm/reactivation?${params}`, { headers: getAuthHeaders() }); if (!response.ok) throw new Error("Export failed");
      const json = await response.json(); const rows = json.customers ?? [];
      const header = ["Company", "Customer", "Email", "Phone", "Health", "Stage", "Owner", "Pledge Status", "Expected Order Date", "Expected Value", "Next Action Date", "Next Action", "Last Order Date", "Lifetime Orders", "Lifetime Revenue"];
      const csvRows = rows.map((c: Customer) => [
        c.company ?? "", customerName(c), c.email ?? "", c.phone ?? "", c.account_health ?? "", c.reactivation_stage_name ?? "", c.reactivation_owner_name ?? c.sales_rep_name ?? "", PLEDGE_LABELS[c.pledge_status] ?? c.pledge_status ?? "", c.expected_order_date ? fmt.date(c.expected_order_date) : "", c.expected_value ?? "", c.next_action_date ? fmt.date(c.next_action_date) : "", c.next_action_note ?? "", c.last_order_date ? fmt.date(c.last_order_date) : "", c.lifetime_orders ?? 0, c.lifetime_revenue ?? "0",
      ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(","));
      const blob = new Blob([[header.join(","), ...csvRows].join("\n")], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `reactivation-${new Date().toISOString().split("T")[0]}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error: any) { toast({ title: "Export failed", description: error.message, variant: "destructive" }); } finally { setExporting(false); }
  };

  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setGroup(""); setStateFilter(""); setHealth(""); setRep(""); setSource("at_risk"); setOverdue(false); setPage(1); };
  const thClass = "px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap";
  const sortTh = (field: SortField, label: string) => <th className={`${thClass} cursor-pointer hover:text-slate-700 select-none`} onClick={() => toggleSort(field)}><span className="flex items-center gap-0.5">{label}{sortBy === field ? sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-500 ml-1" /> : <ArrowDown className="h-3 w-3 text-blue-500 ml-1" /> : <ArrowUpDown className="h-3 w-3 text-slate-400 ml-1" />}</span></th>;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="border-b bg-white px-4 py-3 shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div><h1 className="text-lg font-bold text-slate-800 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Reactivation Pledge CRM</h1><p className="text-xs text-slate-500 mt-1">Turn at-risk customers into planned follow-ups, pledges, and repeat orders.</p></div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border bg-slate-50 p-0.5"><Button size="sm" variant={view === "board" ? "default" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={() => { setView("board"); setPage(1); }}><Kanban className="h-3.5 w-3.5" /> Board</Button><Button size="sm" variant={view === "table" ? "default" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={() => setView("table")}><List className="h-3.5 w-3.5" /> Table</Button></div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleExport} disabled={exporting}><FileText className="h-3.5 w-3.5" />{exporting ? "Exporting…" : "Export CSV"}</Button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" /><Input data-testid="input-reactivation-search" value={search} onChange={e => debounce(e.target.value)} placeholder="Search company, name, email…" className="pl-8 h-8 text-sm w-56" /></div>
          <Select value={source} onValueChange={value => setFilter(setSource, value)}><SelectTrigger className="h-8 text-sm w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="at_risk">At Risk + Lost</SelectItem><SelectItem value="inactive">Inactive accounts</SelectItem><SelectItem value="all">All candidates</SelectItem></SelectContent></Select>
          <Select value={health || "__all__"} onValueChange={value => setFilter(setHealth, value === "__all__" ? "" : value)}><SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="Health" /></SelectTrigger><SelectContent><SelectItem value="__all__">Default health</SelectItem>{["Healthy", "Watch", "At Risk", "Lost"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={group || "__all__"} onValueChange={value => setFilter(setGroup, value === "__all__" ? "" : value)}><SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="All Groups" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Groups</SelectItem>{(filterOpts?.groups ?? []).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={stateFilter || "__all__"} onValueChange={value => setFilter(setStateFilter, value === "__all__" ? "" : value)}><SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="All States" /></SelectTrigger><SelectContent><SelectItem value="__all__">All States</SelectItem><SelectItem value="Unknown">Unknown / Intl</SelectItem>{(filterOpts?.states ?? []).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          {(filterOpts?.reps ?? []).length > 0 && <Select value={rep || "__all__"} onValueChange={value => setFilter(setRep, value === "__all__" ? "" : value)}><SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="All Reps" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Reps</SelectItem>{filterOpts!.reps.map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}</SelectContent></Select>}
          <Button size="sm" variant={overdue ? "secondary" : "outline"} className={`h-8 text-xs gap-1.5 ${overdue ? "border-red-300 text-red-700 bg-red-50" : ""}`} onClick={() => { setOverdue(value => !value); setPage(1); }}><CalendarClock className="h-3.5 w-3.5" /> Overdue</Button>
          {activeFilters > 0 && <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-500 gap-1" onClick={clearFilters}><X className="h-3 w-3" /> Clear ({activeFilters})</Button>}
        </div>
      </div>

      <div className="px-4 py-3 shrink-0">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div className="rounded-lg border bg-white px-3 py-2 min-w-[130px]"><p className="text-[10px] uppercase tracking-wide text-slate-400">Candidates</p><p className="text-xl font-bold text-slate-800">{total.toLocaleString()}</p></div>
          {stages.map(stage => { const summary = (data?.summary ?? []).find(item => item.stage_id === stage.id); return <div key={stage.id} className="rounded-lg border bg-white px-3 py-2 min-w-[150px]" style={{ borderTopColor: stage.color, borderTopWidth: 3 }}><p className="text-[10px] uppercase tracking-wide text-slate-500 truncate">{stage.name}</p><div className="flex items-end justify-between gap-2"><p className="text-xl font-bold text-slate-800">{summary?.count ?? 0}</p><p className="text-[11px] text-slate-500">{fmtCurrency(summary?.expected_value ?? 0)}</p></div></div>; })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? <div className="flex items-center justify-center h-40 text-slate-400 text-sm"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading pipeline…</div> : isError ? <div className="flex items-center justify-center h-40 text-red-500 text-sm">Unable to load the reactivation pipeline.</div> : view === "board" ? (
          <div className="h-full overflow-x-auto overflow-y-hidden px-4 pb-4"><div className="flex gap-3 h-full min-w-max">
            {stages.map(stage => {
              const stageCustomers = customers.filter(customer => customer.reactivation_stage_id === stage.id);
              return <section key={stage.id} className="w-[280px] sm:w-[310px] h-full flex flex-col rounded-lg bg-slate-100 border border-slate-200" onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, stage.id)}>
                <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0" style={{ borderTop: `3px solid ${stage.color}` }}><div className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} /><h2 className="font-semibold text-sm text-slate-700 truncate">{stage.name}</h2></div><Badge variant="secondary" className="text-[10px]">{stageCustomers.length}</Badge></div>
                <div className={`flex-1 overflow-y-auto p-2 space-y-2 ${draggingId ? "bg-blue-50/40" : ""}`}>{stageCustomers.map(customer => <CustomerCard key={customer.id} customer={customer} stages={stages} canEdit={canEdit} onEdit={() => setEditingCustomer(customer)} onOpen={() => setLocation(`/crm/customers/${customer.id}`)} onMoveStart={invalidatePipeline} />)}{stageCustomers.length === 0 && <div className="border border-dashed border-slate-300 rounded-lg p-5 text-center text-xs text-slate-400">Drop customers here</div>}</div>
              </section>;
            })}
          </div></div>
        ) : (
          <div className="h-full overflow-auto">
            {customers.length === 0 ? <div className="flex flex-col items-center justify-center h-48 text-slate-400"><AlertTriangle className="h-10 w-10 mb-3 opacity-30" /><p className="text-sm font-medium">No customers found</p><p className="text-xs mt-1">Try adjusting your filters.</p></div> : <table className="w-full text-sm border-collapse min-w-[1180px]"><thead className="sticky top-0 bg-slate-50 border-b z-10"><tr>{sortTh("company", "Company")}{sortTh("first_name", "Customer")}<th className={thClass}>Stage</th><th className={thClass}>Pledge</th><th className={thClass}>Next Action</th><th className={thClass}>Owner</th>{sortTh("last_order_date", "Last Order")}{sortTh("lifetime_orders", "Orders")}{sortTh("lifetime_revenue", "Revenue")}<th className={thClass}>Health</th><th className={thClass}> </th></tr></thead><tbody>{customers.map(customer => { const days = daysSince(customer.last_order_date); const overdueDate = customer.next_action_date && new Date(customer.next_action_date).getTime() < Date.now(); return <tr key={customer.id} className="border-b hover:bg-blue-50 transition-colors"><td className="px-3 py-2.5 font-medium text-slate-800 max-w-[160px] truncate">{customer.company || "—"}</td><td className="px-3 py-2.5 text-slate-700">{customerName(customer)}</td><td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: customer.reactivation_stage_color }} />{customer.reactivation_stage_name}</span></td><td className="px-3 py-2.5"><Badge variant="secondary" className="text-[10px]">{PLEDGE_LABELS[customer.pledge_status] ?? "No pledge"}</Badge></td><td className={`px-3 py-2.5 text-xs max-w-[180px] truncate ${overdueDate ? "text-red-600 font-semibold" : "text-slate-600"}`}>{customer.next_action_date ? `${overdueDate ? "Overdue · " : ""}${fmt.date(customer.next_action_date)}` : "—"}</td><td className="px-3 py-2.5 text-xs">{customer.reactivation_owner_name || customer.sales_rep_name || <span className="text-slate-400">Unassigned</span>}</td><td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{customer.last_order_date ? `${fmt.relative(customer.last_order_date)} · ${days ?? 0}d` : "—"}</td><td className="px-3 py-2.5 text-right text-slate-700">{(customer.lifetime_orders ?? 0).toLocaleString()}</td><td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtCurrency(customer.lifetime_revenue)}</td><td className="px-3 py-2.5"><HealthBadge health={customer.account_health} /></td><td className="px-3 py-2.5"><div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setLocation(`/crm/customers/${customer.id}`)}>Open</Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingCustomer(customer)} aria-label="Edit case"><Pencil className="h-3.5 w-3.5" /></Button></div></td></tr>; })}</tbody></table>}
          </div>
        )}
      </div>
      {view === "table" && totalPages > 1 && <div className="border-t bg-white px-4 py-2.5 flex items-center justify-between shrink-0"><p className="text-xs text-slate-500">Page {page} of {totalPages} · {total.toLocaleString()} total</p><div className="flex items-center gap-1"><Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page === totalPages}><ChevronRight className="h-4 w-4" /></Button></div></div>}
      <CaseEditorDialog customer={editingCustomer} stages={stages} users={users} open={!!editingCustomer} canEdit={canEdit} onClose={() => setEditingCustomer(null)} onSaved={() => { setEditingCustomer(null); invalidatePipeline(); }} />
    </div>
  );
}