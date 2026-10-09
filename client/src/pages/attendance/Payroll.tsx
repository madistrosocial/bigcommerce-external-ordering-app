import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarDays, Check, ChevronDown, CircleDollarSign, Clock3, FileText, Loader2, Printer, RefreshCw, Settings2, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthHeaders } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";

function apiJson(path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) } }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Payroll request failed");
    return body;
  });
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function formatMoney(amount: unknown, currency = "USD") {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function dateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : value;
}

function StatusBadge({ status }: { status: string }) {
  const style = status === "finalized" || status === "approved"
    ? "bg-emerald-100 text-emerald-700"
    : status === "rejected"
      ? "bg-rose-100 text-rose-700"
      : "bg-amber-100 text-amber-800";
  return <Badge className={`${style} border-0 capitalize`}>{status.replace(/_/g, " ")}</Badge>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">{children}</div>;
}

function PayStatement({ slip }: { slip: any }) {
  return (
    <Card className="border-slate-200 shadow-sm print:break-inside-avoid">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{slip.employee_name_snapshot}</CardTitle>
            <p className="mt-1 text-xs text-slate-500">{dateLabel(slip.run?.period_start)} – {dateLabel(slip.run?.period_end)} · Pay date {dateLabel(slip.run?.payday)}</p>
          </div>
          <Button type="button" size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-3">
          <SummaryMetric label="Gross before deductions" value={formatMoney(slip.gross_amount, slip.currency)} />
          <SummaryMetric label="Deductions" value={formatMoney(slip.deductions_amount, slip.currency)} />
          <SummaryMetric label="Net pay" value={formatMoney(slip.net_amount, slip.currency)} strong />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">{slip.regular_hours} regular hrs</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">{slip.overtime_hours} overtime hrs</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">{slip.paid_leave_hours} paid leave hrs</span>
          {Number(slip.unpaid_leave_hours) > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1">{slip.unpaid_leave_hours} unpaid leave hrs</span>}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-2 pr-3 font-medium">Description</th><th className="py-2 pr-3 text-right font-medium">Units</th><th className="py-2 pr-3 text-right font-medium">Rate</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
            <tbody>{(slip.lines ?? []).map((line: any) => (
              <tr key={line.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 text-slate-700">{line.description}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{line.units}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{line.rate == null ? "—" : formatMoney(line.rate, slip.currency)}</td>
                <td className={`py-2 text-right tabular-nums ${Number(line.amount) < 0 ? "text-rose-600" : "text-slate-900"}`}>{formatMoney(line.amount, slip.currency)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 tabular-nums ${strong ? "text-lg font-bold text-slate-900" : "font-semibold text-slate-700"}`}>{value}</p></div>;
}

function ScheduleEditor({ group, onSaved }: { group: any; onSaved: () => void }) {
  const current = group.schedule;
  const [cadence, setCadence] = useState(current?.cadence ?? "biweekly_friday");
  const [anchor, setAnchor] = useState(current?.biweekly_anchor_date ?? "");
  const [firstDay, setFirstDay] = useState(String(current?.semimonthly_first_payday ?? 15));
  const [secondDay, setSecondDay] = useState(String(current?.semimonthly_second_payday ?? 30));
  const [timezone, setTimezone] = useState(current?.timezone ?? "UTC");
  const save = useMutation({
    mutationFn: () => apiJson(`/api/attendance/payroll/admin/groups/${group.id}/schedule`, jsonInit("PUT", {
      cadence,
      biweekly_anchor_date: anchor,
      semimonthly_first_payday: Number(firstDay),
      semimonthly_second_payday: Number(secondDay),
      timezone,
    })),
    onSuccess: onSaved,
  });
  useEffect(() => {
    setCadence(current?.cadence ?? "biweekly_friday");
    setAnchor(current?.biweekly_anchor_date ?? "");
    setFirstDay(String(current?.semimonthly_first_payday ?? 15));
    setSecondDay(String(current?.semimonthly_second_payday ?? 30));
    setTimezone(current?.timezone ?? "UTC");
  }, [group.id, current?.updated_at]);
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold text-slate-900">{group.name}</p><p className="text-xs text-slate-500">{current ? `Current: ${current.cadence === "biweekly_friday" ? "Every 2 weeks on Friday" : "Semimonthly"}` : "No payroll schedule assigned"}</p></div>
        <Badge variant="outline">{group.description || "Existing user group"}</Badge>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div><Label>Pay cadence</Label><select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={cadence} onChange={event => setCadence(event.target.value)}><option value="biweekly_friday">Every 2 weeks on Friday</option><option value="semimonthly_15_30">Twice monthly (configured dates)</option></select></div>
        {cadence === "biweekly_friday"
          ? <div><Label>First payday / 14-day anchor</Label><Input className="mt-1.5" type="date" value={anchor} onChange={event => setAnchor(event.target.value)} /></div>
          : <div className="grid grid-cols-2 gap-2"><div><Label>First payday</Label><Input className="mt-1.5" type="number" min="1" max="31" value={firstDay} onChange={event => setFirstDay(event.target.value)} /></div><div><Label>Second payday</Label><Input className="mt-1.5" type="number" min="1" max="31" value={secondDay} onChange={event => setSecondDay(event.target.value)} /></div></div>}
        <div><Label>Payroll timezone</Label><Input className="mt-1.5" value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="America/New_York" /></div>
        <div className="flex items-end"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}Save schedule</Button></div>
      </div>
      {cadence === "semimonthly_15_30" && <p className="mt-2 text-xs text-slate-500">Enter the actual pay date for each run. For February or a short month, choose the payday explicitly when creating the run.</p>}
      {save.error && <p role="alert" className="mt-2 text-sm text-rose-600">{save.error.message}</p>}
    </div>
  );
}

function EmployeePayEditor({ employee, onRefresh }: { employee: any; onRefresh: () => void }) {
  const profile = employee.profile;
  const [hourlyRate, setHourlyRate] = useState(profile?.hourly_rate ?? "");
  const [currency, setCurrency] = useState(profile?.currency ?? "USD");
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(profile?.overtime_multiplier ?? "1.5");
  const [holidayMultiplier, setHolidayMultiplier] = useState(profile?.holiday_overtime_multiplier ?? "2");
  const [itemType, setItemType] = useState("allowance");
  const [itemLabel, setItemLabel] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  useEffect(() => {
    setHourlyRate(profile?.hourly_rate ?? "");
    setCurrency(profile?.currency ?? "USD");
    setOvertimeMultiplier(profile?.overtime_multiplier ?? "1.5");
    setHolidayMultiplier(profile?.holiday_overtime_multiplier ?? "2");
  }, [employee.id, profile?.updated_at]);
  const saveProfile = useMutation({
    mutationFn: () => apiJson(`/api/attendance/payroll/admin/profiles/${employee.id}`, jsonInit("PUT", {
      hourly_rate: Number(hourlyRate),
      currency,
      overtime_multiplier: Number(overtimeMultiplier),
      holiday_overtime_multiplier: Number(holidayMultiplier),
    })),
    onSuccess: onRefresh,
  });
  const addItem = useMutation({
    mutationFn: () => apiJson("/api/attendance/payroll/admin/pay-items", jsonInit("POST", {
      user_id: employee.id,
      item_type: itemType,
      label: itemLabel,
      amount: Number(itemAmount),
    })),
    onSuccess: () => {
      setItemLabel("");
      setItemAmount("");
      onRefresh();
    },
  });
  const updateItem = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiJson(`/api/attendance/payroll/admin/pay-items/${id}`, jsonInit("PATCH", { is_active })),
    onSuccess: onRefresh,
  });
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold text-slate-900">{employee.name || employee.username}</p><p className="text-xs text-slate-500">{employee.username}{employee.is_enabled ? "" : " · account disabled"}</p></div>
        {profile ? <Badge className="border-0 bg-emerald-100 text-emerald-700">Pay profile set</Badge> : <Badge className="border-0 bg-amber-100 text-amber-800">Needs rate</Badge>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label>Hourly rate</Label><Input className="mt-1" type="number" min="0.01" step="0.01" value={hourlyRate} onChange={event => setHourlyRate(event.target.value)} /></div>
        <div><Label>Currency (ISO)</Label><Input className="mt-1 uppercase" maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} /></div>
        <div><Label>Overtime multiplier</Label><Input className="mt-1" type="number" min="0.1" max="10" step="0.05" value={overtimeMultiplier} onChange={event => setOvertimeMultiplier(event.target.value)} /></div>
        <div><Label>Holiday/rest multiplier</Label><Input className="mt-1" type="number" min="0.1" max="10" step="0.05" value={holidayMultiplier} onChange={event => setHolidayMultiplier(event.target.value)} /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>{saveProfile.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Save pay profile</Button>
        {saveProfile.error && <span role="alert" className="text-xs text-rose-600">{saveProfile.error.message}</span>}
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Recurring pay items · applied once per run</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(employee.payItems ?? []).map((item: any) => <div key={item.id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${item.is_active ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-100 text-slate-400"}`}>
            <span className="capitalize">{item.item_type}</span><span>{item.label}</span><span className="font-semibold tabular-nums">{formatMoney(item.amount, currency)}</span>
            <button type="button" className="font-medium text-indigo-600 hover:underline" disabled={updateItem.isPending} onClick={() => updateItem.mutate({ id: item.id, is_active: !item.is_active })}>{item.is_active ? "Pause" : "Resume"}</button>
          </div>)}
          {!employee.payItems?.length && <span className="text-xs text-slate-400">None</span>}
        </div>
        <form className="mt-3 grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)_140px_auto]" onSubmit={event => { event.preventDefault(); addItem.mutate(); }}>
          <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={itemType} onChange={event => setItemType(event.target.value)}><option value="allowance">Allowance</option><option value="deduction">Deduction</option></select>
          <Input aria-label="Pay item label" placeholder="Item name" maxLength={100} required value={itemLabel} onChange={event => setItemLabel(event.target.value)} />
          <Input aria-label="Pay item amount" placeholder="Amount" type="number" min="0.01" step="0.01" required value={itemAmount} onChange={event => setItemAmount(event.target.value)} />
          <Button size="sm" type="submit" variant="outline" disabled={!profile || addItem.isPending}>{addItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add item"}</Button>
        </form>
        {addItem.error && <p role="alert" className="mt-2 text-xs text-rose-600">{addItem.error.message}</p>}
      </div>
    </div>
  );
}

function OvertimeClaimCard({ shift, onClaim, isPending }: { shift: any; onClaim: (data: any) => void; isPending: boolean }) {
  const [overtimeType, setOvertimeType] = useState("regular");
  const [requestedHours, setRequestedHours] = useState(String(shift.eligible_overtime_hours));
  const [note, setNote] = useState("");
  return (
    <form className="rounded-lg border border-slate-200 p-3" onSubmit={event => { event.preventDefault(); onClaim({ attendance_id: shift.id, overtime_type: overtimeType, requested_hours: Number(requestedHours), employee_note: note }); }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-semibold text-slate-900">{dateLabel(shift.work_date)}</p><p className="mt-1 text-sm text-slate-500">{shift.eligible_overtime_hours} eligible hours after the first 8 net work hours.</p></div>
        <Badge variant="outline">{Math.floor(Number(shift.worked_seconds) / 3600)}h {String(Math.floor((Number(shift.worked_seconds) % 3600) / 60)).padStart(2, "0")}m worked</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={overtimeType} onChange={event => setOvertimeType(event.target.value)}><option value="regular">Regular overtime</option><option value="holiday_rest">Holiday / rest-day overtime</option></select>
        <Input aria-label="Requested overtime hours" type="number" min="0.01" max={shift.eligible_overtime_hours} step="0.01" required value={requestedHours} onChange={event => setRequestedHours(event.target.value)} />
        <Input aria-label="Overtime note" placeholder="Optional note" maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
      </div>
      <Button type="submit" size="sm" className="mt-3" disabled={isPending}>{isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}Submit overtime claim</Button>
    </form>
  );
}

export default function AttendancePayrollPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("attendance", "manage_payroll");
  const canReviewOvertime = hasPermission("attendance", "approve_overtime") && hasPermission("attendance", "view_all");
  const [roleId, setRoleId] = useState("");
  const [runRoleId, setRunRoleId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payday, setPayday] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [reviewError, setReviewError] = useState("");
  const me = useQuery({ queryKey: ["attendance-payroll-me"], queryFn: () => apiJson("/api/attendance/payroll/me") });
  const eligible = useQuery({ queryKey: ["attendance-overtime-eligible"], queryFn: () => apiJson("/api/attendance/payroll/overtime/eligible") });
  const claims = useQuery({ queryKey: ["attendance-overtime-mine"], queryFn: () => apiJson("/api/attendance/payroll/overtime/mine") });
  const config = useQuery({ queryKey: ["attendance-payroll-config"], queryFn: () => apiJson("/api/attendance/payroll/admin/config"), enabled: canManage });
  const employees = useQuery({
    queryKey: ["attendance-payroll-employees", roleId],
    queryFn: () => apiJson(`/api/attendance/payroll/admin/employees?roleId=${encodeURIComponent(roleId)}`),
    enabled: canManage && !!roleId,
  });
  const runs = useQuery({ queryKey: ["attendance-payroll-runs"], queryFn: () => apiJson("/api/attendance/payroll/admin/runs"), enabled: canManage });
  const runDetails = useQuery({
    queryKey: ["attendance-payroll-run", selectedRunId],
    queryFn: () => apiJson(`/api/attendance/payroll/admin/runs/${selectedRunId}`),
    enabled: canManage && selectedRunId != null,
  });
  const pendingOvertime = useQuery({
    queryKey: ["attendance-overtime-pending"],
    queryFn: () => apiJson("/api/attendance/payroll/overtime/pending"),
    enabled: canReviewOvertime,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["attendance-payroll-me"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-payroll-employees"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-payroll-config"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-payroll-runs"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-payroll-run"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-overtime-eligible"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-overtime-mine"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-overtime-pending"] });
  };
  const claim = useMutation({
    mutationFn: (body: any) => apiJson("/api/attendance/payroll/overtime", jsonInit("POST", body)),
    onSuccess: refresh,
  });
  const decideOvertime = useMutation({
    mutationFn: ({ id, status, approved_hours, manager_note }: any) => apiJson(`/api/attendance/payroll/overtime/${id}`, jsonInit("PATCH", { status, approved_hours, manager_note })),
    onSuccess: () => { setReviewError(""); refresh(); },
    onError: error => setReviewError(error.message),
  });
  const createRun = useMutation({
    mutationFn: () => apiJson("/api/attendance/payroll/admin/runs", jsonInit("POST", {
      role_id: Number(runRoleId),
      period_start: periodStart,
      period_end: periodEnd,
      payday,
    })),
    onSuccess: result => {
      setSelectedRunId(result.run.id);
      refresh();
    },
  });
  const rebuildRun = useMutation({
    mutationFn: (id: number) => apiJson(`/api/attendance/payroll/admin/runs/${id}/rebuild`, jsonInit("POST", {})),
    onSuccess: result => { setSelectedRunId(result.run.id); refresh(); },
  });
  const finalizeRun = useMutation({
    mutationFn: (id: number) => apiJson(`/api/attendance/payroll/admin/runs/${id}/finalize`, jsonInit("POST", {})),
    onSuccess: result => { setSelectedRunId(result.run.id); refresh(); },
  });
  useEffect(() => {
    const firstGroup = config.data?.groups?.[0]?.id;
    if (!roleId && firstGroup) setRoleId(String(firstGroup));
    if (!runRoleId && firstGroup) setRunRoleId(String(firstGroup));
  }, [config.data, roleId, runRoleId]);

  function reviewClaim(request: any, status: "approved" | "rejected") {
    const note = window.prompt(status === "approved" ? "Optional manager note" : "Reason for rejecting this claim") ?? "";
    if (status === "rejected" && !note.trim()) return;
    const hoursValue = status === "approved"
      ? window.prompt("Approve how many hours?", String(request.requested_hours))
      : null;
    if (status === "approved" && (hoursValue == null || !Number.isFinite(Number(hoursValue)) || Number(hoursValue) <= 0)) return;
    decideOvertime.mutate({
      id: request.id,
      status,
      approved_hours: hoursValue == null ? undefined : Number(hoursValue),
      manager_note: note,
    });
  }

  const ownPayslips = me.data?.payslips ?? [];
  const runSlips = runDetails.data?.payslips ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Banknote className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-bold text-slate-900">Payroll</h1><p className="text-sm text-slate-500">Pay profiles, overtime, payroll runs, and payslips linked to Attendance.</p></div>
        </div>
        <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {(me.error || eligible.error || claims.error) && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{me.error?.message || eligible.error?.message || claims.error?.message}</p>}

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4 text-emerald-700" />Your pay profile</CardTitle></CardHeader>
          <CardContent>
            {me.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : me.data?.profile
              ? <div className="grid grid-cols-2 gap-3">
                <SummaryMetric label="Hourly rate" value={`${formatMoney(me.data.profile.hourly_rate, me.data.profile.currency)} / hr`} />
                <SummaryMetric label="Currency" value={me.data.profile.currency} />
                <p className="col-span-2 text-xs leading-5 text-slate-500">Regular hours are based on each completed Attendance session’s net worked time, capped at 8 hours per session. Recorded breaks are not paid hours.</p>
              </div>
              : <EmptyState>Your hourly pay profile has not been set up. Ask a payroll manager to add it.</EmptyState>}
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-emerald-700" />Overtime claims</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {claim.error && <p role="alert" className="text-sm text-rose-600">{claim.error.message}</p>}
            {eligible.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {!eligible.isLoading && !eligible.data?.rows?.length && <p className="text-sm text-slate-500">No completed shifts currently qualify for an overtime claim.</p>}
            {(eligible.data?.rows ?? []).map((shift: any) => <OvertimeClaimCard key={shift.id} shift={shift} onClaim={data => claim.mutate(data)} isPending={claim.isPending} />)}
            {(claims.data?.rows ?? []).length > 0 && <div className="border-t border-slate-100 pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted claims</p><div className="space-y-2">
              {claims.data.rows.map((row: any) => {
                const request = row.request;
                return <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>{dateLabel(row.work_date)} · {request.requested_hours}h · {request.overtime_type === "holiday_rest" ? "Holiday/rest day" : "Regular"}</span><StatusBadge status={request.status} />
                </div>;
              })}
            </div></div>}
          </CardContent>
        </Card>
      </section>

      {canReviewOvertime && <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-amber-600" />Overtime review queue</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {reviewError && <p role="alert" className="text-sm text-rose-600">{reviewError}</p>}
          {pendingOvertime.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
          {pendingOvertime.error && <p role="alert" className="text-sm text-rose-600">{pendingOvertime.error.message}</p>}
          {!pendingOvertime.isLoading && !pendingOvertime.data?.rows?.length && <p className="text-sm text-slate-500">No overtime claims need review.</p>}
          {(pendingOvertime.data?.rows ?? []).map((row: any) => {
            const request = row.request;
            return <div key={request.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
              <div><p className="font-semibold text-slate-900">{row.employee_name || row.employee_username} · {dateLabel(row.work_date)}</p><p className="mt-1 text-sm text-slate-600">{request.requested_hours}h requested of {Math.max(0, (Number(row.total_seconds) - 28800) / 3600).toFixed(2)}h recorded · {request.overtime_type === "holiday_rest" ? "Holiday/rest day" : "Regular"}</p>{request.employee_note && <p className="mt-1 text-xs text-slate-500">{request.employee_note}</p>}</div>
              <div className="flex shrink-0 gap-2"><Button size="sm" disabled={decideOvertime.isPending} onClick={() => reviewClaim(request, "approved")}><Check className="mr-1 h-4 w-4" />Approve / adjust</Button><Button size="sm" variant="outline" disabled={decideOvertime.isPending} onClick={() => reviewClaim(request, "rejected")}><X className="mr-1 h-4 w-4" />Reject</Button></div>
            </div>;
          })}
        </CardContent>
      </Card>}

      <section className="space-y-3">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /><h2 className="font-semibold text-slate-900">Your finalized payslips</h2></div>
        {me.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
        {!me.isLoading && !ownPayslips.length && <EmptyState>Finalized payslips will appear here.</EmptyState>}
        <div className="grid gap-3 lg:grid-cols-2">{ownPayslips.map((slip: any) => <PayStatement key={slip.id} slip={slip} />)}</div>
      </section>

      {canManage && <div className="space-y-5 border-t border-slate-200 pt-5">
        <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-slate-600" /><h2 className="text-lg font-bold text-slate-900">Payroll management</h2></div>
        {config.error && <p role="alert" className="text-sm text-rose-600">{config.error.message}</p>}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Existing user-group schedules</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {config.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {(config.data?.groups ?? []).map((group: any) => <ScheduleEditor key={group.id} group={group} onSaved={refresh} />)}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Employee rates and recurring items</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-sm"><Label>Existing user group</Label><select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={roleId} onChange={event => setRoleId(event.target.value)}><option value="">Choose a group</option>{(config.data?.groups ?? []).map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
            {employees.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {employees.error && <p role="alert" className="text-sm text-rose-600">{employees.error.message}</p>}
            {roleId && !employees.isLoading && !employees.data?.employees?.length && <EmptyState>No employees are assigned to this group.</EmptyState>}
            <div className="space-y-3">{(employees.data?.employees ?? []).map((employee: any) => <EmployeePayEditor key={employee.id} employee={employee} onRefresh={refresh} />)}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Create a payroll run</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-4" onSubmit={event => { event.preventDefault(); createRun.mutate(); }}>
              <div className="md:col-span-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">The run uses completed Attendance session totals, approved overtime, approved weekday leave, and recurring pay items. Every completed attendance session must be Approved or Locked before a draft can be built. Net pay is calculated after deductions. Employee currencies remain separate; no conversion is performed. Enter the payday explicitly for short months.</div>
              <div><Label>User group</Label><select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" required value={runRoleId} onChange={event => setRunRoleId(event.target.value)}><option value="">Choose a group</option>{(config.data?.groups ?? []).map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
              <div><Label>Period start</Label><Input className="mt-1.5" type="date" required value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></div>
              <div><Label>Period end</Label><Input className="mt-1.5" type="date" min={periodStart || undefined} required value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></div>
              <div><Label>Payday</Label><Input className="mt-1.5" type="date" required value={payday} onChange={event => setPayday(event.target.value)} /></div>
              <div className="md:col-span-4 flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={createRun.isPending}>{createRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleDollarSign className="mr-2 h-4 w-4" />}Build draft payroll</Button>
                {createRun.error && <span role="alert" className="text-sm text-rose-600">{createRun.error.message}</span>}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Payroll run history</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {runs.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {runs.error && <p role="alert" className="text-sm text-rose-600">{runs.error.message}</p>}
            {(runs.data?.rows ?? []).map((run: any) => <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)} className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${selectedRunId === run.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <span><span className="block font-semibold text-slate-900">{run.group_name_snapshot}</span><span className="mt-1 block text-xs text-slate-500">{dateLabel(run.period_start)} – {dateLabel(run.period_end)} · Payday {dateLabel(run.payday)}</span></span><StatusBadge status={run.status} />
            </button>)}
            {!runs.isLoading && !runs.data?.rows?.length && <div className="md:col-span-2"><EmptyState>No payroll runs yet.</EmptyState></div>}
          </CardContent>
        </Card>

        {selectedRunId != null && <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle className="text-base">Run details</CardTitle>{runDetails.data?.run && <p className="mt-1 text-sm text-slate-500">{runDetails.data.run.group_name_snapshot} · {dateLabel(runDetails.data.run.period_start)} – {dateLabel(runDetails.data.run.period_end)}</p>}</div>
              {runDetails.data?.run?.status === "draft" && <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={rebuildRun.isPending} onClick={() => rebuildRun.mutate(selectedRunId)}>{rebuildRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Rebuild draft</Button>
                <Button size="sm" disabled={finalizeRun.isPending} onClick={() => finalizeRun.mutate(selectedRunId)}>{finalizeRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Finalize and lock</Button>
              </div>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(runDetails.error || rebuildRun.error || finalizeRun.error) && <p role="alert" className="text-sm text-rose-600">{runDetails.error?.message || rebuildRun.error?.message || finalizeRun.error?.message}</p>}
            {runDetails.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {!runDetails.isLoading && !runSlips.length && <EmptyState>This run has no payslips.</EmptyState>}
            <div className="grid gap-3 lg:grid-cols-2">{runSlips.map((slip: any) => <PayStatement key={slip.id} slip={{ ...slip, run: runDetails.data.run }} />)}</div>
          </CardContent>
        </Card>}
      </div>}
      {canManage && !config.isLoading && config.data?.groups?.length === 0 && <p className="text-sm text-slate-500">Create or assign the existing user groups in Admin before setting payroll schedules.</p>}
    </div>
  );
}