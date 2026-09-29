import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import { getKoleExtendedCost } from "@shared/kole-pricing";
import type { DropshipProduct } from "@shared/schema";
import type { IStorage } from "./storage";
import { normalizeKoleSku } from "./koleSkuMapping";

export type KoleProductSyncKind = "details" | "images";
export type KoleProductSyncField = "cost" | "description" | "inventory" | "identity";
export type KoleProductSyncItemStatus =
  | "pending"
  | "in_progress"
  | "updated"
  | "unchanged"
  | "failed"
  | "skipped";

export interface KoleProductSyncJobSummary {
  id: number;
  kind: KoleProductSyncKind;
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  updated: number;
  unchanged: number;
  failed: number;
  skipped: number;
  photosAdded: number;
  selectedFields: KoleProductSyncField[];
  forceImageReupload?: boolean;
  currentSku: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface KoleProductSyncItem {
  productId: number;
  vendorSku: string;
  title: string;
  upc: string;
  bigcommerceProductId: number;
  bigcommerceVariantId: number | null;
  status: KoleProductSyncItemStatus;
  updatedFields: string[];
  photosAdded: number;
  error: string | null;
}

export interface KoleProductSyncItemsPage {
  rows: KoleProductSyncItem[];
  total: number;
  page: number;
  limit: number;
}

interface ProductSyncStorage extends Pick<IStorage, "getDropshipProducts" | "getDropshipProduct" | "getSetting" | "setSetting"> {}

interface BigCommerceCredentials {
  storeHash: string;
  token: string;
  headers: Record<string, string>;
}

interface BrandOption {
  id: number;
  name: string;
}

interface ProductSyncManagerOptions {
  storage: ProductSyncStorage;
  getBigCommerceCredentials: () => Promise<BigCommerceCredentials>;
  fetchBigCommerce: (url: string, init: RequestInit) => Promise<Response>;
  getBigCommerceBrands: () => Promise<BrandOption[]>;
  downloadImage?: (sourceUrl: string) => Promise<Buffer>;
  createWatermarkedImage?: (sourceBuffer: Buffer, logoBuffer: Buffer) => Promise<Buffer>;
}

interface InternalProductSyncJob {
  summary: KoleProductSyncJobSummary;
  items: KoleProductSyncItem[];
}

interface ProductCandidate {
  product: DropshipProduct;
  item: KoleProductSyncItem;
}

function productRawData(product: DropshipProduct): Record<string, unknown> {
  return product.raw_data && typeof product.raw_data === "object" && !Array.isArray(product.raw_data)
    ? product.raw_data as Record<string, unknown>
    : {};
}

function conflictingParentFields(
  candidates: ProductCandidate[],
  selectedFields: KoleProductSyncField[],
): Set<KoleProductSyncField> {
  const conflicts = new Set<KoleProductSyncField>();
  if (candidates.length < 2) return conflicts;

  const hasMultiple = (values: string[]) => new Set(values.filter(Boolean)).size > 1;
  if (selectedFields.includes("cost")) {
    const values = candidates
      .map(({ product }) => getKoleExtendedCost(productRawData(product), product.cost))
      .filter((value): value is number => value !== null)
      .map((value) => (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
    if (hasMultiple(values)) conflicts.add("cost");
  }
  if (selectedFields.includes("description")) {
    const values = candidates.map(({ product }) => String(product.description ?? "").trim());
    if (hasMultiple(values)) conflicts.add("description");
  }
  if (selectedFields.includes("identity")) {
    const titles = candidates.map(({ product }) => String(product.title ?? "").trim());
    const upcs = candidates.map(({ product }) => String(product.upc ?? "").trim());
    const brands = candidates.map(({ product }) => productIdentityBrandKey(product.brand));
    if (hasMultiple(titles) || hasMultiple(upcs) || hasMultiple(brands)) conflicts.add("identity");
  }
  return conflicts;
}

interface ProductOutcome {
  status: Exclude<KoleProductSyncItemStatus, "pending" | "in_progress">;
  updatedFields?: string[];
  photosAdded?: number;
  error?: string | null;
}

export class KoleProductSyncError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "KoleProductSyncError";
    this.statusCode = statusCode;
  }
}

const LOGO_SETTING_KEY = "dropshipping_product_sync_watermark_logo";
const LATEST_SETTING_KEYS: Record<KoleProductSyncKind, string> = {
  details: "dropshipping_product_sync_latest_details",
  images: "dropshipping_product_sync_latest_images",
};
const IMAGE_LEDGER_PREFIX = "dropship_kole_watermarked_photo_sync_";
const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_MAX_PIXELS = 50_000_000;
const BIGCOMMERCE_IMAGE_LIMIT_BYTES = 8 * 1024 * 1024;
const SYNC_CONCURRENCY = 3;
const CHECKPOINT_EVERY = 250;

function unwrapSetting(row: any): any {
  return row && typeof row === "object" && Object.prototype.hasOwnProperty.call(row, "value")
    ? row.value
    : row;
}

function publicSummary(job: InternalProductSyncJob): KoleProductSyncJobSummary {
  return { ...job.summary, selectedFields: [...job.summary.selectedFields] };
}

function clampPage(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 25;
}

function safeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return text.replace(/https?:\/\/\S+/gi, "[image URL]").slice(0, 300);
}

function normalizedImageUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:" || url.username || url.password) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
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
  // Only allow globally-routable unicast IPv6 (2000::/3). This excludes
  // loopback, link-local, unique-local, multicast, and IPv4-mapped ranges.
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (firstGroup & 0xe000) === 0x2000 && !normalized.startsWith("2001:db8:");
}

async function assertSafeImageUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("The supplier provided an invalid image URL.");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
    || !url.hostname
  ) {
    throw new Error("Only public HTTPS image URLs can be processed.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("The image URL does not point to a public address.");
  } else {
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      throw new Error("The image URL does not point to a public address.");
    }
    let addresses: Array<{ address: string }>;
    try {
      addresses = await dnsLookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("The supplier image host could not be resolved.");
    }
    if (addresses.length === 0 || addresses.some((entry) => !isPublicIp(entry.address))) {
      throw new Error("The image URL does not point to a public address.");
    }
  }
  return url;
}

async function readResponseWithLimit(response: Response, limitBytes: number): Promise<Buffer> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > limitBytes) {
    throw new Error("The supplier image exceeds the permitted download size.");
  }
  if (!response.body) throw new Error("The supplier image response was empty.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > limitBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("The supplier image exceeds the permitted download size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

async function downloadKoleImage(sourceUrl: string): Promise<Buffer> {
  let currentUrl = sourceUrl;
  for (let redirectCount = 0; redirectCount <= 4; redirectCount++) {
    const validatedUrl = await assertSafeImageUrl(currentUrl);
    const response = await fetch(validatedUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "image/*" },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirectCount === 4) throw new Error("The supplier image redirected too many times.");
      currentUrl = new URL(location, validatedUrl).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Supplier image download failed (${response.status}).`);
    if (!(response.headers.get("content-type") || "").toLowerCase().startsWith("image/")) {
      throw new Error("The supplier image URL did not return an image.");
    }
    return readResponseWithLimit(response, IMAGE_MAX_BYTES);
  }
  throw new Error("The supplier image could not be downloaded.");
}

async function normalizeLogo(dataUrl: string): Promise<string> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new KoleProductSyncError("Upload a transparent PNG logo.");
  if (dataUrl.length > 4_500_000) throw new KoleProductSyncError("The logo file must be 3 MB or smaller.");
  const input = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (input.length === 0 || input.length > 3 * 1024 * 1024) {
    throw new KoleProductSyncError("The logo file must be 3 MB or smaller.");
  }

  const metadata = await sharp(input, { limitInputPixels: 20_000_000 }).metadata().catch(() => null);
  if (!metadata) {
    throw new KoleProductSyncError("The logo file could not be decoded.");
  }
  if (metadata.format !== "png" || !metadata.hasAlpha) {
    throw new KoleProductSyncError("The logo must be a transparent PNG.");
  }
  if (!metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000) {
    throw new KoleProductSyncError("The logo dimensions are not supported.");
  }

  const alphaStats = await sharp(input, { limitInputPixels: 20_000_000 }).ensureAlpha().stats().catch(() => null);
  const alphaChannel = alphaStats?.channels[3];
  if (!alphaChannel || alphaChannel.min >= 255 || alphaChannel.max === 0) {
    throw new KoleProductSyncError("The logo PNG must contain visible artwork and transparent pixels.");
  }

  const normalized = await sharp(input, { limitInputPixels: 20_000_000 })
    .resize(1200, 1200, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return `data:image/png;base64,${normalized.toString("base64")}`;
}

function dataUrlBuffer(value: unknown): Buffer | null {
  const dataUrl = String(value ?? "");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  return buffer.length ? buffer : null;
}

async function createWatermarkedJpeg(sourceBuffer: Buffer, logoBuffer: Buffer): Promise<Buffer> {
  const squarePhoto = await sharp(sourceBuffer, { limitInputPixels: IMAGE_MAX_PIXELS })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(1200, 1200, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const watermarked = await sharp(squarePhoto, { limitInputPixels: IMAGE_MAX_PIXELS })
    .composite([{ input: logoBuffer, left: 0, top: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();

  if (watermarked.length > BIGCOMMERCE_IMAGE_LIMIT_BYTES) {
    throw new Error("The processed image exceeds BigCommerce's 8 MB upload limit.");
  }
  return watermarked;
}

function imageSourceUrls(product: DropshipProduct): string[] {
  const sources = new Set<string>();
  const images = Array.isArray(product.image_data) ? product.image_data as unknown[] : [];
  for (const image of images) {
    const value = typeof image === "string"
      ? image
      : (image as any)?.url || (image as any)?.src || (image as any)?.href || "";
    const url = normalizedImageUrl(value);
    if (url) sources.add(url);
  }
  return Array.from(sources);
}

function productIdentityBrandKey(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function safeImageFilename(sku: string, imageIndex: number): string {
  const safeSku = sku.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "product";
  return `catalog-${safeSku}-${imageIndex + 1}-watermarked.jpg`;
}

function legacyImageFilename(sku: string, imageIndex: number): string {
  const safeSku = sku.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "product";
  return `kole-${safeSku}-${imageIndex + 1}-watermarked.jpg`;
}

function normalizedImageFilename(value: unknown): string {
  const raw = String(value ?? "").trim().split(/[?#]/, 1)[0];
  const filename = raw.slice(raw.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(filename).toLowerCase();
  } catch {
    return filename.toLowerCase();
  }
}

function imageLedgerSettingKey(bigcommerceProductId: number, dropshipProductId: number): string {
  return `${IMAGE_LEDGER_PREFIX}${bigcommerceProductId}_kole_${dropshipProductId}`;
}

function legacyImageLedgerSettingKey(bigcommerceProductId: number): string {
  return `${IMAGE_LEDGER_PREFIX}${bigcommerceProductId}`;
}

export class KoleProductSyncManager {
  private readonly storage: ProductSyncStorage;
  private readonly getBigCommerceCredentials: ProductSyncManagerOptions["getBigCommerceCredentials"];
  private readonly fetchBigCommerce: ProductSyncManagerOptions["fetchBigCommerce"];
  private readonly getBigCommerceBrands: ProductSyncManagerOptions["getBigCommerceBrands"];
  private readonly downloadImage: NonNullable<ProductSyncManagerOptions["downloadImage"]>;
  private readonly createWatermarkedImage: NonNullable<ProductSyncManagerOptions["createWatermarkedImage"]>;
  private readonly jobs = new Map<number, InternalProductSyncJob>();
  private readonly latestJobIdByKind = new Map<KoleProductSyncKind, number>();
  private activeJobId: number | null = null;
  private isStarting = false;

  constructor(options: ProductSyncManagerOptions) {
    this.storage = options.storage;
    this.getBigCommerceCredentials = options.getBigCommerceCredentials;
    this.fetchBigCommerce = options.fetchBigCommerce;
    this.getBigCommerceBrands = options.getBigCommerceBrands;
    this.downloadImage = options.downloadImage ?? downloadKoleImage;
    this.createWatermarkedImage = options.createWatermarkedImage ?? createWatermarkedJpeg;
  }

  async getLogo(): Promise<{ dataUrl: string | null }> {
    const value = unwrapSetting(await this.storage.getSetting(LOGO_SETTING_KEY));
    return { dataUrl: typeof value === "string" ? value : null };
  }

  async getImageSyncHistory(vendorId: number, productIds: number[]): Promise<Record<number, number>> {
    const ids = Array.from(new Set(productIds.filter((id) => Number.isSafeInteger(id) && id > 0)));
    const products = await Promise.all(ids.map((id) => this.storage.getDropshipProduct(id)));
    const history: Record<number, number> = {};
    for (const product of products) {
      if (!product || product.vendor_id !== vendorId) continue;
      const bigcommerceProductId = Number(product.bigcommerce_product_id);
      if (!Number.isSafeInteger(bigcommerceProductId) || bigcommerceProductId <= 0) continue;
      const saved = unwrapSetting(
        await this.storage.getSetting(imageLedgerSettingKey(bigcommerceProductId, product.id)),
      );
      if (!Array.isArray(saved)) continue;
      const sourceCount = new Set(saved.map(normalizedImageUrl).filter(Boolean)).size;
      if (sourceCount > 0) history[product.id] = sourceCount;
    }
    return history;
  }

  async saveLogo(dataUrl: unknown): Promise<{ ok: true }> {
    if (typeof dataUrl !== "string") throw new KoleProductSyncError("Choose a transparent PNG logo.");
    const normalized = await normalizeLogo(dataUrl);
    await this.storage.setSetting(LOGO_SETTING_KEY, normalized);
    return { ok: true };
  }

  async removeLogo(): Promise<{ ok: true }> {
    await this.storage.setSetting(LOGO_SETTING_KEY, null);
    return { ok: true };
  }

  async start(
    kind: KoleProductSyncKind,
    vendorId: number,
    selectedProductIds: number[],
    selectedFields: KoleProductSyncField[] = [],
    forceImageReupload = false,
  ): Promise<KoleProductSyncJobSummary> {
    if (this.activeJobId !== null || this.isStarting) {
      throw new KoleProductSyncError("A Product Sync job is already running.", 409);
    }
    if (
      !Array.isArray(selectedProductIds)
      || selectedProductIds.length === 0
      || selectedProductIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new KoleProductSyncError("Select at least one valid mapped product.");
    }
    const productIds = Array.from(new Set(selectedProductIds));
    if (productIds.length !== selectedProductIds.length) {
      throw new KoleProductSyncError("The selected product list contains duplicates.");
    }
    if (kind === "details" && selectedFields.length === 0) {
      throw new KoleProductSyncError("Select at least one product detail to sync.");
    }
    if (forceImageReupload && kind !== "images") {
      throw new KoleProductSyncError("Previously uploaded images can only be re-uploaded during Image Sync.");
    }
    const fields = Array.from(new Set(selectedFields));
    this.isStarting = true;
    let createdJobId: number | null = null;
    try {
      let logoBuffer: Buffer | null = null;
      if (kind === "images") {
        const logo = await this.getLogo();
        logoBuffer = dataUrlBuffer(logo.dataUrl);
        if (!logoBuffer) throw new KoleProductSyncError("Save a transparent PNG logo before starting image sync.");
      }
      const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      createdJobId = id;
      const now = new Date().toISOString();
      const summary: KoleProductSyncJobSummary = {
        id,
        kind,
        status: "running",
        total: productIds.length,
        processed: 0,
        updated: 0,
        unchanged: 0,
        failed: 0,
        skipped: 0,
        photosAdded: 0,
        selectedFields: kind === "details" ? fields : [],
        forceImageReupload: kind === "images" && forceImageReupload,
        currentSku: null,
        startedAt: now,
        completedAt: null,
        error: null,
      };
      const job: InternalProductSyncJob = { summary, items: [] };
      this.jobs.set(id, job);
      this.latestJobIdByKind.set(kind, id);
      this.activeJobId = id;
      await this.saveLatest(job, false);
      this.isStarting = false;
      void this.run(job, vendorId, productIds, logoBuffer).catch((error) => {
        void this.failUnexpectedly(job, error);
      });
      return publicSummary(job);
    } catch (error) {
      this.isStarting = false;
      this.activeJobId = null;
      if (createdJobId !== null) {
        this.jobs.delete(createdJobId);
        if (this.latestJobIdByKind.get(kind) === createdJobId) this.latestJobIdByKind.delete(kind);
      }
      throw error;
    }
  }

  async getLatest(kind: KoleProductSyncKind): Promise<KoleProductSyncJobSummary | null> {
    const inMemoryId = this.latestJobIdByKind.get(kind);
    const inMemoryJob = inMemoryId ? this.jobs.get(inMemoryId) : undefined;
    if (inMemoryJob) return publicSummary(inMemoryJob);
    const saved = await this.loadLatest(kind);
    if (!saved) return null;
    if (saved.summary.status === "running") {
      const recoveredItems = (saved.items ?? []).map((item) => item.status === "in_progress"
        ? { ...item, status: "failed" as const, error: "Interrupted while this product was syncing; verify BigCommerce before retrying." }
        : item);
      saved.summary = {
        ...saved.summary,
        status: "failed",
        currentSku: null,
        completedAt: new Date().toISOString(),
        error: "The server restarted during this sync. Check BigCommerce before retrying.",
      };
      saved.items = recoveredItems;
      if (recoveredItems.length > 0) {
        saved.summary.total = recoveredItems.length;
        saved.summary.processed = recoveredItems.filter((item) => item.status !== "pending").length;
        saved.summary.updated = recoveredItems.filter((item) => item.status === "updated").length;
        saved.summary.unchanged = recoveredItems.filter((item) => item.status === "unchanged").length;
        saved.summary.failed = recoveredItems.filter((item) => item.status === "failed").length;
        saved.summary.skipped = recoveredItems.filter((item) => item.status === "skipped").length;
        saved.summary.photosAdded = recoveredItems.reduce((total, item) => total + item.photosAdded, 0);
      }
      await this.storage.setSetting(LATEST_SETTING_KEYS[kind], saved);
    }
    return saved.summary;
  }

  async getJob(id: number): Promise<KoleProductSyncJobSummary | null> {
    const inMemoryJob = this.jobs.get(id);
    if (inMemoryJob) return publicSummary(inMemoryJob);
    for (const kind of ["details", "images"] as const) {
      const saved = await this.loadLatest(kind);
      if (saved?.summary.id === id) return (await this.getLatest(kind)) ?? null;
    }
    return null;
  }

  async getItems(
    id: number,
    params: { page?: unknown; limit?: unknown; search?: unknown } = {},
  ): Promise<KoleProductSyncItemsPage | null> {
    let items: KoleProductSyncItem[] | null = this.jobs.get(id)?.items ?? null;
    if (!items) {
      for (const kind of ["details", "images"] as const) {
        const saved = await this.loadLatest(kind);
        if (saved?.summary.id === id) {
          await this.getLatest(kind);
          items = saved.items ?? [];
          break;
        }
      }
    }
    if (!items) return null;

    const page = clampPage(params.page);
    const limit = clampLimit(params.limit);
    const search = String(params.search ?? "").trim().toLocaleLowerCase();
    const filtered = search
      ? items.filter((item) =>
        item.title.toLocaleLowerCase().includes(search)
        || item.vendorSku.toLocaleLowerCase().includes(search)
        || item.upc.toLocaleLowerCase().includes(search))
      : items;
    const offset = (page - 1) * limit;
    return {
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  private async loadLatest(kind: KoleProductSyncKind): Promise<{ summary: KoleProductSyncJobSummary; items?: KoleProductSyncItem[] } | null> {
    const value = unwrapSetting(await this.storage.getSetting(LATEST_SETTING_KEYS[kind]));
    if (!value || typeof value !== "object" || !value.summary || Number(value.summary.id) <= 0) return null;
    return {
      summary: value.summary as KoleProductSyncJobSummary,
      items: Array.isArray(value.items) ? value.items as KoleProductSyncItem[] : undefined,
    };
  }

  private async saveLatest(job: InternalProductSyncJob, includeItems: boolean): Promise<void> {
    const value = includeItems
      ? { summary: publicSummary(job), items: job.items }
      : { summary: publicSummary(job) };
    await this.storage.setSetting(LATEST_SETTING_KEYS[job.summary.kind], value);
  }

  private async run(
    job: InternalProductSyncJob,
    vendorId: number,
    selectedProductIds: number[],
    logoBuffer: Buffer | null,
  ): Promise<void> {
    try {
      const products: DropshipProduct[] = [];
      let page = 1;
      let rowsRead = 0;
      let expectedTotal = job.summary.total;
      while (true) {
        const result = await this.storage.getDropshipProducts({
          vendorId,
          page,
          limit: 100,
          imported: true,
        });
        products.push(...result.rows);
        rowsRead += result.rows.length;
        expectedTotal = result.total;
        if (result.rows.length === 0 || rowsRead >= expectedTotal) break;
        page++;
      }

      const ownersByBcId = new Map<number, DropshipProduct[]>();
      for (const product of products) {
        const bcId = Number(product.bigcommerce_product_id);
        if (Number.isInteger(bcId) && bcId > 0) {
          const owners = ownersByBcId.get(bcId) ?? [];
          owners.push(product);
          ownersByBcId.set(bcId, owners);
        }
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      const candidates: ProductCandidate[] = [];
      job.items = selectedProductIds.map((productId) => {
        const product = productById.get(productId);
        return {
          productId,
          vendorSku: String(product?.vendor_sku ?? ""),
          title: String(product?.title ?? `Product #${productId}`),
          upc: String(product?.upc ?? ""),
          bigcommerceProductId: Number(product?.bigcommerce_product_id) || 0,
          bigcommerceVariantId: product?.bigcommerce_variant_id == null
            ? null
            : Number(product.bigcommerce_variant_id),
          status: product ? "pending" : "skipped",
          updatedFields: [],
          photosAdded: 0,
          error: product ? null : "This product is no longer mapped. Refresh the list and select it again.",
        };
      });
      job.summary.total = job.items.length;

      for (let index = 0; index < job.items.length; index++) {
        const item = job.items[index];
        const product = productById.get(item.productId);
        if (!product) {
          job.summary.skipped++;
          job.summary.processed++;
          continue;
        }
        const bcId = Number(product.bigcommerce_product_id);
        if (!Number.isInteger(bcId) || bcId <= 0) {
          item.status = "skipped";
          item.error = "This catalog row no longer has a valid BigCommerce mapping.";
          job.summary.skipped++;
          job.summary.processed++;
          continue;
        }
        const rawVariantId = product.bigcommerce_variant_id;
        const variantId = rawVariantId == null ? null : Number(rawVariantId);
        if (rawVariantId != null && (!Number.isSafeInteger(variantId) || (variantId as number) <= 0)) {
          item.status = "skipped";
          item.error = "This catalog row has an invalid BigCommerce variant mapping.";
          job.summary.skipped++;
          job.summary.processed++;
          continue;
        }
        const conflictingOwner = (ownersByBcId.get(bcId) ?? []).some((owner) => {
          if (owner.id === product.id) return false;
          const ownerVariantId = owner.bigcommerce_variant_id == null
            ? null
            : Number(owner.bigcommerce_variant_id);
          return variantId === null || ownerVariantId === null || ownerVariantId === variantId;
        });
        if (conflictingOwner) {
          item.status = "skipped";
          item.error = "Multiple vendor catalog rows map to the same BigCommerce product or variant; skipped to avoid conflicting updates.";
          job.summary.skipped++;
          job.summary.processed++;
          continue;
        }
        candidates.push({ product, item });
      }

      await this.saveLatest(job, true);
      if (candidates.length > 0) {
        let brandMap: Map<string, number | null> | null = null;
        let brandLoadError: string | null = null;
        if (job.summary.kind === "details" && job.summary.selectedFields.includes("identity")) {
          try {
            const brands = await this.getBigCommerceBrands();
            brandMap = new Map<string, number | null>();
            for (const brand of brands) {
              const key = productIdentityBrandKey(brand.name);
              brandMap.set(key, brandMap.has(key) ? null : Number(brand.id));
            }
          } catch (error) {
            brandLoadError = `Could not load BigCommerce brands: ${safeError(error)}`;
          }
        }

        const candidatesByBcId = new Map<number, ProductCandidate[]>();
        for (const candidate of candidates) {
          const group = candidatesByBcId.get(candidate.item.bigcommerceProductId) ?? [];
          group.push(candidate);
          candidatesByBcId.set(candidate.item.bigcommerceProductId, group);
        }
        const candidateGroups = Array.from(candidatesByBcId.values());
        let nextIndex = 0;
        const workerCount = Math.min(SYNC_CONCURRENCY, candidateGroups.length);
        await Promise.all(Array.from({ length: workerCount }, async () => {
          while (true) {
            const index = nextIndex++;
            if (index >= candidateGroups.length) return;
            const group = candidateGroups[index];
            const parentFieldConflicts = job.summary.kind === "details"
              ? conflictingParentFields(group, job.summary.selectedFields)
              : new Set<KoleProductSyncField>();
            for (const candidate of group) {
              candidate.item.status = "in_progress";
              job.summary.currentSku = candidate.item.vendorSku;
              try {
                const outcome = job.summary.kind === "details"
                  ? await this.syncDetails(
                    candidate,
                    job.summary.selectedFields,
                    brandMap,
                    brandLoadError,
                    parentFieldConflicts,
                  )
                  : await this.syncImages(candidate, logoBuffer, job.summary.forceImageReupload === true);
                candidate.item.status = outcome.status;
                candidate.item.updatedFields = outcome.updatedFields ?? [];
                candidate.item.photosAdded = outcome.photosAdded ?? 0;
                candidate.item.error = outcome.error ?? null;
              } catch (error) {
                candidate.item.status = "failed";
                candidate.item.error = safeError(error);
              }

              job.summary.processed++;
              if (candidate.item.status === "updated") job.summary.updated++;
              else if (candidate.item.status === "unchanged") job.summary.unchanged++;
              else if (candidate.item.status === "failed") job.summary.failed++;
              else if (candidate.item.status === "skipped") job.summary.skipped++;
              job.summary.photosAdded += candidate.item.photosAdded;

              if (job.summary.processed % CHECKPOINT_EVERY === 0) {
                await this.saveLatest(job, true).catch((error) => {
                  console.error("[Kole Product Sync] could not save progress checkpoint", safeError(error));
                });
              }
            }
          }
        }));
      }

      job.summary.status = "completed";
      job.summary.currentSku = null;
      job.summary.completedAt = new Date().toISOString();
      await this.saveLatest(job, true);
      this.activeJobId = null;
    } catch (error) {
      await this.failUnexpectedly(job, error);
    }
  }

  private async syncDetails(
    candidate: ProductCandidate,
    selectedFields: KoleProductSyncField[],
    brandMap: Map<string, number | null> | null,
    brandLoadError: string | null,
    parentFieldConflicts: Set<KoleProductSyncField>,
  ): Promise<ProductOutcome> {
    const currentMapping = await this.storage.getDropshipProduct(candidate.item.productId);
    const currentVariantId = currentMapping?.bigcommerce_variant_id == null
      ? null
      : Number(currentMapping.bigcommerce_variant_id);
    if (
      !currentMapping
      || Number(currentMapping.bigcommerce_product_id) !== candidate.item.bigcommerceProductId
      || currentVariantId !== candidate.item.bigcommerceVariantId
    ) {
      return {
        status: "skipped",
        error: "The BigCommerce mapping changed during this run; this product was skipped.",
      };
    }
    const { storeHash, headers } = await this.getBigCommerceCredentials();
    const productUrl = `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${candidate.item.bigcommerceProductId}`;
    const currentResponse = await this.fetchBigCommerce(productUrl, { headers });
    const currentPayload = await currentResponse.json().catch(() => ({}));
    if (!currentResponse.ok || !currentPayload?.data) {
      throw new Error(`BigCommerce product lookup failed (${currentResponse.status}).`);
    }
    const currentProduct = currentPayload.data;
    const raw = productRawData(candidate.product);
    const update: Record<string, unknown> = {};
    const fieldLabels: string[] = [];
    const fieldLabelsBySyncField: Record<KoleProductSyncField, string> = {
      cost: "Extended cost",
      description: "Description",
      inventory: "Inventory quantity",
      identity: "Product identity",
    };
    const warnings = Array.from(parentFieldConflicts, (field) =>
      `${fieldLabelsBySyncField[field]} left unchanged because selected variant SKUs contain conflicting values for this BigCommerce product.`,
    );
    const fieldsToSync = selectedFields.filter((field) =>
      field === "inventory" || !parentFieldConflicts.has(field),
    );

    if (fieldsToSync.includes("cost")) {
      const extendedCost = getKoleExtendedCost(raw, candidate.product.cost);
      if (extendedCost !== null) {
        const roundedCost = Math.round((extendedCost + Number.EPSILON) * 100) / 100;
        if (Number(currentProduct.cost_price) !== roundedCost) {
          update.cost_price = roundedCost;
          fieldLabels.push("Extended cost");
        }
      }
    }

    if (fieldsToSync.includes("description")) {
      const description = String(candidate.product.description ?? "");
      if (description.trim() && String(currentProduct.description ?? "") !== description) {
        update.description = description;
        fieldLabels.push("Description");
      }
    }

    if (fieldsToSync.includes("inventory")) {
      const inventoryProvided = typeof raw.inventoryProvided === "boolean"
        ? raw.inventoryProvided
        : raw.inventory !== undefined && raw.inventory !== null && String(raw.inventory).trim() !== "";
      const inventoryLevel = Number(candidate.product.inventory);
      if (inventoryProvided && Number.isInteger(inventoryLevel) && inventoryLevel >= 0 && inventoryLevel <= 2_147_483_647) {
        const variantId = candidate.item.bigcommerceVariantId;
        if (variantId !== null) {
          if (currentProduct.inventory_tracking !== "variant") {
            warnings.push("Variant inventory left unchanged because BigCommerce is not using variant-level tracking.");
          } else {
            const variantUrl = `${productUrl}/variants/${variantId}`;
            const variantResponse = await this.fetchBigCommerce(variantUrl, { headers });
            const variantPayload = await variantResponse.json().catch(() => ({}));
            if (!variantResponse.ok || !variantPayload?.data) {
              if (variantResponse.status === 404) {
                warnings.push("Variant inventory left unchanged because the mapped BigCommerce variant no longer exists.");
              } else {
                throw new Error(`BigCommerce variant lookup failed (${variantResponse.status}).`);
              }
            } else if (
              Number(variantPayload.data.product_id) !== candidate.item.bigcommerceProductId
              || normalizeKoleSku(variantPayload.data.sku) !== normalizeKoleSku(candidate.item.vendorSku)
            ) {
              warnings.push("Variant inventory left unchanged because the mapped BigCommerce variant no longer matches this SKU.");
            } else if (Number(variantPayload.data.inventory_level) !== inventoryLevel) {
              const variantUpdateResponse = await this.fetchBigCommerce(variantUrl, {
                method: "PUT",
                headers,
                body: JSON.stringify({ inventory_level: inventoryLevel }),
              });
              if (!variantUpdateResponse.ok) {
                await variantUpdateResponse.text().catch(() => "");
                throw new Error(`BigCommerce variant inventory update failed (${variantUpdateResponse.status}).`);
              }
              await variantUpdateResponse.arrayBuffer().catch(() => undefined);
              fieldLabels.push("Variant inventory quantity");
            }
          }
        } else if (currentProduct.inventory_tracking === "product") {
          if (Number(currentProduct.inventory_level) !== inventoryLevel) {
            update.inventory_level = inventoryLevel;
            fieldLabels.push("Inventory quantity");
          }
        } else {
          warnings.push("Inventory left unchanged because BigCommerce is not using product-level tracking.");
        }
      } else if (inventoryProvided) {
        warnings.push("Supplier inventory is outside BigCommerce's supported range.");
      }
    }

    if (fieldsToSync.includes("identity")) {
      const title = String(candidate.product.title ?? "").trim();
      if (title && String(currentProduct.name ?? "") !== title) {
        update.name = title;
        fieldLabels.push("Product name");
      }

      const upc = String(candidate.product.upc ?? "").trim();
      if (upc && String(currentProduct.upc ?? "").trim() !== upc) {
        update.upc = upc;
        fieldLabels.push("UPC");
      }

      const brand = String(candidate.product.brand ?? "").trim();
      if (brand) {
        if (brandLoadError) {
          warnings.push(brandLoadError);
        } else {
          const brandId = brandMap?.get(productIdentityBrandKey(brand));
          if (brandId === undefined) {
            warnings.push(`BigCommerce has no matching brand named "${brand}".`);
          } else if (brandId === null) {
            warnings.push(`BigCommerce has multiple brands named "${brand}"; the brand was left unchanged.`);
          } else if (Number(currentProduct.brand_id) !== brandId) {
            update.brand_id = brandId;
            fieldLabels.push("Brand");
          }
        }
      }
    }

    if (Object.keys(update).length > 0) {
      const updateResponse = await this.fetchBigCommerce(productUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify(update),
      });
      if (!updateResponse.ok) {
        await updateResponse.text().catch(() => "");
        throw new Error(`BigCommerce detail update failed (${updateResponse.status}).`);
      }
      await updateResponse.arrayBuffer().catch(() => undefined);
    }

    const status = fieldLabels.length > 0
      ? "updated"
      : warnings.length > 0
        ? "skipped"
        : "unchanged";
    return {
      status,
      updatedFields: fieldLabels,
      error: warnings.length > 0 ? warnings.join(" ") : null,
    };
  }

  private async syncImages(
    candidate: ProductCandidate,
    logoBuffer: Buffer | null,
    forceImageReupload: boolean,
  ): Promise<ProductOutcome> {
    if (!logoBuffer) throw new Error("No saved watermark logo was available for this image run.");
    const currentMapping = await this.storage.getDropshipProduct(candidate.item.productId);
    const currentVariantId = currentMapping?.bigcommerce_variant_id == null
      ? null
      : Number(currentMapping.bigcommerce_variant_id);
    if (
      !currentMapping
      || Number(currentMapping.bigcommerce_product_id) !== candidate.item.bigcommerceProductId
      || currentVariantId !== candidate.item.bigcommerceVariantId
    ) {
      return {
        status: "skipped",
        error: "The BigCommerce mapping changed during this run; this product was skipped.",
      };
    }
    const sourceUrls = imageSourceUrls(candidate.product);
    if (sourceUrls.length === 0) return { status: "unchanged" };

    const productId = candidate.item.bigcommerceProductId;
    const ledgerKey = imageLedgerSettingKey(productId, candidate.item.productId);
    const rawLedger = unwrapSetting(await this.storage.getSetting(ledgerKey));
    if (rawLedger !== undefined && rawLedger !== null && !Array.isArray(rawLedger)) {
      throw new Error("Saved image sync history is invalid; no photos were changed.");
    }
    const ledger = new Set((Array.isArray(rawLedger) ? rawLedger : []).map(normalizedImageUrl).filter(Boolean));
    const pendingSources = sourceUrls
      .map((sourceUrl, sourceIndex) => ({ sourceUrl, sourceIndex }))
      .filter(({ sourceUrl }) => forceImageReupload || !ledger.has(sourceUrl));
    if (pendingSources.length === 0) return { status: "unchanged" };

    const legacyRaw = unwrapSetting(await this.storage.getSetting(legacyImageLedgerSettingKey(productId)));
    if (legacyRaw !== undefined && legacyRaw !== null && !Array.isArray(legacyRaw)) {
      throw new Error("Saved image sync history is invalid; no photos were changed.");
    }
    const legacyLedger = new Set(
      (Array.isArray(legacyRaw) ? legacyRaw : []).map(normalizedImageUrl).filter(Boolean),
    );

    const { storeHash, headers } = await this.getBigCommerceCredentials();
    const productUrl = `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${productId}`;
    const currentResponse = await this.fetchBigCommerce(`${productUrl}?include=images`, { headers });
    const currentPayload = await currentResponse.json().catch(() => ({}));
    if (!currentResponse.ok || !currentPayload?.data) {
      throw new Error(`BigCommerce product lookup failed (${currentResponse.status}).`);
    }
    const existingImages = Array.isArray(currentPayload.data.images) ? currentPayload.data.images : [];
    const existingFileNames = new Set(
      existingImages
        .map((image: any) => normalizedImageFilename(image?.image_file))
        .filter(Boolean),
    );
    let maxSortOrder = existingImages.reduce((max: number, image: any) => {
      const value = Number(image?.sort_order);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, -1);
    let photosAdded = 0;
    const errors: string[] = [];

    for (const { sourceUrl, sourceIndex } of pendingSources) {
      const legacyFilename = normalizedImageFilename(legacyImageFilename(candidate.item.vendorSku, sourceIndex));
      const currentFilename = normalizedImageFilename(safeImageFilename(candidate.item.vendorSku, sourceIndex));
      if (!forceImageReupload && legacyLedger.has(sourceUrl) && existingFileNames.has(legacyFilename)) {
        ledger.add(sourceUrl);
        try {
          await this.storage.setSetting(ledgerKey, Array.from(ledger));
        } catch {
          errors.push("An existing photo was found, but its per-listing sync history could not be saved.");
        }
        continue;
      }
      if (existingImages.length + photosAdded >= 1000) {
        errors.push("BigCommerce's 1,000 image limit was reached; remaining supplier photos were not added.");
        break;
      }
      try {
        const sourceBuffer = await this.downloadImage(sourceUrl);
        const processed = await this.createWatermarkedImage(sourceBuffer, logoBuffer);
        const form = new FormData();
        form.append(
          "image_file",
          new Blob([new Uint8Array(processed)], { type: "image/jpeg" }),
          safeImageFilename(candidate.item.vendorSku, sourceIndex),
        );
        form.append("description", "Watermarked product photo");
        form.append("is_thumbnail", "false");
        form.append("sort_order", String(++maxSortOrder));

        const imageResponse = await this.fetchBigCommerce(`${productUrl}/images`, {
          method: "POST",
          headers: {
            "X-Auth-Token": headers["X-Auth-Token"],
            Accept: "application/json",
          },
          body: form,
        });
        if (!imageResponse.ok) {
          await imageResponse.text().catch(() => "");
          throw new Error(`BigCommerce watermarked photo upload failed (${imageResponse.status}).`);
        }
        await imageResponse.arrayBuffer().catch(() => undefined);
        photosAdded++;
        ledger.add(sourceUrl);
        existingFileNames.add(currentFilename);
        try {
          await this.storage.setSetting(ledgerKey, Array.from(ledger));
        } catch {
          errors.push("A photo was added, but duplicate protection could not be saved for that source image.");
        }
      } catch (error) {
        errors.push(safeError(error));
      }
    }

    return {
      status: errors.length > 0 ? "failed" : photosAdded > 0 ? "updated" : "unchanged",
      photosAdded,
      error: errors.length > 0 ? errors.join(" ").slice(0, 300) : null,
    };
  }

  private async failUnexpectedly(job: InternalProductSyncJob, error: unknown): Promise<void> {
    job.summary.status = "failed";
    job.summary.currentSku = null;
    job.summary.completedAt = new Date().toISOString();
    job.summary.error = safeError(error);
    this.activeJobId = null;
    await this.saveLatest(job, true).catch((saveError) => {
      console.error("[Kole Product Sync] could not save failed job", safeError(saveError));
    });
  }
}