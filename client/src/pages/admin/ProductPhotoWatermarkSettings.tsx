import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getSetting, saveSetting } from "@/lib/api";
import type { ProductPhotoWatermarkSettings } from "@/lib/product-photo-watermark";

const initial: ProductPhotoWatermarkSettings = {
  enabled: false,
  logoTone: "dark",
  darkLogoDataUrl: "",
  darkLogoFileName: "",
  lightLogoDataUrl: "",
  lightLogoFileName: "",
};

export default function ProductPhotoWatermarkSettingsCard() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const darkInput = useRef<HTMLInputElement>(null);
  const lightInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSetting("product_photo_watermark")
      .then(({ value }) => setSettings({ ...initial, ...(value || {}) }))
      .catch((error) => toast({ title: "Could not load watermark settings", description: error.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const uploadLogo = async (tone: "dark" | "light", file?: File) => {
    if (!file) return;
    if (file.type !== "image/png" || file.size > 2 * 1024 * 1024) {
      toast({ title: "Choose a PNG under 2 MB", description: "Watermark logos must be transparent 1200 × 1200 PNG files.", variant: "destructive" });
      return;
    }
    try {
      const image = await createImageBitmap(file);
      if (image.width !== 1200 || image.height !== 1200) {
        image.close();
        throw new Error("The logo must be exactly 1200 × 1200 pixels.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1200;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not inspect the PNG transparency.");
      context.drawImage(image, 0, 0);
      image.close();
      const alpha = context.getImageData(0, 0, 1200, 1200).data;
      let transparent = false;
      let visible = false;
      for (let index = 3; index < alpha.length; index += 4) {
        if (alpha[index] < 255) transparent = true;
        if (alpha[index] > 0) visible = true;
        if (transparent && visible) break;
      }
      if (!transparent || !visible) throw new Error("The PNG must contain a visible logo on a transparent background.");
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the selected PNG."));
        reader.readAsDataURL(file);
      });
      setSettings((current) => ({
        ...current,
        [tone === "dark" ? "darkLogoDataUrl" : "lightLogoDataUrl"]: dataUrl,
        [tone === "dark" ? "darkLogoFileName" : "lightLogoFileName"]: file.name,
      }));
    } catch (error) {
      toast({ title: "Invalid watermark logo", description: error instanceof Error ? error.message : "Choose another PNG.", variant: "destructive" });
    }
  };

  const save = async () => {
    const selectedLogo = settings.logoTone === "dark" ? settings.darkLogoDataUrl : settings.lightLogoDataUrl;
    if (settings.enabled && !selectedLogo) {
      toast({ title: "Upload the selected logo first", description: `Automatic watermarking uses the ${settings.logoTone} logo.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveSetting("product_photo_watermark", settings);
      toast({ title: "Watermark settings saved", description: "Product 360 uploads and Image Editor now use these shared logos." });
    } catch (error) {
      toast({ title: "Could not save watermark settings", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return <Card className="shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="text-sm">Product photo watermark</CardTitle>
      <CardDescription className="text-xs">Shared logo overlays for Product 360 product and variant photos, and the Image Editor.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {loading ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : <>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div><p className="text-sm font-medium">Automatically add watermark</p><p className="text-xs text-slate-500">Applied when photos are added through Product 360.</p></div>
          <Switch checked={settings.enabled} onCheckedChange={(enabled) => {
            const selectedLogo = settings.logoTone === "dark" ? settings.darkLogoDataUrl : settings.lightLogoDataUrl;
            if (enabled && !selectedLogo) {
              toast({ title: "Upload the selected logo first", description: `Automatic watermarking uses the ${settings.logoTone} logo.`, variant: "destructive" });
              return;
            }
            setSettings((current) => ({ ...current, enabled }));
          }} aria-label="Automatically add watermark" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["dark", "light"] as const).map((tone) => {
            const data = tone === "dark" ? settings.darkLogoDataUrl : settings.lightLogoDataUrl;
            const name = tone === "dark" ? settings.darkLogoFileName : settings.lightLogoFileName;
            return <div key={tone} className="rounded-md border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border bg-slate-50">
                  {data ? <img src={data} alt={`${tone} logo preview`} className="h-full w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium capitalize">{tone} logo</p><p className="truncate text-xs text-slate-500">{name || "No logo uploaded"}</p></div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => (tone === "dark" ? darkInput : lightInput).current?.click()}>{data ? "Replace" : "Upload PNG"}</Button>
                {data && <Button type="button" variant="ghost" size="sm" onClick={() => setSettings((current) => ({ ...current, [tone === "dark" ? "darkLogoDataUrl" : "lightLogoDataUrl"]: "", [tone === "dark" ? "darkLogoFileName" : "lightLogoFileName"]: "" }))}><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</Button>}
              </div>
              <input ref={tone === "dark" ? darkInput : lightInput} type="file" accept="image/png" className="hidden" onChange={(event) => { void uploadLogo(tone, event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </div>;
          })}
        </div>
        <label className="block text-sm font-medium">Logo used for automatic watermarking
          <select className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={settings.logoTone} onChange={(event) => setSettings((current) => ({ ...current, logoTone: event.target.value as "dark" | "light" }))}>
            <option value="dark">Dark logo</option><option value="light">Light logo</option>
          </select>
        </label>
        <p className="text-xs text-slate-500">Use prepared transparent 1200 × 1200 PNG overlays. The selected logo must be uploaded before automatic watermarking can be used.</p>
        <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save watermark settings</Button>
      </>}
    </CardContent>
  </Card>;
}
