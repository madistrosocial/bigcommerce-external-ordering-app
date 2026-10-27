import { getSetting } from "@/lib/api";

export type ProductPhotoWatermarkSettings = {
  hasSavedSettings?: boolean;
  enabled: boolean;
  logoTone: "dark" | "light";
  darkLogoDataUrl: string;
  darkLogoFileName: string;
  lightLogoDataUrl: string;
  lightLogoFileName: string;
};

const SETTING_KEY = "product_photo_watermark";

export async function loadProductPhotoWatermarkSettings(): Promise<ProductPhotoWatermarkSettings> {
  const { value } = await getSetting(SETTING_KEY);
  return {
    hasSavedSettings: value != null,
    enabled: value?.enabled === true,
    logoTone: value?.logoTone === "light" ? "light" : "dark",
    darkLogoDataUrl: typeof value?.darkLogoDataUrl === "string" ? value.darkLogoDataUrl : "",
    darkLogoFileName: typeof value?.darkLogoFileName === "string" ? value.darkLogoFileName : "",
    lightLogoDataUrl: typeof value?.lightLogoDataUrl === "string" ? value.lightLogoDataUrl : "",
    lightLogoFileName: typeof value?.lightLogoFileName === "string" ? value.lightLogoFileName : "",
  };
}

export async function applyProductPhotoWatermark(
  imageDataUrl: string,
  settings: ProductPhotoWatermarkSettings,
): Promise<string> {
  if (!settings.enabled) return imageDataUrl;
  const logo = settings.logoTone === "light" ? settings.lightLogoDataUrl : settings.darkLogoDataUrl;
  if (!logo) throw new Error(`Automatic watermarking is on, but the ${settings.logoTone} logo is not configured in Admin Settings.`);

  const [base, overlay] = await Promise.all([
    loadImage(imageDataUrl),
    loadImage(logo),
  ]);
  if (overlay.naturalWidth !== 1200 || overlay.naturalHeight !== 1200) {
    throw new Error("The saved watermark logo must be a 1200 × 1200 PNG.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the watermarked photo.");
  context.drawImage(base, 0, 0, canvas.width, canvas.height);
  context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.7, 0.58]) {
    const output = canvas.toDataURL("image/jpeg", quality);
    if (output.length <= 1_300_000) return output;
  }
  throw new Error("The watermarked photo is still too large. Use a smaller source image.");
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the photo or saved watermark logo."));
    image.src = source;
  });
}
