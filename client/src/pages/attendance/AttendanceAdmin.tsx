import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Download, FileClock, Filter, Loader2, MapPin, Settings2, Users, X,
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

const EXPECTED_DAILY_SECONDS = 8 * 60 * 60;

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromOnly(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: string, amount: number) {
  const date = dateFromOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateOnly(date);
}

function currentMonthKey() {
  const today = new Date();
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return { from: dateOnly(start), to: dateOnly(end) };
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number) {
  const date = new Date(Date.UTC(year, month, 1));
  date.setUTCDate(1 + ((weekday - date.getUTCDay() + 7) % 7) + (occurrence - 1) * 7);
  return dateOnly(date);
}

function lastWeekday(year: number, month: number, weekday: number) {
  const date = new Date(Date.UTC(year, month + 1, 0));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - weekday + 7) % 7));
  return dateOnly(date);
}

function observedHoliday(date: string, name: string) {
  const day = dateFromOnly(date).getUTCDay();
  if (day === 6) return { date: addDays(date, -1), name: `${name} (observed)` };
  if (day === 0) return { date: addDays(date, 1), name: `${name} (observed)` };
  return { date, name };
}

function usHolidaysForYear(year: number) {
  const fixed = [
    [`${year}-01-01`, "New Year's Day"],
    [`${year}-06-19`, "Juneteenth"],
    [`${year}-07-04`, "Independence Day"],
    [`${year}-11-11`, "Veterans Day"],
    [`${year}-12-25`, "Christmas Day"],
  ];
  const holidays = [
    ...fixed,
    [nthWeekday(year, 0, 1, 3), "Martin Luther King Jr. Day"],
    [nthWeekday(year, 1, 1, 3), "Presidents' Day"],
    [lastWeekday(year, 4, 1), "Memorial Day"],
    [nthWeekday(year, 8, 1, 1), "Labor Day"],
    [nthWeekday(year, 9, 1, 2), "Columbus Day"],
    [nthWeekday(year, 10, 4, 4), "Thanksgiving Day"],
  ];
  return holidays.flatMap(([date, name]) => {
    const actual = { date: String(date), name: String(name) };
    const observed = observedHoliday(actual.date, actual.name);
    return observed.date === actual.date ? [actual] : [actual, observed];
  });
}

function getUsHolidayMap(from: string, to: string) {
  const map = new Map<string, string>();
  for (let year = dateFromOnly(from).getUTCFullYear(); year <= dateFromOnly(to).getUTCFullYear(); year += 1) {
    for (const holiday of usHolidaysForYear(year)) map.set(holiday.date, holiday.name);
  }
  return map;
}

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function shortDate(value: string) {
  return dateFromOnly(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function weekday(value: string) {
  return dateFromOnly(value).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function dayKind(date: string, holidayMap: Map<string, string>) {
  const day = dateFromOnly(date).getUTCDay();
  if (holidayMap.has(date)) return "holiday";
  if (day === 0 || day === 6) return "weekend";
  return "weekday";
}

function ledgerStatus(
  date: string,
  holidayMap: Map<string, string>,
  record: any | undefined,
  selectedUserId: string,
) {
  const kind = dayKind(date, holidayMap);
  if (kind === "holiday") return "holiday";
  if (kind === "weekend") return "weekend";
  if (!selectedUserId && record?.loggedCount > 0) return "team";
  return record ? (record.status === "active" ? "active" : "worked") : "absent";
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
  const [status, setStatus] = useState("all");
  const [startMethod, setStartMethod] = useState("all");
  const [month, setMonth] = useState(currentMonthKey);
  const initialMonthRange = useMemo(() => monthRange(currentMonthKey()), []);
  const [from, setFrom] = useState(initialMonthRange.from);
  const [to, setTo] = useState(initialMonthRange.to);
  const [userId, setUserId] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    const range = monthRange(month);
    setFrom(range.from);
    setTo(range.to);
  }, [month]);
  const usersQuery = useQuery({ queryKey: ["attendance", "team-members"], queryFn: () => apiJson("/api/users") });
  const params = new URLSearchParams({ status, startMethod, limit: "500" });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (userId !== "all") params.set("userId", userId);
  const query = useQuery({ queryKey: ["attendance", "logs", status, startMethod, from, to, userId], queryFn: () => apiJson(`/api/attendance/admin/logs?${params}`), enabled: Boolean(from && to && from <= to) });
  const teamMembers = (usersQuery.data ?? []).filter((user: any) => user.is_enabled);
  const selectedMember = teamMembers.find((user: any) => String(user.id) === userId);
  const dates = useMemo(() => from && to && from <= to ? datesBetween(from, to) : [], [from, to]);
  const holidayMap = useMemo(() => from && to && from <= to ? getUsHolidayMap(from, to) : new Map<string, string>(), [from, to]);
  const rows = query.data?.rows ?? [];
  const recordsByDate = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of rows) {
      const current = map.get(row.work_date) ?? { date: row.work_date, records: [], totalSeconds: 0, loggedCount: 0 };
      current.records.push(row);
      current.totalSeconds += Number(row.total_seconds ?? 0);
      current.loggedCount += 1;
      map.set(row.work_date, current);
    }
    return map;
  }, [rows]);
  const expectedTeamMembers = selectedMember ? 1 : teamMembers.length;
  const businessDates = dates.filter(date => dayKind(date, holidayMap) === "weekday");
  const workedRows = rows.filter((row: any) => dayKind(row.work_date, holidayMap) === "weekday");
  const totalSeconds = workedRows.reduce((sum: number, row: any) => sum + Number(row.total_seconds ?? 0), 0);
  const expectedSeconds = businessDates.length * expectedTeamMembers * EXPECTED_DAILY_SECONDS;
  const daysWorked = new Set(workedRows.map((row: any) => `${row.user_id}:${row.work_date}`)).size;
  const absentDays = Math.max(0, businessDates.length * expectedTeamMembers - daysWorked);
  const lostSeconds = Math.max(0, expectedSeconds - totalSeconds);
  const clearFilters = () => {
    const currentMonth = currentMonthKey();
    const range = monthRange(currentMonth);
    setMonth(currentMonth);
    setFrom(range.from);
    setTo(range.to);
    setUserId("all");
    setStatus("all");
    setStartMethod("all");
  };
  const monthDefaultRange = monthRange(month);
  const hasFilter = userId !== "all"
    || status !== "all"
    || startMethod !== "all"
    || from !== monthDefaultRange.from
    || to !== monthDefaultRange.to;
  const statusLabel: Record<string, string> = { worked: "Worked", active: "Working", absent: "Absent", weekend: "Weekend", holiday: "US holiday", team: "Team logged" };
  const statusClass: Record<string, string> = {
    worked: "border-emerald-200 bg-emerald-50 text-emerald-700",
    active: "border-blue-200 bg-blue-50 text-blue-700",
    absent: "border-red-200 bg-red-50 text-red-700",
    weekend: "border-slate-200 bg-slate-100 text-slate-500",
    holiday: "border-amber-200 bg-amber-50 text-amber-700",
    team: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };
  return <AdminShell activeTab="logs">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">Attendance ledger</h2>
        <p className="mt-1 text-xs text-slate-500">A daily view for payroll review, absences, and time reconciliation.</p>
      </div>
      <Button
        size="sm"
        variant={showFilters ? "default" : "outline"}
        className={`h-8 gap-1.5 text-xs ${showFilters ? "bg-red-600 hover:bg-red-700" : ""}`}
        onClick={() => setShowFilters(value => !value)}
        data-testid="btn-toggle-attendance-filters"
      >
        {showFilters ? <X className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
        {showFilters ? "Hide filters" : "Filters"}
        {hasFilter && <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">●</span>}
      </Button>
    </div>
    {showFilters && <Card className="mt-4 rounded-xl border-slate-200 shadow-sm"><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Filter className="h-4 w-4 text-red-600" />Filter the ledger</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <div className="min-w-0"><Label className="text-[11px] text-slate-500">Team member</Label><Select value={userId} onValueChange={setUserId}><SelectTrigger className="mt-1 h-9 w-full min-w-0 text-xs"><SelectValue placeholder="All team members" /></SelectTrigger><SelectContent><SelectItem value="all">All team members</SelectItem>{teamMembers.map((user: any) => <SelectItem key={user.id} value={String(user.id)}>{user.name || user.username}</SelectItem>)}</SelectContent></Select></div>
        <div className="min-w-0"><Label className="text-[11px] text-slate-500">From date</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 h-9 w-full min-w-0 text-xs" /></div>
        <div className="min-w-0"><Label className="text-[11px] text-slate-500">To date</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 h-9 w-full min-w-0 text-xs" /></div>
        <div className="min-w-0"><Label className="text-[11px] text-slate-500">Log status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="mt-1 h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Working</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="exception">Exception</SelectItem></SelectContent></Select></div>
        <div className="min-w-0"><Label className="text-[11px] text-slate-500">Start method</Label><Select value={startMethod} onValueChange={setStartMethod}><SelectTrigger className="mt-1 h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All methods</SelectItem><SelectItem value="warehouse">Warehouse</SelectItem><SelectItem value="driving">Route start</SelectItem></SelectContent></Select></div>
        <div className="flex min-w-0 items-end"><Button variant="outline" className="h-9 w-full min-w-0 text-xs" onClick={clearFilters}><X className="mr-1.5 h-3.5 w-3.5 shrink-0" />Reset</Button></div>
      </div>
    </CardContent></Card>}
    <div className="mt-4 flex gap-3 overflow-x-auto px-0 pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
      {[
        ["Hours worked", hours(totalSeconds), "Actual recorded time", "text-blue-600"],
        ["Hours lost / short", hours(lostSeconds), "Against 8h weekday expectation", "text-red-600"],
        ["Days worked", String(daysWorked), selectedMember ? "Days with a log" : "Team member-days", "text-emerald-600"],
        ["Absent days", String(absentDays), selectedMember ? "Weekdays with no log" : "Across selected team", "text-amber-600"],
        ["Business days", String(businessDates.length), `${expectedTeamMembers || 0} team member${expectedTeamMembers === 1 ? "" : "s"} selected`, "text-slate-600"],
      ].map(([label, value, hint, color]) => <Card key={label} className="min-w-[166px] shrink-0 rounded-xl border-slate-200 shadow-sm lg:min-w-0"><CardContent className="p-4"><p className={`text-xl font-bold ${color}`}>{value}</p><p className="mt-1 text-xs font-semibold text-slate-700">{label}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{hint}</p></CardContent></Card>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500">
      <span className="font-semibold text-slate-700">{selectedMember ? selectedMember.name : "All team members"}</span>
      <span>{from && to ? `${shortDate(from)} – ${shortDate(to)}` : "Choose a valid date range"}</span>
      <span className="text-slate-300">•</span>
      <span><span className="font-semibold text-slate-700">Weekdays</span> are expected workdays</span>
      <span><span className="font-semibold text-amber-700">US holidays</span> and <span className="font-semibold text-slate-600">weekends</span> are excluded</span>
      <span className="ml-auto text-slate-400">Expected time uses 8 hours per weekday</span>
    </div>
    {selectedId ? <div className="mt-4"><LogDetail id={selectedId} onClose={() => setSelectedId(null)} /></div> : <Card className="mt-4 overflow-hidden rounded-xl border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-white pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">Daily attendance</CardTitle><span className="text-xs text-slate-400">{dates.length} calendar days · {rows.length} logs</span></div></CardHeader>
      <CardContent className="p-0">
        {query.isLoading || usersQuery.isLoading ? <div className="p-12 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /><p className="mt-2">Loading attendance ledger…</p></div> : query.isError || usersQuery.isError ? <div className="p-10 text-center text-sm text-red-600">Attendance logs could not be loaded. Try refreshing the page.</div> : !dates.length ? <div className="p-10 text-center text-sm text-slate-400">Choose a valid date range to view the ledger.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Day</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Hours</th><th className="px-4 py-3 font-semibold">Team / note</th><th className="px-4 py-3 text-right font-semibold">Details</th></tr></thead>
              <tbody>
                {dates.map(date => {
                  const summary = recordsByDate.get(date);
                  const record = selectedMember ? summary?.records.find((row: any) => String(row.user_id) === userId) : undefined;
                  const statusKey = ledgerStatus(date, holidayMap, selectedMember ? record : summary, userId === "all" ? "" : userId);
                  const holiday = holidayMap.get(date);
                  const dateRecords = summary?.records ?? [];
                  const names = dateRecords.map((row: any) => row.employee_name || row.employee_username).filter(Boolean);
                  const displayHours = selectedMember ? hours(record?.total_seconds) : hours(summary?.totalSeconds);
                  return <tr key={date} className={`border-b border-slate-100 last:border-0 ${statusKey === "weekend" ? "bg-slate-50/80" : statusKey === "holiday" ? "bg-amber-50/40" : "bg-white"}`}>
                    <td className="whitespace-nowrap px-4 py-3"><span className="font-semibold text-slate-800">{shortDate(date)}</span><span className="ml-2 text-[10px] text-slate-400">{date}</span></td>
                    <td className={`px-4 py-3 font-medium ${statusKey === "weekend" ? "text-slate-400" : "text-slate-600"}`}>{weekday(date)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass[statusKey]}`}>{statusLabel[statusKey]}</span>{holiday && <span className="ml-2 text-[10px] text-amber-700">{holiday}</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{statusKey === "holiday" || statusKey === "weekend" ? "—" : displayHours}</td>
                    <td className="max-w-[280px] px-4 py-3 text-slate-500">{selectedMember ? (record ? `${record.start_method === "warehouse" ? "Warehouse" : "Route start"} · ${record.status}` : statusKey === "absent" ? "No attendance log recorded" : "Not expected") : (names.length ? `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}` : statusKey === "absent" ? "No team member logged time" : "Not expected")}</td>
                    <td className="px-4 py-3 text-right">{record && <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-600 hover:text-red-700" onClick={() => setSelectedId(record.id)}>Open log<ChevronRight className="ml-1 h-3 w-3" /></Button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setMonth(value => shiftMonth(value, -1))}
            aria-label="View previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />Previous month
          </Button>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-700">{monthLabel(month)}</p>
            {month !== currentMonthKey() && <Button variant="link" size="sm" className="h-5 p-0 text-[11px] text-red-600" onClick={() => setMonth(currentMonthKey())}>Return to current month</Button>}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setMonth(value => shiftMonth(value, 1))}
            aria-label="View next month"
          >
            Next month<ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>}
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

export function AttendanceSettingsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["attendance", "settings"], queryFn: () => apiJson("/api/attendance/settings"), retry: false });
  const [form, setForm] = useState<any>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);
  const save = useMutation({ mutationFn: () => apiJson("/api/attendance/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }), onSuccess: data => { setForm(data); client.invalidateQueries({ queryKey: ["attendance", "settings"] }); } });
  if (query.isLoading || !form) return <AdminShell activeTab="settings"><Card><CardContent className="p-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></CardContent></Card></AdminShell>;
  if (query.isError) return <AdminShell activeTab="settings"><Card className="border-red-200"><CardContent className="p-8 text-center"><p className="text-sm font-semibold text-red-700">Attendance settings could not be loaded.</p><p className="mt-2 text-sm text-slate-500">Use an administrator account and open this page from Admin → Attendance Settings.</p><Button className="mt-5 bg-red-600 hover:bg-red-700" onClick={() => query.refetch()}>Try Again</Button></CardContent></Card></AdminShell>;
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  const useCurrentLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("This browser does not provide location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        set("warehouseLatitude", position.coords.latitude.toFixed(6));
        set("warehouseLongitude", position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocationError("Location access was unavailable. Allow location access in the browser and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };
  return <AdminShell activeTab="settings">
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-sm">Warehouse Location</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label className="text-xs">Warehouse name</Label><Input value={form.warehouseName} onChange={e => set("warehouseName", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Latitude</Label><Input type="number" step="any" value={form.warehouseLatitude ?? ""} onChange={e => set("warehouseLatitude", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Longitude</Label><Input type="number" step="any" value={form.warehouseLongitude ?? ""} onChange={e => set("warehouseLongitude", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Allowed radius (meters)</Label><Input type="number" value={form.allowedRadiusMeters} onChange={e => set("allowedRadiusMeters", e.target.value)} className="mt-1" /></div><div className="flex items-end pb-2 text-xs text-slate-500"><MapPin className="mr-2 h-4 w-4 text-red-600" />Used for Warehouse validation</div><div className="sm:col-span-2 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3"><Button type="button" variant="outline" size="sm" className="text-xs" onClick={useCurrentLocation} disabled={locating}><MapPin className="mr-2 h-3.5 w-3.5" />{locating ? "Locating..." : "Use my current location"}</Button><span className="text-xs text-slate-500">Or enter the warehouse latitude and longitude manually.</span>{locationError && <span className="w-full text-xs text-red-600">{locationError}</span>}</div>{(form.warehouseLatitude == null || form.warehouseLongitude == null) && <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Warehouse coordinates are not set yet. Save coordinates before employees can use Warehouse to clock in.</div>}</CardContent></Card>
      <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-sm">Attendance Rules</CardTitle></CardHeader><CardContent className="space-y-4">{[["warehouseVerificationEnabled", "Warehouse verification"], ["routeStartEnabled", "Route start outside home"], ["hourlyCheckpointEnabled", "Hourly location checkpoint"], ["firstFourHourValidationEnabled", "First four hour validation"], ["locationAccuracyRequired", "Require location accuracy"]].map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-slate-700">{label}</p><p className="text-xs text-slate-400">Configure whether this rule is active.</p></div><Switch checked={Boolean(form[key])} onCheckedChange={value => set(key, value)} /></div>)}<div className="grid gap-3 sm:grid-cols-2"><div><Label className="text-xs">Checkpoint interval (minutes)</Label><Input type="number" value={form.checkpointIntervalMinutes} onChange={e => set("checkpointIntervalMinutes", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Warehouse threshold (minutes)</Label><Input type="number" value={form.warehousePresenceThresholdMinutes} onChange={e => set("warehousePresenceThresholdMinutes", e.target.value)} className="mt-1" /></div><div><Label className="text-xs">Home exclusion distance (meters)</Label><Input type="number" min="1" value={form.homeExclusionRadiusMeters} onChange={e => set("homeExclusionRadiusMeters", e.target.value)} className="mt-1" /><p className="mt-1 text-[11px] text-slate-400">Route start is blocked until the rep is farther than this distance from their saved home.</p></div></div></CardContent></Card>
      <Card className="rounded-xl border-slate-200 shadow-sm lg:col-span-2"><CardHeader><CardTitle className="text-sm">Pay Period Configuration</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3"><div className="min-w-0"><Label className="text-xs">Period length (days)</Label><Input type="number" value={form.payPeriodLengthDays} onChange={e => set("payPeriodLengthDays", e.target.value)} className="mt-1 w-full min-w-0" /></div><div className="min-w-0"><Label className="text-xs">Period anchor date</Label><Input type="date" value={form.payPeriodAnchorDate} onChange={e => set("payPeriodAnchorDate", e.target.value)} className="mt-1 w-full min-w-0" /></div><div className="min-w-0"><Label className="text-xs">Payday</Label><Select value={String(form.paydayWeekday)} onValueChange={value => set("paydayWeekday", Number(value))}><SelectTrigger className="mt-1 w-full min-w-0"><SelectValue /></SelectTrigger><SelectContent>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>
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
  if (tab === "settings") return <AttendanceSettingsPage />;
  return <Overview />;
}