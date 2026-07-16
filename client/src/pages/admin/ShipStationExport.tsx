import { useState, useEffect } from "react";
import { useTimeService } from "@/hooks/useTimeService";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Ship, Wifi, WifiOff, Play, Download, RefreshCw, Clock, CheckCircle, XCircle,
} from "lucide-react";

const API = (path: string) => `/api/shipstation${path}`;
const authHeaders = () => {
  try {
    const u = JSON.parse(localStorage.getItem("vansales_user") || "{}");
    if (u?.id) return { "Content-Type": "application/json", "x-user-id": String(u.id) };
  } catch {}
  return { "Content-Type": "application/json" };
};

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(API(path), {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers as Record<string, string> ?? {}) },
  });
  return res.json();
}

const ALL_FIELDS = [
  { id: "order_number",    label: "Order Number" },
  { id: "tracking_number", label: "Tracking Number" },
  { id: "shipping_cost",   label: "Shipping Cost" },
  { id: "ship_date",       label: "Ship Date" },
  { id: "carrier",         label: "Carrier" },
  { id: "service",         label: "Service" },
  { id: "customer_name",   label: "Customer Name" },
  { id: "order_date",      label: "Order Date" },
  { id: "shipment_id",     label: "Shipment ID" },
];

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Field row ─────────────────────────────────────────────────────────────────
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <Label className="text-xs text-slate-500 shrink-0 sm:w-36">{label}</Label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ShipStationExport() {
  const fmt = useTimeService();
  const { toast } = useToast();

  // ShipStation config
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [ssTestLoading, setSsTestLoading] = useState(false);
  const [ssSaving, setSsSaving] = useState(false);

  // Export config
  const [fields, setFields] = useState<string[]>(["order_number", "tracking_number", "shipping_cost", "ship_date"]);
  const [schedule, setSchedule] = useState("manual_only");
  const [dailyTime, setDailyTime] = useState("18:00");
  const [shipmentStatus, setShipmentStatus] = useState("shipped");
  const [exportWindow, setExportWindow] = useState("since_last_export");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [baseFileName, setBaseFileName] = useState("shipping_feed");
  const [dateStamp, setDateStamp] = useState("YYYYMMDD");
  const [fileFormat, setFileFormat] = useState("csv");
  const [exportConfigSaving, setExportConfigSaving] = useState(false);

  // FTP config
  const [ftpProtocol, setFtpProtocol] = useState("ftp");
  const [ftpHost, setFtpHost] = useState("");
  const [ftpPort, setFtpPort] = useState("21");
  const [ftpUsername, setFtpUsername] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");
  const [ftpFolder, setFtpFolder] = useState("/");
  const [ftpSaving, setFtpSaving] = useState(false);
  const [ftpTestLoading, setFtpTestLoading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const previewFileName = () => {
    const ext = `.${fileFormat}`;
    if (!dateStamp || dateStamp === "none") return `${baseFileName}${ext}`;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const H = pad(now.getHours());
    const M = pad(now.getMinutes());
    if (dateStamp === "YYYY-MM-DD") return `${baseFileName}_${y}-${m}-${d}${ext}`;
    if (dateStamp === "YYYYMMDD") return `${baseFileName}_${y}${m}${d}${ext}`;
    if (dateStamp === "YYYYMMDD_HHmm") return `${baseFileName}_${y}${m}${d}_${H}${M}${ext}`;
    return `${baseFileName}${ext}`;
  };

  const loadAll = async () => {
    const [ssCfg, expCfg, ftpCfg] = await Promise.all([
      apiFetch("/config"),
      apiFetch("/export-config"),
      apiFetch("/ftp-config"),
    ]);
    // SS config
    setApiKey(ssCfg.apiKey ?? "");
    setApiSecret(ssCfg.apiSecret ?? "");
    setLastSync(ssCfg.lastSync ?? null);
    setLastExport(ssCfg.lastExport ?? null);
    // Export config
    if (expCfg.fields) setFields(expCfg.fields);
    setSchedule(expCfg.schedule ?? "manual_only");
    setDailyTime(expCfg.daily_time ?? "18:00");
    setShipmentStatus(expCfg.shipment_status ?? "shipped");
    setExportWindow(expCfg.export_window ?? "since_last_export");
    setCustomStart(expCfg.custom_start ?? "");
    setCustomEnd(expCfg.custom_end ?? "");
    setBaseFileName(expCfg.base_file_name ?? "shipping_feed");
    setDateStamp(expCfg.date_stamp ?? "YYYYMMDD");
    setFileFormat(expCfg.format ?? "csv");
    // FTP config
    setFtpProtocol(ftpCfg.protocol ?? "ftp");
    setFtpHost(ftpCfg.host ?? "");
    setFtpPort(ftpCfg.port ?? "21");
    setFtpUsername(ftpCfg.username ?? "");
    setFtpPassword(ftpCfg.password ?? "");
    setFtpFolder(ftpCfg.remote_folder ?? "/");
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await apiFetch("/export/history?limit=50");
      setHistory(Array.isArray(data) ? data : []);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { loadAll(); loadHistory(); }, []);

  // ── Protocol → default port ──
  useEffect(() => {
    if (ftpProtocol === "sftp") setFtpPort((p) => p === "21" ? "22" : p);
    else setFtpPort((p) => p === "22" ? "21" : p);
  }, [ftpProtocol]);

  const toggleField = (id: string) => {
    setFields((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  };

  // ── Save SS config ──
  const saveSsConfig = async () => {
    setSsSaving(true);
    try {
      const d = await apiFetch("/config", {
        method: "POST",
        body: JSON.stringify({ apiKey, apiSecret }),
      });
      if (d.error) throw new Error(d.error);
      toast({ title: "ShipStation settings saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSsSaving(false); }
  };

  // ── Test SS connection ──
  const testSsConnection = async () => {
    setSsTestLoading(true);
    try {
      const d = await apiFetch("/test-connection", {
        method: "POST",
        body: JSON.stringify({ apiKey, apiSecret }),
      });
      if (!d.success) throw new Error(d.error ?? "Failed");
      toast({ title: "Connected!", description: d.message });
      setLastSync(new Date().toISOString());
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally { setSsTestLoading(false); }
  };

  // ── Save export config ──
  const saveExportConfig = async () => {
    setExportConfigSaving(true);
    try {
      const d = await apiFetch("/export-config", {
        method: "POST",
        body: JSON.stringify({
          fields, schedule, daily_time: dailyTime,
          shipment_status: shipmentStatus, export_window: exportWindow,
          custom_start: customStart, custom_end: customEnd,
          base_file_name: baseFileName, date_stamp: dateStamp, format: fileFormat,
        }),
      });
      if (d.error) throw new Error(d.error);
      toast({ title: "Export configuration saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setExportConfigSaving(false); }
  };

  // ── Save FTP config ──
  const saveFtpConfig = async () => {
    setFtpSaving(true);
    try {
      const d = await apiFetch("/ftp-config", {
        method: "POST",
        body: JSON.stringify({
          protocol: ftpProtocol, host: ftpHost, port: ftpPort,
          username: ftpUsername, password: ftpPassword, remote_folder: ftpFolder,
        }),
      });
      if (d.error) throw new Error(d.error);
      toast({ title: "FTP settings saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setFtpSaving(false); }
  };

  // ── Test FTP connection ──
  const testFtpConnection = async () => {
    setFtpTestLoading(true);
    try {
      const d = await apiFetch("/ftp-test", {
        method: "POST",
        body: JSON.stringify({
          protocol: ftpProtocol, host: ftpHost, port: ftpPort,
          username: ftpUsername, password: ftpPassword, remote_folder: ftpFolder,
        }),
      });
      if (!d.success) throw new Error(d.error ?? "Failed");
      toast({ title: "FTP Connected!", description: d.message });
    } catch (e: any) {
      toast({ title: "FTP connection failed", description: e.message, variant: "destructive" });
    } finally { setFtpTestLoading(false); }
  };

  // ── Run export ──
  const runExport = async () => {
    setExporting(true);
    try {
      const d = await apiFetch("/export/run", { method: "POST" });
      if (!d.success) throw new Error(d.error ?? "Export failed");
      toast({ title: "Export complete", description: d.message });
      await Promise.all([loadHistory(), loadAll()]);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
      await loadHistory();
    } finally { setExporting(false); }
  };

  // ── Download file ──
  const downloadFile = (id: number, fileName: string) => {
    const headers = authHeaders();
    fetch(`/api/shipstation/export/history/${id}/download`, { headers: headers as HeadersInit })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast({ title: "Download failed", variant: "destructive" }));
  };


  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Ship className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">ShipStation Export</h1>
          <p className="text-xs text-slate-500">Generate and upload shipping data to FTP/SFTP</p>
        </div>
      </div>

      {/* ── ShipStation Configuration ── */}
      <Card title="ShipStation Configuration">
        <div className="space-y-3">
          <FieldRow label="API Key">
            <Input data-testid="input-ss-api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API Key" className="text-sm h-8" />
          </FieldRow>
          <FieldRow label="API Secret">
            <Input data-testid="input-ss-api-secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Enter API Secret" className="text-sm h-8" />
          </FieldRow>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <Button data-testid="button-ss-test" size="sm" variant="outline" onClick={testSsConnection} disabled={ssTestLoading || !apiKey}>
              {ssTestLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5 mr-1.5" />}
              Test Connection
            </Button>
            <Button data-testid="button-ss-save" size="sm" onClick={saveSsConfig} disabled={ssSaving}>
              {ssSaving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save Settings
            </Button>
            <div className="flex flex-col gap-0.5 ml-auto text-right">
              <span className="text-[11px] text-slate-400">Last Sync: <span className="text-slate-600">{fmt.dateTime(lastSync)}</span></span>
              <span className="text-[11px] text-slate-400">Last Export: <span className="text-slate-600">{fmt.dateTime(lastExport)}</span></span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Export Fields ── */}
      <Card title="Export Fields">
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-3">Select which fields to include in the export file.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_FIELDS.map((f) => (
              <label key={f.id} data-testid={`checkbox-field-${f.id}`} className="flex items-center gap-2 cursor-pointer group">
                <Checkbox
                  checked={fields.includes(f.id)}
                  onCheckedChange={() => toggleField(f.id)}
                  className="shrink-0"
                />
                <span className="text-xs text-slate-700 group-hover:text-slate-900">{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Export Schedule ── */}
      <Card title="Export Schedule">
        <div className="space-y-3">
          <FieldRow label="Schedule">
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger data-testid="select-schedule" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_only">Manual Only</SelectItem>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="every_2h">Every 2 Hours</SelectItem>
                <SelectItem value="every_4h">Every 4 Hours</SelectItem>
                <SelectItem value="every_6h">Every 6 Hours</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          {schedule === "daily" && (
            <FieldRow label="Export Time">
              <Select value={dailyTime} onValueChange={setDailyTime}>
                <SelectTrigger data-testid="select-daily-time" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["06:00","07:00","08:00","09:00","10:00","11:00","12:00",
                    "13:00","14:00","15:00","16:00","17:00","18:00","19:00",
                    "20:00","21:00","22:00","23:00"].map((t) => (
                    <SelectItem key={t} value={t}>{
                      (() => {
                        const [h, m] = t.split(":").map(Number);
                        const suffix = h >= 12 ? "PM" : "AM";
                        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                        return `${h12}:${String(m).padStart(2,"0")} ${suffix}`;
                      })()
                    }</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          )}
        </div>
      </Card>

      {/* ── Export Criteria ── */}
      <Card title="Export Criteria">
        <div className="space-y-3">
          <FieldRow label="Shipment Status">
            <Select value={shipmentStatus} onValueChange={setShipmentStatus}>
              <SelectTrigger data-testid="select-shipment-status" className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shipped">Shipped Only</SelectItem>
                <SelectItem value="delivered">Delivered Only</SelectItem>
                <SelectItem value="all">All Shipments</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Export Window">
            <Select value={exportWindow} onValueChange={setExportWindow}>
              <SelectTrigger data-testid="select-export-window" className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="since_last_export">Since Last Export</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          {exportWindow === "custom" && (
            <>
              <FieldRow label="Start Date">
                <Input data-testid="input-custom-start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 text-sm" />
              </FieldRow>
              <FieldRow label="End Date">
                <Input data-testid="input-custom-end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 text-sm" />
              </FieldRow>
            </>
          )}
          <div className="flex justify-end pt-1">
            <Button data-testid="button-save-export-config" size="sm" onClick={saveExportConfig} disabled={exportConfigSaving}>
              {exportConfigSaving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save Configuration
            </Button>
          </div>
        </div>
      </Card>

      {/* ── File Naming ── */}
      <Card title="File Naming">
        <div className="space-y-3">
          <FieldRow label="Base File Name">
            <Input data-testid="input-base-file-name" value={baseFileName} onChange={(e) => setBaseFileName(e.target.value)} placeholder="shipping_feed" className="h-8 text-sm" />
          </FieldRow>
          <FieldRow label="Date Stamp">
            <Select value={dateStamp} onValueChange={setDateStamp}>
              <SelectTrigger data-testid="select-date-stamp" className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                <SelectItem value="YYYYMMDD">YYYYMMDD</SelectItem>
                <SelectItem value="YYYYMMDD_HHmm">YYYYMMDD_HHmm</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="File Format">
            <Select value={fileFormat} onValueChange={setFileFormat}>
              <SelectTrigger data-testid="select-file-format" className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="txt">TXT (tab-delimited)</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <div className="bg-slate-50 rounded-lg px-3 py-2 mt-1">
            <p className="text-[11px] text-slate-400 mb-0.5">Preview filename:</p>
            <p data-testid="text-file-name-preview" className="text-xs font-mono text-slate-700">{previewFileName()}</p>
          </div>
        </div>
      </Card>

      {/* ── FTP / SFTP Configuration ── */}
      <Card title="FTP / SFTP Configuration">
        <div className="space-y-3">
          <FieldRow label="Protocol">
            <Select value={ftpProtocol} onValueChange={setFtpProtocol}>
              <SelectTrigger data-testid="select-ftp-protocol" className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ftp">FTP</SelectItem>
                <SelectItem value="sftp">SFTP</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Host Name">
            <Input data-testid="input-ftp-host" value={ftpHost} onChange={(e) => setFtpHost(e.target.value)} placeholder="ftp.example.com" className="h-8 text-sm" />
          </FieldRow>
          <FieldRow label="Port">
            <Input data-testid="input-ftp-port" value={ftpPort} onChange={(e) => setFtpPort(e.target.value)} placeholder="21" className="h-8 text-sm w-24" />
          </FieldRow>
          <FieldRow label="Username">
            <Input data-testid="input-ftp-username" value={ftpUsername} onChange={(e) => setFtpUsername(e.target.value)} placeholder="username" className="h-8 text-sm" />
          </FieldRow>
          <FieldRow label="Password">
            <Input data-testid="input-ftp-password" type="password" value={ftpPassword} onChange={(e) => setFtpPassword(e.target.value)} placeholder="password" className="h-8 text-sm" />
          </FieldRow>
          <FieldRow label="Remote Folder">
            <Input data-testid="input-ftp-folder" value={ftpFolder} onChange={(e) => setFtpFolder(e.target.value)} placeholder="/" className="h-8 text-sm" />
          </FieldRow>
          <div className="flex gap-2 pt-1">
            <Button data-testid="button-ftp-test" size="sm" variant="outline" onClick={testFtpConnection} disabled={ftpTestLoading || !ftpHost}>
              {ftpTestLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5 mr-1.5" />}
              Test Connection
            </Button>
            <Button data-testid="button-ftp-save" size="sm" onClick={saveFtpConfig} disabled={ftpSaving}>
              {ftpSaving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save Settings
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Manual Export ── */}
      <Card title="Manual Export">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-700 font-medium">Run Export Now</p>
            <p className="text-xs text-slate-500 mt-0.5">Fetch shipments and upload to FTP based on current settings.</p>
          </div>
          <Button data-testid="button-run-export" onClick={runExport} disabled={exporting} className="ml-4 shrink-0">
            {exporting
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Exporting…</>
              : <><Play className="h-4 w-4 mr-2" />Run Export</>}
          </Button>
        </div>
      </Card>

      {/* ── Export History ── */}
      <Card title="Export History">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Last 50 export runs</p>
            <Button data-testid="button-refresh-history" size="sm" variant="ghost" onClick={loadHistory} disabled={historyLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${historyLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {history.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No export history yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-xs font-semibold text-slate-500 h-8">Date</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 h-8">File</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 h-8 text-right">Records</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 h-8">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 h-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id} data-testid={`row-export-history-${h.id}`}>
                      <TableCell className="text-xs text-slate-600 py-2">{fmt.dateTime(h.export_date)}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-700 py-2 max-w-[180px] truncate">{h.file_name}</TableCell>
                      <TableCell className="text-xs text-slate-600 py-2 text-right">{h.record_count.toLocaleString()}</TableCell>
                      <TableCell className="py-2">
                        {h.status === "success"
                          ? <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] h-5 gap-1"><CheckCircle className="h-3 w-3" />Success</Badge>
                          : <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] h-5 gap-1" title={h.error_message ?? ""}><XCircle className="h-3 w-3" />Failed</Badge>
                        }
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        {h.status === "success" && (
                          <Button
                            data-testid={`button-download-${h.id}`}
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => downloadFile(h.id, h.file_name)}
                          >
                            <Download className="h-3 w-3 mr-1" />Download
                          </Button>
                        )}
                        {h.status === "failed" && h.error_message && (
                          <span className="text-[10px] text-red-500 max-w-[160px] truncate block text-right" title={h.error_message}>
                            {h.error_message}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
