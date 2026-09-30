import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Clock3, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAuthHeaders } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";

function apiJson(path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) } }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Leave request failed");
    return body;
  });
}

const leaveTypes = [
  { value: "pto", label: "PTO" },
  { value: "sick", label: "Sick leave" },
  { value: "vacation", label: "Vacation" },
  { value: "unpaid", label: "Unpaid leave" },
];

function readableDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const style = status === "approved"
    ? "bg-emerald-100 text-emerald-700"
    : status === "rejected"
      ? "bg-rose-100 text-rose-700"
      : "bg-amber-100 text-amber-800";
  return <Badge className={`${style} border-0 capitalize`}>{status}</Badge>;
}

export default function AttendanceLeavePage() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canReview = hasPermission("attendance", "approve_leave") && hasPermission("attendance", "view_all");
  const [form, setForm] = useState({
    leave_type: "pto",
    start_date: "",
    end_date: "",
    daily_hours: "8",
    employee_note: "",
  });
  const [decisionError, setDecisionError] = useState("");
  const mine = useQuery({
    queryKey: ["attendance-leave-mine"],
    queryFn: () => apiJson("/api/attendance/leave/mine"),
  });
  const pending = useQuery({
    queryKey: ["attendance-leave-pending"],
    queryFn: () => apiJson("/api/attendance/leave/pending"),
    enabled: canReview,
  });
  const submit = useMutation({
    mutationFn: () => apiJson("/api/attendance/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, daily_hours: Number(form.daily_hours) }),
    }),
    onSuccess: async () => {
      setForm({ leave_type: "pto", start_date: "", end_date: "", daily_hours: "8", employee_note: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attendance-leave-mine"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-leave-pending"] }),
      ]);
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, status, manager_note }: { id: number; status: "approved" | "rejected"; manager_note: string }) =>
      apiJson(`/api/attendance/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, manager_note }),
      }),
    onSuccess: async () => {
      setDecisionError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attendance-leave-mine"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-leave-pending"] }),
      ]);
    },
    onError: error => setDecisionError(error.message),
  });

  function decideRequest(id: number, status: "approved" | "rejected") {
    const manager_note = window.prompt(status === "approved" ? "Optional approval note" : "Reason for rejecting this request") ?? "";
    if (status === "rejected" && !manager_note.trim()) return;
    decide.mutate({ id, status, manager_note });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><CalendarDays className="h-5 w-5" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Leave</h1>
          <p className="text-sm text-slate-500">Request time off and track manager decisions.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Request leave</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); submit.mutate(); }}>
              <div>
                <Label htmlFor="leave-type">Leave type</Label>
                <select id="leave-type" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.leave_type} onChange={event => setForm(value => ({ ...value, leave_type: event.target.value }))}>
                  {leaveTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="leave-start">From</Label><Input id="leave-start" className="mt-1.5" type="date" required value={form.start_date} onChange={event => setForm(value => ({ ...value, start_date: event.target.value }))} /></div>
                <div><Label htmlFor="leave-end">Through</Label><Input id="leave-end" className="mt-1.5" type="date" required min={form.start_date || undefined} value={form.end_date} onChange={event => setForm(value => ({ ...value, end_date: event.target.value }))} /></div>
              </div>
              <div><Label htmlFor="leave-hours">Hours per weekday</Label><Input id="leave-hours" className="mt-1.5" type="number" min="0.25" max="8" step="0.25" required value={form.daily_hours} onChange={event => setForm(value => ({ ...value, daily_hours: event.target.value }))} /></div>
              <div><Label htmlFor="leave-note">Note for your manager</Label><Textarea id="leave-note" className="mt-1.5 min-h-20" maxLength={1000} value={form.employee_note} onChange={event => setForm(value => ({ ...value, employee_note: event.target.value }))} /></div>
              {submit.error && <p role="alert" className="text-sm text-rose-600">{submit.error.message}</p>}
              <Button type="submit" disabled={submit.isPending} className="w-full">{submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}Submit request</Button>
              <p className="text-xs leading-5 text-slate-500">Leave hours are paid according to your pay profile unless the request is marked unpaid. Only weekdays are included in payroll totals.</p>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Your requests</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {mine.isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading requests…</div>}
            {mine.error && <p role="alert" className="text-sm text-rose-600">{mine.error.message}</p>}
            {!mine.isLoading && !mine.data?.rows?.length && <p className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">No leave requests yet.</p>}
            {(mine.data?.rows ?? []).map((request: any) => (
              <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold capitalize text-slate-900">{request.leave_type.replace(/_/g, " ")} · {request.daily_hours}h/day</p>
                    <p className="mt-1 text-sm text-slate-600">{readableDate(request.start_date)} – {readableDate(request.end_date)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                {request.employee_note && <p className="mt-2 text-sm text-slate-600">{request.employee_note}</p>}
                {request.manager_note && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600"><span className="font-medium">Manager note:</span> {request.manager_note}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {canReview && <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-indigo-600" />Manager review queue</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {decisionError && <p role="alert" className="text-sm text-rose-600">{decisionError}</p>}
          {pending.isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading requests…</div>}
          {pending.error && <p role="alert" className="text-sm text-rose-600">{pending.error.message}</p>}
          {!pending.isLoading && !pending.data?.rows?.length && <p className="text-sm text-slate-500">No requests are waiting for review.</p>}
          {(pending.data?.rows ?? []).map((row: any) => {
            const request = row.request;
            return <div key={request.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{row.employee_name || row.employee_username} · <span className="capitalize">{request.leave_type}</span></p>
                <p className="mt-1 text-sm text-slate-600">{readableDate(request.start_date)} – {readableDate(request.end_date)} · {request.daily_hours}h/weekday</p>
                {request.employee_note && <p className="mt-1 text-sm text-slate-500">{request.employee_note}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={decide.isPending} onClick={() => decideRequest(request.id, "approved")}><Check className="mr-1.5 h-4 w-4" />Approve</Button>
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decideRequest(request.id, "rejected")}><X className="mr-1.5 h-4 w-4" />Reject</Button>
              </div>
            </div>;
          })}
        </CardContent>
      </Card>}
    </div>
  );
}