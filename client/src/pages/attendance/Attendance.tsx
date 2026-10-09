import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertCircle, ArrowLeft, Car, Check, CheckCircle2, ChevronRight, Clock3,
  Coffee, Home, Info, Loader2, MapPin, Navigation, Play, Save, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { getAuthHeaders } from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { usePermissions } from "@/hooks/usePermissions";

type Coordinates = { latitude: number; longitude: number; accuracy?: number };
type StartMethod = "warehouse" | "driving" | "offsite";
type StartAttendanceInput = { method: StartMethod; coordinates: Coordinates | null };

function apiJson(path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) } }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? body.message ?? "Attendance request failed");
    return body;
  });
}

function captureLocation(): Promise<Coordinates | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

function formatDuration(totalSeconds: number | null | undefined) {
  const seconds = Math.max(0, Number(totalSeconds ?? 0));
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
}

const emptyDailyReport = {
  workday_type: "regular_workday",
  work_completed: "",
  customer_interactions: "",
  challenges: "",
  follow_up: "",
  note: "",
};

type BreakInterval = {
  break_started_at: string;
  break_ended_at: string | null;
  duration_seconds: number | null;
};

type TimelineSegment = { kind: "work" | "break"; start: number; end: number };
const NINE_HOURS_SECONDS = 9 * 60 * 60;

function getTimelineSegments(session: any, nowMs: number): TimelineSegment[] {
  if (!session?.time_in) return [];
  const start = new Date(session.time_in).getTime();
  const end = Math.max(start, session.time_out ? new Date(session.time_out).getTime() : nowMs);
  const breaks = (session.breaks ?? [])
    .map((item: BreakInterval) => ({
      start: new Date(item.break_started_at).getTime(),
      end: item.break_ended_at ? new Date(item.break_ended_at).getTime() : end,
    }))
    .filter((item: { start: number; end: number }) => Number.isFinite(item.start) && item.start < end)
    .sort((a: { start: number }, b: { start: number }) => a.start - b.start);
  const segments: TimelineSegment[] = [];
  let cursor = start;
  for (const breakItem of breaks) {
    const breakStart = Math.max(start, breakItem.start);
    const breakEnd = Math.min(end, Math.max(breakStart, breakItem.end));
    if (breakStart > cursor) segments.push({ kind: "work", start: cursor, end: breakStart });
    if (breakEnd > breakStart) segments.push({ kind: "break", start: breakStart, end: breakEnd });
    cursor = Math.max(cursor, breakEnd);
  }
  if (cursor < end) segments.push({ kind: "work", start: cursor, end });
  return segments;
}

function timelineSeconds(segments: TimelineSegment[], kind?: TimelineSegment["kind"]) {
  return segments
    .filter(segment => !kind || segment.kind === kind)
    .reduce((total, segment) => total + Math.max(0, Math.floor((segment.end - segment.start) / 1000)), 0);
}

function AttendanceTimeline({ session, now }: { session: any; now: number }) {
  const segments = getTimelineSegments(session, now);
  const elapsedSeconds = timelineSeconds(segments);
  const workedSeconds = timelineSeconds(segments, "work");
  const breakSeconds = timelineSeconds(segments, "break");
  if (!segments.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-slate-500">Timeline</span>
        <span className="text-slate-400">{formatDuration(elapsedSeconds)}</span>
      </div>
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-label="Work and break elapsed timeline">
        {segments.map((segment, index) => (
          <span
            key={`${segment.kind}-${segment.start}-${index}`}
            className={segment.kind === "break" ? "bg-slate-400" : "bg-red-600"}
            style={{ width: `${Math.max(0, ((segment.end - segment.start) / 1000 / NINE_HOURS_SECONDS) * 100)}%` }}
            title={`${segment.kind === "break" ? "Break" : "Work"} · ${formatDuration((segment.end - segment.start) / 1000)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />Work {formatDuration(workedSeconds)}</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />Break {formatDuration(breakSeconds)}</span>
      </div>
    </div>
  );
}

function StartChoice({ icon, title, subtitle, onClick, disabled }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-red-300 hover:bg-red-50/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 group-hover:bg-red-100">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-1 block text-xs text-slate-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-red-500" />
    </button>
  );
}

function AttendanceHeader({ onHistory }: { onHistory?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-red-600" />
        <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
      </div>
      {onHistory && <Button variant="ghost" size="sm" className="text-xs text-slate-500" onClick={onHistory}>History</Button>}
    </div>
  );
}

function EndDayDialog({ onCancel, onConfirm, saving }: { onCancel: () => void; onConfirm: () => void; saving: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-5">
      <Card className="w-full max-w-sm rounded-3xl border-0 shadow-2xl">
        <CardContent className="p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-700"><X className="h-8 w-8" /></div>
          <h2 className="mt-5 text-lg font-bold text-slate-900">End your day?</h2>
          <p className="mt-2 text-sm text-slate-500">This will record your time out.</p>
          <div className="mt-6 space-y-2">
            <Button className="h-11 w-full bg-red-600 hover:bg-red-700" onClick={onConfirm} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}End Day
            </Button>
            <Button variant="outline" className="h-11 w-full border-red-300 text-red-600 hover:bg-red-50" onClick={onCancel}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryList({ rows, fmt }: { rows: any[]; fmt: ReturnType<typeof useTimeService> }) {
  const groupedRows = Array.from(
    rows.reduce<Map<string, any[]>>((groups, row: any) => {
      const date = row.work_date;
      const sessions = groups.get(date) ?? [];
      sessions.push(row);
      groups.set(date, sessions);
      return groups;
    }, new Map<string, any[]>()).entries(),
  ).map(([date, sessions]: [string, any[]]) => ({ date, sessions }));

  return (
    <div className="space-y-3">
      {groupedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No attendance history yet.</div>
      ) : groupedRows.map(({ date, sessions }) => {
        const hasActiveSession = sessions.some(session => session.status === "active");
        const status = hasActiveSession
          ? "active"
          : sessions.every(session => session.status === "completed")
            ? "completed"
            : sessions[0]?.status;
        const totalSeconds = sessions.reduce(
          (total, session) => total + Math.max(0, Number(session.total_seconds) || 0),
          0,
        );
        const dailyNote = sessions.find(session => session.daily_note)?.daily_note;
        const dailyReport = sessions.find(session => session.daily_report)?.daily_report;

        return (
          <div key={date} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{date}</p>
                {sessions.length > 1 && <p className="mt-1 text-xs text-slate-500">{sessions.length} attendance sessions</p>}
              </div>
              <Badge className={status === "completed" ? "border-0 bg-emerald-100 text-emerald-700" : "border-0 bg-red-100 text-red-700"}>{status}</Badge>
            </div>

            {sessions.length === 1 ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="block text-slate-400">Time in</span><span className="font-medium text-slate-700">{sessions[0].time_in ? fmt.dateTime(sessions[0].time_in) : "—"}</span></div>
                  <div><span className="block text-slate-400">Time out</span><span className="font-medium text-slate-700">{sessions[0].time_out ? fmt.dateTime(sessions[0].time_out) : "—"}</span></div>
                  <div><span className="block text-slate-400">Total</span><span className="font-medium text-slate-700">{formatDuration(sessions[0].total_seconds)}</span></div>
                </div>
                <p className="mt-2 text-xs text-slate-500">Start method · {sessions[0].start_method === "warehouse" ? "Warehouse" : sessions[0].start_method === "offsite" ? "Off-site" : "Route start"}</p>
                {sessions[0].breaks?.length > 0 && <div className="mt-3 border-t border-slate-100 pt-3 text-xs"><p className="text-slate-400">Breaks</p>{sessions[0].breaks.map((breakItem: BreakInterval, index: number) => <p key={`${breakItem.break_started_at}-${index}`} className="mt-1 font-medium text-slate-600">{fmt.dateTime(breakItem.break_started_at)} → {breakItem.break_ended_at ? fmt.dateTime(breakItem.break_ended_at) : "In progress"}</p>)}</div>}
              </>
            ) : (
              <>
                <div className="mt-3 space-y-2">
                  {sessions.map((session, index) => (
                    <div key={session.id} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700">Session {session.session_number ?? index + 1}</p>
                        <span className="text-xs font-medium text-slate-700">{formatDuration(session.total_seconds)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{session.start_method === "warehouse" ? "Started at warehouse" : session.start_method === "offsite" ? "Started off-site" : "Started while driving"}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div><span className="block text-slate-400">Time in</span><span className="font-medium text-slate-700">{session.time_in ? fmt.dateTime(session.time_in) : "—"}</span></div>
                        <div><span className="block text-slate-400">Time out</span><span className="font-medium text-slate-700">{session.time_out ? fmt.dateTime(session.time_out) : "—"}</span></div>
                      </div>
                      {session.breaks?.length > 0 && <div className="mt-2 border-t border-slate-100 pt-2 text-[11px]"><p className="text-slate-400">Breaks</p>{session.breaks.map((breakItem: BreakInterval, breakIndex: number) => <p key={`${breakItem.break_started_at}-${breakIndex}`} className="mt-1 text-slate-600">{fmt.dateTime(breakItem.break_started_at)} → {breakItem.break_ended_at ? fmt.dateTime(breakItem.break_ended_at) : "In progress"}</p>)}</div>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-400">Total worked</span>
                  <span className="font-semibold text-slate-700">{formatDuration(totalSeconds)}</span>
                </div>
              </>
            )}
            {dailyNote && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-600"><p className="font-semibold text-blue-800">Daily note</p><p className="mt-1 whitespace-pre-wrap">{dailyNote}</p></div>}
            {dailyReport && (dailyReport.workday_type === "other" || dailyReport.work_completed || dailyReport.customer_interactions || dailyReport.challenges || dailyReport.follow_up) && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">{dailyReport.workday_type === "other" ? "Other workday" : "Regular workday"} report</p>
                {[
                  ["Work completed", dailyReport.work_completed],
                  ["Customer interactions", dailyReport.customer_interactions],
                  ["Challenges or blockers", dailyReport.challenges],
                  ["Follow-up", dailyReport.follow_up],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <p key={label} className="mt-2 whitespace-pre-wrap"><span className="font-medium text-slate-700">{label}: </span>{value}</p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AttendancePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useStore(s => s.currentUser);
  const { hasPermission } = usePermissions();
  const canStartOffsite = hasPermission("attendance", "clock_offsite");
  const fmt = useTimeService();
  const [flow, setFlow] = useState<"start" | "validating" | "ready" | "blocked" | "ending">("start");
  const [validationMessage, setValidationMessage] = useState("");
  const [validationMethod, setValidationMethod] = useState<StartMethod | null>(null);
  const [locationForStart, setLocationForStart] = useState<Coordinates | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const [settingHome, setSettingHome] = useState(false);
  const [dailyReportDraft, setDailyReportDraft] = useState(emptyDailyReport);
  const [dailyReportDirty, setDailyReportDirty] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "today", currentUser?.id],
    queryFn: () => apiJson("/api/attendance/today"),
    enabled: !!currentUser,
    refetchInterval: 60_000,
  });
  const active = data?.active ?? null;
  const history = data?.history ?? [];
  const todaySessions: any[] = data?.todaySessions ?? [];
  const todayTotalSeconds = Number(data?.todayTotalSeconds ?? 0);
  const todayAsOf = data?.todayAsOf ? new Date(data.todayAsOf).getTime() : 0;
  const liveTodayTotalSeconds = active?.status === "active" && todayAsOf
    ? todayTotalSeconds + Math.max(0, Math.floor((now - todayAsOf) / 1000))
    : todayTotalSeconds;

  useEffect(() => {
    if (data?.dailyNote !== undefined && !dailyReportDirty) {
      setDailyReportDraft({
        ...emptyDailyReport,
        ...(data.dailyReport ?? {}),
        note: data.dailyReport?.note ?? data.dailyNote ?? "",
      });
    }
  }, [data?.dailyNote, data?.dailyReport, dailyReportDirty]);

  const todosQuery = useQuery({
    queryKey: ["attendance", "todos", currentUser?.id],
    queryFn: () => apiJson("/api/crm/todos?status=pending"),
    enabled: !!active,
    staleTime: 30_000,
  });
  const todos: any[] = (todosQuery.data ?? []).slice(0, 5);
  const homeLocationQuery = useQuery({
    queryKey: ["attendance", "home-location", currentUser?.id],
    queryFn: () => apiJson("/api/attendance/home-location"),
    enabled: !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const homeConfigured = homeLocationQuery.data?.configured === true;

  useEffect(() => {
    if (!active || active.status !== "active" || active.start_method === "offsite") return;
    const interval = window.setInterval(async () => {
      const coords = await captureLocation();
      apiJson("/api/attendance/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords ?? {}),
      }).catch(() => {});
    }, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [active?.id, active?.start_method, active?.status]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const startWarehouse = async () => {
    setError("");
    setValidationMethod("warehouse");
    setFlow("validating");
    const coords = await captureLocation();
    setLocationForStart(coords);
    try {
      const result = await apiJson("/api/attendance/validate-warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords ?? {}),
      });
      if (!result.valid) throw new Error(result.message);
      setValidationMessage(result.message);
      startMutation.mutate({ method: "warehouse", coordinates: coords });
    } catch (e: any) {
      setValidationMessage(e.message);
      setFlow("blocked");
    }
  };

  const startDriving = async () => {
    setError("");
    setValidationMethod("driving");
    setFlow("validating");
    const coords = await captureLocation();
    setLocationForStart(coords);
    try {
      const result = await apiJson("/api/attendance/validate-route-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords ?? {}),
      });
      if (!result.valid) throw new Error(result.message);
      setValidationMessage(result.message);
      startMutation.mutate({ method: "driving", coordinates: coords });
    } catch (e: any) {
      setValidationMessage(e.message);
      setFlow("blocked");
    }
  };

  const startOffsite = () => {
    setError("");
    setValidationMessage("");
    setValidationMethod("offsite");
    setLocationForStart(null);
    startMutation.mutate({ method: "offsite", coordinates: null });
  };

  const setHomeLocation = async () => {
    setError("");
    setSettingHome(true);
    const coords = await captureLocation();
    if (!coords) {
      setError("Your location could not be captured. Allow location access and try again.");
      setSettingHome(false);
      return;
    }
    try {
      await apiJson("/api/attendance/home-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords),
      });
      await homeLocationQuery.refetch();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSettingHome(false);
    }
  };

  const startMutation = useMutation({
    mutationFn: ({ method, coordinates }: StartAttendanceInput) => apiJson("/api/attendance/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_method: method, ...(coordinates ?? {}) }),
    }),
    onSuccess: () => {
      setFlow("start");
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
    },
    onError: (e: any) => {
      setValidationMessage(e.message);
      setFlow("blocked");
    },
  });

  const endMutation = useMutation({
    mutationFn: async () => {
      const coords = active?.start_method === "offsite" ? null : await captureLocation();
      return apiJson("/api/attendance/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords ?? {}),
      });
    },
    onSuccess: () => {
      setFlow("start");
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
    },
    onError: (e: any) => setError(e.message),
  });

  const breakMutation = useMutation({
    mutationFn: (action: "start" | "resume") => apiJson(`/api/attendance/break/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
    },
    onError: (e: any) => setError(e.message),
  });

  const noteMutation = useMutation({
    mutationFn: () => apiJson("/api/attendance/today/note", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dailyReportDraft),
    }),
    onSuccess: (saved: any) => {
      setDailyReportDraft({
        ...emptyDailyReport,
        workday_type: saved.workday_type ?? "regular_workday",
        work_completed: saved.work_completed ?? "",
        customer_interactions: saved.customer_interactions ?? "",
        challenges: saved.challenges ?? "",
        follow_up: saved.follow_up ?? "",
        note: saved.note ?? "",
      });
      setDailyReportDirty(false);
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
    },
    onError: (e: any) => setError(e.message),
  });

  const isOnBreak = active?.status === "on_break";
  const liveBreakSeconds = isOnBreak && active.break_started_at
    ? Math.max(0, Math.floor((now - new Date(active.break_started_at).getTime()) / 1000))
    : 0;
  const liveTimeline = active ? getTimelineSegments(active, now) : [];
  const liveSessionSeconds = timelineSeconds(liveTimeline, "work");
  const activeStatus = isOnBreak ? "On Break" : active?.start_method === "warehouse" ? "On Site" : active?.start_method === "offsite" ? "Off-site" : "On Route";
  const activeSubtitle = isOnBreak
    ? ""
    : active?.start_method === "warehouse" ? "Started at the warehouse" : active?.start_method === "offsite" ? "Started off-site" : "Started while driving to your first stop";
  const todayActivity = useMemo(() => todos.filter(todo => !todo.completed_at), [todos]);

  if (showHistory) {
    return (
      <div className="mx-auto min-h-full max-w-2xl bg-slate-50 px-4 py-5 md:px-6">
        <button type="button" className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-600" onClick={() => setShowHistory(false)}><ArrowLeft className="h-4 w-4" />Attendance</button>
        <h1 className="mb-4 text-xl font-bold text-slate-900">Attendance History</h1>
        <HistoryList rows={history} fmt={fmt} />
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 md:px-6">
      <div className="mx-auto max-w-2xl">
        <AttendanceHeader onHistory={() => setShowHistory(true)} />
        {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {!active && flow === "start" && (
          <div className="mt-8">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-600"><Clock3 className="h-10 w-10" /></div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">{todaySessions.length === 0 ? "Start your day" : data?.canStartSecondSession ? "Start a second session" : "Attendance complete for today"}</h2>
              {todaySessions.length === 0 && <p className="mt-1 text-sm text-slate-500">Where are you starting?</p>}
              {data?.canStartSecondSession && <p className="mt-1 text-sm text-slate-500">Your approved second shift is ready. Where are you starting?</p>}
            </div>
            {(todaySessions.length === 0 || data?.canStartSecondSession) && <div className="mt-8 space-y-3">
              <StartChoice icon={<MapPin className="h-6 w-6" />} title="Warehouse" subtitle="Login when you arrive at the location" onClick={startWarehouse} />
              <StartChoice icon={<Car className="h-6 w-6" />} title="Route start" subtitle={homeConfigured ? "Login when you're on your way" : "Set your home location first"} onClick={startDriving} disabled={!homeConfigured} />
              {canStartOffsite && <StartChoice icon={<Clock3 className="h-6 w-6" />} title="Off-site" subtitle="Start working remotely" onClick={startOffsite} disabled={startMutation.isPending} />}
            </div>}
            {todaySessions.length > 0 && <Card className="mt-5 rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-4">
              <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Worked today</span><span className="text-lg font-bold text-slate-800">{formatDuration(todayTotalSeconds)}</span></div>
             <div className="mt-3 space-y-2">{todaySessions.map((session: any) => <div key={session.id} className="flex items-center justify-between text-xs"><span className="text-slate-500">Session {session.session_number ?? 1} · {session.time_in ? fmt.dateTime(session.time_in) : "—"}{session.time_out ? ` – ${fmt.dateTime(session.time_out)}` : " · Active"}</span><span className="font-medium text-slate-700">{formatDuration(session.total_seconds)}</span></div>)}</div>
            </CardContent></Card>}
            {homeLocationQuery.isError ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-900">Could not verify your saved home location</p>
                    <p className="mt-1 text-xs text-amber-800">Your saved location was not changed. Check your connection and try again.</p>
                    <Button variant="outline" className="mt-3 border-amber-300 bg-white text-amber-800 hover:bg-amber-100" onClick={() => homeLocationQuery.refetch()} disabled={homeLocationQuery.isFetching}>
                      {homeLocationQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Try again
                    </Button>
                  </div>
                </div>
              </div>
            ) : !homeConfigured && (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <Home className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-blue-900">Set your home location once</p>
                    <Button variant="outline" className="mt-3 border-blue-300 bg-white text-blue-700 hover:bg-blue-100" onClick={setHomeLocation} disabled={settingHome}>
                      {settingHome && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {settingHome ? "Saving location..." : "Use current location as home"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!active && flow === "validating" && (
          <div className="mt-12 text-center">
            <div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-red-50 text-red-600">
              <div className="absolute inset-2 animate-ping rounded-full border border-red-200 opacity-70" />
              {validationMethod === "warehouse" ? <MapPin className="relative h-12 w-12" /> : <Car className="relative h-12 w-12" />}
            </div>
            <h2 className="mt-8 text-xl font-bold text-slate-900">{validationMethod === "warehouse" ? "Checking your location..." : "Validating..."}</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">{validationMethod === "driving" ? "Please keep your phone safely stored while driving." : "Please wait a moment."}</p>
          </div>
        )}

        {!active && flow === "ready" && (
          <div className="mt-10 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-12 w-12" /></div>
            <h2 className="mt-6 text-xl font-bold text-slate-900">{validationMessage}</h2>
            <p className="mt-2 text-sm text-slate-500">{validationMethod === "driving" ? "You are outside your saved home area." : "Your location has been verified."}</p>
              <Button className="mt-8 h-12 w-full bg-red-600 hover:bg-red-700" onClick={() => startMutation.mutate({ method: validationMethod ?? "warehouse", coordinates: locationForStart })} disabled={startMutation.isPending}>
              {startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}TIME IN
            </Button>
          </div>
        )}

        {!active && flow === "blocked" && (
          <div className="mt-10 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-50 text-red-600"><X className="h-12 w-12" /></div>
            <h2 className="mt-6 text-xl font-bold text-slate-900">Attendance could not start</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{validationMessage}</p>
            <Button variant="outline" className="mt-8 h-11 w-full border-red-300 text-red-600 hover:bg-red-50" onClick={() => setFlow("start")}>Try Again</Button>
          </div>
        )}

        {active && (
          <div className="mt-5 space-y-4">
            <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                   <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-red-600" /><div><p className="text-sm font-semibold text-slate-800">{activeStatus}</p><p className="text-xs text-slate-500">Since {active.time_in ? fmt.dateTime(active.time_in) : "—"}</p></div></div>
                  <Navigation className="h-5 w-5 text-slate-400" />
                </div>
                <div className="p-4">
                   <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Clock3 className="h-5 w-5 text-slate-500" /><div><p className="text-[11px] uppercase tracking-wide text-slate-400">Time In</p><p className="text-sm font-semibold text-slate-800">{active.time_in ? fmt.dateTime(active.time_in) : "—"}</p>{activeSubtitle && <p className="mt-0.5 text-xs text-slate-500">{activeSubtitle}</p>}</div></div>
                     <div className="mt-3 grid grid-cols-2 gap-3">
                       <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                         <p className="text-[11px] uppercase tracking-wide text-red-500">Worked</p>
                         <p className="mt-1 text-lg font-bold text-red-700">{formatDuration(liveSessionSeconds)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">{isOnBreak ? "Time logged" : "Worked today"}</p><p className="mt-1 text-lg font-bold text-slate-800">{formatDuration(liveTodayTotalSeconds)}</p></div>
                    </div>
                     {isOnBreak && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] uppercase tracking-wide text-amber-600">On break</p><p className="mt-1 text-lg font-bold text-amber-700">{formatDuration(liveBreakSeconds)}</p><p className="text-[11px] text-amber-600">Started {active.break_started_at ? fmt.dateTime(active.break_started_at) : "—"}</p></div>}
                     <AttendanceTimeline session={active} now={now} />
                   <div className="mt-4 grid gap-2 sm:grid-cols-2">
                     <Button variant={isOnBreak ? "default" : "outline"} className={isOnBreak ? "h-11 bg-emerald-600 text-white hover:bg-emerald-700" : "h-11 border-amber-300 text-amber-700 hover:bg-amber-50"} onClick={() => breakMutation.mutate(isOnBreak ? "resume" : "start")} disabled={breakMutation.isPending}>
                       {breakMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isOnBreak ? <Play className="mr-2 h-4 w-4" /> : <Coffee className="mr-2 h-4 w-4" />}
                       {isOnBreak ? "Return to work" : "Start Break"}
                     </Button>
                     <Button variant="outline" className="h-11 border-red-300 text-red-600 hover:bg-red-50" onClick={() => setFlow("ending")}> <X className="mr-2 h-4 w-4" />End Day</Button>
                   </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Today's Activity</h2><Badge className="border-0 bg-red-50 text-red-600">{todayActivity.length}</Badge></div>
                <div className="mt-3 divide-y divide-slate-100">
                  {todayActivity.length === 0 ? <p className="py-5 text-center text-xs text-slate-400">No open To Do activity for today.</p> : todayActivity.map(todo => (
                    <div key={todo.id} className="flex items-center gap-3 py-3">
                      <div className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700">{todo.title}</p><p className="truncate text-xs text-slate-400">{todo.customer_company || `${todo.customer_first_name ?? ""} ${todo.customer_last_name ?? ""}`.trim() || "General To Do"}</p></div>
                      {todo.due_date && <span className="shrink-0 text-xs text-slate-400">{fmt.time(todo.due_date)}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
         <Card className="mt-4 rounded-2xl border-slate-200 shadow-sm">
           <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-sm font-semibold text-slate-800">Daily work report</h2><p className="mt-1 text-xs text-slate-500">Saved for today in the company timezone.</p></div>
                <Button size="sm" className="h-8 shrink-0 bg-red-600 text-xs hover:bg-red-700" onClick={() => noteMutation.mutate()} disabled={noteMutation.isPending || !dailyReportDirty}>
                  {noteMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Save report
                </Button>
              </div>
              {noteMutation.error && <p role="alert" className="mt-3 text-xs text-red-600">{noteMutation.error.message}</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="attendance-workday-type" className="text-xs font-medium text-slate-600">Workday type</label>
                  <select id="attendance-workday-type" value={dailyReportDraft.workday_type} onChange={event => { setDailyReportDraft(current => ({ ...current, workday_type: event.target.value })); setDailyReportDirty(true); }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="regular_workday">Regular Workday</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {[
                  ["work_completed", "What work did you complete today?", "Summarize the main work completed."],
                  ["customer_interactions", "What customer interactions or visits did you have?", "Add customer visits, calls, or important outcomes."],
                  ["challenges", "What challenges or blockers came up?", "Note issues that need attention."],
                  ["follow_up", "What follow-up is needed?", "List next steps or items for the next workday."],
                ].map(([key, label, placeholder]) => (
                  <div key={key} className="min-w-0">
                    <label htmlFor={`attendance-${key}`} className="text-xs font-medium text-slate-600">{label}</label>
                    <Textarea id={`attendance-${key}`} value={dailyReportDraft[key as keyof typeof dailyReportDraft]} onChange={event => { setDailyReportDraft(current => ({ ...current, [key]: event.target.value })); setDailyReportDirty(true); }} maxLength={2000} rows={3} className="mt-1 text-sm" placeholder={placeholder} />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label htmlFor="attendance-daily-note" className="text-xs font-medium text-slate-600">Additional attendance note</label>
                  <Textarea id="attendance-daily-note" value={dailyReportDraft.note} onChange={event => { setDailyReportDraft(current => ({ ...current, note: event.target.value })); setDailyReportDirty(true); }} maxLength={4000} rows={2} className="mt-1 text-sm" placeholder="Add any extra context about today’s work, travel, or attendance." />
                </div>
              </div>
           </CardContent>
         </Card>
        {flow === "ending" && <EndDayDialog onCancel={() => setFlow("start")} onConfirm={() => endMutation.mutate()} saving={endMutation.isPending} />}
      </div>
    </div>
  );
}