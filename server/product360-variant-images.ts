export class BigCommerceVariantImageError extends Error {}

type ClearVariantImageOptions = {
  storeHash: string;
  token: string;
  productId: number;
  variantId: number;
};

/** Clear the variant association, not a potentially shared product-gallery image. */
export async function clearBigCommerceVariantImage(
  options: ClearVariantImageOptions,
  request: typeof fetch = fetch,
): Promise<void> {
  const { storeHash, token, productId, variantId } = options;
  const url = `https://api.bigcommerce.com/stores/${encodeURIComponent(storeHash)}/v3/catalog/products/${productId}/variants/${variantId}`;
  const headers = { "X-Auth-Token": token, Accept: "application/json", "Content-Type": "application/json" };
  const update = await request(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ image_url: "" }),
    signal: AbortSignal.timeout(30000),
  });
  const updateBody: any = await update.json().catch(() => ({}));
  if (!update.ok) {
    throw new BigCommerceVariantImageError(
      updateBody.title || updateBody.detail || `BigCommerce could not remove the variant photo (${update.status}).`,
    );
  }

  // A successful HTTP status alone is not proof that BigCommerce applied the change.
  const verification = await request(url, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const verificationBody: any = await verification.json().catch(() => ({}));
  if (!verification.ok) {
    throw new BigCommerceVariantImageError("The photo update was sent, but BigCommerce could not confirm its removal. Refresh and retry.");
  }
  const variant = verificationBody?.data;
  if (variant?.id !== variantId || variant?.product_id !== productId
      || typeof variant.image_url !== "string" || variant.image_url.trim() !== "") {
    throw new BigCommerceVariantImageError("BigCommerce has not confirmed that the variant photo was removed. The local image was not changed.");
  }
}
