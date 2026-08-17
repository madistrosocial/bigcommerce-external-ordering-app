/**
 * SKUVault API client.
 * Docs: https://dev.skuvault.com/reference
 * Auth: TenantToken + UserToken in every request body.
 *
 * Key API notes:
 *  - getInventoryByLocation: request uses `ProductSKUs` (not `Skus`);
 *    response `Items` is a SKU-keyed dictionary: { [sku]: SvLocationEntry[] }
 *  - setItemQuantities: requires WarehouseId (int) + LocationCode per item.
 *    LocationCode must already exist in the warehouse.
 *
 * Multi-location policy:
 *  For both push (add) and audit (set), we pick the single "primary" bin —
 *  the location entry with the highest QuantityAvailable for that SKU.
 *  Push: new qty = primary_bin_qty + delta, written to primary_bin only.
 *  Audit: physical_count written to primary_bin only (other bins untouched).
 *  Rationale: WH2 stores each SKU in one bin; multi-bin is uncommon here.
 */

const SV_BASE = "https://app.skuvault.com/api";

export interface SkuVaultConfig {
  tenantToken: string;
  userToken: string;
  warehouseId: number;         // required by setItemQuantities / setItemQuantity
  warehouseLocation?: string;  // fallback location code when item has no recorded bin
}

export interface SvInventoryItem {
  Sku: string;
  Quantity: number;
  LocationCode?: string;
}

export interface SvSetQuantityResult {
  Status: string;
  Errors: { Sku: string; ErrorMessages: string[] }[];
}

/** One location entry inside the Items dictionary returned by getInventoryByLocation */
export interface SvLocationEntry {
  LocationCode: string;
  Quantity: number;
  QuantityAvailable?: number;
  QuantityOnHand?: number;
}

/**
 * Response from /inventory/getInventoryByLocation.
 * Items is a SKU-keyed dictionary: { [sku: string]: SvLocationEntry[] }
 */
export interface SvGetInventoryResult {
  Items: Record<string, SvLocationEntry[]>;
  Status: string;
}

/** The selected primary bin for a SKU (location + qty from that same bin). */
interface PrimaryBin {
  locationCode: string;
  currentQty: number;
}

async function svPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SV_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`SKUVault ${path} HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Get current inventory by location for a list of SKUs.
 * Returns a SKU-keyed dictionary of location entries.
 */
export async function getSkuVaultInventory(
  cfg: SkuVaultConfig,
  skus: string[]
): Promise<SvGetInventoryResult> {
  return svPost<SvGetInventoryResult>("/inventory/getInventoryByLocation", {
    TenantToken: cfg.tenantToken,
    UserToken: cfg.userToken,
    ProductSKUs: skus,           // correct field name per SKUVault docs
    PageNumber: 0,
    PageSize: skus.length + 10,
  });
}

/**
 * For each SKU, pick the single primary bin (highest QuantityAvailable).
 * Returns location and that bin's qty together so they stay consistent.
 * SKUs with no returned entries are absent from the result.
 */
function extractPrimaryBinBySku(
  result: SvGetInventoryResult
): Record<string, PrimaryBin> {
  const bysku: Record<string, PrimaryBin> = {};
  const items = result?.Items;
  if (!items || typeof items !== "object") return bysku;

  for (const [sku, entries] of Object.entries(items)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    // Pick the entry with the most available quantity
    const best = entries.reduce((a, b) =>
      (b.QuantityAvailable ?? b.Quantity ?? 0) > (a.QuantityAvailable ?? a.Quantity ?? 0) ? b : a
    );
    if (best?.LocationCode) {
      bysku[sku] = {
        locationCode: best.LocationCode,
        currentQty: best.QuantityAvailable ?? best.QuantityOnHand ?? best.Quantity ?? 0,
      };
    }
  }
  return bysku;
}

/**
 * Sum available quantity across ALL bins for each SKU.
 * Used for informational display (e.g. fresh qty warning in audit UI).
 */
export function sumQtyBySku(result: SvGetInventoryResult): Record<string, number> {
  const qtyBySku: Record<string, number> = {};
  const items = result?.Items;
  if (!items || typeof items !== "object") return qtyBySku;

  for (const [sku, entries] of Object.entries(items)) {
    if (!Array.isArray(entries)) continue;
    qtyBySku[sku] = entries.reduce(
      (sum, e) => sum + (e.QuantityAvailable ?? e.QuantityOnHand ?? e.Quantity ?? 0),
      0
    );
  }
  return qtyBySku;
}

/**
 * Set absolute inventory quantities for a list of SKUs.
 * Looks up each SKU's primary bin first and writes the quantity to that bin only.
 * Falls back to cfg.warehouseLocation when a SKU has no recorded location.
 * Used during audit completion to set the physical count.
 */
export async function setSkuVaultInventory(
  cfg: SkuVaultConfig,
  items: { sku: string; quantity: number }[]
): Promise<SvSetQuantityResult> {
  const fallbackLocation = cfg.warehouseLocation || "GENERAL";

  let primaryBins: Record<string, PrimaryBin> = {};
  try {
    const getResult = await getSkuVaultInventory(cfg, items.map((i) => i.sku));
    primaryBins = extractPrimaryBinBySku(getResult);
  } catch (err) {
    console.warn("[SKUVault] Location lookup failed, using fallback for all items:", err);
  }

  return svPost<SvSetQuantityResult>("/inventory/setItemQuantities", {
    TenantToken: cfg.tenantToken,
    UserToken: cfg.userToken,
    Items: items.map((i) => {
      const bin = primaryBins[i.sku];
      const loc = bin?.locationCode ?? fallbackLocation;
      if (!bin) {
        console.warn(`[SKUVault] No bin found for SKU ${i.sku}, using fallback: ${fallbackLocation}`);
      }
      return {
        Sku: i.sku,
        WarehouseId: cfg.warehouseId,
        LocationCode: loc,
        Quantity: i.quantity,
      };
    }),
  });
}

/**
 * Add quantity to a list of SKUs (used during inventory push).
 * Picks each SKU's primary bin, uses THAT bin's current qty as the base,
 * then sets primary_bin_qty + delta. Other bins are not touched.
 * Falls back to cfg.warehouseLocation when a SKU has no recorded location.
 */
export async function addSkuVaultInventory(
  cfg: SkuVaultConfig,
  items: { sku: string; quantityToAdd: number }[]
): Promise<{ results: { sku: string; newQty: number | null; error?: string }[] }> {
  const skus = items.map((i) => i.sku);
  const fallbackLocation = cfg.warehouseLocation || "GENERAL";

  let primaryBins: Record<string, PrimaryBin> = {};
  try {
    const getResult = await getSkuVaultInventory(cfg, skus);
    primaryBins = extractPrimaryBinBySku(getResult);
  } catch (err) {
    console.warn("[SKUVault] Inventory lookup failed, starting from qty 0 with fallback location:", err);
  }

  // Build payload: new qty = primary_bin_qty + delta, written to that same bin
  const setPayload = items.map((i) => {
    const bin = primaryBins[i.sku];
    const loc = bin?.locationCode ?? fallbackLocation;
    const basedQty = bin?.currentQty ?? 0;
    if (!bin) {
      console.warn(`[SKUVault] No bin found for SKU ${i.sku}, using fallback: ${fallbackLocation}`);
    }
    return {
      sku: i.sku,
      newQty: basedQty + i.quantityToAdd,
      locationCode: loc,
    };
  });

  const setResult = await svPost<SvSetQuantityResult>("/inventory/setItemQuantities", {
    TenantToken: cfg.tenantToken,
    UserToken: cfg.userToken,
    Items: setPayload.map((p) => ({
      Sku: p.sku,
      WarehouseId: cfg.warehouseId,
      LocationCode: p.locationCode,
      Quantity: p.newQty,
    })),
  });

  const errorsBySku: Record<string, string> = {};
  for (const e of setResult.Errors ?? []) {
    errorsBySku[e.Sku] = e.ErrorMessages?.join("; ") || "Unknown error";
  }

  return {
    results: setPayload.map((p) => ({
      sku: p.sku,
      newQty: errorsBySku[p.sku] ? null : p.newQty,
      error: errorsBySku[p.sku],
    })),
  };
}

/**
 * Test the SKUVault connection by calling getInventoryByLocation with an empty list.
 */
export async function testSkuVaultConnection(
  cfg: SkuVaultConfig
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await svPost<{ Status?: string; Errors?: unknown[] }>(
      "/inventory/getInventoryByLocation",
      {
        TenantToken: cfg.tenantToken,
        UserToken: cfg.userToken,
        ProductSKUs: [],
        PageNumber: 0,
        PageSize: 1,
      }
    );
    if (res.Status === "OK" || res.Status === "Success" || Array.isArray(res.Errors)) {
      return { ok: true, message: "Connection successful" };
    }
    return { ok: false, message: `Unexpected response: ${JSON.stringify(res)}` };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}
