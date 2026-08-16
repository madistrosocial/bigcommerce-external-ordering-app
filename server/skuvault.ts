/**
 * SKUVault API client.
 * Docs: https://dev.skuvault.com/reference
 * Auth: TenantToken + UserToken in every request body.
 */

const SV_BASE = "https://app.skuvault.com/api";

export interface SkuVaultConfig {
  tenantToken: string;
  userToken: string;
  warehouseLocation?: string; // default "all"
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

export interface SvGetInventoryResult {
  Items: { Sku: string; QuantityAvailable: number; QuantityOnHand: number }[];
  Status: string;
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
 * Set absolute inventory quantities for a list of SKUs.
 * This is used during audit completion to set the physical count.
 */
export async function setSkuVaultInventory(
  cfg: SkuVaultConfig,
  items: { sku: string; quantity: number }[]
): Promise<SvSetQuantityResult> {
  const location = cfg.warehouseLocation || "GENERAL";
  return svPost<SvSetQuantityResult>("/inventory/setItemQuantities", {
    TenantToken: cfg.tenantToken,
    UserToken: cfg.userToken,
    Items: items.map((i) => ({
      Sku: i.sku,
      LocationCode: location,
      Quantity: i.quantity,
    })),
  });
}

/**
 * Get current inventory quantities for a list of SKUs.
 */
export async function getSkuVaultInventory(
  cfg: SkuVaultConfig,
  skus: string[]
): Promise<SvGetInventoryResult> {
  return svPost<SvGetInventoryResult>("/inventory/getInventoryByLocation", {
    TenantToken: cfg.tenantToken,
    UserToken: cfg.userToken,
    Skus: skus,
    PageNumber: 0,
    PageSize: skus.length + 10,
  });
}

/**
 * Add quantity to a SKU (used during inventory push).
 * SKUVault doesn't have a native "add" endpoint at the variant level —
 * we get current qty then set new qty = current + delta.
 */
export async function addSkuVaultInventory(
  cfg: SkuVaultConfig,
  items: { sku: string; quantityToAdd: number }[]
): Promise<{ results: { sku: string; newQty: number | null; error?: string }[] }> {
  const skus = items.map((i) => i.sku);
  let currentQtys: Record<string, number> = {};
  try {
    const getResult = await getSkuVaultInventory(cfg, skus);
    for (const item of getResult.Items ?? []) {
      currentQtys[item.Sku] = item.QuantityAvailable ?? item.QuantityOnHand ?? 0;
    }
  } catch {
    // If we can't fetch current qty, start from 0 (still push the add)
  }

  const setItems = items.map((i) => ({
    sku: i.sku,
    quantity: (currentQtys[i.sku] ?? 0) + i.quantityToAdd,
  }));
  const setResult = await setSkuVaultInventory(cfg, setItems);

  const errorsBySku: Record<string, string> = {};
  for (const e of setResult.Errors ?? []) {
    errorsBySku[e.Sku] = e.ErrorMessages?.join("; ") || "Unknown error";
  }

  return {
    results: setItems.map((si) => ({
      sku: si.sku,
      newQty: errorsBySku[si.sku] ? null : si.quantity,
      error: errorsBySku[si.sku],
    })),
  };
}

/**
 * Test the SKUVault connection by fetching a token validation.
 */
export async function testSkuVaultConnection(
  cfg: SkuVaultConfig
): Promise<{ ok: boolean; message: string }> {
  try {
    // Use getInventoryByLocation with an empty SKU list as a lightweight ping
    const res = await svPost<{ Status?: string; Errors?: unknown[] }>(
      "/inventory/getInventoryByLocation",
      {
        TenantToken: cfg.tenantToken,
        UserToken: cfg.userToken,
        Skus: [],
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
