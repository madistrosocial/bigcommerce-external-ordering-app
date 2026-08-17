/**
 * SKUVault API client.
 * Docs: https://dev.skuvault.com/reference
 * Auth: TenantToken + UserToken in every request body.
 *
 * Key API notes:
 *  - getInventoryByLocation: request uses `ProductSKUs`; response `Items` is
 *    a SKU-keyed dictionary: { [sku]: SvLocationEntry[] }
 *  - addItemBulk: adds a DELTA quantity to a bin (not absolute). Used for push.
 *  - setItemQuantities: sets ABSOLUTE quantity at a bin. Used for audit completion.
 *    Both require the LocationCode to already exist in the warehouse.
 *
 * Location lookup strategy:
 *  1. getInventoryByLocation  → primary bin (in-stock items)
 *  2. getAvailableQuantities  → fallback for zero-stock (returns items even at qty 0)
 *  If neither returns a location, returns null and the caller surfaces a clear error.
 *
 * Multi-location policy:
 *  Pick the single "primary" bin — the location entry with the highest
 *  QuantityAvailable for that SKU. Push and audit both write to that bin only.
 */

const SV_BASE = "https://app.skuvault.com/api";

export interface SkuVaultConfig {
  tenantToken: string;
  userToken: string;
  warehouseId: number;         // required by set/addItem endpoints
  warehouseLocation?: string;  // fallback location code when no bin found
}

export interface SvSetQuantityResult {
  Status: string;
  Errors: { Sku: string; ErrorMessages: string[] }[];
}

/** Extended result from setSkuVaultInventory, includes the resolved bin per SKU */
export interface SvSetInventoryResult extends SvSetQuantityResult {
  ResolvedLocations: Record<string, string>;   // sku → locationCode used
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

/** The selected primary bin for a SKU (location + qty from the same bin). */
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
    ProductSKUs: skus,
    PageNumber: 0,
    PageSize: skus.length + 10,
  });
}

/**
 * Fallback location lookup via getAvailableQuantities.
 * This endpoint returns items even when QuantityAvailable = 0, so it can
 * surface the last-recorded location for zero-stock SKUs.
 * Returns a map of sku → locationCode for any SKU where a location is found.
 */
async function getLocationFromAvailableQuantities(
  cfg: SkuVaultConfig,
  skus: string[]
): Promise<Record<string, string>> {
  try {
    const res = await svPost<any>("/inventory/getAvailableQuantities", {
      TenantToken: cfg.tenantToken,
      UserToken: cfg.userToken,
      ProductSKUs: skus,
      PageNumber: 0,
      PageSize: skus.length + 10,
    });
    const locationBySku: Record<string, string> = {};
    const items = res?.Items;
    if (!items) return locationBySku;

    if (Array.isArray(items)) {
      // Array format: [{ Sku, LocationCode, ... }]
      for (const item of items) {
        if (item?.Sku && item?.LocationCode) locationBySku[item.Sku] = item.LocationCode;
      }
    } else if (typeof items === "object") {
      // Dictionary format: { [sku]: { LocationCode, ... } | [{ LocationCode, ... }] }
      for (const [sku, val] of Object.entries(items)) {
        const entry = Array.isArray(val) ? val[0] : val;
        if ((entry as any)?.LocationCode) locationBySku[sku] = (entry as any).LocationCode;
      }
    }
    return locationBySku;
  } catch {
    return {};
  }
}

/**
 * For each SKU, pick the single primary bin (highest QuantityAvailable).
 * Returns location and that bin's qty together so they stay consistent.
 */
function extractPrimaryBinBySku(
  result: SvGetInventoryResult
): Record<string, PrimaryBin> {
  const bysku: Record<string, PrimaryBin> = {};
  const items = result?.Items;
  if (!items || typeof items !== "object") return bysku;

  for (const [sku, entries] of Object.entries(items)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
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
 * Used for the informational fresh-qty warning during audit completion.
 */
export function sumQtyBySku(result: SvGetInventoryResult): Record<string, number> {
  const qtyBySku: Record<string, number> = {};
  const items = result?.Items;
  if (!items || typeof items !== "object") return qtyBySku;
  for (const [sku, entries] of Object.entries(items)) {
    if (!Array.isArray(entries)) continue;
    qtyBySku[sku] = entries.reduce(
      (sum, e) => sum + (e.QuantityAvailable ?? e.QuantityOnHand ?? e.Quantity ?? 0), 0
    );
  }
  return qtyBySku;
}

/**
 * Two-step location lookup for a list of SKUs:
 *   1. getInventoryByLocation  (in-stock items have location entries)
 *   2. getAvailableQuantities  (zero-stock items may still surface a location)
 * Returns { locationBySku, primaryBins } for use in push/audit calls.
 */
async function resolveLocations(
  cfg: SkuVaultConfig,
  skus: string[]
): Promise<{ locationBySku: Record<string, string>; primaryBins: Record<string, PrimaryBin> }> {
  let primaryBins: Record<string, PrimaryBin> = {};
  let locationBySku: Record<string, string> = {};

  try {
    const getResult = await getSkuVaultInventory(cfg, skus);
    primaryBins = extractPrimaryBinBySku(getResult);
    for (const [sku, bin] of Object.entries(primaryBins)) {
      locationBySku[sku] = bin.locationCode;
    }
  } catch (err) {
    console.warn("[SKUVault] getInventoryByLocation failed:", err);
  }

  // For SKUs with no location yet (zero-stock), try getAvailableQuantities
  const missing = skus.filter((s) => !locationBySku[s]);
  if (missing.length > 0) {
    const fallbackLocations = await getLocationFromAvailableQuantities(cfg, missing);
    for (const [sku, loc] of Object.entries(fallbackLocations)) {
      locationBySku[sku] = loc;
      // Zero-stock: currentQty = 0
      primaryBins[sku] = { locationCode: loc, currentQty: 0 };
    }
  }

  return { locationBySku, primaryBins };
}

/**
 * Add quantity to a list of SKUs using addItemBulk (DELTA, not absolute).
 * Used during inventory push. Looks up each SKU's bin first via two-step lookup.
 * Returns locationCode used per SKU so it can be stored in the push log.
 * Throws if no location can be resolved and no fallback is configured.
 */
export async function addSkuVaultInventory(
  cfg: SkuVaultConfig,
  items: { sku: string; quantityToAdd: number }[],
  reason = "Manual Inventory Push - SalesApp"
): Promise<{ results: { sku: string; newQty: number | null; locationCode: string; error?: string }[] }> {
  const skus = items.map((i) => i.sku);
  const { primaryBins, locationBySku } = await resolveLocations(cfg, skus);
  const fallbackLocation = cfg.warehouseLocation || null;

  // Build per-SKU payloads
  const payloads = items.map((i) => {
    const bin = primaryBins[i.sku];
    const loc = locationBySku[i.sku] ?? fallbackLocation;
    if (!loc) {
      return { sku: i.sku, quantityToAdd: i.quantityToAdd, locationCode: "", error: `No location found for SKU ${i.sku} in SKUVault. Receive the item in SKUVault first, or configure a fallback Warehouse Location Code in Admin → SKUVault settings.` };
    }
    if (!locationBySku[i.sku] && fallbackLocation) {
      console.warn(`[SKUVault] No location found for SKU ${i.sku}, using configured fallback: ${fallbackLocation}`);
    }
    return { sku: i.sku, quantityToAdd: i.quantityToAdd, locationCode: loc, error: undefined };
  });

  // Split items with errors vs items to push
  const toPush = payloads.filter((p) => !p.error);
  const errorResults = payloads.filter((p) => !!p.error).map((p) => ({
    sku: p.sku, newQty: null, locationCode: p.locationCode, error: p.error,
  }));

  if (toPush.length === 0) {
    return { results: errorResults };
  }

  // Use addItemBulk — sends the DELTA directly, SKUVault handles the addition
  const addResult = await svPost<SvSetQuantityResult>("/inventory/addItemBulk", {
    TenantToken: cfg.tenantToken,
    UserToken: cfg.userToken,
    Reason: reason,
    Items: toPush.map((p) => ({
      Sku: p.sku,
      WarehouseId: cfg.warehouseId,
      LocationCode: p.locationCode,
      Quantity: p.quantityToAdd,
    })),
  });

  const errorsBySku: Record<string, string> = {};
  for (const e of addResult.Errors ?? []) {
    errorsBySku[e.Sku] = e.ErrorMessages?.join("; ") || "Unknown error";
  }

  const pushResults = toPush.map((p) => {
    const bin = primaryBins[p.sku];
    return {
      sku: p.sku,
      locationCode: p.locationCode,
      newQty: errorsBySku[p.sku] ? null : (bin?.currentQty ?? 0) + p.quantityToAdd,
      error: errorsBySku[p.sku],
    };
  });

  return { results: [...pushResults, ...errorResults] };
}

/**
 * Set absolute inventory quantities for a list of SKUs using setItemQuantities.
 * Used during audit completion. Looks up each SKU's bin via two-step lookup.
 * Returns resolved locations so they can be stored in the audit task.
 */
export async function setSkuVaultInventory(
  cfg: SkuVaultConfig,
  items: { sku: string; quantity: number }[],
  reason = "Inventory Audit - SalesApp"
): Promise<SvSetInventoryResult> {
  const fallbackLocation = cfg.warehouseLocation || "GENERAL";
  const { locationBySku } = await resolveLocations(cfg, items.map((i) => i.sku));

  const resolvedLocations: Record<string, string> = {};

  const svResult = await svPost<SvSetQuantityResult>("/inventory/setItemQuantities", {
    TenantToken: cfg.tenantToken,
    UserToken: cfg.userToken,
    Reason: reason,
    Items: items.map((i) => {
      const loc = locationBySku[i.sku] ?? fallbackLocation;
      resolvedLocations[i.sku] = loc;
      if (!locationBySku[i.sku]) {
        console.warn(`[SKUVault] No location found for SKU ${i.sku}, using fallback: ${fallbackLocation}`);
      }
      return {
        Sku: i.sku,
        WarehouseId: cfg.warehouseId,
        LocationCode: loc,
        Quantity: i.quantity,
      };
    }),
  });

  return { ...svResult, ResolvedLocations: resolvedLocations };
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
