import assert from "node:assert/strict";
import { BigCommerceVariantImageError, clearBigCommerceVariantImage } from "../server/product360-variant-images";

const options = { storeHash: "test-store", token: "test-token", productId: 101, variantId: 202 };
const emptyVariant = { id: 202, product_id: 101, image_url: "" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function mockRequest(responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    assert.ok(response, "Unexpected remote request");
    return response;
  }) as typeof fetch;
  return { request, calls };
}

const success = mockRequest([json({ data: emptyVariant }), json({ data: emptyVariant })]);
await clearBigCommerceVariantImage(options, success.request);
assert.equal(success.calls.length, 2);
assert.equal(success.calls[0].init?.method, "PUT");
assert.deepEqual(JSON.parse(String(success.calls[0].init?.body)), { image_url: "" });
assert.equal(success.calls[1].init?.method ?? "GET", "GET");
assert.ok(success.calls.every(call => call.url.endsWith("/products/101/variants/202")));
assert.ok(success.calls.every(call => !call.url.includes("/images")));

for (const data of [
  { ...emptyVariant, image_url: "https://example.com/still-present.jpg" },
  { ...emptyVariant, id: 999 },
  { ...emptyVariant, product_id: 999 },
  { id: 202, product_id: 101 },
]) {
  const mock = mockRequest([json({ data: emptyVariant }), json({ data })]);
  await assert.rejects(clearBigCommerceVariantImage(options, mock.request), BigCommerceVariantImageError);
}

const rejected = mockRequest([json({ title: "Permission denied" }, 403)]);
await assert.rejects(clearBigCommerceVariantImage(options, rejected.request), /Permission denied/);
assert.equal(rejected.calls.length, 1);

const unavailable = mockRequest([json({ data: emptyVariant }), json({}, 503)]);
await assert.rejects(clearBigCommerceVariantImage(options, unavailable.request), /could not confirm/);

const html = mockRequest([
  new Response("<html>SPA fallback</html>", { status: 200 }),
  new Response("<html>SPA fallback</html>", { status: 200 }),
]);
await assert.rejects(clearBigCommerceVariantImage(options, html.request), BigCommerceVariantImageError);
console.log("Product 360 variant image checks passed.");
