import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarDays, Check, ChevronDown, CircleDollarSign, Clock3, Download, FileText, Loader2, Mail, RefreshCw, Send, Settings2, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PayslipDocument, { type PayslipDocumentData } from "@/components/payroll/PayslipDocument";
import { getAuthHeaders } from "@/lib/api";
import { generatePdfBase64FromElement } from "@/lib/payslip-renderer";
import { usePermissions } from "@/hooks/usePermissions";

type OpenAttendanceSession = {
  id: number;
  employee_name: string | null;
  employee_username: string | null;
  work_date: string;
  session_number: number | null;
  status: "active" | "on_break";
};

type AttendanceReviewSession = {
  id: number;
  user_id: number;
  employee_name: string | null;
  employee_username: string | null;
  work_date: string;
  session_number: number | null;
  status: string;
};

type PayrollApiError = Error & {
  status?: number;
  code?: string;
  openAttendanceSessions?: OpenAttendanceSession[];
  attendanceReviewSessions?: AttendanceReviewSession[];
};

function apiJson(path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) } }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error ?? "Payroll request failed") as PayrollApiError;
      error.status = response.status;
      error.code = body.code;
      error.openAttendanceSessions = body.openAttendanceSessions;
      error.attendanceReviewSessions = body.attendanceReviewSessions;
      throw error;
    }
    return body;
  });
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function attendanceReviewUrl(session: AttendanceReviewSession) {
  const params = new URLSearchParams({
    record: String(session.id),
    userId: String(session.user_id),
    status: "completed",
    reviewStatus: "needs_review",
    focusDate: session.work_date,
  });
  return `/attendance/logs?${params.toString()}`;
}

function AttendanceReviewBlockerList({
  sessions,
  canReviewAttendance,
}: {
  sessions: AttendanceReviewSession[];
  canReviewAttendance: boolean;
}) {
  if (!sessions.length) return null;
  return <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
    <div className="flex items-start gap-2">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold text-amber-950">Completed attendance needs review</p>
        <p className="mt-1 text-sm text-amber-900">Review each highlighted date in Attendance Logs and clear its review flag after verification.</p>
      </div>
    </div>
    <ul className="mt-3 space-y-2">
      {sessions.map(session => <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{session.employee_name || session.employee_username || "Employee"} · {dateLabel(session.work_date)}</p>
          <p className="mt-0.5 text-xs text-slate-600">Completed · Session {session.session_number ?? 1} · Needs review</p>
        </div>
        {canReviewAttendance
          ? <a href={attendanceReviewUrl(session)} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">Review this date</a>
          : <p className="text-xs text-slate-500">Ask an Attendance reviewer with permission to clear review flags.</p>}
      </li>)}
    </ul>
  </div>;
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

type PayslipForView = PayslipDocumentData & {
  id: number;
  employee_email?: string | null;
};

function PayStatement({
  slip,
  canEmail = false,
  company,
}: {
  slip: PayslipForView;
  canEmail?: boolean;
  company?: Record<string, string | null | undefined>;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const isFinalized = slip.run?.status === "finalized";
  const branding = {
    company_address: company?.company_address,
    company_phone: company?.company_phone,
    company_email: company?.company_email,
  };

  const emailPayslip = useMutation({
    mutationFn: async (recipient: string) => {
      const pdf_base64 = await generatePdfBase64FromElement(documentRef.current);
      return apiJson(`/api/attendance/payroll/admin/payslips/${slip.id}/email`, jsonInit("POST", {
        to: recipient,
        pdf_base64,
      }));
    },
    onSuccess: () => {
      setEmailOpen(false);
      setEmailNotice(`Payslip emailed to ${emailTo.trim()}.`);
    },
  });

  async function downloadPayslip() {
    setDownloadError("");
    setIsDownloading(true);
    try {
      const dataUri = await generatePdfBase64FromElement(documentRef.current);
      const encoded = dataUri.slice(dataUri.indexOf(",") + 1);
      const binary = window.atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const file = new Blob([bytes], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(file);
      const safeName = slip.employee_name_snapshot
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "employee";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `payslip-${safeName}-${slip.run.period_start}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not download this payslip.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <Card className="border-slate-200 shadow-sm print:break-inside-avoid">
        <CardHeader className="pb-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Employee payslip</CardTitle>
              <p className="mt-1 text-xs text-slate-500">{slip.employee_name_snapshot} · {dateLabel(slip.run.period_start)} – {dateLabel(slip.run.period_end)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={isDownloading} onClick={downloadPayslip} data-testid={`download-payslip-${slip.id}`}>
                {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download PDF
              </Button>
              {canEmail && isFinalized && <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  emailPayslip.reset();
                  setEmailNotice("");
                  setEmailTo(slip.employee_email ?? "");
                  setEmailOpen(true);
                }}
                data-testid={`email-payslip-${slip.id}`}
              >
                <Mail className="mr-2 h-4 w-4" />Email payslip
              </Button>}
            </div>
          </div>
          {(downloadError || emailNotice) && <p role={downloadError ? "alert" : "status"} className={`mt-2 text-xs ${downloadError ? "text-rose-600" : "text-emerald-700"}`}>{downloadError || emailNotice}</p>}
        </CardHeader>
        <CardContent className="pt-0">
          <div ref={documentRef} className="min-w-0">
            <PayslipDocument payslip={slip} branding={branding} />
          </div>
        </CardContent>
      </Card>
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email finalized payslip</DialogTitle>
            <DialogDescription>Review the recipient before sending. The PDF will be attached using the SMTP settings in Invoice Settings.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              emailPayslip.mutate(emailTo.trim());
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`payslip-email-${slip.id}`}>Recipient email</Label>
              <Input
                id={`payslip-email-${slip.id}`}
                type="email"
                required
                maxLength={320}
                value={emailTo}
                onChange={(event) => setEmailTo(event.target.value)}
                placeholder="employee@example.com"
                autoComplete="email"
                data-testid={`payslip-recipient-${slip.id}`}
              />
            </div>
            {emailPayslip.error && <p role="alert" className="text-sm text-rose-600">{emailPayslip.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmailOpen(false)} disabled={emailPayslip.isPending}>Cancel</Button>
              <Button type="submit" disabled={emailPayslip.isPending || !emailTo.trim()}>
                {emailPayslip.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send payslip
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 tabular-nums ${strong ? "text-lg font-bold text-slate-900" : "font-semibold text-slate-700"}`}>{value}</p></div>;
}

function ScheduleEditor({ group, onSaved, readOnly = false }: { group: any; onSaved: () => void; readOnly?: boolean }) {
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
        <div><Label>Pay cadence</Label><select disabled={readOnly} className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500" value={cadence} onChange={event => setCadence(event.target.value)}><option value="biweekly_friday">Every 2 weeks on Friday</option><option value="semimonthly_15_30">Twice monthly (configured dates)</option></select></div>
        {cadence === "biweekly_friday"
          ? <div><Label>First payday / 14-day anchor</Label><Input disabled={readOnly} className="mt-1.5" type="date" value={anchor} onChange={event => setAnchor(event.target.value)} /></div>
          : <div className="grid grid-cols-2 gap-2"><div><Label>First payday</Label><Input disabled={readOnly} className="mt-1.5" type="number" min="1" max="31" value={firstDay} onChange={event => setFirstDay(event.target.value)} /></div><div><Label>Second payday</Label><Input disabled={readOnly} className="mt-1.5" type="number" min="1" max="31" value={secondDay} onChange={event => setSecondDay(event.target.value)} /></div></div>}
        <div><Label>Payroll timezone</Label><Input disabled={readOnly} className="mt-1.5" value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="America/New_York" /></div>
        {!readOnly && <div className="flex items-end"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}Save schedule</Button></div>}
      </div>
      {cadence === "semimonthly_15_30" && <p className="mt-2 text-xs text-slate-500">Enter the actual pay date for each run. For February or a short month, choose the payday explicitly when creating the run.</p>}
      {!readOnly && save.error && <p role="alert" className="mt-2 text-sm text-rose-600">{save.error.message}</p>}
    </div>
  );
}

function EmployeePayEditor({ employee, onRefresh, readOnly = false }: { employee: any; onRefresh: () => void; readOnly?: boolean }) {
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
        <div><Label>Hourly rate</Label><Input disabled={readOnly} className="mt-1" type="number" min="0.01" step="0.01" value={hourlyRate} onChange={event => setHourlyRate(event.target.value)} /></div>
        <div><Label>Currency (ISO)</Label><Input disabled={readOnly} className="mt-1 uppercase" maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} /></div>
        <div><Label>Overtime multiplier</Label><Input disabled={readOnly} className="mt-1" type="number" min="0.1" max="10" step="0.05" value={overtimeMultiplier} onChange={event => setOvertimeMultiplier(event.target.value)} /></div>
        <div><Label>Holiday/rest multiplier</Label><Input disabled={readOnly} className="mt-1" type="number" min="0.1" max="10" step="0.05" value={holidayMultiplier} onChange={event => setHolidayMultiplier(event.target.value)} /></div>
      </div>
      {!readOnly && <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>{saveProfile.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Save pay profile</Button>
        {saveProfile.error && <span role="alert" className="text-xs text-rose-600">{saveProfile.error.message}</span>}
      </div>}
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Recurring pay items · applied once per run</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(employee.payItems ?? []).map((item: any) => <div key={item.id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${item.is_active ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-100 text-slate-400"}`}>
            <span className="capitalize">{item.item_type}</span><span>{item.label}</span><span className="font-semibold tabular-nums">{formatMoney(item.amount, currency)}</span>
            {!readOnly && <button type="button" className="font-medium text-indigo-600 hover:underline" disabled={updateItem.isPending} onClick={() => updateItem.mutate({ id: item.id, is_active: !item.is_active })}>{item.is_active ? "Pause" : "Resume"}</button>}
          </div>)}
          {!employee.payItems?.length && <span className="text-xs text-slate-400">None</span>}
        </div>
        {!readOnly && <form className="mt-3 grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)_140px_auto]" onSubmit={event => { event.preventDefault(); addItem.mutate(); }}>
          <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={itemType} onChange={event => setItemType(event.target.value)}><option value="allowance">Allowance</option><option value="deduction">Deduction</option></select>
          <Input aria-label="Pay item label" placeholder="Item name" maxLength={100} required value={itemLabel} onChange={event => setItemLabel(event.target.value)} />
          <Input aria-label="Pay item amount" placeholder="Amount" type="number" min="0.01" step="0.01" required value={itemAmount} onChange={event => setItemAmount(event.target.value)} />
          <Button size="sm" type="submit" variant="outline" disabled={!profile || addItem.isPending}>{addItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add item"}</Button>
        </form>}
        {!readOnly && addItem.error && <p role="alert" className="mt-2 text-xs text-rose-600">{addItem.error.message}</p>}
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
        <div><p className="font-semibold text-slate-900">{dateLabel(shift.work_date)}</p><p className="mt-1 text-sm text-slate-500">{shift.eligible_overtime_hours} eligible hours after 8 counted work hours and the scheduled end (6:00 PM, shifted for a late start).</p></div>
        <Badge variant="outline">{Math.floor(Number(shift.worked_seconds) / 3600)}h {String(Math.floor((Number(shift.worked_seconds) % 3600) / 60)).padStart(2, "0")}m counted</Badge>
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
  return <PayrollPage mode="employee" />;
}

export function PayrollManagementPage() {
  return <PayrollPage mode="management" />;
}

function PayrollPage({ mode }: { mode: "employee" | "management" }) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const isEmployeePage = mode === "employee";
  const canViewPayroll = mode === "management" && hasPermission("payroll", "view");
  const canManage = mode === "management" && hasPermission("payroll", "manage");
  const canReviewOvertime = mode === "management" && hasPermission("payroll", "approve_overtime");
  const canReviewAttendance = mode === "management"
    && hasPermission("attendance", "view_logs")
    && hasPermission("attendance", "view_all")
    && hasPermission("attendance", "approve");
  const canCorrectAttendance = mode === "management"
    && hasPermission("attendance", "view_logs")
    && hasPermission("attendance", "view_all")
    && hasPermission("attendance", "manage");
  const [roleId, setRoleId] = useState("");
  const [runRoleId, setRunRoleId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payday, setPayday] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [reviewError, setReviewError] = useState("");
  const me = useQuery({ queryKey: ["attendance-payroll-me"], queryFn: () => apiJson("/api/attendance/payroll/me"), enabled: isEmployeePage });
  const eligible = useQuery({ queryKey: ["attendance-overtime-eligible"], queryFn: () => apiJson("/api/attendance/payroll/overtime/eligible"), enabled: isEmployeePage });
  const claims = useQuery({ queryKey: ["attendance-overtime-mine"], queryFn: () => apiJson("/api/attendance/payroll/overtime/mine"), enabled: isEmployeePage });
  const config = useQuery({ queryKey: ["attendance-payroll-config"], queryFn: () => apiJson("/api/attendance/payroll/admin/config"), enabled: canViewPayroll });
  const invoiceRenderSettings = useQuery({
    queryKey: ["invoice-render-settings"],
    queryFn: () => apiJson("/api/invoice/render-settings"),
    enabled: isEmployeePage || canViewPayroll,
  });
  const employees = useQuery({
    queryKey: ["attendance-payroll-employees", roleId],
    queryFn: () => apiJson(`/api/attendance/payroll/admin/employees?roleId=${encodeURIComponent(roleId)}`),
    enabled: canViewPayroll && !!roleId,
  });
  const runs = useQuery({ queryKey: ["attendance-payroll-runs"], queryFn: () => apiJson("/api/attendance/payroll/admin/runs"), enabled: canViewPayroll });
  const runDetails = useQuery({
    queryKey: ["attendance-payroll-run", selectedRunId],
    queryFn: () => apiJson(`/api/attendance/payroll/admin/runs/${selectedRunId}`),
    enabled: canViewPayroll && selectedRunId != null,
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
  const finalizeError = finalizeRun.error as PayrollApiError | null;
  const openAttendanceSessions = finalizeError?.code === "active_attendance_sessions"
    ? finalizeError.openAttendanceSessions ?? []
    : [];
  const createError = createRun.error as PayrollApiError | null;
  const createReviewSessions = createError?.code === "attendance_needs_review"
    ? createError.attendanceReviewSessions ?? []
    : [];
  const rebuildError = rebuildRun.error as PayrollApiError | null;
  const rebuildReviewSessions = rebuildError?.code === "attendance_needs_review"
    ? rebuildError.attendanceReviewSessions ?? []
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Banknote className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-bold text-slate-900">{isEmployeePage ? "My Pay & Overtime" : "Payroll Management"}</h1><p className="text-sm text-slate-500">{isEmployeePage ? "View your pay information and submit overtime claims." : canManage ? "Manage employee pay, schedules, payroll runs, and overtime reviews." : canViewPayroll ? "View employee pay, schedules, payroll runs, and overtime reviews." : "Review employee overtime claims."}</p></div>
        </div>
        <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {isEmployeePage && (me.error || eligible.error || claims.error) && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{me.error?.message || eligible.error?.message || claims.error?.message}</p>}

      {isEmployeePage && <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4 text-emerald-700" />Your pay profile</CardTitle></CardHeader>
          <CardContent>
            {me.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : me.data?.profile
              ? <div className="grid grid-cols-2 gap-3">
                <SummaryMetric label="Hourly rate" value={`${formatMoney(me.data.profile.hourly_rate, me.data.profile.currency)} / hr`} />
                <SummaryMetric label="Currency" value={me.data.profile.currency} />
                <p className="col-span-2 text-xs leading-5 text-slate-500">Regular hours are calculated per workday from 9:00 AM, excluding recorded breaks and early punches, and capped at 8 hours per day. Overtime starts only after 8 counted work hours and the scheduled end (6:00 PM, shifted for a late start); approved overtime is paid through payroll.</p>
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
      </section>}

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
              <div><p className="font-semibold text-slate-900">{row.employee_name || row.employee_username} · {dateLabel(row.work_date)}</p><p className="mt-1 text-sm text-slate-600">{request.requested_hours}h requested of {Number(row.eligible_overtime_hours ?? 0).toFixed(2)}h schedule-eligible overtime · {request.overtime_type === "holiday_rest" ? "Holiday/rest day" : "Regular"}</p>{request.employee_note && <p className="mt-1 text-xs text-slate-500">{request.employee_note}</p>}</div>
              <div className="flex shrink-0 gap-2"><Button size="sm" disabled={decideOvertime.isPending} onClick={() => reviewClaim(request, "approved")}><Check className="mr-1 h-4 w-4" />Approve / adjust</Button><Button size="sm" variant="outline" disabled={decideOvertime.isPending} onClick={() => reviewClaim(request, "rejected")}><X className="mr-1 h-4 w-4" />Reject</Button></div>
            </div>;
          })}
        </CardContent>
      </Card>}

      {isEmployeePage && <section className="space-y-3">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /><h2 className="font-semibold text-slate-900">Your finalized payslips</h2></div>
        {me.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
        {!me.isLoading && !ownPayslips.length && <EmptyState>Finalized payslips will appear here.</EmptyState>}
        <div className="grid gap-3 lg:grid-cols-2">{ownPayslips.map((slip: any) => <PayStatement
          key={slip.id}
          slip={slip}
          company={invoiceRenderSettings.data}
        />)}</div>
      </section>}

      {mode === "management" && canViewPayroll && <div className="space-y-5 border-t border-slate-200 pt-5">
        <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-slate-600" /><h2 className="text-lg font-bold text-slate-900">Payroll management</h2></div>
        {config.error && <p role="alert" className="text-sm text-rose-600">{config.error.message}</p>}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Existing user-group schedules</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {config.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {(config.data?.groups ?? []).map((group: any) => <ScheduleEditor key={group.id} group={group} onSaved={refresh} readOnly={!canManage} />)}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Employee rates and recurring items</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-sm"><Label>Existing user group</Label><select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={roleId} onChange={event => setRoleId(event.target.value)}><option value="">Choose a group</option>{(config.data?.groups ?? []).map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
            {employees.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {employees.error && <p role="alert" className="text-sm text-rose-600">{employees.error.message}</p>}
            {roleId && !employees.isLoading && !employees.data?.employees?.length && <EmptyState>No employees are assigned to this group.</EmptyState>}
            <div className="space-y-3">{(employees.data?.employees ?? []).map((employee: any) => <EmployeePayEditor key={employee.id} employee={employee} onRefresh={refresh} readOnly={!canManage} />)}</div>
          </CardContent>
        </Card>

        {canManage && <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Create a payroll run</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-4" onSubmit={event => { event.preventDefault(); createRun.mutate(); }}>
              <div className="md:col-span-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">The run uses completed Attendance session totals, approved overtime, approved weekday leave, and recurring pay items. Attendance sessions are included automatically unless they are flagged as Needs Review. Net pay is calculated after deductions. Employee currencies remain separate; no conversion is performed. Enter the payday explicitly for short months.</div>
              <div><Label>User group</Label><select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" required value={runRoleId} onChange={event => setRunRoleId(event.target.value)}><option value="">Choose a group</option>{(config.data?.groups ?? []).map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
              <div><Label>Period start</Label><Input className="mt-1.5" type="date" required value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></div>
              <div><Label>Period end</Label><Input className="mt-1.5" type="date" min={periodStart || undefined} required value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></div>
              <div><Label>Payday</Label><Input className="mt-1.5" type="date" required value={payday} onChange={event => setPayday(event.target.value)} /></div>
              <div className="md:col-span-4 flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={createRun.isPending}>{createRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleDollarSign className="mr-2 h-4 w-4" />}Build draft payroll</Button>
                {createRun.error && !createReviewSessions.length && <span role="alert" className="text-sm text-rose-600">{createRun.error.message}</span>}
              </div>
              {createReviewSessions.length > 0 && <div className="md:col-span-4"><AttendanceReviewBlockerList sessions={createReviewSessions} canReviewAttendance={canReviewAttendance} /></div>}
            </form>
          </CardContent>
        </Card>}

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
              {canManage && runDetails.data?.run?.status === "draft" && <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={rebuildRun.isPending || finalizeRun.isPending} onClick={() => { finalizeRun.reset(); rebuildRun.mutate(selectedRunId); }}>{rebuildRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Rebuild draft</Button>
                <Button size="sm" disabled={finalizeRun.isPending || rebuildRun.isPending} onClick={() => finalizeRun.mutate(selectedRunId)}>{finalizeRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Finalize and lock</Button>
              </div>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(runDetails.error || (rebuildRun.error && !rebuildReviewSessions.length) || (finalizeRun.error && !openAttendanceSessions.length)) && <p role="alert" className="text-sm text-rose-600">{runDetails.error?.message || rebuildRun.error?.message || finalizeRun.error?.message}</p>}
            {rebuildReviewSessions.length > 0 && <AttendanceReviewBlockerList sessions={rebuildReviewSessions} canReviewAttendance={canReviewAttendance} />}
            {openAttendanceSessions.length > 0 && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div>
                <p className="font-semibold text-amber-950">Open attendance shifts block payroll finalization</p>
                <p className="mt-1 text-sm text-amber-900">Verify each shift with the employee, then enter the confirmed attendance times before finalizing.</p>
              </div></div>
              <ul className="mt-3 space-y-2">
                {openAttendanceSessions.map(session => <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{session.employee_name || session.employee_username || "Employee"} · {dateLabel(session.work_date)}</p>
                    <p className="mt-0.5 text-xs text-slate-600">Session {session.session_number ?? 1} · {session.status === "on_break" ? "On break" : "Still clocked in"}</p>
                  </div>
                  {canCorrectAttendance
                    ? <a href={`/attendance/logs?record=${session.id}`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">Open attendance record</a>
                    : <p className="text-xs text-slate-500">Ask an Attendance manager with log access to correct this shift.</p>}
                </li>)}
              </ul>
            </div>}
            {runDetails.isLoading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {!runDetails.isLoading && !runSlips.length && <EmptyState>This run has no payslips.</EmptyState>}
            <div className="grid gap-3 lg:grid-cols-2">{runSlips.map((slip: any) => <PayStatement
              key={slip.id}
              slip={{ ...slip, run: runDetails.data.run }}
              canEmail={canManage}
              company={invoiceRenderSettings.data}
            />)}</div>
          </CardContent>
        </Card>}
      </div>}
      {mode === "management" && canViewPayroll && !config.isLoading && config.data?.groups?.length === 0 && <p className="text-sm text-slate-500">Create or assign the existing user groups in Admin before setting payroll schedules.</p>}
    </div>
  );
}