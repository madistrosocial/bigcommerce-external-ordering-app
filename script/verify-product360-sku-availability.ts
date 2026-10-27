import assert from "node:assert/strict";
import { checkProduct360SkuAvailability } from "../server/product360-sku-availability";
import { checkProduct360Skus } from "../client/src/lib/api";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const requests: string[] = [];
const usedSkus = await checkProduct360SkuAvailability(
  ["BC-PRODUCT", "BC-VARIANT", "LOCAL-PRODUCT", "LOCAL-VARIANT", "AVAILABLE"],
  ["LOCAL-PRODUCT", "LOCAL-VARIANT"],
  {
    storeHash: "test-store",
    headers: { "X-Auth-Token": "test" },
    fetcher: async (input) => {
      const url = String(input);
      requests.push(url);
      const sku = new URL(url).searchParams.get("sku");
      if (sku === "BC-PRODUCT") {
        return jsonResponse({ data: [{ sku: "BC-PRODUCT" }] });
      }
      if (sku === "BC-VARIANT") {
        return jsonResponse({ data: [{ sku: "PARENT", variants: [{ sku: "BC-VARIANT" }] }] });
      }
      return jsonResponse({ data: [] });
    },
  },
);
assert.deepEqual(usedSkus, ["BC-PRODUCT", "BC-VARIANT", "LOCAL-PRODUCT", "LOCAL-VARIANT"]);
assert.equal(requests.length, 3);
assert.ok(requests.every((url) => new URL(url).searchParams.get("include") === "variants"));

await assert.rejects(
  checkProduct360SkuAvailability(["FAILED"], [], {
    storeHash: "test-store",
    headers: {},
    fetcher: async () => jsonResponse({ errors: ["temporarily unavailable"] }, 503),
  }),
  /BigCommerce SKU lookup failed \(503\)/,
);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => jsonResponse({ error: "Could not check SKU availability." }, 500);
  await assert.rejects(checkProduct360Skus(["FAILED"]), /Could not check SKU availability\./);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Product 360 SKU availability checks passed.");
