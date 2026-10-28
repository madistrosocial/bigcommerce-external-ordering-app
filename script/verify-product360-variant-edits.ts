import assert from "node:assert/strict";
import {
  BigCommerceVariantEditError,
  updateBigCommerceVariantFields,
  updateBigCommerceVariantOptionLabel,
} from "../server/product360-variant-edit";

const options = { storeHash: "test-store", token: "test-token", productId: 101, variantId: 202 };
const variant = {
  id: 202,
  product_id: 101,
  sku: "NEW-SKU",
  price: 12.5,
  cost_price: 4,
  inventory_level: 18,
  option_values: [{ id: 303, option_id: 404, label: "Blue" }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function mockRequest(responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    assert.ok(response, "Unexpected BigCommerce request");
    return response;
  }) as typeof fetch;
  return { request, calls };
}

const fields = mockRequest([json({ data: variant }), json({ data: variant }), json({ data: variant })]);
const updated = await updateBigCommerceVariantFields(options, {
  sku: "NEW-SKU",
  price: 12.5,
  cost_price: 4,
  inventory_level: 18,
}, fields.request);
assert.equal(updated.id, options.variantId);
assert.equal(fields.calls.length, 3);
assert.equal(fields.calls[1].init?.method, "PUT");
assert.deepEqual(JSON.parse(String(fields.calls[1].init?.body)), {
  sku: "NEW-SKU",
  price: 12.5,
  cost_price: 4,
  inventory_level: 18,
});
assert.ok(fields.calls.every(call => call.url.endsWith("/products/101/variants/202")));

const wrongProduct = mockRequest([json({ data: { ...variant, product_id: 999 } })]);
await assert.rejects(updateBigCommerceVariantFields(options, { sku: "NEW-SKU" }, wrongProduct.request), /belongs to the selected product/);
assert.equal(wrongProduct.calls.length, 1);

const rejected = mockRequest([json({ data: variant }), json({ title: "Permission denied" }, 403)]);
await assert.rejects(updateBigCommerceVariantFields(options, { sku: "NEW-SKU" }, rejected.request), /Permission denied/);

const unconfirmed = mockRequest([
  json({ data: variant }),
  json({ data: variant }),
  json({ data: { ...variant, sku: "OLD-SKU" } }),
]);
await assert.rejects(updateBigCommerceVariantFields(options, { sku: "NEW-SKU" }, unconfirmed.request), BigCommerceVariantEditError);

const labelUrl = "/products/101/options/404/values/303";
const renamed = mockRequest([
  json({ data: variant }),
  json({ data: { id: 303, label: "Blue", sort_order: 2 } }),
  json({ data: { label: "Azure", sort_order: 2 } }),
  json({ data: { id: 303, label: "Azure", sort_order: 2 } }),
]);
const labelResult = await updateBigCommerceVariantOptionLabel(options, "Azure", renamed.request);
assert.deepEqual(labelResult, { optionId: 404, valueId: 303, label: "Azure" });
assert.equal(renamed.calls.length, 4);
assert.ok(renamed.calls[1].url.endsWith(labelUrl));
assert.equal(renamed.calls[2].init?.method, "PUT");
assert.deepEqual(JSON.parse(String(renamed.calls[2].init?.body)), { label: "Azure", sort_order: 2 });

const multiOption = mockRequest([json({ data: { ...variant, option_values: [variant.option_values[0], { id: 304, option_id: 404, label: "Large" }] } })]);
await assert.rejects(updateBigCommerceVariantOptionLabel(options, "Azure", multiOption.request), /one option value/);
assert.equal(multiOption.calls.length, 1);

const unconfirmedLabel = mockRequest([
  json({ data: variant }),
  json({ data: { id: 303, label: "Blue", sort_order: 2 } }),
  json({ data: { label: "Azure", sort_order: 2 } }),
  json({ data: { id: 303, label: "Blue", sort_order: 2 } }),
]);
await assert.rejects(updateBigCommerceVariantOptionLabel(options, "Azure", unconfirmedLabel.request), /did not confirm/);

console.log("Product 360 variant edit checks passed.");
