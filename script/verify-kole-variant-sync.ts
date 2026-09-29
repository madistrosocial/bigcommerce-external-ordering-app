import assert from "node:assert/strict";
import { buildBigCommerceSkuIndex } from "../server/koleSkuMapping";
import { KoleProductSyncManager } from "../server/koleProductSync";

const index = buildBigCommerceSkuIndex([
  {
    id: 100,
    sku: "PARENT-100",
    variant_count: 3,
    variants: [
      { id: 1001, sku: "PARENT-100", option_values: [] },
      { id: 1002, sku: "PARENT-100-RED", option_values: [{ option_id: 1, option_value: "Red" }] },
      { id: 1003, sku: "PARENT-100-BLUE", option_values: [{ option_id: 1, option_value: "Blue" }] },
    ],
  },
  {
    id: 200,
    sku: "",
    variant_count: 1,
    variants: [
      { id: 2001, sku: "SIMPLE-200", option_values: [] },
    ],
  },
]);
assert.deepEqual(index.productsBySku.get("parent-100"), [
  { productId: 100, variantId: null, sku: "PARENT-100" },
]);
assert.deepEqual(index.productsBySku.get("parent-100-red"), [
  { productId: 100, variantId: 1002, sku: "PARENT-100-RED" },
]);
assert.deepEqual(index.productsBySku.get("simple-200"), [
  { productId: 200, variantId: null, sku: "SIMPLE-200" },
]);
assert.equal(index.productsWithoutSku, 0);

function product(id: number, variantId: number, sku: string, description: string, inventory: number) {
  return {
    id,
    vendor_id: 7,
    vendor_sku: sku,
    title: `Kole ${sku}`,
    description,
    brand: "Kole Brand",
    upc: "",
    inventory,
    cost: "4.00",
    tier_data: [],
    image_data: [],
    is_closeout: false,
    bigcommerce_product_id: 100,
    bigcommerce_variant_id: variantId,
    status: "mapped",
    raw_data: { inventoryProvided: true },
  } as any;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitForJob(manager: KoleProductSyncManager, id: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const summary = await manager.getJob(id);
    if (summary?.status !== "running") return summary;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Kole product sync did not finish in time.");
}

async function runVariantDetailsSync() {
  const row = product(1, 1002, "PARENT-100-RED", "Variant description", 8);
  const storedSettings = new Map<string, unknown>();
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  let productDescription = "Previous description";
  let variantInventory = 2;
  const storage = {
    getDropshipProducts: async () => ({ rows: [row], total: 1 }),
    getDropshipProduct: async (id: number) => id === row.id ? row : undefined,
    getSetting: async (key: string) => storedSettings.get(key),
    setSetting: async (key: string, value: unknown) => { storedSettings.set(key, value); },
  };
  const manager = new KoleProductSyncManager({
    storage: storage as any,
    getBigCommerceCredentials: async () => ({ storeHash: "test-store", headers: {} }),
    getBigCommerceBrands: async () => [],
    fetchBigCommerce: async (url: string, init: RequestInit = {}) => {
      const method = String(init.method ?? "GET").toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ url, method, body });
      if (url.endsWith("/products/100") && method === "GET") {
        return jsonResponse({
          id: 100,
          name: "Parent title",
          description: productDescription,
          inventory_tracking: "variant",
          inventory_level: 10,
          cost_price: "4.00",
          upc: "",
        });
      }
      if (url.endsWith("/products/100/variants/1002") && method === "GET") {
        return jsonResponse({
          id: 1002,
          product_id: 100,
          sku: "PARENT-100-RED",
          inventory_level: variantInventory,
        });
      }
      if (url.endsWith("/products/100/variants/1002") && method === "PUT") {
        variantInventory = Number(body?.inventory_level);
        return jsonResponse({ id: 1002, inventory_level: variantInventory });
      }
      if (url.endsWith("/products/100") && method === "PUT") {
        productDescription = String(body?.description ?? productDescription);
        return jsonResponse({ id: 100 });
      }
      throw new Error(`Unexpected BigCommerce request: ${method} ${url}`);
    },
  } as any);

  const started = await manager.start("details", 7, [row.id], ["description", "inventory"]);
  const completed = await waitForJob(manager, started.id);
  assert.equal(completed?.status, "completed");
  assert.equal(variantInventory, 8);
  assert.equal(productDescription, "Variant description");

  const variantPut = calls.find((call) => call.method === "PUT" && call.url.endsWith("/variants/1002"));
  assert.deepEqual(variantPut?.body, { inventory_level: 8 });
  assert.equal(variantPut?.url, "https://api.bigcommerce.com/stores/test-store/v3/catalog/products/100/variants/1002");
  const productPut = calls.find((call) => call.method === "PUT" && call.url.endsWith("/products/100"));
  assert.deepEqual(productPut?.body, { description: "Variant description" });
}

async function runSiblingConflictSync() {
  const rows = [
    product(1, 1002, "PARENT-100-RED", "Red description", 6),
    product(2, 1003, "PARENT-100-BLUE", "Blue description", 9),
  ];
  const storedSettings = new Map<string, unknown>();
  const productWrites: Record<string, unknown>[] = [];
  const variantWrites = new Map<number, number>();
  const storage = {
    getDropshipProducts: async () => ({ rows, total: rows.length }),
    getDropshipProduct: async (id: number) => rows.find((row) => row.id === id),
    getSetting: async (key: string) => storedSettings.get(key),
    setSetting: async (key: string, value: unknown) => { storedSettings.set(key, value); },
  };
  const manager = new KoleProductSyncManager({
    storage: storage as any,
    getBigCommerceCredentials: async () => ({ storeHash: "test-store", headers: {} }),
    getBigCommerceBrands: async () => [],
    fetchBigCommerce: async (url: string, init: RequestInit = {}) => {
      const method = String(init.method ?? "GET").toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      const variantMatch = url.match(/\/variants\/(\d+)$/);
      if (url.endsWith("/products/100") && method === "GET") {
        return jsonResponse({
          id: 100,
          name: "Parent title",
          description: "Previous description",
          inventory_tracking: "variant",
          inventory_level: 10,
          cost_price: "4.00",
          upc: "",
        });
      }
      if (variantMatch && method === "GET") {
        const variantId = Number(variantMatch[1]);
        return jsonResponse({
          id: variantId,
          product_id: 100,
          sku: variantId === 1002 ? "PARENT-100-RED" : "PARENT-100-BLUE",
          inventory_level: 1,
        });
      }
      if (variantMatch && method === "PUT") {
        variantWrites.set(Number(variantMatch[1]), Number(body?.inventory_level));
        return jsonResponse({ id: Number(variantMatch[1]) });
      }
      if (url.endsWith("/products/100") && method === "PUT") {
        productWrites.push(body ?? {});
        return jsonResponse({ id: 100 });
      }
      throw new Error(`Unexpected BigCommerce request: ${method} ${url}`);
    },
  } as any);

  const started = await manager.start("details", 7, [1, 2], ["description", "inventory"]);
  const completed = await waitForJob(manager, started.id);
  assert.equal(completed?.status, "completed");
  assert.deepEqual(Array.from(variantWrites.entries()).sort(), [[1002, 6], [1003, 9]]);
  assert.equal(productWrites.length, 0);
  const items = await manager.getItems(started.id, { page: 1, limit: 10 });
  assert.equal(items?.rows.length, 2);
  assert.ok(items?.rows.every((item) => item.error?.includes("conflicting values")));
}

await runVariantDetailsSync();
await runSiblingConflictSync();
console.log("Kole variant SKU mapping and sync checks passed.");