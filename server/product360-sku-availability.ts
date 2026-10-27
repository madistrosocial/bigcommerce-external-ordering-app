type BigCommerceSkuLookupOptions = {
  storeHash: string;
  headers: HeadersInit;
  fetcher?: typeof fetch;
};

function normalizeSku(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export async function checkProduct360SkuAvailability(
  skus: string[],
  locallyUsedSkus: Iterable<string>,
  { storeHash, headers, fetcher = fetch }: BigCommerceSkuLookupOptions,
): Promise<string[]> {
  const usedSkus = new Set(Array.from(locallyUsedSkus, normalizeSku));
  const bigCommerceSkusToCheck = skus
    .map(normalizeSku)
    .filter((sku) => sku && !usedSkus.has(sku));

  if (bigCommerceSkusToCheck.length) {
    const root = `https://api.bigcommerce.com/stores/${encodeURIComponent(storeHash)}/v3/catalog/products`;
    for (const sku of bigCommerceSkusToCheck) {
      const response = await fetcher(
        `${root}?sku=${encodeURIComponent(sku)}&include=variants&limit=250`,
        { headers, signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw new Error(`BigCommerce SKU lookup failed (${response.status}).`);

      const payload: any = await response.json();
      if (!Array.isArray(payload?.data)) {
        throw new Error("BigCommerce SKU lookup returned an invalid response.");
      }

      const isUsedInBigCommerce = payload.data.some((product: any) =>
        normalizeSku(product?.sku) === sku
        || (Array.isArray(product?.variants) && product.variants.some(
          (variant: any) => normalizeSku(variant?.sku) === sku,
        )),
      );
      if (isUsedInBigCommerce) usedSkus.add(sku);
    }
  }

  return skus.map(normalizeSku).filter((sku) => usedSkus.has(sku));
}
