import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Clock3,
  Download, FileClock, Filter, Loader2, MapPin, Settings2, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getAuthHeaders } from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";

function apiJson(path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) } }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Attendance request failed");
    return body;
  });
}

function hours(seconds: number | null | undefined) {
  const value = Math.max(0, Number(seconds ?? 0));
  return `${Math.floor(value / 3600)}h ${String(Math.floor((value % 3600) / 60)).padStart(2, "0")}m`;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    active: "border-0 bg-blue-100 text-blue-700",
    completed: "border-0 bg-emerald-100 text-emerald-700",
    open: "border-0 bg-red-100 text-red-700",
    resolved: "border-0 bg-slate-100 text-slate-600",
    captured: "border-0 bg-emerald-100 text-emerald-700",
  };
  return <Badge className={styles[status] ?? "border-0 bg-slate-100 text-slate-600"}>{status.replace(/_/g, " ")}</Badge>;
}

const tabs = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "logs", label: "Attendance Logs", icon: FileClock },
  { key: "exceptions", label: "Exceptions", icon: AlertTriangle },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings2 },
];

function AdminShell({ activeTab, children }: { activeTab: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-red-600" /><h1 className="text-xl font-bold text-slate-900">Attendance</h1></div>
            <p className="mt-1 text-xs text-slate-500">Employee time, validation, and location audit</p>
          </div>
        </div>
        <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return <Link key={tab.key} href={`/attendance/${tab.key}`} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition ${activeTab === tab.key ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}><Icon className="h-3.5 w-3.5" />{tab.label}</Link>;
          })}
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function PeriodButtons({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="flex flex-wrap gap-2">
    {[
      ["today", "Today"],
      ["week", "This Week"],
      ["pay_period", "Pay Period"],
      ["custom", "Custom"],
    ].map(([key, label]) => <Button key={key} size="sm" variant={value === key ? "default" : "outline"} className={`h-8 text-xs ${value === key ? "bg-red-600 hover:bg-red-700" : ""}`} onClick={() => onChange(key)}>{label}</Button>)}
  </div>;
}

function EmployeeRow({ row, onClick, fmt }: { row: any; onClick?: () => void; fmt: ReturnType<typeof useTimeService> }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-red-200 hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-600">{String(row.employee_name ?? "?").slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{row.employee_name ?? row.employee_username ?? "Employee"}</p><p className="text-xs text-slate-400">{row.work_date} · {row.start_method === "warehouse" ? "Warehouse" : "Driving"}</p></div></div>
        <div className="flex items-center gap-2">{statusBadge(row.status)}<ChevronRight className="h-4 w-4 text-slate-300" /></div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
        <div><span className="block text-slate-400">Time in</span><span className="font-medium text-slate-700">{row.time_in ? fmt.time(row.time_in) : "—"}</span></div>
        <div><span className="block text-slate-400">Time out</span><span className="font-medium text-slate-700">{row.time_out ? fmt.time(row.time_out) : "—"}</span></div>
        <div><span className="block text-slate-400">Total hours</span><span className="font-medium text-slate-700">{hours(row.total_seconds)}</span></div>
      </div>
    </button>
  );
}

function Overview() {
  const fmt = useTimeService();
  const [period, setPeriod] = useState("today");
  const query = useQuery({ queryKey: ["attendance", "overview", period], queryFn: () => apiJson(`/api/attendance/admin/overview?period=${period}`) });
  const data = query.data;
  const kpis = [
    ["Total Hours", hours(data?.kpis?.totalSeconds), Clock3, "text-blue-600"],
    ["Sales Reps", data?.kpis?.salesReps ?? "—", Users, "text-emerald-600"],
    ["Currently Working", data?.kpis?.currentlyWorking ?? "—", CheckCircle2, "text-green-600"],
    ["Not Logged In", data?.kpis?.notLoggedIn ?? "—", Users, "text-slate-500"],
    ["Exceptions", data?.kpis?.exceptions ?? "—", AlertTriangle, "text-red-600"],
  ] as const;
  return <AdminShell activeTab="overview">
    <div className="flex flex-wrap items-center justify-between gap-3"><PeriodButtons value={period} onChange={setPeriod} /><span className="text-xs text-slate-400">{data?.period?.from} → {data?.period?.to}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">{kpis.map(([label, value, Icon, color]) => <Card key={label} className="rounded-xl border-slate-200 shadow-sm"><CardContent className="p-4"><Icon className={`h-4 w-4 ${color}`} /><p className="mt-3 text-xl font-bold text-slate-800">{value}</p><p className="mt-1 text-[11px] text-slate-400">{label}</p></CardContent></Card>)}</div>
    <Card className="mt-5 rounded-xl border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm">Today's Attendance</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2">{query.isLoading ? <div className="p-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : data?.rows?.length ? data.rows.map((row: any) => <EmployeeRow key={row.id} row={row} fmt={fmt} onClick={() => window.location.href = `/attendance/logs?record=${row.id}`} />) : <p className="p-8 text-center text-sm text-slate-400">No attendance records for this period.</p>}</div></CardContent></Card>
  </AdminShell>;
}

function LogDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const fmt = useTimeService();
  const query = useQuery({ queryKey: ["attendance", "log", id], queryFn: () => apiJson(`/api/attendance/admin/logs/${id}`) });
  if (query.isLoading) return <Card className="rounded-xl border-slate-200"><CardContent className="p-6 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></CardContent></Card>;
  const data = query.data;
  if (!data) return null;
  const { attendance, employee, checkpoints = [] } = data;
  return <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-sm">{employee?.name ?? "Employee"} · {attendance.work_date}</CardTitle><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></CardHeader><CardContent className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Time In", attendance.time_in ? fmt.dateTime(attendance.time_in) : "—"], ["Time Out", attendance.time_out ? fmt.dateTime(attendance.time_out) : "—"], ["Total Hours", hours(attendance.total_seconds)], ["Validation", attendance.time_in_verification ?? "—"]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 text-xs font-semibold text-slate-700">{value}</p></div>)}</div>
    <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Location History</h3><div className="space-y-2">{checkpoints.length ? checkpoints.map((checkpoint: any) => <div key={checkpoint.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-xs"><div><p className="font-medium text-slate-700">{checkpoint.checkpoint_type.replace(/_/g, " ")}</p><p className="text-slate-400">{fmt.dateTime(checkpoint.captured_at)}</p></div><div className="text-right">{statusBadge(checkpoint.capture_status)}<p className="mt-1 text-slate-400">{checkpoint.latitude && checkpoint.longitude ? `${checkpoint.latitude}, ${checkpoint.longitude}` : "No location captured"}</p></div></div>) : <p className="text-sm text-slate-400">No checkpoints recorded.</p>}</div></div>
  </CardContent></Card>;
}

function Logs() {
  const fmt = useTimeService();
  const [status, setStatus] = useState("all");
  const [startMethod, setStartMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const params = new URLSearchParams({ status, startMethod });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = useQuery({ queryKey: ["attendance", "logs", status, startMethod, from, to], queryFn: () => apiJson(`/api/attendance/admin/logs?${params}`) });
  return <AdminShell activeTab="logs">
    <Card className="rounded-xl border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Filter className="h-4 w-4 text-red-600" />Filters</div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div><Label className="text-[11px] text-slate-500">From date</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 h-9 text-xs" /></div><div><Label className="text-[11px] text-slate-500">To date</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 h-9 text-xs" /></div><div><Label className="text-[11px] text-slate-500">Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="exception">Exception</SelectItem></SelectContent></Select></div><div><Label className="text-[11px] text-slate-500">Start method</Label><Select value={startMethod} onValueChange={setStartMethod}><SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All methods</SelectItem><SelectItem value="warehouse">Warehouse</SelectItem><SelectItem value="driving">Driving</SelectItem></SelectContent></Select></div><div className="flex items-end"><Button variant="outline" className="h-9 w-full text-xs" onClick={() => { setFrom(""); setTo(""); setStatus("all"); setStartMethod("all"); }}>Clear Filters</Button></div></div></CardContent></Card>
    {selectedId ? <div className="mt-4"><LogDetail id={selectedId} onClose={() => setSelectedId(null)} /></div> : <div className="mt-4 grid gap-2 md:grid-cols-2">{query.isLoading ? <div className="p-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : query.data?.rows?.length ? query.data.rows.map((row: any) => <EmployeeRow key={row.id} row={row} fmt={fmt} onClick={() => setSelectedId(row.id)} />) : <Card className="border-dashed border-slate-200 md:col-span-2"><CardContent className="p-10 text-center text-sm text-slate-400">No attendance logs match these filters.</CardContent></Card>}</div>}
  </AdminShell>;
}

function Exceptions() {
  const fmt = useTimeService();
  const client = useQueryClient();
  const [status, setStatus] = useState("open");
  const query = useQuery({ queryKey: ["attendance", "exceptions", status], queryFn: () => apiJson(`/api/attendance/admin/exceptions?status=${status}`) });
  const review = useMutation({ mutationFn: ({ id, notes }: { id: number; notes: string }) => apiJson(`/api/attendance/admin/exceptions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved", review_notes: notes }) }), onSuccess: () => client.invalidateQueries({ queryKey: ["attendance", "exceptions"] }) });
  return <AdminShell activeTab="exceptions">
    <div className="flex flex-wrap gap-2">{[["open", "Open"], ["resolved", "Resolved"], ["all", "All"]].map(([key, label]) => <Button key={key} size="sm" variant={status === key ? "default" : "outline"} className={`h-8 text-xs ${status === key ? "bg-red-600 hover:bg-red-700" : ""}`} onClick={() => setStatus(key)}>{label}</Button>)}</div>
    <div className="mt-4 space-y-2">{query.isLoading ? <div className="p-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : query.data?.rows?.length ? query.data.rows.map((row: any) => <Card key={row.id} className="rounded-xl border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2">{statusBadge(row.status)}<span className="text-xs text-slate-400">{row.work_date ?? fmt.date(row.detected_at)}</span></div><h3 className="mt-2 text-sm font-semibold text-slate-800">{row.exception_type}</h3><p className="mt-1 text-sm text-slate-500">{row.employee_name ?? "Employee"} · {row.details}</p></div>{row.status === "open" && <Button size="sm" className="bg-red-600 text-xs hover:bg-red-700" onClick={() => review.mutate({ id: row.id, notes: window.prompt("Review notes (optional):") ?? "" })} disabled={review.isPending}>Mark resolved</Button>}</div><p className="mt-3 text-xs text-slate-400">Detected {fmt.dateTime(row.detected_at)}{row.reviewed_at ? ` · Reviewed ${fmt.dateTime(row.reviewed_at)}` : ""}</p></CardContent></Card>) : <Card className="border-dashed border-slate-200"><CardContent className="p-10 text-center text-sm text-slate-400">No attendance exceptions.</CardContent></Card>}</div>
  </AdminShell>;
}

function Reports() {
  const [period, setPeriod] = useState("pay_period");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useQuery({ queryKey: ["attendance", "reports", period, from, to], queryFn: () => apiJson(`/api/attendance/admin/reports?period=${period}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`) });
  const exportCsv = () => {
    const rows = query.data?.rows ?? [];
    const csv = [["Employee", "Regular Hours", "Overtime Hours", "Total Hours", "Days"], ...rows.map((row: any) => [row.employee_name, hours(row.regular_seconds), hours(row.overtime_seconds), hours(row.total_seconds), row.days])].map((row: any[]) => row.map((value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `attendance-report-${query.data?.from ?? "period"}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  return <AdminShell activeTab="reports">
    <Card className="rounded-xl border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><Label className="text-[11px] text-slate-500">Report period</Label><div className="mt-2"><PeriodButtons value={period} onChange={setPeriod} /></div></div><Button variant="outline" size="sm" className="text-xs" onClick={exportCsv} disabled={!query.data?.rows?.length}><Download className="mr-2 h-3.5 w-3.5" />Export CSV</Button></div>{period === "custom" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label className="text-[11px] text-slate-500">From date</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 h-9 text-xs" /></div><div><Label className="text-[11px] text-slate-500">To date</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 h-9 text-xs" /></div></div>}</CardContent></Card>
    <Card className="mt-4 rounded-xl border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm">Employee totals <span className="font-normal text-slate-400">{query.data?.from} → {query.data?.to}</span></CardTitle></CardHeader><CardContent><div className="space-y-2">{query.isLoading ? <div className="p-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : query.data?.rows?.length ? query.data.rows.map((row: any) => <div key={row.user_id} className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-5 sm:items-center"><div className="font-medium text-slate-700 sm:col-span-2">{row.employee_name}</div><div><span className="text-[11px] text-slate-400">Regular</span><p className="text-sm font-semibold">{hours(row.regular_seconds)}</p></div><div><span className="text-[11px] text-slate-400">Overtime</span><p className="text-sm font-semibold">{hours(row.overtime_seconds)}</p></div><div><span className="text-[11px] text-slate-400">Total</span><p className="text-sm font-semibold">{hours(row.total_seconds)} · {row.days} days</p></div></div>) : <p className="p-8 text-center text-sm text-slate-400">No report data for this period.</p>}</div></CardContent></Card>
  </AdminShell>;
}

function SettingsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["attendance", "settings"], queryFn: () => apiJson("/api/attendance/settings") });
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);
  const save = useMutation({ mutationFn: () => apiJson("/api/attendance/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }), onSuccess: data => { setForm(data); client.invalidateQueries({ queryKey: ["attendance", "settings"] }); } });
  if (!form) return <AdminShell activeTab="settings"><Card><CardContent className="p-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></CardContent></Card></AdminShell>;
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  return <AdminShell activeTab="settings">
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-sm">Warehouse Location</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label className="text-xs">Warehouse name</Label><Input value={form.warehouseName} onChange={e => set("warehouseName", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Latitude</Label><Input type="number" step="any" value={form.warehouseLatitude ?? ""} onChange={e => set("warehouseLatitude", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Longitude</Label><Input type="number" step="any" value={form.warehouseLongitude ?? ""} onChange={e => set("warehouseLongitude", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Allowed radius (meters)</Label><Input type="number" value={form.allowedRadiusMeters} onChange={e => set("allowedRadiusMeters", e.target.value)} className="mt-1" /></div><div className="flex items-end pb-2 text-xs text-slate-500"><MapPin className="mr-2 h-4 w-4 text-red-600" />Used for Warehouse validation</div></CardContent></Card>
      <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-sm">Attendance Rules</CardTitle></CardHeader><CardContent className="space-y-4">{[["warehouseVerificationEnabled", "Warehouse verification"], ["drivingStartEnabled", "Driving start (provider capability required)"], ["hourlyCheckpointEnabled", "Hourly location checkpoint"], ["firstFourHourValidationEnabled", "First four hour validation"], ["locationAccuracyRequired", "Require location accuracy"]].map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-slate-700">{label}</p><p className="text-xs text-slate-400">Configure whether this rule is active.</p></div><Switch checked={Boolean(form[key])} onCheckedChange={value => set(key, value)} /></div>)}<div className="grid gap-3 sm:grid-cols-2"><div><Label className="text-xs">Checkpoint interval (minutes)</Label><Input type="number" value={form.checkpointIntervalMinutes} onChange={e => set("checkpointIntervalMinutes", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Warehouse threshold (minutes)</Label><Input type="number" value={form.warehousePresenceThresholdMinutes} onChange={e => set("warehousePresenceThresholdMinutes", e.target.value)} className="mt-1" /></div></div></CardContent></Card>
      <Card className="rounded-xl border-slate-200 shadow-sm lg:col-span-2"><CardHeader><CardTitle className="text-sm">Pay Period Configuration</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div><Label className="text-xs">Period length (days)</Label><Input type="number" value={form.payPeriodLengthDays} onChange={e => set("payPeriodLengthDays", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Period anchor date</Label><Input type="date" value={form.payPeriodAnchorDate} onChange={e => set("payPeriodAnchorDate", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Payday</Label><Select value={String(form.paydayWeekday)} onValueChange={value => set("paydayWeekday", Number(value))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>
    </div>
    <div className="mt-4 flex justify-end"><Button className="bg-red-600 hover:bg-red-700" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button></div>
  </AdminShell>;
}

export default function AttendanceAdminPage() {
  const [location] = useLocation();
  const tab = location.split("/")[2] || "overview";
  if (tab === "logs") return <Logs />;
  if (tab === "exceptions") return <Exceptions />;
  if (tab === "reports") return <Reports />;
  if (tab === "settings") return <SettingsPage />;
  return <Overview />;
}