import { useState, useEffect } from "react";
import { getSetting, saveSetting } from "@/lib/api";
import type { PriceTierConfig, PriceTier } from "@/lib/api";
import { DEFAULT_TIER_CONFIG } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layers, Plus, Trash2, Loader2 } from "lucide-react";

export default function PriceTiersPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tierConfig, setTierConfig] = useState<PriceTierConfig>(DEFAULT_TIER_CONFIG);

  useEffect(() => {
    setLoading(true);
    getSetting("price_tier_config")
      .then((setting) => {
        if (setting?.value) setTierConfig(setting.value as PriceTierConfig);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addTier = () => {
    if (tierConfig.tiers.length >= 10) return;
    setTierConfig((prev) => ({
      ...prev,
      tiers: [
        ...prev.tiers,
        {
          id: `tier-${Date.now()}`,
          label: "",
          customerGroupId: 0,
          priceListId: 0,
          color: "#6366f1",
          enabled: true,
        },
      ],
    }));
  };

  const updateTier = (index: number, updates: Partial<PriceTier>) => {
    setTierConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index ? { ...t, ...updates } : t)),
    }));
  };

  const removeTier = (index: number) => {
    setTierConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("price_tier_config", tierConfig);
      toast({ title: "Price tiers saved", description: "Configuration updated successfully." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-5 w-5 text-indigo-500" />
        <h2 className="text-lg font-bold text-slate-800">Price Tier System</h2>
      </div>
      <p className="text-sm text-slate-500">
        Map BigCommerce customer groups and price lists to named tiers shown in the POS.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Enable toggle */}
          <Card className="shadow-sm">
            <CardContent className="py-4 px-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Enable Price Tier System</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  When enabled, agents can select a price tier per customer in the POS.
                </p>
              </div>
              <Switch
                checked={tierConfig.enabled}
                onCheckedChange={(v) => setTierConfig((p) => ({ ...p, enabled: v }))}
                data-testid="switch-tier-enabled"
              />
            </CardContent>
          </Card>

          {tierConfig.enabled && (
            <>
              {/* Scope mode */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Scope Mode</CardTitle>
                  <CardDescription className="text-xs">
                    Controls which BigCommerce price lists are available in the POS.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select
                    value={tierConfig.scopeMode}
                    onValueChange={(v) =>
                      setTierConfig((p) => ({ ...p, scopeMode: v as "app" | "all" }))
                    }
                  >
                    <SelectTrigger data-testid="select-tier-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="app">Use Only App-Defined Tiers</SelectItem>
                      <SelectItem value="all">Allow All BigCommerce Price Lists</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Tier list */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Configured Tiers</span>
                    <span className="text-xs font-normal text-slate-400">
                      {tierConfig.tiers.length} / 10
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Each tier maps a label and colour to a BigCommerce customer group and price list.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {tierConfig.tiers.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-4">
                      No tiers configured. Add one below.
                    </p>
                  )}

                  {tierConfig.tiers.map((tier, idx) => (
                    <div
                      key={tier.id}
                      className="border rounded-lg p-3 space-y-3"
                      data-testid={`tier-row-${idx}`}
                    >
                      {/* Row 1: colour picker + label + enabled + delete */}
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={tier.color}
                          onChange={(e) => updateTier(idx, { color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer border shrink-0"
                          title="Tier colour"
                        />
                        <Input
                          placeholder="Label (e.g. VIP, Wholesale)"
                          value={tier.label}
                          onChange={(e) => updateTier(idx, { label: e.target.value })}
                          className="flex-1"
                          data-testid={`input-tier-label-${idx}`}
                        />
                        <Switch
                          checked={tier.enabled}
                          onCheckedChange={(v) => updateTier(idx, { enabled: v })}
                          data-testid={`switch-tier-enabled-${idx}`}
                        />
                        <button
                          onClick={() => removeTier(idx)}
                          className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
                          data-testid={`button-remove-tier-${idx}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Row 2: BC IDs */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Customer Group ID</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={tier.customerGroupId || ""}
                            onChange={(e) =>
                              updateTier(idx, { customerGroupId: parseInt(e.target.value) || 0 })
                            }
                            data-testid={`input-tier-group-${idx}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Price List ID</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={tier.priceListId || ""}
                            onChange={(e) =>
                              updateTier(idx, { priceListId: parseInt(e.target.value) || 0 })
                            }
                            data-testid={`input-tier-pricelist-${idx}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {tierConfig.tiers.length < 10 && (
                    <Button
                      variant="outline"
                      className="w-full gap-1"
                      onClick={addTier}
                      data-testid="button-add-tier"
                    >
                      <Plus className="h-4 w-4" /> Add Price Tier
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Save */}
          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleSave}
            disabled={saving}
            data-testid="button-save-tier-config"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Price Tier Configuration"
            )}
          </Button>
        </>
      )}
    </div>
  );
}
