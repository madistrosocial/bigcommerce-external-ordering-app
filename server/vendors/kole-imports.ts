import type { InsertDropshipProduct } from "@shared/schema";

export const KOLE_VENDOR = {
  code: "kole_imports",
  name: "Kole Imports",
  provider: "kole-imports",
  baseUrl: "https://api.koleimports.com",
} as const;

export const DEFAULT_VENDOR_DISPLAY_NAME = "Vendor Catalog";
const KOLE_PRODUCT_JSON_MEDIA_TYPE = "application/vnd.koleimports.ds.product+json";

export interface KoleCredentials {
  accountId: string;
  apiKey: string;
}

export interface KoleProduct {
  sku: string;
  vendorProductId: string | null;
  title: string;
  description: string;
  brand: string | null;
  upc: string | null;
  inventory: number;
  cost: string | null;
  tierData: unknown[];
  imageData: unknown[];
  category: string | null;
  subcategory: string | null;
  closeout: boolean;
  weight: string | null;
  modifiedAt: Date | null;
  raw: Record<string, unknown>;
}

export interface DropshipVendorAdapter {
  getProducts(opts: { limit: number; offset: number }): Promise<{ products: KoleProduct[]; hasMore: boolean; errors: string[] }>;
  getProduct(sku: string): Promise<KoleProduct>;
  getInventory(sku: string): Promise<number>;
  createOrder(...args: never[]): Promise<never>;
  getOrder(...args: never[]): Promise<never>;
  getShipment(...args: never[]): Promise<never>;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function firstValue(record: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "y", "closeout", "closed"].includes(String(value ?? "").toLowerCase());
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseProduct(input: unknown): KoleProduct {
  const record = asRecord(input);
  const sku = String(firstValue(record, ["sku", "SKU", "product_sku", "productSku"]) ?? "").trim();
  if (!sku) throw new Error("Kole product response did not include a SKU");

  return {
    sku,
    vendorProductId: asString(firstValue(record, ["id", "product_id", "productId", "product_code"])),
    title: String(firstValue(record, ["title", "name", "product_name", "productName"]) ?? sku),
    description: String(firstValue(record, ["description", "long_description", "longDescription"]) ?? ""),
    brand: asString(firstValue(record, ["brand", "manufacturer"])),
    upc: asString(firstValue(record, ["upc", "UPC", "barcode"])),
    inventory: Math.max(0, Math.trunc(asNumber(firstValue(record, ["inventory", "quantity", "available", "stock"]), 0))),
    cost: asString(firstValue(record, ["cost", "price", "wholesale_price", "wholesalePrice"])),
    tierData: asArray(firstValue(record, ["tiers", "tier_data", "tierData", "pricing"])),
    imageData: asArray(firstValue(record, ["images", "image", "image_urls", "imageUrls"])),
    category: asString(firstValue(record, ["category", "category_name", "categoryName"])),
    subcategory: asString(firstValue(record, ["subcategory", "sub_category", "subCategory"])),
    closeout: asBoolean(firstValue(record, ["closeout", "is_closeout", "isCloseout"])),
    weight: asString(firstValue(record, ["weight", "shipping_weight", "shippingWeight"])),
    modifiedAt: parseDate(firstValue(record, ["modified", "modified_at", "modifiedAt", "updated_at", "updatedAt"])),
    raw: record,
  };
}

function extractProductList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  for (const key of ["products", "data", "results", "items"]) {
    if (Array.isArray(record[key])) return record[key];
    const nested = asRecord(record[key]);
    for (const nestedKey of ["products", "items", "results"]) {
      if (Array.isArray(nested[nestedKey])) return nested[nestedKey];
    }
  }
  return [];
}

export class KoleImportsAdapter implements DropshipVendorAdapter {
  private readonly credentials: KoleCredentials;

  constructor(credentials: KoleCredentials) {
    this.credentials = credentials;
  }

  private async request(path: string): Promise<unknown> {
    const auth = Buffer.from(`${this.credentials.accountId}:${this.credentials.apiKey}`).toString("base64");
    const response = await fetch(`${KOLE_VENDOR.baseUrl}${path}`, {
      headers: {
        Accept: KOLE_PRODUCT_JSON_MEDIA_TYPE,
        Authorization: `Basic ${auth}`,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const message = text.replace(/\s+/g, " ").slice(0, 300);
      if (response.status === 401 || response.status === 403) {
        throw new Error("Kole Imports rejected the configured credentials.");
      }
      if (response.status === 429) {
        throw new Error("Kole Imports rate limit reached. Please try again later.");
      }
      throw new Error(`Kole Imports API error (${response.status})${message ? `: ${message}` : ""}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Kole Imports returned an unsupported response format. JSON is required for catalog sync.");
    }
  }

  async getProducts(opts: { limit: number; offset: number }): Promise<{ products: KoleProduct[]; hasMore: boolean; errors: string[] }> {
    const limit = Math.min(Math.max(Math.trunc(opts.limit || 25), 1), 25);
    const offset = Math.max(Math.trunc(opts.offset || 0), 0);
    const payload = await this.request(`/products?limit=${limit}&offset=${offset}`);
    const rawProducts = extractProductList(payload);
    const products: KoleProduct[] = [];
    const errors: string[] = [];
    for (const rawProduct of rawProducts) {
      try {
        products.push(parseProduct(rawProduct));
      } catch (error: any) {
        errors.push(error?.message || "Malformed product response");
      }
    }
    return { products, hasMore: rawProducts.length === limit, errors };
  }

  async getProduct(sku: string): Promise<KoleProduct> {
    return parseProduct(await this.request(`/products/${encodeURIComponent(sku)}`));
  }

  async getInventory(sku: string): Promise<number> {
    return (await this.getProduct(sku)).inventory;
  }

  async createOrder(..._args: never[]): Promise<never> {
    throw new Error("Kole Imports ordering is not implemented in Phase 1.");
  }

  async getOrder(..._args: never[]): Promise<never> {
    throw new Error("Kole Imports ordering is not implemented in Phase 1.");
  }

  async getShipment(..._args: never[]): Promise<never> {
    throw new Error("Kole Imports shipment sync is not implemented in Phase 1.");
  }
}

export function toDropshipProductInsert(vendorId: number, product: KoleProduct): InsertDropshipProduct {
  return {
    vendor_id: vendorId,
    vendor_sku: product.sku,
    vendor_product_id: product.vendorProductId,
    title: product.title,
    description: product.description,
    brand: product.brand,
    upc: product.upc,
    inventory: product.inventory,
    cost: product.cost,
    tier_data: product.tierData,
    image_data: product.imageData,
    vendor_category: product.category,
    vendor_subcategory: product.subcategory,
    is_closeout: product.closeout,
    vendor_modified_at: product.modifiedAt,
    raw_data: product.raw,
  };
}