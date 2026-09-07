import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertCircle, ArrowLeft, Car, Check, CheckCircle2, ChevronRight, Clock3,
  Home, Info, Loader2, MapPin, Navigation, ShieldCheck, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { getAuthHeaders } from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";

type Coordinates = { latitude: number; longitude: number; accuracy?: number };

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
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No attendance history yet.</div>
      ) : rows.map(row => (
        <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{row.work_date}</p>
              <p className="mt-1 text-xs text-slate-500">{row.start_method === "warehouse" ? "Started at warehouse" : "Started while driving"}</p>
            </div>
            <Badge className={row.status === "completed" ? "border-0 bg-emerald-100 text-emerald-700" : "border-0 bg-red-100 text-red-700"}>{row.status}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div><span className="block text-slate-400">Time in</span><span className="font-medium text-slate-700">{row.time_in ? fmt.time(row.time_in) : "—"}</span></div>
            <div><span className="block text-slate-400">Time out</span><span className="font-medium text-slate-700">{row.time_out ? fmt.time(row.time_out) : "—"}</span></div>
            <div><span className="block text-slate-400">Total</span><span className="font-medium text-slate-700">{formatDuration(row.total_seconds)}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AttendancePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useStore(s => s.currentUser);
  const fmt = useTimeService();
  const [flow, setFlow] = useState<"start" | "validating" | "ready" | "blocked" | "ending">("start");
  const [validationMessage, setValidationMessage] = useState("");
  const [validationMethod, setValidationMethod] = useState<"warehouse" | "driving" | null>(null);
  const [locationForStart, setLocationForStart] = useState<Coordinates | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const [settingHome, setSettingHome] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "today", currentUser?.id],
    queryFn: () => apiJson("/api/attendance/today"),
    enabled: !!currentUser,
    refetchInterval: 60_000,
  });
  const active = data?.active ?? null;
  const history = data?.history ?? [];

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
  });
  const homeConfigured = Boolean(homeLocationQuery.data?.configured);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(async () => {
      const coords = await captureLocation();
      apiJson("/api/attendance/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords ?? {}),
      }).catch(() => {});
    }, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [active?.id]);

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
      startMutation.mutate(coords);
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
      startMutation.mutate(coords);
    } catch (e: any) {
      setValidationMessage(e.message);
      setFlow("blocked");
    }
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
    mutationFn: (coords: Coordinates | null = null) => apiJson("/api/attendance/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_method: validationMethod, ...(coords ?? locationForStart ?? {}) }),
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
      const coords = await captureLocation();
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

  const activeStatus = active?.start_method === "warehouse" ? "On Site" : "On Route";
  const activeSubtitle = active?.start_method === "warehouse" ? "Started at the warehouse" : "Started while driving to your first stop";
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
              <h2 className="text-2xl font-bold text-slate-900">Start your day</h2>
              <p className="mt-1 text-sm text-slate-500">Where are you starting?</p>
            </div>
            <div className="mt-8 space-y-3">
              <StartChoice icon={<MapPin className="h-6 w-6" />} title="Warehouse" subtitle="Login when you arrive at the location" onClick={startWarehouse} />
              <StartChoice icon={<Car className="h-6 w-6" />} title="Route start" subtitle={homeConfigured ? "Login when you're on your way" : "Set your home location first"} onClick={startDriving} disabled={!homeConfigured} />
            </div>
            {!homeConfigured && (
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
            <Button className="mt-8 h-12 w-full bg-red-600 hover:bg-red-700" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
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
                  <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-red-600" /><div><p className="text-sm font-semibold text-slate-800">{activeStatus}</p><p className="text-xs text-slate-500">Since {active.time_in ? fmt.time(active.time_in) : "—"}</p></div></div>
                  <Navigation className="h-5 w-5 text-slate-400" />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Clock3 className="h-5 w-5 text-slate-500" /><div><p className="text-[11px] uppercase tracking-wide text-slate-400">Time In</p><p className="text-sm font-semibold text-slate-800">{active.time_in ? fmt.time(active.time_in) : "—"}</p><p className="mt-0.5 text-xs text-slate-500">{activeSubtitle}</p></div></div>
                  <Button variant="outline" className="mt-4 h-11 w-full border-red-300 text-red-600 hover:bg-red-50" onClick={() => setFlow("ending")}> <X className="mr-2 h-4 w-4" />End Day</Button>
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
            <div className="flex items-center justify-center gap-2 pb-3 text-xs text-slate-400"><ShieldCheck className="h-4 w-4" />Attendance location evidence is recorded only for attendance events.</div>
          </div>
        )}
        {flow === "ending" && <EndDayDialog onCancel={() => setFlow("start")} onConfirm={() => endMutation.mutate()} saving={endMutation.isPending} />}
      </div>
    </div>
  );
}