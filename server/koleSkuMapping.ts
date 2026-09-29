export interface BigCommerceSkuTarget {
  productId: number;
  variantId: number | null;
  sku: string;
}

export function normalizeKoleSku(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function buildBigCommerceSkuIndex(products: unknown[]): {
  productsBySku: Map<string, BigCommerceSkuTarget[]>;
  productsWithoutSku: number;
} {
  const productsBySku = new Map<string, BigCommerceSkuTarget[]>();
  let productsWithoutSku = 0;

  const add = (target: BigCommerceSkuTarget) => {
    const key = normalizeKoleSku(target.sku);
    if (!key) return;
    const matches = productsBySku.get(key) ?? [];
    matches.push(target);
    productsBySku.set(key, matches);
  };

  for (const value of products) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const product = value as Record<string, unknown>;
    const productId = Number(product.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) continue;

    const productSku = String(product.sku ?? "").trim();
    let hasProductSku = !!normalizeKoleSku(productSku);
    let hasAnySkuTarget = hasProductSku;
    if (hasProductSku) add({ productId, variantId: null, sku: productSku });

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantCount = Number(product.variant_count);
    if (
      Number.isInteger(variantCount)
      && variantCount > 0
      && (!Array.isArray(product.variants) || variants.length === 0)
    ) {
      throw new Error(`BigCommerce did not include variants for product ${productId}; no SKU mappings were changed.`);
    }

    for (const variantValue of variants) {
      if (!variantValue || typeof variantValue !== "object" || Array.isArray(variantValue)) continue;
      const variant = variantValue as Record<string, unknown>;
      const sku = String(variant.sku ?? "").trim();
      const normalizedSku = normalizeKoleSku(sku);
      if (!normalizedSku) continue;

      const optionValues = Array.isArray(variant.option_values) ? variant.option_values : null;
      const isBaseVariant = optionValues !== null && optionValues.length === 0;
      if (isBaseVariant) {
        // BigCommerce exposes a base variant for simple products. It is the
        // product itself, not a separately stocked variant.
        if (!hasProductSku) {
          add({ productId, variantId: null, sku });
          hasProductSku = true;
          hasAnySkuTarget = true;
        }
        continue;
      }

      const variantId = Number(variant.id);
      if (!Number.isSafeInteger(variantId) || variantId <= 0) continue;
      add({ productId, variantId, sku });
      hasAnySkuTarget = true;
    }

    if (!hasAnySkuTarget) productsWithoutSku++;
  }

  return { productsBySku, productsWithoutSku };
}