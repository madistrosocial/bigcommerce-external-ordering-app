import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Plug, RefreshCw, Save, Upload, XCircle } from "lucide-react";
import { toPublicVendorMessage, toPublicVendorName } from "@/lib/vendor-display";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimeService } from "@/hooks/useTimeService";

function importSourceLabel(log?: api.DropshipSyncLog) {
  const source = log?.detail?.source;
  if (source === "uploaded_csv") return "Uploaded CSV";
  if (source === "csv_feed") return "URL feed";
  return log ? "Vendor catalog import" : "URL feed or uploaded CSV";
}

function formatImportDate(log: api.DropshipSyncLog | undefined, fmt: ReturnType<typeof useTimeService>) {
  const value = log?.completed_at || log?.started_at;
  if (!value) return "No successful import yet";
  return fmt.dateTime(value);
}

export default function KoleImportsPage() {
  const fmt = useTimeService();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManageVendor = hasPermission("dropshipping_vendor", "manage");
  const canSyncVendor = hasPermission("dropshipping_vendor", "sync");
  const queryClient = useQueryClient();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [draggingCsv, setDraggingCsv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [displayName, setDisplayName] = useState("Vendor Catalog");
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastTestOk, setLastTestOk] = useState<boolean | null>(null);
  const [accountId, setAccountId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const { data: catalogSummary, isLoading: isCatalogSummaryLoading } = useQuery({
    queryKey: ["dropship-products", "vendor-summary"],
    queryFn: () => api.getKoleProducts({ page: 1, limit: 1 }),
  });
  const {
    data: syncLogs = [],
    isLoading: isSyncLogsLoading,
    isError: isSyncLogsError,
  } = useQuery({ queryKey: ["dropship-sync-logs"], queryFn: api.getKoleSyncLogs });
  const latestSuccessfulImport = syncLogs.find((log) => log.status === "completed");
  const syncFeed = useMutation({
    mutationFn: api.syncKoleCatalog,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      queryClient.invalidateQueries({ queryKey: ["dropship-sync-logs"] });
      toast({ title: "Catalog sync completed", description: `${result.productsProcessed} products processed · ${result.productsCreated} new · ${result.productsUpdated} updated` });
    },
    onError: (error: any) => toast({ title: "Catalog sync failed", description: toPublicVendorMessage(error.message), variant: "destructive" }),
  });
  const uploadCsv = useMutation({
    mutationFn: api.uploadKoleCsv,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dropship-products"] });
      queryClient.invalidateQueries({ queryKey: ["dropship-sync-logs"] });
      toast({ title: "CSV imported into Vendor Catalog", description: `${result.productsProcessed} products processed · ${result.productsCreated} new · ${result.productsUpdated} updated. No BigCommerce products were created.` });
    },
    onError: (error: any) => toast({ title: "CSV upload failed", description: toPublicVendorMessage(error.message), variant: "destructive" }),
  });
  const startCsvUpload = (file?: File) => {
    if (!canSyncVendor || !file || syncFeed.isPending || uploadCsv.isPending) return;
    if (!file.size) return toast({ title: "CSV upload failed", description: "The selected file is empty.", variant: "destructive" });
    if (file.size > 50 * 1024 * 1024) return toast({ title: "CSV upload failed", description: "Choose a CSV file no larger than 50 MB.", variant: "destructive" });
    uploadCsv.mutate(file);
  };

  const load = async () => {
    try {
      const data = await api.getKoleConnection();
      setHasCredentials(data.hasCredentials);
      setDisplayName(toPublicVendorName(data.displayName || data.vendor.name));
      setLastTestedAt(data.lastTestedAt);
      setLastTestOk(data.lastTestOk);
    } catch (error: any) {
      toast({ title: "Failed to load vendor settings", description: toPublicVendorMessage(error.message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast({ title: "Display name required", description: "Enter a placeholder name for this vendor connection.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveKoleConnection({ accountId: accountId.trim() || undefined, apiKey: apiKey.trim() || undefined, displayName: toPublicVendorName(displayName) });
      setHasCredentials(saved.hasCredentials);
      setDisplayName(toPublicVendorName(saved.displayName));
      setAccountId("");
      setApiKey("");
      toast({ title: "Vendor connection saved", description: "Credentials remain server-side and are not returned to the browser." });
    } catch (error: any) {
      toast({ title: "Save failed", description: toPublicVendorMessage(error.message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await api.testKoleConnection();
      setTestMessage(toPublicVendorMessage(result.message));
      setLastTestedAt(new Date().toISOString());
      setLastTestOk(result.ok);
      toast({ title: "Connection successful", description: toPublicVendorMessage(result.message) });
    } catch (error: any) {
      setTestMessage(toPublicVendorMessage(error.message));
      setLastTestedAt(new Date().toISOString());
      setLastTestOk(false);
      toast({ title: "Connection failed", description: toPublicVendorMessage(error.message), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="min-h-[300px] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Plug className="h-5 w-5 text-indigo-600" /> {displayName}
        </h1>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Current Catalog Feed</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="text-sm text-slate-600">Public CSV feed</span>
          <Badge className="w-fit bg-green-100 text-green-700 border-0"><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Feed active</Badge>
        </CardContent>
      </Card>

      {canSyncVendor && <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Vendor Catalog Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv,text/plain,application/octet-stream"
            className="hidden"
            onChange={(event) => { startCsvUpload(event.target.files?.[0]); event.target.value = ""; }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} disabled={syncFeed.isPending || uploadCsv.isPending}>
              {uploadCsv.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              {uploadCsv.isPending ? "Uploading CSV…" : "Upload CSV"}
            </Button>
            <Button size="sm" onClick={() => syncFeed.mutate()} disabled={syncFeed.isPending || uploadCsv.isPending}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${syncFeed.isPending ? "animate-spin" : ""}`} />
              {syncFeed.isPending ? "Syncing…" : "Sync CSV Feed"}
            </Button>
          </div>
          <div
            className={`flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors ${draggingCsv ? "border-indigo-500 bg-indigo-50/60" : "border-slate-300"}`}
            onDragEnter={(event) => { event.preventDefault(); setDraggingCsv(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingCsv(false); }}
            onDrop={(event) => { event.preventDefault(); setDraggingCsv(false); startCsvUpload(event.dataTransfer.files?.[0]); }}
            aria-label="CSV upload drop area"
          >
            <Upload className={`h-5 w-5 shrink-0 ${draggingCsv ? "text-indigo-600" : "text-slate-400"}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">Drop a downloaded vendor CSV here, or choose Upload CSV.</p>
              <p className="text-xs text-slate-500">Manual import · up to 50 MB</p>
            </div>
          </div>
        </CardContent>
      </Card>}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Catalog products</p>
            <p className="text-xl font-bold text-slate-800">{isCatalogSummaryLoading ? "Loading…" : catalogSummary ? catalogSummary.total.toLocaleString() : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Last successful import</p>
            <p
              className="mt-1 text-sm font-semibold leading-5 text-slate-800"
              title={(latestSuccessfulImport?.completed_at || latestSuccessfulImport?.started_at) ?? undefined}
            >
              {isSyncLogsLoading ? "Loading…" : isSyncLogsError ? "Import history unavailable" : formatImportDate(latestSuccessfulImport, fmt)}
            </p>
            <p className="text-[10px] text-slate-400">
              {isSyncLogsError ? "Could not load import history" : importSourceLabel(latestSuccessfulImport)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Optional Vendor API Status</CardTitle>
          <CardDescription>This status is separate from CSV feed syncing; an unavailable API will not block catalog imports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Vendor API (not used by CSV sync)</span>
            {hasCredentials && lastTestOk === false ? (
              <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3.5 w-3.5 mr-1" />Connection Error</Badge>
            ) : hasCredentials && lastTestOk === true ? (
              <Badge className="bg-green-100 text-green-700 border-0"><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Connected</Badge>
            ) : hasCredentials ? (
              <Badge className="bg-blue-100 text-blue-700 border-0"><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Configured</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-600 border-0"><XCircle className="h-3.5 w-3.5 mr-1" />Not configured</Badge>
            )}
          </div>
          {lastTestedAt && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Last test</span>
              <span className={lastTestOk ? "text-green-600" : "text-red-600"}>
                {lastTestOk ? "Passed" : "Failed"} · {fmt.dateTime(lastTestedAt)}
              </span>
            </div>
          )}
          {testMessage && (
            <div className={`rounded-md px-3 py-2 text-xs ${lastTestOk ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {testMessage}
            </div>
          )}
          {canManageVendor && (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !hasCredentials}>
              {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Test API
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-500" /> Optional API Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageVendor && <p className="text-xs text-slate-500">View-only access. Ask an administrator for permission to change vendor settings.</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="vendor-display-name">Display name</Label>
              <Input id="vendor-display-name" value={displayName} onChange={(event) => setDisplayName(toPublicVendorName(event.target.value))} maxLength={80} autoComplete="off" placeholder="Vendor Catalog" disabled={!canManageVendor} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor-account-id">Vendor account ID</Label>
              <Input id="vendor-account-id" value={accountId} onChange={(event) => setAccountId(event.target.value)} autoComplete="off" placeholder={hasCredentials ? "Configured" : "Enter account ID"} disabled={!canManageVendor} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor-api-key">Vendor API key</Label>
              <div className="relative">
                <Input id="vendor-api-key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} type={showKey ? "text" : "password"} autoComplete="new-password" placeholder={hasCredentials ? "Configured" : "Enter API key"} className="pr-10" disabled={!canManageVendor} />
                <button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-40" aria-label={showKey ? "Hide API key" : "Show API key"} disabled={!canManageVendor}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          {canManageVendor && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save Connection
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}