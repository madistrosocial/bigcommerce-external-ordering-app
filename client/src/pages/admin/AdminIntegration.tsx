import { useState, useEffect } from "react";
import { getSetting, saveSetting } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle, Plug, ExternalLink, CalendarClock } from "lucide-react";

export default function AdminIntegrationPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCutoff, setSavingCutoff] = useState(false);
  const [storeHash, setStoreHash] = useState("");
  const [token, setToken] = useState("");
  const [channelId, setChannelId] = useState("1");
  const [storefrontUrl, setStorefrontUrl] = useState("");
  const [cutoffDate, setCutoffDate] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getSetting("bigcommerce_config").catch(() => null),
      getSetting("bc_scan_cutoff_date").catch(() => null),
    ]).then(([cfg, cutoff]) => {
      if (cfg?.value) {
        setStoreHash(cfg.value.storeHash ?? "");
        setToken(cfg.value.token ?? "");
        setChannelId(String(cfg.value.channelId ?? cfg.value.channel_id ?? "1"));
        setStorefrontUrl(cfg.value.storefrontUrl ?? "");
      }
      if (cutoff?.value) {
        setCutoffDate(cutoff.value);
      }
    }).finally(() => setLoading(false));
  }, []);

  const isConnected = !!(storeHash && token);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSetting("bigcommerce_config", {
        storeHash,
        token,
        channelId: channelId ? parseInt(channelId) : 1,
        storefrontUrl: storefrontUrl.trim().replace(/\/$/, ""),
      });
      toast({ title: "Settings saved", description: "BigCommerce integration updated successfully." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCutoff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCutoff(true);
    try {
      await saveSetting("bc_scan_cutoff_date", cutoffDate || null);
      toast({
        title: "Cutoff date saved",
        description: cutoffDate
          ? `BC order scan will stop at ${cutoffDate}. History before this date is served from the local database.`
          : "Cutoff date cleared — BC will scan all available order history.",
      });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingCutoff(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Plug className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-bold text-slate-800">Integration Settings</h2>
      </div>
      <p className="text-sm text-slate-500">Configure your BigCommerce connection for product sync and order submission.</p>

      {/* Connection status */}
      <Card className="shadow-sm">
        <CardContent className="py-4 px-4 flex items-center gap-3">
          {isConnected ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-700">BigCommerce Connected</p>
                <p className="text-xs text-slate-500">Store: {storeHash}</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-700">Not Configured</p>
                <p className="text-xs text-slate-500">Enter your BigCommerce API credentials below.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Config form */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">BigCommerce API Credentials</CardTitle>
          <CardDescription className="text-xs">
            Credentials are stored server-side and used for all API calls.{" "}
            <a
              href="https://developer.bigcommerce.com/docs/start/authentication/api-accounts"
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 inline-flex items-center gap-0.5"
            >
              How to get credentials <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="store_hash">Store Hash</Label>
                <Input
                  id="store_hash"
                  placeholder="e.g. abc123xyz"
                  value={storeHash}
                  onChange={(e) => setStoreHash(e.target.value)}
                  data-testid="input-store-hash"
                />
                <p className="text-[11px] text-slate-400">Found in your BC store URL: mybigcommerce.com/manage/dashboard</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="access_token">Access Token (X-Auth-Token)</Label>
                <Input
                  id="access_token"
                  type="password"
                  placeholder="••••••••••••••••"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  data-testid="input-access-token"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="channel_id">Channel ID</Label>
                <Input
                  id="channel_id"
                  placeholder="1"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  data-testid="input-channel-id"
                />
                <p className="text-[11px] text-slate-400">Default is 1 for the main storefront.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="storefront_url">Storefront URL</Label>
                <Input
                  id="storefront_url"
                  placeholder="https://yourdomain.com"
                  value={storefrontUrl}
                  onChange={(e) => setStorefrontUrl(e.target.value)}
                  data-testid="input-storefront-url"
                />
                <p className="text-[11px] text-slate-400">
                  Your public store URL (no trailing slash). Used by the BC Product Link tool to build product URLs in custom fields.
                </p>
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="w-full"
                data-testid="btn-save-integration"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save Integration Settings"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Price History Scan Cutoff */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm">Price History Scan Cutoff Date</CardTitle>
          </div>
          <CardDescription className="text-xs">
            When looking up a customer's price history, the app scans BigCommerce orders from the most recent date
            down to this cutoff. Orders older than this date are served from the local database cache (which you can
            pre-populate with a full import). Leave blank to scan all available BC order history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <form onSubmit={handleSaveCutoff} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cutoff_date">Cutoff Date</Label>
                <Input
                  id="cutoff_date"
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  data-testid="input-cutoff-date"
                />
                {cutoffDate ? (
                  <p className="text-[11px] text-blue-600">
                    BC will scan orders from today back to <strong>{cutoffDate}</strong>. The database cache covers everything before that date.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    No cutoff set — BC will scan all order history (may be slow for customers with many orders).
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={savingCutoff}
                  className="flex-1"
                  data-testid="btn-save-cutoff"
                >
                  {savingCutoff ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save Cutoff Date"}
                </Button>
                {cutoffDate && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingCutoff}
                    data-testid="btn-clear-cutoff"
                    onClick={async () => {
                      setCutoffDate("");
                      setSavingCutoff(true);
                      try {
                        await saveSetting("bc_scan_cutoff_date", null);
                        toast({ title: "Cutoff date cleared", description: "BC will now scan all available order history." });
                      } catch (err: any) {
                        toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
                      } finally {
                        setSavingCutoff(false);
                      }
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
