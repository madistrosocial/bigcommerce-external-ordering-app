import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Package,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/api";
import {
  loadImageEditorSettings,
  saveImageEditorSettings,
  type ImageEditorSettings,
} from "@/lib/image-editor-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_REFERENCE_FILE_BYTES = 4 * 1024 * 1024;
const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024;
const LOGO_OVERLAY_SIZE = 1200;
const ALLOWED_REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type BigCommerceProduct = {
  id: number;
  name: string;
  sku: string;
  image: string;
  variantSkus: string[];
};

type UploadResult = {
  imageUrl: string;
  productName: string;
};

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The selected image could not be read."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function responseJson(response: Response): Promise<any> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (HTTP ${response.status}).`);
  }
  return body;
}

export default function ImageEditor() {
  const { toast } = useToast();
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const settingsEditedRef = useRef({
    generalDirection: false,
    specificCustomization: false,
    logo: false,
  });

  const [generalDirection, setGeneralDirection] = useState("");
  const [specificCustomization, setSpecificCustomization] = useState("");
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState("");
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [logoFileName, setLogoFileName] = useState("");
  const [settingsReady, setSettingsReady] = useState(false);
  const [savedSettings, setSavedSettings] = useState<ImageEditorSettings | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsStorageError, setSettingsStorageError] = useState("");
  const [isDraggingReference, setIsDraggingReference] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<BigCommerceProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<BigCommerceProduct | null>(null);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const clearGeneratedImage = () => {
    setGeneratedImage("");
    setUploadResult(null);
  };

  const setReferenceFile = async (file?: File) => {
    if (!file) return;
    if (!ALLOWED_REFERENCE_TYPES.includes(file.type)) {
      toast({
        title: "Unsupported reference image",
        description: "Choose a PNG, JPEG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_REFERENCE_FILE_BYTES) {
      toast({
        title: "Reference image is too large",
        description: "Uploaded reference images must be 4 MB or smaller.",
        variant: "destructive",
      });
      return;
    }
    try {
      setReferenceImageDataUrl(await fileAsDataUrl(file));
      setReferenceImageFile(file);
      setReferenceImageUrl("");
      clearGeneratedImage();
    } catch (error) {
      toast({
        title: "Could not read reference image",
        description: error instanceof Error ? error.message : "Choose the image again.",
        variant: "destructive",
      });
    }
  };

  const setLogo = async (file?: File) => {
    if (!file) return;
    if (file.type !== "image/png") {
      toast({
        title: "Use a transparent PNG logo",
        description: "Upload a 1200 × 1200 transparent PNG overlay with the logo already positioned.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_LOGO_FILE_BYTES) {
      toast({
        title: "Logo file is too large",
        description: "The 1200 × 1200 transparent PNG overlay must be 2 MB or smaller.",
        variant: "destructive",
      });
      return;
    }
    let hasCorrectOverlaySize = false;
    try {
      const bitmap = await createImageBitmap(file);
      hasCorrectOverlaySize = bitmap.width === LOGO_OVERLAY_SIZE && bitmap.height === LOGO_OVERLAY_SIZE;
      bitmap.close();
    } catch {
      toast({
        title: "Could not read logo",
        description: "Choose a valid 1200 × 1200 transparent PNG overlay.",
        variant: "destructive",
      });
      return;
    }
    if (!hasCorrectOverlaySize) {
      toast({
        title: "Incorrect logo overlay size",
        description: "Use a 1200 × 1200 transparent PNG with the logo already positioned where it should appear.",
        variant: "destructive",
      });
      return;
    }
    settingsEditedRef.current.logo = true;
    try {
      setLogoDataUrl(await fileAsDataUrl(file));
      setLogoFileName(file.name);
      clearGeneratedImage();
    } catch (error) {
      toast({
        title: "Could not read logo",
        description: error instanceof Error ? error.message : "Choose the logo again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const restoreSettings = async () => {
      try {
        const settings = await loadImageEditorSettings();
        if (cancelled) return;
        if (settings) {
          if (!settingsEditedRef.current.generalDirection) {
            setGeneralDirection(settings.generalDirection);
          }
          if (!settingsEditedRef.current.specificCustomization) {
            setSpecificCustomization(settings.specificCustomization);
          }
          if (!settingsEditedRef.current.logo) {
            setLogoDataUrl(settings.logoDataUrl);
            setLogoFileName(settings.logoFileName);
          }
          setSavedSettings(settings);
        }
      } catch {
        if (!cancelled) setSettingsStorageError("Saved settings could not be loaded from this browser.");
      } finally {
        if (!cancelled) setSettingsReady(true);
      }
    };

    void restoreSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasUnsavedSettings = settingsReady && (
    savedSettings
      ? generalDirection !== savedSettings.generalDirection
        || specificCustomization !== savedSettings.specificCustomization
        || logoDataUrl !== savedSettings.logoDataUrl
        || logoFileName !== savedSettings.logoFileName
      : Boolean(generalDirection || specificCustomization || logoDataUrl || logoFileName)
  );

  const saveSettings = async () => {
    const settings: ImageEditorSettings = {
      generalDirection,
      specificCustomization,
      logoDataUrl,
      logoFileName,
    };
    setIsSavingSettings(true);
    setSettingsStorageError("");
    try {
      await saveImageEditorSettings(settings);
      setSavedSettings(settings);
      settingsEditedRef.current = {
        generalDirection: false,
        specificCustomization: false,
        logo: false,
      };
      toast({
        title: "Editor setup saved",
        description: "Your directions and logo are saved in this browser.",
      });
    } catch {
      setSettingsStorageError("This browser could not save your setup. Check its storage settings and try again.");
      toast({
        title: "Could not save editor setup",
        description: "Browser storage is unavailable. Your current fields are still on this page.",
        variant: "destructive",
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  useEffect(() => {
    const query = productQuery.trim();
    if (query.length < 2) {
      setProducts([]);
      setProductSearchError("");
      setIsSearchingProducts(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchingProducts(true);
      setProductSearchError("");
      try {
        const response = await fetch(`/api/tools/image-editor/products?q=${encodeURIComponent(query)}`, {
          headers: getAuthHeaders(),
        });
        const results = await responseJson(response);
        if (!cancelled) setProducts(Array.isArray(results) ? results : []);
      } catch (error) {
        if (!cancelled) {
          setProducts([]);
          setProductSearchError(error instanceof Error ? error.message : "Product search failed.");
        }
      } finally {
        if (!cancelled) setIsSearchingProducts(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productQuery]);

  const generateImage = async () => {
    if (generalDirection.trim().length < 3) {
      toast({ title: "Add a general direction", description: "Describe the image you want to create." });
      return;
    }
    if (!logoDataUrl) {
      toast({ title: "Upload your logo", description: "A transparent PNG logo is required for the final image." });
      return;
    }

    setIsGenerating(true);
    setUploadResult(null);
    setProductQuery("");
    setProducts([]);
    setSelectedProduct(null);
    try {
      const response = await fetch("/api/tools/image-editor/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          generalDirection,
          specificCustomization,
          referenceImageDataUrl,
          referenceImageUrl: referenceImageUrl.trim(),
          logoDataUrl,
        }),
      });
      const payload = await responseJson(response);
      if (typeof payload?.imageDataUrl !== "string" || !payload.imageDataUrl.startsWith("data:image/jpeg;base64,")) {
        throw new Error("The image service returned an invalid result. Please try again.");
      }
      setGeneratedImage(payload.imageDataUrl);
      toast({ title: "Image ready", description: "Your 1200 × 1200 logo overlay was added at its original size and position." });
    } catch (error) {
      toast({
        title: "Image generation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const uploadToBigCommerce = async () => {
    if (!generatedImage || !selectedProduct) return;
    setIsUploading(true);
    try {
      const response = await fetch("/api/tools/image-editor/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ productId: selectedProduct.id, imageDataUrl: generatedImage }),
      });
      const payload = await responseJson(response);
      setUploadResult({
        imageUrl: String(payload?.imageUrl ?? ""),
        productName: String(payload?.productName || selectedProduct.name),
      });
      toast({
        title: "Image uploaded",
        description: `The new product image was added to ${selectedProduct.name}.`,
      });
    } catch (error) {
      toast({
        title: "BigCommerce upload failed",
        description: error instanceof Error ? error.message : "Check the store connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReferenceDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingReference(false);
    void setReferenceFile(event.dataTransfer.files[0]);
  };

  const handleLogoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingLogo(false);
    void setLogo(event.dataTransfer.files[0]);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Image Editor</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Generate a product image from a prompt or edit a reference, then add it to a BigCommerce product.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit gap-1">
          <ImageIcon className="h-3.5 w-3.5" />
          OpenAI image generation
        </Badge>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Add a reference image (optional)</CardTitle>
              <CardDescription>
                Drop in a product photo or provide a public HTTPS image URL. If you skip this, the image is created from your directions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
                  isDraggingReference ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50/70"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingReference(true);
                }}
                onDragLeave={() => setIsDraggingReference(false)}
                onDrop={handleReferenceDrop}
                data-testid="reference-image-dropzone"
              >
                {referenceImageDataUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={referenceImageDataUrl}
                      alt="Reference image preview"
                      className="max-h-40 max-w-full rounded-md border bg-white object-contain"
                    />
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="max-w-56 truncate">{referenceImageFile?.name || "Reference image"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setReferenceImageDataUrl("");
                          setReferenceImageFile(null);
                          clearGeneratedImage();
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                        aria-label="Remove reference image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-white p-2 text-slate-500 shadow-sm">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-medium text-slate-700">Drop a product image here</div>
                    <div className="text-xs text-slate-500">PNG, JPEG, or WebP · 4 MB maximum</div>
                    <Button type="button" variant="outline" size="sm" onClick={() => referenceFileInputRef.current?.click()}>
                      Choose image
                    </Button>
                  </div>
                )}
                <input
                  ref={referenceFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    void setReferenceFile(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                  data-testid="reference-image-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference-image-url">Or use an image URL</Label>
                <Input
                  id="reference-image-url"
                  type="url"
                  placeholder="https://example.com/product-image.jpg"
                  value={referenceImageUrl}
                  onChange={(event) => {
                    const value = event.target.value;
                    setReferenceImageUrl(value);
                    if (value.trim()) {
                      setReferenceImageDataUrl("");
                      setReferenceImageFile(null);
                    }
                    clearGeneratedImage();
                  }}
                  data-testid="reference-image-url"
                />
                <p className="text-xs text-slate-500">The server accepts public HTTPS image URLs only.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Describe the image</CardTitle>
              <CardDescription>Keep the overall direction separate from any specific changes or details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="general-direction">General direction</Label>
                <Textarea
                  id="general-direction"
                  value={generalDirection}
                  onChange={(event) => {
                    settingsEditedRef.current.generalDirection = true;
                    setGeneralDirection(event.target.value);
                    clearGeneratedImage();
                  }}
                  maxLength={1500}
                  rows={4}
                  placeholder="Describe the overall image, setting, mood, lighting, and composition you want."
                  data-testid="image-editor-general-direction"
                />
                <div className="text-right text-xs text-slate-400">{generalDirection.length}/1500</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specific-customization">Specific customization</Label>
                <Textarea
                  id="specific-customization"
                  value={specificCustomization}
                  onChange={(event) => {
                    settingsEditedRef.current.specificCustomization = true;
                    setSpecificCustomization(event.target.value);
                    clearGeneratedImage();
                  }}
                  maxLength={2000}
                  rows={3}
                  placeholder="Add exact edits, colors, background requirements, or details to preserve."
                  data-testid="image-editor-specific-customization"
                />
                <div className="text-right text-xs text-slate-400">{specificCustomization.length}/2000</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Add your logo</CardTitle>
              <CardDescription>
                Upload the 1200 × 1200 transparent overlay with the logo already positioned. The editor preserves its size and placement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-5 text-center transition-colors sm:flex-row sm:text-left ${
                  isDraggingLogo ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50/70"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingLogo(true);
                }}
                onDragLeave={() => setIsDraggingLogo(false)}
                onDrop={handleLogoDrop}
                data-testid="logo-dropzone"
              >
                {logoDataUrl ? (
                  <img src={logoDataUrl} alt="Logo preview" className="h-16 w-28 rounded border bg-white object-contain p-2" />
                ) : (
                  <div className="flex h-16 w-28 items-center justify-center rounded border bg-white text-slate-400">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-700">{logoFileName || "Drop a transparent PNG logo"}</div>
                  <div className="mt-1 text-xs text-slate-500">1200 × 1200 transparent PNG · 2 MB maximum · no logo resizing or repositioning</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => logoFileInputRef.current?.click()}>
                    {logoDataUrl ? "Replace logo" : "Choose logo"}
                  </Button>
                  {logoDataUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove logo"
                      onClick={() => {
                        settingsEditedRef.current.logo = true;
                        setLogoDataUrl("");
                        setLogoFileName("");
                        clearGeneratedImage();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(event) => {
                    void setLogo(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                  data-testid="image-editor-logo-input"
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Each generation uses your OpenAI account. Limit: 10 generations per user per hour.
              </p>
              <div className="mt-4 space-y-2 border-t pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    className={`text-xs ${settingsStorageError ? "text-red-600" : "text-slate-500"}`}
                    aria-live="polite"
                    data-testid="image-editor-settings-status"
                  >
                    {!settingsReady
                      ? "Loading saved setup…"
                      : settingsStorageError
                        ? settingsStorageError
                        : hasUnsavedSettings
                          ? "You have unsaved changes."
                          : savedSettings
                            ? "Your setup is saved in this browser."
                            : "No setup saved yet."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void saveSettings()}
                    disabled={!settingsReady || isSavingSettings || !hasUnsavedSettings}
                    data-testid="save-image-editor-settings"
                  >
                    {isSavingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSavingSettings ? "Saving setup…" : "Save setup"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Saved in this browser only. Your directions and logo are not synced to other devices.
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => void generateImage()}
            disabled={isGenerating || !logoDataUrl || generalDirection.trim().length < 3}
            data-testid="generate-image-button"
          >
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isGenerating ? "Generating image…" : "Generate image"}
          </Button>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Result</CardTitle>
              <CardDescription>Your finished image includes the uploaded logo and is ready to download or add to a product.</CardDescription>
            </CardHeader>
            <CardContent>
              {isGenerating ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-slate-50 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <div className="text-sm font-medium text-slate-700">Creating your image</div>
                  <div className="max-w-xs text-xs text-slate-500">This can take a little while. Keep this page open until it finishes.</div>
                </div>
              ) : generatedImage ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-lg border bg-slate-50">
                    <img src={generatedImage} alt="Generated product image with logo overlay" className="aspect-square w-full object-contain" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={generatedImage}
                      download="image-editor-product.jpg"
                      className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                      data-testid="download-generated-image"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download JPG
                    </a>
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Logo applied
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50 px-5 text-center">
                  <div className="rounded-full bg-white p-3 text-slate-400 shadow-sm">
                    <ImageIcon className="h-7 w-7" />
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-700">Your image will appear here</div>
                  <p className="mt-1 max-w-xs text-xs text-slate-500">Add your direction and a transparent PNG logo, then generate an image.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {generatedImage && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-indigo-600" />
                  Add to BigCommerce
                </CardTitle>
                <CardDescription>Search by product name or SKU. The new image is appended; existing product images are not replaced.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedProduct ? (
                  <div className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3">
                    {selectedProduct.image ? (
                      <img src={selectedProduct.image} alt="" className="h-12 w-12 rounded border bg-white object-contain" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded border bg-white text-slate-400">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{selectedProduct.name}</div>
                      <div className="truncate text-xs text-slate-500">SKU: {selectedProduct.sku || "Not set"}</div>
                    </div>
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                      aria-label="Clear selected product"
                      onClick={() => {
                        setSelectedProduct(null);
                        setUploadResult(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="bc-product-search">Product name or SKU</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="bc-product-search"
                        className="pl-9 pr-9"
                        placeholder="Search BigCommerce products…"
                        value={productQuery}
                        onChange={(event) => {
                          setProductQuery(event.target.value);
                          setSelectedProduct(null);
                          setUploadResult(null);
                        }}
                        autoComplete="off"
                        data-testid="image-editor-product-search"
                      />
                      {isSearchingProducts && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                      )}
                    </div>
                    {productQuery.trim().length >= 2 && !isSearchingProducts && !productSearchError && products.length === 0 && (
                      <div className="rounded-md border bg-white px-3 py-2 text-sm text-slate-500">No matching products found.</div>
                    )}
                    {productSearchError && <p className="text-sm text-red-600">{productSearchError}</p>}
                    {products.length > 0 && (
                      <div className="max-h-64 overflow-auto rounded-md border bg-white shadow-sm">
                        {products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setSelectedProduct(product);
                              setProductQuery("");
                              setProducts([]);
                              setUploadResult(null);
                            }}
                            data-testid={`image-editor-product-${product.id}`}
                          >
                            {product.image ? (
                              <img src={product.image} alt="" className="h-10 w-10 rounded border bg-white object-contain" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded border bg-slate-50 text-slate-400">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-800">{product.name}</span>
                              <span className="block truncate text-xs text-slate-500">
                                SKU: {product.sku || "Not set"}
                                {product.variantSkus.length > 0 && ` · ${product.variantSkus.length} variant SKU${product.variantSkus.length === 1 ? "" : "s"}`}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => void uploadToBigCommerce()}
                  disabled={!selectedProduct || isUploading || Boolean(uploadResult)}
                  data-testid="upload-to-bigcommerce-button"
                >
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {isUploading ? "Uploading image…" : "Upload image to product"}
                </Button>

                {uploadResult && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div className="font-medium">Added to {uploadResult.productName}</div>
                        {uploadResult.imageUrl && (
                          <a
                            href={uploadResult.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2"
                          >
                            View uploaded image <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}