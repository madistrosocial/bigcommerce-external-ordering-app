export type BigCommerceVariantEdit = {
  sku?: string;
  price?: number;
  cost_price?: number | null;
  inventory_level?: number;
};

export class BigCommerceVariantEditError extends Error {}

type VariantEditOptions = {
  storeHash: string;
  token: string;
  productId: number;
  variantId: number;
};

const jsonBody = async (response: Response): Promise<any> => response.json().catch(() => ({}));

function assertVariant(data: any, productId: number, variantId: number): any {
  if (Number(data?.id) !== variantId || Number(data?.product_id) !== productId) {
    throw new BigCommerceVariantEditError("BigCommerce could not confirm this variant belongs to the selected product.");
  }
  return data;
}

function sameNumber(actual: unknown, expected: number | null): boolean {
  if (expected === null) return actual == null;
  const value = Number(actual);
  return Number.isFinite(value) && Math.abs(value - expected) < 0.000001;
}

export async function updateBigCommerceVariantFields(
  options: VariantEditOptions,
  changes: BigCommerceVariantEdit,
  request: typeof fetch = fetch,
): Promise<any> {
  const { storeHash, token, productId, variantId } = options;
  const url = `https://api.bigcommerce.com/stores/${encodeURIComponent(storeHash)}/v3/catalog/products/${productId}/variants/${variantId}`;
  const headers = { "X-Auth-Token": token, Accept: "application/json", "Content-Type": "application/json" };
  const currentResponse = await request(url, { headers, signal: AbortSignal.timeout(30000) });
  const currentBody = await jsonBody(currentResponse);
  if (!currentResponse.ok) {
    throw new BigCommerceVariantEditError(currentBody.title || currentBody.detail || `Could not load variant (${currentResponse.status}).`);
  }
  assertVariant(currentBody.data, productId, variantId);

  const response = await request(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(changes),
    signal: AbortSignal.timeout(30000),
  });
  const body = await jsonBody(response);
  if (!response.ok) {
    throw new BigCommerceVariantEditError(body.title || body.detail || `BigCommerce rejected the variant update (${response.status}).`);
  }

  const verifyResponse = await request(url, { headers, signal: AbortSignal.timeout(30000) });
  const verifyBody = await jsonBody(verifyResponse);
  if (!verifyResponse.ok) {
    throw new BigCommerceVariantEditError("BigCommerce accepted the update but could not confirm the saved values. Refresh before retrying.");
  }
  const variant = assertVariant(verifyBody.data, productId, variantId);
  const confirmed =
    (changes.sku === undefined || variant.sku === changes.sku)
    && (changes.price === undefined || sameNumber(variant.price, changes.price))
    && (changes.cost_price === undefined || sameNumber(variant.cost_price, changes.cost_price))
    && (changes.inventory_level === undefined || sameNumber(variant.inventory_level, changes.inventory_level));
  if (!confirmed) {
    throw new BigCommerceVariantEditError("BigCommerce did not confirm every changed field. Refresh the product and check the variant before retrying.");
  }
  return variant;
}

export async function updateBigCommerceVariantOptionLabel(
  options: VariantEditOptions,
  label: string,
  request: typeof fetch = fetch,
): Promise<{ optionId: number; valueId: number; label: string }> {
  const { storeHash, token, productId, variantId } = options;
  const headers = { "X-Auth-Token": token, Accept: "application/json", "Content-Type": "application/json" };
  const variantUrl = `https://api.bigcommerce.com/stores/${encodeURIComponent(storeHash)}/v3/catalog/products/${productId}/variants/${variantId}`;
  const variantResponse = await request(variantUrl, { headers, signal: AbortSignal.timeout(30000) });
  const variantBody = await jsonBody(variantResponse);
  if (!variantResponse.ok) {
    throw new BigCommerceVariantEditError(variantBody.title || variantBody.detail || `Could not load variant (${variantResponse.status}).`);
  }
  const variant = assertVariant(variantBody.data, productId, variantId);
  const values = Array.isArray(variant.option_values) ? variant.option_values : [];
  if (values.length !== 1) {
    throw new BigCommerceVariantEditError("The name can only be changed for a variant with one option value.");
  }
  const optionId = Number(values[0].option_id);
  const valueId = Number(values[0].id);
  if (!Number.isSafeInteger(optionId) || optionId <= 0 || !Number.isSafeInteger(valueId) || valueId <= 0) {
    throw new BigCommerceVariantEditError("BigCommerce did not return the option IDs needed to rename this variant.");
  }

  const valueUrl = `https://api.bigcommerce.com/stores/${encodeURIComponent(storeHash)}/v3/catalog/products/${productId}/options/${optionId}/values/${valueId}`;
  const valueResponse = await request(valueUrl, { headers, signal: AbortSignal.timeout(30000) });
  const valueBody = await jsonBody(valueResponse);
  if (!valueResponse.ok || !Number.isFinite(Number(valueBody?.data?.sort_order))) {
    throw new BigCommerceVariantEditError(valueBody.title || valueBody.detail || "Could not read the option value order needed to rename this variant.");
  }

  const updateResponse = await request(valueUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ label, sort_order: Number(valueBody.data.sort_order) }),
    signal: AbortSignal.timeout(30000),
  });
  const updateBody = await jsonBody(updateResponse);
  if (!updateResponse.ok) {
    throw new BigCommerceVariantEditError(updateBody.title || updateBody.detail || `BigCommerce rejected the variant name (${updateResponse.status}).`);
  }

  const verifyResponse = await request(valueUrl, { headers, signal: AbortSignal.timeout(30000) });
  const verifyBody = await jsonBody(verifyResponse);
  if (!verifyResponse.ok || verifyBody?.data?.label !== label) {
    throw new BigCommerceVariantEditError("BigCommerce did not confirm the saved variant name. Refresh the product before retrying.");
  }
  return { optionId, valueId, label };
}
