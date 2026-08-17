import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Plug, RefreshCw, Save, Eye, EyeOff } from "lucide-react";

export default function AdminSkuvaultPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [hasCredentials, setHasCredentials] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastTestOk, setLastTestOk] = useState<boolean | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [warehouseLocation, setWarehouseLocation] = useState("GENERAL");
  const [reasonsText, setReasonsText] = useState("");

  const [tenantToken, setTenantToken] = useState("");
  const [userToken, setUserToken] = useState("");
  const [showTenant, setShowTenant] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSkuVaultSettings();
        setHasCredentials(data.hasCredentials ?? false);
        setWarehouseId(data.warehouseId != null ? String(data.warehouseId) : "");
        setWarehouseLocation(data.warehouseLocation || "GENERAL");
        setReasonsText((data.reasons ?? []).join("\n"));
        setLastTestedAt(data.lastTestedAt ?? null);
        setLastTestOk(data.lastTestOk ?? null);
      } catch {
        toast({ title: "Failed to load SKUVault settings", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!tenantToken && !userToken && !warehouseLocation && !warehouseId) {
      toast({ title: "Nothing to save", description: "Enter credentials to update them." });
      return;
    }
    setSaving(true);
    try {
      const reasons = reasonsText.split("\n").map((r) => r.trim()).filter(Boolean);
      await api.saveSkuVaultSettings({
        tenantToken,
        userToken,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        warehouseLocation,
        reasons,
      });
      toast({ title: "SKUVault settings saved" });
      setTenantToken("");
      setUserToken("");
      setHasCredentials(true);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testSkuVaultConnection();
      setTestResult(result);
      setLastTestOk(result.ok);
      setLastTestedAt(new Date().toISOString());
      toast({
        title: result.ok ? "Connection successful" : "Connection failed",
        description: result.message,
        variant: result.ok ? "default" : "destructive",
      });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Plug className="h-5 w-5 text-purple-600" />
          SKUVault Integration
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure the SKUVault API credentials used for inventory push and audit adjustments.
        </p>
      </div>

      {/* Connection status */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Credentials</span>
            {hasCredentials ? (
              <Badge className="bg-green-100 text-green-700 border-0">Configured</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500 border-0">Not set</Badge>
            )}
          </div>
          {lastTestedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Last test</span>
              <div className="flex items-center gap-1.5 text-sm">
                {lastTestOk ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className={lastTestOk ? "text-green-600" : "text-red-600"}>
                  {lastTestOk ? "Passed" : "Failed"} · {new Date(lastTestedAt).toLocaleString()}
                </span>
              </div>
            </div>
          )}
          {testResult && (
            <div className={`text-xs p-2.5 rounded-md ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {testResult.message}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !hasCredentials}>
            {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Test Connection
          </Button>
        </CardContent>
      </Card>

      {/* Credentials form */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">API Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            {hasCredentials
              ? "Credentials are saved. Enter new values below to replace them. Leave blank to keep existing."
              : "Enter your SKUVault Tenant Token and User Token. Find these in SKUVault under Settings > Integrations."}
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-slate-600">Tenant Token</Label>
            <div className="relative">
              <Input
                type={showTenant ? "text" : "password"}
                placeholder={hasCredentials ? "Enter to replace existing token" : "Enter tenant token…"}
                value={tenantToken}
                onChange={(e) => setTenantToken(e.target.value)}
                className="pr-9"
              />
              <button
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                type="button"
                onClick={() => setShowTenant((v) => !v)}
              >
                {showTenant ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-slate-600">User Token</Label>
            <div className="relative">
              <Input
                type={showUser ? "text" : "password"}
                placeholder={hasCredentials ? "Enter to replace existing token" : "Enter user token…"}
                value={userToken}
                onChange={(e) => setUserToken(e.target.value)}
                className="pr-9"
              />
              <button
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                type="button"
                onClick={() => setShowUser((v) => !v)}
              >
                {showUser ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-slate-600">Warehouse ID</Label>
            <Input
              type="number"
              placeholder="e.g. 12345"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              min={1}
            />
            <p className="text-xs text-slate-400">
              The numeric Warehouse ID required by SKUVault's inventory API. Find it in SKUVault under{" "}
              <span className="font-medium text-slate-500">Admin → Warehouses / Locations</span> — look for the ID column.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-slate-600">Warehouse Location Code</Label>
            <Input
              placeholder="GENERAL"
              value={warehouseLocation}
              onChange={(e) => setWarehouseLocation(e.target.value)}
            />
            <p className="text-xs text-slate-400">
              Fallback location code used when a SKU has no recorded location in SKUVault. The system
              always tries to use the SKU's actual bin location first (e.g. <span className="font-medium text-slate-500">END CAP-9</span>).
              Only used if the lookup fails or the item is brand new.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-slate-600">Valid Transaction Reasons</Label>
            <Textarea
              placeholder={"Enter each reason on a new line, exactly as it appears in SKUVault.\nExample:\nReceived\nAdjustment\nReturn\nTransfer"}
              value={reasonsText}
              onChange={(e) => setReasonsText(e.target.value)}
              rows={5}
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-400">
              These reasons appear in the Inventory Push and Audit dropdowns. They must <strong>exactly match</strong> the reason codes
              configured in SKUVault under <span className="font-medium text-slate-500">Settings → Inventory → Reasons</span>.
              The first entry will be the default.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="shadow-sm bg-slate-50 border-slate-200">
        <CardContent className="p-4 text-xs text-slate-500 space-y-1.5">
          <p className="font-semibold text-slate-600">How SKUVault is used</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>When pushing inventory, you can optionally push to SKUVault alongside BigCommerce.</li>
            <li>Each SKUVault push creates an Inventory Audit task so warehouse staff can verify physical counts.</li>
            <li>During audit completion, the system sets SKUVault inventory to the physical count (not the push quantity).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
