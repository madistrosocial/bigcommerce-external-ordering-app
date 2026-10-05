import { useState, useEffect, useRef } from "react";
import { getAuthHeaders, getSetting, saveSetting, testBigCommerceCustomerGroup, DEFAULT_TIER_CONFIG } from "@/lib/api";
import type { PriceTier, PriceTierConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useUpdateTimezone } from "@/contexts/TimezoneContext";
import { Loader2, CheckCircle2, AlertCircle, Plug, ExternalLink, CalendarClock, ImageIcon, Trash2, Upload, Globe, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminIntegrationPage() {
  const { toast } = useToast();
  const updateAppTimezone = useUpdateTimezone();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCutoff, setSavingCutoff] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [storeHash, setStoreHash] = useState("");
  const [token, setToken] = useState("");
  const [channelId, setChannelId] = useState("1");
  const [storefrontUrl, setStorefrontUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [customerGroupId, setCustomerGroupId] = useState("8");
  const [customerGroupName, setCustomerGroupName] = useState("Verification Pending");
  const [testingCustomerGroup, setTestingCustomerGroup] = useState(false);
  const [googleSheetsWebhook, setGoogleSheetsWebhook] = useState("");
  const [showInventoryCounts, setShowInventoryCounts] = useState(true);
  const [tierConfig, setTierConfig] = useState<PriceTierConfig>(DEFAULT_TIER_CONFIG);
  const [cutoffDate, setCutoffDate] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/New_York");
  const [savingTimezone, setSavingTimezone] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getSetting("bigcommerce_config").catch(() => null),
      getSetting("google_sheets_webhook").catch(() => null),
      getSetting("show_inventory_counts").catch(() => null),
      getSetting("price_tier_config").catch(() => null),
      getSetting("bc_scan_cutoff_date").catch(() => null),
      getSetting("business_logo").catch(() => null),
      fetch("/api/settings/company-timezone", { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([cfg, webhook, inventoryCounts, savedTierConfig, cutoff, logo, tzData]) => {
      if (cfg?.value) {
        setStoreHash(cfg.value.storeHash ?? "");
        setToken(cfg.value.token ?? "");
        setChannelId(String(cfg.value.channelId ?? cfg.value.channel_id ?? "1"));
        setStorefrontUrl(cfg.value.storefrontUrl ?? "");
        setClientId(cfg.value.clientId ?? "");
        setClientSecret(cfg.value.clientSecret ?? "");
        setCustomerGroupId(String(cfg.value.customerGroupId ?? cfg.value.customer_group_id ?? 8));
        setCustomerGroupName(cfg.value.customerGroupName ?? cfg.value.customer_group_name ?? "Verification Pending");
      }
      if (webhook?.value !== undefined && webhook?.value !== null) {
        setGoogleSheetsWebhook(String(webhook.value));
      }
      if (inventoryCounts?.value !== undefined && inventoryCounts?.value !== null) {
        setShowInventoryCounts(inventoryCounts.value === true || inventoryCounts.value === "true");
      }
      if (savedTierConfig?.value) {
        setTierConfig(savedTierConfig.value as PriceTierConfig);
      }
      if (cutoff?.value) {
        setCutoffDate(cutoff.value);
      }
      if (logo?.value) {
        setLogoPreview(logo.value);
        setLogoFile(logo.value);
      }
      if (tzData?.timezone) setTimezone(tzData.timezone);
    }).finally(() => setLoading(false));
  }, []);

  const isConnected = !!(storeHash && token);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose an image under 1 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setLogoFile(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = async () => {
    setSavingLogo(true);
    try {
      await saveSetting("business_logo", logoFile);
      toast({ title: "Logo saved", description: "Business logo updated and will appear throughout the app." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    setSavingLogo(true);
    try {
      await saveSetting("business_logo", null);
      setLogoPreview(null);
      setLogoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Logo removed", description: "The default icon will be shown." });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSetting("bigcommerce_config", {
        storeHash,
        token,
        channelId: channelId ? parseInt(channelId) : 1,
        storefrontUrl: storefrontUrl.trim().replace(/\/$/, ""),
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined,
        customerGroupId: customerGroupId ? parseInt(customerGroupId) : 8,
        customerGroupName: customerGroupName.trim() || "Verification Pending",
      });
      await Promise.all([
        saveSetting("google_sheets_webhook", googleSheetsWebhook.trim()),
        saveSetting("show_inventory_counts", showInventoryCounts),
        saveSetting("price_tier_config", tierConfig),
      ]);
      toast({ title: "Settings saved", description: "BigCommerce integration updated successfully." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addTier = () => {
    if (tierConfig.tiers.length >= 10) return;
    setTierConfig((previous) => ({
      ...previous,
      tiers: [...previous.tiers, {
        id: `tier-${Date.now()}`,
        label: "",
        customerGroupId: 0,
        priceListId: 0,
        color: "#6366f1",
        enabled: true,
      }],
    }));
  };

  const updateTier = (index: number, updates: Partial<PriceTier>) => {
    setTierConfig((previous) => ({
      ...previous,
      tiers: previous.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...updates } : tier),
    }));
  };

  const removeTier = (index: number) => {
    setTierConfig((previous) => ({
      ...previous,
      tiers: previous.tiers.filter((_, tierIndex) => tierIndex !== index),
    }));
  };

  const handleTestCustomerGroup = async () => {
    const id = Number(customerGroupId);
    if (!Number.isInteger(id) || id <= 0 || !customerGroupName.trim()) {
      toast({ title: "Group ID and name are required", description: "Enter the BigCommerce customer group ID and exact name first.", variant: "destructive" });
      return;
    }
    setTestingCustomerGroup(true);
    try {
      const group = await testBigCommerceCustomerGroup(id, customerGroupName.trim());
      setCustomerGroupName(group.name);
      toast({ title: "Customer group verified", description: `BigCommerce group ${group.id}: ${group.name}` });
    } catch (err: any) {
      toast({ title: "Group verification failed", description: err.message, variant: "destructive" });
    } finally {
      setTestingCustomerGroup(false);
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

      {/* Business Logo Upload */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm">Business Logo</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Upload your business logo to display on the login page, sidebar, and throughout the app. Max 1 MB. PNG or SVG recommended.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview */}
              <div className="flex items-center gap-4">
                <div className="h-20 w-40 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-full w-full object-contain p-1"
                      data-testid="img-logo-preview"
                    />
                  ) : (
                    <div className="text-center text-slate-400">
                      <ImageIcon className="h-7 w-7 mx-auto mb-1" />
                      <p className="text-[10px]">No logo set</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoFileChange}
                    data-testid="input-logo-file"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="btn-choose-logo"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose Image
                  </Button>
                  {logoPreview && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-red-600 border-red-200 hover:bg-red-50"
                      onClick={handleRemoveLogo}
                      disabled={savingLogo}
                      data-testid="btn-remove-logo"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Logo
                    </Button>
                  )}
                </div>
              </div>
              {logoFile && (
                <Button
                  type="button"
                  onClick={handleSaveLogo}
                  disabled={savingLogo}
                  className="w-full"
                  data-testid="btn-save-logo"
                >
                  {savingLogo ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save Logo"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
              <div className="border-t pt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-0.5">New Customer Signup Group</p>
                  <p className="text-[11px] text-slate-400">New customers created from the Sales app are added to this BigCommerce group.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer_group_id">Customer Group ID</Label>
                    <Input
                      id="customer_group_id"
                      inputMode="numeric"
                      value={customerGroupId}
                      onChange={(e) => setCustomerGroupId(e.target.value)}
                      data-testid="input-customer-group-id"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer_group_name">Customer Group Name</Label>
                    <Input
                      id="customer_group_name"
                      value={customerGroupName}
                      onChange={(e) => setCustomerGroupName(e.target.value)}
                      data-testid="input-customer-group-name"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestCustomerGroup}
                  disabled={testingCustomerGroup || !isConnected}
                  data-testid="btn-test-customer-group"
                >
                  {testingCustomerGroup ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                  Test Customer Group
                </Button>
              </div>
              <div className="border-t pt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-0.5">Native Store Credit (OAuth)</p>
                  <p className="text-[11px] text-slate-400">
                    Required for native BC store credit in POS checkout. Create an OAuth app at{" "}
                    <a href="https://devtools.bigcommerce.com/" target="_blank" rel="noreferrer" className="text-blue-500 underline">devtools.bigcommerce.com</a>{" "}
                    with the <strong>Customers Login</strong> scope and paste the credentials below.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client_id">OAuth Client ID</Label>
                  <Input
                    id="client_id"
                    placeholder="e.g. abc123..."
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    data-testid="input-client-id"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client_secret">OAuth Client Secret</Label>
                  <Input
                    id="client_secret"
                    type="password"
                    placeholder="••••••••••••••••"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    data-testid="input-client-secret"
                  />
                  <p className="text-[11px] text-slate-400">
                    Store credit checkout will display an error if these are not configured.
                  </p>
                </div>
              </div>
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-700 mb-0.5">Google Sheets Backup</p>
                    <p className="text-[11px] text-slate-400">
                      Orders will be logged to this Google Apps Script webhook after checkout.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="google_sheets_webhook">Google Apps Script Webhook URL</Label>
                    <Input
                      id="google_sheets_webhook"
                      value={googleSheetsWebhook}
                      onChange={(e) => setGoogleSheetsWebhook(e.target.value)}
                      placeholder="https://script.google.com/macros/s/..."
                      data-testid="input-sheets-webhook"
                    />
                  </div>
                </div>
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-700 mb-0.5">Agent Visibility Settings</p>
                      <p className="text-[11px] text-slate-400">
                        {showInventoryCounts ? "Agents see numeric stock counts." : "Agents see only Available or Out of stock."}
                      </p>
                    </div>
                    <Switch
                      checked={showInventoryCounts}
                      onCheckedChange={setShowInventoryCounts}
                      data-testid="switch-inventory-visibility"
                    />
                  </div>
                </div>
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-700 mb-0.5 flex items-center gap-2">
                        <Layers className="h-4 w-4 text-indigo-500" />
                        Price Tier System
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Configure customer-group and price-list pricing shown to agents.
                      </p>
                    </div>
                    <Switch
                      checked={tierConfig.enabled}
                      onCheckedChange={(enabled) => setTierConfig((previous) => ({ ...previous, enabled }))}
                      data-testid="switch-tier-enabled"
                    />
                  </div>
                  {tierConfig.enabled && (
                    <div className="space-y-3 pl-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Scope Mode</Label>
                        <Select
                          value={tierConfig.scopeMode}
                          onValueChange={(scopeMode) => setTierConfig((previous) => ({ ...previous, scopeMode: scopeMode as "app" | "all" }))}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid="select-tier-scope">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="app">Use Only App-Defined Tiers</SelectItem>
                            <SelectItem value="all">Allow All BigCommerce Price Lists</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Configured Tiers ({tierConfig.tiers.length}/10)</Label>
                        {tierConfig.tiers.length === 0 && (
                          <p className="text-xs text-slate-400 italic">No tiers configured. Add one below.</p>
                        )}
                        {tierConfig.tiers.map((tier, index) => (
                          <div key={tier.id} className="border rounded-md p-2 space-y-2" data-testid={`tier-row-${index}`}>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={tier.color}
                                onChange={(e) => updateTier(index, { color: e.target.value })}
                                className="w-7 h-7 rounded cursor-pointer border"
                                title="Tier color"
                              />
                              <Input
                                placeholder="Label (e.g. VIP)"
                                value={tier.label}
                                onChange={(e) => updateTier(index, { label: e.target.value })}
                                className="h-7 text-xs flex-1"
                                data-testid={`input-tier-label-${index}`}
                              />
                              <Switch
                                checked={tier.enabled}
                                onCheckedChange={(enabled) => updateTier(index, { enabled })}
                                data-testid={`switch-tier-enabled-${index}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeTier(index)}
                                className="text-slate-400 hover:text-red-500"
                                data-testid={`button-remove-tier-${index}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[10px] text-slate-500">Customer Group ID</Label>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  value={tier.customerGroupId || ""}
                                  onChange={(e) => updateTier(index, { customerGroupId: parseInt(e.target.value) || 0 })}
                                  className="h-7 text-xs"
                                  data-testid={`input-tier-group-${index}`}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">Price List ID</Label>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  value={tier.priceListId || ""}
                                  onChange={(e) => updateTier(index, { priceListId: parseInt(e.target.value) || 0 })}
                                  className="h-7 text-xs"
                                  data-testid={`input-tier-pricelist-${index}`}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {tierConfig.tiers.length < 10 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-8 text-xs gap-1"
                          onClick={addTier}
                          data-testid="button-add-tier"
                        >
                          Add Price Tier
                        </Button>
                      )}
                    </div>
                  )}
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

      {/* Company Timezone */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm">Company Timezone</CardTitle>
          </div>
          <CardDescription className="text-xs">
            All timestamps across the app will display in this timezone for every user, regardless of their device's local time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-8 flex items-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-64 h-8 text-sm" data-testid="select-company-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Phoenix">Arizona (no DST)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  <SelectItem value="America/Anchorage">Alaska Time (AKT)</SelectItem>
                  <SelectItem value="Pacific/Honolulu">Hawaii Time (HT)</SelectItem>
                  <SelectItem value="America/Puerto_Rico">Atlantic Time (AT)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                  <SelectItem value="Europe/Paris">Central Europe (CET)</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                  <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                  <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney (AEDT)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8"
                disabled={savingTimezone}
                data-testid="button-save-timezone"
                onClick={async () => {
                  setSavingTimezone(true);
                  try {
                    const response = await fetch("/api/settings/company-timezone", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                      body: JSON.stringify({ timezone }),
                    });
                    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not save timezone");
                    updateAppTimezone(timezone);
                    toast({ title: "Timezone saved", description: `All timestamps will now display in ${timezone}.` });
                  } catch (err: any) {
                    toast({ title: "Save failed", description: err.message, variant: "destructive" });
                  } finally {
                    setSavingTimezone(false);
                  }
                }}
              >
                {savingTimezone ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save Timezone
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
