import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";

const REFERENCE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const OUTPUT_IMAGE_MAX_BYTES = 7 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const LOGO_OVERLAY_SIZE = 1200;
const OPENAI_IMAGE_MODEL = "gpt-image-2.5-sunburst";

export class ImageEditorError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "ImageEditorError";
  }
}

type DecodedImage = {
  buffer: Buffer;
  mimeType: string;
};

function decodeImageDataUrl(value: unknown, maxBytes: number, allowedTypes: string[]): DecodedImage {
  const dataUrl = String(value ?? "");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match || dataUrl.length > Math.ceil(maxBytes * 1.38) + 128) {
    throw new ImageEditorError("Choose a valid PNG, JPEG, or WebP image within the file-size limit.");
  }

  const mimeType = match[1].toLowerCase();
  if (!allowedTypes.includes(mimeType)) {
    throw new ImageEditorError("This image format is not supported.");
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new ImageEditorError("The image exceeds the allowed file size.");
  }
  return { buffer, mimeType };
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIp(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  const version = isIP(normalized);
  if (version === 4) return isPublicIpv4(normalized);
  if (version !== 6) return false;
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (firstGroup & 0xe000) === 0x2000 && !normalized.startsWith("2001:db8:");
}

async function assertSafeRemoteImageUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImageEditorError("Enter a valid public HTTPS image URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !url.hostname) {
    throw new ImageEditorError("Only public HTTPS image URLs can be processed.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new ImageEditorError("The image URL must point to a public address.");
  } else {
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      throw new ImageEditorError("The image URL must point to a public address.");
    }
    let addresses: Array<{ address: string }>;
    try {
      addresses = await dnsLookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new ImageEditorError("The image host could not be resolved.");
    }
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
      throw new ImageEditorError("The image URL must point to a public address.");
    }
  }
  return url;
}

async function readRemoteResponse(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ImageEditorError("The reference image is larger than the 20 MB limit.");
  }
  if (!response.body) throw new ImageEditorError("The reference image response was empty.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ImageEditorError("The reference image is larger than the 20 MB limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

async function downloadReferenceImage(rawUrl: string): Promise<Buffer> {
  let currentUrl = rawUrl.trim();
  for (let redirectCount = 0; redirectCount <= 4; redirectCount++) {
    const validatedUrl = await assertSafeRemoteImageUrl(currentUrl);
    const response = await fetch(validatedUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirectCount === 4) throw new ImageEditorError("The image URL redirected too many times.");
      currentUrl = new URL(location, validatedUrl).toString();
      continue;
    }
    if (!response.ok) throw new ImageEditorError(`The reference image could not be downloaded (HTTP ${response.status}).`);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
      throw new ImageEditorError("The URL must return a PNG, JPEG, or WebP image.");
    }
    return readRemoteResponse(response, REMOTE_IMAGE_MAX_BYTES);
  }
  throw new ImageEditorError("The reference image could not be downloaded.");
}

async function normalizeReferenceImage(buffer: Buffer): Promise<string> {
  const metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata().catch(() => null);
  if (!metadata || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) {
    throw new ImageEditorError("The reference image could not be decoded. Use a PNG, JPEG, or WebP image.");
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw new ImageEditorError("The reference image dimensions are too large.");
  }
  const normalized = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 88 })
    .toBuffer();
  return `data:image/jpeg;base64,${normalized.toString("base64")}`;
}

async function normalizeLogo(dataUrl: unknown): Promise<Buffer> {
  const { buffer } = decodeImageDataUrl(dataUrl, LOGO_MAX_BYTES, ["image/png"]);
  const metadata = await sharp(buffer, { limitInputPixels: 20_000_000 }).metadata().catch(() => null);
  if (!metadata || metadata.format !== "png" || !metadata.hasAlpha || !metadata.width || !metadata.height) {
    throw new ImageEditorError("Upload a valid transparent PNG logo.");
  }
  if (metadata.width !== LOGO_OVERLAY_SIZE || metadata.height !== LOGO_OVERLAY_SIZE) {
    throw new ImageEditorError(
      `Use a ${LOGO_OVERLAY_SIZE} × ${LOGO_OVERLAY_SIZE} transparent PNG overlay with the logo already positioned.`,
    );
  }
  const alphaStats = await sharp(buffer, { limitInputPixels: 20_000_000 }).ensureAlpha().stats().catch(() => null);
  const alpha = alphaStats?.channels[3];
  if (!alpha || alpha.max === 0 || alpha.min >= 255) {
    throw new ImageEditorError("The logo must include visible artwork and transparent pixels.");
  }
  return buffer;
}

async function applyLogoOverlay(imageBuffer: Buffer, logoBuffer: Buffer): Promise<Buffer> {
  const logoMetadata = await sharp(logoBuffer, { limitInputPixels: 20_000_000 }).metadata();
  if (logoMetadata.width !== LOGO_OVERLAY_SIZE || logoMetadata.height !== LOGO_OVERLAY_SIZE) {
    throw new ImageEditorError("The transparent logo overlay must remain 1200 × 1200 pixels.");
  }
  const baseImage = await sharp(imageBuffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(LOGO_OVERLAY_SIZE, LOGO_OVERLAY_SIZE, { fit: "fill" })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 88 })
    .toBuffer();
  const baseMetadata = await sharp(baseImage).metadata();
  if (!baseMetadata.width || !baseMetadata.height) throw new ImageEditorError("The generated image could not be processed.", 502);

  let output = await sharp(baseImage)
    .composite([{
      input: logoBuffer,
      left: 0,
      top: 0,
    }])
    .jpeg({ quality: 88 })
    .toBuffer();

  if (output.length > OUTPUT_IMAGE_MAX_BYTES) {
    output = await sharp(output, { limitInputPixels: MAX_IMAGE_PIXELS })
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
  }
  if (output.length > OUTPUT_IMAGE_MAX_BYTES) {
    throw new ImageEditorError("The processed image is too large to download or upload.", 502);
  }
  return output;
}

function buildPrompt(generalDirection: string, specificCustomization: string): string {
  const parts = [
    "Create one polished square ecommerce product image based on the following direction.",
    `General direction: ${generalDirection.trim()}`,
  ];
  if (specificCustomization.trim()) {
    parts.push(`Additional specific customization: ${specificCustomization.trim()}`);
  }
  parts.push(
    "If a reference image is provided, use it as the product reference and preserve the product's recognizable shape, materials, packaging, and existing marks unless the customization explicitly requests a change.",
    "Do not add a separate logo, watermark, signature, or extra lettering; a supplied business logo will be applied after generation.",
    "Use a clean, professional composition suitable for a BigCommerce product listing.",
  );
  return parts.join("\n\n");
}

async function generateOpenAiImage(apiKey: string, prompt: string, referenceImageDataUrl?: string): Promise<Buffer> {
  const hasReference = Boolean(referenceImageDataUrl);
  const response = await fetch(
    `https://api.openai.com/v1/images/${hasReference ? "edits" : "generations"}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        ...(hasReference ? {
          images: [{ image_url: referenceImageDataUrl }],
        } : {}),
        n: 1,
        size: "1024x1024",
        quality: "medium",
        background: "opaque",
        output_format: "jpeg",
        output_compression: 90,
      }),
      signal: AbortSignal.timeout(180_000),
    },
  );

  const body = await response.json().catch(() => null) as any;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ImageEditorError("OpenAI rejected the configured API key or image-generation access.", 502);
    }
    if (response.status === 429) {
      const providerError = body?.error ?? {};
      const providerCode = String(providerError.code ?? "").toLowerCase();
      const providerType = String(providerError.type ?? "").toLowerCase();
      const providerMessage = String(providerError.message ?? "").toLowerCase();
      const errorDescription = `${providerCode} ${providerType} ${providerMessage}`;

      console.warn("[Image Editor] OpenAI returned HTTP 429:", JSON.stringify({
        code: providerCode.slice(0, 80) || undefined,
        type: providerType.slice(0, 80) || undefined,
        requestId: response.headers.get("x-request-id")?.slice(0, 100) || undefined,
        retryAfter: response.headers.get("retry-after")?.slice(0, 80) || undefined,
      }));

      if (
        /\binsufficient_quota\b|\bbilling_hard_limit_reached\b/.test(errorDescription)
        || /\b(quota|billing|credit balance|spending limit)\b/.test(providerMessage)
      ) {
        throw new ImageEditorError(
          "The OpenAI API account configured for this app has no available quota. Check its billing status and usage limits, then try again.",
          503,
        );
      }
      if (/rate_limit_exceeded|rate limit|too many requests|requests per minute/.test(errorDescription)) {
        throw new ImageEditorError(
          "OpenAI's image-generation rate limit was reached. Wait a few minutes before retrying; if it keeps happening, check the API account's image-generation limits.",
          503,
        );
      }
      throw new ImageEditorError(
        "OpenAI returned a rate-limit response. Wait briefly, then check the API account's billing and usage limits if it persists.",
        503,
      );
    }
    const detail = String(body?.error?.message ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
    throw new ImageEditorError(detail || `OpenAI image generation failed (HTTP ${response.status}).`, 502);
  }

  const imageBase64 = String(body?.data?.[0]?.b64_json ?? "");
  if (!imageBase64 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    throw new ImageEditorError("OpenAI returned an unreadable image. Please try again.", 502);
  }
  return Buffer.from(imageBase64, "base64");
}

export async function generateImageEditorOutput(input: {
  apiKey: string;
  generalDirection: string;
  specificCustomization: string;
  referenceImageDataUrl?: string;
  referenceImageUrl?: string;
  logoDataUrl: string;
}): Promise<Buffer> {
  if (!input.apiKey) throw new ImageEditorError("OpenAI image generation is not configured.", 503);
  const direction = String(input.generalDirection ?? "").trim();
  const customization = String(input.specificCustomization ?? "").trim();
  if (direction.length < 3 || direction.length > 1500 || customization.length > 2000) {
    throw new ImageEditorError("Enter a general direction and keep each instruction within the stated character limit.");
  }

  const dataUrl = String(input.referenceImageDataUrl ?? "").trim();
  const imageUrl = String(input.referenceImageUrl ?? "").trim();
  if (dataUrl && imageUrl) throw new ImageEditorError("Choose either an uploaded reference image or an image URL, not both.");
  if (imageUrl.length > 2048) throw new ImageEditorError("The image URL is too long.");

  const logo = await normalizeLogo(input.logoDataUrl);
  let referenceImage: string | undefined;
  if (dataUrl) {
    const decoded = decodeImageDataUrl(dataUrl, REFERENCE_IMAGE_MAX_BYTES, ["image/png", "image/jpeg", "image/webp"]);
    referenceImage = await normalizeReferenceImage(decoded.buffer);
  } else if (imageUrl) {
    referenceImage = await normalizeReferenceImage(await downloadReferenceImage(imageUrl));
  }

  const generated = await generateOpenAiImage(input.apiKey, buildPrompt(direction, customization), referenceImage);
  return applyLogoOverlay(generated, logo);
}

export function decodeGeneratedImageDataUrl(value: unknown): Buffer {
  return decodeImageDataUrl(value, OUTPUT_IMAGE_MAX_BYTES, ["image/jpeg"]).buffer;
}